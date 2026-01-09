#!/usr/bin/env pwsh

# Post - Process stdin through serial then pipe to update, or handle properties only
# Usage: echo "content" | nt post [--prepend] [--debug] [--overwrite] [--add "key=value"...] <page_name>
# Usage: nt post [--add "key=value"...] <page_name>

# Check if stdin has content
$hasStdin = $false
try {
    $stdinAvailable = [Console]::IsInputRedirected
    if ($stdinAvailable) {
        $inputs = [Console]::In.ReadToEnd()
        $hasStdin = -not [string]::IsNullOrWhiteSpace($inputs)
    }
} catch {
    # Fallback if stdin check fails
    $hasStdin = $false
}

# Separate prop arguments from other arguments
$propArgs = @()
$otherArgs = @()
$pageName = $null

for ($i = 0; $i -lt $args.Count; $i++) {
    if ($args[$i] -eq "--add" -and $i + 1 -lt $args.Count) {
        $propArgs += $args[$i + 1]
        $i++
    } elseif (-not $pageName) {
        $pageName = $args[$i]
    } else {
        $otherArgs += $args[$i]
    }
}

# Call nt prop first if any prop arguments provided
if ($propArgs.Count -gt 0) {
    $propAddArgs = $propArgs | ForEach-Object { "--add", $_ }
    & nt prop $pageName @propAddArgs
}

# If stdin was provided, process it through serial then update
if ($hasStdin) {
    $inputs | & nt serial | & nt update $otherArgs $pageName
}
