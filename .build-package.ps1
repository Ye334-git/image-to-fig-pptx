$ErrorActionPreference='Stop'
Set-Location 'D:\Codex_Workspace\projects\260917pic2ppt'
$dest = 'D:\DSH_Workspace\image-to-fig-pptx'
if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
New-Item -ItemType Directory -Force -Path $dest,'$dest\bin' | Out-Null

Write-Output '--- copying engine (with node_modules + dist, excluding test-results/data) ---'
robocopy 'tools\image-to-html' "$dest\engine" /E /XD test-results .image-to-html-data .work /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
Write-Output ('  engine robocopy exit: ' + $LASTEXITCODE + ' (0-7 = ok)')

Write-Output '--- copying converter (with node_modules, excluding work) ---'
robocopy 'tools\html-to-pptx' "$dest\converter" /E /XD .work /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
Write-Output ('  converter robocopy exit: ' + $LASTEXITCODE + ' (0-7 = ok)')

Write-Output ''
Write-Output '--- verify the critical bits survived the copy ---'
foreach ($p in @('engine\server.js','engine\dist\ui.html','engine\node_modules\playwright-core','engine\node_modules\sharp','converter\bin\html-to-pptx.mjs','converter\node_modules\dom-to-pptx\bin\cli-exporter.js','converter\scripts\merge-and-render.ps1')) {
  '  {0,-58} {1}' -f $p, (Test-Path "$dest\$p")
}
Write-Output ''
Write-Output '--- sizes ---'
foreach ($d in @('engine','converter')) {
  $sz = (Get-ChildItem "$dest\$d" -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum / 1MB
  '  {0,-12} {1,8:N1} MB' -f $d, $sz
}