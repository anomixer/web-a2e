
# Claude Code Enhanced Compaction Prompt

The goal of this summary is to allow the conversation to continue after compaction without losing fidelity in the
recent conversation thread, and to remain congruent with older compactions.

## INPUTS

{discard_web_cache | boolean, default=true} When true, do not include downloads from web searches and fetch.  When
false, preserve it in the summary
{discard_context7_cache | boolean, default=true} When true, do not include downloads from context7 queries.  When
false, preserve it in the summary
{discard_referenced_file_cache | boolean, default = true} When true, do not include the content of previously
loaded files except claude.md and its references and this file (enhanced-compact.md) or any files loaded in the recent
conversation.  In this way, older referenced files don't fill the context and they can be reloaded if needed in the
future
{prune_topics | list of strings, default=[]} When provided, remove all discussions about these topics from the summary.
Note in the summary that these topics were pruned, but do not include the actual discussions.

## Pruning Instructions

**When {prune_topics} is not empty:**

1. **Identify pruning targets**: For each topic in the prune list, identify all conversation segments that discuss or relate to that topic

2. **Remove from summary**: Exclude these discussions from all relevant sections:
   - Do NOT include in Timeline (Section 1)
   - Do NOT include in Topics and Features (Section 3)
   - Do NOT include in Problems Solved (Section 5)
   - Do NOT include in Decisions Made (Section 12)
   - Remove from Evolution, Context Flow, and all other sections

3. **Note pruning**: At the end of the summary, add a brief note:
   ```
   ## Pruned Topics
   The following topics were removed from this summary:
   - {topic 1}
   - {topic 2}
   ```

4. **Preserve references**: If a pruned topic is referenced by something important that wasn't pruned:
   - Keep minimal context: "Earlier discussion about {topic} (pruned) led to..."
   - Don't include the actual pruned discussion details

5. **Clean carryover**: If previous summary included information about pruned topics, do NOT carry it forward

**Important**: Pruning is aggressive - remove all traces of the discussion except the brief note at the end.

## General Rules

- Review everything sequentially in chronological order
- Anything newer might update details from anything previous
- **CRITICAL: Preserve conversation flow and temporal sequencing** - the order in which things happened matters
- When merging previous summaries with new content, maintain chronological order across all sessions
- Sequence-dependent decisions, changes, and evolution must be traceable through time

When compacting this conversation, preserve the following critical information:

## 0. Previous Summary Carryover & Chronological Preservation
**CRITICAL**: If a previous compaction summary exists in this conversation, carry forward AND preserve chronological order:

### What to Carry Forward:
- **All file paths** mentioned in the previous summary (merge with new ones) including
  - [PROJECT_ROOT]/agents/CLAUDE.md
  - [PROJECT_ROOT]/AGENTS.md if exists
- **Completed fixes/solutions** from the previous summary (as historical context)
- **Incomplete TODOs** from the previous summary (update their status if changed)
- **Core topic themes** that span across multiple compaction cycles
- **Architectural decisions** that remain relevant
- **Established patterns and conventions** that should persist
- **MCP Server and Tool Functions/Descriptions** should carry over
- **Chronological timeline** from previous summary (append new events in order)
- **Decisions made** from previous summary (maintain temporal sequence)
- **Unresolved decisions** from previous summary (update status based on new conversation)
- **Double-Check** everything for completeness and accuracy

### How to Preserve Chronological Order:
- **Maintain temporal sequence** when merging old and new information
- **Timeline entries** from previous summaries should precede new entries
- **Decisions** should be ordered by when they were made (oldest to newest)
- **File modifications** should show progression over time
- **Evolution of ideas** should be traceable from first mention to current state
- If something from an old summary was revisited/changed, note both the original (with timestamp/session) and the update

**Example**:
```
SESSION 1 (from previous summary): Decided to use PostgreSQL
SESSION 2 (current): Switched to SQLite for simpler deployment
```

Mark carried-forward items with [CARRIED] to distinguish from new information, but maintain chronological narrative flow.

## 1. Chronological Timeline & Conversation Flow
**CRITICAL**: Preserve the temporal sequence of events, decisions, and changes across all sessions.

### Purpose
Maintain a clear timeline that shows:
- When things happened (session/compaction number if available)
- The order in which decisions were made
- How ideas evolved over time
- Dependencies between events (what led to what)
- Sequence-critical changes (migrations, refactors that depend on previous work)

### Structure
Create a chronological log that spans all sessions:

```
TIMELINE:

[SESSION 1 / Previous Summary]
- T1: Initial project setup, created basic structure
- T2: Decided to use PostgreSQL for database
- T3: Implemented user authentication with JWT
- T4: Discovered performance issue with large file uploads

[SESSION 2 / Current]
- T5: Investigated file upload performance issue
- T6: Decided to switch to streaming uploads
- T7: Implemented streaming upload solution
- T8: Discovered need for vector search capability
- T9: Started research on vector databases
```

### Guidelines
- **Append, don't replace**: New events extend the timeline, they don't replace old ones
- **Note updates**: If something changes, show both original and update with temporal markers
- **Preserve causality**: Show what led to what (decision X led to problem Y led to solution Z)
- **Session markers**: Use session/compaction numbers to segment timeline
- **Relative timing**: Within a session, maintain sequence even if exact timestamps unknown
- **Cross-reference**: Link timeline entries to detailed sections (e.g., "T8: See Section 11 for decision details")

### Integration with Other Sections
- **Decisions Made** (Section 12): Reference timeline entries (e.g., "T6 - decided streaming uploads")
- **Problems Solved** (Section 5): Show temporal relationship (e.g., "T5: discovered issue" → "T7: implemented fix")
- **File Modifications** (Section 2): Timeline of file changes across sessions
- **Evolution** (in summary format): Narrative flow following timeline order

## 2. File Paths and Structure
- **Modified Files**: List all files that have been created, modified, or deleted with their full paths (maintain chronological order across sessions)
- **Key Directories**: Note important directory structures and their purposes
- **File Dependencies**: Track which files depend on or import from others
- **Configuration Files**: Preserve locations and key settings from config files
- **File Evolution**: Show how files changed over time (e.g., "auth.js: [SESSION 1] created → [SESSION 2] refactored")

## 3. Topics and Features Discussed
- **Main Features**: List all features/components discussed or implemented (in order discussed)
- **Technical Decisions**: Architecture choices, design patterns, libraries selected (maintain temporal order)
- **Business Logic**: Core business rules and requirements that shaped the implementation
- **Edge Cases**: Special scenarios or constraints we've identified

## 4. Requirements and Specifications
- **Original Requirements**: The initial goals and acceptance criteria
- **Evolved Requirements**: Any requirements that changed during development (show evolution chronologically)
- **Constraints**: Technical, business, or design constraints we're working within
- **Performance Targets**: Any specific performance or scalability requirements

## 5. Problems Solved and Solutions
- **Issues Encountered**: List each problem with a brief description (in order encountered across sessions)
- **Solutions Applied**: The specific fix or approach used for each problem
- **Workarounds**: Any temporary solutions or technical debt incurred
- **Debugging Steps**: Key debugging insights that might be needed again
- **Temporal Dependencies**: Note if solution A was required before tackling problem B

## 6. Pending and In-Progress Work
- **TODO Items**:
  - New TODOs from this session
  - [CARRIED] Uncompleted TODOs from previous summary (maintain order added)
  - Mark completed previous TODOs as [COMPLETED] for reference
- **In-Flight Changes**: Work that was started but not finished
- **Deferred Decisions**: Choices we explicitly postponed (note when deferred)
- **Next Steps**: The immediate next actions discussed

## 7. Recent Context Flow
- **Current Focus**: What we were working on most recently
- **Last Commands**: The last few commands or operations performed (in order)
- **Active Debugging**: Any ongoing debugging or investigation
- **User Preferences**: Specific coding styles or preferences expressed
- **Conversation Momentum**: What direction the conversation was heading

## 8. Interrupted Work Context (CRITICAL)
**If this compaction interrupted ongoing work, preserve ALL details:**
- **What Was Happening**: Exact task/operation that was in progress
- **Current Step**: Which step of a multi-step process we were on
- **Commands Running**: Any commands that were about to be executed
- **Partial Changes**: Files partially modified but not completed
- **Context Needed**: Specific details, values, or decisions made just before compaction
- **Exact Next Action**: The precise next step that should be taken
- **Error Context**: If debugging, the exact error message and what we've tried
- **User's Last Request**: The exact wording of the most recent user request

**Example Format**:
```
INTERRUPTED: Implementing user authentication
STEP: 3 of 5 - Was adding JWT token validation to /api/auth/verify
NEXT: Run 'npm test auth.test.js' then fix the refresh token logic in auth.service.js line 47
CONTEXT: User wanted 15-minute access tokens, 7-day refresh tokens, using RS256
```

## 9. Code Patterns and Conventions
- **Naming Conventions**: Variable, function, and file naming patterns used
- **Code Style**: Formatting preferences, comment styles
- **Error Handling**: Established error handling patterns
- **Testing Approach**: Test file locations and testing strategies

## 10. External Dependencies and APIs
- **Packages/Libraries**: All external dependencies added or discussed (note when added/changed across sessions)
- **API Endpoints**: External APIs integrated or planned
- **Environment Variables**: Required env vars and their purposes
- **Database Schema**: Current schema state and migrations (track evolution)

## 11. Tools and MCP Configurations
**Preserve all custom tool configurations and MCP server details:**
- **MCP Servers**: Active MCP servers and their configurations
  - Server names and connection details
  - Available tools/functions from each server
  - Authentication or environment requirements
- **Custom Tools**: Any custom tool functions defined
  - Tool names and their purposes
  - Required parameters and formats
  - Example usage that worked
- **Tool Patterns**: Successful patterns for using tools
  - Common tool combinations
  - Specific parameters that work well
  - Any tool limitations discovered

**Example Format**:
```
MCP SERVER: github-mcp
TOOLS: create_issue, search_issues, create_pr
CONFIG: Uses GITHUB_TOKEN env var
USAGE: create_issue(repo="user/repo", title="...", body="...")
```

## 12. Decisions Made
**Track all decisions with their full context IN CHRONOLOGICAL ORDER:**
- **What Was Asked**: The question, choice, or decision point that arose
- **What Was Decided**: The choice that was made
- **Why**: The rationale behind the decision (trade-offs, constraints, preferences)
- **Outcome**: What happened as a result (if the decision has been implemented)
- **Status**: Whether the decision is final, provisional, or under review
- **When**: Session/timeline marker (e.g., T6, SESSION 2)

**IMPORTANT**: Maintain chronological order across sessions. [CARRIED] decisions from previous summaries should appear before new decisions, preserving temporal sequence.

**Example Format**:
```
[SESSION 1 - CARRIED]
DECISION T2: Database choice for vector search
ASKED: Should we use a dedicated vector DB (Pinecone) or PostgreSQL with pgvector?
DECIDED: PostgreSQL with pgvector extension
WHY: Already using Postgres, simpler architecture, good enough for current scale
OUTCOME: Schema designed, migration script pending
STATUS: Final - implementation in progress

[SESSION 2 - CURRENT]
DECISION T7: Embedding model selection
ASKED: OpenAI ada-002 vs open source embeddings?
DECIDED: Start with OpenAI ada-002
WHY: Quality first, can optimize costs later if needed
OUTCOME: Integrated, generating embeddings
STATUS: Final
```

## 13. Unresolved Decisions
**Track decisions that were discussed but never resolved:**

For each unresolved decision:
- **Context Summary**: Brief summary of what led to this decision point (just enough to understand)
- **Exact Question**: The exact text of what was asked (preserve verbatim - this is critical)
- **Options Discussed**: List of approaches/options that were presented
- **Current Status**: Note if future conversation has weakened or strengthened the need for this decision
- **Why Still Open**: What prevented the decision from being made (user didn't respond, moved on, needed more info, etc.)

**Example Format**:
```
UNRESOLVED: Embedding update strategy
CONTEXT: Discussed how to handle document edits - whether to regenerate all embeddings or be more selective
EXACT QUESTION:
> "How frequently do documents get edited, and are edits typically small tweaks or major rewrites?
> Should we use incremental updates (track chunks), full regeneration (simpler), or versioned embeddings?"
OPTIONS:
- Incremental: More efficient, requires chunk mapping
- Full regeneration: Simpler, wastes API calls on minor edits
- Versioned: Most flexible, adds complexity
STATUS: Need weakened - later discussion showed documents rarely edited after initial publish
WHY OPEN: User never responded, conversation moved to hybrid search implementation
```

**Important**: Only include decisions that are genuinely still relevant. If later conversation resolved, superseded, or made a decision irrelevant, note that in the status and consider removing it from future summaries.

## 14. Communication Context
- **Clarifications**: Important clarifications or corrections made
- **Assumptions**: Explicit assumptions we're working under
- **Rejected Approaches**: What we tried that didn't work and why (maintain chronological order)

## 15. Project State Summary
Provide a concise paragraph summarizing:
- Where the project currently stands
- What's working and what isn't
- The immediate priority
- Any blockers or dependencies
- **Trajectory**: How the project has evolved from start to current state

## 16. Compaction History
- **Compaction Count**: This is compaction #[NUMBER] in this project
- **Previous Focus Areas**: List main themes from previous compactions (in chronological order)
- **Evolution**: Brief note on how the project focus has evolved over time
- **Persistent Challenges**: Any issues that have appeared across multiple compactions
- **Timeline Continuity**: Confirm that chronological flow is maintained from first session to current


---

**IMPORTANT**: When compacting, maintain the chronological flow of decisions and changes. Preserve specific command examples, code snippets that represent established patterns, and any custom configurations or scripts we've created. Keep track of the iteration count on any files we've modified multiple times.

**CHRONOLOGICAL PRESERVATION RULE**: Maintain strict chronological order when carrying forward information from previous summaries. The timeline (Section 1) should flow from earliest to latest events across ALL sessions. Decisions, file changes, and problems should preserve their temporal sequence. This allows understanding causality: what led to what, what depended on what.

**CARRYOVER RULE**: Always check for previous compaction summaries and integrate relevant information. Items from
previous summaries should be marked with [CARRIED], [COMPLETED], or [UPDATED] tags to show their status evolution.
If a requirement or decision changed after the [CARRIED] version of it, then revise it in this new summary to keep
it current. **CRITICAL**: When merging old and new content, preserve chronological order - old events come before new events.

**INTERRUPTION RULE**: If compaction happens mid-task, Section 8 (Interrupted Work Context) becomes the HIGHEST PRIORITY. Include enough detail that work can resume exactly where it left off without any loss of context or momentum.

**TOOL PRESERVATION RULE**: Always preserve MCP server configurations and custom tool descriptions from Section 11. These are critical for maintaining functionality and should be carried forward in every compaction with their working parameters and successful usage patterns.

**PRUNING RULE**: Before starting summarization, check if `/agents/compact/saves/.prune_log` exists. If it does:
1. Read the file to get list of topics to prune
2. Apply {prune_topics} parameter with these topics
3. Follow Pruning Instructions above to remove all discussions about these topics
4. Add "Pruned Topics" section at end of summary noting what was removed
5. After successful summary creation, clear or archive the `.prune_log` file

---

## Summary Format

<summary>
  <analysis>
    Your thorough thoughts, reasonings, notes, and updates.
  </analysis>
  <evolution>
    - how the conversation evolved from start to current (including from carryovers)
    - keen detail to important aspects that were potentially obsoleted by something improved, or disregarded
    - with every attempt to prevent overfitting or bias towards things that have been de-emphasized as the 
conversation evolved
    - where there might be ambiguity, for example, if a conversation happened around multiple databases, or APIs, 
etc and it wasn't obvious of conversation referred to one or the other, the make a note of which options it 
potentially could be and that you were unable to definitively determine, and if it is later reference that you might 
ask for clarification so as to not make assumptions
  </evolution>
  <cache>
    - When {discard_web_cache} = false, preserve it here
    - When {discard_context7_cache} = false, preserve it here
    - When {discard_referenced_file_cache} = false, preserve it here.  And when its true, preserve the ones specified here.
  </cache>
  <notes>
    0. **CHRONOLOGICAL TIMELINE** (Section 1): Complete timeline from first session to current, maintaining temporal order
    1. Sequential summaries of each topics, concepts, ideas, intents (in order discussed)
    2. List of MCP and function tool call descriptions
    3. List of requirements (showing evolution over time)
    4. List of files referenced (with chronological changes tracked)
    5. Fixes to problems and troubleshooting results (in order encountered)
    6. Todos incomplete and complete, and pending (maintaining order added)
      - including any changes you had to make to successfully execute a tool call
    7. Full context around current step and next steps
    8. Any current examples or planning details/examples carried over, and current, and any updates to the ones carried
over
    9. Decisions made: what was asked, decided, why, and outcome (Section 12) - IN CHRONOLOGICAL ORDER
    10. Unresolved decisions: with summarized context and exact questions asked (Section 13)
  </notes>
</summary>

## Closing

Indicate that the compact used this prompt and indicate the names of the files whose cache was preserved.

## Post-Summary: Unresolved Decisions Handling

**IMPORTANT**: At the very end of the raw summary document (after the `</summary>` tag), add a metadata section:

```markdown
---

## METADATA: Unresolved Decisions

[If there are unresolved decisions from Section 12, list them briefly here]

Count: [NUMBER] unresolved decision(s)

Decisions:
1. [Brief title of decision 1]
2. [Brief title of decision 2]
...

---
```

**After writing the summary**, when presenting the summary completion to the user:

1. **Check if there are unresolved decisions** (from Section 12)

2. **If YES - unresolved decisions exist:**
   - Inform the user: "Summary complete. I found [N] unresolved decision(s) from this session."
   - Ask: "Would you like to review and address these decisions now?"
   - Present options:
     - Continue with current conversation
     - Review decisions (same as `/summarize continue decide`)
     - Address specific decisions

3. **If NO - no unresolved decisions:**
   - Simply confirm: "Summary complete. No unresolved decisions to address."

**Note**: This allows the summary to be used later with `/summarize continue decide` to surface unresolved decisions, or `/summarize continue show` to display the full raw summary.
