param(
    [string]$Target = "chrome"
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot

if ($Target -eq "firefox") {
    $manifestFile = "manifest.firefox.json"
    $manifestPath = Join-Path $root $manifestFile
    if (-not (Test-Path $manifestPath)) {
        throw "Firefox manifest not found: $manifestPath"
    }
} else {
    $manifestFile = "manifest.json"
    $manifestPath = Join-Path $root $manifestFile
    if (-not (Test-Path $manifestPath)) {
        throw "manifest.json not found: $manifestPath"
    }
}

Write-Host "Building for target: $Target"
Write-Host "Using manifest: $manifestPath"

$manifestRaw = Get-Content -Raw -Encoding utf8 -Path $manifestPath

$version = '0.0.0'
try {
  $manifest = $manifestRaw | ConvertFrom-Json
  if ($manifest.version) { $version = $manifest.version }
} catch {
  $m = [Regex]::Match($manifestRaw, '"version"\s*:\s*"([^"]+)"')
  if ($m.Success) { $version = $m.Groups[1].Value }
}

$outDir = Join-Path $root 'release'
$stageDir = Join-Path $outDir "staging-$Target-$version"

if (Test-Path $stageDir) {
  Remove-Item -Recurse -Force $stageDir
}
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

$includePaths = @(
  'background.js',
  'content.js',
  'content.css',
  '_locales',
  'icons',
  'manager',
  'options',
  'popup',
  'config',
  'utils'
)

# Copy common files
foreach ($rel in $includePaths) {
  $src = Join-Path $root $rel
  if (-not (Test-Path $src)) {
    throw "Missing required path: $rel"
  }
  $dst = Join-Path $stageDir $rel
  if ((Get-Item $src).PSIsContainer) {
    Copy-Item -Recurse -Force -Path $src -Destination $dst
  } else {
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dst) | Out-Null
    Copy-Item -Force -Path $src -Destination $dst
  }
}

# Copy manifest (renaming to manifest.json if needed)
Copy-Item -Force -Path $manifestPath -Destination (Join-Path $stageDir 'manifest.json')

$zipName = "AIBook-$Target-$version.zip"
$zipPath = Join-Path $outDir $zipName
if (Test-Path $zipPath) {
  Remove-Item -Force $zipPath
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -Force

Write-Host "OK: $zipPath"
