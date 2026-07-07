# query - Search Documentation

Answers questions about the project using progressive disclosure.

## Process

1. **Parse question** to identify topic:
   - WASM bindings → `docs/bindings.md`
   - App tools → `docs/app-tools.md` or `src/js/agent/`
   - Agent tools → `docs/agent-tools.md` or `appleii-agent/src/tools/`
   - Architecture → `CLAUDE.md`, `docs/architecture.md`
   - Build/commands → `CLAUDE.md`
   - Agent connection → `.claude/agents/connections.md`
   - Release info → release notes

2. **Load progressively**:
   - Start with emma docs if they exist
   - Escalate to CLAUDE.md for architecture
   - Read source code only if needed
   - Search multiple locations if first attempt insufficient

3. **Build answer** from sources:
   - Cite specific files/locations
   - Include code examples if relevant
   - Suggest related topics if applicable

4. **Confidence levels**:
   - **High**: Found in docs with clear answer
   - **Medium**: Found in code, needs interpretation
   - **Low**: Unclear, offer to search more or ask user to clarify

## Topic Detection

Common question patterns:
- "How do I..." → Look for process/tutorial
- "Where is..." → Look for file/location
- "What does..." → Look for explanation
- "Can I..." → Look for capabilities
- "Why..." → Look for design decisions

## Progressive Search Strategy

1. Check `docs/` directory for topic-specific doc
2. Check CLAUDE.md for architecture/overview
3. Search source code with Grep
4. Read specific files if patterns found
5. Escalate to broader search if needed

## Answer Format

```
[Answer based on sources]

Sources:
- path/to/file.md - Brief relevance
- path/to/code.js:123 - Brief relevance
```

If uncertain, say so and offer to:
- Search additional locations
- Read more source files
- Ask user to clarify question
