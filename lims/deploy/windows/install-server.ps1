# ============================================================================
#  LabCore - Windows serverga o'rnatish
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
  [string]$DbName    = "labcore",
  # Kompyuter yoqilganda LabCore oynasi o'zi ochilishi (o'chirish uchun -NoAutoStart)
  [switch]$NoAutoStart
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
  throw @"
Node.js topilmadi.

Internet bo'lgan kompyuterda (yoki telefonda) shu faylni yuklab oling:
   https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi
Fleshka orqali shu kompyuterga o'tkazing, o'rnating (Next-Next-Install),
kompyuterni qayta yoqing va ORNATISH.bat ni yana ishga tushiring.
"@
}
$nodeMajor = [int]((node -v) -replace 'v(\d+).*','$1')
if ($nodeMajor -lt 20) { throw "Node.js 20 yoki undan yangi versiya kerak (hozir: $(node -v))." }
Ok "Node.js $(node -v)"

$psql = Get-Command psql -ErrorAction SilentlyContinue
if (-not $psql) {
  # Eng yangi o'rnatilgan versiyani olamiz. Papka nomlari raqam bo'lgani uchun
  # matn bo'yicha saralash noto'g'ri ishlaydi ("9.6" > "18"), shuning uchun songa o'giramiz.
  $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
           Sort-Object { [double]($_.Directory.Parent.Name) } -Descending | Select-Object -First 1
  if (-not $found) {
    throw @"
PostgreSQL topilmadi.

Internet bo'lgan kompyuterda (yoki telefonda) yuklab oling:
   https://www.postgresql.org/download/windows/  ("Download the installer")
Fleshka orqali o'tkazing va o'rnating. O'rnatishda 'postgres' foydalanuvchisiga
parol so'raydi - SHU PAROLNI YOZIB QO'YING, bu skript shuni so'raydi.
Oxirida "Stack Builder" oynasi chiqsa - "Cancel" (ruscha "Otmena") bosing:
u qo'shimcha dasturlarni internetdan yuklaydi, LabCore uchun kerak emas.
"@
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
  Warn "Foydalanuvchi mavjud edi - paroli yangilandi"
}

$dbExists = psql -U postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$DbName'"
if ($dbExists -ne "1") {
  psql -U postgres -c "CREATE DATABASE $DbName OWNER $DbUser;" | Out-Null
  Ok "Baza yaratildi: $DbName"
} else {
  Warn "Baza mavjud edi - saqlab qolindi"
}

# ---------------------------------------------------------------------------
Step "3/8  Fayllarni ko'chirish va sozlash"

$source = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent   # lims/ papkasi
if ($source -ne $InstallDir) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  # node_modules bor bo'lsa u ham ko'chiriladi - internetsiz o'rnatish uchun
  Copy-Item "$source\*" $InstallDir -Recurse -Force -Exclude @("data","backups",".env")
  Ok "Fayllar ko'chirildi: $InstallDir"
}
Set-Location $InstallDir

$dataDir = "$InstallDir\data"
New-Item -ItemType Directory -Force -Path $dataDir, "$InstallDir\backups", "$InstallDir\ssl" | Out-Null

$jwt = -join ((48..57) + (97..102) | Get-Random -Count 96 | ForEach-Object {[char]$_})
# Sertifikat paroli 5/8-qadamda ishlatiladi, lekin .env shu yerda yozilgani
# uchun oldindan yasaymiz.
$certPass = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 20 | ForEach-Object {[char]$_})
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
LABCORE_SSL_PFX=$InstallDir\ssl\labcore.pfx
LABCORE_SSL_PFX_PASSWORD=$certPass
LABCORE_SSL_REDIRECT_PORT=$HttpPort
BACKUP_KEEP_DAYS=30
"@ | Set-Content "$InstallDir\.env" -Encoding UTF8

# .env faylini faqat administratorlar o'qiy olsin.
#
# DIQQAT: bu yerda "Administrators" va "SYSTEM" kabi INGLIZCHA nomlar
# ishlatilmaydi. Ruscha yoki boshqa tildagi Windows'da bu nomlar boshqacha
# ("Administratory", "SISTEMA" deb tarjima qilingan) va skript
#   "Some or all identity references could not be translated"
# xatosi bilan to'xtab qolardi. Shuning uchun har qanday tilda bir xil
# bo'ladigan SID'lar ishlatiladi:
#   S-1-5-32-544 - BUILTIN\Administrators
#   S-1-5-18     - LOCAL SYSTEM
try {
  $adminSid  = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
  $systemSid = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")

  $acl = Get-Acl "$InstallDir\.env"
  $acl.SetAccessRuleProtection($true, $false)
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    $adminSid,"FullControl","Allow")))
  $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule(
    $systemSid,"FullControl","Allow")))
  Set-Acl "$InstallDir\.env" $acl
  Ok ".env yozildi va himoyalandi"
} catch {
  # Huquqlarni qo'ya olmasak ham o'rnatish to'xtamasin: fayl baribir
  # C:\LabCore ichida va oddiy foydalanuvchi u yerga yoza olmaydi.
  Warn ".env yozildi, lekin huquqlarni cheklab bo'lmadi: $($_.Exception.Message)"
  Warn "Kerak bo'lsa qo'lda: fayl xossalari -> Security -> faqat Administrators va SYSTEM"
}

if (Test-Path (Join-Path $InstallDir "node_modules")) {
  Ok "Kutubxonalar to'plam ichida keldi - internet kerak emas"
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

# Laboratoriya tarmog'idagi manzilni topamiz. Kompyuterda VirtualBox, WSL
# yoki VPN adapterlari ham bo'lishi mumkin - shuning uchun ishlab turgan
# adapterlar orasidan odatdagi uy/ofis tarmog'i manzillari oldinga qo'yiladi.
$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object {
         $_.IPAddress -notlike "127.*" -and
         $_.IPAddress -notlike "169.254.*" -and
         $_.PrefixOrigin -ne "WellKnown" -and
         (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq "Up"
       } |
       Sort-Object -Property @{ Expression = {
         if     ($_.IPAddress -like "192.168.*") { 0 }
         elseif ($_.IPAddress -like "10.*")      { 1 }
         elseif ($_.IPAddress -like "172.*")     { 2 }
         else                                    { 3 }
       } } |
       Select-Object -First 1).IPAddress

if (-not $ip) {
  Warn "Tarmoq manzili topilmadi - localhost ishlatiladi (faqat shu kompyuterda ochiladi)"
  $ip = "localhost"
}
$hostName = $env:COMPUTERNAME.ToLower()

$cert = New-SelfSignedCertificate `
  -DnsName @("$hostName", "$hostName.local", $ip, "localhost") `
  -CertStoreLocation "Cert:\LocalMachine\My" `
  -NotAfter (Get-Date).AddYears(10) `
  -FriendlyName "LabCore LIMS"

# Sertifikatni PFX ko'rinishida saqlaymiz. Node PFX'ni to'g'ridan-to'g'ri
# o'qiy oladi, shuning uchun openssl KERAK EMAS (Windows'da u ko'pincha yo'q).
# Parol .env ga 3/8-qadamda yozilgan.
$pfxPass = ConvertTo-SecureString -String $certPass -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "$InstallDir\ssl\labcore.pfx" -Password $pfxPass | Out-Null
Ok "Sertifikat tayyor: $InstallDir\ssl\labcore.pfx"

# openssl bo'lsa PEM nusxasini ham yasaymiz (boshqa dasturlar uchun qulay).
if (Get-Command openssl -ErrorAction SilentlyContinue) {
  openssl pkcs12 -in "$InstallDir\ssl\labcore.pfx" -clcerts -nokeys -out "$InstallDir\ssl\labcore.crt" -passin "pass:$certPass" 2>$null
  openssl pkcs12 -in "$InstallDir\ssl\labcore.pfx" -nocerts -nodes -out "$InstallDir\ssl\labcore.key" -passin "pass:$certPass" 2>$null
  if (Test-Path "$InstallDir\ssl\labcore.key") { Ok "PEM nusxasi ham yasaldi" }
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
Ok "Portlar ochildi: $Port (HTTPS), $HttpPort (HTTP -> yo'naltirish)"

# ---------------------------------------------------------------------------
Step "7/8  Avtomatik ishga tushirish"

# Vazifa SYSTEM nomidan ishlaydi. "SYSTEM" so'zi ham tilga bog'liq bo'lgani
# uchun SID'dan shu kompyuterdagi haqiqiy nomga o'giriladi.
$systemAccount = (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
  ).Translate([System.Security.Principal.NTAccount]).Value

# node.exe ni to'liq manzili bilan yozamiz: SYSTEM hisobining PATH'i
# foydalanuvchinikidan boshqacha bo'lishi mumkin.
$nodeExe = (Get-Command node).Source

$action  = New-ScheduledTaskAction -Execute $nodeExe -Argument "src\index.js" -WorkingDirectory $InstallDir
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
            -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName "LabCore" -Action $action -Trigger $trigger -Settings $settings `
  -User $systemAccount -RunLevel Highest -Force | Out-Null
Start-ScheduledTask -TaskName "LabCore"
Ok "'LabCore' vazifasi yaratildi va ishga tushirildi"

# Kunlik zaxira
$backupAction = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -File `"$InstallDir\deploy\windows\backup.ps1`"" -WorkingDirectory $InstallDir
$backupTrigger = New-ScheduledTaskTrigger -Daily -At 1:30AM
Register-ScheduledTask -TaskName "LabCore-Backup" -Action $backupAction -Trigger $backupTrigger `
  -User $systemAccount -RunLevel Highest -Force | Out-Null
Ok "Kunlik zaxira sozlandi (har kuni 01:30)"

# ---------------------------------------------------------------------------
Step "8/8  Ish stoli yorlig'i"

# Dastur oynasi: brauzer "ilova rejimi"da ochiladi - manzil paneli va
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
  $lnk.Description = "LabCore - laboratoriya boshqaruv tizimi"
  $lnk.Save()
  Ok "Ish stolida 'LabCore' yorlig'i yaratildi"

  # Telefonni ulash sahifasi uchun ham yorliq
  $lnk2 = $shell.CreateShortcut((Join-Path $desktop "LabCore - telefonga ulash.lnk"))
  $lnk2.TargetPath = $browser
  $lnk2.Arguments = "https://localhost:$Port/telefon"
  $lnk2.IconLocation = "$InstallDir\deploy\windows\labcore.ico"
  $lnk2.Save()
  Ok "'Telefonga ulash' yorlig'i yaratildi (QR kod bilan)"

  # Kompyuter yoqilganda LabCore oynasi o'zi ochilsin.
  # Yozuv shu foydalanuvchining ro'yxatiga tushadi; o'chirish uchun
  # .\avtozapusk.ps1 -Off yoki Task Manager -> Startup.
  if (-not $NoAutoStart) {
    $runKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
    if (-not (Test-Path $runKey)) { New-Item -Path $runKey -Force | Out-Null }
    Set-ItemProperty -Path $runKey -Name "LabCore" `
      -Value "`"$browser`" --app=https://localhost:$Port --window-size=1400,900"
    Ok "Kompyuter yoqilganda LabCore o'zi ochiladi (o'chirish: avtozapusk.ps1 -Off)"
  }
} else {
  Warn "Edge yoki Chrome topilmadi - brauzerda https://localhost:$Port ni oching"
}

# ---------------------------------------------------------------------------
Write-Host "`n============================================================" -ForegroundColor Green
Write-Host " LabCore o'rnatildi" -ForegroundColor Green
Write-Host "============================================================"
Write-Host " Server manzili   : https://$ip`:$Port" -ForegroundColor Cyan
Write-Host "   ^-- SHU MANZILNI YOZIB OLING"
Write-Host " Ish stansiyalari : LabCore-DASTUR.exe ochilganda ayni shu manzilni kiriting"
Write-Host " Shu kompyuterda  : https://localhost`:$Port ham ishlaydi"
Write-Host " Ish stoli        : 'LabCore' belgichasini bosing"
Write-Host " Avtozapusk       : kompyuter yoqilganda LabCore o'zi ochiladi"
Write-Host " Telefon uchun    : 'LabCore - telefonga ulash' belgichasi (QR kod)"
Write-Host "                    yoki https://$ip`:$Port/telefon"
Write-Host " Login/parol      : yuqoridagi 'seed' natijasiga qarang (admin / Admin12345)"
Write-Host ""
Write-Host " DIQQAT: birinchi kirishdayoq parolni almashtiring!" -ForegroundColor Yellow
Write-Host " Zaxira papkasi   : $InstallDir\backups"
Write-Host "============================================================`n"
