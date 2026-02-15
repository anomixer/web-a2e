# create-pr - Generate GitHub PR Description

Generates concise GitHub pull request descriptions from recent commit history.

## Usage

```
/emma make a github PR for these features
/emma create a PR description
/emma generate PR for recent changes
```

## Process

### 1. Determine Scope

**Goal**: Understand what features/commits to include in the PR.

**Check for clarity**:
- If user specifies commit range (e.g., "commits A..B") → use that range
- If user says "recent changes" or "these features" → check unpushed commits
- If unpushed commits exist and are recent (< 1 week) → assume those
- If unclear or no unpushed commits → **prompt for clarification**

**Prompt when unclear**:
```
What should I generate the PR for?
- Unpushed commits on current branch
- Specific commit range (provide range)
- Last N commits (specify N)
```

**Continue without prompting when**:
- User specified exact commit range
- Clear unpushed commits exist (≤ 10 commits, < 1 week old)
- User provided specific context in the request

### 2. Inspect Commit History

**Goal**: Find commits that contain the features to document.

**Steps**:
1. Run `git log origin/master..HEAD --oneline` to see unpushed commits (or use specified range)
2. Run `git log origin/master..HEAD` for full commit messages
3. Proceed to analysis

**Alternative**: If user specified commit range, use that instead of origin/master..HEAD.

### 3. Analyze Changes

For each commit in the range:

**Read commit details**:
```bash
git show <commit-hash> --stat
```

**Categorize changes** into:
- **New features**: New functionality, windows, tools, capabilities
- **Changes to existing**: Modified behavior, refactored code, updated UI
- **Deployment changes**: Build process, dependencies, configuration
- **Breaking changes**: API changes, removed features, incompatibilities

**Extract file patterns**:
- New files → new features
- Modified core files → changes to existing
- package.json, CMakeLists.txt, deploy scripts → deployment changes
- Removed exports, renamed functions → breaking changes

### 4. Generate PR Description

**Format**:
```markdown
[Brief overview paragraph - no more than one paragraph describing what's being improved/added/fixed. Use direct language like "Improves...", "Adds...", "Fixes..." - NOT "This PR..."]

## Features

- Brief feature description (user-facing language)
- Another feature (focus on what, not how)

## Changes to Existing

- Updated [component] to [what changed]
- Refactored [area] for [benefit]

## Deployment Changes

- Updated [dependency] to version X
- Added new build step: [description]

## Breaking Changes

- [API/behavior] changed from X to Y
- [Feature] removed - use [alternative] instead

## Testing

To test these features:
1. [Quick step 1]
2. [Quick step 2]
3. [Expected result]

Or try: [concise example usage]
```

**Guidelines**:
- **Overview first**: Start with a brief overview paragraph (1 paragraph max)
- **Direct language**: Use "Improves...", "Adds...", "Fixes..." - NOT "This PR..."
- **Concise**: 1-2 lines per item maximum
- **User-facing**: Describe what users see, not implementation
- **Omit sections**: If no items in a category, omit the entire section
- **Focus on value**: Why does this matter, not how it works
- **Simple language**: Avoid technical jargon unless necessary

### 5. Omit Implementation Details

**DO NOT include**:
- Specific function names or file paths
- Implementation approaches or algorithms
- Code snippets or technical explanations
- Internal architecture decisions

**DO include**:
- What the feature does for users
- How behavior changes
- What users need to know or do differently

### 6. Keep Testing Instructions Minimal

**Good**:
```
## Testing

Open the BASIC Program window and click "Run". The heat map now shows statement execution counts.
```

**Bad**:
```
## Testing

1. Navigate to src/js/debug/basic-program-window.js
2. Verify the heat map rendering function is called
3. Check that getBasicHeatMapData() returns correct values
4. Inspect the DOM for heat-map-* classes
...
```

### 7. Output

Present the generated PR description to the user:

```
Here's the PR description based on commits X..Y:

[Overview paragraph]

[Generated sections]

Would you like me to:
- Adjust any section?
- Add/remove items?
- Create the PR with `gh`?
```

**Remember**: Always start with an overview paragraph using direct language (e.g., "Improves...", "Adds...", "Fixes...").

**Do NOT**:
- Automatically create the PR
- Push to remote
- Open browser

Wait for user confirmation.

## Example Output

```markdown
Adds comprehensive BASIC debugging capabilities including heat maps, statement-level breakpoints, and real-time variable inspection. The BASIC Program window has been redesigned with a unified debugger interface for better usability and performance.

## Features

- Added BASIC program heat map showing line execution counts
- New statement-level breakpoints for debugging BASIC code
- Real-time variable inspector in BASIC Program window

## Changes to Existing

- BASIC Program window now uses unified debugger interface
- Improved memory efficiency for large BASIC programs

## Testing

Open any BASIC program and click Run. Enable heat map to see which lines execute most. Set breakpoints by clicking line numbers.
```

## Edge Cases

**Too many commits** (>10):
```
Found 23 commits. Should I:
1. Summarize all 23 commits
2. Focus on specific range (provide range)
3. Group by feature (I'll detect related commits)
```

**Unclear commit messages**:
- Read the actual file changes with `git diff`
- Infer feature from changed files
- Ask user for clarification if needed

## Detection Patterns

Detect "create PR" intent from:
- Keywords: PR, pull request, github, description
- Action verbs: create, make, generate, write
- Context: "for these features", "recent changes", "unpushed commits"

**Examples**:
- "make a github PR for these features" ✓
- "create a PR description" ✓
- "generate PR for recent changes" ✓
- "write a pull request" ✓
- "PR description for commits A..B" ✓
