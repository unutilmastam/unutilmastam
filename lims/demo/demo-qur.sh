#!/bin/bash
# Demo bazani boshidan yig'adi. Har bir qadam haqiqiy API orqali —
# audit jurnali ham shu bilan to'ladi.
set -e
cd /home/user/unutilmastam/lims
export PGPASSWORD=labcore
S=/tmp/claude-0/-home-user-unutilmastam/58e97d7e-af22-5b0e-b4ba-f0cb47c9d523/scratchpad

echo "=== 1. Bazani yangidan yaratamiz ==="
[ -f /tmp/demo.pid ] && kill $(cat /tmp/demo.pid) 2>/dev/null || true
sleep 2
psql -h 127.0.0.1 -U labcore -d postgres -q \
  -c "DROP DATABASE IF EXISTS labcore_demo;" -c "CREATE DATABASE labcore_demo;" 2>&1 | grep -v NOTICE || true

export DATABASE_URL="postgres://labcore:labcore@127.0.0.1:5432/labcore_demo"
node scripts/migrate.js >/dev/null 2>&1
node scripts/seed.js >/dev/null 2>&1
echo "  sxema va katalog o'rnatildi"

echo "=== 2. Serverni ishga tushiramiz ==="
rm -rf /tmp/demo-data && mkdir -p /tmp/demo-data
PORT=4950 JWT_SECRET="demo-secret-key-labcore" DATA_DIR=/tmp/demo-data \
  LAB_NAME="Shifo Lab diagnostika markazi" WORK_START=08:00 WORK_END=18:00 LOGIN_RATE_MAX=500 \
  node src/index.js > /tmp/demo-server.log 2>&1 &
echo $! > /tmp/demo.pid
sleep 6
curl -s http://127.0.0.1:4950/api/health | head -c 120; echo

echo "=== 3. Bemorlar, buyurtmalar, natijalar ==="
node "$S/demo-seed.mjs" 2>&1 | tail -8

echo "=== 4. Xodim rasmlari va PIN kodlar ==="
node /tmp/rasm-pin.mjs 2>&1 | tail -5

echo "=== 5. Parollarni almashtiramiz (birinchi kirish talabi) ==="
node /tmp/parol.mjs 2>&1 | tail -5

echo "=== 6. Analizatorlar va kameralar ==="
node /tmp/uskuna-kamera.mjs 2>&1 | tail -6
node /tmp/kamera-hodisa.mjs 2>&1 | tail -5

echo "=== 7. Tarixni ikki haftaga tarqatamiz (grafik jonli bo'lsin) ==="
psql -h 127.0.0.1 -U labcore -d labcore_demo -q <<'SQL'
WITH t AS (SELECT id, row_number() OVER (ORDER BY id) rn FROM orders)
UPDATE orders o SET created_at = now() - ((t.rn % 12) || ' days')::interval - (t.rn || ' hours')::interval
FROM t WHERE t.id = o.id AND t.rn > 4;

UPDATE visits v SET visit_date = (o.created_at)::date FROM orders o WHERE o.visit_id = v.id;
UPDATE payments p SET created_at = o.created_at + interval '30 min' FROM orders o WHERE p.order_id = o.id;
UPDATE results r SET entered_at = o.created_at + interval '2 hours',
       confirmed_at = CASE WHEN r.confirmed_at IS NOT NULL THEN o.created_at + interval '3 hours' END
FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE r.order_item_id = oi.id;

-- Kritik natijalar: shifokorni darrov ogohlantiradigan holat
UPDATE results SET flag='critical_high', value_num=27.4
 WHERE id = (SELECT r.id FROM results r JOIN order_items oi ON oi.id=r.order_item_id
             JOIN test_catalog t ON t.id=oi.test_id WHERE t.code='GLU' ORDER BY r.id DESC LIMIT 1);
UPDATE results SET flag='critical_low', value_num=54
 WHERE id = (SELECT r.id FROM results r JOIN order_items oi ON oi.id=r.order_item_id
             JOIN test_catalog t ON t.id=oi.test_id WHERE t.code='HGB' ORDER BY r.id DESC LIMIT 1);
UPDATE results SET entered_at = now() - interval '2 hours', confirmed_at = now() - interval '1 hour'
 WHERE flag IN ('critical_high','critical_low');

-- Navbatning bir qismi allaqachon kelgan bo'lsin
UPDATE appointments SET status='arrived', arrived_at = scheduled_at + interval '4 min'
 WHERE id IN (SELECT id FROM appointments ORDER BY scheduled_at LIMIT 2);
SQL
echo "  tarix tarqatildi"

echo ""
echo "DEMO BAZA TAYYOR"
psql -h 127.0.0.1 -U labcore -d labcore_demo -tAq -c "
SELECT 'bemorlar: '||(SELECT count(*) FROM patients)
   ||' | buyurtmalar: '||(SELECT count(*) FROM orders)
   ||' | natijalar: '||(SELECT count(*) FROM results)
   ||' | audit: '||(SELECT count(*) FROM audit_log)
   ||' | uskunalar: '||(SELECT count(*) FROM devices)
   ||' | kameralar: '||(SELECT count(*) FROM cameras)"
