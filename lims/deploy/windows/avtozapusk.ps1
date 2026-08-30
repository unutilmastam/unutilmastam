# ============================================================================
#  LabCore - ish stansiyasida avtozapusk
#
#  Kompyuter yoqilganda LabCore dasturi o'zi ochilishini yoqadi yoki
#  o'chiradi. Administrator huquqi kerak emas: yozuv faqat shu
#  foydalanuvchining ro'yxatiga qo'shiladi.
#
#  Ishlatish:
#     .\avtozapusk.ps1                                  # yoqadi (dasturni o'zi topadi)
#     .\avtozapusk.ps1 -ExePath "D:\LabCore-DASTUR.exe" # boshqa joydagi fayl
#     .\avtozapusk.ps1 -Off                             # o'chiradi
#     .\avtozapusk.ps1 -Status                          # holatini ko'rsatadi
#
#  Eslatma: dasturning o'zida ham bor - menyu "Sozlamalar" ->
#  "Kompyuter yoqilganda avtomatik ochilsin".
# ============================================================================

param(
  [string]$ExePath = "",
  [switch]$Off,
  [switch]$Status
)

$ErrorActionPreference = "Stop"
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
$Name   = "LabCore"

function Get-Current {
  $item = Get-ItemProperty -Path $RunKey -Name $Name -ErrorAction SilentlyContinue
  if ($item) { return $item.$Name }
  return $null
}

# ---------------------------------------------------------------------------
if ($Status) {
  $cur = Get-Current
  if ($cur) {
    Write-Host "Avtozapusk: yoqilgan" -ForegroundColor Green
    Write-Host "Dastur    : $cur"
  } else {
    Write-Host "Avtozapusk: o'chirilgan" -ForegroundColor Yellow
  }
  return
}

# ---------------------------------------------------------------------------
if ($Off) {
  if (Get-Current) {
    Remove-ItemProperty -Path $RunKey -Name $Name
    Write-Host "OK: avtozapusk o'chirildi" -ForegroundColor Green
  } else {
    Write-Host "Avtozapusk allaqachon o'chirilgan" -ForegroundColor Yellow
  }
  return
}

# ---------------------------------------------------------------------------
# Dastur faylini topamiz
if (-not $ExePath) {
  $candidates = @(
    (Join-Path $PSScriptRoot "..\..\..\LabCore-DASTUR.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\LabCore\LabCore.exe"),
    "C:\Program Files\LabCore\LabCore.exe",
    (Join-Path $env:USERPROFILE "Desktop\LabCore-DASTUR.exe")
  )
  foreach ($c in $candidates) {
    if ($c -and (Test-Path $c)) { $ExePath = (Resolve-Path $c).Path; break }
  }
}

if (-not $ExePath -or -not (Test-Path $ExePath)) {
  throw "LabCore dasturi topilmadi. Faylning to'liq manzilini bering: .\avtozapusk.ps1 -ExePath ""C:\...\LabCore-DASTUR.exe"""
}

if (-not (Test-Path $RunKey)) { New-Item -Path $RunKey -Force | Out-Null }
Set-ItemProperty -Path $RunKey -Name $Name -Value "`"$ExePath`" --labcore-autostart"

Write-Host "OK: avtozapusk yoqildi" -ForegroundColor Green
Write-Host "Dastur: $ExePath"
Write-Host "Endi kompyuter yoqilganda LabCore o'zi ochiladi."
Write-Host "O'chirish uchun: .\avtozapusk.ps1 -Off"
