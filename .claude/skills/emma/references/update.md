# update - Update Documentation

Updates documentation after tool changes, or updates project/emma docs.

## Important Safeguards

**DO NOT update CLAUDE.md** unless the user explicitly requests it by name. CLAUDE.md is the main project documentation and should only be updated when specifically asked.

**Project structure updates** should go to `.claude/skills/emma/docs/project-structure.md`, which mirrors the project structure for EMMA's reference.

## What to Update

Detect from user request:

**After Tool Changes** (when user says "update docs for new tool", "tool was added/changed"):

When a new app tool is added, consider updating these 4 types of docs:
1. `llms.txt` - Feature index (only if new feature category)
2. `public/docs/llms/*.txt` - LLM tool specifications (always)
3. `wiki/AI Agent.md` - Wiki documentation (if documented)
4. `src/js/help/documentation-window.js` - In-app help (if user-facing)

**Project Docs** (ONLY when explicitly requested by name):
- `CLAUDE.md` - Project overview, architecture, commands (⚠️ UPDATE ONLY IF EXPLICITLY REQUESTED)
- `README.md` - User-facing project description
- `src/js/help/release-notes.js` - Release history in UI
- `src/js/config/release-notes.json` - Structured release data

**Emma Docs** (when user says "bindings", "app-tools", "agent-tools", "project structure"):
- `docs/bindings.md` - WASM interface reference
- `docs/app-tools.md` - App tool registry
- `docs/agent-tools.md` - Agent tool registry
- `docs/project-structure.md` - Complete project structure (scanned from file system)

## Process: After Tool Added/Changed

### 1. Identify What Changed

Determine the nature of the change:
- **New tool added**: Document the new tool
- **Tool renamed**: Update all references to old name
- **Tool behavior changed**: Update descriptions
- **UI changed**: Update button names, descriptions

### 2. Update LLM Documentation

**File**: `public/docs/llms/llm-{feature}.txt`

Add or update tool specification in the **Tool Operations** section:

```markdown
**Operation description:**
```
emma_command({ command: "toolName", params: { param: "value" } })
```
Brief 1-2 sentence description. Mention prerequisites if any.
```

**Guidelines**:
- Keep descriptions concise (1-2 sentences max)
- Document what LLM needs to know to use it
- Avoid implementation details
- Conserve tokens

### 3. Update Feature Buttons Section (If UI-Related)

At bottom of `llm-{feature}.txt`, update action buttons list:

```markdown
**Button Name**: Brief description of what it does
```

### 4. Update Index (If New Feature Category)

**File**: `public/llms.txt`

**Only update if**:
- Adding NEW feature category
- Adding NEW window with detail file

**Do NOT** list individual tools here - only feature categories.

```markdown
### Category
- [feature-name](/docs/llms/llm-feature-name.txt) Brief routing description
```

**Description purpose**: Help LLM route to right detail file ("if user asks about X, look here")

### 5. Update Documentation Window (If User-Facing)

**File**: `src/js/help/documentation-window.js`

**Update when**:
- New major feature (window, significant capability)
- User-facing functionality
- Features that need explanation

**Skip when**:
- Internal debugging tools
- Minor utility functions
- Tools only used by LLM agents

**Add nav button** (if new major feature):
```javascript
<button data-section="feature-name">
  <svg>...</svg>
  Feature Name
</button>
```

**Add content section** in `renderSections()`:
```javascript
<section id="doc-feature-name" class="documentation-section">
  <h3>Feature Name</h3>
  <p>Brief description...</p>

  <h4>Operations</h4>
  <ul>
    <li><strong>Tool name:</strong> Description</li>
  </ul>
</section>
```

### 6. Update Wiki (If Documented)

**File**: `wiki/{Feature}.md`

Update existing wiki page:
```markdown
### Tool Category

**Tool name:**
\`\`\`
Example prompt or usage
\`\`\`
Brief description.
```

**Create new wiki page** (if major feature):
- Follow format of existing pages
- Add to `wiki/Home.md` table of contents

### 7. Do Not Test

**Important**: Do not automatically test changes. Let user test manually.

- Do NOT call the updated tool
- Do NOT run verification commands
- Do NOT execute test sequences

Document and wait for user direction.

## Process: Project Docs

### 1. Parse Instructions

- Which document(s) to update
- What changes to make
- Scope (section vs full rewrite)

### 2. Read Current Content

Only for affected documents.

### 3. Make Changes

- Preserve structure unless told otherwise
- Maintain markdown formatting
- Keep cross-references consistent

### 4. Verify Consistency

- Version numbers match across docs
- Cross-references valid
- No broken links

## Process: Emma Docs

### 1. Identify Topic

bindings, app-tools, agent-tools, architecture, commands

### 2. Generate/Update in `docs/`

- **bindings.md**: Scan `CMakeLists.txt`, `src/bindings/wasm_interface.cpp`
- **app-tools.md**: Scan `src/js/agent/` for registered tools
- **agent-tools.md**: Scan `appleii-agent/src/tools/` for MCP tools
- **architecture.md**: Extract from CLAUDE.md + code analysis
- **commands.md**: Extract from package.json scripts + CLAUDE.md
- **project-structure.md**: Scan entire web-a2e + appleii-agent file trees (see below)

### 3. Structure with Progressive Disclosure

- High-level overview first
- Links to source files
- Examples only when needed

### 4. Validate Against Source

- Cross-check function names
- Verify registrations
- Update stale info

### 5. Update Project Structure (Special Case)

When user says "update project structure" or "update the project structure":

**Goal**: Regenerate `docs/project-structure.md` to match current file system state of the **emulator project** (web-a2e + appleii-agent).

**Focus**: The main emulator codebase, NOT the EMMA skill. EMMA skill is included as a minor detail.

**Process**:

1. **Scan web-a2e** (current repo):
   - Use `find` or `ls -R` to get directory tree
   - Focus on **emulator directories**: `src/core/`, `src/js/`, `public/`, `tests/`, `roms/`
   - Include `.claude/skills/emma/` as a minor detail (just show it exists with current files)
   - Note key files: `.mcp.json`, `package.json`, `CMakeLists.txt`, `vite.config.js`
   - **Priority order**: src/core → src/js → public → tests → .claude (minor)

2. **Scan appleii-agent** (if available at `../appleii-agent`):
   - Check if directory exists: `ls ../appleii-agent`
   - If exists, scan `src/` and `tools/` directories
   - If not exists, use existing documentation as reference

3. **Generate structure**:
   - Update directory trees to match current state
   - Add comments for key directories/files
   - Preserve existing documentation about purpose and relationships
   - Keep "How the Projects Connect" and other explanatory sections

4. **Update, don't replace**:
   - Keep the narrative sections (Repository Layout, Communication Flow, etc.)
   - Only update the directory tree portions
   - Preserve file descriptions and notes

**Example scan commands**:
```bash
# Scan web-a2e EMMA skill
find .claude/skills/emma -type f -name "*.md" | sort

# Scan agent tools (if available)
find ../appleii-agent/src/tools -type f -name "*.js" 2>/dev/null | sort

# Get directory structure
tree -L 3 -I 'node_modules|dist|build-native' .
```

## Progressive Loading

Only read what's needed:
- Tool docs: Read only affected LLM docs, help window, wiki
- Project docs: Read only affected files
- Emma docs: Scan source only for requested topic

Reference `.claude/agents/update-tool.md` for detailed examples.

## Common Update Patterns

**Tool added/changed**:
- Always update LLM docs (`public/docs/llms/llm-*.txt`)
- Update help window if user-facing
- Update wiki if documented
- Rarely update index (`public/llms.txt`)

**Project docs**:
- Add feature → Update CLAUDE.md architecture, README.md
- Change command → Update CLAUDE.md commands, README.md
- New release → Update both release-notes files

**Emma docs**:
- New binding → Append to bindings.md
- New tool → Add to app-tools.md or agent-tools.md
- Architecture change → Update architecture.md

Only regenerate sections that changed unless full refresh requested.
