# Note

**Note** is command line access to your [Logseq](https://logseq.com) content.  Command line tools are ephemeral, composeable and available to humans 🧔🏼 and agents 🤖 alike — and they're easier to wrap as MCP servers, than the reverse.

<p align="center">
  <img src="./images/logo.png" style="width: 250px; max-width: 100%;" />
</p>

Your local-first commonplace book 📖 is a near perfect spot for keeping all the information and instructions an agent needs to thrive — one place (💍) to rule them all.  How better to teach an agent your craft than by sharing your second 🧠 with it.

That also makes it the ideal store for skills.  Tag a page `Skills` and describe it with a `description` property.  Include any `prerequisites` that make sense and you're ready to go.  Prerequisite topics are automatically — and recursively — included when calling the `about` subcommand.

Getting frontmatter properties:

```zsh
$ nt props Coding
```

```md
## Coding
tags:: AI, [[Making apps]], Skills
alias:: [[Agentic Coding]], [[Spec Coding]], [[Vibe Coding]]
prerequisites:: [[Clojure Way]], [[Coding Style]]
description:: Guidance for writing, refactoring or fixing code
```

Conveniently list it among all skills via:

```zsh
$ nt skills
```

And later retrieve it along with its prerequisites:

```zsh
$ nt about Coding
```

Sample tools calls:

* `nt pages` - list regular pages
* `nt pages -t journal` - list journal pages
* `nt pages -t all` - list both journal and regular pages
* `nt page Atomic | nt wikilinks` - to view wikilinks on a page
* `nt page Atomic | nt wikilinks | nt page` - list all wikilinked pages
* `nt page Atomic | nt links` - to view links on page
* `nt page Atomic` - list a particular page by name
* `nt tags Programming` - list notes tagged Programming
* `nt name programming | nt t` - normalize the name and find pages tagged Programming
* `nt tags Programming | nt page` - pipe names into page to list content for a bunch of pages
* `nt page Atomic | grep -C 3 components` - use `grep` as usual
* `nt path Atomic | xargs code` - open page in VS Code, nvim, etc.
* `echo "My thoughts" | nt post Atomic` - writing a page
* `echo "My thoughts" | nt post Atomic --overwrite` - overwriting an existing page
* `nt path Atomic | xargs git restore` - undoing a mistaken overwrite
* `echo "Atomic\nClojure Way" | nt tags` - tags on these pages
* `nt list Atomic "Clojure Way" | nt page` -- display several pages
* `nt list Coding Tasking Decomposing | nt prereq | nt seen | nt page` - several concepts and their unique prerequisites
* `nt day | nt page` - today's journal page
* `nt day -1 | nt page` - yesterday's journal page
* `nt day $(seq 0 -90) | nt page` - to review 90 days of journal entries
* `nt day $(seq 0 -30) | nt page | nt links` - links from latest journal entries
* `nt day $(seq 0 -30) | nt page --only "~tasks"` - to display only TODOs
* `nt day $(seq 0 -30) | nt page --less "~tasks"` - to display everything but TODOs
* `nt d $(seq 0 -30) | nt p` - a range of journal entries (`zsh`)
* `nt d (0..-30) | nt p` - a range of journal entries (`pwsh`)

These can be issued directly in [OpenCode](https://opencode.ai), Gemini, Claude, etc.  — by you or by any agent with with [computer use](https://www.anthropic.com/news/3-5-models-and-computer-use).

## Getting Started

Have `pwsh` and `deno` and `node` installed.  These runtimes were targeted over `zsh` and `bash` to accommodate everyone, whether on Mac, Linux or Windows.

Run Logseq in Developer Mode.  Flip it on under `Settings > Advanced`.  Then enable the local HTTP API via the button in the upper right. You must [set up a token](https://wiki.jamesravey.me/books/software-misc/page/logseq-http-api).  This setup and tooling transforms Logseq into a lightweight MCP server.

Install it to your path however you like:
```zsh
export PATH=~/Documents/nt/bin:$PATH
```

Set these environment variables:

* **LOGSEQ_REPO** - the path to your Logseq notes repo, e.g. `~/Documents/notes`
* **LOGSEQ_ENDPOINT** - the HTTP API endpoint, e.g. http://127.0.0.1:12315/api
* **LOGSEQ_TOKEN** - a token you configured for the HTTP API

Once done, start Logseq, start your shell and issue a few commands.

## Going Deeper

### Generating `AGENTS.md`

While technically possible to give the agent a minimal `AGENTS.md` and ask it to lookup the most crucial instructions outright, that's just slow.  Although the content will be redundant (in Logseq and in your filesystem), it's more expedient to bootstrap your agent from a file written to your project or to the designated place used by your preferred agentic runtime.

The following assumes the target page `prerequisites` is replete with your most critical items.  The `docmode` tool slightly flattens Logseq's outline formatting.

```zsh
nt about "Agent Instructions" | nt docmode --para | cat -s
```

### Querying via Datalog

Logseq's superpower is its [DataScript](https://github.com/tonsky/datascript) spine.  With Datalog queries in easy reach, there's no limit to the queries and custom commands you can build.  The innards build on this.  It's one reason to prefer Logseq to Obsidian.

```zsh
$ nt q '[:find (pull ?p [*]) :where [?p :block/original-name "Atomic"]]'
```

### `about` Design Rationale

The `about` subcommand filters out blocks which are themselves either links or TODOs.  This is because of how I keep notes, combining [PKM](https://en.wikipedia.org/wiki/Personal_knowledge_management) and [GTD](https://en.wikipedia.org/wiki/Getting_Things_Done) content in one spot.  This includes loose links — related posts and products or content to be examined.  TODOs are real work, half-baked ideas, or maybe links marked as future reading.  That's all noise to an agent which is why it gets filtered out.  Links which are embedded in statements as hyperlinks are kept.

### Ergonomics

The kit was designed to minimize ceremony, to compose, and to mind the Unix philosophy.  The `nt` commands, for example, can receive the primary operand directly or via stdin.  With embedded spaces being an routine concern, it's modeled below.

#### Show pages having certain tags

Equivalents:
```zsh
nt l Atomic Clojure\ Way | nt t
```
```zsh
nt tags Atomic
nt tags Clojure\ Way
```
```zsh
printf "%s\n" Atomic Clojure\ Way | xargs -I {} nt tags {}
```
```pwsh
'Atomic', 'Clojure Way' | % { nt tags $_ } # powershell
```

#### Show tags on certain pages

Equivalents:
```zsh
nt list Atomic "Clojure Way" | nt props tags
```
```zsh
nt props Atomic tags
nt props "Clojure Way" tags
```
```zsh
printf "%s\n" Atomic "Clojure Way" | xargs -I {} nt props {} tags
```
```pwsh
'Atomic', 'Clojure Way' | % { nt props $_ tags } # powershell
```

### OpenCode Custom Tools

There is a custom `skills` and an `about` tool which together facilitate knowledge lookup minus computer use.  They're available to OpenCode when you start it in the repo.  Symlink them into your global opencode config path to make them universally available.

## License
[MIT](./LICENSE.md)
