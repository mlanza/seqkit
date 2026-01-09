#!/usr/bin/env pwsh

# Post - Process stdin or argument through serial then pipe to update, or handle properties only
# Usage: echo "content" | nt post [--prepend] [--debug] [--overwrite] [--add "key=value"...] <page_name>
# Usage: nt post [--prepend] [--debug] [--overwrite] [--add "key=value"...] <page_name> "[content]"
# Usage: nt post [--add "key=value"...] <page_name>

# --- Argument and Input Parsing ---
$linesToProcess = @()
$propArgs = @()
$otherArgs = @()
$pageName = $null
$pageNameFound = $false

# Check for stdin first
if ([Console]::IsInputRedirected) {
    $stdinText = [Console]::In.ReadToEnd().Trim()
    if (-not [string]::IsNullOrWhiteSpace($stdinText)) {
        $linesToProcess += ($stdinText -split '\r?\n')
    }
}

# Parse command-line arguments
$i = 0
while ($i -lt $args.Count) {
    $arg = $args[$i]
    if ($arg -eq "--add" -and $i + 1 -lt $args.Count) {
        $propArgs += $args[$i + 1]
        $i += 2
        continue
    }

    if ($arg.StartsWith("-")) {
        $otherArgs += $arg
        $i++
        continue
    }

    if (-not $pageNameFound) {
        $pageName = $arg
        $pageNameFound = $true
    } else {
        # The content argument.
        # Interpret literal '\n' as actual newlines.
        $linesToProcess += (($arg.Replace('\n', "`n")) -split '\r?\n')
    }
    $i++
}

# Handle property arguments if provided
if ($propArgs.Count -gt 0) {
    $propAddArgs = $propArgs | ForEach-Object { "--add", $_ }
    & nt prop $pageName @propAddArgs
}

# Unified Pipeline: Process all collected lines from any source
if ($linesToProcess.Count -gt 0) {
    $linesToProcess | & nt blocked | & nt blocks | & nt update $otherArgs $pageName
}
