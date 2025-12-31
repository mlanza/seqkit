#!/usr/bin/env pwsh

param(
    [int]$level = $null
)

if ($level) {
    $pattern = "^#{${level}}\s+(.+)$"
    $replacement = ("#" * $level) + " [[`$1]]"
} else {
    $pattern = "^(#+)\s+(.+)$"
    $replacement = "`$1 [[`$2]]"
}

$input | ForEach-Object { $_ -replace $pattern, $replacement }