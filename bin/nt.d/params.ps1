#!/usr/bin/env pwsh
# Searches for strings matching %{name} pattern and returns the inner text
# Parameters are plugged as such `sed 's/%{name}/Otto/'`

# Read from standard input or from provided files
$content = @()
if ($args.Count -eq 0) {
    $content = @($input)
} else {
    foreach ($file in $args) {
        if (Test-Path $file) {
            $content += Get-Content $file -Raw
        }
    }
}

# Find all matches of %{name} pattern and extract the inner text
$pattern = '%\{([^}]+)\}'
$results = @()
foreach ($text in $content) {
    if ($text) {
        $matches = [regex]::Matches($text, $pattern)
        foreach ($match in $matches) {
            $results += $match.Groups[1].Value
        }
    }
}

$results
