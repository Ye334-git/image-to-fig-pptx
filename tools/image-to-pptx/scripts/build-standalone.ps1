<#
.SYNOPSIS
  组装 image-to-fig-pptx 自包含发行包（含全部依赖，解压即用）。

.DESCRIPTION
  从仓库内的源码生成一份可直接分发的目录：
    <Destination>/engine      切图 / HTML 引擎（含 node_modules 与预构建 dist/ui.html）
    <Destination>/converter   HTML -> PPTX 转换器（含 node_modules）
    <Destination>/bin         启动器
    <Destination>/examples    自检用示例页面
  打包后的目录可复制到任意位置运行，不需要 npm install，也不需要构建。

.PARAMETER Destination
  输出目录。已存在时会被清空，除非目标看起来不是本包（需要 -Force 覆盖）。

.PARAMETER Force
  允许覆盖一个已存在但不像本包的目录。

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools\image-to-pptx\scripts\build-standalone.ps1
#>
[CmdletBinding()]
param(
  [string]$Destination = 'D:\DSH_Workspace\image-to-fig-pptx',
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$toolDir = Split-Path -Parent $PSScriptRoot          # tools/image-to-pptx
$toolsRoot = Split-Path -Parent $toolDir             # tools
$engineSrc = Join-Path $toolsRoot 'image-to-html'
$converterSrc = Join-Path $toolsRoot 'html-to-pptx'
$shellSrc = Join-Path $toolDir 'standalone'

foreach ($required in @($engineSrc, $converterSrc, $shellSrc)) {
  if (-not (Test-Path $required)) { throw "缺少必要目录：$required" }
}

# 引擎必须已经安装依赖并构建过界面，否则打出来的包跑不起来。
$mustExist = @{
  'engine 依赖'         = Join-Path $engineSrc 'node_modules'
  'engine 预构建界面'   = Join-Path $engineSrc 'dist\ui.html'
  'converter 依赖'      = Join-Path $converterSrc 'node_modules'
  'converter 入口'      = Join-Path $converterSrc 'bin\html-to-pptx.mjs'
}
$missing = $mustExist.GetEnumerator() | Where-Object { -not (Test-Path $_.Value) }
if ($missing) {
  $names = ($missing | ForEach-Object { $_.Key }) -join '、'
  throw "源目录尚未准备就绪（缺少：$names）。请先在 tools/image-to-html 运行 npm install 与 npm run build，并在 tools/html-to-pptx 运行 npm install。"
}

if (Test-Path $Destination) {
  $marker = Join-Path $Destination 'package.json'
  $looksLikeOurs = (Test-Path $marker) -and ((Get-Content $marker -Raw) -match '"image-to-fig-pptx"')
  if (-not $looksLikeOurs -and -not $Force) {
    throw "目标目录已存在且不像本包：$Destination。确认无误后加 -Force 覆盖。"
  }
  # Rename before deleting. If anything under the destination is in use — a running
  # instance keeps sharp's native DLL locked — the rename fails and NOTHING has been
  # destroyed yet. Deleting first would leave a half-wiped package behind.
  $trashName = (Split-Path $Destination -Leaf) + '.old-' + (Get-Date -Format 'HHmmss')
  $trashPath = Join-Path (Split-Path $Destination -Parent) $trashName
  try {
    Rename-Item -LiteralPath $Destination -NewName $trashName -ErrorAction Stop
  } catch {
    throw "目标目录正在被占用，可能有一个 image-to-fig-pptx 实例还在运行：" + $Destination + "。请先关闭它（或结束对应的 node 进程）再重新打包。原因：" + $_.Exception.Message
  }
  Remove-Item -LiteralPath $trashPath -Recurse -Force -ErrorAction SilentlyContinue
}
New-Item -ItemType Directory -Force -Path $Destination, (Join-Path $Destination 'bin') | Out-Null

Write-Host '复制 engine（含 node_modules 与预构建界面，排除 test-results / 本地数据）…'
robocopy $engineSrc (Join-Path $Destination 'engine') /E `
  /XD test-results .image-to-html-data .work `
  /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy engine 失败，退出码 $LASTEXITCODE" }

Write-Host '复制 converter（含 node_modules，排除 .work）…'
robocopy $converterSrc (Join-Path $Destination 'converter') /E `
  /XD .work `
  /NFL /NDL /NJH /NJS /NP /R:1 /W:1 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy converter 失败，退出码 $LASTEXITCODE" }

Write-Host '复制启动器、示例与说明…'
Copy-Item (Join-Path $shellSrc 'bin') $Destination -Recurse -Force
Copy-Item (Join-Path $shellSrc 'examples') $Destination -Recurse -Force
Copy-Item (Join-Path $shellSrc 'docs') $Destination -Recurse -Force
foreach ($file in @('start.cmd', 'package.json', 'README.md', 'verify.cjs')) {
  Copy-Item (Join-Path $shellSrc $file) $Destination -Force
}

$total = (Get-ChildItem $Destination -Recurse -File -Force | Measure-Object -Property Length -Sum).Sum / 1MB
$count = (Get-ChildItem $Destination -Recurse -File -Force | Measure-Object).Count
Write-Host ''
Write-Host ('打包完成：{0}（{1:N1} MB，{2} 个文件）' -f $Destination, $total, $count)
Write-Host '分发前请确认包内不含任何密钥，然后在目标目录运行：node verify.cjs'
