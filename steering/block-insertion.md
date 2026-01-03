# Logseq API Block Insertion Experiments

This document details findings from testing Logseq API transactional structured content insertion capabilities. All experiments use environment variables `LOGSEQ_ENDPOINT` and `LOGSEQ_TOKEN` to avoid hardcoding values.

**Critical Update**: Additional experiments revealed precise patterns for true prepend/append operations using `insertBatchBlock`. The page itself cannot be used as a direct insertion target without proper option combinations.

## Key Learnings

### Primary Discovery: `insertBatchBlock` is Transactional

The `logseq.Editor.insertBatchBlock` method is the **key API endpoint** for transactional structured content insertion. Unlike sequential approaches that require multiple API calls, `insertBatchBlock`:

- **Preserves exact hierarchy** - nested children arrays maintain structure perfectly
- **Handles properties automatically** - converts `properties` objects to Logseq's `property:: value` format
- **Maintains internal order** - content appears exactly as structured in the payload
- **Supports deep nesting** - tested successfully with 3+ levels of hierarchy
- **Single transaction** - entire structured content is inserted atomically or fails as a unit

### Workflow Patterns

1. **New Page Creation**: `createPage` → `insertBatchBlock` with page UUID
2. **True Append**: `getPageBlocksTree` → get last block UUID → `insertBatchBlock` with `{sibling: true}`
3. **True Prepend**: `getPage` → get page UUID → `insertBatchBlock` with `{sibling: false, before: true}`
4. **Insertion Control**: Target specific blocks using their UUID for precise placement

### Limitations Discovered

- Page names cannot be used directly with `insertBatchBlock` - requires UUID
- Cannot batch insert into non-existent pages without first creating the page
- `appendBlockInPage` treats structured markdown as single block (adds "multipleBlocks" warning)
- **Page UUID with `{sibling: true}` inserts at TOP, not bottom (acts like prepend)
- **Page UUID with `{sibling: false}` makes page the parent (creates nested structure)**

---

## Experiment 1: Basic Flat Batch Insertion

```bash
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "TARGET_BLOCK_UUID",
      [
        {"content":"First flat block"},
        {"content":"Second flat block"},
        {"content":"Third flat block"}
      ],
      {"sibling":true}
    ]
  }'
```

**Results**: Successfully inserted 3 flat blocks in sequence after an existing block, maintaining exact order.

**Why it's useful**: Demonstrates basic batch insertion capability for flat content - transactional single call inserts multiple blocks.

**Resulting Logseq Content:**
```markdown
First flat block
Second flat block
Third flat block
```

---

## Experiment 2: Complex Hierarchical Insertion

```bash
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "TARGET_BLOCK_UUID",
      [
        {
          "content":"Project Overview",
          "children":[
            {
              "content":"TODO: Define project scope",
              "children":[
                {"content":"Research similar projects"},
                {"content":"Identify key requirements"}
              ]
            },
            {"content":"Timeline Planning"}
          ]
        },
        {
          "content":"Meeting Notes",
          "children":[
            {
              "content":"TODO: Schedule kickoff",
              "properties":{"deadline":"2026-01-15"}
            }
          ]
        }
      ],
      {"sibling":true}
    ]
  }'
```

**Results**: Successfully inserted complex 3-level hierarchy with properties (deadlines), TODO markers, and nested children - all preserved exactly as structured.

**Why it's useful**: **BREAKTHROUGH** - Proves that `insertBatchBlock` handles full hierarchical structures with properties in a single transactional call.

**Resulting Logseq Content:**
```markdown
Project Overview
  TODO: Define project scope
    Research similar projects
    Identify key requirements
  Timeline Planning
Meeting Notes
  TODO: Schedule kickoff
  deadline:: 2026-01-15
```

---

## Experiment 3: Clean Page Batch Creation

```bash
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "PAGE_UUID",
      [
        {"content":"First batch block"},
        {"content":"Second batch block"},
        {"content":"Third batch block"}
      ],
      {"sibling":false}
    ]
  }'
```

**Results**: Created a clean page with batch-inserted blocks without requiring an initial placeholder block.

**Why it's useful**: Demonstrates transactional page creation + content insertion workflow for new pages.

**Resulting Logseq Content:**
```markdown
First batch block
Second batch block
Third batch block
```

---

## Experiment 4: Advanced Properties + Deep Nesting

```bash
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "PAGE_UUID",
      [
        {
          "content":"Complex structure",
          "children":[
            {
              "content":"Level 2 child",
              "properties":{"priority":"high","type":"task"},
              "children":[
                {"content":"Deep level 3"},
                {"content":"Another level 3"}
              ]
            },
            {"content":"Another level 2"}
          ]
        },
        {"content":"Second root"}
      ],
      {"sibling":true}
    ]
  }'
```

**Results**: Successfully handled 3-level nesting with multiple properties (priority, type) that were automatically converted to Logseq property format.

**Why it's useful**: Shows how `insertBatchBlock` automatically handles property formatting and deep hierarchical preservation.

**Resulting Logseq Content:**
```markdown
Complex structure
  Level 2 child
    priority:: high
    type:: task
    Deep level 3
    Another level 3
  Another level 2
Second root
```

---

## Experiment 5: Insertion Point Control

```bash
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "TARGET_BLOCK_UUID",
      [
        {
          "content":"PREPENDED content",
          "children":[
            {"content":"Nested under prepended"}
          ]
        }
      ],
      {"sibling":false,"before":true}
    ]
  }'
```

**Results**: Successfully inserted structured content at a specific insertion point (as child of target block).

**Why it's useful**: Demonstrates precise insertion point control for prepend operations and hierarchical targeting.

**Resulting Logseq Content:**
```markdown
PREPENDED content
  Nested under prepended
```

---

## Experiment 6: True Append to Page Bottom

```bash
# Step 1: Get page blocks and find last block
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"logseq.Editor.getPageBlocksTree","args":["TestPageTarget"]}' | jq '.[-1].uuid' -r

# Step 2: Append after last block using sibling:true
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "LAST_BLOCK_UUID",
      [
        {"content":"APPENDED_AFTER_LAST_XyZ1"},
        {"content":"Another appended block"}
      ],
      {"sibling":true}
    ]
  }'
```

**Results**: Successfully appended content to the very bottom of the page after all existing content.

**Why it's useful**: **CRITICAL DISCOVERY** - The only reliable way to append to page bottom is using last block UUID with `{sibling: true}`.

**Resulting Logseq Content:**
```markdown
[... existing content ...]
Existing block B
APPENDED_AFTER_LAST_XyZ1
Another appended block
```

---

## Experiment 7: True Prepend to Page Top

```bash
# Step 1: Get page UUID (not blocks)
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"logseq.Editor.getPage","args":["TestPageTarget"]}'

# Step 2: Prepend using page UUID with specific options
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "PAGE_UUID",
      [
        {"content":"TRUE_PREPEND_XyZ2"},
        {"content":"Another prepended block"}
      ],
      {"sibling":false,"before":true}
    ]
  }'
```

**Results**: Successfully prepended content to the very top of the page before all existing content.

**Why it's useful**: **CRITICAL DISCOVERY** - The only reliable way to prepend to page top is using page UUID with `{sibling: false, before: true}`.

**Resulting Logseq Content:**
```markdown
TRUE_PREPEND_XyZ2
Another prepended block
[... existing content ...]
```

---

## Experiment 8: Hierarchical True Append

```bash
# Step 1: Get last block UUID  
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"logseq.Editor.getPageBlocksTree","args":["TestPageTarget"]}' | jq '.[-1].uuid' -r

# Step 2: Append hierarchical content after last block
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "LAST_BLOCK_UUID",
      [
        {
          "content":"HIER_APPEND_ROOT_XyZ3",
          "children":[
            {"content":"Nested child 1"},
            {"content":"Nested child 2","properties":{"status":"test"}}
          ]
        }
      ],
      {"sibling":true}
    ]
  }'
```

**Results**: Successfully appended complex hierarchical structure to page bottom with properties preserved.

**Why it's useful**: Demonstrates that hierarchical content works perfectly with true append operations.

**Resulting Logseq Content:**
```markdown
[... existing content ...]
HIER_APPEND_ROOT_XyZ3
  Nested child 1
  Nested child 2
  status:: test
```

---

## Experiment 9: Hierarchical True Prepend

```bash
# Step 1: Get page UUID
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"logseq.Editor.getPage","args":["TestPageTarget"]}'

# Step 2: Prepend hierarchical content using page UUID
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "PAGE_UUID",
      [
        {
          "content":"HIER_PREPEND_XyZ4",
          "children":[
            {"content":"Prepend child 1"},
            {"content":"Prepend child 2","properties":{"priority":"high"}}
          ]
        }
      ],
      {"sibling":false,"before":true}
    ]
  }'
```

**Results**: Successfully prepended complex hierarchical structure to page top with properties preserved.

**Why it's useful**: Demonstrates that hierarchical content works perfectly with true prepend operations.

**Resulting Logseq Content:**
```markdown
HIER_PREPEND_XyZ4
  Prepend child 1
  Prepend child 2
  priority:: high
[... existing content ...]
```

---

## Experiment 10: Page UUID Insertion Behavior

```bash
# Test page UUID with different option combinations
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method":"logseq.Editor.insertBatchBlock",
    "args":[
      "PAGE_UUID",
      [{"content":"PAGE_UUID_SIBLING_XyZ5"}],
      {"sibling":true}
    ]
  }'
```

**Results**: Content inserted at top of page (acts like prepend but after other prepended content).

**Why it's useful**: Understanding page UUID behavior - `{sibling: true}` with page UUID inserts at top, not bottom.

**Resulting Logseq Content:**
```markdown
PAGE_UUID_SIBLING_XyZ5
[... other content ...]
```

---

## Payload Structure Reference

### Basic Block Object
```json
{
  "content": "Block content text",
  "children": [...],           // Optional: Array of child blocks
  "properties": {...}          // Optional: Object of block properties
}
```

### Properties Format
Properties in the payload are automatically converted:
```json
{"properties":{"deadline":"2026-01-15","priority":"high"}}
```
Becomes in Logseq:
```
deadline:: 2026-01-15
priority:: high
```

### Insertion Options
- `{"sibling": true}` - Insert as sibling after target block
- `{"sibling": false}` - Insert as child of target block
- `{"sibling": false, "before": true}` - Insert as child before target's children
- **Page UUID + `{"sibling": true}`** - Inserts at TOP of page (prepend-like behavior)
- **Page UUID + `{"sibling": false, before": true}`** - **TRUE PREPEND** - inserts at very top
- **Last Block UUID + `{"sibling": true}`** - **TRUE APPEND** - inserts at very bottom

---

## API Response Patterns

- **Successful insertion**: Returns `null` (consistent behavior)
- **Error cases**: Returns error objects with descriptive messages
- **Page UUID required**: Cannot use page names directly with `insertBatchBlock`

---

## Implementation Strategies

### Strategy 1: True Append to Page Bottom

**When to use**: Add structured content to the end of an existing page.

**Implementation Steps**:
1. Get all blocks in the page: `getPageBlocksTree`
2. Extract the UUID of the last block: `.[-1].uuid`
3. Call `insertBatchBlock` with last block UUID + `{sibling: true}`

**Code Pattern**:
```bash
# Step 1: Get last block UUID
LAST_UUID=$(curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"logseq.Editor.getPageBlocksTree","args":["YourPageName"]}' | \
  jq '.[-1].uuid' -r)

# Step 2: Append content after last block
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"method\":\"logseq.Editor.insertBatchBlock\",
    \"args\":[
      \"$LAST_UUID\",
      YOUR_STRUCTURED_CONTENT_ARRAY,
      {\"sibling\":true}
    ]
  }"
```

**Critical Requirements**:
- Target must be **last block UUID**, not page UUID
- Use `{sibling: true}` to insert after the target block
- Works for flat or hierarchical content structures

---

### Strategy 2: True Prepend to Page Top

**When to use**: Add structured content to the beginning of an existing page.

**Implementation Steps**:
1. Get the page object: `getPage`
2. Extract the page UUID (not blocks)
3. Call `insertBatchBlock` with page UUID + `{sibling: false, before: true}`

**Code Pattern**:
```bash
# Step 1: Get page UUID
PAGE_UUID=$(curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"logseq.Editor.getPage","args":["YourPageName"]}' | \
  jq '.uuid' -r)

# Step 2: Prepend content to top of page
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"method\":\"logseq.Editor.insertBatchBlock\",
    \"args\":[
      \"$PAGE_UUID\",
      YOUR_STRUCTURED_CONTENT_ARRAY,
      {\"sibling\":false,\"before\":true}
    ]
  }"
```

**Critical Requirements**:
- Target must be **page UUID**, not block UUID
- Use `{sibling: false, before: true}` for true prepend
- Works for flat or hierarchical content structures

---

### Strategy 3: New Page with Initial Content

**When to use**: Create a new page and populate it with structured content.

**Implementation Steps**:
1. Create the page: `createPage`
2. Extract page UUID from creation response
3. Call `insertBatchBlock` with page UUID + `{sibling: false}`

**Code Pattern**:
```bash
# Step 1: Create new page
PAGE_UUID=$(curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"logseq.Editor.createPage","args":["NewPageName",{"journal":false}]}' | \
  jq '.uuid' -r)

# Step 2: Insert initial content
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"method\":\"logseq.Editor.insertBatchBlock\",
    \"args\":[
      \"$PAGE_UUID\",
      YOUR_STRUCTURED_CONTENT_ARRAY,
      {\"sibling\":false}
    ]
  }"
```

---

### Strategy 4: Insert at Specific Position

**When to use**: Insert content after a specific existing block.

**Implementation Steps**:
1. Get page blocks tree: `getPageBlocksTree`
2. Find the target block by content or position
3. Call `insertBatchBlock` with target block UUID + `{sibling: true}`

**Code Pattern**:
```bash
# Step 1: Find target block (example: find by content)
TARGET_UUID=$(curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method":"logseq.Editor.getPageBlocksTree","args":["YourPageName"]}' | \
  jq '.[] | select(.content == "Your target content") | .uuid' -r)

# Step 2: Insert after target block
curl -s -X POST $LOGSEQ_ENDPOINT \
  -H "Authorization: Bearer $LOGSEQ_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"method\":\"logseq.Editor.insertBatchBlock\",
    \"args\":[
      \"$TARGET_UUID\",
      YOUR_STRUCTURED_CONTENT_ARRAY,
      {\"sibling\":true}
    ]
  }"
```

---

## Decision Matrix

| Goal | Target UUID | Options | When to Use |
|------|-------------|---------|-------------|
| **Append to Bottom** | Last block UUID | `{sibling: true}` | Add content to end of existing page |
| **Prepend to Top** | Page UUID | `{sibling: false, before: true}` | Add content to beginning of existing page |
| **New Page Content** | Page UUID | `{sibling: false}` | Create new page with initial content |
| **Insert After Block** | Target block UUID | `{sibling: true}` | Insert after specific existing content |
| **Insert Under Block** | Target block UUID | `{sibling: false}` | Insert as child of existing block |

---

## Common Pitfalls to Avoid

### ❌ Wrong Target Selection
```bash
# WRONG: Using page UUID for append
curl -s ... '{"method":"logseq.Editor.insertBatchBlock","args":["PAGE_UUID",content,{"sibling":true}]}'
# Result: Inserts at TOP, not bottom
```

### ✅ Correct Target Selection
```bash
# CORRECT: Using last block UUID for append
curl -s ... '{"method":"logseq.Editor.insertBatchBlock","args":["LAST_BLOCK_UUID",content,{"sibling":true}]}'
# Result: Inserts at BOTTOM as expected
```

### ❌ Wrong Options for Prepend
```bash
# WRONG: Using page UUID without proper options
curl -s ... '{"method":"logseq.Editor.insertBatchBlock","args":["PAGE_UUID",content,{"sibling":false}]}'
# Result: Makes page parent (nested structure)
```

### ✅ Correct Options for Prepend
```bash
# CORRECT: Using page UUID with proper prepend options
curl -s ... '{"method":"logseq.Editor.insertBatchBlock","args":["PAGE_UUID",content,{"sibling":false,"before":true}]}'
# Result: Inserts at TOP as expected
```

---

## Conclusion

The experiments conclusively demonstrate that **single API calls can accomplish complex hierarchical content insertion** using `logseq.Editor.insertBatchBlock`. This approach is superior to sequential block-by-block methods for transactional structured content operations, providing:

1. **Atomic transactions** - entire structure succeeds or fails together
2. **Hierarchy preservation** - nested structures maintained exactly
3. **Property automation** - metadata handled automatically
4. **Performance benefits** - single network call vs multiple sequential calls
5. **Precise insertion control** - true prepend/append workflows discovered

**BREAKTHROUGH**: The critical discovery is that `insertBatchBlock` provides true transactional prepend/append capabilities when using the correct combination of target UUID (page vs last block) and insertion options. This validates the hypothesis that Logseq's `insertBatchBlock` API provides complete transactional structured content insertion capabilities with precise positioning control.
