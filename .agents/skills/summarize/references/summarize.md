# Summarize - Create Checkpoint

Generate a comprehensive summary of the current session and save it for later continuation.

## Command Patterns

### Default
```
/summarize
```
- Load instructions from `.claude/skills/summarize/references/enhanced.md`
- Save raw summary to `/.claude/summary/SUMMARY.md`

### Custom Output Path
```
/summarize to {path}
```
- Load default instructions (enhanced.md)
- Save raw summary to `{path}`

### Custom Instructions
```
/summarize using {path_to_instructions}
```
- Load instructions from `{path_to_instructions}`
- Save raw summary to `/.claude/summary/SUMMARY.md`

### Custom Instructions and Output
```
/summarize using {path_to_instructions} to {path}
```
- Load instructions from `{path_to_instructions}`
- Save raw summary to `{path}`

### With Extra References
```
/summarize with extra {name}
```
- Load default instructions (enhanced.md)
- Load extra reference file from `.claude/skills/summarize/references/extra-{name}.md`
- Include extra file contents in summary under "Extra References" section
- Save raw summary to `/.claude/summary/SUMMARY.md`
- Can be combined with other options: `to {path}`, `using {instructions}`

## Implementation Steps

1. **Parse Arguments:**
   - Check for `to {path}` pattern → extract output path
   - Check for `using {path}` pattern → extract instructions path
   - Check for `with extra {name}` pattern → extract extra reference name
   - Defaults:
     - Instructions: `.claude/skills/summarize/references/enhanced.md`
     - Output: `/.claude/summary/SUMMARY.md`
     - Extra: none

2. **Load Extra References (if specified):**
   - If `with extra {name}` was provided:
     - Read `.claude/skills/summarize/references/extra-{name}.md`
     - Store raw contents to include in summary

3. **Load Instructions:**
   - Read the instructions file (enhanced.md or custom)
   - These define the summary format, sections, and requirements

4. **Generate Summary:**
   - Follow the loaded instructions to create comprehensive summary
   - Include all context specified in instructions:
     - File paths and structure
     - Topics and features discussed
     - Requirements and specifications
     - Problems solved and solutions
     - Pending work and TODOs
     - Recent context flow
     - Code patterns and conventions
     - External dependencies
     - MCP configurations
     - Communication context
     - Project state summary
   - If extra reference content was loaded, append it at the end:
     ```markdown
     ## Extra References: {name}

     {raw contents of extra-{name}.md}
     ```

6. **Save Summary:**
   - Ensure output directory exists (create if needed)
   - Write the raw summary to specified path
   - Summary should be complete markdown following instructions format

7. **Confirm to User:**
   - "Checkpoint saved to `{path}`. Run `/summarize continue` to refresh session."

## Examples

```bash
# Standard checkpoint
/summarize
# → Loads enhanced.md
# → Saves to /.claude/summary/SUMMARY.md

# Save to custom location
/summarize to /tmp/checkpoint-before-refactor.md
# → Loads enhanced.md
# → Saves to /tmp/checkpoint-before-refactor.md

# Use custom format
/summarize using /path/to/minimal-format.md
# → Loads /path/to/minimal-format.md
# → Saves to /.claude/summary/SUMMARY.md

# Both custom
/summarize using /path/to/format.md to /tmp/output.md
# → Loads /path/to/format.md
# → Saves to /tmp/output.md

# With extra references
/summarize with extra emma
# → Loads enhanced.md
# → Loads extra-emma.md (contains instructions to load project docs)
# → Includes extra content in summary
# → Saves to /.claude/summary/SUMMARY.md
```

## Notes

- Instructions file defines what to include in summary and format
- Default `enhanced.md` provides comprehensive compaction template
- Output path can be absolute or relative to project root
- Directory creation is automatic if path doesn't exist
- Summary is "raw" output - exactly what instructions produce
