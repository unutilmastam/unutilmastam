/* Unutilmas Ta'm — 20-i18n-ru.js
   ═══════════════════════════════════════════════════════════════
   RUS TILI — to'liq lug'at va til almashtirgich

   • TR_RU ga ~440 ta yangi tarjima qo'shiladi
   • raqamli yozuvlar (5 dona, 12 000 so'm) qoida bilan o'giriladi
   • alert/confirm xabarlari ham tarjima qilinadi
   • yon menyuda "Menyu" yonida UZ | РУ tugmasi

   Tartib MUHIM: 14-boot.js dan OLDIN yuklanishi shart — o'sha yerda
   teskari lug'at (TR_UZ) quriladi.
   ═══════════════════════════════════════════════════════════════ */

Object.assign(TR_RU, {
  /* ── Umumiy ── */
  "Menyu": "Меню", "Profil": "Профиль", "Kirish": "Вход", "Chiqish": "Выход",
  "Saqlash": "Сохранить", "Bekor qilish": "Отмена", "Tasdiqlash": "Подтвердить",
  "Tahrirlash": "Изменить", "Orqaga": "Назад", "Ortga": "Назад", "← Orqaga": "← Назад",
  "Keyingisi": "Далее", "O'tkazib yuborish": "Пропустить", "Boshlash": "Начать",
  "Yaratish": "Создать", "Qo'llash": "Применить", "Nusxalash": "Копировать",
  "Qidirish": "Поиск", "Barchasi": "Все", "barcha": "все", "Yangi": "Новый",
  "Faol": "Активен", "O'chirilgan": "Удалён", "Yakunlangan": "Завершён",
  "Tozalash": "Очистить", "Toza": "Чисто", "Yuklanmoqda...": "Загрузка...",
  "Jami": "Итого", "Jami summa": "Общая сумма", "Nomi": "Название", "Ism": "Имя",
  "Ism va familya": "Имя и фамилия", "Parol": "Пароль", "Telefon": "Телефон",
  "Telefon raqam": "Номер телефона", "Telefon raqami": "Номер телефона",
  "Telefon (ixtiyoriy)": "Телефон (необязательно)", "Raqam": "Номер",
  "Elektron pochta": "Эл. почта", "Kod": "Код", "Imzo": "Подпись",
  "Tarix": "История", "Muddat": "Срок", "Sarlavha": "Заголовок",
  "Ko'rinish": "Вид", "Ko'rsatilsin": "Показывать", "Yashirilsin": "Скрывать",
  "Siz": "Вы", "Siz · Admin": "Вы · Админ", "Administrator": "Администратор",
  "Foydalanuvchi": "Пользователь", "Magazin egasi": "Владелец магазина",
  "magazin egasi": "владелец магазина", "to'g'ri": "верно",
  "— ixtiyoriy": "— необязательно", "Tanlang yoki yozing": "Выберите или введите",

  /* ── Hafta kunlari (grafik) ── */
  "Du": "Пн", "Se": "Вт", "Ch": "Ср", "Pa": "Чт", "Ju": "Пт", "Sh": "Сб", "Ya": "Вс",
  "Bugun": "Сегодня", "Kunlik": "Ежедневно", "Haftalik": "Еженедельно", "Oylik": "Ежемесячно",

  /* ── Navigatsiya va bo'limlar ── */
  "Bosh sahifa": "Главная", "Savat": "Корзина", "Savatcha": "Корзина",
  "Kabinet": "Кабинет", "Shaxsiy kabinet": "Личный кабинет", "Mening hisobim": "Мой аккаунт",
  "Mening ma'lumotlarim": "Мои данные", "Analitika": "Аналитика", "Sozlamalar": "Настройки",
  "Buyurtmalar": "Заказы", "Buyurtma": "Заказ", "Sotuvlar": "Продажи", "Qarzlar": "Долги",
  "Qarz daftari": "Долговая книга", "Kategoriyalar": "Категории", "Kuryerlar": "Курьеры",
  "Sevimlilar": "Избранное", "Bildirishnomalar": "Уведомления", "Chat": "Чат",
  "Fayllar": "Файлы", "Promo-kodlar": "Промокоды", "Kalkulyator": "Калькулятор",
  "Tez hisob": "Быстрый расчёт", "Navigatsiya": "Навигация", "QR skan": "QR-скан",
  "QR skaner": "QR-сканер", "QR kod": "QR-код", "Tizim holati": "Состояние системы",
  "Printerni sinash": "Проверить принтер", "Bluetooth chek printeri": "Bluetooth-принтер чеков",
  "Zaxira · Excel · xotira": "Резерв · Excel · память", "Kuryer rejimi": "Режим курьера",
  "Qorong'i rejim": "Тёмная тема",

  /* ── Kirish / ro'yxatdan o'tish ── */
  "Ro'yxatdan o'tish": "Регистрация", "Ro'yxatdan o'tish / Kirish": "Регистрация / Вход",
  "Parolni unutdingizmi?": "Забыли пароль?", "← Kirishga qaytish": "← Вернуться ко входу",
  "Telefon raqam yoki email": "Телефон или email",
  "Qaysi turdagi hisob ochmoqchisiz?": "Какой аккаунт хотите открыть?",
  "Mahsulot tanlab, buyurtma berish uchun": "Чтобы выбирать товары и делать заказы",
  "Do'kon sifatida ulgurji buyurtma berish uchun": "Для оптовых заказов от магазина",
  "Profil rasmi (ixtiyoriy)": "Фото профиля (необязательно)",
  "Kamida 4 ta belgi": "Минимум 4 символа", "Yana bir marta yozing": "Повторите ещё раз",
  "Yangi parol": "Новый пароль", "Yangi parolni takrorlang": "Повторите новый пароль",
  "Parolni saqlash": "Сохранить пароль", "Tasdiqlash kodini olish": "Получить код",
  "Kodni tasdiqlash": "Подтвердить код", "Kodni qayta olish": "Получить код снова",
  "Kodni qayta yuborish": "Отправить код снова", "6 xonali kod": "6-значный код",
  "6 xonali kodni": "6-значный код", "6 xonali kodni kiriting": "Введите 6-значный код",
  "Telefonni tasdiqlash": "Подтверждение телефона", "Raqam tasdiqlandi": "Номер подтверждён",
  "Raqamni yuborish": "Отправить номер", "Telegram orqali kod olish": "Получить код в Telegram",
  "Tasdiqlash va ro'yxatdan o'tish": "Подтвердить и зарегистрироваться",
  "Ro'yxatdan o'tdingiz": "Вы зарегистрированы",
  "sifatida ro'yxatdan o'tdingiz.": "— вы зарегистрированы.",
  "raqamini tasdiqlang.": "подтвердите номер.", "uchun tasdiqlash kodi kerak.": "нужен код подтверждения.",
  "tugmasi bilan raqamingizni ulashing": "поделитесь номером кнопкой",
  "tugmasini bosing": "нажмите кнопку", "shu yerga kiriting": "введите здесь",
  "ruxsat bering": "разрешите", "ilovasidan oching": "откройте в приложении",
  "Telegram hisobingiz tasdiqlandi — tasdiqlash kodi so'ralmaydi.":
    "Ваш Telegram подтверждён — код не потребуется.",
  "Ro'yxatdan o'tgan telefon raqamingizni kiriting. Telegram bot orqali tasdiqlash kodi yuboriladi.":
    "Введите номер, с которым регистрировались. Код придёт через Telegram-бота.",
  "Ma'lumotlar noto'g'ri.": "Неверные данные.", "Ma'lumotlar saqlandi.": "Данные сохранены.",
  "Parol noto'g'ri. Qaytadan urinib ko'ring.": "Неверный пароль. Попробуйте снова.",
  "Admin paroli": "Пароль администратора", "Administrator kirishi": "Вход администратора",
  "Boshqaruv paneliga kirish uchun admin parolini kiriting":
    "Введите пароль администратора для входа в панель",
  "Administrator bilan bog'lanish": "Связаться с администратором",
  "Tasdiqlash kutilmoqda": "Ожидает подтверждения", "Holatni tekshirish": "Проверить статус",
  "Mahsulotlar bilan tanishish": "Посмотреть товары",
  "Tanishish rejimi — narxlar tasdiqlangandan keyin ko'rinadi":
    "Режим просмотра — цены будут видны после подтверждения",
  "Sizda hali shaxsiy kabinet yo'q": "У вас пока нет личного кабинета",
  "Ro'yxatdan o'tib, buyurtmalaringiz va qarzlaringizni shu yerda kuzatib boring.":
    "Зарегистрируйтесь, чтобы следить за заказами и долгами.",

  /* ── Katalog va mahsulot ── */
  "Savatga qo'shish": "В корзину", "⚡ Sotib olish": "⚡ Купить",
  "Buyurtma berish": "Оформить заказ", "Hoziroq buyurtma berish": "Заказать сейчас",
  "Buyurtma asosida tayyorlanadi": "Готовится под заказ",
  "Mahsulot": "Товар", "Mahsulot nomi": "Название товара", "Yangi mahsulot": "Новый товар",
  "Mahsulotni o'chirish": "Удалить товар", "Mahsulot rasmini yuklash": "Загрузить фото товара",
  "+ Rasm qo'shish": "+ Добавить фото", "Rasm tanlash": "Выбрать фото", "JPG yoki PNG": "JPG или PNG",
  "Qo'shimcha rasmlar (4 tagacha)": "Доп. фото (до 4)", "Tavsif (ixtiyoriy)": "Описание (необязательно)",
  "Og'irligi (gram)": "Вес (грамм)", "O'lchov birligi": "Единица измерения",
  "Gramm (g)": "Граммы (г)", "Kilogramm (kg)": "Килограммы (кг)", "Litr (l)": "Литры (л)",
  "Dona (necha ta)": "Штуки", "dona omborda": "шт. на складе",
  "Ombordagi dona (qo'lda tuzatish)": "Остаток на складе (ручная правка)",
  "Iste'molchi narxi": "Розничная цена", "Iste'molchi narxi (so'm)": "Розничная цена (сум)",
  "Magazin narxi": "Оптовая цена", "Magazin egasi narxi (so'm)": "Цена для магазина (сум)",
  "Bo'sh qoldirilsa — iste'molchi narxi": "Если пусто — розничная цена",
  "Magazin egasi hisobidan kirganda shu narx ko'rinadi. Odatda arzonroq (ulgurji).":
    "Эту цену видит владелец магазина. Обычно дешевле (опт).",
  "Chegirma (%)": "Скидка (%)", "Chegirmagacha bo'lgan narx (ixtiyoriy)": "Цена до скидки (необязательно)",
  "Masalan: 45000 — chizib ko'rsatiladi": "Например: 45000 — показывается зачёркнутой",
  "Reyting (0-5, ixtiyoriy)": "Рейтинг (0-5, необязательно)", "Sharhlar soni": "Кол-во отзывов",
  "Eng kam buyurtma miqdori (dona)": "Минимальный заказ (шт.)",
  "Mijozga ko'rsatiladigan izoh (ixtiyoriy)": "Примечание для клиента (необязательно)",
  "Masalan: 2-3 kunda tayyor bo'ladi": "Например: будет готово через 2-3 дня",
  "Mavjud turkumlar": "Существующие категории", "Yangi turkum qo'shish": "Добавить категорию",
  "✓ Tasdiqlangan (ko'k belgi) ko'rsatish": "✓ Показывать синюю галочку",
  "🔥 \"Mashhur/Ommabop\" belgisini ko'rsatish": "🔥 Показывать значок «Популярное»",
  "Bu QR kodni chop etib, har bir qadoq ustiga yopishtiring. Skaner qilinganda shu mahsulot avtomatik tanilanadi.":
    "Распечатайте этот QR-код и наклейте на упаковку — при сканировании товар определится автоматически.",
  "Promo-kod bormi?": "Есть промокод?", "Yangi promo-kod": "Новый промокод",
  "Masalan: YANGI10": "Например: NEW10", "Foydalanish limiti (ixtiyoriy)": "Лимит использований (необязательно)",
  "Cheklovsiz uchun bo'sh qoldiring": "Оставьте пустым — без ограничений",
  "Mahsulot yangiligi": "Новинка", "Mahsulot yangiligi haqida xabar": "Сообщение о новинке",
  "Tovar tanlash": "Выбрать товар", "Tanlangan tovarlar:": "Выбранные товары:",
});

Object.assign(TR_RU, {
  /* ── Buyurtmalar va yetkazish ── */
  "Buyurtmani bekor qilish": "Отменить заказ", "Buyurtmani tahrirlash": "Изменить заказ",
  "Buyurtma qachon yetkaziladi": "Когда доставить заказ", "Hoziroq": "Сейчас",
  "Belgilangan vaqtga": "Ко времени", "Yetkazish vaqti": "Время доставки",
  "Yetkazish manzili": "Адрес доставки", "Yetkazish hududi": "Зона доставки",
  "Yetkazish hududlari": "Зоны доставки", "Yangi hudud": "Новая зона", "Hudud nomi": "Название зоны",
  "Yetkazish narxi (so'm)": "Стоимость доставки (сум)", "Masalan: Chilonzor": "Например: Чиланзар",
  "Tanlanmagan (yetkazish narxi 0)": "Не выбрано (доставка 0)",
  "Har bir hudud uchun yetkazish narxini belgilang — mijoz buyurtma berayotganda tanlaydi.":
    "Укажите цену доставки для каждой зоны — клиент выберет при заказе.",
  "Admin buyurtmani \"Tayyor\" deb belgilaguncha o'zgartirishingiz mumkin.":
    "Можно изменить, пока админ не отметит заказ «Готов».",
  "So'nggi buyurtmalar": "Последние заказы", "Hali buyurtma yo'q": "Заказов пока нет",
  "Mijoz qaytardi": "Клиент вернул", "Nima sababdan qaytardi?": "Причина возврата?",
  "Masalan: mijoz uyda yo'q edi, telefon javob bermadi...": "Например: клиента не было дома, не отвечал...",
  "Kuryer qayerda?": "Где курьер?", "Yangi kuryer": "Новый курьер",
  "Barcha yetkazishlarim": "Все мои доставки", "Yetkazishlar tarixi": "История доставок",
  "Telegram foydalanuvchi nomi": "Имя пользователя Telegram",
  "masalan: bekzod_courier (@ siz)": "например: bekzod_courier (без @)",
  "Masalan: Bekzod": "Например: Бекзод",
  "Kuryerning shaxsiy Telegram akkaunti @foydalanuvchi_nomi bo'lishi kerak (Telegram sozlamalarida ko'rinadi).":
    "У курьера должен быть свой Telegram @username (виден в настройках Telegram).",
  "Bu havolani barcha kuryerlaringizga yuboring — ular Telegram botda bir marta ro'yxatdan o'tadi, shundan keyin ularga botdan avtomatik xabar yuborish mumkin bo'ladi.":
    "Отправьте ссылку курьерам — они один раз зарегистрируются в боте, и им можно будет слать сообщения автоматически.",
  "Ro'yxatdan o'tish havolasi": "Ссылка для регистрации",
  "Chapda — rad etish, o'ngda — qabul qilish": "Слева — отклонить, справа — принять",
  "QR kodni telefon kamerasi bilan skanerlasangiz, shu buyurtmaning barcha ma'lumotlari ochiladi":
    "Отсканируйте QR-код камерой — откроются все данные заказа",
  "Kamerani yoqish": "Включить камеру",

  /* ── Xarita va manzil ── */
  "Xaritadan tanlash": "Выбрать на карте", "Xaritadan belgilash": "Отметить на карте",
  "Shu manzilni tanlash": "Выбрать этот адрес", "Hozirgi joylashuvim": "Моё местоположение",
  "Joriy joylashuvim": "Моё местоположение", "Joriy joylashuvni olish": "Определить местоположение",
  "Turgan joyimni aniqlash": "Определить где я", "Turgan joyni xaritadan tanlash": "Выбрать место на карте",
  "Joylashuvimni ulashish": "Поделиться местоположением",
  "Joylashuvingiz (ixtiyoriy)": "Ваше местоположение (необязательно)",
  "Uy manzilini xaritadan tanlang": "Выберите домашний адрес на карте",
  "Saqlangan uy manzilidan foydalanish": "Использовать сохранённый адрес",
  "Xaritada kerakli nuqtani bosing yoki belgini surib joylashtiring.":
    "Нажмите на нужную точку или перетащите метку.",
  "Xaritada istalgan joyni bosing — o'sha yerga do'kon belgisi qo'yiladi va ma'lumotlarni yozib saqlaysiz.":
    "Нажмите на карту — там появится метка магазина, затем заполните данные.",
  "Navigator — manzilga borish": "Навигатор — проложить маршрут",
  "Xarita ko'rinishi: Sxema": "Вид карты: Схема", "Sxema": "Схема", "Sputnik": "Спутник", "Gibrid": "Гибрид",
  "Kenglik (lat)": "Широта (lat)", "Uzunlik (lng)": "Долгота (lng)",
  "Manzil (ixtiyoriy)": "Адрес (необязательно)", "Manzil (matn)": "Адрес (текст)",
  "Shahar / manzil": "Город / адрес",

  /* ── Do'konlar va magazin tanlash ── */
  "Do'kon manzili": "Адрес магазина", "Do'kon telefon raqami": "Телефон магазина",
  "Do'konni saqlash": "Сохранить магазин", "Do'konni o'chirish": "Удалить магазин",
  "— Yangi do'kon (ro'yxatdan o'tmagan) —": "— Новый магазин (не зарегистрирован) —",
  "Magazin nomi": "Название магазина", "Magazinni tanlang": "Выберите магазин",
  "Nom bo'yicha qidirish...": "Поиск по названию...", "Ro'yxat": "Список",
  "Savdo va qarzdorlik": "Продажи и задолженность", "Oyda savdo": "Продаж за месяц",
  "Oylik aylanma": "Оборот за месяц", "Savdo yozuvi yo'q": "Продаж пока нет",
  "Qarz yozish": "Записать долг", "+ Qarz yozish": "+ Записать долг", "Qarz summasi": "Сумма долга",
  "Masalan: pelmeni 10 dona": "Например: пельмени 10 шт.", "Hozircha qarz yo'q": "Долгов пока нет",
  "Aloqa uchun telefon raqam": "Контактный телефон",

  /* ── Qarzlar ── */
  "Qarz": "Долг", "Qarzdor": "Должник", "Qarzdorlar soni": "Кол-во должников",
  "Qarz yo'q": "Долгов нет", "Qarzi yo'q": "Нет долга", "Qarzingiz yo'q": "У вас нет долгов",
  "Hech kim qarzdor emas": "Должников нет", "Qarzim (so'm)": "Мой долг (сум)",
  "Qarz tarixim": "История моих долгов", "Jami qarz, so'm": "Общий долг, сум",
  "Muddati o'tgan": "Просрочен", "Muddati yaqinlashgan": "Срок близок",
  "Muddati yaqinlashgan qarzlar": "Долги с близким сроком",
  "Muddati yaqinlashgan qarz yo'q": "Долгов с близким сроком нет",
  "Qarzni qachon beradi": "Когда вернёт долг",
  "Qolgan qarzni qachon berishi kerak?": "Когда нужно вернуть остаток?",
  "Qolgan qarz (avtomatik, so'm)": "Остаток долга (авто, сум)",
  "Hozir to'langan summa (so'm)": "Оплачено сейчас (сум)",
  "Shu summadan qanchasini berdi (so'm)": "Сколько оплатил из суммы (сум)",
  "Qarz haqida xabar yuborish": "Отправить напоминание о долге",
  "Summa (so'm)": "Сумма (сум)",

  /* ── Tez hisob va chek ── */
  "Sotish": "Продажа", "SOTISH": "ПРОДАЖА", "BUYURTMA": "ЗАКАЗ",
  "Sotildi": "Продано", "Qaytarildi": "Возврат", "Qaytarilgan": "Возвращено",
  "Qaytarilgan mahsulotlar": "Возвращённые товары", "Bugungi zarar": "Убыток за сегодня",
  "Umumiy zarar": "Общий убыток", "Zarar (so'm)": "Убыток (сум)",
  "Bugungi hisob": "Расчёт за сегодня", "Bugun hali amal bajarilmagan.": "Сегодня операций ещё не было.",
  "Kirim (+)": "Приход (+)", "Sotish (−)": "Продажа (−)",
  "Kamaytirish": "Уменьшить", "Kattalashtirish": "Увеличить",
  "Chek chiqarish": "Печать чека", "Chekni chiqarish": "Печать чека", "Chekdagi": "В чеке",
  "Printerdan chiqarish": "Печать на принтере", "Rasm sifatida": "Как изображение",
  "qatoriga yoziladi.": "будет вписано в строку.",
  "Bo'sh qoldirsangiz — qo'lda yozish uchun chiziq chiqadi.":
    "Если оставить пустым — будет линия для записи от руки.",
  "Bu yerga imzo qo'ying": "Распишитесь здесь", "— barmoq bilan chizing": "— пальцем",
  "To'liq to'landi": "Оплачено полностью", "Hammasi qarz": "Всё в долг",
  "TASDIQLASH": "ПОДТВЕРДИТЬ", "BEKOR QILISH": "ОТМЕНА", "Tasdiqlaysizmi?": "Подтверждаете?",

  /* ── Admin: bosh sahifa, analitika ── */
  "Bugungi savdo (so'm)": "Продажи за сегодня (сум)", "Haftalik savdo": "Продажи за неделю",
  "Eng faol magazinlar · 30 kun": "Самые активные магазины · 30 дней",
  "Hali magazinga bog'langan savdo yo'q": "Пока нет продаж, привязанных к магазинам",
  "Savdo dinamikasi (so'nggi 7 kun)": "Динамика продаж (7 дней)",
  "Eng ko'p sotilgan mahsulotlar": "Самые продаваемые товары",
  "Ombor bashorati": "Прогноз склада",
  "So'nggi 14 kunlik sotuv tezligiga qarab, tez tugaydigan mahsulotlar":
    "Товары, которые скоро закончатся (по продажам за 14 дней)",
  "Mijozlar hududi bo'yicha": "Клиенты по районам",
  "Qaysi hududdan ko'proq buyurtma kelayotgani": "Из каких районов больше заказов",
  "VIP mijozlar": "VIP-клиенты", "Ketib qolgan mijozlar": "Ушедшие клиенты",
  "14 kundan beri buyurtma bermagan mijozlar": "Клиенты без заказов 14+ дней",
  "Xarajatlar va sof foyda": "Расходы и чистая прибыль", "Sof foyda (shu davr)": "Чистая прибыль (за период)",
  "Yangi xarajat": "Новый расход", "Masalan: Ijara, ish haqi, xom-ashyo": "Например: аренда, зарплата, сырьё",
  "O'tgan oyga nisbatan": "По сравнению с прошлым месяцем",
  "Mahsulotlar bo'yicha": "По товарам", "Sotilgan (kg)": "Продано (кг)",
  "Bu davrda savdo bo'lmagan": "За этот период продаж не было",
  "Bu davrda xarajat kiritilmagan": "За этот период расходов нет",
  "Hali sotuv yo'q": "Продаж пока нет", "Hali mijoz yo'q": "Клиентов пока нет",
  "Hali yozuv yo'q": "Записей пока нет", "Hali joylashuvli buyurtma yo'q": "Заказов с геолокацией пока нет",
  "Hozircha ketib qolgan mijoz yo'q 🎉": "Ушедших клиентов нет 🎉",
  "Hozircha tez tugaydigan mahsulot yo'q 👍": "Скоро заканчивающихся товаров нет 👍",

  /* ── Tizim holati ── */
  "Jami ma'lumot": "Всего данных", "Telefon xotirasi": "Память телефона",
  "Zaxira nusxa": "Резервная копия", "Zaxira nusxani yuklab olish": "Скачать резервную копию",
  "Zaxiradan tiklash": "Восстановить из копии", "Hali zaxira olinmagan": "Копия ещё не создавалась",
  "Excel'ga eksport": "Экспорт в Excel",
  "Katta bo'limlar avtomatik bo'laklarga ajratiladi — 1 MB chegarasi endi ma'lumot yo'qotishga olib kelmaydi.":
    "Большие разделы автоматически делятся на части — лимит 1 МБ больше не приводит к потере данных.",
  "Ma'lumot tiklash": "Восстановление данных", "Bu qurilmada saqlangan ma'lumot:": "Данные на этом устройстве:",
  "Shu ma'lumotni bulutga qaytarish": "Вернуть эти данные в облако",
  "Agar yuqoridagi raqamlar": "Если цифры выше",
  "ko'rinsa (mahsulotlar, foydalanuvchilar bor bo'lsa) — pastdagi tugmani bosib, shu ma'lumotni bulutga qaytarib, barcha qurilmalarda tiklashingiz mumkin.":
    "видны (есть товары, пользователи) — нажмите кнопку ниже, чтобы вернуть данные в облако и восстановить на всех устройствах.",
  "Internet aloqasi yo'q — ilova xotiradagi ma'lumot bilan ishlayapti":
    "Нет интернета — приложение работает с сохранёнными данными",

  /* ── Foydalanuvchilar va xabarlar ── */
  "Ro'yxatdan o'tganlar": "Зарегистрированные", "Ro'yxatdan o'tgan foydalanuvchilar": "Зарегистрированные пользователи",
  "Ro'yxatdan o'tgan foydalanuvchilardan birini tanlang": "Выберите зарегистрированного пользователя",
  "Foydalanuvchini bloklash": "Заблокировать пользователя",
  "Faqat admin hisobni va uning tarixini o'chira oladi.": "Только админ может удалить аккаунт и историю.",
  "Barchaga xabar": "Сообщение всем", "Barchaga xabar yuborish": "Отправить всем", "Barchaga yuborish": "Отправить всем",
  "Bu xabar ro'yxatdan o'tgan": "Это сообщение получат",
  "foydalanuvchilarga bir vaqtning o'zida yuboriladi.": "пользователи одновременно.",
  "Kimga yozmoqchisiz?": "Кому пишете?", "Xabar matni": "Текст сообщения",
  "Xabaringizni shu yerga yozing...": "Напишите сообщение...", "Xabar tahrirlanmoqda": "Редактирование сообщения",
  "Masalan: Yangilik!": "Например: Новинка!", "Masalan: Narxi tushdi! Yangi ta'm qo'shildi!": "Например: Цена снижена! Новый вкус!",
  "Narx tushishi, yangi mahsulot yoki boshqa o'zgarish haqida — tegishli mahsulot(lar)ni tanlang":
    "О снижении цены, новинке и т.п. — выберите нужные товары",
  "Yangilanish xabari shabloni": "Шаблон сообщения об обновлении",
  "Ilova orqali yuborish": "Отправить через приложение", "SMS orqali": "Через SMS",
  "WhatsApp orqali": "Через WhatsApp", "Bot yuborgan": "Отправлено ботом",
  "O'zim uchun": "Для себя", "yozmoqda...": "печатает...", "Ovozli xabar": "Голосовое сообщение",
  "Ovoz yozilmoqda...": "Идёт запись...", "Rasm yuborish": "Отправить фото",
  "Chaqirilmoqda...": "Вызов...", "Qo'ng'iroq qilish": "Позвонить",
  "Ilova ochiq bo'lganda bu yerdagi bildirishnomalar brauzer orqali ham ko'rsatiladi (agar ruxsat berilgan bo'lsa).":
    "Когда приложение открыто, уведомления также показываются в браузере (если разрешено).",

  /* ── Sozlamalar ── */
  "O'zgarishlarni saqlash": "Сохранить изменения", "Qisqacha ma'lumot": "Кратко о нас",
  "Biz haqimizda qisqacha...": "Кратко о нас...",
  "Unutilmas Ta'm — har kuni yangi tayyorlangan milliy taomlar ishlab chiqarish sexi.":
    "Unutilmas Ta'm — цех национальных блюд, свежее каждый день.",
  "Banner kichik yozuvi (sariq)": "Малый текст баннера (жёлтый)", "Banner katta yozuvi": "Большой текст баннера",
  "«Dastur yaratish» tugmasi": "Кнопка «Создать приложение»", "Dastur yaratish": "Создать приложение",
  "Telegram (havola)": "Telegram (ссылка)", "Telegram kanal (havola)": "Telegram-канал (ссылка)",
  "Instagram (havola)": "Instagram (ссылка)", "YouTube (havola)": "YouTube (ссылка)",
  "iPhone uchun ilova havolasi (Firebase / hosting)": "Ссылка на приложение для iPhone",
  "Bu havola kiritilsa, katalog pastida iPhone'ga o'rnatish tugmasi paydo bo'ladi.":
    "Если указать ссылку, внизу каталога появится кнопка установки на iPhone.",
  "Android APK fayl manzili": "Ссылка на APK для Android", "Android tugmasini ko'rsatish": "Показывать кнопку Android",
  "To'g'ridan-to'g'ri .apk fayl havolasi (GitHub Releases, Firebase Storage va h.k.).":
    "Прямая ссылка на файл .apk (GitHub Releases, Firebase Storage и т.п.).",
  "APK manzili sozlamalarda kiritilmagan — avval Sozlamalar → Android APK manzilini to'ldiring.":
    "Ссылка на APK не указана — заполните её в Настройки → Android APK.",
  "Apk faylni yuklab olish": "Скачать APK", "Ilovani yuklab olish tugmasini qo'shish": "Добавить кнопку скачивания",
  "Ilova .apk fayl sifatida telefoningizga yuklanadi": "Приложение скачается как файл .apk",
  "Ilova bosh ekranda haqiqiy ilova kabi turadi": "Приложение будет на главном экране как обычное",
  "Ilovani Safari'da ochish": "Открыть в Safari", "O'rnatish": "Установить",
  "O'rnatishda yordam:": "Помощь с установкой:", "Yuklab olingan faylni": "Скачанный файл",
  "\"Noma'lum manbalardan o'rnatish\" so'ralsa —": "Если запросит «Установку из неизвестных источников» —",
  "Qadamlarni ko'rish uchun rasmlarni chapga suring 👉": "Листайте фото влево, чтобы увидеть шаги 👉",
  "Yangi kod (ixtiyoriy — o'zgartirmoqchi bo'lsangiz kiriting)": "Новый код (необязательно)",
  "Joriy kod (tasdiqlash uchun)": "Текущий код (для подтверждения)",
  "Telefon raqam yoki email kiritilsa, admin kodini unutgan holatda tiklash uchun ishlatiladi.":
    "Телефон или email нужны для восстановления кода админа.",
  "Mijoz shu miqdordan kam buyurtma bera olmaydi. Masalan 30 yozilsa, 20 dona buyurtma qabul qilinmaydi.":
    "Клиент не сможет заказать меньше. Например, при 30 заказ на 20 шт. не примется.",
  "Administrator hisobingizni tasdiqlagandan keyin ilovadan to'liq foydalana olasiz va magazin (ulgurji) narxlarini ko'rasiz.":
    "После подтверждения администратором вы получите полный доступ и оптовые цены.",
  "Odatda bu bir necha soat ichida hal bo'ladi. Tasdiqlangach ilovaga qayta kiring yoki \"Holatni tekshirish\" tugmasini bosing.":
    "Обычно это занимает несколько часов. После подтверждения войдите снова или нажмите «Проверить статус».",
  "Ma'lumotlar ro'yxatingizdan avtomatik olindi — kerak bo'lsa tahrirlashingiz mumkin":
    "Данные взяты из вашего профиля — при необходимости измените",
  "DEMO rejim: bot ulanmagan, kod shu yerda ko'rsatiladi:": "ДЕМО: бот не подключён, код показан здесь:",
  "DEMO rejim: Telegram bot hali ulanmagan (TG_VERIFY sozlamasi bo'sh), shuning uchun kod sinov uchun shu yerda ko'rsatiladi:":
    "ДЕМО: Telegram-бот не подключён, поэтому код для проверки показан здесь:",
});

Object.assign(TR_RU, {
  "Mahsulotlar": "Товары", "Foydalanuvchilar": "Пользователи", "Do'konlar": "Магазины",
  "Qaytarilganlar": "Возвраты", "Xarajatlar": "Расходы", "Xabarlar": "Сообщения",
  "Admin sozlamalari": "Настройки админа", "Sotuvchi ma'lumoti": "Данные продавца",
  "Suhbatlar": "Чаты", "Telegram raqamlari": "Номера Telegram",
  "email@misol.uz": "email@primer.uz",
  "Katta bo'limlar avtomatik bo'laklarga ajratiladi — 1 MB chegarasi endi ma'lumot yo'qotishga olib kelmaydi.":
    "Большие разделы автоматически делятся на части — лимит 1 МБ больше не приводит к потере данных.",
  "Telefon xotirasi to'lib bormoqda. Mahsulot rasmlarini kamaytiring yoki eski sotuvlarni arxivlang.":
    "Память телефона заполняется. Уменьшите фото товаров или архивируйте старые продажи."
});

Object.assign(TR_RU, {
  "Bonus sozlamalari": "Настройки бонуса", "Bonus funksiyasi yoqilgan": "Бонус включён",
  "Maqsad savdo summasi": "Целевая сумма продаж", "Bonus foizi (%)": "Процент бонуса (%)",
  "Magazin egasining karta raqami": "Номер карты владельца", "Sozlash": "Настроить",
  "🎁 Bonus funksiyasini yoqish": "🎁 Включить бонус", "Bonusni berish": "Выдать бонус",
  "Berilgan bonuslar": "Выданные бонусы", "Cheklar": "Чеки", "Magazin hisobim": "Счёт моего магазина",
  "Jami xarid": "Всего покупок", "To'langan": "Оплачено", "Hali chek yo'q": "Чеков пока нет",
  "To'liq to'langan": "Оплачено полностью", "BERILDI": "ВЫДАНО", "Bonusni berasizmi?": "Выдать бонус?"
});

Object.assign(TR_RU, {
  "To'lov qildim": "Я оплатил", "To'langan summa": "Оплаченная сумма", "Qanday to'landi": "Способ оплаты",
  "Naqd": "Наличные", "Karta": "Карта", "O'tkazma": "Перевод", "So'rovni yuborish": "Отправить запрос",
  "Masalan: kuryerga berdim": "Например: отдал курьеру", "Yuborilgan so'rovlar": "Отправленные запросы",
  "To'lov so'rovlari": "Запросы на оплату", "Tasdiq kutilmoqda": "Ожидает подтверждения",
  "RAD ETISH": "ОТКЛОНИТЬ", "Administrator tasdiqlagach qarz kamayadi": "Долг уменьшится после подтверждения админом",
  "So'rov administratorga yuboriladi. Qarz faqat u tasdiqlagandan keyin kamayadi.":
    "Запрос уйдёт администратору. Долг уменьшится только после его подтверждения.",
  "Bu amal faqat administrator uchun.": "Это действие доступно только администратору.",
  "So'rov yuborildi. Administrator tasdiqlagach qarz kamayadi.": "Запрос отправлен. Долг уменьшится после подтверждения."
});

Object.assign(TR_RU, {
  "Magazinlar ro'yxati": "Список магазинов", "Qidirish...": "Поиск...",
  "Firebase: admin sifatida ulangan ✓": "Firebase: подключён как админ ✓",
  "Firebase: anonim ulangan ✓": "Firebase: подключён анонимно ✓"
});

Object.assign(TR_RU, {
  "Moliya hisoboti": "Финансовый отчёт", "Tushum · tannarx · foyda · xarajat · magazinlar": "Выручка · себестоимость · прибыль · расходы · магазины",
  "Kecha": "Вчера", "7 kun": "7 дней", "Shu oy": "Этот месяц", "O'tgan oy": "Прошлый месяц", "Hammasi": "Всё",
  "Tushum": "Выручка", "Sof foyda": "Чистая прибыль", "xarajat va zarardan keyin": "после расходов и убытков",
  "Tannarx": "Себестоимость", "Yalpi foyda": "Валовая прибыль", "Yaroqsiz (zarar)": "Списание (убыток)",
  "Shu davr qarzi": "Долг за период", "Umumiy qarz (hozir)": "Общий долг (сейчас)",
  "Magazinlar bo'yicha": "По магазинам", "Kunlar bo'yicha": "По дням", "Sana": "Дата", "Foyda": "Прибыль",
  "Dona": "Шт.", "Bu davrda savdo yo'q": "За период продаж нет", "Magazinsiz (bog'lanmagan)": "Без магазина",
  "Xaritadan tanlash": "Выбрать на карте", "— belgiga bosing": "— нажмите на метку",
  "Chek o'chirilsinmi?": "Удалить чек?", "Eski cheklar o'chirilsinmi?": "Удалить старые чеки?",
  "HA, O'CHIRISH": "ДА, УДАЛИТЬ", "To'liq to'langan ✓": "Оплачено полностью ✓",
  "— foyda hisobi uchun": "— для расчёта прибыли", "Masalan: 18000": "Например: 18000",
  "1 dona mahsulotga ketadigan xarajat. Kiritilmasa foyda hisoblanmaydi.":
    "Затраты на 1 шт. товара. Без неё прибыль не считается."
});

Object.assign(TR_RU, {
  "Tartiblash": "Порядок", "Tartibni o'zgartirish": "Изменить порядок",
  "Kartochkani bosib turing va kerakli joyga suring. Yoki ↑ ↓ tugmalaridan foydalaning.":
    "Удерживайте карточку и перетащите. Или используйте кнопки ↑ ↓."
});

Object.assign(TR_RU, {
  "BONUSLAR": "БОНУСЫ", "Bonus · promokod · ball · referal": "Бонус · промокод · баллы · рефералы",
  "Ball": "Баллы", "Referal": "Рефералы", "Promokod": "Промокод", "Sovg'a qutisi": "Подарочная коробка",
  "Yoqish va kurs": "Включение и курс", "Taklif mukofoti": "Награда за приглашение",
  "Magazinlar bo'yicha": "По магазинам", "Ball tizimi yoqilgan": "Баллы включены",
  "Referal yoqilgan": "Рефералы включены", "Sovg'a qutisi yoqilgan": "Подарочная коробка включена",
  "Tabriklaymiz!": "Поздравляем!", "Katta xarid uchun sovg'a promo-kod": "Промокод в подарок за большую покупку",
  "Oldim": "Забрал", "yoqilmagan": "не включено",
  "KARTAGA BERDIM": "ПЕРЕВЁЛ НА КАРТУ", "KEYINGI XARIDGA": "НА СЛЕДУЮЩУЮ ПОКУПКУ",
  "Bonus qanday beriladi?": "Как выдать бонус?"
});

Object.assign(TR_RU, {
  "🎁 Sovg'agacha": "🎁 До подарка", "Sovg'a tayyor!": "Подарок готов!",
  "🎉 Mening promo-kodlarim": "🎉 Мои промокоды", "Ishlatish": "Применить",
  "👥 Do'stlarni taklif qiling": "👥 Пригласите друзей", "Do'stlarga yuborish": "Отправить друзьям",
  "Nusxa": "Копия", "Havola nusxalandi": "Ссылка скопирована",
  "kishi ro'yxatdan o'tgan": "человек зарегистрировалось",
  "💰 Hisobim": "💰 Мой счёт", "Keyingi xaridda avtomatik ishlatiladi": "Будет списано со следующей покупки",
  "Kodni bosib nusxalang yoki \"Ishlatish\" bilan savatga qo'llang.":
    "Нажмите на код, чтобы скопировать, или «Применить» для корзины."
});

/* Chekdagi o'zbekcha rahmat qatori ATAYLAB o'girilmaydi */
delete TR_RU["Xaridingiz uchun rahmat! 🙏"];
delete TR_RU["Xaridingiz uchun rahmat!"];


/* ═══════════════════════════════════════════════════════════════
   TARJIMA MEXANIZMI
   ═══════════════════════════════════════════════════════════════ */

/* Bo'shliqlari bir xillashtirilgan lug'at — ko'p qatorli matnlar ham topilsin */
const __TR_RU_N = {};
function __rebuildNormDict(){
  Object.keys(TR_RU).forEach(function(k){ __TR_RU_N[k.replace(/\s+/g, ' ').trim()] = TR_RU[k]; });
}
__rebuildNormDict();

/* Raqamli yozuvlar uchun qoidalar (faqat RU rejimida) */
const RU_RULES = [
  /* raqam oxiridagi bo'shliqni ushlamaslik uchun: \d bilan tugaydi */
  [/^(\d[\d\s\u00a0\u202f.,]*\d|\d)\s*dona$/,   '$1 шт.'],
  [/^(\d[\d\s\u00a0\u202f.,]*\d|\d)\s*ta$/,     '$1 шт.'],
  [/^(\d[\d\s\u00a0\u202f.,]*\d|\d)\s*xil$/,    '$1 вид.'],
  [/^([\d\s\u00a0\u202f.,]+) xil · ([\d\s\u00a0\u202f.,]+) dona$/, '$1 вид. · $2 шт.'],
  [/^oyda (\d+) savdo · (.+)$/,                 'за месяц $1 продаж · $2'],
  [/^Hozirgi qarz: (.+)$/,                      'Текущий долг: $1'],
  [/^(\d+) kun oldin olingan$/,                 'создана $1 дн. назад'],
  [/^Bugun olingan$/,                           'создана сегодня'],
  [/^\((\d+)\s*\(magazin\)\)$/,                 '($1 (магазин))'],
  [/^(\d+) \(magazin\)$/,                       '$1 (магазин)'],
];

function trRu(text){
  if(!text) return null;
  const t = text.trim();
  if(!t) return null;
  if(TR_RU[t]) return TR_RU[t];
  const n = t.replace(/\s+/g, ' ');
  if(__TR_RU_N[n]) return __TR_RU_N[n];
  for(let i = 0; i < RU_RULES.length; i++){
    if(RU_RULES[i][0].test(t)) return fixSom(t.replace(RU_RULES[i][0], RU_RULES[i][1]));
  }
  /* So'm -> сум (summa yozuvlari) */
  if(/so['’ʼ]m/.test(t)) return fixSom(t);
  return null;
}

function fixSom(s){ return s.replace(/so['’ʼ]m/g, 'сум'); }

/* Asl (o'zbekcha) qiymatni eslab qolamiz — UZ ga qaytishda kerak */
function translateDOM(root, dict){
  if(!root) return;
  const toRu = (dict === TR_RU) || appLang === 'ru';
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = []; let n;
  while((n = walker.nextNode())) nodes.push(n);

  nodes.forEach(function(node){
    const p = node.parentElement;
    if(p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) return;
    if(p && p.closest && p.closest('.noTr')) return;          // tarjima qilinmasin
    const raw = node.nodeValue;
    if(toRu){
      const tr = trRu(raw);
      if(tr && tr !== raw.trim()){
        if(node.__uz == null) node.__uz = raw;
        node.nodeValue = raw.replace(raw.trim(), tr);
      }
    }else if(node.__uz != null){
      node.nodeValue = node.__uz;                              // aslini qaytaramiz
      node.__uz = null;
    }else if(dict){
      const t = dict[raw.trim()];
      if(t) node.nodeValue = raw.replace(raw.trim(), t);
    }
  });

  if(root.querySelectorAll){
    root.querySelectorAll('[placeholder],[title]').forEach(function(el){
      ['placeholder', 'title'].forEach(function(a){
        const v = el.getAttribute(a);
        if(!v) return;
        const key = '__uz_' + a;
        if(toRu){
          const tr = trRu(v);
          if(tr){ if(el[key] == null) el[key] = v; el.setAttribute(a, tr); }
        }else if(el[key] != null){
          el.setAttribute(a, el[key]); el[key] = null;
        }
      });
    });
  }
}

/* Yangi chizilgan qismlarni ham o'giradi */
function startTranslateObserver(){
  if(__translateObserverStarted) return;
  __translateObserverStarted = true;
  const obs = new MutationObserver(function(muts){
    if(appLang !== 'ru') return;
    muts.forEach(function(m){
      if(m.type === 'characterData'){
        const node = m.target, tr = trRu(node.nodeValue);
        if(tr && tr !== node.nodeValue.trim()){
          node.__uz = node.nodeValue;
          node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), tr);
        }
        return;
      }
      m.addedNodes.forEach(function(node){
        if(node.nodeType === 1) translateDOM(node, TR_RU);
        else if(node.nodeType === 3){
          const tr = trRu(node.nodeValue);
          if(tr && tr !== node.nodeValue.trim()){
            node.__uz = node.nodeValue;
            node.nodeValue = node.nodeValue.replace(node.nodeValue.trim(), tr);
          }
        }
      });
    });
  });
  obs.observe(document.body, {childList:true, subtree:true, characterData:true});
}

/* alert / confirm ham o'giriladi */
(function(){
  const _alert = window.alert.bind(window);
  const _confirm = window.confirm.bind(window);
  function trMsg(m){
    if(appLang !== 'ru' || typeof m !== 'string') return m;
    const whole = trRu(m);
    if(whole) return whole;
    /* uzun xabarlarni qatorma-qator o'giramiz */
    return m.split('\n').map(function(line){ return trRu(line) || line; }).join('\n');
  }
  window.alert = function(m){ return _alert(trMsg(m)); };
  window.confirm = function(m){ return _confirm(trMsg(m)); };
})();

/* ═══ Til almashtirgich: yon menyuda "Menyu" yonida UZ | РУ ═══ */
function refreshLangUI(){
  document.querySelectorAll('.langPill button').forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-lang') === appLang);
  });
  document.documentElement.lang = appLang === 'ru' ? 'ru' : 'uz';
}

function mountLangPill(){
  if(document.querySelector('.langPill')) return;
  const title = Array.prototype.find.call(
    document.querySelectorAll('#sideMenu *'),
    function(el){ return el.children.length === 0 && /^(Menyu|Меню)$/.test(el.textContent.trim()); });
  if(!title) return;
  const pill = document.createElement('div');
  pill.className = 'langPill noTr';
  pill.innerHTML = '<button type="button" data-lang="uz">UZ</button>' +
                   '<button type="button" data-lang="ru">РУ</button>';
  pill.addEventListener('click', function(e){
    const b = e.target.closest('button[data-lang]');
    if(!b) return;
    e.stopPropagation();
    const lang = b.getAttribute('data-lang');
    if(lang === appLang) return;
    setAppLanguage(lang);
    try{ if(typeof refreshAdminClock === 'function') refreshAdminClock(); }catch(err){}
  });
  /* "Menyu" yozuvi va tugmani bitta guruhga olamiz — yonma-yon tursin */
  const grp = document.createElement('div');
  grp.className = 'menuTitleGroup';
  title.parentElement.insertBefore(grp, title);
  grp.appendChild(title);
  grp.appendChild(pill);
  refreshLangUI();
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountLangPill);
else mountLangPill();


/* Admin soati: kun va oy nomlari tilga qarab */
(function(){
  if(typeof refreshAdminClock !== 'function') return;
  const DAYS_RU = ['Воскресенье','Понедельник','Вторник','Среда','Четверг','Пятница','Суббота'];
  const MON_RU = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  setInterval(function(){
    if(appLang !== 'ru') return;
    const el = document.getElementById('acDate');
    if(!el || document.getElementById('adminClock').classList.contains('hidden')) return;
    const d = new Date();
    el.textContent = DAYS_RU[d.getDay()] + ', ' + d.getDate() + ' ' + MON_RU[d.getMonth()] + ' ' + d.getFullYear();
  }, 1000);
})();
