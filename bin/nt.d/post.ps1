#!/usr/bin/env pwsh

# Post - Process stdin through serial then pipe to update
# Usage: echo "content" | nt post [--prepend] [--debug] [--overwrite] <page_name>

$inputs = [Console]::In.ReadToEnd()

if ([string]::IsNullOrWhiteSpace($inputs)) {
    Write-Error "Error: No content received from stdin"
    exit 1
}

# Process the input through nt serial, then pipe to nt update with all arguments
$inputs | ./bin/nt serial | ./bin/nt update $args