# Note

**Note** is a tool for managing text content whatever the flavor — Skills, Commands, Prompts, Rules, Knowledge — in [Logseq](https://logseq.com).  Unlike MCP Servers, CLIs are ephemeral, composeable and available to humans 🧔🏼 and agents 🤖 alike .

<p align="center">
  <img src="./images/logo.png" style="width: 300px; max-width: 100%;" />
</p>

Your local-first commonplace book 📖 is memory scaffolding, a near perfect spot for accessing and keeping the information and instructions an agent needs to thrive.  How better to teach an agent your craft than by sharing your second 🧠 with it.

The tool was designed to minimize ceremony, to compose, and to mind the Unix philosophy.  That's why subcommands can frequently receive the primary operand directly or via stdin.

Take skills.  Tag a page `Skills` and describe it with a `description` property.  Include any `prerequisites` that make sense and you're ready to go.  Prerequisite topics are automatically — and recursively — included when calling the `about` subcommand.

Getting frontmatter properties:

```zsh
$ nt props Coding
```

```md
# Coding
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

These can be issued directly in [OpenCode](https://opencode.ai), Gemini, Claude, etc.  — by you or by any agent with with [computer use](https://www.anthropic.com/news/3-5-models-and-computer-use).

## Getting Started

Install the tool into your path or extend your path, whichever you like:
```zsh
export PATH=~/Documents/nt/bin:$PATH
```

Have `pwsh` and `deno` and `node` installed.  The interal scripts target these runtimes over `zsh` and `bash` to accommodate everyone, whether on Mac, Linux or Windows.

Run Logseq in Developer Mode.  Flip it on under `Settings > Advanced`.  Then enable the local HTTP API via the button in the upper right. You must [set up a token](https://wiki.jamesravey.me/books/software-misc/page/logseq-http-api).  This setup and tooling transforms Logseq into a lightweight MCP server.

Add these environment variables to your shell:

* **LOGSEQ_TOKEN** - a token you configured for the HTTP API
* **NOTE_CONFIG** - path to config file (default is `~/.config/nt/config.toml`)

Within config, at minimum, identify where your Logseq repo is:

```toml
# config.toml
[logseq]
repo = 'D:\notes'
```

If you change the `endpoint` to something other than the default of http://127.0.0.1:12315/api, you'll have to include that setting too.

Once done, start Logseq, and then your shell. Issue some commands.

```zsh
nt page Atomic # show some page, for example
```

## Going Deeper

### Generating `AGENTS.md`

While technically possible to give the agent a minimal `AGENTS.md` and ask it to lookup even the baseline instructions, that's just slow.  Although the content will be redundant (in Logseq and in your filesystem), it's more expedient to bootstrap your agent from a file written to your project or to the designated place used by your preferred agentic runtime.

The following assumes the target page `prerequisites` is replete with your most crucial rules and instructions.  The `document` tool slightly flattens Logseq's outline formatting.

```zsh
nt about "Agent Instructions" | nt document --para | cat -s
```

### Agent Content Filtering

Because I use Logseq for both [PKM](https://en.wikipedia.org/wiki/Personal_knowledge_management) and [GTD](https://en.wikipedia.org/wiki/Getting_Things_Done), my pages have mixed content.  I may have a smattering of links to interestings sites and/or a pile of tasks in various stages pertinent to the page topic or project.  I may also have information and/or instructions.  What I'm getting at is some of the stuff on a page is useful to me alone, while other stuff is more generally useful to a third party like an agent.

This is not about sensitive content as I don't keep that in my stores.  The concern is not leaks, but wasted or confusing context.  To help the `nt page` command has options to exclude certain blocks (along with the child content).

This command filters out task blocks:

```zsh
nt page Atomic --less '^(TODO|DOING|DONE|WAITING|NOW|LATER)'
```

While, conversely, this one shows only task blocks:

```zsh
nt page Atomic --only '^(TODO|DOING|DONE|WAITING|NOW|LATER)'
```

You can send in multiple values:

```zsh
nt page Atomic --less '^https?://[^)]+$' --less '^[.*](https?://[^)]+)$'
```

But typing that will get tedious fast.  Better to define a `filter` table in your config.

```toml
[filter]
props = "^[^\\s:]+::"
tasks = "^(TODO|DOING|LATER|NOW|CANCELED|WAITING)"
links = "^\\s*(?:https?:\\/\\/\\S+|\\[[^\\]\\r\\n]+\\]\\(\\s*https?:\\/\\/[^\\s)]+(?:\\s+\"[^\"\\r\\n]*\")?\\s*\\))\\s*$"
```

Having that, you can exclude one type of block:
```zsh
nt page Atomic --less tasks
```

Or include one type of block:
```zsh
nt page Atomic --only tasks
```

Or multiple:

```zsh
nt page Atomic --less tasks --less links
```

Some of the examples in the tool `--help` anticipate these defintions.

This command is for a **human** and includes only what blocks filter out:
```zsh
nt page Atomic --only
```

This one is for an **agent** and includes everything but that noise:
```zsh
nt page Atomic --less
```

Alternately, if it helps you remember:
```zsh
nt page Atomic --human
```
or
```zsh
nt page Atomic --agent
```

### Querying via Datalog

Logseq's superpower is its [DataScript](https://github.com/tonsky/datascript) spine.  With Datalog queries in easy reach, there's no limit to the queries and custom commands you can build.  The innards build on this.  They can be parameterized.

It's a reason to prefer Logseq to Obsidian.

```zsh
nt q '[:find (pull ?p [*]) :where [?p :block/original-name "$1"]]' Atomic
```

Any quirks around whether a query runs come from the HTTP API’s implementation, not from `nt` itself. If you’re testing what the API does or doesn’t support, call it directly with `curl`.

These links about advanced queries may help:

* https://adxsoft.github.io/logseqadvancedquerybuilder/

## License
[MIT](./LICENSE.md)
