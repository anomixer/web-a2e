# Continue - Load Checkpoint and Resume

Load a previously saved summary into the current context (does NOT clear context).

## Command Patterns

### Default
```
/summarize continue
```
1. Load `/agents/compact/saves/SUMMARY.md` into context
2. **Display**: Show full summary to user
3. **No context clearing** - purely additive

### Show Unresolved Decisions
```
/summarize continue decide
```
1. Load `/agents/compact/saves/SUMMARY.md` into context
2. **Extract and display ONLY unresolved decisions** from Section 13
3. Check "METADATA: Unresolved Decisions" section
4. If decisions exist: display with full context and ask if user wants to address them
5. If no decisions: confirm none found
6. **No context clearing** - purely additive

### Custom Path
```
/summarize continue from {path}
```
1. Load `{path}` into context
2. **No rotation**: Preserve custom file as-is
3. **Display**: Show full summary to user
4. **No context clearing** - purely additive

## Implementation Steps

1. **Parse Arguments:**
   - Check for `decide` keyword → sets show_decisions_only = true
   - Otherwise → show_decisions_only = false
   - Check for `from {path}` pattern → extract source path
   - Default source: `/agents/compact/saves/SUMMARY.md`

2. **Load Summary into Context:**
   - Use Read tool to load the summary file
   - This adds the summary to the current conversation context
   - **No context clearing** - this is purely additive
   - User can run `/clear` separately if they want to reset context

3. **Display:**

   **Default mode** (show_decisions_only = false)
   - Display the full summary to user for reference
   - Confirm: "Summary loaded from `{file_path}` and displayed."

   **Decide mode** (show_decisions_only = true)
   - Parse the summary and extract Section 13 (Unresolved Decisions)
   - Also check "METADATA: Unresolved Decisions" section at end of file
   - **If unresolved decisions found:**
     - Display each decision with its context, exact question, and options
     - Present formatted list to user
     - Ask: "Would you like to address any of these [N] decisions now?"
   - **If no unresolved decisions:**
     - Confirm: "No unresolved decisions found in this summary."

4. **Ready for Work:**
   - Summary is now in context and available for reference
   - Context NOT cleared - existing conversation continues
   - User can optionally run `/clear` to reset if desired

## Rotation Logic

**Why rotate only default path?**
- Default SUMMARY.md is the "working" checkpoint location
- Rotation keeps archive organized and SUMMARY.md ready for next cycle
- Custom paths are user-managed - don't auto-modify them
- Preserves user's explicit file choices

**Rotation behavior:**
```
Before rotation:
  /agents/compact/saves/SUMMARY.md (current checkpoint)

After rotation:
  /agents/compact/saves/archive/SUMMARY_20260207_143022.md (archived)
  /agents/compact/saves/SUMMARY.md (removed, ready for new checkpoint)
```

## Examples

```bash
# Standard continue
/summarize continue
# → Claude reads SUMMARY.md
# → Claude displays summary to user
# → Summary added to current conversation context
# → Ready to reference past work while continuing current conversation

# Show unresolved decisions only
/summarize continue decide
# → Claude reads SUMMARY.md
# → Claude extracts Section 13 (Unresolved Decisions)
# → Displays only the unresolved decisions with context
# → Example output:
#   "Found 2 unresolved decisions:
#    1. Database choice for caching layer
#    2. Embedding update strategy
#    Would you like to address any of these now?"

# Continue from custom checkpoint
/summarize continue from /tmp/checkpoint-before-refactor.md
# → Claude reads /tmp/checkpoint-before-refactor.md
# → Claude displays full summary to user
# → File remains at /tmp/checkpoint-before-refactor.md (preserved)
# → Added to current conversation context

# Continue from archived summary
/summarize continue from /agents/compact/saves/archive/SUMMARY_20260206_103045.md
# → Claude reads archived summary
# → Claude displays summary to user
# → Archive file preserved as-is
# → Historical context available for current work
```

## Workflow Example

```bash
# Session 1: Working on feature
# ... lots of work ...
/summarize
# Checkpoint saved to SUMMARY.md

# Session 1 (continued): Reference past work mid-session
/summarize continue hide
# → Claude loads SUMMARY.md into context (hidden)
# → Context NOT cleared - current conversation continues
# → Past work available for reference
# ... continue current work with historical context ...

# Session 2: New conversation, want to see past summary
/summarize continue
# → Claude loads and displays SUMMARY.md
# → Current context preserved (not cleared)
# → Can reference past decisions while working on new task

# Session 2: Check if there are unresolved decisions
/summarize continue decide
# → Claude extracts unresolved decisions from summary
# → Displays: "Found 2 unresolved decisions: ..."
# → User can choose to address them now

# Session 2: Review complete raw summary
/summarize continue show
# → Claude displays entire raw summary with all formatting
# → Useful for understanding summary structure
# → Can review all sections in detail

# Session 3: Clear context and start fresh (user initiated)
/clear
# → SessionStart hook fires and rotates SUMMARY.md
# → archive/SUMMARY_20260207_143022.md created
# → User can then run /summarize continue to load the archived version
```

## Notes

- **No context clearing** - `/summarize continue` is purely additive, adds summary to current context
- **Always displayed** - Summary displayed to user for reference (except in `decide` mode which shows only unresolved decisions)
- **Use `decide` to surface decisions** - Extracts and displays only unresolved decisions
- **User controls context** - User runs `/clear` separately if they want to reset context
- **Hook-based rotation** - SessionStart hook archives SUMMARY.md when user runs `/clear`
- **Archive preserves history** - All checkpoints kept in archive/ with timestamps
- **Timestamps prevent collisions** - Unique filename per checkpoint (YYYYMMDD_HHMMSS)
- **Mid-session reference** - Can load summaries mid-conversation for context
- **Custom paths preserved** - Files specified with `from {path}` are never auto-modified
- **Flexible workflow** - Load, reference, and continue without forced context resets

## Hook Configuration

The default behavior relies on this hook in `.claude/settings.local.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "clear",
        "hooks": [
          {
            "type": "command",
            "command": "python3 .claude/skills/summarize/references/rotate.py"
          }
        ]
      }
    ]
  }
}
```

This hook runs `rotate.py` whenever a session starts with `/clear`, which prints the summary content (making it available to the new session) and archives the file.
