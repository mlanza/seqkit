// Helper function from original code
function normalizeSeparator(lines) {
  return lines.filter(line => line.trim() !== '');
}

// Recursive filtering function for blocks
function selectBlock(block, keep, fixed) {
  const {content, properties} = block;

  const line = content.split("\n")?.[0]; //matching happens against first line only
  // Test content with and without marker to catch both cases
  const kept = fixed(line) || keep(line);

  if (!kept) {
    return null;
  }

  let filteredChildren = [];
  if (block.children && Array.isArray(block.children)) {
    filteredChildren = block.children
      .map(child => selectBlock(child, keep, fixed))
      .filter(child => child !== null); // Remove null entries (filtered out children)
  }

  // If this block doesn't have meaningful content and all children were filtered out, filter this block too
  const hasContent = content || null;
  const hasProperties = properties && Object.keys(properties).length > 0;
  const hasMeaningfulContent = hasContent || hasProperties;

  if (!hasMeaningfulContent && filteredChildren.length === 0) {
    return null; // This block has no meaningful content and no children after filtering
  }

  // Keep this block (it doesn't match any patterns)
  return {
    ...block,
    children: filteredChildren
  };
}

class Parser {
  constructor() {
    this.state = {
      rootBlocks: [],
      blockStack: [], // Stack to track current block hierarchy by level
      currentBlock: null, // The most recently created block
      currentBlockLevel: -1,
      headerContent: null,
      headerProperties: {},
      pageProperties: {}, // Properties before any blocks
      collectingProperties: false,
      pendingProperties: null, // Properties to apply to first block
      hasStartedBlocks: false // Track if we've started processing blocks
    };
  }

  parseLine(line) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      return null;
    }

    // Handle header line - only collect it, don't return for processing
    if (this.state.headerContent === null && trimmed.startsWith('# ')) {
      this.state.headerContent = trimmed;
      return null; // Don't process this line further
    }

    // Handle properties before any block - these are page properties
    if (this.state.headerContent === null && !this.state.hasStartedBlocks && trimmed.includes('::') && !trimmed.startsWith('- ')) {
      return { type: 'page-property', content: trimmed };
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
      // Mark that we've started processing blocks
      this.state.hasStartedBlocks = true;

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
    const booleanKeys = ['collapsed'];
    const formatted = {};

    for (const key of Object.keys(properties)) {
      if (arrayKeys.includes(key)) {
        formatted[key] = properties[key]
          .split(',')
          .map(item => item.trim().replace(/[\[\]]/g, ''))
          .filter(item => item.length > 0);
      } else if (booleanKeys.includes(key)) {
        // Convert string 'true'/'false' to boolean
        formatted[key] = properties[key] === 'true' || properties[key] === true;
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

    if (type === 'page-property') {
      const { properties } = this.extractProperties(content);
      Object.assign(this.state.pageProperties, properties);
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

    // If we have page properties, add them as an empty block with just properties
    if (Object.keys(this.state.pageProperties).length > 0) {
      const pagePropertyBlock = {
        content: "",
        properties: this.formatProperties(this.state.pageProperties)
      };
      this.state.rootBlocks.unshift(pagePropertyBlock);
    }

    return this.state.rootBlocks;
  }

  static parse(text) {
    const parser = new Parser();
    return parser.parse(text);
  }
}

class Stringifier {
  static convert(blocks, level = 0) {
    return this.recursiveConvert(blocks, level);
  }

  static recursiveConvert(blocks, level = 0) {
    const lines = [];
    const indent = '  '.repeat(level);
    const hanging = '  '.repeat(level + 1);

    blocks.forEach(function(block) {
      const {content, children, properties, preBlock} = block;

      // Handle preBlock (headers with properties)
      if (preBlock && properties) {
        // Handle content (header) first
        if (content) {
          const [line, ...parts] = content.split("\n");
          lines.push(`${indent}${line}`);
          for(const line of normalizeSeparator(parts)){
            lines.push(`${indent}${line}`);
          }
        }

        // Add properties after header
        for (const [key, value] of Object.entries(properties)) {
          if (Array.isArray(value)) {
            const formattedValue = value.map(item =>
              item.includes(' ') ? `[[${item}]]` : item
            ).join(', ');
            lines.push(`${indent}${key}:: ${formattedValue}`);
          } else {
            const formattedValue = typeof value === 'string' && value.includes(' ') ? `[[${value}]]` : value;
            lines.push(`${indent}${key}:: ${formattedValue}`);
          }
        }

        // Add blank line after properties
        lines.push('');
      }
      // Handle regular blocks
      else if (content) {
        const [line, ...parts] = content.split("\n");
        if (line.includes("::")) {
          lines.push(`${indent}${line}`);
          for(const line of normalizeSeparator(parts)){
            lines.push(`${indent}${line}`);
          }
        } else {
          lines.push(`${indent}- ${line}`);
          for(const line of parts){
            if (!line.startsWith("collapsed:: ")) {
              lines.push(`${hanging}${line}`);
            }
          }
        }
      }

      if (children && children.length > 0) {
        lines.push(...Stringifier.recursiveConvert(children, level + 1));
      }
    });

    return lines;
  }

  static stringify(blocks) {
    return this.recursiveConvert(blocks).join('\n');
  }
}

class LogseqPage {
  static parse(text) {
    return Parser.parse(text);
  }

  static stringify(blocks, keep = null, fixed = null) {
    // Apply filtering if keep is provided
    const selectedBlocks = keep ? blocks
      .map(block => selectBlock(block, keep, fixed || (() => false)))
      .filter(block => block !== null) : blocks;

    return Stringifier.stringify(selectedBlocks);
  }
}

export default LogseqPage;
