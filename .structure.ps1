$ErrorActionPreference='Continue'
Set-Location 'D:\Codex_Workspace\projects\260917pic2ppt'
Write-Output '===== TRACKED files per top-level dir (what git would carry) ====='
git ls-files | ForEach-Object { ($_ -split '/')[0] } | Group-Object | Sort-Object Count -Descending | ForEach-Object { '  {0,-22} {1,5} files' -f $_.Name, $_.Count }
Write-Output ''
Write-Output '===== tools/ layout, source only (node_modules excluded) ====='
foreach ($t in @('image-to-pptx','image-to-html','html-to-pptx')) {
  $p = "tools/$t"
  if (-not (Test-Path $p)) { Write-Output ('  ' + $t + ' : MISSING'); continue }
  $src = Get-ChildItem $p -Recurse -File -Force -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notmatch '\\node_modules\\' }
  $mb = ($src | Measure-Object -Property Length -Sum).Sum / 1MB
  Write-Output ('  {0,-16} {1,5} files  {2,7:N1} MB' -f $t, $src.Count, $mb)
}
Write-Output ''
Write-Output '===== what each tool actually is ====='
Write-Output '  image-to-pptx  : launcher only (no engine code)'
Write-Output '  image-to-html  : the engine (server + UI + slicing)  <- REQUIRED'
Write-Output '  html-to-pptx   : the converter (dom-to-pptx pipeline) <- REQUIRED for PPTX'
Write-Output ''
Write-Output '===== image-to-pptx contents (complete) ====='
Get-ChildItem 'tools/image-to-pptx' -Recurse -File -Force | ForEach-Object { '  {0,-40} {1,8:N0} B' -f $_.FullName.Replace((Resolve-Path 'tools/image-to-pptx').Path + '\',''), $_.Length }
Write-Output ''
Write-Output '===== hard-coded sibling references in image-to-pptx ====='
Select-String -Path 'tools/image-to-pptx/bin/image-to-pptx.cjs' -Pattern 'image-to-html|ENGINE' | ForEach-Object { '  line ' + $_.LineNumber + ': ' + $_.Line.Trim() }