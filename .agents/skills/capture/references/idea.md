# Idea Capture Guide

## Purpose

Capture a high-fidelity snapshot of a specific idea or topic from the conversation that preserves enough detail and nuance to enable resuming work on that idea later. The capture should extract just the relevant thread while excluding unrelated discussions.

## Output Format

Use a **hybrid approach** with structured sections containing narrative chronological flow:

```markdown
# [Idea Title]

> Captured: [timestamp]
> Source: [conversation context]

## Genesis

[Narrative describing what initially prompted this idea, including the trigger, context, and initial framing]

## Evolution

[Chronological narrative of how the idea developed, including:]

### Phase 1: [Description]
- **Decision**: [What was decided and why]
- **Rejection**: [What was considered but rejected, and why it shifted]
- **Q&A**:
  - Q: [Question asked]
  - A: [Answer provided]

[Continue with additional phases as the idea evolved...]

### Rabbit Hole: [Topic]
[Brief summary of tangent that wasn't directly useful, noted for context]

## Current State

[Clear description of where the idea stands now, including:]
- Current approach/solution
- Key decisions locked in
- Open questions remaining
- Next steps (if discussed)

## Unresolved Decisions

[If there are decisions that were discussed but never resolved, capture them here with exact context]

### Decision Point: [Description]

**Context Summary**: [Brief summary of the leadup - only what's needed to understand the decision]

**Exact Discussion**:
> User: [Exact text of the prompt where the decision point arose]

> Assistant: [Exact text of the response that presented options or raised the question]

> User: [Any follow-up, if applicable]

[If the discussion continued but never reached resolution, include only the relevant exchanges]

**What needs to be decided**: [Clear statement of what choice or direction needs to be made]

**Options discussed**:
- Option A: [description]
- Option B: [description]
- [etc.]

[Repeat for additional unresolved decisions]

## Artifacts

[Exact preservation of any code, examples, reports, or other concrete outputs]

### Code Snippet: [Description]
```[language]
[exact code]
```

### Example: [Description]
[exact example content]

### Report/Output: [Description]
```
[exact output]
```

## Related Atomic Ideas

[Any tangentially related ideas that were touched upon, extracted as atomic concepts]
- **[Related Idea]**: [Brief description and connection to main idea]
```

## Capture Process

### 1. Identify Idea Boundaries

**Auto-detect** where the idea started by:
- Searching for the initial mention of the core topic/concept
- Identifying the triggering question, request, or discussion point
- Tracing forward from that point to the current message
- Excluding messages that don't relate to the idea's thread

**Techniques for boundary detection:**
- Look for semantic shifts in the conversation (topic changes)
- Identify when a specific term, concept, or problem was first introduced
- Track decision points and pivots that relate to this idea
- Recognize when discussion returns to or diverges from the core topic

### 2. Extract Chronologically

Work through the conversation from the identified starting point to present, extracting:

**Initial Prompt/Trigger:**
- What question was asked or problem was raised?
- What context led to exploring this idea?
- What was the initial framing or approach suggested?

**Development Timeline:**
- What decisions were made and why?
- What approaches were tried and rejected?
- What questions were asked and answered?
- How did the idea pivot or evolve?
- What rabbit holes were explored (and were they useful)?

**Current State:**
- Where does the idea stand now?
- What's been decided/implemented?
- What remains open or unclear?

### 3. Preserve Fidelity

**Exact preservation required for:**
- Code snippets (all code must be complete and exact)
- Examples (commands, queries, configurations)
- Error messages and outputs
- Reports and structured data
- File paths and specific values
- Technical specifications
- **Unresolved decision discussions** (exact prompts and responses at the decision point)

**Summarization allowed for:**
- Rabbit holes that didn't yield useful results
- Explanatory discussions where the conclusion is what matters
- Repetitive back-and-forth that reached a clear decision

**Balance:**
- Preserve enough detail to resume without loss of context
- Capture nuances that influenced decisions
- Avoid excessive verbosity where summarization doesn't lose meaning
- When in doubt, err on the side of more detail rather than less

### 4. Capture Unresolved Decisions

**Identify decision points that were discussed but never resolved:**
- Look for questions that were asked but never answered
- Identify options that were presented but no choice was made
- Find discussions where the user was asked to decide but didn't respond
- Spot places where multiple approaches were debated without conclusion

**For each unresolved decision:**

1. **Summarize the leadup**: Provide only enough context to understand what led to this decision point. If there's extensive discussion beforehand, distill it to the key points that matter for making the decision later.

2. **Preserve exact text**: Capture the exact prompt and response text where the decision point emerged. This is critical - do not paraphrase or summarize these exchanges. Include:
   - The exact user prompt that raised or led to the decision
   - The exact assistant response that presented options or asked for a decision
   - Any follow-up exchanges directly about this decision
   - Stop when the conversation moves on without resolution

3. **Clarify what needs deciding**: State clearly what choice or direction needs to be made in the future.

4. **List options discussed**: Document each approach or option that was mentioned, with brief descriptions.

**Important principles:**
- Only capture unresolved decisions that **pertain to the idea being captured**
- Don't include the entire conversation - extract only what's needed for the decision
- Preserve exact text at the decision point itself - this is where fidelity matters most
- Summarize lengthy leadup - we don't need verbatim history, just enough to understand the context
- If a decision was made (even implicitly), it goes in "Evolution" or "Current State", not here

**Example of what to capture:**

Good: "After discussing 3 database options, the user was asked whether to prioritize write performance or read consistency but never responded."

Bad: Capturing 50 messages of database discussion when only 3-4 messages contain the actual decision point.

### 5. Filter Related vs Unrelated

**Include:**
- Direct discussion of the core idea
- Decisions that shaped the idea's direction
- Questions and answers about the idea
- Examples and implementations of the idea
- Pivots and rejections that influenced the current approach
- Atomic related concepts that directly connect

**Exclude:**
- Completely unrelated conversation threads
- Side discussions about different topics
- Meta-conversation (unless it affected the idea)

**Handle Related Atomic Ideas:**
When a tangentially related idea emerges:
- Extract just the atomic relatable portion
- Note it in "Related Atomic Ideas" section
- Keep it concise (1-3 sentences)
- Explain the connection to the main idea

### 5. Structure for Resumability

The captured idea should enable someone to:
- Understand what problem/question started this exploration
- See how the idea evolved from initial concept to current state
- Know what was tried and why it was rejected
- Access exact code/examples/outputs that were produced
- Identify open questions or next steps
- Resume work without needing to re-derive context

**Quality check questions:**
- Can I resume this idea in a new conversation without the original context?
- Are all code snippets complete and runnable?
- Are decisions explained with enough rationale to understand why?
- Would I know what to do next if picking this up tomorrow?
- Are unresolved decisions captured with exact text at the decision point?
- Do I have enough context to make unresolved decisions later without the full conversation?

## Example Capture

See below for an example of a well-formed idea capture:

---

# Vector Database Integration Strategy

> Captured: 2026-02-08 14:23:45
> Source: Discussion about improving search performance in the documentation system

## Genesis

The idea emerged from observing slow search performance in the existing keyword-based search system. Initial trigger was a user complaint about search taking 3-5 seconds for simple queries. We discussed whether to optimize the current SQL full-text search or explore vector-based semantic search.

Initial framing: "Could we use embeddings to make search more semantic and faster?"

## Evolution

### Phase 1: Technology Selection

- **Decision**: Chose PostgreSQL with pgvector extension over standalone vector DB (Pinecone, Weaviate)
  - Rationale: Already using Postgres, simpler architecture, good enough for current scale
  - Avoids operational complexity of managing another database

- **Rejection**: Considered Elasticsearch but rejected due to:
  - Additional infrastructure to maintain
  - Overkill for current 50k document corpus
  - Team unfamiliarity with Elasticsearch operations

- **Q&A**:
  - Q: What about using OpenAI embeddings vs open source?
  - A: Start with OpenAI ada-002 for quality, can switch to open source later if costs become prohibitive

### Phase 2: Schema Design

Explored different approaches for storing embeddings:

- **Decision**: Separate `document_embeddings` table with foreign key to `documents`
  - Keeps main documents table clean
  - Allows multiple embedding versions/models
  - Easier to rebuild embeddings without touching source docs

- **Rejection**: Embedding column directly in documents table
  - Makes schema rigid
  - Harder to test different embedding models
  - Complicates migrations

### Rabbit Hole: Chunking Strategies

Spent significant time exploring optimal chunk sizes (256, 512, 1024 tokens) and overlap strategies. Ran several tests but found the differences negligible for our use case. Settled on 512 tokens with 50 token overlap as a reasonable default without overthinking it.

## Current State

**Decided approach:**
- Use PostgreSQL with pgvector extension
- OpenAI ada-002 embeddings (1536 dimensions)
- Separate document_embeddings table
- 512 token chunks with 50 token overlap
- Cosine similarity for search
- Hybrid search: vector similarity + keyword matching with score fusion

**Implementation status:**
- Schema designed but not yet implemented
- Need to write migration script
- Need to implement embedding generation pipeline

**Open questions:**
- How to handle embedding updates when documents change?
- What's the right similarity threshold for filtering results?
- Should we batch embed documents or do it on-demand?

**Next steps:**
1. Write and test migration script for new tables
2. Implement embedding generation function
3. Create hybrid search query
4. Benchmark against current search

## Unresolved Decisions

### Decision Point: Embedding Update Strategy

**Context Summary**: During implementation planning, the question arose of how to handle embedding updates when documents are edited. Three approaches were discussed: incremental updates, full regeneration, or versioned embeddings.

**Exact Discussion**:
> User: What happens when a document gets edited? Do we need to regenerate embeddings for the whole document?

> Assistant: Good question. There are a few approaches:
>
> 1. **Incremental**: When a document changes, only regenerate embeddings for affected chunks. This requires tracking which chunks map to which document sections.
>
> 2. **Full regeneration**: Delete all embeddings for that document and regenerate from scratch. Simpler but potentially wasteful if only a small section changed.
>
> 3. **Versioned embeddings**: Keep old embeddings and mark them as deprecated, generating new ones alongside. This allows for gradual migration and A/B testing.
>
> Which approach makes sense for your use case? How frequently do documents get edited, and are edits typically small tweaks or major rewrites?

[No response from user - conversation moved to discussing the hybrid search query instead]

**What needs to be decided**: Choose an embedding update strategy that balances performance, complexity, and the expected document edit patterns.

**Options discussed**:
- **Incremental updates**: More efficient but requires chunk-to-document mapping
- **Full regeneration**: Simpler implementation, may waste API calls on minor edits
- **Versioned embeddings**: Most flexible, adds storage overhead and complexity

## Artifacts

### Schema Definition

```sql
-- Main documents table (existing, simplified)
CREATE TABLE documents (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- New embeddings table
CREATE TABLE document_embeddings (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1536) NOT NULL,
    model_version VARCHAR(50) DEFAULT 'ada-002',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(document_id, chunk_index, model_version)
);

-- Index for vector similarity search
CREATE INDEX ON document_embeddings USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
```

### Hybrid Search Query (Draft)

```sql
-- Combines vector similarity with keyword matching
WITH vector_results AS (
    SELECT
        de.document_id,
        de.chunk_text,
        1 - (de.embedding <=> $1::vector) AS similarity_score
    FROM document_embeddings de
    ORDER BY de.embedding <=> $1::vector
    LIMIT 20
),
keyword_results AS (
    SELECT
        d.id AS document_id,
        ts_rank(to_tsvector('english', d.content), plainto_tsquery('english', $2)) AS keyword_score
    FROM documents d
    WHERE to_tsvector('english', d.content) @@ plainto_tsquery('english', $2)
    LIMIT 20
)
SELECT
    d.id,
    d.title,
    COALESCE(v.similarity_score, 0) * 0.7 + COALESCE(k.keyword_score, 0) * 0.3 AS combined_score
FROM documents d
LEFT JOIN vector_results v ON v.document_id = d.id
LEFT JOIN keyword_results k ON k.document_id = d.id
WHERE v.document_id IS NOT NULL OR k.document_id IS NOT NULL
ORDER BY combined_score DESC
LIMIT 10;
```

### Embedding Generation Function (Pseudocode)

```python
def generate_embeddings(document_id: int, content: str):
    """Generate and store embeddings for a document."""
    chunks = chunk_text(content, chunk_size=512, overlap=50)

    for i, chunk in enumerate(chunks):
        embedding = openai.Embedding.create(
            input=chunk,
            model="text-embedding-ada-002"
        )["data"][0]["embedding"]

        db.execute("""
            INSERT INTO document_embeddings
            (document_id, chunk_index, chunk_text, embedding, model_version)
            VALUES ($1, $2, $3, $4, 'ada-002')
            ON CONFLICT (document_id, chunk_index, model_version)
            DO UPDATE SET
                chunk_text = EXCLUDED.chunk_text,
                embedding = EXCLUDED.embedding,
                created_at = NOW()
        """, [document_id, i, chunk, embedding])
```

## Related Atomic Ideas

- **Incremental embedding updates**: Discussed using a job queue to process document changes asynchronously rather than blocking on updates. Connection: Solves the open question about handling document changes.

- **Cost monitoring**: Brief mention of tracking OpenAI API costs for embeddings. Connection: Important for production viability but not critical for initial implementation.

---

This example demonstrates:
- Clear genesis and evolution tracking
- Preserved code artifacts with exact syntax
- Documented decisions with rationale
- Noted rejections and why
- Captured rabbit hole with summary
- Current state with open questions
- Related ideas extracted atomically
