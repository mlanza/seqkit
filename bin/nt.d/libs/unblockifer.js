// Helper function from the original code
function normalizeSeparator(lines) {
  return lines.filter(line => line.trim() !== '');
}

class Unblockifier {
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
        lines.push(...Unblockifier.recursiveConvert(children, level + 1));
      }
    });

    return lines;
  }

  static reconst(blocks) {
    return this.recursiveConvert(blocks).join('\n');
  }
}

export default Unblockifier;