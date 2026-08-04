# ============================================================================
#  LabCore — Windows serverga o'rnatish
#
#  Ishga tushirish (Administrator sifatida PowerShell):
#     Set-ExecutionPolicy -Scope Process Bypass -Force
#     .\install-server.ps1
#
#  Nima qiladi:
#    1. Node.js va PostgreSQL bor-yo'qligini tekshiradi
#    2. Bazani va foydalanuvchini yaratadi
#    3. .env faylini to'ldiradi (parollar tasodifiy generatsiya qilinadi)
#    4. Sxemani o'rnatadi va boshlang'ich ma'lumotlarni yozadi
#    5. O'z-o'zini imzolagan HTTPS sertifikat yasaydi (telefon uchun kerak)
#    6. Windows brandmauerida portni ochadi
#    7. Kompyuter yoqilganda avtomatik ishga tushishini sozlaydi
# ============================================================================

param(
  [string]$LabName   = "Markaziy laboratoriya",
  [string]$InstallDir = "C:\LabCore",
  [int]   $Port      = 4000,
  [int]   $HttpPort  = 4080,
  [string]$DbUser    = "labcore",
  [string]$DbName    = "labcore"
)

$ErrorActionPreference = "Stop"
function Step($text) { Write-Host "`n>>> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    OK: $text" -ForegroundColor Green }
function Warn($text) { Write-Host "    ! $text" -ForegroundColor Yellow }

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
    ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "PowerShell'ni 'Administrator sifatida ishga tushirish' bilan oching."
}

# ---------------------------------------------------------------------------
Step "1/8  Zarur dasturlarni tekshirish"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js topilmadi. https://nodejs.org (LTS) dan o'rnating va PowerShell'ni qayta oching."
}
$nodeMajor = [int]((node -v) -replace 'v(\d+).*','$1')
if ($nodeMajor -lt 20) { throw "Node.js 20 yoki undan yangi versiya kerak (hozir: $(node -v))." }
Ok "Node.js $(node -v)"

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
           Sort-Object FullName -Descending | Select-Object -First 1
  if (-not $found) {
    throw "PostgreSQL topilmadi. https://www.postgresql.org/download/windows/ dan o'rnating."
  }
  $env:Path += ";" + $found.Directory.FullName
  Ok "PostgreSQL topildi: $($found.Directory.FullName)"
} else {
  Ok "PostgreSQL $(psql --version)"
}

# ---------------------------------------------------------------------------
Step "2/8  Baza va foydalanuvchi"

$dbPassword = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object {[char]$_})
$pgPassword = Read-Host "PostgreSQL 'postgres' foydalanuvchisining paroli" -AsSecureString
$env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pgPassword))

$exists = psql -U postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DbUser'"
if ($exists -ne "1") {
  psql -U postgres -c "CREATE USER $DbUser WITH PASSWORD '$dbPassword';" | Out-Null
  Ok "Foydalanuvchi yaratildi: $DbUser"
} else {
  psql -U postgres -c "ALTER USER $DbUser WITH PASSWORD '$dbPassword';" | Out-Null
  Warn "Foydalanuvchi mavjud edi — paroli yangilandi"
}

$dbExists = psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
if ($dbExists -ne "1") {
  psql -U postgres -c "CREATE DATABASE $DbName OWNER $DbUser;" | Out-Null
  Ok "Baza yaratildi: $DbName"
} else {
  Warn "Baza mavjud edi — saqlab qolindi"
}

# ---------------------------------------------------------------------------
Step "3/8  Fayllarni ko'chirish va sozlash"

$source = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent   # lims/ papkasi
if ($source -ne $InstallDir) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  # node_modules bor bo'lsa u ham ko'chiriladi — internetsiz o'rnatish uchun
  Copy-Item "$source\*" $InstallDir -Recurse -Force -Exclude @("data","backups",".env")
  Ok "Fayllar ko'chirildi: $InstallDir"
}
Set-Location $InstallDir

$dataDir = "$InstallDir\data"
New-Item -ItemType Directory -Force -Path $dataDir, "$InstallDir\backups", "$InstallDir\ssl" | Out-Null

$jwt = -join ((48..57) + (97..102) | Get-Random -Count 96 | ForEach-Object {[char]$_})
@"
DATABASE_URL=postgres://$DbUser`:$dbPassword@127.0.0.1:5432/$DbName
PORT=$Port
HOST=0.0.0.0
NODE_ENV=production
DATA_DIR=$dataDir
JWT_SECRET=$jwt
LAB_NAME=$LabName
CURRENCY=so'm
TZ_NAME=Asia/Tashkent
LABCORE_SSL_CERT=$InstallDir\ssl\labcore.crt
LABCORE_SSL_KEY=$InstallDir\ssl\labcore.key
LABCORE_SSL_REDIRECT_PORT=$HttpPort
BACKUP_KEEP_DAYS=30
"@ | Set-Content "$InstallDir\.env" -Encoding UTF8

# .env faylini faqat administratorlar o'qiy olsin
$acl = Get-Acl "$InstallDir\.env"
$acl.SetAccessRuleProtection($true, $false)
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
  "Administrators","FullControl","Allow")))
$acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
  "SYSTEM","FullControl","Allow")))
Set-Acl "$InstallDir\.env" $acl
Ok ".env yozildi va himoyalandi"

if (Test-Path (Join-Path $InstallDir "node_modules")) {
  Ok "Kutubxonalar to'plam ichida keldi — internet kerak emas"
} else {
  npm ci --omit=dev
  Ok "Kutubxonalar o'rnatildi"
}

# ---------------------------------------------------------------------------
Step "4/8  Sxema va boshlang'ich ma'lumotlar"

npm run migrate
$seed = npm run seed 2>&1 | Out-String
Write-Host $seed
Ok "Baza tayyor"

# ---------------------------------------------------------------------------
Step "5/8  HTTPS sertifikat (telefonga ilova o'rnatish uchun shart)"

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
       Select-Object -First 1).IPAddress
$hostName = $env:COMPUTERNAME.ToLower()

$cert = New-SelfSignedCertificate `
  -DnsName @("$hostName", "$hostName.local", $ip, "localhost") `
  -CertStoreLocation "Cert:\LocalMachine\My" `
  -NotAfter (Get-Date).AddYears(10) `
  -FriendlyName "LabCore LIMS"

# PEM formatiga chiqaramiz (Node shu formatni o'qiydi)
$pfxPass = ConvertTo-SecureString -String "labcore-temp" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "$InstallDir\ssl\labcore.pfx" -Password $pfxPass | Out-Null

if (Get-Command openssl -ErrorAction SilentlyContinue) {
  openssl pkcs12 -in "$InstallDir\ssl\labcore.pfx" -clcerts -nokeys -out "$InstallDir\ssl\labcore.crt" -passin pass:labcore-temp
  openssl pkcs12 -in "$InstallDir\ssl\labcore.pfx" -nocerts -nodes -out "$InstallDir\ssl\labcore.key" -passin pass:labcore-temp
  Ok "Sertifikat tayyor: $InstallDir\ssl\labcore.crt"
} else {
  Warn "openssl topilmadi — sertifikatni qo'lda PEM'ga o'giring yoki HTTPS'ni o'chiring."
  Warn "Vaqtincha HTTP rejimi uchun .env dagi SSL_ satrlarini # bilan izohga oling."
}

# Sertifikatni bu kompyuterda ishonchli deb belgilaymiz
Export-Certificate -Cert $cert -FilePath "$InstallDir\ssl\labcore-ca.cer" | Out-Null
Import-Certificate -FilePath "$InstallDir\ssl\labcore-ca.cer" -CertStoreLocation "Cert:\LocalMachine\Root" | Out-Null
Ok "Sertifikat ishonchlilar ro'yxatiga qo'shildi (telefonlarga labcore-ca.cer ni yuboring)"

# ---------------------------------------------------------------------------
Step "6/8  Brandmauer"

foreach ($p in @($Port, $HttpPort)) {
  if (-not (Get-NetFirewallRule -DisplayName "LabCore $p" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "LabCore $p" -Direction Inbound -Protocol TCP `
      -LocalPort $p -Action Allow -Profile Private,Domain | Out-Null
  }
}
Ok "Portlar ochildi: $Port (HTTPS), $HttpPort (HTTP → yo'naltirish)"

# ---------------------------------------------------------------------------
Step "7/8  Avtomatik ishga tushirish"

$action  = New-ScheduledTaskAction -Execute "node.exe" -Argument "src\index.js" -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "LabCore" -Action $action -Trigger $trigger -Settings $settings `
  -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName "LabCore"
Ok "'LabCore' vazifasi yaratildi va ishga tushirildi"

# Kunlik zaxira
$backupAction = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -File `"$InstallDir\deploy\windows\backup.ps1`"" -WorkingDirectory $InstallDir
$backupTrigger = New-ScheduledTaskTrigger -Daily -At 1:30AM
Register-ScheduledTask -TaskName "LabCore-Backup" -Action $backupAction -Trigger $backupTrigger `
  -User "SYSTEM" -RunLevel Highest -Force | Out-Null
Ok "Kunlik zaxira sozlandi (har kuni 01:30)"

# ---------------------------------------------------------------------------
Step "8/8  Ish stoli yorlig'i"

# Dastur oynasi: brauzer "ilova rejimi"da ochiladi — manzil paneli va
# yorliqlar ko'rinmaydi, oddiy dasturdek bo'ladi.
$browser = $null
foreach ($p in @(
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
)) { if (Test-Path $p) { $browser = $p; break } }

if ($browser) {
  $shell = New-Object -ComObject WScript.Shell
  $desktop = [Environment]::GetFolderPath("CommonDesktopDirectory")
  $lnk = $shell.CreateShortcut((Join-Path $desktop "LabCore.lnk"))
  $lnk.TargetPath = $browser
  $lnk.Arguments = "--app=https://localhost:$Port --window-size=1400,900"
  $lnk.IconLocation = "$InstallDir\deploy\windows\labcore.ico"
  $lnk.WorkingDirectory = $InstallDir
  $lnk.Description = "LabCore — laboratoriya boshqaruv tizimi"
  $lnk.Save()
  Ok "Ish stolida 'LabCore' yorlig'i yaratildi"

  # Telefonni ulash sahifasi uchun ham yorliq
  $lnk2 = $shell.CreateShortcut((Join-Path $desktop "LabCore - telefonga ulash.lnk"))
  $lnk2.TargetPath = $browser
  $lnk2.Arguments = "https://localhost:$Port/telefon"
  $lnk2.IconLocation = "$InstallDir\deploy\windows\labcore.ico"
  $lnk2.Save()
  Ok "'Telefonga ulash' yorlig'i yaratildi (QR kod bilan)"
} else {
  Warn "Edge yoki Chrome topilmadi — brauzerda https://localhost:$Port ni oching"
}

# ---------------------------------------------------------------------------
Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " LabCore o'rnatildi" -ForegroundColor Green
Write-Host "============================================================"
Write-Host " Server manzili   : https://$ip`:$Port"
Write-Host " Ish stansiyalari : shu manzilni brauzerga yoki LabCore dasturiga kiriting"
Write-Host " Ish stoli        : 'LabCore' belgichasini bosing"
Write-Host " Telefon uchun    : 'LabCore - telefonga ulash' belgichasi (QR kod)"
Write-Host "                    yoki https://$ip`:$Port/telefon"
Write-Host " Login/parol      : yuqoridagi 'seed' natijasiga qarang (admin / Admin12345)"
Write-Host ""
Write-Host " DIQQAT: birinchi kirishdayoq parolni almashtiring!" -ForegroundColor Yellow
Write-Host " Zaxira papkasi   : $InstallDir\backups"
Write-Host "============================================================`n"
