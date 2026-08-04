# LabCore holatini tekshirish
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$env_ = @{}
Get-Content (Join-Path $root ".env") | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $env_[$matches[1]] = $matches[2] }
}
$port   = if ($env_["PORT"]) { $env_["PORT"] } else { 4000 }
$scheme = if ($env_["LABCORE_SSL_CERT"]) { "https" } else { "http" }

Write-Host "`n=== LabCore holati ===" -ForegroundColor Cyan
$task = Get-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue
if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName "LabCore"
  Write-Host "Vazifa      : $($task.State)  (oxirgi ishga tushish: $($info.LastRunTime))"
} else { Write-Host "Vazifa      : topilmadi" -ForegroundColor Yellow }

try {
  $r = Invoke-RestMethod "$scheme`://localhost:$port/api/health" -SkipCertificateCheck -TimeoutSec 5
  Write-Host "Server      : ishlayapti ($scheme, port $port)" -ForegroundColor Green
  Write-Host "Baza        : $($r.db)"
  Write-Host "Laboratoriya: $($r.lab)"
} catch {
  Write-Host "Server      : javob bermayapti - $($_.Exception.Message)" -ForegroundColor Red
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
       Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
       Select-Object -First 1).IPAddress
Write-Host "Manzil      : $scheme`://$ip`:$port"

$last = Get-ChildItem (Join-Path $root "backups") -Directory -ErrorAction SilentlyContinue |
        Sort-Object CreationTime -Descending | Select-Object -First 1
if ($last) { Write-Host "Oxirgi zaxira: $($last.Name)" } else { Write-Host "Oxirgi zaxira: yo'q" -ForegroundColor Yellow }
Write-Host ""
