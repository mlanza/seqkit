#!/usr/bin/env deno run --allow-all

// Wipe - Remove all content blocks from a Logseq page while preserving properties
// Usage: deno run wipe.js [--debug] <page_name>

const LOGSEQ_ENDPOINT = Deno.env.get("LOGSEQ_ENDPOINT") || "";
const LOGSEQ_TOKEN = Deno.env.get("LOGSEQ_TOKEN") || "";

if (!LOGSEQ_ENDPOINT || !LOGSEQ_TOKEN) {
    console.error("Error: LOGSEQ_ENDPOINT and LOGSEQ_TOKEN environment variables must be set");
    Deno.exit(1);
}

let DEBUG_MODE = false;
let PAGE_NAME = "";

// Parse arguments
const args = Deno.args;
for (let i = 0; i < args.length; i++) {
    if (args[i] === "--debug") {
        DEBUG_MODE = true;
    } else {
        PAGE_NAME = args[i];
    }
}

if (!PAGE_NAME) {
    console.error("Usage: deno run wipe.js [--debug] <page_name>");
    Deno.exit(1);
}

if (DEBUG_MODE) console.log(`%cWiping content from page '${PAGE_NAME}'...`, "color: yellow");

// Check if page exists
async function checkPageExists(pageName) {
    const response = await fetch(LOGSEQ_ENDPOINT, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${LOGSEQ_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            method: "logseq.Editor.getPage",
            args: [pageName]
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
}

// Get page blocks using Logseq API directly
async function getPageBlocks(pageName) {
    const response = await fetch(LOGSEQ_ENDPOINT, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${LOGSEQ_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            method: "logseq.Editor.getPageBlocksTree",
            args: [pageName]
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
}

// Remove a block
async function removeBlock(blockUuid) {
    const response = await fetch(LOGSEQ_ENDPOINT, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${LOGSEQ_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            method: "logseq.Editor.removeBlock",
            args: [blockUuid]
        })
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    return result;
}

// Main execution
async function main() {
    try {
        // Check if page exists
        const pageCheck = await checkPageExists(PAGE_NAME);
        
        if (!pageCheck.uuid) {
            console.error(`Error: Page '${PAGE_NAME}' does not exist`);
            Deno.exit(1);
        }

        const PAGE_UUID = pageCheck.uuid;
        if (DEBUG_MODE) console.log(`%cPage exists with UUID: ${PAGE_UUID}`, "color: green");

        // Get all page blocks
        const pageBlocks = await getPageBlocks(PAGE_NAME);

        if (!pageBlocks || pageBlocks.length === 0) {
            console.log(`✅ Page '${PAGE_NAME}' is already empty`);
            Deno.exit(0);
        }

        // Find blocks to delete (those without meaningful properties)
        const BLOCKS_TO_DELETE = [];
        const PROPERTIES_BLOCKS_FOUND = [];

        for (const block of pageBlocks) {
            let hasRealProperties = false;
            
            if (block.properties && typeof block.properties === 'object' && Object.keys(block.properties).length > 0) {
                if (block.content !== "" && block.content !== null) {
                    hasRealProperties = true;
                }
            }
            
            if (hasRealProperties) {
                PROPERTIES_BLOCKS_FOUND.push(block);
                if (DEBUG_MODE) console.log(`%cFound properties block, keeping: ${block.uuid}`, "color: cyan");
            } else {
                BLOCKS_TO_DELETE.push(block);
                if (DEBUG_MODE) console.log(`%cMarked for deletion: ${block.uuid} - content: '${block.content}'`, "color: red");
            }
        }

        if (BLOCKS_TO_DELETE.length === 0) {
            console.log(`✅ Page '${PAGE_NAME}' already only contains properties`);
            Deno.exit(0);
        }

        if (DEBUG_MODE) {
            console.log(`%cFound ${BLOCKS_TO_DELETE.length} blocks to delete`, "color: red");
            console.log(`%cFound ${PROPERTIES_BLOCKS_FOUND.length} properties blocks to keep`, "color: cyan");
        }

        // Delete each non-property block
        let DELETED_COUNT = 0;
        for (const block of BLOCKS_TO_DELETE) {
            if (DEBUG_MODE) console.log(`%cDeleting block: ${block.uuid}`, "color: yellow");
            
            try {
                const deleteResponse = await removeBlock(block.uuid);
                
                if (deleteResponse === null) {
                    DELETED_COUNT++;
                    if (DEBUG_MODE) console.log(`%cDeleted block: ${block.uuid}`, "color: green");
                } else {
                    if (DEBUG_MODE) console.log(`%cFailed to delete block: ${block.uuid}`, "color: red");
                }
            } catch (error) {
                if (DEBUG_MODE) console.log(`%cFailed to delete block: ${block.uuid} - ${error.message}`, "color: red");
            }
        }

        if (DELETED_COUNT === BLOCKS_TO_DELETE.length) {
            console.log(`✅ Wiped ${DELETED_COUNT} content blocks from page '${PAGE_NAME}' (preserved ${PROPERTIES_BLOCKS_FOUND.length} property blocks)`);
        } else {
            console.error(`Error: Only deleted ${DELETED_COUNT} out of ${BLOCKS_TO_DELETE.length} blocks`);
            Deno.exit(1);
        }

    } catch (error) {
        console.error(`Error: ${error.message}`);
        Deno.exit(1);
    }
}

await main();