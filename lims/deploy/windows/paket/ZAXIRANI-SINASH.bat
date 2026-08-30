@echo off
chcp 65001 >nul
title LabCore - zaxirani sinash
echo.
echo  Zaxira nusxa haqiqatan ishlaydimi - alohida bazaga tiklab tekshiramiz.
echo  Ishlab turgan bazaga TEGILMAYDI.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\deploy\windows\tiklash.ps1" -Sinov
pause
