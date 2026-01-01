#!/usr/bin/env pwsh
# loosely emulates Logseq's document mode

param(
    [switch]$para
)

# Parse stdin into structure using struct
$structure = $Input | nt struct | ConvertFrom-Json

# Function to fix content by trimming each line
function Unindent-Content {
    param($content)

    $lines = $content -split "`n"
    $fixedLines = @()

    foreach ($line in $lines) {
        if ($line -match '^- ' -or $line -match '^  ') {
            $fixedLines += $line.Substring(2)
        } else {
            $fixedLines += $line
        }
    }

    return $fixedLines -join "`n"
}

# Function to recursively render the structure
function Render-Node {
    param($node, $level = 0, $isLastChild = $false)

    # Remove one level of indentation/bullet only from level 0 content
    $content = Unindent-Content -content $node.content

    Write-Output $content

    # Render children
    foreach ($child in $node.children) {
        Render-Node -node $child -level ($level + 1) -isLastChild ($child -eq $node.children[-1])
    }

    # If para mode and this is a level 0 node with bulleted content, add blank line after rendering all children
    if ($para -and $level -eq 0 -and $node.content -match '^- ') {
        Write-Output ""
    }
}

# Render all top-level nodes
foreach ($node in $structure) {
    Render-Node -node $node -level 0
}
