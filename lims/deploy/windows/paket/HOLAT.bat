@echo off
chcp 65001 >nul
title LabCore - holat
powershell -NoProfile -ExecutionPolicy Bypass -File "C:\LabCore\deploy\windows\status.ps1"
pause
