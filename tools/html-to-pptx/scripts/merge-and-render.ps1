[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ManifestPath
)

$ErrorActionPreference = 'Stop'
$manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
$inputs = @($manifest.inputPptx)
if ($inputs.Count -eq 0) {
  throw 'No input PPTX files were supplied.'
}

$outputPath = [System.IO.Path]::GetFullPath([string]$manifest.outputPptx)
$outputDirectory = [System.IO.Path]::GetDirectoryName($outputPath)
[System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null

$renderEnabled = [bool]$manifest.render
$renderDirectory = $null
if ($renderEnabled) {
  $renderDirectory = [System.IO.Path]::GetFullPath([string]$manifest.renderDir)
  [System.IO.Directory]::CreateDirectory($renderDirectory) | Out-Null
}

$application = New-Object -ComObject PowerPoint.Application
$application.Visible = -1
$presentation = $null

try {
  $firstInput = [System.IO.Path]::GetFullPath([string]$inputs[0])
  $presentation = $application.Presentations.Open($firstInput, $true, $false, $false)

  for ($index = 1; $index -lt $inputs.Count; $index++) {
    $nextInput = [System.IO.Path]::GetFullPath([string]$inputs[$index])
    [void]$presentation.Slides.InsertFromFile($nextInput, $presentation.Slides.Count, 1, 1)
  }

  $presentation.SaveAs($outputPath, 24)
  $renderWidth = 1920
  $renderHeight = [Math]::Round($renderWidth * $presentation.PageSetup.SlideHeight / $presentation.PageSetup.SlideWidth)

  $slides = @()
  foreach ($slide in $presentation.Slides) {
    $textObjects = 0
    $pictureObjects = 0

    foreach ($shape in $slide.Shapes) {
      if ($shape.HasTextFrame -eq -1 -and $shape.TextFrame.HasText -eq -1) {
        $textObjects++
      }
      if ($shape.Type -eq 11 -or $shape.Type -eq 13) {
        $pictureObjects++
      }
    }

    $previewPath = $null
    if ($renderEnabled) {
      $previewPath = Join-Path $renderDirectory ('slide-{0:D3}.png' -f $slide.SlideIndex)
      $slide.Export($previewPath, 'PNG', $renderWidth, $renderHeight)
    }

    $slides += [ordered]@{
      slide = $slide.SlideIndex
      shapes = $slide.Shapes.Count
      textObjects = $textObjects
      pictureObjects = $pictureObjects
      preview = $previewPath
    }
  }

  [ordered]@{
    outputPptx = $outputPath
    slideCount = $presentation.Slides.Count
    slideWidthPoints = $presentation.PageSetup.SlideWidth
    slideHeightPoints = $presentation.PageSetup.SlideHeight
    renderedBy = 'Microsoft PowerPoint'
    slides = $slides
  } | ConvertTo-Json -Depth 6 -Compress
}
finally {
  if ($null -ne $presentation) {
    $presentation.Close()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($presentation)
  }
  $application.Quit()
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($application)
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
