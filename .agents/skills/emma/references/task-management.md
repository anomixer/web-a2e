# task-management - Manage Development Task Sets

Manage task sets stored under `.claude/docs/tasks/<name>/`. Supports listing, creating, adding, updating, resequencing, and dependency checking — with emma-aware impact inference.

---

## Task Location

All task sets live at:
```
.claude/docs/tasks/<name>/
  __ - tasks.md      ← manifest: all tasks, status, deps, dep tree (SINGLE READ for listing)
  00-overview.md     ← goals, decisions, task order
  01-first-task.md
  02-second-task.md
  ...
  nn-last-task.md
```

**Active task sets**: See `.claude/docs/tasks/list.md` for the directory of all task sets and their status.

---

## Manifest File (`__ - tasks.md`)

**Filename**: exactly `__ - tasks.md` (two underscores, space, dash, space, tasks.md)

This file is the fast index for the task set. It is the **only file read** when listing tasks. It must be kept in sync whenever tasks are added, updated, resequenced, or marked done.

### Format

```markdown
# <Name> — Task Manifest

## Tasks

| ID   | Title                          | File                              | Depends on | Status    |
|------|--------------------------------|-----------------------------------|------------|-----------|
| 01   | Create initial name pool       | 01-name-pool-initial.md           | —          | completed |
| 02   | MCP multi-emulator registry    | 02-mcp-multi-emulator-registry.md | —          | completed |
| 04   | MCP name assignment            | 04-mcp-name-assignment.md         | 03         | pending   |

## Dependency Tree

\`\`\`
01 Create initial name pool ──┐
02 MCP multi-emulator registry ──┤
02.5 MCP port reclaim ──────────┤
03 Browser agent button ────────┴──► 04 MCP name assignment ──► 05 MCP routing ──► 06 MCP tools
                                                                  └──────────────► 07 MCP disconnect ──► 08 MCP context injection
03 Browser agent button ────────────────────────────────────────────────────────► 09 Browser rename ──► 10 Docs ──► 11 Name pool full
\`\`\`
```

**Rules**:
- Table row order: numeric ascending (01, 02, 02.5, 03, ...)
- Depends on: comma-separated task IDs, or `—` for none
- Status: `pending` | `in-progress` | `completed`
- Dep tree: IDs + short task names on every node; always kept in the file but only shown to user when explicitly requested or needed to explain blocking
- Dep tree alignment rule: lead-in line length = just enough to clear the longest left-side label + arrow. Keep right-side content as close to the left margin as possible. Only extend lines further right if a node has a long name that would otherwise cause crowding.

### When to update the manifest

Update `__ - tasks.md` after **every** task operation that changes state:
- `tasks done` → update Status column for that task
- `tasks add` → append a new row + rebuild dep tree
- `tasks resequence` → update all IDs, filenames, Depends on, rebuild dep tree
- `tasks update` (if status or deps change) → update the relevant row + dep tree if needed

---

## Task File Format

```markdown
# Task [NN] — [Title]

**Status**: pending | in-progress | completed
**Depends on**: [task numbers, comma-separated, or "none"]
**Impacts**: [affected files/systems — e.g. agent-manager.js, http-server.js, MCP tool: disconnect_clients]
**Goal**: See `00-overview.md` for full design decisions

## Description

[2–3 sentence overview of what this task does]

## Spec

[Technical requirements — subsections as needed]

## Acceptance Criteria

- [ ] Criterion 1
- [ ] Criterion 2
```

**`Impacts` field** is optional on existing tasks but always added to new tasks. It lists affected source files and tool names inferred from the task description.

---

## Overview File Format

Every task set starts with `00-overview.md`:

```markdown
# [Project Name] — Goals & Decisions

[1–2 sentence summary of what this project does]

---

## Overview

[Problem being solved and why]

## Key Decisions

[Bullet-point decisions, organized by decision area]

## Task Order

| Task | Title | Depends on |
|------|-------|-----------|
| 01   | ...   | none      |
| 02   | ...   | 01        |
```

---

## Commands

### `tasks list` (no name — directory view)

When the user asks to list tasks **without specifying a name**, do not assume a task set. Instead:

1. Read `.claude/docs/tasks/list.md` to get the directory of all task sets and their status
2. Display each task set: name, description, and status summary (e.g. "3 pending / 10 completed" or "all completed")
3. Ask the user which one they want to drill into
4. Once they pick, proceed as `tasks list <name>`

If `.claude/docs/tasks/list.md` is missing or stale, fall back to listing directories under `.claude/docs/tasks/` directly and reading each `__ - tasks.md` to compute status.

**Update `list.md`** whenever a task set is created, or whenever all tasks in a set become completed (flip its status to `all completed`).

### `tasks list <name>`

Read **only** `.claude/docs/tasks/<name>/__ - tasks.md`. Print the Tasks table with a computed "Blocked by" column (deps that are not yet completed) and a `(next)` marker on the first unblocked pending task. Do **not** show the dependency tree unless the user asks for it.

```
multiconnect task list
─────────────────────────────────────────────────────
 ID   Title                              Status      Blocked by
 01   Create initial name pool           ✅ done     —
 02   MCP multi-emulator registry        ✅ done     —
 02.5 MCP port reclaim reconnection      ✅ done     —
 03   Browser agent button redesign      ✅ done     —
 04   MCP name assignment                pending     — (next)
 05   MCP default routing logic          pending     04
 ...
─────────────────────────────────────────────────────
Next unblocked: 04 — MCP name assignment
```

**Blocked by** = lists incomplete deps. **next** marker = first pending task with no incomplete deps.

### `tasks next <name>`

Show the first pending task with all dependencies completed. Print its full title, ID, and a one-line description. Suggest it as the starting point.

### `tasks show <name> <id>`

Read and display the full content of the specified task file. ID can be `04`, `04-browser-button-redesign`, or just the number prefix.

### `tasks done <name> <id>`

1. Read the task file
2. Change `**Status**: pending` or `**Status**: in-progress` → `**Status**: completed`
3. Write the task file
4. Update the Status column for that task in `__ - tasks.md`
5. Print confirmation + suggest next unblocked task

### `tasks update <name> <id>`

Read the task file and propose edits based on what the user describes. Update the fields (status, depends on, spec, acceptance criteria) as directed. Always show a diff summary of what changed.

### `tasks create <name>`

Create a new task set at `.claude/docs/tasks/<name>/`. Generate a skeleton `00-overview.md` with placeholders and prompt the user to fill in the goal and key decisions. Do not create task files yet — wait for `tasks add`.

### `tasks add <name> "<description>"`

1. Determine the next task number (scan existing files for highest NN, increment by 1)
2. Generate a kebab-case filename from the description
3. Infer the `**Impacts**` field (see Emma Integration below)
4. Suggest `**Depends on**` based on open tasks that touch the same systems
5. Create the task file with Description and Acceptance Criteria placeholders
6. Print the new file path and summary

### `tasks resequence <name>`

Use when task ordering needs to change (e.g., swap 03 and 04). Process:
1. Show current order
2. Ask user for new desired order (or accept it as part of the command)
3. Rename files to reflect new sequence (e.g., `03-xxx.md` ↔ `04-xxx.md`)
4. Update all `**Depends on**` references across all task files to match new numbers
5. Update `00-overview.md` task order table
6. Print a summary of all renames and reference updates

### `tasks check-deps <name>`

Validate the dependency graph:
- **Missing references**: A task depends on a number that has no corresponding file
- **Cycles**: A → B → A (would block forever)
- **Stale**: A task is `pending` but all its deps are `completed` — flag as "ready to start"
- **Out-of-order**: A task with a lower number depends on a higher number — may indicate a resequencing need

Print a clean report with any issues found.

---

## Emma Integration (Impacts Inference)

When running `tasks add`, emma reads the task description and infers what parts of the system are likely affected. Load these docs to inform the inference:

- `docs/agent-tools.md` — MCP tools (server-side)
- `docs/ag-ui-tools.md` — Frontend tools (browser-side)
- `docs/connections.md` — Connection/reconnect architecture
- `docs/mcp-ag-ui-integration.md` — Integration patterns

**Inference heuristics**:
- Description mentions "button", "UI", "label", "browser" → likely affects `src/js/ui/ui-controller.js`, `public/index.html`, `src/css/controls.css`
- Description mentions "connect", "reconnect", "SSE", "heartbeat" → likely affects `src/js/agent/agent-manager.js`
- Description mentions "MCP tool", "server", "registry", "emulator record" → likely affects `appleii-agent/src/http-server.js`
- Description mentions "tool" (new tool) → likely affects `appleii-agent/src/tools/`, `appleii-agent/src/tools/index.js`
- Description mentions "name", "rename", "localStorage" → likely affects `agent-manager.js`, `ui-controller.js`
- Description mentions "context injection", "llms.txt", "prompt" → likely affects `appleii-agent/src/http-server.js`, `public/docs/llms/`
- Description mentions "docs" → likely affects `wiki/`, `public/docs/llms/llm-main.txt`, `.claude/skills/emma/docs/`

Always state the inferences with "inferred from description" so the user can correct them.

---

## Process: `tasks list` (no name)

1. Read `.claude/docs/tasks/list.md` for the directory
2. Display each task set with name, description, and status summary
3. Ask the user which one to drill into
4. Proceed with `tasks list <name>` for the chosen set

## Process: `tasks list <name>`

1. Read `.claude/docs/tasks/<name>/__ - tasks.md` (single file — no directory scan)
2. Compute "Blocked by" for each pending task: list any Depends-on IDs whose Status is not `completed`
3. Identify the first pending task with no incomplete deps → mark as `(next)`
4. Print the Tasks table with Blocked by column
5. Do **not** print the Dependency Tree unless the user explicitly asks for it (`tasks tree <name>`)

## Process: `tasks resequence`

1. Show current file listing with numbers
2. Accept new order from user
3. For each rename needed:
   a. Rename the file (e.g. `03-foo.md` → `04-foo.md`)
   b. Grep all other task files for references to the old number in `**Depends on**`
   c. Update those references to the new number
4. Update the `00-overview.md` task order table
5. Print a diff-style summary

---

## File Naming

Task files: `NN-kebab-case-title.md` where NN is zero-padded two digits (01, 02, 03 ... 10, 11). Half-steps allowed: `02.5-title.md`.

Kebab-case from description: lowercase, spaces to hyphens, strip special chars. Keep it short (3–5 words max).

---

## Safeguards

- Never delete task files — only rename or update Status
- When resequencing, always update `**Depends on**` references across all files
- When marking done, do not remove Acceptance Criteria — leave them as a record
- `tasks create` does not overwrite an existing task set without confirming with the user
