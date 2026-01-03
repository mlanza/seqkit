#!/usr/bin/env pwsh

# Post2 - Insert structured content into a new Logseq page using insertBatchBlock
# Usage: nt p <source_page> | nt serial | nt post2 <target_page>

# Environment variables
$LOGSEQ_ENDPOINT = $env:LOGSEQ_ENDPOINT ?? ""
$LOGSEQ_TOKEN = $env:LOGSEQ_TOKEN ?? ""

# Check environment variables
if ([string]::IsNullOrEmpty($LOGSEQ_ENDPOINT) -or [string]::IsNullOrEmpty($LOGSEQ_TOKEN)) {
    Write-Error "Error: LOGSEQ_ENDPOINT and LOGSEQ_TOKEN environment variables must be set"
    exit 1
}

# Check arguments
if ($args.Count -ne 1) {
    Write-Error "Usage: $($MyInvocation.MyCommand.Name) <page_name>"
    exit 1
}

$PAGE_NAME = $args[0]

# Read JSON payload from stdin
$PAYLOAD = [Console]::In.ReadToEnd()

# Validate payload is not empty
if ([string]::IsNullOrWhiteSpace($PAYLOAD)) {
    Write-Error "Error: No payload received from stdin"
    exit 1
}

Write-Host "Creating page '$PAGE_NAME' with structured content..." -ForegroundColor Yellow

# First, try to get the page to see if it exists
$PAGE_CHECK = curl -s -X POST "$LOGSEQ_ENDPOINT" `
    -H "Authorization: Bearer $LOGSEQ_TOKEN" `
    -H "Content-Type: application/json" `
    -d "{""method"":""logseq.Editor.getPage"",""args"":[""$PAGE_NAME""]}" | ConvertFrom-Json

# Check if page exists and extract UUID
if ($PAGE_CHECK.uuid) {
    $PAGE_UUID = $PAGE_CHECK.uuid
    Write-Host "Page exists, appending content..." -ForegroundColor Yellow
} else {
    Write-Host "Page doesn't exist, creating new page..." -ForegroundColor Yellow
    
    # Create the page first
    $CREATE_RESPONSE = curl -s -X POST "$LOGSEQ_ENDPOINT" `
        -H "Authorization: Bearer $LOGSEQ_TOKEN" `
        -H "Content-Type: application/json" `
        -d "{""method"":""logseq.Editor.createPage"",""args"":[""$PAGE_NAME"",{}]}" | ConvertFrom-Json

    if ($CREATE_RESPONSE.uuid) {
        $PAGE_UUID = $CREATE_RESPONSE.uuid
        Write-Host "Created page with UUID: $PAGE_UUID" -ForegroundColor Green
    } else {
        Write-Error "Error creating page. Response:"
        $CREATE_RESPONSE | ConvertTo-Json -Depth 10 | Write-Error
        exit 1
    }
}

# For existing pages, get last block to append after it
if ($PAGE_CHECK.uuid) {
    Write-Host "Finding last block for append..." -ForegroundColor Yellow
    $PAGE_BLOCKS = curl -s -X POST "$LOGSEQ_ENDPOINT" `
        -H "Authorization: Bearer $LOGSEQ_TOKEN" `
        -H "Content-Type: application/json" `
        -d "{""method"":""logseq.Editor.getPageBlocksTree"",""args"":[""$PAGE_NAME""]}" | ConvertFrom-Json

    if ($PAGE_BLOCKS -is [array] -and $PAGE_BLOCKS.Count -gt 0) {
        $LAST_BLOCK_UUID = $PAGE_BLOCKS[-1].uuid
        Write-Host "Appending after block: $LAST_BLOCK_UUID" -ForegroundColor Yellow

        # Append after last block using sibling:true
        $INSERT_RESPONSE = curl -s -X POST "$LOGSEQ_ENDPOINT" `
            -H "Authorization: Bearer $LOGSEQ_TOKEN" `
            -H "Content-Type: application/json" `
            -d "{
                ""method"":""logseq.Editor.insertBatchBlock"",
                ""args"":[
                    ""$LAST_BLOCK_UUID"",
                    $PAYLOAD,
                    {""sibling"":true}
                ]
            }" | ConvertFrom-Json
    } else {
        Write-Host "Page is empty, inserting at top..." -ForegroundColor Yellow
        $INSERT_RESPONSE = curl -s -X POST "$LOGSEQ_ENDPOINT" `
            -H "Authorization: Bearer $LOGSEQ_TOKEN" `
            -H "Content-Type: application/json" `
            -d "{
                ""method"":""logseq.Editor.insertBatchBlock"",
                ""args"":[
                    ""$PAGE_UUID"",
                    $PAYLOAD,
                    {""sibling"":false}
                ]
            }" | ConvertFrom-Json
    }
} else {
    # Insert into new page using page UUID
    $INSERT_RESPONSE = curl -s -X POST "$LOGSEQ_ENDPOINT" `
        -H "Authorization: Bearer $LOGSEQ_TOKEN" `
        -H "Content-Type: application/json" `
        -d "{
            ""method"":""logseq.Editor.insertBatchBlock"",
            ""args"":[
                ""$PAGE_UUID"",
                $PAYLOAD,
                {""sibling"":false}
            ]
        }" | ConvertFrom-Json
}

# Check if insertion was successful
# Note: insertBatchBlock returns 'null' on success when creating new content
if ($null -eq $INSERT_RESPONSE) {
    $BLOCK_COUNT = ($PAYLOAD | ConvertFrom-Json).Count
    Write-Host "✅ SUCCESS: Appended $BLOCK_COUNT blocks to page '$PAGE_NAME'" -ForegroundColor Green
} elseif ($INSERT_RESPONSE -is [array]) {
    $BLOCK_COUNT = $INSERT_RESPONSE.Count
    Write-Host "✅ SUCCESS: Added $BLOCK_COUNT blocks to page '$PAGE_NAME'" -ForegroundColor Green
} else {
    Write-Error "Error creating page. Response:"
    $INSERT_RESPONSE | ConvertTo-Json -Depth 10 | Write-Error
    exit 1
}