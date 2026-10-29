// Prints a new settings file with fresh random secrets (used once by deploy.sh).
const { randomBytes } = require('node:crypto');
const r = (n) => randomBytes(n).toString('base64url');
const home = process.env.HOME || '~';
process.stdout.write(`# AI Sales HQ sozlamalari. Bu fayl maxfiy: hech kimga yubormang, public_html ga qo'ymang.
NODE_ENV=production
APP_ORIGIN=https://agent.unutilmastam.uz
APP_SECRET_KEY=${r(36)}
# /setup sahifasida birinchi egani yaratish uchun bir martalik kod:
SETUP_TOKEN=${r(24)}
LOG_LEVEL=info

# cPanel -> MySQL Databases da yaratgan baza (parolni qo'shtirnoq ichida yozing):
DB_HOST=localhost
DB_NAME=
DB_USER=
DB_PASSWORD=""

# Sayt (Firestore) uchun kalit fayli - yuklagandan keyin boshidagi # ni olib tashlang:
# FIREBASE_SERVICE_ACCOUNT_FILE=${home}/ai-sales-hq-data/firebase-sa.json
# Egasi uchun Telegram bot (ixtiyoriy):
# TELEGRAM_BOT_TOKEN=
# TELEGRAM_OWNER_CHAT_IDS=
# TELEGRAM_WEBHOOK_SECRET=${r(24)}
`);
