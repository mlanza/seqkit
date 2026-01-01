# Structured Block Insertion in Logseq

## Problem Statement

The current `append` command in `bin/nt.d/note.js` processes content line-by-line, which inherently destroys hierarchical structure. When piping indented content (representing nested blocks), structure is lost because each line becomes a flat block.

## Solution: `insertBatchBlock` API Method

**IMPORTANT:** The Logseq API **already supports** structured block insertion natively. The `insertBatchBlock` method automatically preserves hierarchy when given properly formatted structured content. No parsing or interpretation code is needed - you just format your input as structured blocks and the API handles the rest.

### API Overview

Logseq provides `logseq.Editor.insertBatchBlock()` which accepts hierarchical block structures and preserves them during insertion.

#### Method Signature
```javascript
logseq.Editor.insertBatchBlock(
  srcBlock: BlockIdentity,
  batch: IBatchBlock | IBatchBlock[],
  opts?: { before?: boolean; keepUUID?: boolean; sibling?: boolean }
): Promise<BlockEntity[]>
```

#### Block Structure Definition
```typescript
type IBatchBlock = {
  content: string;                    // Block content
  children?: IBatchBlock[];           // Nested child blocks
  properties?: Record<string, any>;    // Optional block properties
}
```

### Key Advantages Over Current `append`

| Feature | Current `append` | `insertBatchBlock` |
|---------|------------------|-------------------|
| Structure Preservation | ❌ Line-by-line flattening | ✅ Native hierarchical preservation |
| Performance | Multiple API calls | Single atomic operation |
| Atomicity | Partial failures possible | All-or-nothing insertion |
| Properties | Line-level only | Block-level properties supported |
| Implementation Complexity | Simple line processing | **Zero parsing needed** |

## Implementation Strategy

**The beauty of `insertBatchBlock` is that it requires minimal implementation code.** You simply:

1. Read stdin content (already formatted as structured JSON)
2. Pass it directly to the API
3. The API handles all structure preservation

### Simple Command Integration

```javascript
async function appendStructured(options, given) {
  try {
    const {name, path} = await identify(given);
    
    const hasStdin = !Deno.isatty(Deno.stdin.rid);
    if (!hasStdin) {
      throw new Error('Must supply structured content via stdin.');
    }

    // Read pre-formatted structured content
    const structuredContent = await Deno.readTextFile('/dev/stdin');
    const structuredBlocks = JSON.parse(structuredContent);
    
    // Get insertion point (last block or empty page)
    const pageBlocks = await callLogseq('logseq.Editor.getPageBlocksTree', [name]);
    
    if (pageBlocks && pageBlocks.length > 0) {
      // Insert after last block as sibling
      const lastBlock = pageBlocks[pageBlocks.length - 1];
      await callLogseq('logseq.Editor.insertBatchBlock', [
        lastBlock.uuid,
        structuredBlocks,
        { sibling: true }
      ]);
    } else {
      // Empty page - insert directly
      await callLogseq('logseq.Editor.insertBatchBlock', [
        name,
        structuredBlocks
      ]);
    }

    console.log(`Inserted structured content to: ${path}`);
  } catch (error) {
    abort(error);
  }
}
```

### CLI Command Registration

```javascript
program
  .command('insert-structured')
  .description("Insert JSON-formatted structured content from stdin")
  .arguments("<name>")
  .option('--exists', "Only if page exists")
  .action(appendStructured);
```

### Optional: Content Parsing (Only if you want to support indented text)

**Note:** This is ONLY needed if you want to convert indented plain text to structured format. If you provide pre-formatted JSON, this step is unnecessary.

```javascript
// Optional helper - ONLY for indented text -> JSON conversion
function parseIndentedContent(text) {
  const lines = text.split('\n').filter(line => line.trim());
  const root = [];
  const stack = [{ level: -1, children: root }];
  
  for (const line of lines) {
    const level = (line.match(/^ */)?.[0]?.length || 0) / 2;
    const content = line.trim();
    
    const block = { content, children: [] };
    
    while (stack[stack.length - 1].level >= level) {
      stack.pop();
    }
    
    stack[stack.length - 1].children.push(block);
    stack.push({ level, children: block.children });
  }
  
  return root;
}
```

### 2. Command Integration

Following the existing Task pattern in `note.js`:

```javascript
async function appendStructured(options, given) {
  try {
    const {name, path} = await identify(given);
    
    const hasStdin = !Deno.isatty(Deno.stdin.rid);
    if (!hasStdin) {
      throw new Error('Must supply content via stdin.');
    }

    const content = await Deno.readTextFile('/dev/stdin');
    
    // Parse hierarchical structure
    const structuredBlocks = parseIndentedContent(content);
    
    // Get insertion point (last block or empty page)
    const pageBlocks = await callLogseq('logseq.Editor.getPageBlocksTree', [name]);
    
    if (pageBlocks && pageBlocks.length > 0) {
      // Insert after last block as sibling
      const lastBlock = pageBlocks[pageBlocks.length - 1];
      await callLogseq('logseq.Editor.insertBatchBlock', [
        lastBlock.uuid,
        structuredBlocks,
        { sibling: true }
      ]);
    } else {
      // Empty page - insert directly
      for (const block of structuredBlocks) {
        await callLogseq('logseq.Editor.appendBlockInPage', [name, block.content]);
        // Handle children recursively if needed
      }
    }

    console.log(`Inserted structured content with ${structuredBlocks.length} top-level blocks to: ${path}`);
  } catch (error) {
    abort(error);
  }
}
```

### 3. CLI Command Registration

```javascript
program
  .command('insert-structured')
  .description("Insert structured content from stdin preserving hierarchy")
  .arguments("<name>")
  .option('--exists', "Only if page exists")
  .action(appendStructured);
```

## Usage Examples

### Direct JSON Input (Recommended)
```bash
# Pipe pre-formatted JSON structure to page
cat << 'EOF' | nt insert-structured MyPage
[
  {
    "content": "Main topic",
    "children": [
      {
        "content": "First subtopic", 
        "children": [
          {"content": "Detailed point about subtopic", "children": []},
          {"content": "Another detail", "children": []}
        ]
      },
      {"content": "Second subtopic", "children": []}
    ]
  },
  {"content": "Another main topic", "children": []}
]
EOF
```

### Optional: Indented Text Support
```bash
# If you implement the optional parsing function:
nt insert-structured MyPage << 'EOF'
Main topic
  First subtopic
    Detailed point about subtopic
    Another detail
  Second subtopic
Another main topic
EOF
```

### CLI Usage
```bash
# From JSON file
cat structured-notes.json | nt insert-structured MyPage

# With JSON heredoc (cleanest approach)
nt insert-structured MyPage << 'EOF'
[
  {"content": "Project Overview", "children": [
    {"content": "Requirements", "children": [
      {"content": "Functional requirements", "children": []},
      {"content": "Non-functional requirements", "children": []}
    ]},
    {"content": "Timeline", "children": [
      {"content": "Phase 1: Research", "children": []},
      {"content": "Phase 2: Implementation", "children": []}
    ]}
  ]}
]
EOF
```

## Technical Considerations

### Key Points
- **No parsing needed** when using proper JSON input format
- API handles all structure preservation automatically
- Single API call provides atomic transaction
- Native Logseq block structure preserved exactly

### Input Format Requirements
- Must be valid JSON array of `IBatchBlock` objects
- Each block requires `content` property
- `children` arrays preserve hierarchy
- `properties` optional for block-level metadata

### Edge Cases
- Empty pages handled by inserting directly to page
- Invalid JSON caught by JSON.parse() with clear error
- Malformed block structure handled by API error responses

### Performance Benefits
- Single API call vs. N calls for N blocks
- Atomic transaction prevents partial insertions
- No client-side parsing overhead when using JSON input
- Reduced HTTP overhead for large structures

## Migration Path

### Phase 1: Add Simple Command
- Implement `insert-structured` expecting JSON input
- Use existing patterns from `note.js`
- Minimal code required (just API wrapper)

### Phase 2: Optional Convenience Features
- Add optional indented text parsing (if desired)
- Add `--format json|text` flag
- Add validation mode to show parsed structure

### Phase 3: Advanced Integration
- Consider extending existing `append` with `--structured` flag
- Add block properties support in JSON format
- Add batch insertion capabilities

## Integration with Existing Codebase

The solution leverages established patterns:
- Uses existing `callLogseq` wrapper function
- Follows `identify()` function pattern  
- Maintains consistent error handling with `abort()`
- Integrates with CLI framework via `program.command()`

**The implementation is remarkably simple because the Logseq API does all the heavy lifting of structure preservation.**

This approach provides a clean, robust solution for preserving document structure while inserting content into Logseq pages.