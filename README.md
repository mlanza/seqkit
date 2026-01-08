# Note

**Note** is a tool for managing text content whatever the flavor — Skills, Commands, Prompts, Rules, Knowledge — in [Logseq](https://logseq.com).  Unlike MCP Servers, CLIs are ephemeral, composeable and available to humans 🧔🏼 and agents 🤖 alike .

<p align="center">
  <img src="./images/logo.png" style="width: 300px; max-width: 100%;" />
</p>

Your local-first commonplace book 📖 is memory scaffolding, a near perfect spot for accessing and keeping the information and instructions an agent needs to thrive.  How better to teach an agent your craft than by sharing your second 🧠 with it.

Take skills.  Tag a page `Skills` and describe it with a `description` property.  Include any `prerequisites` that make sense and you're ready to go.  Prerequisite topics are automatically — and recursively — included when calling the `about` subcommand.

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

* `nt page Atomic | nt links` - to view links on page
* `nt list Coding Tasking Decomposing | nt prereq | nt seen | nt page` - several concepts and their unique prerequisites
* `nt day $(seq 0 -30) | nt page | nt links` - links from latest journal entries
* `nt day $(seq 0 -30) | nt page --only tasks` - to display only TODOs
* `nt day $(seq 0 -30) | nt page --less tasks` - to display everything but TODOs


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
* **NOTE_CONFIG** - path to config file (default is `~/.config/nt/config.toml`)

A few entries worth setting up:

```toml
# config.toml
agentignore = [
  "tasks",
  "links",
]

[shorthand]
"props" = "^[^\\s:]+::"
"tasks" = "^(TODO|DOING|LATER|NOW|CANCELED|WAITING)"
"links" = "^\\s*(?:https?:\\/\\/\\S+|\\[[^\\]\\r\\n]+\\]\\(\\s*https?:\\/\\/[^\\s)]+(?:\\s+\"[^\"\\r\\n]*\")?\\s*\\))\\s*$"
"sched" = """
[:find (pull ?b [*])
:in $ ?start ?end
:where
[?b :block/content ?blockcontent]
[?b :block/page ?page]
[?page :block/name ?name]
[?b :block/scheduled ?scheduled]
[(>= ?scheduled ?start)]
[(<= ?scheduled ?end)]]
"""
```

Once done, start Logseq, start your shell and issue a few commands.

## Going Deeper

### Generating `AGENTS.md`

While technically possible to give the agent a minimal `AGENTS.md` and ask it to lookup the most crucial instructions outright, that's just slow.  Although the content will be redundant (in Logseq and in your filesystem), it's more expedient to bootstrap your agent from a file written to your project or to the designated place used by your preferred agentic runtime.

The following assumes the target page `prerequisites` is replete with your most critical items.  The `document` tool slightly flattens Logseq's outline formatting.

```zsh
nt about "Agent Instructions" | nt document --para | cat -s
```

### `about` Design Rationale

The `about` subcommand filters out blocks which are themselves either links or TODOs.  This is because of how I keep notes, combining [PKM](https://en.wikipedia.org/wiki/Personal_knowledge_management) and [GTD](https://en.wikipedia.org/wiki/Getting_Things_Done) content in one spot.  This includes loose links — related posts and products or content to be examined.  TODOs are real work, half-baked ideas, or maybe links marked as future reading.  That's all noise to an agent which is why it gets filtered out.  Links which are embedded in statements as hyperlinks are kept.

### Querying via Datalog

Logseq's superpower is its [DataScript](https://github.com/tonsky/datascript) spine.  With Datalog queries in easy reach, there's no limit to the queries and custom commands you can build.  The innards build on this.  It's one reason to prefer Logseq to Obsidian.

```zsh
$ nt q '[:find (pull ?p [*]) :where [?p :block/original-name "Atomic"]]'
```

### Ergonomics

The kit was designed to minimize ceremony, to compose, and to mind the Unix philosophy.  The `nt` commands, for example, can receive the primary operand directly or via stdin.  With embedded spaces being an routine concern, it's modeled below.

#### Show pages having certain tags

Equivalents:
```zsh
nt list Atomic Clojure\ Way | nt tags
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

## License
[MIT](./LICENSE.md)
