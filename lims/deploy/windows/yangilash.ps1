# ============================================================================
#  LabCore - o'rnatilgan tizimni yangilash
#
#  Serverdagi dastur fayllarini yangi nashr bilan almashtiradi va bazani
#  yangilaydi. Bemor ma'lumotlari, fayllar va sozlamalar (.env) tegilmaydi.
#
#  Ishga tushirish (Administrator sifatida PowerShell):
#     Set-ExecutionPolicy -Scope Process Bypass -Force
#     .\yangilash.ps1
#
#  Nima qiladi:
#    1. Zaxira nusxa oladi (baza + eski fayllar)
#    2. Serverni to'xtatadi
#    3. Yangi fayllarni ko'chiradi (.env va data papkasi saqlanadi)
#    4. Bazaga yangi ustunlarni qo'shadi (migrate - eski ma'lumot yo'qolmaydi)
#    5. Serverni qayta ishga tushiradi va holatini ko'rsatadi
# ============================================================================

param(
  [string]$InstallDir = "C:\LabCore",
  [string]$SourceDir  = ""
)

$ErrorActionPreference = "Stop"
function Step($text) { Write-Host "`n>>> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    OK: $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    ! $text" -ForegroundColor Yellow }

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "PowerShell'ni 'Administrator sifatida ishga tushirish' bilan oching."
}

if (-not $SourceDir) { $SourceDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path }
if (-not (Test-Path (Join-Path $SourceDir "src\index.js"))) {
  throw "Yangi fayllar topilmadi: $SourceDir (server papkasi ichidan ishga tushiring)"
}
if (-not (Test-Path $InstallDir)) {
  throw "LabCore o'rnatilmagan: $InstallDir. Avval ORNATISH.bat ni ishlating."
}

# ---------------------------------------------------------------------------
Step "1/5  Zaxira nusxa"

$stamp = Get-Date -Format "yyyy-MM-dd_HHmm"
$safe  = Join-Path $InstallDir "backups\yangilashdan-oldin_$stamp"
New-Item -ItemType Directory -Force -Path $safe | Out-Null

foreach ($d in @("src", "public", "db", "scripts")) {
  $from = Join-Path $InstallDir $d
  if (Test-Path $from) { Copy-Item $from -Destination $safe -Recurse -Force }
}
Ok "Eski fayllar saqlandi: $safe"

$backupScript = Join-Path $InstallDir "deploy\windows\backup.ps1"
if (Test-Path $backupScript) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File $backupScript
  Ok "Baza zaxirasi olindi"
} else {
  Warn "backup.ps1 topilmadi - baza zaxirasi olinmadi"
}

# ---------------------------------------------------------------------------
Step "2/5  Serverni to'xtatish"

$task = Get-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue
  Ok "Vazifa to'xtatildi"
} else {
  Warn "'LabCore' vazifasi topilmadi"
}
Get-Process node -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -and $_.Path -like "$InstallDir*" } |
  Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# ---------------------------------------------------------------------------
Step "3/5  Yangi fayllar"

# .env, data va node_modules tegilmaydi: sozlamalar va bemor fayllari o'z joyida qoladi.
foreach ($d in @("src", "public", "db", "scripts", "deploy", "docs", "tests")) {
  $from = Join-Path $SourceDir $d
  if (-not (Test-Path $from)) { continue }
  $to = Join-Path $InstallDir $d
  if (Test-Path $to) { Remove-Item $to -Recurse -Force }
  Copy-Item $from -Destination $to -Recurse -Force
}
foreach ($f in @("package.json", "package-lock.json", "README.md")) {
  $from = Join-Path $SourceDir $f
  if (Test-Path $from) { Copy-Item $from -Destination (Join-Path $InstallDir $f) -Force }
}
Ok "Fayllar yangilandi"

# Yangi kutubxona qo'shilgan bo'lsa o'rnatamiz (odatda kerak emas).
Push-Location $InstallDir
if (Test-Path (Join-Path $SourceDir "node_modules")) {
  Copy-Item (Join-Path $SourceDir "node_modules") -Destination $InstallDir -Recurse -Force
  Ok "Kutubxonalar to'plam ichida keldi"
} else {
  try {
    & npm install --omit=dev --no-audit --no-fund 2>&1 | Out-Null
    Ok "Kutubxonalar tekshirildi"
  } catch {
    Warn "npm install o'tmadi - internet yo'q bo'lsa normal, eski kutubxonalar ishlatiladi"
  }
}

# ---------------------------------------------------------------------------
Step "4/5  Bazani yangilash"

# migrate faqat yangi ustun/jadval qo'shadi; mavjud ma'lumot o'zgarmaydi.
& npm run migrate
if ($LASTEXITCODE -ne 0) {
  Pop-Location
  throw "Bazani yangilab bo'lmadi. Zaxira shu yerda: $safe"
}
Ok "Baza yangilandi"
Pop-Location

# ---------------------------------------------------------------------------
Step "5/5  Serverni ishga tushirish"

if ($task) {
  Start-ScheduledTask -TaskName "LabCore"
  Start-Sleep -Seconds 5
  Ok "Vazifa qayta ishga tushirildi"
} else {
  Warn "Vazifa yo'q - serverni qo'lda ishga tushiring: start-labcore.bat"
}

$statusScript = Join-Path $InstallDir "deploy\windows\status.ps1"
if (Test-Path $statusScript) { & powershell -NoProfile -ExecutionPolicy Bypass -File $statusScript }

Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " Yangilandi" -ForegroundColor Green
Write-Host "============================================================"
Write-Host " Yangi imkoniyatlar:"
Write-Host "   - Xodim rasmi     : Xodimlar -> 'Rasm'"
Write-Host "   - PIN kod         : Xodimlar -> 'PIN qo''yish'"
Write-Host "   - Avtozapusk      : avtozapusk.ps1  yoki dastur menyusi"
Write-Host ""
Write-Host " Zaxira (kerak bo'lsa qaytarish uchun): $safe"
Write-Host "============================================================`n"
