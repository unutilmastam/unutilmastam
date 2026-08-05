# ============================================================================
#  LabCore - tuzatishni o'z joyiga qo'yish va serverni qayta ishga tushirish
#
#  Yangi fayllarni kompyuterdagi LabCore papkalariga ko'chiradi:
#    - arxiv ochilgan papka (LabCore-toliq\server)
#    - C:\LabCore (o'rnatilgan nusxa)
#  So'ng serverni qayta ishga tushiradi va ishlayotganini tekshiradi.
#
#  Ishga tushirish: TUZAT.bat
# ============================================================================

$ErrorActionPreference = "Stop"

function Wait-Enter {
  Write-Host ""
  Write-Host "Yopish uchun Enter bosing..." -ForegroundColor DarkGray
  try { Read-Host | Out-Null } catch { }
}

# ---------------------------------------------------------------------------
# Administrator huquqi SHART: .env faylini faqat administratorlar o'qiy oladi
# (tibbiy ma'lumot himoyasi) va vazifani boshqarish ham shu huquqni talab
# qiladi. Huquq bo'lmasa oyna o'zini administrator sifatida qayta ochadi.
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Administrator huquqi so'ralmoqda (Windows tasdiq oynasida 'Ha' bosing)..." -ForegroundColor Yellow
  try {
    Start-Process powershell -Verb RunAs -ArgumentList @(
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`""
    )
    exit
  } catch {
    Write-Host "Administrator huquqi berilmadi - davom etib bo'lmaydi." -ForegroundColor Red
    Wait-Enter
    exit
  }
}

$yangi = Join-Path $PSScriptRoot "yangi"
if (-not (Test-Path $yangi)) {
  Write-Host "XATO: 'yangi' papkasi shu joyda yo'q" -ForegroundColor Red
  Write-Host "Arxivni TO'LIQ ochganingizga ishonch hosil qiling (Extract All)."
  Wait-Enter
  exit
}

Write-Host ""
Write-Host "LabCore papkalari qidirilmoqda..." -ForegroundColor Cyan

$joylar = @(
  "C:\", "D:\",
  [Environment]::GetFolderPath("Desktop"),
  (Join-Path $env:USERPROFILE "Downloads"),
  (Join-Path $env:USERPROFILE "OneDrive")
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique

$maqsadlar = @()
foreach ($joy in $joylar) {
  Get-ChildItem -Path $joy -Filter "index.js" -Recurse -Depth 6 -File -ErrorAction SilentlyContinue |
    ForEach-Object {
      if ($_.FullName -like "*\server\src\index.js") {
        $maqsadlar += (Split-Path (Split-Path $_.FullName -Parent) -Parent)
      }
    }
}
if (Test-Path "C:\LabCore\src\index.js") { $maqsadlar += "C:\LabCore" }
$maqsadlar = $maqsadlar | Select-Object -Unique

if ($maqsadlar.Count -eq 0) {
  Write-Host ""
  Write-Host "LabCore papkasi topilmadi." -ForegroundColor Yellow
  Write-Host "'yangi' papkasidagi src, public, db, deploy, scripts papkalarini"
  Write-Host "qo'lda LabCore-toliq\server ichiga ko'chiring (eskilarini almashtiring)."
  Wait-Enter
  exit
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

# ---------------------------------------------------------------------------
# Fayllar almashtirildi - serverni qayta ishga tushirmasak, eski (ishlamayotgan)
# holat saqlanib qoladi. Shuning uchun buni skriptning o'zi qiladi.
Write-Host ""
Write-Host "Serverni qayta ishga tushiramiz..." -ForegroundColor Cyan

$task = Get-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "  ! 'LabCore' vazifasi topilmadi - ORNATISH.bat ni ishga tushiring" -ForegroundColor Yellow
  Wait-Enter
  exit
}

Stop-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2
Start-ScheduledTask -TaskName "LabCore"

# Sertifikat o'z-o'zini imzolagan - tekshiruvda qabul qilamiz
try {
  Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class LabCoreFixPolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint s, X509Certificate c, WebRequest r, int p) { return true; }
}
"@ -ErrorAction SilentlyContinue
  [System.Net.ServicePointManager]::CertificatePolicy = New-Object LabCoreFixPolicy
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
} catch { }

$port = 4000
$envFile = "C:\LabCore\.env"
if (Test-Path $envFile) {
  $line = Select-String -Path $envFile -Pattern "^PORT=" -ErrorAction SilentlyContinue
  if ($line) { $port = [int]($line.Line -replace "^PORT=","") }
}

$scheme = $null
for ($i = 1; $i -le 25; $i++) {
  foreach ($s in @("https", "http")) {
    try {
      $r = Invoke-RestMethod -Uri "$s`://localhost`:$port/api/health" -TimeoutSec 3
      if ($r.ok) { $scheme = $s; break }
    } catch { }
  }
  if ($scheme) { break }
  Start-Sleep -Seconds 1
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
if ($scheme) {
  Write-Host " Server ishlayapti" -ForegroundColor Green
  Write-Host "============================================================"
  Write-Host ""
  Write-Host " DASTURGA SHU MANZILNI YOZING:" -ForegroundColor Yellow
  Write-Host "   $scheme`://localhost`:$port" -ForegroundColor Cyan
  Write-Host ""
  Write-Host " Boshqa kompyuterlar uchun manzilni TEKSHIR.bat ko'rsatadi."
} else {
  Write-Host " Server hali javob bermayapti" -ForegroundColor Yellow
  Write-Host "============================================================"
  $log = "C:\LabCore\logs\server.log"
  if (Test-Path $log) {
    Write-Host ""
    Write-Host " Jurnaldagi oxirgi satrlar:" -ForegroundColor Yellow
    Get-Content $log -Tail 20 | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkYellow }
  }
  Write-Host ""
  Write-Host " Batafsil ko'rish uchun TEKSHIR.bat ni ishga tushiring."
}
Write-Host "============================================================"

Wait-Enter
