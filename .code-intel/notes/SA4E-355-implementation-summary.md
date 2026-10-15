## Implementation Summary — SA4E-355 UAT Bug #3 (Critical)

### Root cause
`compactTranscriptToFit` (extension/src/pi-workflow/transcript-compaction.ts) pinned only system messages while walking newest->oldest. When accumulated tool results exceeded the budget, the trim point crossed the opening user message and DROPPED it. The compacted transcript = [system, assistant toolCall, toolResult] with NO user query -> llama-server qwen chat template: "Jinja Exception: No user query found in messages." (HTTP 500). Secondary evidence: model repeated identical ls calls (lost original task context).

### Fix (design)
- PIN the newest user-message unit: budget RESERVED before the tool-unit walk (`userReserveTokens`: raw size if it fits the whole budget, else compressed size if that fits, else 0) so newer tool units can never crowd it out.
- Walk (`walkUnitsNewestFirst`) keeps: pinned systems, pinned newest user (raw if fits, compressed via `fitPinnedUser` reusing `fitUnit`/`compressMessageText`, kept compressed EVEN when over budget -> caller's BR-09 gate REJECTS, never a userless transcript), trimmable units within budget - reserve.
- Multiple user messages: only newest pinned; older ones remain trimmable.
- Post-check `warnIfNoUserQuery`: logs WARN 'PI_TRANSCRIPT_COMPACTED_NO_USER_QUERY' when a compaction ends without any user message; returns result unchanged (no crash).
- Ordering preserved by unshift-in-walk-order: system -> user -> kept tool units (template-valid).

### Files modified
- extension/src/pi-workflow/transcript-compaction.ts (139 -> 200 lines)
- extension/src/pi-workflow/__tests__/transcript-compaction.test.ts (+9 new tests; 7 stale tests updated - they pinned the dropped-user bug)
- extension/src/pi-workflow/__tests__/intra-turn-budget-gate.test.ts (REJECT->COMPACT semantics for oversized incompressible tool unit; pinned user keeps request respondable)
- extension/src/pi-workflow/__tests__/pi-provider-intra-turn-gate.test.ts (same semantic update, real Agent loop)

### Test-first evidence
9 new tests written first: 7 FAILED pre-fix (user dropped), all PASSED post-fix.

### Verification
- npm test: 285 files / 2748 tests ALL GREEN
- tsc -p ./: clean; eslint on changed files: clean
- Commit: c11f461 "SA4E-355: fix UAT bug 3 - pin newest user message in transcript compaction (llama-server Jinja template validity)"