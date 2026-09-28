
<!-- TA enrichment -->

## 12. Technical Enrichment (TA)

### 12.1 Technology Choices
- **Stack**: TypeScript, Pi Agent Extension, SessionManager
- **Components**: `session-compactor.ts`, `eval-harness.ts`
- **Compaction trigger**: usage ≥95%

### 12.2 API Contracts (Detailed)
| Component | Method | Input | Output | Errors |
|-----------|--------|-------|--------|--------|
| SessionCompactor | compact(session) | session | compactedSession | COMPACT_FAIL → truncate |
| EvalHarness | runEval(modelId) | modelId | {metrics} | EVAL_ERROR → skip |

Example:
```json
{
  "currentUsage": 0.96,
  "contextWindow": 2048
}
→ compact to 0.70 usage
```

### 12.3 Data Model Details
- Compaction summary stored in session history
- Eval metrics: tokens saved, quality score, latency

### 12.4 Integration Specifications
- Runs pre-session creation and mid-session
- Hooks into SessionManager
- Eval harness uses synthetic dataset

### 12.5 Non-Functional Requirements (Quantified)
- Compaction <300ms
- Quality retention ≥90%
- Eval run <5min per model

### 12.6 Risks & Mitigation
| Risk | Mitigation |
|------|------------|
| Information loss | Summarize with citations |
| Eval drift | Version dataset |

### 12.7 Open Issues
- OI-330-01: Define compaction prompt — Owner: SA, Due: 2026-10-17
