# Serves the site on your LAN so phones/tablets (same Wi-Fi) can open it.
# "localhost" on the PC is NOT the same as your iPhone - use a URL below.

$port = 3456
$listen = "tcp://0.0.0.0:$port"

Set-Location $PSScriptRoot

Write-Host ""
Write-Host "Waldron site - open ONE of these on your iPhone (same Wi-Fi as this PC):"
Write-Host ""

try {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' } |
    Select-Object -ExpandProperty IPAddress
  if ($ips) {
    foreach ($ip in $ips) {
      Write-Host ("  http://{0}:{1}" -f $ip, $port) -ForegroundColor Cyan
    }
  } else {
    Write-Host "  (Run ipconfig, find your Wi-Fi IPv4, then use http://THAT_IP:$port )" -ForegroundColor Yellow
  }
} catch {
  Write-Host "  (Run ipconfig, find your Wi-Fi IPv4, then use http://THAT_IP:$port )" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "If Safari never loads: Windows Firewall may block the port. Allow it for npx/Node" -ForegroundColor DarkGray
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

& npx --yes serve -l $listen
