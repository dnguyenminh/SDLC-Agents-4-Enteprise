
<!-- TA enrichment -->

## 12. Technical Enrichment (TA)

### 12.1 Technology Choices
- **Stack**: TypeScript, Pi Agent Extension, LangGraph orchestration
- **Components**: `extension/src/pi-agent/context-retriever.ts`, `session-factory.ts`, `query-router.ts`
- **Search backends**: code_search (MCP), mem_search (MCP)
- **Token counting**: tiktoken-compatible heuristic

### 12.2 API Contracts (Detailed)
| Service | Method | Input | Output | Errors |
|---------|--------|-------|--------|--------|
| ContextRetriever | retrieve(query, topK) | query:string, topK<=20 | {contextFiles:[{path, outline, tokens}]} | SEARCH_TIMEOUT → fallback summary-tree |
| ContextRetriever | rankSymbols(fileSet) | fileSet[] | rankedSymbols[] | EMPTY_RESULT → empty context |
| QueryRouter | classify(query) | query:string | intent: LOCAL|GLOBAL|STRUCTURAL | UNKNOWN_INTENT → LOCAL |

Example request:
```json
POST /api/context/retrieve
{
  "query": "how does budget check work",
  "topK": 20
}
```
Response:
```json
{
  "contextFiles": [
    {"path":"session-configurator.ts","outline":"...","tokens":200}
  ],
  "totalTokens": 4800,
  "tier":"symbol"
}
```

### 12.3 Data Model Details
- Transient result objects, no persistence
- File exclusion list config: `.git,node_modules,out,dist`
- Progressive disclosure tiers: symbol(200 tok), chunk(800 tok), full
- Pagination cursor for file list

### 12.4 Integration Specifications
- **code_search MCP**: `code_search(query, limit=20)` → symbols
- **mem_search MCP**: semantic search for docs
- **Session Factory**: receives contextFiles, merges into system prompt
- Retry policy: 1 retry with 200ms backoff; on timeout switch to summary-tree
- Circuit breaker: not required for local MCP

### 12.5 Non-Functional Requirements (Quantified)
- Retrieval latency <500ms p95 for topK=20 [Implements: PREQ-325-1]
- Token usage <6000 for 1000-file repo
- Scalability: support 10k files with pagination
- Availability: 99.5%

### 12.6 Risks & Mitigation
| Risk | Mitigation |
|------|------------|
| Search timeout on large repo | Fallback to summary-tree + pagination |
| Irrelevant results | Re-rank by symbol name + query embedding |
| Token overrun | Hard cap 6000, truncate lowest rank |

### 12.7 Open Issues
- OI-325-01: Define summary-tree generation format — Owner: SA, Due: 2026-10-12
