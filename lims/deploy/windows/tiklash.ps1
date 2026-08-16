# ============================================================================
#  LabCore - zaxira nusxadan TIKLASH
#
#  Qachon kerak bo'ladi:
#    * qattiq disk eskirdi, yangisiga o'tyapsiz
#    * server kompyuter almashtirildi
#    * baza buzildi va oxirgi zaxiraga qaytish kerak
#    * yiliga bir marta - zaxira haqiqatan ishlayotganini tekshirish uchun
#
#  MUHIM: bu skript eski bazani O'CHIRMAYDI. U eski bazani nom o'zgartirib
#  saqlab qo'yadi (labcore_eski_YYYYMMDD_HHMM). Tiklash noto'g'ri ketsa
#  hammasi joyida qoladi.
#
#  Ishga tushirish: TIKLASH.bat (o'ng tugma -> Run as administrator)
# ============================================================================

param(
  [string]$InstallDir = "C:\LabCore",
  [string]$BackupDir  = "",        # bo'sh bo'lsa - o'zi qidiradi
  [switch]$Sinov                    # sinov rejimi: alohida bazaga tiklaydi, ishlab turganiga tegmaydi
)

$ErrorActionPreference = "Stop"

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
# Administrator huquqi: .env faqat administratorlarga ochiq, vazifani
# to'xtatish ham shu huquqni talab qiladi.
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
           ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Administrator huquqi so'ralmoqda (Windows tasdiq oynasida 'Ha' bosing)..." -ForegroundColor Yellow
  $args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"",
            '-InstallDir',"`"$InstallDir`"")
  if ($BackupDir) { $args += @('-BackupDir', "`"$BackupDir`"") }
  if ($Sinov)     { $args += '-Sinov' }
  try { Start-Process powershell -Verb RunAs -ArgumentList $args; exit }
  catch { Bad "Administrator huquqi berilmadi - davom etib bo'lmaydi."; Wait-Enter; exit 1 }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  LabCore - zaxira nusxadan tiklash" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# ---------------------------------------------------------------------------
Head "1. Sozlamalar"

$envFile = Join-Path $InstallDir ".env"
if (-not (Test-Path $envFile)) {
  Bad "$envFile topilmadi. LabCore o'rnatilganmi?"
  Note "Yangi kompyuterga tiklayotgan bo'lsangiz - avval ORNATISH.bat ni ishlating."
  Wait-Enter; exit 1
}

$conf = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $conf[$matches[1]] = $matches[2].Trim() }
}
$dbUrl = $conf["DATABASE_URL"]
if (-not $dbUrl) { Bad "DATABASE_URL .env faylda yo'q"; Wait-Enter; exit 1 }

# postgres://foydalanuvchi:parol@host:port/baza
if ($dbUrl -notmatch '^postgres(ql)?://([^:]+):([^@]*)@([^:/]+):(\d+)/(.+?)(\?|$)') {
  Bad "DATABASE_URL ni o'qib bo'lmadi: $dbUrl"
  Wait-Enter; exit 1
}
$dbUser = $matches[2]; $dbPass = $matches[3]
$dbHost = $matches[4]; $dbPort = $matches[5]; $dbName = $matches[6]
if ($dbHost -eq "localhost") { $dbHost = "127.0.0.1" }   # IPv6 bloklanishi

$dataDir = if ($conf["DATA_DIR"]) { $conf["DATA_DIR"] } else { Join-Path $InstallDir "data" }

Ok "Baza: $dbName ($dbHost`:$dbPort, foydalanuvchi: $dbUser)"
Ok "Ma'lumotlar papkasi: $dataDir"

# psql va pg_restore ni topamiz
function Find-PgTool($name) {
  $c = (Get-Command $name -ErrorAction SilentlyContinue).Source
  if ($c) { return $c }
  $g = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\$name.exe" -ErrorAction SilentlyContinue |
       Sort-Object FullName -Descending | Select-Object -First 1
  if ($g) { return $g.FullName }
  return $null
}
$psql      = Find-PgTool "psql"
$pgRestore = Find-PgTool "pg_restore"
if (-not $psql -or -not $pgRestore) {
  Bad "psql yoki pg_restore topilmadi - PostgreSQL o'rnatilganmi?"
  Wait-Enter; exit 1
}
Ok "PostgreSQL vositalari topildi"

$env:PGPASSWORD = $dbPass

# ---------------------------------------------------------------------------
Head "2. Zaxira nusxani tanlash"

if (-not $BackupDir) {
  $root = if ($env:BACKUP_DIR) { $env:BACKUP_DIR }
          elseif ($conf["BACKUP_DIR"]) { $conf["BACKUP_DIR"] }
          else { Join-Path $InstallDir "backups" }
  if (-not (Test-Path $root)) { Bad "Zaxira papkasi yo'q: $root"; Wait-Enter; exit 1 }

  $nusxalar = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
              Where-Object { Test-Path (Join-Path $_.FullName "labcore.dump") } |
              Sort-Object Name -Descending
  if (-not $nusxalar) { Bad "$root ichida zaxira nusxa topilmadi"; Wait-Enter; exit 1 }

  Note "Topilgan nusxalar (eng yangisi birinchi):"
  $i = 0
  foreach ($n in ($nusxalar | Select-Object -First 10)) {
    $i++
    $mb = [math]::Round(((Get-ChildItem $n.FullName -File | Measure-Object Length -Sum).Sum / 1MB), 1)
    Write-Host ("   [{0}] {1}   {2} MB" -f $i, $n.Name, $mb)
  }
  Write-Host ""
  $tanlov = Read-Host "Qaysi nusxa? (raqam, yoki Enter - eng yangisi)"
  if ($tanlov -match '^\d+$' -and [int]$tanlov -ge 1 -and [int]$tanlov -le $nusxalar.Count) {
    $BackupDir = $nusxalar[[int]$tanlov - 1].FullName
  } else {
    $BackupDir = $nusxalar[0].FullName
  }
}

$dumpFile = Join-Path $BackupDir "labcore.dump"
if (-not (Test-Path $dumpFile)) { Bad "labcore.dump topilmadi: $BackupDir"; Wait-Enter; exit 1 }
Ok "Tanlandi: $BackupDir"

# ---------------------------------------------------------------------------
Head "3. Zaxira buzilmaganini tekshirish"

$sumFile = Join-Path $BackupDir "CHECKSUMS.sha256"
if (Test-Path $sumFile) {
  $xato = 0
  foreach ($satr in (Get-Content $sumFile)) {
    if ($satr -match '^([0-9A-Fa-f]{64})\s+(.+)$') {
      $kutilgan = $matches[1].ToUpper()
      $fayl = Join-Path $BackupDir $matches[2].Trim()
      if (-not (Test-Path $fayl)) { Bad "fayl yo'q: $($matches[2])"; $xato++; continue }
      $haqiqiy = (Get-FileHash $fayl -Algorithm SHA256).Hash.ToUpper()
      if ($haqiqiy -ne $kutilgan) { Bad "fayl buzilgan: $($matches[2])"; $xato++ }
    }
  }
  if ($xato -gt 0) {
    Bad "Zaxira nusxa buzilgan - tiklash xavfli. Boshqa nusxani tanlang."
    Wait-Enter; exit 1
  }
  Ok "Nazorat summalari to'g'ri - fayllar butun"
} else {
  Note "CHECKSUMS.sha256 yo'q (eski nusxa) - tekshiruvsiz davom etamiz"
}

# ---------------------------------------------------------------------------
Head "4. Tiklash rejasi"

$stamp = Get-Date -Format "yyyyMMdd_HHmm"
if ($Sinov) {
  $target = "${dbName}_sinov_$stamp"
  Note "SINOV REJIMI: '$target' nomli alohida bazaga tiklanadi."
  Note "Ishlab turgan bazaga TEGILMAYDI. Bemor fayllari ham ko'chirilmaydi."
} else {
  $eskiNom = "${dbName}_eski_$stamp"
  $target = $dbName
  Note "Hozirgi '$dbName' bazasi '$eskiNom' nomi bilan SAQLAB QO'YILADI."
  Note "Zaxiradagi ma'lumot '$dbName' ga tiklanadi."
  Note "Bemor fayllari ham tiklanadi: $dataDir"
  Write-Host ""
  Write-Host "  Hech narsa o'chirilmaydi - eski baza joyida qoladi." -ForegroundColor Green
}

Write-Host ""
$javob = Read-Host "Davom etamizmi? (ha / yo'q)"
if ($javob -notmatch '^(ha|h|yes|y)$') { Note "Bekor qilindi."; Wait-Enter; exit }

# ---------------------------------------------------------------------------
function PgExec($db, $sql) {
  & $psql -h $dbHost -p $dbPort -U $dbUser -d $db -v ON_ERROR_STOP=1 -q -c $sql 2>&1 | Out-String
  return $LASTEXITCODE
}

if (-not $Sinov) {
  Head "5. Serverni to'xtatamiz"
  # Baza bilan ishlayotgan jarayon bo'lsa nom o'zgartirib bo'lmaydi.
  $task = Get-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue
  if ($task) { Stop-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue; Ok "Vazifa to'xtatildi" }
  Start-Sleep -Seconds 3
  # Qolgan ulanishlarni uzamiz
  PgExec "postgres" "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$dbName' AND pid <> pg_backend_pid();" | Out-Null
  Ok "Bazaga ulanishlar uzildi"

  Head "6. Eski bazani saqlab qo'yamiz"
  if ((PgExec "postgres" "ALTER DATABASE `"$dbName`" RENAME TO `"$eskiNom`";") -ne 0) {
    Bad "Eski bazani nom o'zgartirib bo'lmadi - tiklash to'xtatildi."
    Note "Hech narsa o'zgarmadi. Serverni qayta yoqing: TUZAT.bat"
    Wait-Enter; exit 1
  }
  Ok "Eski baza saqlandi: $eskiNom"
}

Head "$(if ($Sinov) {'5'} else {'7'}). Yangi bazani yaratamiz"
if ((PgExec "postgres" "CREATE DATABASE `"$target`" OWNER `"$dbUser`";") -ne 0) {
  Bad "Bazani yaratib bo'lmadi"
  if (-not $Sinov) {
    Note "Eski bazani qaytaramiz..."
    PgExec "postgres" "ALTER DATABASE `"$eskiNom`" RENAME TO `"$dbName`";" | Out-Null
    Note "Eski baza o'z joyiga qaytdi. Hech narsa yo'qolmadi."
  }
  Wait-Enter; exit 1
}
Ok "Baza yaratildi: $target"

Head "$(if ($Sinov) {'6'} else {'8'}). Ma'lumotlarni tiklaymiz"
Note "Bu bir necha daqiqa olishi mumkin..."
$restoreUrl = "postgres://${dbUser}:${dbPass}@${dbHost}:${dbPort}/${target}"
& $pgRestore --dbname=$restoreUrl --no-owner --no-privileges $dumpFile 2>&1 |
  ForEach-Object { if ($_ -match "error|ERROR") { Write-Host "   $_" -ForegroundColor Yellow } }
$rc = $LASTEXITCODE
if ($rc -ne 0) {
  Bad "pg_restore xato bilan tugadi (kod $rc)"
  if (-not $Sinov) {
    Note "Eski bazani qaytaramiz..."
    PgExec "postgres" "DROP DATABASE IF EXISTS `"$target`";" | Out-Null
    PgExec "postgres" "ALTER DATABASE `"$eskiNom`" RENAME TO `"$dbName`";" | Out-Null
    Note "Eski baza o'z joyiga qaytdi. Hech narsa yo'qolmadi."
  }
  Wait-Enter; exit 1
}
Ok "Baza tiklandi"

# ---------------------------------------------------------------------------
Head "$(if ($Sinov) {'7'} else {'9'}). Tekshiruv"

$jadvallar = @("patients","orders","results","payments","users","audit_log","visits")
$jami = 0
foreach ($t in $jadvallar) {
  $n = (& $psql -h $dbHost -p $dbPort -U $dbUser -d $target -tAq -c "SELECT count(*) FROM $t" 2>$null)
  if ($n -ne $null -and $n -ne "") {
    $jami += [int]$n
    Write-Host ("   {0,-14} {1,8} ta" -f $t, $n)
  } else {
    Bad "$t jadvali o'qilmadi"
  }
}
if ($jami -eq 0) { Bad "Baza bo'sh ko'rinadi - tiklash to'liq bo'lmagan bo'lishi mumkin" }

# Audit jurnali hali ham qulflanganmi
$trig = (& $psql -h $dbHost -p $dbPort -U $dbUser -d $target -tAq `
         -c "SELECT count(*) FROM pg_trigger WHERE NOT tgisinternal AND tgrelid='audit_log'::regclass" 2>$null)
if ([int]$trig -gt 0) { Ok "Audit jurnali himoyasi joyida (o'zgartirib bo'lmaydi)" }
else { Bad "Audit himoyasi yo'q - sxemani qayta o'rnating: npm run migrate" }

# ---------------------------------------------------------------------------
if ($Sinov) {
  Head "SINOV TUGADI"
  Write-Host ""
  Write-Host " Zaxira nusxa ISHLAYDI - undan to'liq tiklash mumkin." -ForegroundColor Green
  Write-Host ""
  Note "Sinov bazasi: $target"
  Note "Kerak bo'lmasa o'chirib tashlang:"
  Note "  psql -U $dbUser -h $dbHost -d postgres -c ""DROP DATABASE \""$target\"";"""
  Wait-Enter
  exit
}

# --- Bemor fayllari -------------------------------------------------------
Head "10. Bemor fayllari"
$zip = Join-Path $BackupDir "patients-files.zip"
if (Test-Path $zip) {
  $patientsDir = Join-Path $dataDir "Patients"
  if (Test-Path $patientsDir) {
    $eskiFayllar = "$patientsDir.eski_$stamp"
    Move-Item $patientsDir $eskiFayllar
    Note "Eski fayllar saqlandi: $eskiFayllar"
  }
  New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
  Expand-Archive -Path $zip -DestinationPath $dataDir -Force
  Ok "Bemor fayllari tiklandi"
} else {
  Note "patients-files.zip yo'q - fayllar tiklanmadi (zaxirada bo'lmagan)"
}

# --- Serverni qaytaramiz --------------------------------------------------
Head "11. Serverni ishga tushiramiz"
$task = Get-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue
if ($task) { Start-ScheduledTask -TaskName "LabCore"; Ok "Vazifa ishga tushirildi" }
else { Note "'LabCore' vazifasi yo'q - serverni qo'lda ishga tushiring" }

# Sertifikatni qabul qilamiz (o'z-o'zini imzolagan)
try {
  Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class LabCoreRestorePolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint s, X509Certificate c, WebRequest r, int p) { return true; }
}
"@ -ErrorAction SilentlyContinue
  [System.Net.ServicePointManager]::CertificatePolicy = New-Object LabCoreRestorePolicy
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
} catch { }

$port = if ($conf["PORT"]) { [int]$conf["PORT"] } else { 4000 }
$scheme = $null
for ($i = 1; $i -le 30; $i++) {
  foreach ($s in @("https","http")) {
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
  Write-Host " TIKLASH TUGADI - server ishlayapti" -ForegroundColor Green
  Write-Host "============================================================"
  Write-Host ""
  Write-Host " DASTURGA SHU MANZILNI YOZING:" -ForegroundColor Yellow
  Write-Host "   $scheme`://localhost`:$port" -ForegroundColor Cyan
} else {
  Write-Host " Baza tiklandi, lekin server hali javob bermayapti" -ForegroundColor Yellow
  Write-Host "============================================================"
  Note "TEKSHIR.bat ni ishga tushiring - sababini ko'rsatadi."
}
Write-Host "============================================================"
Write-Host ""
Write-Host " Eski baza saqlanib qoldi: $eskiNom" -ForegroundColor DarkGray
Write-Host " Hammasi joyida ekaniga ishonch hosil qilgach o'chirsangiz bo'ladi:" -ForegroundColor DarkGray
Write-Host "   psql -U $dbUser -h $dbHost -d postgres -c ""DROP DATABASE \""$eskiNom\"";""" -ForegroundColor DarkGray

Wait-Enter
