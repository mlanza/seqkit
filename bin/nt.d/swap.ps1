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

# Build complete command string with temp file for buffering
$tempFile = [System.IO.Path]::GetTempFileName()
$pageArgsString = $pageArgs | ForEach-Object { if ($_ -match '\s') { "`"$_`"" } else { $_ } }
$fullCommand = "nt page " + ($pageArgsString -join " ") + " | " + $pipelineString + " | Out-File -FilePath `"$tempFile`" -Encoding utf8"

# Execute the pipeline directly using pwsh
pwsh -Command $fullCommand

# Allow pipeline to complete
Start-Sleep -Milliseconds 300

# Extract page name from args for write operation
$writePageName = $pageArgs[0]

# Read result and write back
$result = Get-Content -Path $tempFile -Raw
$result | & nt write $writePageName --overwrite

# Clean up
Remove-Item $tempFile -Force

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to write page content for: $pageName"
    exit 1
}