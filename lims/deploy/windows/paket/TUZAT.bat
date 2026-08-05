@echo off
chcp 65001 >nul
title LabCore - tuzatish
color 0B
echo.
echo  ============================================================
echo    LabCore - o'rnatish skriptini tuzatish
echo  ============================================================
echo.
echo   Bu tuzatish ruscha Windows'dagi xatoni bartaraf qiladi:
echo     "Some or all identity references could not be translated"
echo.
echo   Skript yangi faylni LabCore papkangizga o'zi qo'yadi.
echo.
pause
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tuzat.ps1"
echo.
pause
