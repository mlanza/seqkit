# `notes` CLI Tool Specification

## Logseq HTTP API Reference

### Official Documentation
- **Plugin API Docs**: https://plugins-doc.logseq.com/
- **GitHub API Reference**: https://logseq.github.io/plugins/
- **HTTP API Endpoint**: http://127.0.0.1:12315/api

### Key Methods for Journal Operations
- `logseq.Editor.getAllPages()` - Returns all pages with journal filtering capability
- `logseq.Editor.getPage(name)` - Retrieves specific page content
- `logseq.Editor.createJournalPage(date)` - Creates new journal entries
- `logseq.Editor.getPageBlocksTree(name)` - Gets page content as block tree

### Journal Page Identification
Journal pages can be identified by these PageEntity properties:
- `page["journal?"] === true` - Boolean flag for journal pages
- `page.type === "journal"` - Type enumeration
- `page.journalDay` - Numeric day representation
- Page names follow format: "Month Dayth, Year" (e.g., "Dec 14th, 2025")

## Overview

`notes` is a Logseq HTTP API CLI tool that provides command-line access to Logseq functionality. It follows Unix philosophy principles with silent success, explicit error handling, and composable commands.

## Design Philosophy

### Unix Philosophy
- **Do one thing well**: Each command has a single, focused responsibility
- **Silent success**: Successful operations produce no output unless data is expected
- **Explicit errors**: All errors are reported to stderr with clear messages
- **Composable**: Commands output clean text suitable for piping to other tools
- **Text-based**: Default output is human-readable text, JSON available for automation

### Error Handling
- All errors are printed to stderr with "Error:" prefix
- Script exits with status code 1 on errors
- Warnings are prefixed with "Warning:" and don't cause exit
- Missing pages or data often results in silent no-output (not an error)

### Integration Patterns
- Uses `callLogseq()` function for all Logseq API interactions
- Environment variables for configuration: `LOGSEQ_TOKEN`, `LOGSEQ_REPO`
- Standard HTTP endpoint: `http://127.0.0.1:12315/api`

## Commands

### pages - List All Pages

**Purpose**: Retrieve all pages from Logseq

**Syntax**:
```bash
notes pages [-f|--format <format>] [--json]
```

**Options**:
- `-f, --format <type>`: Output format, either "md" or "json" (default: "md")
- `--json`: Shortcut for `--format json`

**Behavior**:
- Calls `logseq.Editor.getAllPages` API method
- MD format: Outputs one page name per line using `page.originalName`
- JSON format: Outputs full API response as pretty-printed JSON
- Silent on empty page lists (just produces no output)

**Examples**:
```bash
notes pages                    # List pages as names
notes pages --json            # List pages as JSON
notes pages -f json            # Same as above
```

### journals - List All Journal Pages

**Purpose**: Retrieve all journal pages from Logseq

**Syntax**:
```bash
notes journals [--limit <count>]
```

**Options**:
- `--limit <count>`: Limit to last N journals (none = no limit) (default: 7)

**Behavior**:
- Calls `logseq.Editor.getAllPages` API method
- Filters pages where `page["journal?"] === true` or `page.type === "journal"`
- Sorts by `page.journalDay` descending (newest first)
- Outputs journal dates in YYYY-MM-DD format with day names, one per line
- Applies limit if specified and not 0

**Examples**:
```bash
notes journals                 # List last 7 journals (default)
notes journals --limit 3       # List last 3 journals
notes journals --limit none     # List all journals with no limit
```

### page - Get Page Content

**Purpose**: Retrieve content from one or more pages

**Syntax**:
```bash
notes page [name] [-f|--format <format>] [--json] [--no-heading] [--less <patterns...>] [-a|--append <content>]
```

**Arguments**:
- `name`: Optional page name. If omitted, reads page names from stdin

**Options**:
- `-f, --format <type>`: Output format, "md", "json", or "outline" (default: "md")
- `--json`: Shortcut for `--format json`
- `--no-heading`: Omit H1 heading and trailing blank line in MD format
- `--less <patterns...>`: Filter out blocks matching regex patterns (outline format only, supports multiple patterns)
- `-a, --append <content>`: Append content to page (mutually exclusive with content display)

**Behavior**:

**Content Display Mode** (default):
- Single page: Displays content for specified page
- Stdin mode: Reads page names from stdin, one per line, processes each
- MD format: Reads from filesystem using `LOGSEQ_REPO/pages/{name}.md`
  - Adds H1 heading (`# {name}`) and trailing blank line unless `--no-heading` specified
  - Trims trailing blank lines from content
  - Adds blank line separator between multiple pages
  - Shows warning if file cannot be read but continues processing
- JSON format: Uses `logseq.Editor.getPageBlocksTree` API
- Outline format: Uses `logseq.Editor.getPageBlocksTree` API with hierarchical structure
  - Outputs as nested JSON with `children` arrays preserving parent-child relationships
  - Extracts priority markers (`[#A]`, `[#B]`, `[#C]`) into separate `priority` field
  - Supports `--less` option to exclude matching blocks from output
  - Maintains nested structure while filtering recursively

**Append Mode** (`--append`):
- Requires page name argument (cannot use stdin)
- Uses `logseq.Editor.appendBlockInPage` API
- Silent on success (Unix philosophy)
- Cannot be combined with content display

**Examples**:
```bash
notes page MyPage                     # Show page content with heading
notes page MyPage --no-heading        # Show content without heading
notes page MyPage --json              # Show as JSON block tree
notes page MyPage --nest --json       # Show as hierarchical JSON outline
echo -e "Page1\nPage2" | notes page   # Process multiple pages from stdin
notes page MyPage -a "New content"    # Append content (silent)
```

**Less Option (--less)**

The `--less` option filters OUT (excludes/strip) matching content from output, similar to `strip`, `no-todos`, and `no-links` tools.

**Behavior**:
- Works with both MD and JSON formats when NOT using `--nest`
- Uses Cliffy `collect: true` option to accept multiple regex patterns
- Applies OR logic: blocks matching ANY pattern are filtered out
- Recursive filtering: if a parent is filtered out, all its children are also removed
- Patterns are tested against the `content` field after removing leading whitespace and list markers
- When processing without `--nest`, uses file-based parsing to preserve proper indentation and block structure
- `collapsed:: true` properties are completely removed when their parent blocks are filtered out
- Properly handles Logseq's mixed tab/space indentation (1 tab = 2 spaces per level)

**Filtering Examples**:

**Filter out TODO/DOING items** (parity with `no-todos`):
```bash
notes page Atomic --less '^(TODO|DOING)'
```
- Matches: `- TODO`, `- DOING` at start of content
- Equivalent to: `./no-todos < MyPage.md`

**Filter out URL-only items** (parity with `no-links`):
```bash
notes page MyPage --nest --less '^https?://[^)]+$' --less '^\[.*\]\(https?://[^)]+\)$'
```
- First pattern: Plain URLs that occupy entire line (`https://example.com`)
- Second pattern: Markdown links that occupy entire line (`[text](https://example.com)`)
- Equivalent to: `./no-links < MyPage.md`

**Multiple patterns**:
```bash
notes page MyPage --nest --less '^(TODO|DOING)' '^\[\#[ABC]\]' 'DEADLINE:' 'SCHEDULED:'
```
- Filters out TODO/DOING items, priority markers, and scheduling items

**Priority filtering**:
```bash
notes page MyPage --nest --less '\[#A\]'      # Remove priority A items
notes page MyPage --nest --less '\[#A\]' --less '\[#B\]' --less '\[#C\]'  # Remove all priority items
```

**Deadline and scheduling filtering**:
```bash
notes page MyPage --nest --less 'DEADLINE:'    # Remove items with deadlines
notes page MyPage --nest --less 'SCHEDULED:'   # Remove scheduled items
```

**Complex filtering combinations**:
```bash
# Remove all task-related items (equivalent to comprehensive task filtering)
notes page MyPage --nest --less '^(TODO|DOING|DONE|WAITING|NOW|LATER)' --less '^\[\#[ABC]\]' --less 'DEADLINE:' --less 'SCHEDULED:' --less 'collapsed:: true'
```

**Pattern Reference**:
- `^https?://[^)]+$` - Plain URLs starting line and ending at line end
- `^\[.*\]\(https?://[^)]+\)$` - Complete markdown links: `[text](url)`
- `^(TODO|DOING)` - Task markers at start (more comprehensive than no-todos)
- `^\[\#[ABC]\]` - Priority markers: `[#A]`, `[#B]`, `[#C]`
- `DEADLINE:` - Deadline scheduling
- `SCHEDULED:` - Scheduled dates
- `collapsed:: true` - Collapsed blocks

**Integration with existing tools**:
The `--filter` option provides the same filtering functionality as dedicated tools but integrates directly with the Logseq API:

```bash
# Traditional approach
notes page MyPage --format=md | ./no-todos
notes page MyPage --format=md | ./no-links

# New integrated approach
notes page MyPage --nest --less '^(TODO|DOING)'
notes page MyPage --nest --less '^https?://[^)]+$' '^\[.*\]\(https?://[^)]+\)$'
```

### journal - Get Journal Content

**Purpose**: Retrieve content from one or more journal pages

**Syntax**:
```bash
notes journal [date] [-f|--format <format>] [--json] [--no-heading] [-a|--append <content>]
```

**Arguments**:
- `date`: Optional journal date or offset. If omitted, defaults to today (0). If no argument provided and not using append mode, reads dates from stdin
  - **YYYY-MM-DD format**: "2025-12-14"
  - **Integer offset**: `0` (today), `1` (tomorrow), `-1` (yesterday)
  - **Explicit offset**: "-3", "+5"
  - **Logseq format**: "Dec 14th, 2025"
  - **Note**: Date/offset should come BEFORE options like `-a` for consistency, but both orders are supported. Negative offsets work directly: `notes journal -1`

**Options**:
- `-f, --format <type>`: Output format, "md" or "json" (default: "md")
- `--json`: Shortcut for `--format json`
- `--no-heading`: Omit H1 heading and trailing blank line in MD format
- `-a, --append <content>`: Append content to journal (mutually exclusive with content display)

**Behavior**:
- **Content Display Mode** (default):
  - Single date: Displays content for specified journal. If no date provided, defaults to today (0)
  - Stdin mode: Reads dates from stdin, one per line, processes each (only when no arguments provided)
  - MD format: Reads from filesystem using `LOGSEQ_REPO/pages/{journal-name}.md`
  - JSON format: Uses `logseq.Editor.getPageBlocksTree` API
  - Integer inputs are automatically detected as day offsets from today
- **Append Mode** (`--append`):
  - Uses `logseq.Editor.appendBlockInPage` API
  - Silent on success (Unix philosophy)
  - If no date provided, defaults to today (0)
  - Works with specific dates, offsets, or defaults

**Examples**:
```bash
notes journal                        # Show today's journal (default behavior)
notes journal 2025-12-03              # Show journal for specific date
notes journal 0                      # Show today's journal (explicit)
notes journal -1                     # Show yesterday's journal
notes journal 1                      # Show tomorrow's journal
notes journal --no-heading 2025-12-03 # Show without H1 heading
notes journal --json 0               # Show today's journal as JSON
notes journal -a "New entry"         # Append to today's journal (silent, default)
notes journal 0 -a "New entry"       # Append to today's journal (preferred order)
notes journal 2025-12-14 -a "New entry" # Append to specific date (preferred order)
notes journal -5 -a "New entry"      # Append to 5 days ago (preferred order)
notes journal 1 -a "New entry"       # Append to tomorrow's journal (preferred order)
notes journal -a "New entry" 2025-12-14 # Append to specific date (legacy order supported)
echo -e "2025-12-03\n2025-12-02" | notes journal  # Process multiple dates from stdin
```

### search - Search Pages

**Purpose**: Search for pages containing specified term

**Syntax**:
```bash
notes search <term> [-f|--format <format>] [--json]
```

**Arguments**:
- `term`: Search term (required)

**Options**:
- `-f, --format <type>`: Output format, "md" or "json" (default: "md")
- `--json`: Shortcut for `--format json`

**Behavior**:
- Calls `logseq.Editor.search` API method
- MD format: Extracts unique page names from search results
  - Gets page details for each unique page ID using `logseq.Editor.getPage`
  - Outputs one page name per line, deduplicated
  - Continues processing if individual page lookups fail (shows warning)
- JSON format: Outputs full search response as pretty-printed JSON

**Examples**:
```bash
notes search "term"              # Find pages containing term
notes search "term" --json       # Raw search results as JSON
```

### props - Get Page Properties (Advanced)

**Purpose**: Retrieve properties from pages using efficient Datalog queries with advanced filtering and formatting options

**Syntax**:
```bash
notes props <name> [property] [-f|--format <format>] [--json] [--no-heading]
```

**Arguments**:
- `name`: Page name (required, can be piped via stdin)
- `property`: Optional specific property name to retrieve

**Options**:
- `-f, --format <type>`: Output format, "md" or "json" (default: "md")
- `--json`: Shortcut for `--format json`
- `--no-heading`: Omit H1 heading and trailing blank line for MD format

**Behavior**:
- Uses `logseq.DB.datascriptQuery` for efficient database queries
- Normalizes page names using `getNames()` function
- Merges both `properties` and `propertiesTextValues` from page data
- Supports pipeable input for batch processing

**MD Format** (default):
- **All properties**: Outputs as `property:: [[value1]], [[value2]]` format with H1 heading
- **Single property**: Outputs just the property values, one per line (no brackets)
- Includes proper wikilink formatting with double brackets
- Can omit heading with `--no-heading`

**JSON Format**:
- Outputs full query result as pretty-printed JSON
- Includes complete page data and all property information
- Useful for automation and debugging

**Pipeable Support**:
- Accepts page names from stdin for batch processing
- Processes each line as a separate page name
- Maintains consistent output format for all pages

**Examples**:
```bash
# Basic usage - show all properties with heading
notes props MyPage

# JSON format - full data as JSON
notes props MyPage --json
notes props MyPage -f json

# Single property - just the values
notes props MyPage tags
notes props MyPage tags --json

# Options
notes props MyPage --no-heading
notes props MyPage --format md
notes props MyPage --format json

# Pipeable - process multiple pages
echo MyPage | notes props
echo -e 'Page1\nPage2\nPage3' | notes props

# Error handling
notes props NonExistentPage    # Shows error message
```

**Advanced Features**:
- **Efficient querying**: Uses Datalog for optimal performance
- **Property merging**: Combines properties from both property sources
- **Flexible output**: Single property vs all properties
- **Batch processing**: Unix pipeline integration
- **Error handling**: Clear messages for missing pages
- **Format validation**: Proper input validation and error messages

### name - Get Page Name from ID

**Purpose**: Translate page ID to page name

**Syntax**:
```bash
notes name <id> [-f|--format <format>] [--json]
```

**Arguments**:
- `id`: Page ID (required)

**Options**:
- `-f, --format <type>`: Output format, "md" or "json" (default: "md")
- `--json`: Shortcut for `--format json`

**Behavior**:
- Primary: Calls `logseq.Editor.getPage` with ID directly
- Fallback: If ID is numeric and direct lookup fails, searches all pages
  - Calls `logseq.Editor.getAllPages` and finds matching `page.id`
- MD format: Outputs just the page name (`result.originalName`)
  - Silent if no page found (no output, no error)
- JSON format: Outputs full page response as pretty-printed JSON

**Examples**:
```bash
notes name 12345                # Get name for page ID 12345
notes name "page-id-string"     # Get name for string ID
notes name 12345 --json         # Full page data as JSON
```

### prereq - Collect Prerequisites Recursively

**Purpose**: Recursively collect all prerequisite page names from a topic

**Syntax**:
```bash
notes prereq <topic> [--debug]
```

**Arguments**:
- `topic`: Starting topic page name (required)

**Options**:
- `--debug`: Enable debug output to stderr

**Behavior**:
- Recursively follows `prerequisites::` properties in pages
- Uses `logseq.Editor.getPageBlocksTree` to get page content
- Extracts prerequisites from content using pattern matching:
  - Finds line starting with `prerequisites::`
  - Parses comma-separated wikilinks `[[Page1]], [[Page2]]`
  - Removes `[[` and `]]` brackets, trims whitespace
- Prevents infinite recursion with cycle detection using `seenPages` tracking
- Outputs one page name per line in dependency order
- Removes duplicates while preserving order
- Debug mode shows progress to stderr

**Prerequisites Format**:
```
prerequisites:: [[Page1]], [[Page2]], Page3
```

**Examples**:
```bash
notes prereq MyTopic            # Collect all prerequisites
notes prereq MyTopic --debug    # With debug output
```

### alias - Find Pages by Alias

**Purpose**: Find pages that have a specific alias in their properties

**Syntax**:
```bash
notes alias <alias-name> [-f|--format <format>] [--json]
```

**Arguments**:
- `alias-name`: The alias to search for (required)

**Options**:
- `-f, --format <type>`: Output format, either "md" or "json" (default: "md")
- `--json`: Shortcut for `--format json`

**Behavior**:
- Calls `logseq.Editor.getAllPages` to get all pages
- For each page, calls `logseq.Editor.getPage` to get page properties
- Searches for `alias::` property in page properties
- Compares alias value (case-sensitive, trimmed) with provided alias name
- MD format: Outputs matching page names, one per line
- JSON format: Outputs full page data for all matching pages
- Silent on no matches (produces no output)
- Handles multiple pages with same alias
- Continues processing if individual page lookups fail (outputs warning)
- Supports piping multiple aliases from stdin

**Alias Property Format**:
```
alias:: my-alias-name
```

**Examples**:
```bash
notes alias "my-alias"           # Find pages with alias "my-alias"
notes alias "my-alias" --json    # Full page data as JSON
echo "my-alias" | notes alias    # Read alias from stdin
echo -e "alias1\nalias2" | notes alias  # Search multiple aliases
```

### query - Execute Datalog Queries

**Purpose**: Execute custom Datalog queries against Logseq database for advanced data retrieval

**Syntax**:
```bash
notes query <datalog-query> [--json]
```

**Arguments**:
- `datalog-query`: Datalog query string (required)
  - Can be provided as argument or piped via stdin

**Options**:
- `--json`: Output JSON format (required for now)
- `-f, --format <type>`: Output format (json only supported currently)

**Behavior**:
- Uses `logseq.DB.datascriptQuery` for direct database access
- Accepts full Datalog query syntax for complex data operations
- JSON format: Outputs raw query results as pretty-printed JSON
- Designed for advanced users and complex data retrieval needs
- Supports piping queries from stdin for batch processing

**Examples**:
```bash
notes query '[:find (pull ?b [*]) :where [?b :block/marker _]]' --json
echo '[:find ?p :where [?p :block/name]]' | notes query --json
```

### tagged - Find Pages by Tag (Using Datalog Queries)

**Purpose**: Find pages that have a specific tag using efficient Datalog database queries

**Syntax**:
```bash
notes tagged <tag> [-f|--format <format>] [--json]
```

**Arguments**:
- `tag`: The tag to search for (required)

**Options**:
- `-f, --format <type>`: Output format, either "md" or "json" (default: "md")
- `--json`: Shortcut for `--format json`

**Behavior**:
- Uses `logseq.DB.datascriptQuery` for efficient indexed database queries
- Searches for blocks that reference pages with the specified tag name
- MD format: Outputs unique page names, one per line
- JSON format: Outputs raw block data with page references
- Leverages Logseq's built-in indexing for optimal performance
- Silent on no matches (produces no output)
- Supports piping multiple tags from stdin

**Examples**:
```bash
notes tagged Skills                # Find pages with Skills tag
notes tagged "AI" --json         # Raw JSON output of AI-tagged pages
echo -e "Skills\nAI" | notes tagged  # Search multiple tags
```

## Tested Datalog Query Examples

### Confirmed Working Queries

**Find blocks with any task marker:**
```bash
notes query '[:find (pull ?b [*]) :where [?b :block/marker _]]' --json
```

**Find DOING tasks specifically:**
```bash
notes query '[:find (pull ?b [*]) :where [?b :block/marker ?m] [(= ?m "DOING")]]' --json
```

**Find blocks with priority:**
```bash
notes query '[:find (pull ?b [*]) :where [?b :block/priority ?p]]' --json
```

**Find blocks with deadline:**
```bash
notes query '[:find (pull ?b [*]) :where [?b :block/deadline ?d]]' --json
```

**Get all page names:**
```bash
notes query '[:find ?p :where [?p :block/name]]' --json
```

### Query Syntax Notes

- **Variables**: Use `?variable` syntax (e.g., `?b`, `?p`, `?m`)
- **Basic structure**: `[:find ... :where ...]`
- **Attributes**: Logseq uses specific attribute names:
  - `:block/marker` - Task markers (TODO, DOING, DONE, etc.)
  - `:block/priority` - Task priorities (A, B, C)
  - `:block/deadline` - Task deadlines
  - `:block/name` - Page name (lowercase)
- **Pull syntax**: `(pull ?b [*])` for full block data
- **Equality**: `(= ?variable "value")` for exact matching
- **Wildcards**: Use `_` for wildcard matching in constraints

## Output Formats

### MD Format (Default)
- Human-readable text output
- One item per line for lists
- Suitable for piping to other Unix tools
- Clean, minimal formatting

### JSON Format
- Pretty-printed with 2-space indentation
- Full API responses for debugging/automation
- Available on all commands via `--json` or `-f json`
- Flat array structure for page commands

### Outline Format
- Hierarchical JSON structure with nested `children` arrays
- Preserves parent-child relationships from Logseq block tree
- Extracts priority markers (`[#A]`, `[#B]`, `[#C]`) into separate `priority` field
- Supports `--filter` option for content filtering
- Clean content with markers removed from text
- Available via `--nest`
- Format-specific: only applies to page commands

## Environment Configuration

### Required Environment Variables
- `LOGSEQ_TOKEN`: Authentication token for Logseq API
- `LOGSEQ_REPO`: Base directory for Logseq notes (used by `page` command MD format)

### API Configuration
- Endpoint: `http://127.0.0.1:12315/api`
- Method: POST with JSON payload
- Authentication: Bearer token via Authorization header

## Error Handling Patterns

### Standard Error Format
```
Error: <descriptive message>
```

### Warning Format
```
Warning: <descriptive message>
```

### Exit Codes
- 0: Success
- 1: Any error condition

### Common Error Conditions
- Missing required arguments
- Invalid format options
- API communication failures
- File system access errors (warnings for individual files)
- Missing environment variables

## Implementation Details

### Core Functions

#### `callLogseq(method, args)`
- Universal Logseq API interface
- Handles HTTP POST requests with proper headers
- Error checking for HTTP status and API error responses
- Returns parsed JSON response

#### `getPagePathFromName(name)`
- Converts page name to filesystem path
- Pattern: `${LOGSEQ_REPO}/pages/${name}.md`
- Basic trimming and normalization

#### `extractPrerequisites(content)`
- Parses `prerequisites::` lines from page content
- Handles comma-separated wikilinks
- Removes brackets and whitespace
- Returns array of prerequisite page names

#### `collectPrerequisites(currentTopic, seenPages, debug)`
- Recursive prerequisite collection with cycle detection
- Uses `callLogseq` for page content access
- Converts block tree to text for parsing
- Returns array of page names in dependency order

#### `removeDuplicates(lines)`
- Removes duplicate lines while preserving order
- Used by prereq command for output cleanup

### Dependencies
- Deno runtime with network and file system access
- Cliffy command-line parsing library
- Logseq HTTP API server running locally

## Usage Patterns

### Pipeline Integration
```bash
# Find pages and process them
notes search "topic" | notes page --no-heading

# Get prerequisites and check properties
notes prereq "ComplexTopic" | xargs -I {} notes props {}

# Advanced properties processing with batch support
notes pages | notes props
echo "Page1\nPage2" | notes props --format json

# Export all pages
notes pages | notes page --no-heading > all-pages.md

# Find pages by alias and process them
notes alias "my-alias" | xargs -I {} notes page --no-heading
```

### Automation
```bash
# JSON processing
notes pages --json | jq '.[] | select(.originalName | startswith("Project"))'

# Batch operations with advanced props command
for page in $(notes pages); do
    echo "Processing: $page"
    notes props "$page"              # Advanced properties with full control
    notes props "$page" --json       # For automation
done

# Advanced properties analysis
notes pages | xargs -I {} sh -c 'echo "=== {} ==="; notes props "{}" tags'
```

## Version Information

- Version: 1.0.0
- Runtime: Deno
- CLI Framework: Cliffy v1.0.0-rc.4

## Future Considerations

### Potential Enhancements
- Additional output formats (YAML, CSV)
- Batch operations for multiple pages
- Caching for improved performance
- Configuration file support
- More sophisticated search options

### Compatibility Notes
- Requires Logseq HTTP API plugin
- Assumes standard Logseq page structure
- Dependent on Logseq API stability
