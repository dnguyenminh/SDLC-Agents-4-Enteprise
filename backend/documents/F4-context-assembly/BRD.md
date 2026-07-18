# Business Requirements Document (BRD)

## SA4E — F4-context-assembly: AI Context Assembly

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F4-context-assembly |
| Title | AI Context Assembly |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial document — generated from feature spec and source analysis |

---

## 1. Introduction

### 1.1 Scope

This feature implements the **AI Context Assembly** engine for SA4E — a system that intelligently gathers, ranks, and assembles code context within a token budget for AI-assisted development workflows. The engine supports three primary operations:

1. **Intent-aware context** (`get_ai_context`) — retrieves code context prioritized by developer intent (explain/modify/debug/test)
2. **Edit context** (`get_edit_context`) — gathers everything needed before modifying a symbol (source + callers + tests + git history)
3. **Curated context** (`get_curated_context`) — natural language query across code, memory, and graph with Reciprocal Rank Fusion (RRF) merging

The system manages a **token budget** to ensure assembled context fits within LLM context windows while maximizing information value.

### 1.2 Out of Scope

- LLM inference / prompt execution (context is assembled, not sent to LLM)
- Code modification or generation
- IDE UI beyond clipboard copy commands
- Knowledge base storage/indexing (consumed as read-only source)
- Graph index construction (consumed as read-only source)

### 1.3 Preliminary Requirements

| Prerequisite | Description |
|-------------|-------------|
| Code Intelligence Index | SQLite database with symbols, files, relationships tables populated |
| Call Graph Service | Operational call graph traversal (F3 dependency) |
| Symbol Resolver | Graph-based symbol resolution by name or file:line |
| Knowledge Base | FTS-indexed knowledge_entries table for memory search |
| Graph Traverser | Graph traversal engine for relationship expansion |

---

## 2. Business Requirements

### 2.1 High Level Process Map

The AI Context Assembly engine sits between the **code intelligence index** (upstream data source) and the **AI agent** (downstream consumer). When a developer invokes a context command, the engine:

1. Parses the request (symbol, intent, query, budget)
2. Resolves symbol(s) from the index
3. Fetches relevant sections based on intent strategy
4. Merges multi-source results using RRF algorithm
5. Allocates token budget with progressive detail levels
6. Returns assembled context within budget constraints

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories

| # | Story / Use Case | Priority | Source |
|---|-----------------|----------|--------|
| 1 | Intent-aware context retrieval for a symbol | MUST HAVE | KSA-158 |
| 2 | Edit context gathering before code modification | MUST HAVE | KSA-159 |
| 3 | Curated context via natural language query | MUST HAVE | KSA-160 |
| 4 | Token budget management across sections | MUST HAVE | KSA-158/159 |
| 5 | RRF merging of multi-source search results | MUST HAVE | KSA-160 |
| 6 | Configurable source weights for ranking | SHOULD HAVE | KSA-160 |
| 7 | Progressive detail allocation (full/signature/reference) | SHOULD HAVE | KSA-160 |
| 8 | Intent strategy customization | COULD HAVE | KSA-158 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** Developer places cursor on a symbol or types a natural language query

**Step 2:** Developer invokes one of three context tools (via MCP tool call or VS Code command)

**Step 3:** Engine resolves the target symbol(s) from the code intelligence index

**Step 4:** Engine determines context strategy based on intent (explain/modify/debug/test) or query analysis

**Step 5:** Engine fetches relevant data sections from multiple sources (code index, knowledge base, call graph)

**Step 6:** Engine applies RRF merging if multiple sources are queried

**Step 7:** Engine allocates token budget with progressive detail levels (full source, signatures, references)

**Step 8:** Engine returns assembled context as structured JSON

**Step 9:** Client (VS Code extension) formats and copies result to clipboard or passes to AI agent

---

#### STORY 1: Intent-Aware Context Retrieval

> As a developer using an AI assistant, I want context about a symbol assembled according to my intent (explain, modify, debug, test) so that the AI receives the most relevant information for my current task.

**Requirement Details:**

1. Accept parameters: symbol name, intent (explain/modify/debug/test), token_budget, caller_depth
2. Resolve symbol from code intelligence SQLite index
3. Apply intent-specific section priority strategy:
   - **explain**: source → doc_comment → siblings → imports → callers → callees → type_definitions
   - **modify**: source → callers → callees → tests → imports → type_definitions → siblings
   - **debug**: source → callers → error_patterns → recent_changes → imports → siblings → callees
   - **test**: source → tests → test_patterns → callees → type_definitions → mocks_needed → siblings
4. Assemble sections in priority order until token budget is exhausted
5. Support partial/truncated inclusion for array sections
6. Return metadata: budget_used, budget_total, sections_included, sections_omitted, query_time_ms

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| symbol | string | Yes | Symbol name or qualified name | `TokenBudgetManager` |
| intent | string | No (default: explain) | Developer intent | `modify` |
| token_budget | number | No (default: 4000) | Max tokens for response | `8000` |
| caller_depth | number | No (default: 1) | Depth of caller/callee traversal | `2` |

**Acceptance Criteria:**

1. Given a valid symbol and intent, the system returns context sections ordered by the intent's priority strategy
2. Given a token budget of N, the total assembled content never exceeds N tokens (estimated at 4 chars/token)
3. Given intent "modify", callers and tests are prioritized higher than for "explain"
4. Given intent "debug", error_patterns and recent_changes appear before tests
5. Given a symbol not found in the index, the system returns suggestions for similar symbols
6. Sections are progressively dropped (lowest priority first) when budget is exceeded
7. Array sections may be truncated (partial results) rather than completely excluded

**Error Handling:**

- Symbol not found: Return error message with suggestions from fuzzy match
- Index database unavailable: Return error with "database not available" message
- Section fetch failure: Skip failed section gracefully, continue with remaining sections

---

#### STORY 2: Edit Context Gathering

> As a developer about to modify code, I want a comprehensive view of the symbol's source, callers, tests, and git history so that I can make safe, informed changes.

**Requirement Details:**

1. Accept symbol identifier (name or file:line format)
2. Always include: symbol source code, signature, file, line, kind
3. Optionally include: callers (with surrounding context lines), tests (source blocks), git history, siblings
4. Support file:line resolution (find innermost symbol at that line)
5. Include caller context (2 lines surrounding each call site)
6. Extract test blocks that reference the target symbol
7. Fetch recent git commits for the symbol's file

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| symbol | string | Yes | Symbol name or file:line | `rrf-merger.ts:14` |
| include_callers | boolean | No (default: true) | Include caller information | `true` |
| include_tests | boolean | No (default: true) | Include related test code | `true` |
| include_memories | boolean | No (default: false) | Include KB memories | `false` |
| include_git | boolean | No (default: true) | Include git history | `true` |
| token_budget | number | No (default: 4000) | Max tokens | `6000` |
| caller_depth | number | No (default: 1) | Caller traversal depth | `2` |

**Acceptance Criteria:**

1. Given a symbol name, the system resolves it and returns full source code of the symbol
2. Given file:line format, the system finds the innermost symbol containing that line
3. Callers include 2 lines of surrounding context at each call site
4. Test detection finds test files containing references to the target symbol
5. Git history returns the 5 most recent commits affecting the symbol's file
6. Siblings show other top-level symbols in the same file or parent scope
7. Token budget constrains total response size (sections excluded by priority when exceeded)

**Error Handling:**

- Symbol not found: Return structured response with empty source and error in metadata
- File not readable: Return empty source, continue with other sections
- Git unavailable: Skip git_history section

---

#### STORY 3: Curated Context via Natural Language Query

> As a developer working on a task, I want to query the codebase in natural language and get ranked results from code, knowledge base, and graph relationships, merged and allocated within my token budget.

**Requirement Details:**

1. Accept natural language query string
2. Analyze query: extract keywords, identify symbol candidates, build FTS query
3. Search three sources in parallel:
   - **Code**: FTS search on indexed symbols + direct symbol resolution
   - **Memory**: FTS search on knowledge_entries table
   - **Graph**: Expand relationships from top code results (calls, imports, inherits)
4. Merge results using Reciprocal Rank Fusion (RRF) with configurable source weights
5. Allocate token budget with progressive detail:
   - Top 20% results → full source code
   - Middle 40% results → signature only
   - Bottom 40% results → name + file reference
6. Format into sections grouped by source (Code Symbols, Knowledge Base, Related Graph)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| query | string | Yes | Natural language query | `how does auth work` |
| max_tokens | number | No (default: 4000) | Token budget | `8000` |
| scope | string | No | Limit to module/directory | `engine/context` |
| modules | string[] | No | Filter by module names | `["context", "graph"]` |
| languages | string[] | No | Filter by language | `["typescript"]` |
| include_source | boolean | No (default: true) | Search code index | `true` |
| include_memory | boolean | No (default: true) | Search knowledge base | `true` |
| include_graph | boolean | No (default: true) | Expand graph relationships | `true` |
| source_weights | object | No | RRF source weights | `{code: 0.5, memory: 0.3, graph: 0.2}` |

**Acceptance Criteria:**

1. Given a query like "how does auth work", the system returns ranked results from code symbols, KB entries, and graph relationships
2. RRF merging combines results from all sources using the formula: score = weight * 1/(k + rank) where k=60
3. Default source weights: code=0.5, memory=0.3, graph=0.2
4. Progressive detail: top results include full source, middle results include signatures, bottom results include references only
5. Total allocated tokens never exceed max_tokens budget
6. Response includes metadata: tokens_used, tokens_budget, sources_queried, total_candidates, results_returned, execution_time_ms
7. Graph expansion uses top 5 code results and traverses 1 hop (calls, imports, inherits edges)
8. If a source is disabled (include_source=false), its results are empty and excluded from RRF

**Validation Rules:**

- max_tokens minimum: 500 (enforced by TokenBudgetManager)
- source_weights must sum to approximately 1.0 (no strict validation, just relative proportions)
- query must be non-empty string

**Error Handling:**

- Empty query: Return empty sections with 0 results
- No KB tables: Return empty memory results, continue with code + graph
- Graph expansion failure: Skip graph source, continue with code + memory
- All sources fail: Return empty response with error metadata

---

#### STORY 4: Token Budget Management

> As the system, I must ensure all assembled context fits within the specified token budget so that downstream LLM consumers receive appropriately sized context.

**Requirement Details:**

1. Token estimation: approximately 4 characters per token
2. Minimum budget enforced at 500 tokens
3. Budget tracking: consumed vs remaining
4. Exhaustion detection when < 50 tokens remain
5. Section assembly with priority ordering (lower priority number = higher priority)
6. Truncation support for strings (substring + "... truncated") and arrays (item-by-item until budget hit)
7. Progressive inclusion: include full section → truncate if partial fit → exclude if no space

**Acceptance Criteria:**

1. Token estimation is consistent: `ceil(text.length / 4)`
2. Budget of 500 is enforced as minimum regardless of input
3. Sections are assembled in priority order (priority 1 first)
4. When a section doesn't fully fit, arrays are truncated item-by-item
5. When budget is exhausted (< 50 remaining), all subsequent sections are excluded
6. Metadata reports which sections were included vs excluded

---

#### STORY 5: RRF Merging of Multi-Source Results

> As the curated context service, I must merge ranked results from code search, memory search, and graph expansion into a single relevance-ordered list.

**Requirement Details:**

1. RRF formula: score(item) = sum( weight_source * 1/(k + rank) ) for each source containing the item
2. Constant k = 60 (standard RRF parameter)
3. Item deduplication by key (id, name:file, or name)
4. Items appearing in multiple sources get additive scores
5. Final results sorted by descending relevance_score
6. Each result includes `sources` array indicating which sources contributed

**Acceptance Criteria:**

1. An item appearing in all 3 sources at rank 0 gets score = 0.5*(1/60) + 0.3*(1/60) + 0.2*(1/60)
2. An item at rank 0 in code only gets score = 0.5 * (1/60) = 0.00833
3. Items appearing in multiple sources rank higher than single-source items (all else equal)
4. Deduplication uses: id field > name:file composite > name only > JSON prefix
5. Result includes `sources: ['code', 'memory']` showing provenance

---

#### STORY 6: Configurable Source Weights

> As a power user, I want to configure the relative importance of code, memory, and graph sources so that I can tune context relevance to my workflow.

**Requirement Details:**

1. Default weights: `{ code: 0.5, memory: 0.3, graph: 0.2 }`
2. Weights passed as optional parameter to curated context tool
3. Weights are relative (no strict sum-to-1 enforcement)
4. Higher weight = more influence on final ranking

**Acceptance Criteria:**

1. With weights `{code: 0.9, memory: 0.05, graph: 0.05}`, code results dominate rankings
2. With weights `{code: 0.3, memory: 0.5, graph: 0.2}`, memory results are boosted
3. Default weights are applied when parameter is omitted

---

#### STORY 7: Progressive Detail Allocation

> As the budget allocator, I must assign detail levels (full/signature/reference) based on relevance rank so that high-relevance results get full source while lower-relevance results get compact references.

**Requirement Details:**

1. Top 20% of results → `full` detail (full source code or content)
2. Middle 40% of results → `signature` detail (function/class signature)
3. Bottom 40% of results → `reference` detail (name + file:line, ~15 tokens)
4. If a full-detail item exceeds remaining budget, downgrade to signature
5. Response overhead: 100 tokens reserved for structure

**Acceptance Criteria:**

1. Given 10 results, results 1-2 get full detail, 3-6 get signature, 7-10 get reference
2. If full detail exceeds budget, item is downgraded to signature
3. Items that still exceed budget after downgrade are skipped
4. Total allocated tokens never exceed max_tokens

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| Code Intelligence Index (F2) | System | SQLite database with symbols, files, relationships |
| Call Graph Service (F3) | System | findCallers/findCallees traversal |
| Symbol Resolver (F3) | System | Symbol name → resolved symbol with metadata |
| Graph Traverser (F3) | System | Multi-hop graph traversal |
| Knowledge Base (F1) | System | FTS-indexed knowledge_entries |
| Git Service | System | git log for file history |
| Query Layer | System | FTS code search interface |
| better-sqlite3 | Library | SQLite database driver |

---

## 4. Stakeholders

| Role | Team | Responsibility |
|------|------|----------------|
| AI Agent Consumer | AI/LLM Pipeline | Consumes assembled context |
| Developer | End User | Invokes context tools via VS Code |
| SA4E Backend | Engineering | Implements and maintains engine |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Token estimation inaccuracy (4 chars/token is approximate) | Medium | Medium | Conservative estimation; actual LLM tokenizers vary |
| Large codebases cause slow context assembly | High | Medium | Budget limits prevent runaway; sections fetched lazily |
| Knowledge base tables may not exist | Low | Medium | Graceful fallback: return empty memory results |
| Graph expansion can be costly for highly-connected symbols | Medium | Low | Limit to top 5 symbols, max 1-hop, max 5 results per symbol |

### 5.2 Assumptions

- Code intelligence index is pre-built and up-to-date
- Git is available in the workspace for history queries
- better-sqlite3 provides synchronous access (no async needed for DB queries)
- 4 characters per token is acceptable estimation for budget management
- VS Code extension handles clipboard and user notifications

---

## 6. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | Context assembly completes within acceptable time | < 500ms for single-symbol queries |
| Performance | Curated context with all sources | < 1000ms |
| Token Efficiency | Budget utilization | >= 80% of allocated budget used (not wasted) |
| Reliability | Graceful degradation on section failures | Individual section failures do not crash entire response |
| Scalability | Handle codebases with 10k+ indexed symbols | Via FTS indexes and LIMIT clauses |
| Memory | No unbounded arrays in response | All arrays bounded by budget or explicit limits |

---

## 7. Related Source Files

| File | Component | Purpose |
|------|-----------|---------|
| backend/src/engine/context/ai-context-service.ts | AIContextService | Intent-aware context (get_ai_context) |
| backend/src/engine/context/edit-context-service.ts | EditContextService | Edit context (get_edit_context) |
| backend/src/engine/context/curated-context-service.ts | CuratedContextService | Curated NL query (get_curated_context) |
| backend/src/engine/context/token-budget-manager.ts | TokenBudgetManager | Budget tracking and assembly |
| backend/src/engine/context/rrf-merger.ts | RRFMerger | Reciprocal Rank Fusion |
| backend/src/engine/context/budget-allocator.ts | BudgetAllocator | Progressive detail allocation |
| backend/src/engine/context/intent-strategies.ts | IntentStrategies | Intent to section priority mapping |
| backend/src/engine/context/query-analyzer.ts | QueryAnalyzer | NL query to keywords/symbols/FTS |
| backend/src/engine/context/git-service.ts | GitService | Git history for symbols |
| backend/src/engine/context/types.ts | Types | Shared interfaces and DTOs |
| backend/src/engine/tools/ai-context-tools.ts | Tool Definitions | MCP tool schemas |
| backend/extension/src/ai-context-commands.ts | VS Code Commands | Extension command registration |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| RRF | Reciprocal Rank Fusion — algorithm that merges ranked lists by summing 1/(k+rank) scores |
| Token Budget | Maximum number of tokens (approximately 4 chars each) allowed in assembled context |
| Intent Strategy | Mapping from developer intent to prioritized list of context sections |
| Progressive Detail | Allocating full/signature/reference detail based on result rank |
| Source Weight | Configurable multiplier for each search source in RRF scoring |
| FTS | Full-Text Search — SQLite FTS5 for keyword search |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
