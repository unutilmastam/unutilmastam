@echo off
chcp 65001 >nul
title LabCore - telefonga ulash
echo.
echo  Telefonga ulash sahifasi ochilmoqda...
echo  (QR kod, sertifikat va qadamma-qadam ko'rsatma shu yerda)
echo.
start https://localhost:4000/telefon
timeout /t 3 >nul
