#!/usr/bin/env deno run --allow-all

/**
 * Serial.js - Convert structured markdown from stdin to Logseq insertBatchBlock payload
 *
 * This program reads Logseq page content from stdin and outputs JSON that is
 * compatible with insertBatchBlock API method. It preserves hierarchy,
 * extracts properties, handles task markers, and formats content appropriately.
 *
 * KEY LOGSEQ PRINCIPLES:
 * 1. Only "- " prefixed lines create new blocks - these determine hierarchy
 * 2. Property lines ("key:: value") and content lines attach to CURRENT block
 * 3. Nesting is determined by indentation level of "- " blocks ONLY
 * 4. Hanging content (continuations) are treated as part of the current block
 */

class SerialParser {
  constructor() {
    this.state = {
      rootBlocks: [],
      blockStack: [], // Stack to track current block hierarchy by level
      currentBlock: null, // The most recently created block
      currentBlockLevel: -1,
      headerContent: null,
      headerProperties: {},
      collectingProperties: false,
      pendingProperties: null // Properties to apply to first block
    };
  }

  parseLine(line) {
    const trimmed = line.trimStart();

    // Skip empty lines
    if (!trimmed) {
      return null;
    }

    // Handle header line - only collect it, don't return for processing
    if (this.state.headerContent === null && trimmed.startsWith('# ')) {
      this.state.headerContent = trimmed;
      return null; // Don't process this line further
    }

    // Handle properties before any block - treat as regular properties to be attached to first block
    if (this.state.headerContent === null && trimmed.includes('::') && !trimmed.startsWith('- ')) {
      return { type: 'property', content: trimmed };
    }

    // If we're still in the header section (properties after title)
    if (this.state.headerContent !== null && trimmed.includes('::') && !trimmed.startsWith('- ')) {
      return { type: 'header-property', level: 0, content: trimmed };
    }

    // If we encounter a non-property line after collecting header properties, finalize the header
    if ((this.state.headerContent !== null || this.state.collectingProperties) && !trimmed.includes('::')) {
      const headerBlock = this.finalizeHeader();
      if (headerBlock) {
        this.state.rootBlocks.push(headerBlock);
      }
      this.state.headerContent = null;
      this.state.collectingProperties = false;
      this.state.headerProperties = {};
    }

    // ONLY lines starting with "- " create new blocks
    if (trimmed.startsWith('- ')) {
      // Calculate indentation level properly - handle both tabs and spaces
      const leadingWhitespace = line.substring(0, line.length - trimmed.length);
      const tabCount = (leadingWhitespace.match(/\t/g) || []).length;
      const spaceCount = leadingWhitespace.length - tabCount;
      const blockIndent = tabCount + Math.floor(spaceCount / 2);

      const content = trimmed.substring(2).trim();
      return { type: 'block', level: blockIndent, content };
    }

    // Property lines attach to current block
    if (trimmed.includes('::')) {
      return { type: 'property', content: trimmed };
    }

    // Everything else is hanging content for current block
    return { type: 'content', content: trimmed };
  }

  finalizeHeader() {
    let headerContent = this.state.headerContent || '';
    const { properties, cleanContent } = this.extractProperties(headerContent);
    // Merge with accumulated header properties
    Object.assign(properties, this.state.headerProperties);

    // Only create a block if we have actual header content
    if (!headerContent.startsWith('# ')) {
      return null;
    }

    const block = {
      properties: this.formatProperties(properties),
      preBlock: true
    };

    // Only include content if we have actual content after cleaning
    if (cleanContent && cleanContent.trim()) {
      block.content = cleanContent + '\n';
    }

    return block;
  }

  extractMarker(content) {
    const markerRegex = /^(TODO|DOING|DONE|WAITING|CANCELED|NOW|LATER)\s+(.+)/i;
    const match = content.match(markerRegex);
    if (match) {
      return { marker: match[1].toUpperCase(), content: match[2].trim() };
    }
    return { marker: null, content };
  }

  extractProperties(content) {
    if (/^(.+?)::\s*(.+)$/.test(content.trim())) {
      const propertyRegex = /^(.+?)::\s*(.+)$/gm;
      const properties = {};
      let cleanContent = content;

      let match;
      while ((match = propertyRegex.exec(content)) !== null) {
        const [full, key, value] = match;
        properties[key.trim()] = value.trim();
        cleanContent = cleanContent.replace(full, '').trim();
      }

      return { properties, cleanContent };
    }

    return { properties: {}, cleanContent: content };
  }

  formatProperties(properties) {
    const arrayKeys = ['tags', 'alias', 'prerequisites'];
    const formatted = {};

    for (const key of Object.keys(properties)) {
      if (arrayKeys.includes(key)) {
        formatted[key] = properties[key]
          .split(',')
          .map(item => item.trim().replace(/[\[\]]/g, ''))
          .filter(item => item.length > 0);
      } else {
        formatted[key] = properties[key];
      }
    }

    return formatted;
  }

  createBlock(content) {
    const { marker, cleanContent: markerContent } = this.extractMarker(content);

    let finalContent = markerContent || content;
    const allProperties = {};

    // Apply any pending properties to the first block
    if (this.state.pendingProperties) {
      Object.assign(allProperties, this.state.pendingProperties);
      this.state.pendingProperties = null; // Clear after applying
    }

    // Extract any inline properties from the content itself
    const { properties: inlineProperties, cleanContent } = this.extractProperties(finalContent);
    Object.assign(allProperties, inlineProperties);
    finalContent = cleanContent;

    // Handle collapsed:: true property
    if (allProperties.collapsed === 'true') {
      allProperties.collapsed = true;
    }

    // Don't extract priority markers like [#A] - leave them as inline content
    // They are not properties, just regular content

    const block = {
      content: finalContent || ''
    };

    if (marker) {
      block.marker = marker;
    }

    // Handle collapsed as special top-level property, not in properties object
    if (allProperties.collapsed === true) {
      block.collapsed = true;
      delete allProperties.collapsed;
    }

    if (Object.keys(allProperties).length > 0) {
      block.properties = this.formatProperties(allProperties);
    }

    return block;
  }

  addPropertyToCurrentBlock(propertyContent) {
    const { properties } = this.extractProperties(propertyContent);

    // If we don't have a current block yet, store these properties to be applied to the first block
    if (!this.state.currentBlock) {
      if (!this.state.pendingProperties) {
        this.state.pendingProperties = {};
      }
      Object.assign(this.state.pendingProperties, properties);
      return;
    }

    if (!this.state.currentBlock.properties) {
      this.state.currentBlock.properties = {};
    }

    // Handle collapsed as special top-level property
    if (properties.collapsed === 'true') {
      this.state.currentBlock.collapsed = true;
      delete properties.collapsed;
    }

    Object.assign(this.state.currentBlock.properties, this.formatProperties(properties));
  }

  appendContentToCurrentBlock(content) {
    if (!this.state.currentBlock) {
      console.error('Warning: Content found without current block:', content);
      return;
    }

    // Append content with newline if there's already content
    if (this.state.currentBlock.content) {
      this.state.currentBlock.content += '\n' + content;
    } else {
      this.state.currentBlock.content = content;
    }
  }

  handleBlock(parsedLine) {
    const { level, content } = parsedLine;

    // Create the new block
    const newBlock = this.createBlock(content);

    // Adjust stack to match the new block's level
    while (this.state.blockStack.length > level) {
      this.state.blockStack.pop();
    }

    // Add missing parent blocks if needed (shouldn't happen in well-formed input)
    while (this.state.blockStack.length < level) {
      if (this.state.blockStack.length === 0 && this.state.rootBlocks.length > 0) {
        this.state.blockStack.push(this.state.rootBlocks[this.state.rootBlocks.length - 1]);
      } else if (this.state.blockStack.length > 0) {
        this.state.blockStack.push(this.state.blockStack[this.state.blockStack.length - 1]);
      } else {
        // Create placeholder block - this shouldn't happen with valid input
        const placeholder = { content: '' };
        this.state.rootBlocks.push(placeholder);
        this.state.blockStack.push(placeholder);
      }
    }

    // Determine parent and add to appropriate children array
    if (level === 0) {
      // Top-level block
      this.state.rootBlocks.push(newBlock);
    } else {
      // Nested block - add to parent's children
      const parent = this.state.blockStack[level - 1];
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(newBlock);
    }

    // Update stack and current block
    this.state.blockStack[level] = newBlock;
    this.state.currentBlock = newBlock;
    this.state.currentBlockLevel = level;
  }

  handleLine(parsedLine) {
    if (!parsedLine) return;

    const { type, content } = parsedLine;

    if (type === 'header-property') {
      const { properties } = this.extractProperties(content);
      Object.assign(this.state.headerProperties, properties);
      return;
    }

    if (type === 'block') {
      this.handleBlock(parsedLine);
    } else if (type === 'property') {
      this.addPropertyToCurrentBlock(content);
    } else if (type === 'content') {
      this.appendContentToCurrentBlock(content);
    }
  }

  parse(input) {
    const lines = input.split('\n').filter(line => line.trim().length > 0);

    for (const line of lines) {
      try {
        const parsedLine = this.parseLine(line);
        this.handleLine(parsedLine);
      } catch (error) {
        console.error(`Error parsing line: ${line.trim()}`, error);
        process.exitCode = 1;
      }
    }

    // Finalize header if we never encountered a non-property line
    if (this.state.headerContent !== null || this.state.collectingProperties) {
      const headerBlock = this.finalizeHeader();
      if (headerBlock) {
        this.state.rootBlocks.push(headerBlock);
      }
    }

    return this.state.rootBlocks;
  }
}

async function main() {
  try {
    const input = await Deno.readTextFile('/dev/stdin');

    if (!input.trim()) {
      console.error("Error: No input provided via stdin");
      Deno.exit(1);
    }

    const parser = new SerialParser();
    const result = parser.parse(input);
    console.log(JSON.stringify(result, null, 2));

  } catch (error) {
    console.error("Error:", error.message);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
