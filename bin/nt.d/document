#!/usr/bin/env pwsh
# loosely emulates Logseq's document mode

param(
    [switch]$para
)

# Parse stdin into structure using struct
$structure = $Input | nt struct | ConvertFrom-Json

# Function to recursively render the structure
function Render-Node {
    param($node, $level = 0, $isLastChild = $false)

    # Remove one level of indentation/bullet only from level 0 content
    $content = $node.content
    if ($level -eq 0) {
        if ($content -match '^- ' -or $content -match '^  ') {
            $content = $content.Substring(2)
        }
    }

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
