param(
    [Parameter(Mandatory = $true)]
    [string]$SourcePath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$workspaceRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$resourceRoot = Join-Path $workspaceRoot 'android\app\src\main\res'
$sourceFile = (Resolve-Path -LiteralPath $SourcePath).Path
$sourceImage = [System.Drawing.Image]::FromFile($sourceFile)

function Save-Icon([int]$Size, [string]$Destination, [double]$Scale = 1) {
    $bitmap = [System.Drawing.Bitmap]::new($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $edge = [int][Math]::Round($Size * $Scale)
        $offset = [int][Math]::Round(($Size - $edge) / 2)
        $graphics.DrawImage($sourceImage, $offset, $offset, $edge, $edge)
        $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

try {
    if ([Math]::Abs($sourceImage.Width - $sourceImage.Height) -gt 4) {
        throw 'The launcher icon source must be square.'
    }
    foreach ($density in @(
        @{ Name = 'mdpi'; Icon = 48; Foreground = 108 },
        @{ Name = 'hdpi'; Icon = 72; Foreground = 162 },
        @{ Name = 'xhdpi'; Icon = 96; Foreground = 216 },
        @{ Name = 'xxhdpi'; Icon = 144; Foreground = 324 },
        @{ Name = 'xxxhdpi'; Icon = 192; Foreground = 432 }
    )) {
        $directory = Join-Path $resourceRoot ('mipmap-' + $density.Name)
        Save-Icon $density.Icon (Join-Path $directory 'ic_launcher.png')
        Save-Icon $density.Icon (Join-Path $directory 'ic_launcher_round.png')
        # Leave a small inset so the reference logo fits adaptive launcher masks.
        Save-Icon $density.Foreground (Join-Path $directory 'ic_launcher_foreground.png') (100.0 / 108.0)
    }
    Save-Icon 512 (Join-Path $workspaceRoot 'public\app-icon.png')
    Save-Icon 180 (Join-Path $workspaceRoot 'public\apple-touch-icon.png')
    $colorFile = Join-Path $resourceRoot 'values\ic_launcher_background.xml'
    $colorXml = [xml](Get-Content -LiteralPath $colorFile -Raw)
    $colorXml.resources.color.InnerText = '#080F1C'
    $colorXml.Save($colorFile)
    $indexFile = Join-Path $workspaceRoot 'index.html'
    $indexText = Get-Content -LiteralPath $indexFile -Raw
    $indexText = $indexText.Replace('./src/assets/nexgtool-removebg-preview.png', '/app-icon.png')
    if (!$indexText.Contains('rel="apple-touch-icon"')) {
        $indexText = $indexText.Replace('    <meta name="viewport"', "    <link rel=`"apple-touch-icon`" href=`"/apple-touch-icon.png`" />`n    <meta name=`"viewport`"")
    }
    [System.IO.File]::WriteAllText($indexFile, $indexText, [System.Text.UTF8Encoding]::new($false))
    Write-Output 'Updated all five Android icon densities, adaptive background, and browser icons.'
}
finally {
    $sourceImage.Dispose()
}
