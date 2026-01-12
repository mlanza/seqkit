#!/usr/bin/env pwsh

# Parse arguments
if ($args.Count -eq 0) {
    Write-Error "Usage: nt swap <page-name> -- <pipeline-commands>"
    exit 1
}

$separatorIndex = $args.IndexOf("--")
if ($separatorIndex -eq -1) {
    Write-Error "Usage: nt swap <page-name> -- <pipeline-commands>"
    exit 1
}

$pageArgs = $args[0..($separatorIndex - 1)]
$pipelineArgs = $args[($separatorIndex + 1)..($args.Count - 1)]

if ($pipelineArgs.Count -eq 0 -or ($pipelineArgs.Count -eq 1 -and $pipelineArgs[0] -eq "--")) {
    Write-Error "Pipeline commands required after --"
    exit 1
}

# Determine if we have a quoted multi-operation pipeline
$pipelineString = $null
if ($pipelineArgs.Count -eq 1 -and $pipelineArgs[0].Contains("|")) {
    # Single quoted argument containing pipe characters - use as complete pipeline
    $pipelineString = $pipelineArgs[0]
} else {
    # Multiple arguments or single argument without pipes - join with spaces (existing behavior)
    $pipelineString = $pipelineArgs -join " "
}

# Build complete command string and capture output in memory
$pageArgsString = $pageArgs | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }
$fullCommand = "nt page " + ($pageArgsString -join " ") + " --heading=0 | " + $pipelineString

# Execute the pipeline and capture output in memory
$result = pwsh -Command $fullCommand | Out-String

# Extract page name from args for write operation
$writePageName = $pageArgs[0]

# Write result back to page
$result | & nt write $writePageName --overwrite

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to write page content for: $pageName"
    exit 1
}