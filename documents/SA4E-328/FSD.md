
<!-- TA enrichment -->

## 12. Technical Enrichment (TA)

### 12.1 Technology Choices
- **Stack**: TypeScript, Pi Agent Extension, LangGraph
- **Components**: `verification-loop.ts`, `hallucination-grader.ts`
- **Metrics**: faithfulness score 0-1

### 12.2 API Contracts (Detailed)
| Component | Method | Input | Output | Errors |
|-----------|--------|-------|--------|--------|
| HallucinationGrader | grade(answer, sources) | answer:string, sources[] | {score, issues[]} | GRADE_ERROR → score=0 |
| VerificationLoop | verify(answer) | answer:string | {verified:boolean, revisedAnswer} | VERIFY_TIMEOUT → return original |

Example:
```json
{
  "answer": "The model has 2k context",
  "sources": ["chat-models.ts#L12"]
}
→ { "score": 0.92, "issues": [] }
```

### 12.3 Data Model Details
- Grader config: threshold 0.7
- Sources: citations with file path + line
- No persistence

### 12.4 Integration Specifications
- Trigger after `execute_tools` in Pi workflow
- LLM call for grading, same model or larger
- Retry 1x, fallback to accept
- Logging to session diagnostics

### 12.5 Non-Functional Requirements (Quantified)
- Grading latency <2s per answer
- False positive <10%
- Overhead <15% of session time

### 12.6 Risks & Mitigation
| Risk | Mitigation |
|------|------------|
| Grader hallucinates | Use retrieval grounding, source citations |
| Small model grading poor | Allow escalation to larger model |

### 12.7 Open Issues
- OI-328-01: Define faithfulness rubric — Owner: QA, Due: 2026-10-14
