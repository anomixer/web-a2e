# emma - Apple //e Emulator Development Assistant

A comprehensive development assistant for the Apple //e browser-based emulator project. Emma intelligently detects your intent and helps with creating tools, maintaining documentation, analyzing changes, and answering questions.

## Usage

Simply tell emma what you need in natural language:

```
/emma create a new app tool for [purpose]
/emma I need to make an agent tool that [does X]
/emma update the docs to reflect [change]
/emma will this change to [file] affect any tools?
/emma make a github PR for these features
/emma reference styles
/emma how do I [question]?
```

- Answer with short answers as the user will need to understand and be able to mentally grasp changes
- Wait until the users want lots of code before presenting it when they are inquiring


## How Emma Works

Emma detects your intent and routes to the appropriate specialized guide:

### Systems

**App Tool**: The emulator project located in [root]/*
**Agent Tool**: The MCP server named appleii-agent (alias: emma) in [root] ../appleii-agent/*

### Creating Tools

**Intent**: Creating a new app tool or agent tool

**Examples**:
- "create a new app tool for reading disk sectors"
- "I need an agent tool that loads ROM files"
- "make a tool to control the CPU"

**Routes to**: `references/new-app-tool.md` or `references/new-agent-tool.md` based on context

### Updating Documentation

**Intent**: Updating project docs or generating emma's internal docs

**Examples**:
- "update CLAUDE.md with the new architecture"
- "generate docs for all the app tools"
- "update the release notes for version 1.2"

- write docs to ../skills/emma/docs/*

**Routes to**: `references/update.md`

### Analyzing Impact

**Intent**: Checking if changes affect tools, agent, or require updates

**Examples**:
- "will changing this WASM function affect any tools?"
- "what app tools need updating if I rename this function?"
- "does this change impact the agent?"

**Routes to**: `references/impact.md`

### Referencing Documentation / Session Restore

**Intent**: Loading important docs into context for adherence, or restoring context after a session summary

**Examples**:
- "restore the core files"
- "load core files"
- "reference styles"
- "reference bindings"
- "reference architecture"

**Routes to**: `references/reference.md`

**Session restore shortcut**: "restore/load core files" → always loads `core-files` (all 7 files: 5 docs + 2 source files)

**Available references**:
- `core-files` - All 7 core files for full session restore (styles, bindings, ag-ui-tools, agent-tools, mcp-ag-ui-integration, agent-manager.js, agent-tools.js)
- `docs/styles.md` - Coding styles, project styles, conventions
- `docs/bindings.md` - WASM bindings quick reference
- `docs/architecture.md` - System architecture overview

### Creating Pull Requests

**Intent**: Generating GitHub PR descriptions from commit history

**Examples**:
- "make a github PR for these features"
- "create a PR description"
- "generate PR for recent changes"

**Routes to**: `references/create-pr.md`

### Managing Tasks

**Intent**: Creating, updating, listing, or resequencing development task sets

**Examples**:
- "tasks list multiconnect"
- "what's the next task for multiconnect?"
- "mark multiconnect 04 as done"
- "add a task to multiconnect for the button redesign"
- "check dependencies for multiconnect"
- "create a new task set called widgets"
- "resequence multiconnect — swap 03 and 04"
- "tasks show multiconnect 05"

**Routes to**: `references/task-management.md`

**Task sets location**: `.claude/docs/tasks/<name>/`

### Answering Questions

**Intent**: Finding information in docs or codebase

**Examples**:
- "how do the WASM bindings work?"
- "where is the disk controller code?"
- "what tools use the CPU functions?"

**Routes to**: `references/query.md`

## Architecture

**Progressive Disclosure**: Each command loads only the reference documentation it needs, avoiding context bloat.

**Documentation Sources**:
- `docs/app-tools.md` - AG-UI app tool registry and patterns
- `docs/agent-tools.md` - MCP agent tool registry and patterns
- `docs/bindings.md` - WASM interface documentation
- `docs/llm-txt.md` - LLM integration documentation
- `docs/architecture.md` - System architecture overview

**Reference Documents**: Detailed instructions for each sub-skill in `references/`

## Implementation

The skill dispatcher reads the command and routes to the appropriate reference:

1. Parse command (`app-tool`, `agent-tool`, `docs`, `impact`, `update`, or question)
2. Load only the relevant reference document
3. Execute the sub-skill with the reference as context
4. Generate outputs in `docs/` as needed

## Files

```
.claude/skills/emma/
├── SKILL.md                    # This file (skill index)
├── references/                 # Sub-skill instructions
│   ├── new-app-tool.md        # Create AG-UI app tools
│   ├── new-agent-tool.md      # Create MCP agent tools
│   ├── update.md              # Update any documentation
│   ├── impact.md              # Analyze change impacts
│   ├── reference.md           # Load docs into context
│   ├── create-pr.md           # Generate GitHub PR descriptions
│   ├── task-management.md     # Manage development task sets
│   └── query.md               # Query docs
└── docs/                       # Important reference docs
    ├── styles.md              # Coding styles & conventions
    ├── bindings.md            # WASM bindings reference
    ├── architecture.md        # Architecture overview
    ├── app-tools.md           # App tool registry
    └── agent-tools.md         # Agent tool registry

.claude/docs/tasks/<name>/      # Development task sets (one folder per project)
    ├── __ - tasks.md          # Manifest: fast index for listing (single file read)
    ├── 00-overview.md         # Goals & decisions
    └── 01-nn-*.md             # Individual task files (NN-kebab-title.md)
```

## Intent Detection & Routing

When invoked, emma:

1. **Parses user request** to detect intent
2. **Routes to appropriate reference**:
   - Tool creation keywords → `new-app-tool.md` or `new-agent-tool.md`
   - Update/doc keywords → `update.md`
   - Impact/affect/change keywords → `impact.md`
   - PR/pull request keywords → `create-pr.md`
   - Reference keywords → `reference.md`
   - Task management keywords → `task-management.md`
   - Question patterns → `query.md`
3. **Loads only relevant reference** (progressive disclosure)
4. **Executes with context** from the reference
5. **Returns results** (code, docs, analysis, PR descriptions)

### Intent Detection Patterns

**Tool Creation**:
- Keywords: create, make, build, add, new, tool
- Context: "app tool", "agent tool", "MCP tool", "frontend tool"

**Documentation**:
- Keywords: update, generate, document, write, refresh
- Context: "CLAUDE.md", "README", "docs", "release notes", "bindings"

**Impact Analysis**:
- Keywords: impact, affect, break, change, sync, update
- Context: "WASM", "tools", "agent", "binding", "function"

**Reference / Session Restore**:
- Keywords: reference, apply, load, restore, use
- Context: "core files", "styles", "bindings", "architecture", "conventions", "session"
- "restore core files" / "load core files" → always loads `core-files` (all 7 files)

**Pull Request Creation**:
- Keywords: PR, pull request, github, description, create, make, generate
- Context: "for these features", "recent changes", "unpushed commits"

**Task Management**:
- Keywords: tasks, task, todo, backlog, track, sequenc, resequence, mark done, check deps
- Context: task set names (e.g. "multiconnect"), "list tasks", "add task", "create task set", "what's next", "mark as done", "check dependencies"
- Routes to: `references/task-management.md`

**Questions**:
- Patterns: how, what, where, when, why, can I, does it
- Fallback: anything not matching above intents

This keeps each invocation lightweight while maintaining comprehensive capabilities.
