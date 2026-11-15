---
name: loop-constraints
description: Anti-loop rules and circuit breaker for SDLC pipeline to prevent infinite cycles
---

## Anti-Loop Rules
1. DO NOT loop same phase — if file exists + has content → move forward
2. Each sub-agent MAX 2 times for same document
3. Follow SDLC order strictly: BA → BRD → BA+TA → FSD → SA → TDD

## Circuit Breaker
SM checks circuit breaker state BEFORE each phase:
- `closed` → execute normally
- `open` → HARD STOP, report user, do NOT retry
- `half-open` → allow 1 retry after 30min cooldown

Rules: 3 consecutive failures → circuit opens. User says "retry" → reset to closed.

## Feedback Loop Constraints
- BA↔SA loop: max 5 iterations
- If still inconsistent after 5 iterations → flag for manual review
- Each loop stops when DISCREPANCY.md no longer exists

## Token Budget
Track in STATUS.json:
```json
{ "tokenBudget": { "dailyCap": 500000, "usedToday": 0, "mode": "normal" } }
```
- `normal` (< 80% used) → proceed normally
- `report-only` (80-99%) → SM report only, NO agent invocations
- `stopped` (≥ 100%) → hard stop, wait for reset
