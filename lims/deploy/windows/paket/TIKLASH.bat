@echo off
chcp 65001 >nul
title LabCore - zaxiradan tiklash
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\deploy\windows\tiklash.ps1"
pause
