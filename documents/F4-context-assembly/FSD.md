# Functional Specification Document (FSD)

## SA4E — F4-context-assembly: AI Context Assembly

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F4-context-assembly |
| Title | AI Context Assembly |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F4-context-assembly.docx |
| Architecture Pattern | AI Agent System |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the AI Context Assembly engine — three MCP tools that gather, rank, and assemble code context within a token budget for AI-assisted development.

### 1.2 Scope

Three MCP tools: get_ai_context, get_edit_context, get_curated_context. Core algorithms: Token budget management, RRF merging, intent strategies, query analysis.

### 1.3 Definitions

| Term | Definition |
|------|------------|
| RRF | Reciprocal Rank Fusion — merges ranked lists with formula 1/(k+rank) |
| Token | ~4 characters of text, unit for LLM context budget |
| Intent | Developer goal: explain, modify, debug, or test |
| FTS | Full-Text Search via SQLite FTS5 |
| MCP | Model Context Protocol — tool interface standard |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Context Assembly engine reads from Code Intelligence Index (SQLite), Knowledge Base (FTS), Call Graph, and Git. It serves AI agents and VS Code extension commands.

### 2.2 Components

- **AIContextService** — intent-driven, symbol-focused context assembly
- **EditContextService** — comprehensive edit preparation (source + callers + tests + git)
- **CuratedContextService** — NL query with multi-source RRF merging
- **TokenBudgetManager** — budget tracking, estimation, truncation, assembly
- **RRFMerger** — Reciprocal Rank Fusion merging algorithm
- **BudgetAllocator** — progressive detail level assignment
- **QueryAnalyzer** — NL query parsing into keywords, symbols, FTS query
- **IntentStrategies** — intent-to-section-priority mapping

---

## 3. Functional Requirements

### 3.1 Feature: Intent-Aware Context (get_ai_context)

**Source:** BRD Story 1 (KSA-158)

#### 3.1.1 Use Case UC-1: Get Intent-Aware Context

**Actor:** Developer / AI Agent
**Preconditions:** Code intelligence index populated with symbols
**Postconditions:** Structured context JSON returned within token budget

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Calls get_ai_context | | Provides symbol, intent, budget |
| 2 | | Resolve symbol | Lookup in symbols table by name |
| 3 | | Get strategy | Map intent to section priorities |
| 4 | | Fetch sections | Read each section by priority |
| 5 | | Assemble with budget | Include until budget exhausted |
| 6 | | Return response | JSON with context + metadata |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Multiple symbols match | Use first (best match by resolver) |
| AF-2 | Section fetch fails | Skip section gracefully, continue |
| AF-3 | Partial budget fit | Truncate array items or string |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Symbol not found | Return error + fuzzy suggestions |
| EF-2 | Database unavailable | Return error response |

#### 3.1.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-1 | Token estimation: ceil(text.length / 4) | KSA-158 |
| BR-2 | Minimum budget enforced: 500 tokens | KSA-158 |
| BR-3 | Exhaustion threshold: less than 50 tokens remaining | KSA-158 |
| BR-4 | Sections in priority order (lower number = higher priority) | KSA-158 |
| BR-5 | Intent defaults to explain if not specified | KSA-158 |
| BR-6 | Default token_budget: 4000 | KSA-158 |
| BR-7 | Default caller_depth: 1 | KSA-158 |
| BR-8 | Array truncation: item-by-item until budget hit | KSA-158 |
| BR-9 | String truncation: substring + ... (truncated) marker | KSA-158 |

#### 3.1.3 Intent Strategy Table

| Intent | Sections (priority order) |
|--------|--------------------------|
| explain | source(1), doc_comment(2), siblings(3), imports(4), callers(5), callees(6), type_definitions(7) |
| modify | source(1), callers(2), callees(3), tests(4), imports(5), type_definitions(6), siblings(7) |
| debug | source(1), callers(2), error_patterns(3), recent_changes(4), imports(5), siblings(6), callees(7) |
| test | source(1), tests(2), test_patterns(3), callees(4), type_definitions(5), mocks_needed(6), siblings(7) |

#### 3.1.4 Section Fetch Details

| Section | Data Source | Format |
|---------|------------|--------|
| source | Read file lines start_line to end_line | Full source string |
| doc_comment | symbols.doc_comment column | String |
| callers | CallGraphService.findCallers(name, depth, 10) | Array of {symbol, file, line, kind} |
| callees | CallGraphService.findCallees(name, depth, 10) | Array of {symbol, file, line, kind} |
| siblings | Query symbols with same parent/file | Array of {name, kind, signature, line} |
| imports | relationships where kind=imports | Array of import names |
| tests | Files with test/spec in path referencing symbol | Array of file paths |
| type_definitions | Related symbols kind in interface/type_alias/enum/class | Array of {name, kind, signature, file} |
| error_patterns | Scan source for throw/catch patterns | Array of {type, line, text} |
| recent_changes | GitService.getFileHistory(file, 5) | Array of {hash, message} |
| test_patterns | Test function names in same module | Array of test names |
| mocks_needed | External callees (different file) | Array of {symbol, file} |

#### 3.1.5 API Contract: get_ai_context

**Input:** symbol (required), intent (default: explain), token_budget (default: 4000), caller_depth (default: 1)

**Output:** { symbol, file_path, kind, intent, context: {section_name: content}, metadata: {budget_used, budget_total, sections_included[], sections_omitted[], query_time_ms} }

**Error:** { symbol, file_path: "", kind: "unknown", context: {error, suggestions[]}, metadata: {budget_used: 0} }

---

### 3.2 Feature: Edit Context (get_edit_context)

**Source:** BRD Story 2 (KSA-159)

#### 3.2.1 Use Case UC-2: Get Edit Context

**Actor:** Developer
**Preconditions:** Symbol exists in index; source file readable
**Postconditions:** Edit-ready context with source, callers, tests, git, siblings

**Main Flow:**

| Step | Actor | System |
|------|-------|--------|
| 1 | Calls get_edit_context | Provides symbol (name or file:line) |
| 2 | | Resolve symbol (supports file:line) |
| 3 | | Read full source of symbol |
| 4 | | Parallel fetch: callers, tests, git, siblings |
| 5 | | Assemble with TokenBudgetManager |
| 6 | | Return EditContextResult |

#### 3.2.2 Business Rules

| Rule ID | Rule |
|---------|------|
| BR-10 | file:line resolution: innermost symbol (smallest line range) |
| BR-11 | Caller context: 2 surrounding lines at each call site |
| BR-12 | Test detection: paths containing test or spec that reference symbol |
| BR-13 | Test block: match it/test/describe, include 15 lines |
| BR-14 | Git history: 5 most recent commits for file |
| BR-15 | Siblings: same parent scope or file top-level |

#### 3.2.3 API Contract: get_edit_context

**Input:** symbol (required), include_callers (true), include_tests (true), include_memories (false), include_git (true), token_budget (4000), caller_depth (1)

**Output:** { symbol, file, line, kind, source, signature, callers[], tests[], git_history[], siblings[], metadata: {tokenCount, tokenBudget, sectionsIncluded[], sectionsExcluded[], queryTimeMs} }

---

### 3.3 Feature: Curated Context (get_curated_context)

**Source:** BRD Story 3 (KSA-160)

#### 3.3.1 Use Case UC-3: Curated Context via NL Query

**Actor:** AI Agent
**Preconditions:** Code index and/or KB available
**Postconditions:** Ranked, budget-allocated results from multiple sources

**Main Flow:**

| Step | System Action |
|------|--------------|
| 1 | QueryAnalyzer: extract keywords, symbol candidates, FTS query |
| 2 | Parallel search: code (FTS + symbol resolution), memory (KB FTS) |
| 3 | Graph expansion from top 5 code results (1-hop: calls, imports, inherits) |
| 4 | RRF merge all sources with configurable weights |
| 5 | BudgetAllocator: assign detail levels (full/signature/reference) |
| 6 | Format into sections grouped by source |
| 7 | Return CuratedContextResponse with metadata |

#### 3.3.2 Business Rules

| Rule ID | Rule |
|---------|------|
| BR-16 | Query analysis: remove stop words, keep tokens > 2 chars |
| BR-17 | Symbol candidates: regex match CamelCase, snake_case, dot.notation |
| BR-18 | FTS query: keywords joined with OR |
| BR-19 | Code search: FTS (limit 30) + symbol resolution (5 candidates, 3 each) combined via mini-RRF |
| BR-20 | Memory search: FTS on knowledge_entries, limit 10, order by created_at DESC |
| BR-21 | Graph: top 5 code results, 1-hop traversal, edges calls/imports/inherits, max 5 per symbol |
| BR-22 | RRF constant k = 60 |
| BR-23 | Default weights: code=0.5, memory=0.3, graph=0.2 |
| BR-24 | Deduplication key: id > name:file > name > JSON prefix(100) |
| BR-25 | Detail thresholds: top 20% = full, middle 40% = signature, bottom 40% = reference |
| BR-26 | Downgrade: full exceeds budget -> try signature |
| BR-27 | Reference fixed at 15 tokens |
| BR-28 | Response overhead: 100 tokens reserved |

#### 3.3.3 API Contract: get_curated_context

**Input:** query (required), max_tokens (4000), scope, modules[], languages[], include_source (true), include_memory (true), include_graph (true), source_weights ({code:0.5, memory:0.3, graph:0.2})

**Output:** { query, sections: [{title, source, items: [{name, kind, file, line, relevance, detail, content, relationship}]}], metadata: {tokens_used, tokens_budget, sources_queried[], total_candidates, results_returned, execution_time_ms} }

---

## 4. Processing Logic

### 4.1 RRF Merge Algorithm

**Input:** Ranked arrays from code, memory, graph + weights
**Output:** Single merged array sorted by RRF score

`
FUNCTION merge(sources, weights):
  scores = Map<key, {score, item, sources[]}>
  FOR EACH source IN [code, memory, graph]:
    FOR rank = 0 TO source.results.length:
      item = source.results[rank]
      key = getKey(item)
      rrfScore = weights[source] * (1 / (60 + rank))
      IF scores.has(key):
        scores[key].score += rrfScore
        scores[key].sources.push(source.name)
      ELSE:
        scores.set(key, {score: rrfScore, item, sources: [source.name]})
  RETURN scores.values().sortByDescending(score)
`

### 4.2 Token Budget Assembly

`
FUNCTION assemble(sections, budget):
  sorted = sections.sortBy(priority ASC)
  result = {}; usedTokens = 0; included = []; excluded = []
  FOR EACH [key, {content, priority}] IN sorted:
    tokens = ceil(stringify(content).length / 4)
    IF usedTokens + tokens <= budget:
      result[key] = content; usedTokens += tokens; included.push(key)
    ELSE IF content IS Array AND (budget - usedTokens) > 0:
      truncated = takeItemsUntilBudget(content, budget - usedTokens)
      IF truncated.length > 0: result[key] = truncated; included.push(key+" (truncated)")
      ELSE: excluded.push(key)
    ELSE: excluded.push(key)
  RETURN {result, tokenCount: usedTokens, included, excluded}
`

### 4.3 Budget Allocation

`
FUNCTION allocate(results, maxTokens):
  allocated = []; tokensUsed = 100 (overhead)
  highThreshold = max(1, ceil(results.length * 0.2))
  medThreshold = ceil(results.length * 0.6)
  FOR i = 0 TO results.length:
    IF tokensUsed >= maxTokens: BREAK
    IF i < highThreshold: detail = full, content = source_code
    ELSE IF i < medThreshold: detail = signature, content = signature
    ELSE: detail = reference, content = name(file:line), tokens = 15
    IF tokensUsed + tokens > maxTokens AND detail == full:
      detail = signature (downgrade)
    IF tokensUsed + tokens <= maxTokens:
      allocated.push({...result, detail, content, tokens})
      tokensUsed += tokens
  RETURN allocated
`

### 4.4 Query Analysis

`
FUNCTION analyze(query):
  tokens = query.lowercase().removeSpecialChars().split(whitespace)
    .filter(t => t.length > 2 AND t NOT IN STOP_WORDS)
  symbolCandidates = query.matchAll(CamelCase | snake_case | camelCase regex)
  phrases = bigrams(tokens)
  ftsQuery = tokens.join(' OR ')
  RETURN {originalQuery, keywords: tokens, symbolCandidates, phrases, ftsQuery}
`

---

## 5. Sequence Diagrams

### 5.1 get_ai_context Sequence

![Sequence AI Context](diagrams/sequence-ai-context.png)

### 5.2 get_curated_context Sequence

![Sequence Curated Context](diagrams/sequence-curated-context.png)

---

## 6. State Diagram

### 6.1 Context Request Lifecycle

![State Diagram](diagrams/state-context-request.png)

States: RECEIVED -> RESOLVING -> FETCHING -> ASSEMBLING -> COMPLETE | ERROR

---

## 7. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | Single-symbol context | < 500ms |
| Performance | Curated context (all sources) | < 1000ms |
| Token Efficiency | Budget utilization | >= 80% average |
| Reliability | Section isolation | One failure does not crash request |
| Scalability | Large indexes | 10k+ symbols via FTS + LIMIT |

---

## 8. Error Handling

| Scenario | Severity | Response |
|----------|----------|----------|
| Symbol not found | Warning | Error + suggestions |
| DB unavailable | Critical | Error string |
| Section fetch fails | Info | Skip section |
| KB tables missing | Info | Empty memory results |
| Graph fails | Info | Empty graph results |
| File unreadable | Warning | Empty source |

---

## 9. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence AI Context | [sequence-ai-context.png](diagrams/sequence-ai-context.png) | [sequence-ai-context.drawio](diagrams/sequence-ai-context.drawio) |
| 3 | Sequence Curated Context | [sequence-curated-context.png](diagrams/sequence-curated-context.png) | [sequence-curated-context.drawio](diagrams/sequence-curated-context.drawio) |
| 4 | State Context Request | [state-context-request.png](diagrams/state-context-request.png) | [state-context-request.drawio](diagrams/state-context-request.drawio) |
