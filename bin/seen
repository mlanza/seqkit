#!/usr/bin/env pwsh

$seen = @{}

foreach ($line in $input) {
  if (-not $seen.ContainsKey($line)) {
    $seen[$line] = $true
    $line
  }
}
