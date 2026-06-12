---
name: capture
description: Extract and preserve high-fidelity snapshots of specific ideas or topics from conversations, maintaining enough detail and nuance to enable resuming work later. Use when the user wants to capture an idea, discussion, or topic thread from the current conversation with the command "/capture {idea} to {path}". The skill auto-detects where the idea started, traces its evolution through decisions and rejections, preserves code/examples exactly, and excludes unrelated content while maintaining resumability.
---

# Capture

## Overview

Capture high-fidelity snapshots of specific ideas, topics, or discussion threads from the conversation. The captured output preserves enough detail and nuance to enable resuming work on that idea later, potentially in a new conversation context.

## Usage

```
/capture {idea} to {path}
```

**Parameters:**
- `{idea}`: Description of the idea/topic to capture (e.g., "vector database integration", "the authentication refactor discussion", "performance optimization approach")
- `{path}`: File path where the captured idea should be written

**Examples:**
```
/capture vector database integration to ./ideas/vector-db.md
/capture the authentication refactor discussion to ~/captures/auth-refactor-2026-02-08.md
/capture performance optimization approach to ./notes/perf-ideas.md
```

## What Gets Captured

The skill automatically:

1. **Auto-detects idea boundaries** - Identifies where the idea first emerged in the conversation
2. **Traces chronological evolution** - Captures how the idea developed from initial concept to current state
3. **Preserves decisions and rejections** - Documents what was chosen, what was rejected, and why
4. **Captures Q&A exchanges** - Includes relevant questions asked and answers provided
5. **Exactly preserves artifacts** - Code snippets, examples, commands, and outputs are preserved verbatim
6. **Summarizes rabbit holes** - Tangents that didn't yield results are noted briefly
7. **Excludes unrelated content** - Filters out discussion threads not relevant to the specified idea
8. **Extracts atomic related ideas** - Identifies and notes tangentially related concepts

## Capture Types

This skill supports different capture strategies for different scenarios:

### Idea Capture (Default)

**See: [references/idea.md](references/idea.md)** for detailed instructions on capturing ideas with full fidelity.

Use for:
- Feature ideas and architectural decisions
- Technical explorations and solution approaches
- Design discussions and trade-off analyses
- Problem-solving threads
- Research findings and insights

Output format: Hybrid structured/narrative markdown with sections for Genesis, Evolution, Current State, and Artifacts.

### Additional Capture Types (Future)

As additional capture patterns emerge, new reference files will be added:
- `references/decision.md` - Formal decision records with ADR-style structure
- `references/investigation.md` - Bug investigations and debugging sessions
- `references/meeting.md` - Discussion summaries and action items
- etc.

## Key Principles

**High fidelity**: Preserve enough detail to resume without loss of context or nuance.

**Exact artifacts**: Never summarize code, commands, examples, errors, or technical outputs.

**Chronological flow**: Capture the idea's journey from initial trigger through current state.

**Resumability**: Someone should be able to pick up this idea later and continue without the original conversation.

**Focused extraction**: Include only content relevant to the specified idea, excluding unrelated threads.

**Balanced detail**: Preserve nuances that informed decisions while avoiding excessive verbosity where summarization doesn't lose meaning.

## Workflow

When the user invokes `/capture {idea} to {path}`:

1. **Read the detailed capture guide**: Load `references/idea.md` (or other relevant capture type reference)
2. **Analyze the conversation**: Search backward to identify where the specified idea first emerged
3. **Extract relevant content**: Trace the idea's evolution, filtering out unrelated discussion
4. **Structure the output**: Organize using the hybrid format specified in the guide
5. **Preserve artifacts**: Ensure all code, examples, and outputs are exactly preserved
6. **Write to file**: Save the captured idea to the specified path

## Notes

- The skill emphasizes **resumability** - captured ideas should contain enough context to continue work in a new conversation
- **Balance** is critical: preserve nuances without excessive verbosity
- When in doubt about whether to include detail, **err on the side of more rather than less**
- **Rabbit holes** can be summarized if they didn't yield useful results
- **Related atomic ideas** are extracted separately rather than bloating the main narrative
