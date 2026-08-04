# ============================================================================
#  LabCore - Windows uchun kunlik zaxira nusxa
#  Har kuni 01:30 da "LabCore-Backup" vazifasi orqali ishga tushadi.
# ============================================================================
$ErrorActionPreference = "Stop"

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root

# .env dan sozlamalarni o'qiymiz
$env_ = @{}
Get-Content (Join-Path $root ".env") | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $env_[$matches[1]] = $matches[2] }
}

$dbUrl     = $env_["DATABASE_URL"]
$dataDir   = if ($env_["DATA_DIR"]) { $env_["DATA_DIR"] } else { Join-Path $root "data" }
$backupDir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $root "backups" }
$keepDays  = if ($env_["BACKUP_KEEP_DAYS"]) { [int]$env_["BACKUP_KEEP_DAYS"] } else { 30 }

$stamp  = Get-Date -Format "yyyy-MM-dd_HHmm"
$target = Join-Path $backupDir $stamp
New-Item -ItemType Directory -Force -Path $target | Out-Null

Write-Host "[$(Get-Date -Format 'u')] Zaxiralash: $target"

# pg_dump ni topamiz
$pgDump = (Get-Command pg_dump -ErrorAction SilentlyContinue).Source
if (-not $pgDump) {
  $pgDump = (Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\pg_dump.exe" |
             Sort-Object FullName -Descending | Select-Object -First 1).FullName
}
if (-not $pgDump) { throw "pg_dump topilmadi" }

# 1) Baza
# Diqqat: yo'lni oldindan o'zgaruvchiga olamiz. Qavs ichidagi ifoda
# ($pgDump --file=(Join-Path ...)) alohida argument bo'lib ketadi va
# pg_dump faylni yozmaydi.
$dumpFile = Join-Path $target "labcore.dump"
& $pgDump --format=custom --compress=9 --file=$dumpFile $dbUrl
if ($LASTEXITCODE -ne 0) { throw "pg_dump xato bilan tugadi (kod $LASTEXITCODE)" }
Write-Host "  OK baza: $([math]::Round((Get-Item $dumpFile).Length/1MB,1)) MB"

# 2) Bemor fayllari
$patientsDir = Join-Path $dataDir "Patients"
if (Test-Path $patientsDir) {
  $zip = Join-Path $target "patients-files.zip"
  Compress-Archive -Path $patientsDir -DestinationPath $zip -Force
  Write-Host "  OK fayllar: $([math]::Round((Get-Item $zip).Length/1MB,1)) MB"
}

# 3) Nazorat summalari - yillar o'tib fayl buzilmaganini tekshirish uchun
Get-ChildItem $target -File | ForEach-Object {
  "$((Get-FileHash $_.FullName -Algorithm SHA256).Hash)  $($_.Name)"
} | Set-Content (Join-Path $target "CHECKSUMS.sha256")

# 4) Eski nusxalarni tozalash
Get-ChildItem $backupDir -Directory |
  Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-$keepDays) } |
  Remove-Item -Recurse -Force

# 5) Tashqi diskka yoki tarmoq papkasiga nusxa (ixtiyoriy)
#    Masalan: $env:BACKUP_COPY_TO = "D:\LabCore-Backup"  yoki  "\\NAS\labcore"
if ($env:BACKUP_COPY_TO -and (Test-Path $env:BACKUP_COPY_TO)) {
  Copy-Item $target -Destination $env:BACKUP_COPY_TO -Recurse -Force
  Write-Host "  OK tashqi nusxa: $env:BACKUP_COPY_TO"
}

Write-Host "[$(Get-Date -Format 'u')] Tugadi."
Write-Host ""
Write-Host "Tiklash:"
Write-Host "  pg_restore --clean --if-exists --dbname=`"<DATABASE_URL>`" $dumpFile"
Write-Host "  Expand-Archive $(Join-Path $target 'patients-files.zip') -DestinationPath $dataDir -Force"
