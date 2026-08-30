@echo off
chcp 65001 >nul
title LabCore - o'rnatish
color 0B
echo.
echo  ============================================================
echo    LabCore - laboratoriya boshqaruv tizimi
echo  ============================================================
echo.
echo   Bu skript hamma narsani o'zi o'rnatadi:
echo     - ma'lumotlar bazasini yaratadi
echo     - tizimni C:\LabCore ga o'rnatadi
echo     - HTTPS sertifikat yasaydi (telefon uchun kerak)
echo     - ish stolida "LabCore" belgichasini yaratadi
echo     - kompyuter yoqilganda avtomatik ishga tushishini yoqadi
echo     - har kuni 01:30 da zaxira olishni yoqadi
echo.
echo   INTERNET KERAK EMAS. Faqat ikkita bepul dastur oldindan
echo   o'rnatilgan bo'lishi kerak: Node.js LTS va PostgreSQL.
echo.

net session >nul 2>&1
if %errorLevel% neq 0 (
  echo  ------------------------------------------------------------
  echo   XATO: Administrator huquqi yo'q.
  echo.
  echo   Bu faylni O'NG TUGMA bilan bosing va
  echo   "Run as administrator" ni tanlang.
  echo  ------------------------------------------------------------
  echo.
  pause
  exit /b 1
)

where node >nul 2>&1
if %errorLevel% neq 0 (
  echo  ------------------------------------------------------------
  echo   Node.js topilmadi.
  echo.
  echo   Internet bo'lgan joyda ^(telefonda ham bo'ladi^) shu faylni
  echo   yuklab oling va fleshka orqali shu kompyuterga o'tkazing:
  echo.
  echo     https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi
  echo.
  echo   O'rnating ^(Next - Next - Install^), kompyuterni qayta yoqing
  echo   va bu faylni yana ishga tushiring.
  echo  ------------------------------------------------------------
  echo.
  pause
  exit /b 1
)

where psql >nul 2>&1
if %errorLevel% neq 0 (
  if not exist "C:\Program Files\PostgreSQL" (
    echo  ------------------------------------------------------------
    echo   PostgreSQL topilmadi.
    echo.
    echo   Internet bo'lgan joyda yuklab oling va fleshka orqali
    echo   shu kompyuterga o'tkazing:
    echo.
    echo     https://www.postgresql.org/download/windows/
    echo     ^("Download the installer"^)
    echo.
    echo   O'rnatishda "postgres" uchun parol so'raydi - YOZIB QO'YING.
    echo   Oxirida "Stack Builder" oynasi chiqsa - Cancel bosing:
    echo   u internetdan qo'shimcha dastur yuklaydi, bizga kerak emas.
    echo  ------------------------------------------------------------
    echo.
    pause
    exit /b 1
  )
)

echo  Davom etish uchun istalgan tugmani bosing...
pause >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\deploy\windows\install-server.ps1"
echo.
pause
