#!/usr/bin/env pwsh

# Parse stdin into a hierarchical structure based on indentation
# Output as PowerShell objects with level, content, and children

$lines = $Input
$structure = @()
$stack = [System.Collections.ArrayList]@()

foreach ($line in $lines) {
    # Calculate indentation level (2 spaces per level)
    $level = 0
    $content = $line.Trim()
    
    $tempLine = $line
    while ($tempLine.StartsWith("  ")) {
        $level++
        $tempLine = $tempLine.Substring(2)
    }
    
    # Keep bullet prefix if present
    if ($tempLine.StartsWith("- ")) {
        $content = $tempLine.Substring(0)
    } elseif ($tempLine.StartsWith("-")) {
        $content = $tempLine.Substring(0)
    }
    
    $node = @{
        level = $level
        content = $content
        children = @()
    }
    
    # Find parent by popping from stack based on level
    while ($stack.Count -gt 0 -and $stack[$stack.Count-1].level -ge $level) {
        $null = $stack.RemoveAt($stack.Count-1)
    }
    
    if ($stack.Count -eq 0) {
        # Top-level item
        $structure += $node
    } else {
        # Add as child of current parent
        $stack[$stack.Count-1].children += $node
    }
    
    # Push current node to stack
    $null = $stack.Add($node)
}

# Output the structure as JSON for clarity
$structure | ConvertTo-Json -Depth 10