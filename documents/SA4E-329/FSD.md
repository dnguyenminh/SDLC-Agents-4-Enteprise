
<!-- TA enrichment -->

## 12. Technical Enrichment (TA)

### 12.1 Technology Choices
- **Stack**: TypeScript, Pi Agent Extension, SessionConfigurator
- **Routing logic**: confidence score from small model → decision

### 12.2 API Contracts (Detailed)
| Component | Method | Input | Output | Errors |
|-----------|--------|-------|--------|--------|
| ModelRouter | route(query, modelId) | query, modelId | {modelId, reason} | ROUTE_ERROR → keep original |
| ConfidenceScorer | score(answer) | answer | score:number | SCORE_FAIL → 0.5 |
| FallbackHandler | escalate(session) | session | newSession | ESCALATE_FAIL → log |

Example:
```json
{
  "smallModelAnswer": "...",
  "confidence": 0.62,
  "threshold": 0.75
}
→ escalate to large model
```

### 12.3 Data Model Details
- Routing policy config: threshold 0.75, max escalations 1 per session
- No DB

### 12.4 Integration Specifications
- Runs post-answer generation
- Calls cost tracker for budget check before escalation
- Logging to diagnostics

### 12.5 Non-Functional Requirements (Quantified)
- Routing decision <100ms
- Escalation latency <5s
- Cost increase ≤30% per session

### 12.6 Risks & Mitigation
| Risk | Mitigation |
|------|------------|
| Over-escalation cost | Threshold tuning, max 1 escalation |
| Confidence miscalibration | Calibrate with eval harness |

### 12.7 Open Issues
- OI-329-01: Define confidence prompt — Owner: TA, Due: 2026-10-16
