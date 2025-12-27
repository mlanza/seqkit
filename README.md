# Seqkit

A toolkit for exposing [Logseq](https://logseq.com) knowhow to agents.  Prefer command line tools to MCP tools because they're ephemeral, composeable and available to humans 🧔🏼 and agents 🤖 alike. It's easier to wrap a command line tool as an MCP server, than the reverse.

<p align="center">
  <img src="./images/logo.png" style="width: 250px; max-width: 100%;" />
</p>

Your local-first commonplace book 📖 is a near perfect spot for keeping all the information and instructions an agent needs to thrive — one 💍 to rule them all.  How better to teach an agent your craft than by sharing your second 🧠 with it.

That also makes it the ideal store for skills.  Tag a page `Skills` and describe it with a `description` property.  Include any `prerequisites` that make sense and you're ready to go.  Prerequisite topics are automatically — and recursively — included when calling `about`.

Getting frontmatter properties:

```zsh
$ notes props Coding
```

```md
## Coding
tags:: AI, [[Making apps]], Skills
alias:: [[Agentic Coding]], [[Spec Coding]], [[Vibe Coding]]
prerequisites:: [[Atomic Way]], [[Coding Style]]
description:: Guidance for writing, refactoring or fixing code
```

Conveniently list it among all skills via:

```zsh
$ skills
```

And later retrieve it along with its prerequisites:

```zsh
$ about Coding
```

Sample tools calls:

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
* `notes page Atomic | grep -C 3 components` - use `grep` as usual
* `notes path Atomic | xargs code` - open page in VS Code, nvim, etc.
* `echo "Atomic\nCosmos" | notes tags` - tags on these pages
* `list Atomic Cosmos | notes page` -- display several pages
* `list Coding Tasking Decomposing | notes prereq | seen | notes page` - several concepts and their unique prerequisites
* `day | notes page` - today's journal page
* `day -1 | notes page` - yesterday's journal page
* `day $(seq 0 -90) | notes page` - to review 90 days of journal entries
* `day $(seq 0 -30) | notes page | links` - recent links from journal entries
* `day $(seq 0 -30) | notes page --only "~tasks"` - to display only TODOs
* `day $(seq 0 -30) | notes page --less "~tasks"` - to display everything but TODOs
* `day $(seq 0 -30) | notes page` - a range of journal entries (`zsh`)
* `day (0..-30) | notes page` - a range of journal entries (`pwsh`)

These can be issued directly in [OpenCode](https://opencode.ai) — by you or the agent.  Being command line, these can be used by any agentic runtime (Claude, Gemini, etc.) with [computer use](https://www.anthropic.com/news/3-5-models-and-computer-use).

All `notes` commands receive the primary operand directly or via stdin.  This is useful for composing compound commands.  The tools were designed to mind the Unix philosophy and support composition.

## Getting Started

Have `pwsh` and `deno` and `node` installed.  These runtimes were targeted over `zsh` and `bash` to accommodate everyone, whether on Mac, Linux or Windows.

Run Logseq in Developer Mode.  Flip it on under `Settings > Advanced`.  Then enable the local HTTP API via the button in the upper right. You must [set up a token](https://wiki.jamesravey.me/books/software-misc/page/logseq-http-api).  This setup and tooling transforms Logseq into a lightweight MCP server.

Install tools in your path however you like:
```zsh
export PATH=~/Documents/seqkit/bin:$PATH
```

Set these environment variables:

* **NOTES_DIR** - the path to your notes repo, e.g. `~/Documents/notes`
* **NOTES_ENDPOINT** - the HTTP API endpoint, e.g. http://127.0.0.1:12315/api
* **NOTES_TOKEN** - a token you configured for the HTTP API

Once done, start Logseq, start your shell and issue a few commands.

## Querying via Datalog

Logseq's superpower is its [DataScript](https://github.com/tonsky/datascript) spine.  With Datalog queries in easy reach, there's no limit to the queries and custom commands you can build.  The innards build on this.  It's one reason to prefer Logseq to Obsidian.

```zsh
$ notes q '[:find (pull ?p [*]) :where [?p :block/original-name "Atomic"]]'
```

## OpenCode Custom Tools

There is a custom `skills` and an `about` tool which together facilitate knowledge lookup minus computer use.  They're available to OpenCode when you start it in the repo.  Symlink them into your global opencode config path to make them universally available.

## License
[MIT](./LICENSE.md)
