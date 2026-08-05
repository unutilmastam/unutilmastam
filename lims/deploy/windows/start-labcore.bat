@echo off
REM LabCore serverini qo'lda ishga tushirish (sinov uchun).
REM Doimiy ishlashi uchun "LabCore" vazifasi (Task Scheduler) ishlatiladi.
cd /d "%~dp0..\.."
echo LabCore ishga tushirilmoqda...
node src\index.js
pause
