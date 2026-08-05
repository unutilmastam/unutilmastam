# ============================================================================
#  LabCore - tuzatishni o'z joyiga qo'yish
#
#  Yangi install-server.ps1 faylini kompyuterdagi LabCore papkalaridan
#  topib, eskisining ustiga yozadi. Qo'lda papka qidirish shart emas.
#
#  Ishga tushirish: TUZAT.bat (oddiy ikki marta bosish yetadi)
# ============================================================================

$ErrorActionPreference = "Stop"

$yangi = Join-Path $PSScriptRoot "install-server.ps1"
if (-not (Test-Path $yangi)) {
  Write-Host "XATO: install-server.ps1 shu papkada yo'q" -ForegroundColor Red
  Write-Host "Arxivni to'liq ochganingizga ishonch hosil qiling."
  return
}

Write-Host ""
Write-Host "LabCore papkalari qidirilmoqda..." -ForegroundColor Cyan

# Odatda arxiv shu joylarga ochiladi
$joylar = @(
  "C:\",
  "D:\",
  [Environment]::GetFolderPath("Desktop"),
  (Join-Path $env:USERPROFILE "Downloads"),
  (Join-Path $env:USERPROFILE "OneDrive"),
  "C:\LabCore"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$topildi = @()
foreach ($joy in $joylar) {
  Get-ChildItem -Path $joy -Filter "install-server.ps1" -Recurse -Depth 6 -File -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($_.FullName -like "*\deploy\windows\install-server.ps1" -and $_.FullName -ne $yangi) {
        $topildi += $_.FullName
      }
    }
}
$topildi = $topildi | Select-Object -Unique

if ($topildi.Count -eq 0) {
  Write-Host ""
  Write-Host "LabCore papkasi topilmadi." -ForegroundColor Yellow
  Write-Host "Faylni qo'lda ko'chiring. U shu joyda turishi kerak:"
  Write-Host "   ...\LabCore-toliq\server\deploy\windows\install-server.ps1"
  Write-Host ""
  Write-Host "Yangi fayl shu yerda: $yangi"
  return
}

Write-Host ""
foreach ($eski in $topildi) {
  try {
    Copy-Item $yangi $eski -Force
    Write-Host "  OK: $eski" -ForegroundColor Green
  } catch {
    Write-Host "  XATO: $eski" -ForegroundColor Red
    Write-Host "        $($_.Exception.Message)"
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Tuzatish qo'yildi" -ForegroundColor Green
Write-Host "============================================================"
Write-Host " Endi ORNATISH.bat ni O'NG TUGMA bilan bosing va"
Write-Host " 'Run as administrator' ni tanlang."
Write-Host ""
Write-Host " Qayta ishga tushirish xavfsiz: baza bo'lsa saqlab qolinadi."
Write-Host "============================================================"
Write-Host ""
