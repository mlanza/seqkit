# Seqkit

Pronounced "seekit," it's a toolkit for Logseq.  As a general rule, composable command-line tools are preferred to MCP tools because they're avalable to humans and agents alike. It's easier to wrap a command-line tool as an MCP server, than the reverse.

Your commonplace book is a near perfect spot for keeping the sort of knowhow an agent needs to thrive.  It provides an excellent store for skills.  Any page tagged `Skills` with a `description` property describing the skill is ready to go.

Sample commands:

* `notes pages` - list all pages
* `notes page Atomic | wikilinks` - to view wikilinks on a page
* `notes page Atomic | wikilinks | notes page` - list all wikilinked pages
* `notes page Atomic | links` - to view links on page
* `notes page Atomic` - list a particular page by name
* `notes tags Programming` - list notes tagged Programming
* `notes name programming | notes t` - normalize the name and find pages tagged Programming
* `notes tags Programming | notes page` - pipe names into page to list content for a bunch of pages
* `echo "Atomic\nCosmos" | notes tags`
* `pages Atomic Cosmos | notes page`
* `pages Coding Tasking Decomposing | notes prereq | seen | notes page`
* `skills` - for a skills menu
* `about Coding` - to lookup the Coding skill
* `ago 90 | notes page` - to review 90 days of journal entries
* `ago 90 | notes page | links` - recent links from journal entries
* `period $(seq -90 -60) | notes page` - a range of journal entries (`zsh`)
* `period -30..0 | notes page` - a range of journal entries (`pwsh`)

Most commands accept the primary operand directly or via stdin.

You must have Logseq running in Developer Mode.  This can be flipped on under Settings > Advanced.  After that, enable the local HTTP API. It appears as a button in the upper right.  This effectively treats your local-first install of Logseq as an MCP server.

## Environment

Ensure `pwsh` is installed.  It was targeted over `zsh` and `bash` for cross-platform compatibility since I work on both a Mac and Windows.

Install the scripts in your path however you like:
```zsh
export PATH=~/Documents/seqkit/bin:$PATH
```

Ensure you've set these environment variables:

* **NOTES_DIR** - the path to your notes repo, e.g. `~/Documents/notes`
* **NOTES_ENDPOINT** - the HTTP API endpoint, e.g. http://127.0.0.1:12315/api
* **NOTES_TOKEN** - a token you configured for the HTTP API

## License
[MIT](./LICENSE.md)
