# ============================================================================
#  LabCore holatini tekshirish
#
#  DIQQAT: Windows PowerShell 5.1 da ishlashi shart. Shuning uchun
#  Invoke-RestMethod -SkipCertificateCheck ISHLATILMAYDI - u faqat
#  PowerShell 7 da bor va 5.1 da "A parameter cannot be found that matches
#  parameter name 'SkipCertificateCheck'" xatosini beradi.
# ============================================================================

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$env_ = @{}
Get-Content (Join-Path $root ".env") -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $env_[$matches[1]] = $matches[2] }
}
$port = if ($env_["PORT"]) { $env_["PORT"] } else { 4000 }

Write-Host "`n=== LabCore holati ===" -ForegroundColor Cyan

$task = Get-ScheduledTask -TaskName "LabCore" -ErrorAction SilentlyContinue
if ($task) {
  $info = Get-ScheduledTaskInfo -TaskName "LabCore"
  Write-Host "Vazifa      : $($task.State)  (oxirgi ishga tushish: $($info.LastRunTime))"
} else { Write-Host "Vazifa      : topilmadi" -ForegroundColor Yellow }

# O'z-o'zini imzolagan sertifikatni qabul qilamiz (PowerShell 5.1 usuli)
try {
  Add-Type @"
using System.Net;
using System.Security.Cryptography.X509Certificates;
public class LabCoreStatusPolicy : ICertificatePolicy {
  public bool CheckValidationResult(ServicePoint s, X509Certificate c, WebRequest r, int p) { return true; }
}
"@ -ErrorAction SilentlyContinue
  [System.Net.ServicePointManager]::CertificatePolicy = New-Object LabCoreStatusPolicy
  [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
} catch { }

# Qaysi protokol ishlayotganini taxmin qilmaymiz - ikkalasini ham sinaymiz.
$scheme = $null
foreach ($s in @("https", "http")) {
  try {
    $r = Invoke-RestMethod "$s`://localhost`:$port/api/health" -TimeoutSec 5
    if ($r.ok) {
      Write-Host "Server      : ishlayapti ($s, port $port)" -ForegroundColor Green
      Write-Host "Baza        : $($r.db)"
      Write-Host "Laboratoriya: $($r.lab)"
      $scheme = $s
      break
    }
  } catch { }
}

if (-not $scheme) {
  Write-Host "Server      : javob bermayapti" -ForegroundColor Red
  $log = Join-Path $root "logs\server.log"
  if (Test-Path $log) {
    Write-Host "`nJurnaldagi oxirgi satrlar ($log):" -ForegroundColor Yellow
    Get-Content $log -Tail 20 | ForEach-Object { Write-Host "   $_" -ForegroundColor DarkYellow }
  }
  $scheme = "http"
}

$ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
       Where-Object {
         $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and
         $_.PrefixOrigin -ne "WellKnown" -and
         (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex -ErrorAction SilentlyContinue).Status -eq "Up"
       } |
       Sort-Object -Property @{ Expression = {
         if     ($_.IPAddress -like "192.168.*") { 0 }
         elseif ($_.IPAddress -like "10.*")      { 1 }
         elseif ($_.IPAddress -like "172.*")     { 2 }
         else                                    { 3 }
       } } | Select-Object -First 1).IPAddress

if ($ip) {
  Write-Host "Manzil      : $scheme`://$ip`:$port"
} else {
  Write-Host "Manzil      : $scheme`://localhost`:$port  (tarmoq ulanmagan - faqat shu kompyuterda)" -ForegroundColor Yellow
}

$last = Get-ChildItem (Join-Path $root "backups") -Directory -ErrorAction SilentlyContinue |
        Sort-Object CreationTime -Descending | Select-Object -First 1
if ($last) { Write-Host "Oxirgi zaxira: $($last.Name)" } else { Write-Host "Oxirgi zaxira: yo'q" -ForegroundColor Yellow }
Write-Host ""
