
<!-- TA enrichment -->

## 12. Technical Enrichment (TA)

### 12.1 Technology Choices
- **Stack**: TypeScript, LangGraph orchestration, Pi Agent Extension
- **Components**: `task-decomposer.ts`, `map-reduce-orchestrator.ts`
- **Parallelism**: p-limit with max 5 concurrent sub-agents

### 12.2 API Contracts (Detailed)
| Component | Method | Input | Output | Errors |
|-----------|--------|-------|--------|--------|
| TaskDecomposer | decompose(query) | query:string | batches:[{files[], subQuery}] | DECOMPOSE_FAIL → single batch |
| MapReduceOrchestrator | map(batch) | batch | partialSummaries[] | TIMEOUT → partial result |
| MapReduceOrchestrator | reduce(partials) | partials[] | synthesizedAnswer:string | REDUCE_FAIL → concat |

Example:
```json
{
  "query": "explain architecture",
  "fileCount": 120,
  "batchSize": 20,
  "parallelism": 5
}
```

### 12.3 Data Model Details
- Batch: fileIds[], subQuery, maxTokens
- PartialSummary: batchId, summary, tokens, confidence
- No persistence, in-memory for session

### 12.4 Integration Specifications
- **Session Factory** → TaskDecomposer on GLOBAL/STRUCTURAL intent
- **code_search** for file selection per batch
- Retry: 1 retry per batch, timeout 30s per batch
- Circuit breaker for sub-agent calls

### 12.5 Non-Functional Requirements (Quantified)
- Batch decomposition <200ms
- End-to-end map-reduce for 100 files <60s
- Token usage per sub-agent ≤ 4k

### 12.6 Risks & Mitigation
| Risk | Mitigation |
|------|------------|
| Synthesis loses nuance | Prompt with context summary + citations |
| Parallel overload | p-limit 5, queue remaining |

### 12.7 Open Issues
- OI-327-01: Define synthesis prompt template — Owner: BA, Due: 2026-10-13
