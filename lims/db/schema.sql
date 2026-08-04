-- ============================================================================
--  LabCore LIMS — ma'lumotlar bazasi sxemasi (PostgreSQL 14+)
--  Loyihalash tamoyillari:
--    * Hech qanday tibbiy yozuv jismonan o'chirilmaydi (soft delete + audit).
--    * audit_log append-only: UPDATE/DELETE trigger orqali taqiqlangan.
--    * Barcha vaqtlar timestamptz — 100 yillik arxivda vaqt mintaqasi muhim.
--  Ishga tushirish:  psql -d labcore -f db/schema.sql
-- ============================================================================

SET client_min_messages TO WARNING;

-- Ixtiyoriy kengaytmalar. Mavjud bo'lmasa tizim ILIKE qidiruviga tushadi.
DO $$
BEGIN
  BEGIN CREATE EXTENSION IF NOT EXISTS pg_trgm; EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pg_trgm topilmadi — qidiruv ILIKE rejimida ishlaydi';
  END;
  BEGIN CREATE EXTENSION IF NOT EXISTS pgcrypto; EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'pgcrypto topilmadi';
  END;
END $$;

-- ---------------------------------------------------------------------------
-- Ma'lumotnomalar
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS branches (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  address       text,
  phone         text,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Xodimlar. role: admin | laborant | doctor | cashier
CREATE TABLE IF NOT EXISTS users (
  id                serial PRIMARY KEY,
  username          text NOT NULL UNIQUE,
  password_hash     text NOT NULL,
  full_name         text NOT NULL,
  role              text NOT NULL CHECK (role IN ('admin','laborant','doctor','cashier')),
  phone             text,
  branch_id         integer REFERENCES branches(id),
  is_active         boolean NOT NULL DEFAULT true,
  -- ikki bosqichli login (TOTP)
  totp_secret       text,
  totp_enabled      boolean NOT NULL DEFAULT false,
  -- login himoyasi
  failed_attempts   integer NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  must_change_pw    boolean NOT NULL DEFAULT false,
  last_login_at     timestamptz,
  created_by        integer REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Ish smenalari / ish vaqti nazorati uchun sessiyalar
CREATE TABLE IF NOT EXISTS sessions (
  id             uuid PRIMARY KEY,
  user_id        integer NOT NULL REFERENCES users(id),
  computer_name  text,              -- ish stansiyasi nomi (klient yuboradi)
  ip_address     inet,
  user_agent     text,
  login_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  logout_at      timestamptz,
  revoked_by     integer REFERENCES users(id),
  revoke_reason  text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions(user_id, login_at DESC);
CREATE INDEX IF NOT EXISTS sessions_active_idx  ON sessions(last_seen_at DESC) WHERE logout_at IS NULL;

-- ---------------------------------------------------------------------------
-- Bemorlar (100 yillik arxiv)
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS patient_card_seq START WITH 100001;

CREATE TABLE IF NOT EXISTS patients (
  id             bigserial PRIMARY KEY,
  card_number    text NOT NULL UNIQUE,          -- masalan "100025"
  last_name      text NOT NULL,
  first_name     text NOT NULL,
  middle_name    text,
  birth_date     date,
  gender         text CHECK (gender IN ('m','f','u')) DEFAULT 'u',
  phone          text,
  address        text,
  passport       text,                          -- ixtiyoriy, maxfiy maydon
  notes          text,
  branch_id      integer REFERENCES branches(id),
  is_archived    boolean NOT NULL DEFAULT false,
  created_by     integer REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- qidiruv uchun oldindan tayyorlangan matn
  search_text    text GENERATED ALWAYS AS (
                   lower(coalesce(last_name,'')||' '||coalesce(first_name,'')||' '||
                         coalesce(middle_name,'')||' '||coalesce(phone,'')||' '||
                         coalesce(card_number,'')||' '||coalesce(passport,''))
                 ) STORED
);
CREATE INDEX IF NOT EXISTS patients_name_idx   ON patients(lower(last_name), lower(first_name));
CREATE INDEX IF NOT EXISTS patients_phone_idx  ON patients(phone);
CREATE INDEX IF NOT EXISTS patients_birth_idx  ON patients(birth_date);
CREATE INDEX IF NOT EXISTS patients_created_idx ON patients USING brin(created_at);

DO $$
BEGIN
  EXECUTE 'CREATE INDEX IF NOT EXISTS patients_trgm_idx ON patients USING gin (search_text gin_trgm_ops)';
EXCEPTION WHEN OTHERS THEN
  EXECUTE 'CREATE INDEX IF NOT EXISTS patients_search_idx ON patients(search_text text_pattern_ops)';
END $$;

-- Bemorning aloqa kanallari (Telegram bot orqali natija yuborish uchun)
CREATE TABLE IF NOT EXISTS patient_contacts (
  patient_id       bigint PRIMARY KEY REFERENCES patients(id) ON DELETE CASCADE,
  telegram_chat_id text,
  email            text,
  allow_sms        boolean NOT NULL DEFAULT true,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Murojaat (tashrif): bemorning ma'lum sanadagi kelishi
CREATE TABLE IF NOT EXISTS visits (
  id           bigserial PRIMARY KEY,
  patient_id   bigint NOT NULL REFERENCES patients(id),
  visit_date   timestamptz NOT NULL DEFAULT now(),
  complaint    text,                       -- shikoyat
  doctor_id    integer REFERENCES users(id),
  branch_id    integer REFERENCES branches(id),
  status       text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  created_by   integer REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visits_patient_idx ON visits(patient_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS visits_date_idx    ON visits USING brin(visit_date);

-- ---------------------------------------------------------------------------
-- Analiz katalogi va referens qiymatlar
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS test_catalog (
  id           serial PRIMARY KEY,
  code         text NOT NULL UNIQUE,       -- HGB, GLU, ...
  name         text NOT NULL,              -- Gemoglobin
  category     text NOT NULL DEFAULT 'Umumiy',  -- Qon tahlili / Biokimyo / Siydik
  unit         text,                       -- g/L, mmol/L
  value_type   text NOT NULL DEFAULT 'number' CHECK (value_type IN ('number','text','enum')),
  enum_options text[],
  price        numeric(12,2) NOT NULL DEFAULT 0,
  turnaround_h integer NOT NULL DEFAULT 24,   -- tayyor bo'lish muddati (soat)
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 100
);

-- Jins/yosh bo'yicha norma oraliqlari
CREATE TABLE IF NOT EXISTS test_reference_ranges (
  id           serial PRIMARY KEY,
  test_id      integer NOT NULL REFERENCES test_catalog(id) ON DELETE CASCADE,
  gender       text CHECK (gender IN ('m','f','u')) DEFAULT 'u',  -- u = barchasi
  age_min      integer NOT NULL DEFAULT 0,
  age_max      integer NOT NULL DEFAULT 200,
  low          numeric(14,4),
  high         numeric(14,4),
  critical_low  numeric(14,4),
  critical_high numeric(14,4),
  text_note    text
);
CREATE INDEX IF NOT EXISTS refrange_test_idx ON test_reference_ranges(test_id);

-- ---------------------------------------------------------------------------
-- Buyurtmalar va natijalar
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS orders (
  id            bigserial PRIMARY KEY,
  order_number  text NOT NULL UNIQUE,      -- 2026-000123
  patient_id    bigint NOT NULL REFERENCES patients(id),
  visit_id      bigint REFERENCES visits(id),
  branch_id     integer REFERENCES branches(id),
  status        text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','in_progress','ready','confirmed','cancelled')),
  priority      text NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal','urgent')),
  total_amount  numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount   numeric(12,2) NOT NULL DEFAULT 0,
  due_at        timestamptz,
  created_by    integer REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  cancelled_by  integer REFERENCES users(id),
  cancel_reason text
);
CREATE INDEX IF NOT EXISTS orders_patient_idx ON orders(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx  ON orders(status) WHERE status <> 'confirmed';
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders USING brin(created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id             bigserial PRIMARY KEY,
  order_id       bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  test_id        integer NOT NULL REFERENCES test_catalog(id),
  sample_barcode text UNIQUE,              -- probirka shtrix-kodi
  price          numeric(12,2) NOT NULL DEFAULT 0,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','entered','confirmed','rejected')),
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

-- Natija: bitta order_item uchun bitta joriy natija (tarix audit_log da)
CREATE TABLE IF NOT EXISTS results (
  id            bigserial PRIMARY KEY,
  order_item_id bigint NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
  value_num     numeric(14,4),
  value_text    text,
  unit          text,
  flag          text CHECK (flag IN ('normal','low','high','critical_low','critical_high','abnormal')),
  comment       text,
  device        text,                      -- uskuna nomi (avtomatik natija uchun)
  entered_by    integer REFERENCES users(id),
  entered_at    timestamptz,
  confirmed_by  integer REFERENCES users(id),
  confirmed_at  timestamptz,
  revision      integer NOT NULL DEFAULT 1
);

-- ---------------------------------------------------------------------------
-- Shifokor xulosasi / davolash tarixi
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS diagnoses (
  id             bigserial PRIMARY KEY,
  patient_id     bigint NOT NULL REFERENCES patients(id),
  visit_id       bigint REFERENCES visits(id),
  doctor_id      integer NOT NULL REFERENCES users(id),
  diagnosis      text NOT NULL,
  recommendation text,
  medication     text,
  procedure      text,
  follow_up_date date,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS diagnoses_patient_idx ON diagnoses(patient_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- Kassa
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS receipt_number_seq START WITH 1;

CREATE TABLE IF NOT EXISTS payments (
  id            bigserial PRIMARY KEY,
  receipt_no    text NOT NULL UNIQUE,
  patient_id    bigint NOT NULL REFERENCES patients(id),
  order_id      bigint REFERENCES orders(id),
  amount        numeric(12,2) NOT NULL,
  method        text NOT NULL CHECK (method IN ('cash','card','transfer')),
  cashier_id    integer NOT NULL REFERENCES users(id),
  branch_id     integer REFERENCES branches(id),
  note          text,
  is_refund     boolean NOT NULL DEFAULT false,
  refund_of     bigint REFERENCES payments(id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payments_created_idx ON payments(created_at DESC);
CREATE INDEX IF NOT EXISTS payments_patient_idx ON payments(patient_id);

-- ---------------------------------------------------------------------------
-- Fayl arxivi:  /Patients/<card>_<Ism_Familiya>/<yil>/<fayl>
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS patient_files (
  id            bigserial PRIMARY KEY,
  patient_id    bigint NOT NULL REFERENCES patients(id),
  order_id      bigint REFERENCES orders(id),
  year          integer NOT NULL,
  category      text NOT NULL DEFAULT 'other'
                CHECK (category IN ('analysis','xray','ultrasound','photo','conclusion','other')),
  original_name text NOT NULL,
  stored_path   text NOT NULL,            -- DATA_DIR ga nisbatan
  mime_type     text,
  size_bytes    bigint NOT NULL,
  sha256        text NOT NULL,            -- yaxlitlikni tekshirish uchun
  uploaded_by   integer REFERENCES users(id),
  uploaded_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz,              -- soft delete: fayl diskda qoladi
  deleted_by    integer REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS files_patient_idx ON patient_files(patient_id, year DESC);

-- ---------------------------------------------------------------------------
-- Bildirishnomalar navbati (SMS / Telegram / Email)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS notifications (
  id           bigserial PRIMARY KEY,
  patient_id   bigint REFERENCES patients(id),
  order_id     bigint REFERENCES orders(id),
  channel      text NOT NULL CHECK (channel IN ('sms','telegram','email')),
  recipient    text NOT NULL,
  subject      text,
  body         text NOT NULL,
  status       text NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','sent','failed','cancelled')),
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  created_by   integer REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_status_idx ON notifications(status, created_at);

-- ---------------------------------------------------------------------------
-- Ombor (reaktivlar, sarf materiallari)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS inventory_items (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  unit         text NOT NULL DEFAULT 'dona',
  quantity     numeric(14,3) NOT NULL DEFAULT 0,
  min_quantity numeric(14,3) NOT NULL DEFAULT 0,
  expiry_date  date,
  supplier     text,
  branch_id    integer REFERENCES branches(id),
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_moves (
  id         bigserial PRIMARY KEY,
  item_id    integer NOT NULL REFERENCES inventory_items(id),
  delta      numeric(14,3) NOT NULL,       -- + kirim, - chiqim
  reason     text,
  user_id    integer REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Kameralar (ish joyi nazorati uchun havolalar ro'yxati)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cameras (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  location    text,
  stream_url  text NOT NULL,               -- RTSP/HTTP havola (faqat admin ko'radi)
  branch_id   integer REFERENCES branches(id),
  is_active   boolean NOT NULL DEFAULT true
);

-- ---------------------------------------------------------------------------
-- AUDIT — tizimning yuragi. Append-only.
--   action: LOGIN, LOGIN_FAILED, LOGOUT, VIEW, CREATE, UPDATE, DELETE,
--           CONFIRM, PRINT, EXPORT, PAYMENT, UPLOAD, DOWNLOAD
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  user_id       integer REFERENCES users(id),
  user_name     text,                      -- xodim o'chirilsa ham nom qoladi
  session_id    uuid,
  computer_name text,
  ip_address    inet,
  action        text NOT NULL,
  entity        text,                      -- patient, result, order, user ...
  entity_id     text,
  patient_id    bigint,                    -- bemor bo'yicha tez filtrlash uchun
  description   text,                      -- odam o'qiy oladigan izoh
  old_data      jsonb,
  new_data      jsonb
);
CREATE INDEX IF NOT EXISTS audit_at_idx      ON audit_log(at DESC);
CREATE INDEX IF NOT EXISTS audit_user_idx    ON audit_log(user_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_patient_idx ON audit_log(patient_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_entity_idx  ON audit_log(entity, entity_id);
CREATE INDEX IF NOT EXISTS audit_action_idx  ON audit_log(action, at DESC);

-- Audit yozuvini o'zgartirish yoki o'chirishning oldini olamiz.
CREATE OR REPLACE FUNCTION audit_log_is_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log faqat qo''shish uchun: % amali taqiqlangan', TG_OP;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_update ON audit_log;
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_immutable();

-- updated_at ni avtomatik yangilash
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users','patients','orders','diagnoses'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_touch ON %I', t, t);
    EXECUTE format('CREATE TRIGGER %I_touch BEFORE UPDATE ON %I
                    FOR EACH ROW EXECUTE FUNCTION touch_updated_at()', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Ko'rinishlar
-- ---------------------------------------------------------------------------

-- Bemor bo'yicha to'liq xronologiya (100 yil keyin ham bitta so'rov bilan)
CREATE OR REPLACE VIEW patient_timeline AS
  SELECT v.patient_id, v.visit_date AS at, 'visit'::text AS kind,
         coalesce(v.complaint,'Murojaat') AS title, v.id AS ref_id
    FROM visits v
  UNION ALL
  SELECT o.patient_id, o.created_at, 'order',
         'Buyurtma '||o.order_number||' ('||o.status||')', o.id
    FROM orders o
  UNION ALL
  SELECT d.patient_id, d.created_at, 'diagnosis', d.diagnosis, d.id
    FROM diagnoses d
  UNION ALL
  SELECT f.patient_id, f.uploaded_at, 'file', f.original_name, f.id
    FROM patient_files f WHERE f.deleted_at IS NULL
  UNION ALL
  SELECT p.patient_id, p.created_at, 'payment',
         'To''lov '||p.amount::text||' ('||p.method||')', p.id
    FROM payments p;

-- Xodim KPI: bajarilgan analizlar, tasdiqlangan natijalar, ish soatlari
CREATE OR REPLACE VIEW staff_kpi AS
  SELECT u.id AS user_id, u.full_name, u.role,
         (SELECT count(*) FROM results r WHERE r.entered_by = u.id)   AS results_entered,
         (SELECT count(*) FROM results r WHERE r.confirmed_by = u.id) AS results_confirmed,
         (SELECT count(*) FROM patients p WHERE p.created_by = u.id)  AS patients_created,
         (SELECT coalesce(sum(pm.amount),0) FROM payments pm WHERE pm.cashier_id = u.id AND NOT pm.is_refund) AS cash_collected
    FROM users u;

-- ---------------------------------------------------------------------------
-- Laboratoriya uskunalari (analizatorlar) bilan bog'lanish
--
--   hl7    — HL7 v2 (MLLP) TCP orqali: ko'pchilik zamonaviy analizatorlar
--   astm   — ASTM E1381/E1394 TCP orqali: gematologiya/biokimyo uskunalari
--   folder — uskuna natijani papkaga CSV/TXT qilib yozadi
--   http   — vositachi dastur natijani API'ga POST qiladi
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS devices (
  id           serial PRIMARY KEY,
  name         text NOT NULL UNIQUE,          -- "Mindray BC-20"
  protocol     text NOT NULL CHECK (protocol IN ('hl7','astm','folder','http')),
  host         text,                          -- tinglash manzili (hl7/astm)
  port         integer,
  folder       text,                          -- kuzatiladigan papka (folder)
  api_token    text,                          -- http protokoli uchun kalit
  branch_id    integer REFERENCES branches(id),
  is_active    boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Uskunadagi kod ↔ katalogdagi analiz. Uskuna "HGB" desa, biz uni
-- katalogdagi Gemoglobin bilan bog'laymiz; kerak bo'lsa birlik ko'paytiriladi.
CREATE TABLE IF NOT EXISTS device_mappings (
  id          serial PRIMARY KEY,
  device_id   integer NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  device_code text NOT NULL,
  test_id     integer NOT NULL REFERENCES test_catalog(id),
  factor      numeric(14,6) NOT NULL DEFAULT 1,
  UNIQUE (device_id, device_code)
);

-- Uskunadan kelgan har bir xabar xom holida saqlanadi — nizo chiqsa
-- "uskuna nima yuborgan" savoliga aniq javob bo'ladi.
CREATE TABLE IF NOT EXISTS device_messages (
  id            bigserial PRIMARY KEY,
  device_id     integer REFERENCES devices(id),
  received_at   timestamptz NOT NULL DEFAULT now(),
  raw           text NOT NULL,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','applied','partial','failed','ignored')),
  applied_count integer NOT NULL DEFAULT 0,
  error         text
);
CREATE INDEX IF NOT EXISTS device_messages_idx ON device_messages(device_id, received_at DESC);
