$ErrorActionPreference='Continue'
Set-Location 'D:\Codex_Workspace\projects\260917pic2ppt'
$tmp = Join-Path $env:TEMP 'i2p-standalone'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Output '################ SCENARIO A: upload ONLY image-to-pptx ################'
New-Item -ItemType Directory -Force -Path "$tmp\A\tools" | Out-Null
Copy-Item 'tools\image-to-pptx' "$tmp\A\tools\image-to-pptx" -Recurse
Push-Location "$tmp\A\tools\image-to-pptx"
Write-Output '--- file listing the downloader would get ---'
Get-ChildItem -Recurse -File | ForEach-Object { '  ' + $_.FullName.Replace((Get-Location).Path + '\','') }
Write-Output '--- trying to run it ---'
$outA = & node bin\image-to-pptx.cjs --no-open --port 18799 2>&1
Write-Output ('exit code: ' + $LASTEXITCODE)
$outA | Select-Object -First 6 | ForEach-Object { '  ' + $_.ToString() }
Pop-Location

Write-Output ''
Write-Output '################ SCENARIO B: image-to-pptx + image-to-html (no html-to-pptx) ################'
New-Item -ItemType Directory -Force -Path "$tmp\B\tools" | Out-Null
Copy-Item 'tools\image-to-pptx' "$tmp\B\tools\image-to-pptx" -Recurse
robocopy 'tools\image-to-html' "$tmp\B\tools\image-to-html" /E /XD node_modules .image-to-html-data /NFL /NDL /NJH /NJS /NP | Out-Null
New-Item -ItemType Junction -Path "$tmp\B\tools\image-to-html\node_modules" -Target (Resolve-Path 'tools\image-to-html\node_modules').Path | Out-Null
Push-Location "$tmp\B\tools\image-to-pptx"
$out = Join-Path $env:TEMP 'b.log'; $err = Join-Path $env:TEMP 'b.err'
$p = Start-Process node -ArgumentList 'bin\image-to-pptx.cjs','--port','18799','--no-open',"--data-dir=$tmp\B\data" -PassThru -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err
Start-Sleep -Seconds 5
try {
  Write-Output '--- health from the standalone copy ---'
  (Invoke-WebRequest 'http://127.0.0.1:18799/api/v1/health' -UseBasicParsing -TimeoutSec 8).Content
} catch { Write-Output ('  health failed: ' + $_.Exception.Message) }
if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
Pop-Location
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue