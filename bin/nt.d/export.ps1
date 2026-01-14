#!/usr/bin/env pwsh
param(
  [Parameter(Mandatory=$true, Position=0)]
  [string]$pageName,

  [Parameter(Mandatory=$false)]
  [string]$dest,

  [Parameter(Mandatory=$false)]
  [switch]$overwrite,

  [Parameter(Mandatory=$false)]
  [int]$heading = 0,

  [Parameter(ValueFromRemainingArguments=$true)]
  [string[]]$otherArgs
)

# Handle --dest and --heading syntax in remaining args
for ($i = 0; $i -lt $otherArgs.Length; $i++) {
  if ($otherArgs[$i] -eq "--dest" -and $i + 1 -lt $otherArgs.Length) {
    $dest = $otherArgs[$i + 1]
    $otherArgs = $otherArgs[0..($i-1)] + $otherArgs[($i+2)..($otherArgs.Length-1)]
    $i-- # Adjust index after removing elements
  }
  elseif ($otherArgs[$i].StartsWith("--heading=")) {
    $heading = [int]($otherArgs[$i] -split "=")[1]
    $otherArgs = $otherArgs[0..($i-1)] + $otherArgs[($i+1)..($otherArgs.Length-1)]
    $i-- # Adjust index after removing element
  }
}

# Validate required parameters
if (-not $dest) {
  Write-Error "Usage: export.ps1 <pageName> --dest <destination> [--overwrite] [--heading <level>] [other args...]"
  exit 1
}

# Check if dest is a directory or file, construct destination accordingly
if (Test-Path $dest -PathType Container) {
  # dest is a directory, append the page filename
  $fullPath = nt path $pageName
  $filename = Split-Path $fullPath -Leaf
  $destFile = Join-Path $dest $filename
} else {
  # dest is a file path, use it directly
  $destFile = $dest
}

# Check if file exists and overwrite parameter
if ((Test-Path $destFile) -and -not $overwrite) {
  Write-Error "File '$destFile' already exists. Use --overwrite to replace it."
  exit 1
}

# Get the page content and write to destination
$content = (nt page $pageName --heading=$heading $otherArgs | Out-String).Trim()
Set-Content $destFile $content
