---
name: summarize
description: Checkpoint session with enhanced summary and optionally continue with cleared context.
---

# Summarize Skill

Comprehensive session checkpointing and continuation for maintaining context across conversation resets.

## Purpose

This skill provides two main capabilities:
1. **Checkpoint** - Create detailed summaries of work sessions
2. **Continue** - Load checkpoints into current context (without clearing)

Use checkpointing to preserve important context before conversation compaction or when switching focus areas. Use continuation to add checkpoint context to current conversations, or run `/clear` separately to start fresh with auto-loaded context via the SessionStart hook.

## Commands

### Create Checkpoint

See [references/summarize.md](references/summarize.md) for full details.

```bash
/summarize                                      # Default checkpoint
/summarize to {path}                            # Custom output location
/summarize using {instructions}                 # Custom format
/summarize using {instructions} to {path}       # Both custom
/summarize with extra {name}                    # Include extra reference content
```

**What it does:**
- Generates comprehensive summary following instructions template
- Saves to `/.Codex/summary/SUMMARY.md` (or custom path)
- Preserves all context, files, decisions, TODOs, patterns
- `with extra {name}`: Loads `.Codex/skills/summarize/references/extra-{name}.md` and includes its raw contents in the summary for restoration

### Prune Topics

Remove specific discussions from summaries while noting they were removed.

```bash
/summarize prune {topic}                    # Summarize now, remove {topic} discussions
/summarize later prune {topic}              # Log for later, don't summarize now
/summarize prune {topic} to {path}          # Prune and save to custom path
```

**What it does:**
- `prune {topic}`: Creates summary immediately with specified topic removed
- `later prune {topic}`: Adds topic to prune log for next summarization, doesn't summarize now
- Removes all discussions about the specified topic from the summary
- Notes in summary that topic was pruned (brief mention only)
- Maintains prune log at `/.Codex/summary/.prune_log`

**Use cases:**
- Remove rabbit holes that didn't yield results
- Exclude tangential discussions not relevant to project
- Clean up summaries by removing outdated exploration threads

### Load Checkpoint

See [references/continue.md](references/continue.md) for full details.

```bash
/summarize continue                   # Load default and display
/summarize continue decide            # List unresolved decisions (if any)
/summarize continue from {path}       # Load custom file and display
```

**What it does:**
- Loads checkpoint summary into current context (does NOT clear context)
- Displays summary content
- Use `decide` to show only unresolved decisions from the summary
- Useful for referencing past work without resetting current conversation
- User can run `/clear` separately to reset context (hook will rotate SUMMARY.md)

## Quick Reference

| Command | Instructions | Output | Clears Context | Visible | Special |
|---------|-------------|--------|----------------|---------|---------|
| `/summarize` | Default (enhanced.md) | SUMMARY.md | ✗ No | - | - |
| `/summarize to {path}` | Default | Custom path | ✗ No | - | - |
| `/summarize using {inst}` | Custom | SUMMARY.md | ✗ No | - | - |
| `/summarize using {inst} to {path}` | Custom | Custom path | ✗ No | - | - |
| `/summarize with extra {name}` | Default | SUMMARY.md | ✗ No | - | Includes extra-{name}.md |
| `/summarize prune {topic}` | Default | SUMMARY.md | ✗ No | ✓ Yes | Removes {topic} |
| `/summarize later prune {topic}` | - | Prune log only | ✗ No | - | Log for later |
| `/summarize prune {topic} to {path}` | Default | Custom path | ✗ No | ✓ Yes | Removes {topic} |
| `/summarize continue` | - | Loads SUMMARY.md | ✗ No | ✓ Yes | - |
| `/summarize continue decide` | - | Loads SUMMARY.md | ✗ No | ✓ Yes | Lists unresolved |
| `/summarize continue from {path}` | - | Loads custom file | ✗ No | ✓ Yes | - |
| `/clear` (separate command) | - | - | ✓ Yes (hook rotates) | ✗ No | - |

## Files Structure

```
.Codex/skills/summarize/
├── SKILL.md                    # This file (index)
└── references/
    ├── enhanced.md             # Default summary format/instructions
    ├── summarize.md            # Checkpoint behavior documentation
    ├── continue.md             # Continue behavior documentation
    ├── rotate.py               # Archive rotation script
    └── extra-*.md              # Project-specific extra reference files

.Codex/summary/
├── SUMMARY.md                  # Current checkpoint (rotated on continue)
├── .prune_log                  # Topics to prune from next summary
└── /
    ├── SUMMARY_20260207_143022.md
    └── SUMMARY_20260207_150315.md
```

## Typical Workflow

```bash
# Session 1: Working on DDL design
# ... extensive work on schema design ...
/summarize
# Checkpoint saved to SUMMARY.md

# Session 2: Fresh start with checkpoint (clear context, auto-load)
/clear
# Hook rotates SUMMARY.md → SUMMARY_timestamp.md
# Hook loads summary into context (hidden)
# Clean slate with full context from checkpoint
# ... continue DDL work ...
/summarize
# New checkpoint saved

# Session 3: Reference old checkpoint without clearing
/summarize continue from /.Codex/summary/SUMMARY_20260207_181332.md
# Loads old summary into current context (displayed)
# Context NOT cleared - just adds reference material
# ... review old decisions, compare approaches ...

# Session 4: Load current checkpoint into ongoing conversation
/summarize continue hide
# Loads SUMMARY.md into context without displaying it
# Useful for refreshing context mid-session
# ... continue working with updated context ...

# Session 5: Create checkpoint with project-specific references
/summarize with extra emma
# Loads extra-emma.md content (contains instructions to load architecture docs)
# Includes those instructions in the summary
# When summary is restored, the reference files will be loaded automatically
# ... checkpoint includes project context ...
```

## Implementation

When this skill is invoked, Codex should:

### For `/summarize` (checkpoint creation):
1. Load [references/summarize.md](references/summarize.md) into context
2. Follow the implementation steps defined there to create the checkpoint

### For `/summarize with extra {name}` (checkpoint with extra references):
1. **Parse arguments from the skill args:**
   - Extract `{name}` from command
   - Resolve to path: `.Codex/skills/summarize/references/extra-{name}.md`
   - Can be combined with other options: `to {path}`, `using {instructions}`

2. **Load extra reference file:**
   - Read the extra file: `.Codex/skills/summarize/references/extra-{name}.md`
   - Store raw contents to include in summary

3. **Create checkpoint:**
   - Load [references/summarize.md](references/summarize.md) into context
   - Follow standard checkpoint creation process
   - Include the extra reference file contents in the summary under a special section:
     ```markdown
     ## Extra References: {name}

     {raw contents of extra-{name}.md}
     ```

4. **What gets included:**
   - The extra file content is embedded in the summary
   - When the summary is loaded later (via continue or SessionStart hook), the extra file instructions are restored
   - This allows project-specific reference files to be automatically loaded with summaries

5. **Use cases:**
   - Project-specific architecture docs that should always be loaded
   - Custom tool documentation that's specific to the codebase
   - Team conventions or coding standards
   - Any reference material that provides essential context

### For `/summarize prune {topic}` or `/summarize later prune {topic}`:
1. **Parse arguments from the skill args:**
   - Check for `later` keyword → `defer = true`, otherwise `defer = false`
   - Extract `{topic}` from command
   - Check for `to {path}` pattern → extract `custom_path`, otherwise `custom_path = null`

2. **Update prune log:**
   - File path: `/.Codex/summary/.prune_log`
   - If file doesn't exist, create it
   - Append topic to prune log: `{topic}\n`
   - Confirm to user: "Added '{topic}' to prune list for next summary."

3. **If `defer = false` (immediate prune):**
   - Load [references/summarize.md](references/summarize.md) into context
   - Before creating summary, read `.prune_log` to get all topics to prune
   - Pass prune topics to the summarization process
   - Follow summarize.md implementation with pruning applied
   - After successful summary creation, clear `.prune_log` (or archive it)

4. **If `defer = true` (later prune):**
   - Skip summarization
   - Confirm: "'{topic}' will be pruned from next summary. Run /summarize to create summary with pruning applied."

### For `/summarize continue` (load summary into context):
1. **Parse arguments from the skill args:**
   - Check for `decide` keyword → `show_decisions_only = true`
   - Otherwise → `show_decisions_only = false`
   - Check for `from {path}` pattern → extract `custom_path`, otherwise `custom_path = null`

2. **Determine which file to load:**
   - **If no custom path specified:**
     - Load from `/.Codex/summary/SUMMARY.md` (current checkpoint)
     - File path = `/.Codex/summary/SUMMARY.md`

   - **If custom path specified:**
     - Load from the specified path
     - File path = `custom_path`

3. **Read the summary file:**
   - Use Read tool to load the file content into context
   - This makes the full summary available for the current conversation

4. **Display based on mode:**

   - **If `show_decisions_only == false`** (default):
     - Display the full summary to the user for reference
     - Confirm: "Summary loaded from `{file_path}` and displayed."

   - **If `show_decisions_only == true`** (decide mode):
     - Extract and display ONLY the unresolved decisions from Section 13
     - Check the "METADATA: Unresolved Decisions" section at the end
     - If unresolved decisions exist:
       - Display each decision with its full context
       - Ask: "Would you like to address any of these decisions now?"
     - If no unresolved decisions:
       - Confirm: "No unresolved decisions found in this summary."

5. **Ready for work:**
   - The summary is now in context and can inform responses
   - No context clearing occurs - this is purely additive
   - User can optionally run `/clear` separately if they want to reset context with the hook

## See Also

- **[references/summarize.md](references/summarize.md)** - Full checkpoint creation documentation
- **[references/continue.md](references/continue.md)** - Full continuation documentation
- **[references/enhanced.md](references/enhanced.md)** - Default summary format template
- **[references/rotate.py](references/rotate.py)** - Archive rotation script
