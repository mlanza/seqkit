#!/usr/bin/env pwsh
$input | ForEach-Object {
    $path = $_.Trim()
    if ($path -and (Test-Path $path)) {
        $path
    }
}
