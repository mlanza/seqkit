# Seqkit

A toolkit for [Logseq](https://logseq.com) that exposes knowhow to agents.  Prefer command-line tools to MCP tools because they're composeable and available to humans and agents alike. It's easier to wrap a command-line tool as an MCP server, than the reverse.

Your local-first commonplace book is a near perfect spot for keeping all the information and instructions an agent needs to thrive.  It is an excellent store for skills.  Tag a page `Skills` and describe it with a `description` property.  Include any `prerequisites` (another property) that make sense and you're ready to go.  Prerequisites are automatically included when using `about`.

Sample frontmatter in a Logseq page:

```md
tags:: AI, [[Making apps]], Skills
alias:: [[Agentic Coding]], [[Spec Coding]], [[Vibe Coding]]
prerequisites:: [[Atomic Way]], [[Coding Style]]
description:: Guidance for writing, refactoring or fixing code
```

Sample commands:

* `notes pages` - list regular pages
* `notes pages -t journal` - list journal pages
* `notes pages -t all` - list both journal and regular pages
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
* `about Coding` - to lookup the Coding skill along with any prerequisites
* `ago 90 | notes page` - to review 90 days of journal entries
* `ago 90 | notes page | links` - recent links from journal entries
* `period $(seq -90 -60) | notes page` - a range of journal entries (`zsh`)
* `period -30..0 | notes page` - a range of journal entries (`pwsh`)

These can be issued directly in [OpenCode](https://opencode.ai) — by you or the agent.  Being command line, I imagine any agent can use them.

All `notes` commands receive the primary operand directly or via stdin.  This enables you to execute one or many commands.

You must run Logseq in Developer Mode.  Flip it on under `Settings > Advanced`.  Then enable the local HTTP API via the button in the upper right. You must [set up a token](https://wiki.jamesravey.me/books/software-misc/page/logseq-http-api).  This treats your local-first install of Logseq as an MCP server.

## Environment

Have `pwsh` and `deno` installed.  These runtimes were targeted over `zsh` and `bash` for cross-platform compatibility to accommodate those who work on Mac, Linux or Windows.

Install the scripts in your path however you like:
```zsh
export PATH=~/Documents/seqkit/bin:$PATH
```

Set these environment variables:

* **NOTES_DIR** - the path to your notes repo, e.g. `~/Documents/notes`
* **NOTES_ENDPOINT** - the HTTP API endpoint, e.g. http://127.0.0.1:12315/api
* **NOTES_TOKEN** - a token you configured for the HTTP API

## OpenCode Custom `about` Tool

There is a custom about tool here.  This and `skills` facilitate knowledge lookup.  The tool is available to OpenCode when you start it in this repo.  You can symlink it from your global opencode config to make it universally available.

## License
[MIT](./LICENSE.md)
