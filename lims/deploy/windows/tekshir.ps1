# ============================================================================
#  LabCore - "nima uchun ulanmayapti?" tekshiruvi
#
#  Server ishlayaptimi, qaysi portda va qaysi manzilda ochiladi - hammasini
#  bir joyda ko'rsatadi va DASTURGA YOZILADIGAN MANZILNI aytadi.
#
#  Ishga tushirish: TEKSHIR.bat (o'ng tugma -> Run as administrator)
# ============================================================================

param([string]$InstallDir = "C:\LabCore")

$ErrorActionPreference = "Continue"

# Oyna darrov yopilib ketmasin: .bat dagi "pause" ba'zan o'tkazib yuboriladi
# (masalan skript "Run with PowerShell" bilan to'g'ridan-to'g'ri ochilganda).
function Wait-Enter {
  Write-Host ""
  Write-Host "Yopish uchun Enter bosing..." -ForegroundColor DarkGray
  try { Read-Host | Out-Null } catch { }
}
function Head($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }
function Ok($t)   { Write-Host "  OK: $t" -ForegroundColor Green }
function Bad($t)  { Write-Host "  XATO: $t" -ForegroundColor Red }
function Note($t) { Write-Host "  $t" }

# ---------------------------------------------------------------------------
Head "1. Dastur fayllari"

if (Test-Path "$InstallDir\src\index.js") { Ok "$InstallDir topildi" }
else { Bad "$InstallDir ichida tizim yo'q. ORNATISH.bat ishga tushirilganmi?"; }

$envFile = "$InstallDir\.env"
$port = 4000
if (Test-Path $envFile) {
  Ok ".env bor"
  $portLine = Select-String -Path $envFile -Pattern "^PORT=" -ErrorAction SilentlyContinue
  if ($portLine) { $port = [int]($portLine.Line -replace "^PORT=","") }
  $pfx = Select-String -Path $envFile -Pattern "^LABCORE_SSL_PFX=" -ErrorAction SilentlyContinue
  $crt = Select-String -Path $envFile -Pattern "^LABCORE_SSL_CERT=" -ErrorAction SilentlyContinue
  if ($pfx) {
    $pfxPath = ($pfx.Line -replace "^LABCORE_SSL_PFX=","").Trim()
    if (Test-Path $pfxPath) { Ok "HTTPS sertifikat bor (PFX)" }
    else { Bad "Sertifikat fayli yo'q: $pfxPath  -> server HTTP rejimida ishlaydi" }
  } elseif ($crt) {
    $crtPath = ($crt.Line -replace "^LABCORE_SSL_CERT=","").Trim()
    if (Test-Path $crtPath) { Ok "HTTPS sertifikat bor (PEM)" }
    else { Bad "Sertifikat fayli yo'q: $crtPath  -> server HTTP rejimida ishlaydi" }
  } else {
    Note "Sertifikat sozlanmagan - server HTTP rejimida ishlaydi"
  }
} else {
  Bad ".env topilmadi"
}

# ---------------------------------------------------------------------------
Head "2. Server ishlayaptimi"

$task = Get-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue
if ($task) { Note "Vazifa holati: $($task.State)" } else { Bad "'LabCore' vazifasi yo'q" }

$listen = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  Ok "$port port ochiq (tinglayapti)"
} else {
  Bad "$port portda hech kim tinglamayapti - server ishlamayapti"
}

# ---------------------------------------------------------------------------
Head "3. Serverga so'rov"

# O'z-o'zini imzolagan sertifikatni qabul qilamiz
try {
  Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class LabCoreCertPolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint sp, X509Certificate c, WebRequest r, int p) { return true; }
}
"@ -ErrorAction SilentlyContinue
  [System.Net.ServicePointManager]::CertificatePolicy = New-Object LabCoreCertPolicy
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
} catch { }

$ishlaydi = $null
foreach ($scheme in @("https", "http")) {
  $url = "$scheme`://localhost`:$port/api/health"
  try {
    $r = Invoke-RestMethod -Uri $url -TimeoutSec 5
    if ($r.ok) {
      Ok "$scheme ishlayapti - laboratoriya: $($r.lab), baza: $($r.db)"
      $ishlaydi = $scheme
      break
    }
  } catch {
    Note "$scheme javob bermadi"
  }
}

# ---------------------------------------------------------------------------
Head "4. Shu kompyuterning tarmoq manzillari"

$addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
         Where-Object { $_.IPAddress -notlike "169.254.*" }
foreach ($a in $addrs) {
  $ad = Get-NetAdapter -InterfaceIndex $a.InterfaceIndex -ErrorAction SilentlyContinue
  Note ("{0,-16} {1}" -f $a.IPAddress, $(if ($ad) { "$($ad.Name) [$($ad.Status)]" } else { "" }))
}

# ---------------------------------------------------------------------------
Head "NATIJA"

if (-not $ishlaydi) {
  Write-Host ""
  Bad "Server ishlamayapti. Sababini o'zimiz qidiramiz."

  # 1) Vazifa yozib qoldirgan jurnal
  $log = Join-Path $InstallDir "logs\server.log"
  if (Test-Path $log) {
    $satrlar = Get-Content $log -Tail 25 -ErrorAction SilentlyContinue
    if ($satrlar) {
      Head "5. Jurnaldagi oxirgi satrlar"
      $satrlar | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkYellow }
    }
  }

  # 2) Serverni shu yerda ishga tushirib, xatoni o'z ko'zimiz bilan ko'ramiz.
  #    Vazifa sifatida ishlaganda ekran bo'lmaydi - xato ko'rinmay qoladi.
  Head "6. Serverni sinab ishga tushiramiz"
  if (-not (Test-Path "$InstallDir\src\index.js")) {
    Bad "$InstallDir\src\index.js topilmadi"
  } else {
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) {
      Bad "node.exe topilmadi - Node.js o'rnatilmagan yoki PATH'da yo'q"
    } else {
      $out = Join-Path $env:TEMP "labcore-sinov-out.log"
      $err = Join-Path $env:TEMP "labcore-sinov-err.log"
      $p = Start-Process -FilePath $node -ArgumentList "src\index.js" `
             -WorkingDirectory $InstallDir -PassThru -NoNewWindow `
             -RedirectStandardOutput $out -RedirectStandardError $err
      Start-Sleep -Seconds 8
      if (-not $p.HasExited) { $p.Kill(); Note "(server ishga tushdi va 8 soniyadan keyin to'xtatildi)" }

      foreach ($f in @($out, $err)) {
        if (Test-Path $f) {
          $t = Get-Content $f -ErrorAction SilentlyContinue
          if ($t) { $t | ForEach-Object { Write-Host "   $_" -ForegroundColor Yellow } }
          Remove-Item $f -Force -ErrorAction SilentlyContinue
        }
      }
    }
  }

  Write-Host ""
  Write-Host " Yuqoridagi sariq satrlarni menga yuboring - sabab o'sha yerda." -ForegroundColor Yellow
  Write-Host ""
  Wait-Enter
  exit
}

# Ishlayotgan bo'lsa - qaysi manzilni yozish kerakligini aytamiz
$lan = ($addrs | Where-Object {
          $_.IPAddress -notlike "127.*" -and
          (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq "Up"
        } |
        Sort-Object -Property @{ Expression = {
          if     ($_.IPAddress -like "192.168.*") { 0 }
          elseif ($_.IPAddress -like "10.*")      { 1 }
          elseif ($_.IPAddress -like "172.*")     { 2 }
          else                                    { 3 }
        } } | Select-Object -First 1).IPAddress

Write-Host ""
Write-Host " Server ishlayapti." -ForegroundColor Green
Write-Host ""
Write-Host " DASTURGA SHU MANZILNI YOZING:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   Shu kompyuterda      : $ishlaydi`://localhost`:$port" -ForegroundColor Cyan
if ($lan) {
  Write-Host "   Boshqa kompyuterlarda: $ishlaydi`://$lan`:$port" -ForegroundColor Cyan
}
Write-Host ""
if ($ishlaydi -eq "http") {
  Write-Host " DIQQAT: manzil 'https' emas, 'http' bilan boshlanadi!" -ForegroundColor Yellow
  Write-Host " Sertifikat yasalmagani uchun server HTTPS'siz ishlayapti."
  Write-Host " Telefonga ilova o'rnatish uchun HTTPS kerak - buni keyin sozlaymiz."
  Write-Host ""
}

Wait-Enter
