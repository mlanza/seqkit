# Concrete Logseq insertBatchBlock API Example

# Concrete Logseq insertBatchBlock API Example

## The API Call

```bash
curl -X POST http://127.0.0.1:12315/api \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method": "logseq.Editor.insertBatchBlock",
    "args": [
      "Test-Page", 
      [
        {
          "content": "Project Planning",
          "children": [
            {
              "content": "Requirements Analysis",
              "children": [
                {
                  "content": "TODO: Gather functional requirements from stakeholders"
                },
                {
                  "content": "TODO: Review technical constraints and limitations"
                }
              ]
            },
            {
              "content": "Timeline Planning",
              "children": [
                {
                  "content": "Phase 1: Research & Discovery",
                  "children": [
                    {
                      "content": "Market research completion"
                    },
                    {
                      "content": "Competitor analysis finished"
                    }
                  ]
                },
                {
                  "content": "Phase 2: Design & Architecture",
                  "children": [
                    {
                      "content": "TODO: Create system architecture diagrams"
                    },
                    {
                      "content": "TODO: Define API specifications"
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          "content": "Meeting Notes",
          "children": [
            {
              "content": "TODO: Schedule kickoff meeting with team",
              "properties": {
                "deadline": "2026-01-15",
                "priority": "high"
              }
            },
            {
              "content": "Discussion points",
              "children": [
                {
                  "content": "Budget allocation strategy"
                },
                {
                  "content": "Resource assignment approach"
                }
              ]
            }
          ]
        }
      ]
    }
  }'
```

## What This Shows

1. **Nested Structure Preserved**: The `children` arrays create perfect hierarchy
2. **TODO Included**: `"TODO: Schedule kickoff meeting with team"` shows task markers are handled naturally
3. **Properties Supported**: Block with deadline and priority metadata
4. **Single Atomic Operation**: All content inserted in one API call

## The Key Insight

**`insertBatchBlock` takes pre-formatted structured JSON and preserves it exactly. No parsing required - you just format your content as nested JSON objects and the API does the rest.**

This is the fundamental difference from the current `append` command which destroys structure by processing line-by-line.