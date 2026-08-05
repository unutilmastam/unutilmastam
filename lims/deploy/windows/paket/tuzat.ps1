# ============================================================================
#  LabCore - tuzatishni o'z joyiga qo'yish
#
#  Yangi fayllarni kompyuterdagi LabCore papkalariga ko'chiradi:
#    - arxiv ochilgan papka (LabCore-toliq\server) - qayta o'rnatish uchun
#    - C:\LabCore                                  - allaqachon o'rnatilgan bo'lsa
#
#  Qo'lda papka qidirish shart emas.
#  Ishga tushirish: TUZAT.bat
# ============================================================================

$ErrorActionPreference = "Stop"

$yangi = Join-Path $PSScriptRoot "yangi"
if (-not (Test-Path $yangi)) {
  Write-Host "XATO: 'yangi' papkasi shu joyda yo'q" -ForegroundColor Red
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
  (Join-Path $env:USERPROFILE "OneDrive")
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$maqsadlar = @()

# 1) Arxiv ochilgan papkalar: ...\server\src\index.js bo'yicha topamiz
foreach ($joy in $joylar) {
  Get-ChildItem -Path $joy -Filter "index.js" -Recurse -Depth 6 -File -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($_.FullName -like "*\server\src\index.js") {
        $maqsadlar += (Split-Path (Split-Path $_.FullName -Parent) -Parent)
      }
    }
}

# 2) O'rnatilgan nusxa
if (Test-Path "C:\LabCore\src\index.js") { $maqsadlar += "C:\LabCore" }

$maqsadlar = $maqsadlar | Select-Object -Unique
if ($maqsadlar.Count -eq 0) {
  Write-Host ""
  Write-Host "LabCore papkasi topilmadi." -ForegroundColor Yellow
  Write-Host "'yangi' papkasidagi src, public, db, deploy, scripts papkalarini"
  Write-Host "qo'lda LabCore-toliq\server ichiga ko'chiring (eskilarini almashtiring)."
  return
}

Write-Host ""
foreach ($m in $maqsadlar) {
  Write-Host "  $m" -ForegroundColor White
  foreach ($d in @("src", "public", "db", "scripts", "deploy", "docs")) {
    $from = Join-Path $yangi $d
    if (-not (Test-Path $from)) { continue }
    try {
      $to = Join-Path $m $d
      if (Test-Path $to) { Remove-Item $to -Recurse -Force }
      Copy-Item $from -Destination $to -Recurse -Force
      Write-Host "    OK: $d" -ForegroundColor Green
    } catch {
      Write-Host "    XATO: $d - $($_.Exception.Message)" -ForegroundColor Red
    }
  }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host " Tuzatish qo'yildi" -ForegroundColor Green
Write-Host "============================================================"
Write-Host " Endi LabCore-toliq papkangizdagi ORNATISH.bat ni"
Write-Host " O'NG TUGMA bilan bosing -> 'Run as administrator'."
Write-Host ""
Write-Host " Qayta ishga tushirish xavfsiz: baza saqlab qolinadi."
Write-Host ""
Write-Host " O'rnatishdan keyin ham ulanmasa - TEKSHIR.bat ni ishlating,"
Write-Host " u qaysi manzilni yozish kerakligini aniq aytadi."
Write-Host "============================================================"
Write-Host ""
