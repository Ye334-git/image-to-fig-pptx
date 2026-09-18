$ErrorActionPreference = 'Stop'
$node = (Get-Command node.exe).Source
$proxySettings = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings'
if (-not $env:HTTPS_PROXY -and $proxySettings.ProxyEnable -eq 1 -and $proxySettings.ProxyServer) {
    $proxyAddress = [string]$proxySettings.ProxyServer
    if ($proxyAddress -match '(?:^|;)https=([^;]+)') { $proxyAddress = $Matches[1] }
    if ($proxyAddress -notmatch '=') {
        if ($proxyAddress -notmatch '^https?://') { $proxyAddress = "http://$proxyAddress" }
        $env:HTTPS_PROXY = $proxyAddress
    }
}
$env:NO_PROXY = (@($env:NO_PROXY, 'localhost', '127.0.0.1', '::1') | Where-Object { $_ }) -join ','
$services = @(
    @{ Port = 18787; Script = '--require ./scripts/proxy-bootstrap.cjs server.js'; Directory = (Join-Path $PSScriptRoot 'image-to-slice'); Log = 'api' },
    @{ Port = 18788; Script = 'serve-ui.cjs'; Directory = $PSScriptRoot; Log = 'ui' }
)
foreach ($service in $services) {
    if (Get-NetTCPConnection -LocalPort $service.Port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "Port $($service.Port) already listening; skipped."
        continue
    }
    Start-Process -FilePath $node -ArgumentList $service.Script -WorkingDirectory $service.Directory -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot "$($service.Log).log") -RedirectStandardError (Join-Path $PSScriptRoot "$($service.Log).error.log") | Out-Null
}
Write-Host 'Open http://127.0.0.1:18788'
