@echo off
chcp 65001 >nul
title LabCore - tekshiruv
color 0B
echo.
echo  ============================================================
echo    LabCore - nima uchun ulanmayapti?
echo  ============================================================
echo.
echo   Server ishlayaptimi va DASTURGA QAYSI MANZILNI yozish
echo   kerakligini tekshiradi.
echo.
pause
if exist "%~dp0server\deploy\windows\tekshir.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\deploy\windows\tekshir.ps1"
) else if exist "%~dp0yangi\deploy\windows\tekshir.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0yangi\deploy\windows\tekshir.ps1"
) else if exist "C:\LabCore\deploy\windows\tekshir.ps1" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "C:\LabCore\deploy\windows\tekshir.ps1"
) else (
  echo   tekshir.ps1 topilmadi.
)
echo.
pause
