#!/usr/bin/env deno run --allow-all

// modify.js - JavaScript equivalent of update.ps1
// Post - Insert structured content into a Logseq page using insertBatchBlock
// Usage: nt p <source_page> | nt serial | nt modify [--prepend] [--debug] [--overwrite] <target_page>

import { Command } from "https://deno.land/x/cliffy@v1.0.0-rc.4/command/mod.ts";

// Environment variables
const LOGSEQ_ENDPOINT = Deno.env.get("LOGSEQ_ENDPOINT") ?? "";
const LOGSEQ_TOKEN = Deno.env.get("LOGSEQ_TOKEN") ?? "";

function abort(error) {
  console.error('Aborted:', error);
  Deno.exit(1);
}

function debugLog(message, debug = false) {
  if (debug) {
    console.log(message);
  }
}

// Adapted from note.js
async function callLogseq(method, args = null) {
  try {
    if (!LOGSEQ_ENDPOINT) {
      throw new Error('LOGSEQ_ENDPOINT environment variable is not set');
    }

    if (!LOGSEQ_TOKEN) {
      throw new Error('LOGSEQ_TOKEN environment variable is not set');
    }

    const payload = { method };
    if (args) {
      payload.args = args;
    }

    const response = await fetch(LOGSEQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOGSEQ_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const result = await response.json();
    if (result?.error) {
      throw new Error(result.error);
    }

    return result;

  } catch (ex) {
    throw ex;
  }
}

async function readStdin() {
  const decoder = new TextDecoder();
  let payload = "";

  try {
    for await (const chunk of Deno.stdin.readable) {
      payload += decoder.decode(chunk);
    }
  } catch (error) {
    abort(`Error reading stdin: ${error.message}`);
  }

  return payload.trim();
}

async function main() {
  const { args, options } = await new Command()
    .name("modify")
    .description("Insert structured content into a Logseq page using insertBatchBlock")
    .arguments("<page_name>")
    .option("--prepend", "Prepend content instead of appending")
    .option("--debug", "Enable debug output")
    .option("--overwrite", "Purge any existing page content (not properties)")
    .parse(Deno.args);

  const pageName = args[0];
  const prependMode = options.prepend || false;
  const debugMode = options.debug || false;
  const overwriteMode = options.overwrite || false;

  // Check environment variables
  if (!LOGSEQ_ENDPOINT || !LOGSEQ_TOKEN) {
    abort("Error: LOGSEQ_ENDPOINT and LOGSEQ_TOKEN environment variables must be set");
  }

  if (!pageName) {
    abort("Usage: modify [--prepend] [--debug] [--overwrite] <page_name>");
  }

  debugLog(`Page: ${pageName}, Prepend: ${prependMode}, Debug: ${debugMode}, Overwrite: ${overwriteMode}`, debugMode);

  // Read JSON payload from stdin
  const payload = await readStdin();

  if (!payload) {
    abort("Error: No payload received from stdin");
  }

  debugLog(`Payload: ${payload}`, debugMode);

  // Parse JSON payload
  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payload);
  } catch (error) {
    abort(`Error parsing JSON payload: ${error.message}`);
  }

  // Call purge if overwrite mode is enabled
  if (overwriteMode) {
    debugLog("Overwrite mode enabled, purging page first...", debugMode);
    const purgeCommand = new Deno.Command("pwsh", {
      args: ["./bin/nt.d/purge.ps1", ...(debugMode ? ["--debug"] : []), pageName]
    });

    const { code } = await purgeCommand.output();
    if (code !== 0) {
      debugLog("Warning: Purge had issues, continuing with overwrite...", debugMode);
      // Continue with overwrite even if purge had issues
    }
  }

  // Check if page exists and get page info
  let pageCheck;
  try {
    pageCheck = await callLogseq('logseq.Editor.getPage', [pageName]);
  } catch (error) {
    abort(`Error checking page existence: ${error.message}`);
  }

  debugLog(`Page check result: ${JSON.stringify(pageCheck)}`, debugMode);

  let insertResponse;

  if (pageCheck && pageCheck.uuid) {
    // Page exists
    const pageUuid = pageCheck.uuid;
    debugLog(`Page exists with UUID: ${pageUuid}`, debugMode);

    if (prependMode) {
      debugLog("Prepending content...", debugMode);

      // Get all page blocks to check for properties
      const pageBlocks = await callLogseq('logseq.Editor.getPageBlocksTree', [pageName]);

      // Find the last block with properties
      let lastPropertiesBlock = null;
      if (pageBlocks && Array.isArray(pageBlocks)) {
        for (const block of pageBlocks) {
          if (block.properties && Object.keys(block.properties).length > 0) {
            lastPropertiesBlock = block;
          }
        }
      }

      if (lastPropertiesBlock) {
        debugLog(`Found properties, inserting after them...`, debugMode);
        debugLog(`Properties content: ${lastPropertiesBlock.content}`, debugMode);

        // Insert after the properties block using sibling:true
        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          lastPropertiesBlock.uuid,
          parsedPayload,
          { sibling: true }
        ]);
      } else {
        debugLog("No properties found, prepending to top...", debugMode);

        // Prepend using page UUID with {sibling: false, before: true}
        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          pageUuid,
          parsedPayload,
          { sibling: false, before: true }
        ]);
      }
    } else {
      debugLog("Appending content...", debugMode);

      const pageBlocks = await callLogseq('logseq.Editor.getPageBlocksTree', [pageName]);

      if (pageBlocks && Array.isArray(pageBlocks) && pageBlocks.length > 0) {
        const lastBlockUuid = pageBlocks[pageBlocks.length - 1].uuid;
        debugLog(`Appending after block: ${lastBlockUuid}`, debugMode);

        // Append after last block using sibling:true
        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          lastBlockUuid,
          parsedPayload,
          { sibling: true }
        ]);
      } else {
        debugLog("Page is empty, inserting at top...", debugMode);

        insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
          pageUuid,
          parsedPayload,
          { sibling: false }
        ]);
      }
    }
  } else {
    // Page doesn't exist, create it
    debugLog("Page doesn't exist, creating new page...", debugMode);

    const createResponse = await callLogseq('logseq.Editor.createPage', [pageName, {}]);

    if (createResponse && createResponse.uuid) {
      const pageUuid = createResponse.uuid;
      debugLog(`Created page with UUID: ${pageUuid}`, debugMode);

      // Insert into new page using page UUID
      insertResponse = await callLogseq('logseq.Editor.insertBatchBlock', [
        pageUuid,
        parsedPayload,
        { sibling: false }
      ]);
    } else {
      abort("Error creating page");
    }
  }

  // Check if insertion was successful
  if (insertResponse === null) {
    const blockCount = Array.isArray(parsedPayload) ? parsedPayload.length : 1;
    const action = prependMode ? "Prepended" : "Appended";
    console.log(`✅ ${action} ${blockCount} blocks to page '${pageName}'`);
  } else if (Array.isArray(insertResponse)) {
    const blockCount = insertResponse.length;
    const action = prependMode ? "Prepended" : "Added";
    console.log(`✅ ${action} ${blockCount} blocks to page '${pageName}'`);
  } else {
    abort("Error creating page");
  }
}

if (import.meta.main) {
  await main();
}
