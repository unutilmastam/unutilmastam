@echo off
title LabCore - tuzatish
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tuzat.ps1"
if errorlevel 1 echo.
pause
