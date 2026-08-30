@echo off
title LabCore - tekshiruv
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tekshir.ps1"
if errorlevel 1 echo.
pause
