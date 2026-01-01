// Concrete example of Logseq insertBatchBlock API structure
// 
// This demonstrates the exact structure that insertBatchBlock expects
// Notice: NO PARSING NEEDED - you provide structure upfront

const structuredContent = [
  {
    content: "Project Planning",
    children: [
      {
        content: "Requirements Analysis",
        children: [
          {
            content: "TODO: Gather functional requirements from stakeholders"
          },
          {
            content: "TODO: Review technical constraints and limitations"
          }
        ]
      },
      {
        content: "Timeline Planning",
        children: [
          {
            content: "Phase 1: Research & Discovery",
            children: [
              {
                content: "Market research completion"
              },
              {
                content: "Competitor analysis finished"
              }
            ]
          },
          {
            content: "Phase 2: Design & Architecture",
            children: [
              {
                content: "TODO: Create system architecture diagrams"
              },
              {
                content: "TODO: Define API specifications"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    content: "Meeting Notes",
    children: [
      {
        content: "TODO: Schedule kickoff meeting with team",
        properties: {
          deadline: "2026-01-15",
          priority: "high"
        }
      },
      {
        content: "Discussion points",
        children: [
          {
            content: "Budget allocation strategy"
          },
          {
            content: "Resource assignment approach"
          }
        ]
      }
    ]
  }
];

/**
 * Single API call to insert the structured content
 */
async function exampleInsertBatchBlock() {
  const pageName = "Test-Structured-Insertion";
  
  // Get target page (insertion point)
  const pageBlocks = await logseq.Editor.getPageBlocksTree(pageName);
  
  // Determine insertion point
  const targetBlock = pageBlocks?.[pageBlocks.length - 1] || pageName;
  
  // The key insertBatchBlock API call
  const result = await logseq.Editor.insertBatchBlock(
    targetBlock.uuid || targetBlock,  // Target block UUID or page name
    structuredContent,               // Array of IBatchBlock objects
    { sibling: !!targetBlock.uuid }   // Insert as sibling if target is block
  );

  return result;
}

// The structured content to insert - notice the nested children arrays
const structuredContent = [
  {
    content: "Project Planning",
    children: [
      {
        content: "Requirements Analysis",
        children: [
          {
            content: "TODO: Gather functional requirements from stakeholders"
          },
          {
            content: "TODO: Review technical constraints and limitations"
          }
        ]
      },
      {
        content: "Timeline Planning",
        children: [
          {
            content: "Phase 1: Research & Discovery",
            children: [
              {
                content: "Market research completion"
              },
              {
                content: "Competitor analysis finished"
              }
            ]
          },
          {
            content: "Phase 2: Design & Architecture",
            children: [
              {
                content: "TODO: Create system architecture diagrams"
              },
              {
                content: "TODO: Define API specifications"
              }
            ]
          }
        ]
      }
    ]
  },
  {
    content: "Meeting Notes",
    children: [
      {
        content: "TODO: Schedule kickoff meeting with team",
        properties: {
          deadline: "2026-01-15",
          priority: "high"
        }
      },
      {
        content: "Discussion points",
        children: [
          {
            content: "Budget allocation strategy"
          },
          {
            content: "Resource assignment approach"
          }
        ]
      }
    ]
  }
];

// Example API call using the same structure as the Reddit plugin
async function exampleInsertBatchBlock() {
  try {
    // First, get the target page and existing blocks
    const pageName = "Test-Structured-Insertion";
    const pageBlocks = await logseq.Editor.getPageBlocksTree(pageName);
    
    let targetBlock;
    if (pageBlocks && pageBlocks.length > 0) {
      // Insert after the last existing block as sibling
      targetBlock = pageBlocks[pageBlocks.length - 1];
      console.log(`Inserting after block: ${targetBlock.uuid}`);
    } else {
      // Page is empty, insert directly to page
      targetBlock = pageName;
      console.log(`Inserting directly to page: ${pageName}`);
    }

    // The actual insertBatchBlock call - this is the key API method
    const result = await logseq.Editor.insertBatchBlock(
      targetBlock.uuid || targetBlock,  // target block UUID or page name
      structuredContent,                      // Array of IBatchBlock objects
      { 
        sibling: !!targetBlock.uuid,  // true if inserting after existing block
        keepUUID: false                 // Don't preserve custom UUIDs
      }
    );

    console.log(`Successfully inserted ${result.length} blocks with hierarchical structure`);
    return result;
    
  } catch (error) {
    console.error('Error inserting structured content:', error);
    throw error;
  }
}

// Export for use
export { exampleInsertBatchBlock, structuredContent };

/**
 * Key Insights:
 * 
 * 1. insertBatchBlock preserves the exact structure you provide
 * 2. The 'content' field contains the block text (including TODO markers)
 * 3. The 'children' array creates nested hierarchy
 * 4. The 'properties' object can hold block metadata like deadlines, priorities, etc.
 * 5. No parsing is needed - you format the structure upfront
 * 6. The API handles all the hierarchical preservation automatically
 */