# SA4E-360 — Wave 3 Progress (T7-T9: functional map + wiring + E2E)

**Date:** 2026-10-14 · **Status:** DONE · **Commits:** `SA4E-360: Wave 3 - ...`

## State: DONE — all suites green

### Tasks completed
- **T7** — `functional-map-provider.ts` (SummaryTreeBuilder as-is, C-360-M1/M2:
  1,500-token map cap, 16,000-char result cap with module-priority trim,
  EF-1 omit, EF-2 layout-only + `PI_FUNCTIONAL_MAP_UNAVAILABLE`).
  `workspace-info-tool.ts` extended (cache `{at,text,map?}`, shared
  `getWorkspaceSections`, zero-arg schema unchanged, layout byte-identical).
- **T8** — `skeleton-injector.ts` (measure==inject, identity passthrough when
  degraded), `skeleton-wiring.ts` (runtime construction from optional
  mcpBridge; absent ⇒ DegradedSymbolLocator fail-safe), wire deltas ①-⑦ in
  `pi-agent-session-host.ts` (skeleton build between budget resolution and
  gate #2, loadFiles composition, agentsFilesOverride composition, read_method
  custom tool, loadout +6, OI-5 enriched PI_GATE_DECISION),
  `pi-workflow-gate.ts` READ_ONLY_TOOLS += read_method,
  `pi-workflow-adapter.ts` passes mcpBridge.
- **T9** — `skeleton-agentic.e2e.test.ts` (TC-360-01 @32k happy path with
  injected skeleton ≤ 13,767 tokens; TC-360-20 multi-turn growth),
  `read-method-chain.integration.test.ts` (IT-04 real chain over in-process
  HTTP server + real QueryLayer/SQLite; IT-05 gate #3 atomic compaction;
  IT-06 TurnBudgetGuard; IT-11 golden hit-rate 11/12 = 91.7% ≥ 80%;
  IT-12 coverage ≥ 95%),
  `backend/tests/e2e/sa4e-360-tools.e2e.test.ts` (E2E-API-01..07, 09, 11, 12 —
  full lifecycle on the real server: write → reindex → locate → assert).

### Tests (this wave)
- UT-26..29 (functional map) — 5 tests
- IT-01..03, IT-07..10 (skeleton-wiring.integration) — 7 tests
- IT-04..06, IT-11, IT-12 (read-method-chain.integration) — 6 tests
- TC-360-01/20 (skeleton-agentic.e2e) — 2 tests
- E2E-API-01..07, 09, 11, 12 — 7 tests

### Final suite numbers
- Extension vitest: **299 files / 2,893 tests — 0 failed**
- Backend unit: **303 files / 3,319 passed + 2 skipped — 0 failed**
- Backend E2E-API (SA4E-360 suite): **7 passed / 0 failed**
- SA4E-355 governance suites (context-governance, session-tier, compression
  wiring, budget-gate, transcript-compaction): **GREEN** (identity-passthrough
  contract preserved when sections are degraded/empty)

### Files created (wave 3)
- extension/src/pi-workflow/skeleton/functional-map-provider.ts
- extension/src/pi-workflow/skeleton/skeleton-injector.ts
- extension/src/pi-workflow/skeleton/skeleton-wiring.ts
- extension/src/pi-workflow/skeleton/__tests__/functional-map-provider.test.ts
- extension/src/pi-workflow/skeleton/__tests__/skeleton-wiring.integration.test.ts
- extension/src/pi-workflow/skeleton/__tests__/read-method-chain.integration.test.ts
- extension/src/pi-workflow/skeleton/__tests__/skeleton-agentic.e2e.test.ts
- backend/tests/e2e/sa4e-360-tools.e2e.test.ts

### Files modified (wave 3)
- extension/src/pi-workflow/workspace-info-tool.ts
- extension/src/pi-workflow/pi-agent-session-host.ts
- extension/src/pi-workflow/pi-workflow-gate.ts
- extension/src/pi-workflow/pi-workflow-adapter.ts
- backend/src/engine/query/query-layer.ts (bind-param fix in listClassMethods)

### Gaps (deferred — documented)
- **E2E-API-08** (loopback wrapper 3s-delay timeout/retry): DEFERRED — the
  retry design is unit-proven (UT-23: McpSymbolLocator retries ONCE — 2
  attempts total with backoff); a full real-delay-stub E2E harness needs a
  cross-package runner and stays deferred.
- **E2E-API-10** (/mcp rate limit, SEC-360-03 #1): SCOPE DECISION — not a
  blocker for this ticket. The earlier justification ("HttpServer.ts locked
  by SA4E-356 WIP") is STALE: SA4E-356 is DONE (commit `a9b7751`), so no file
  lock exists. Rate-limiting /mcp is tracked as a security backlog item
  (SEC-360-03 #1) and will be implemented in its own change.
- **E2E-UI-01/02** (Playwright): extension webview requires a live VS Code
  host; no Playwright harness exists for the extension webview in this repo
  (backend Playwright configs cover admin pages only). MANUAL HANDOFF:
  verification via the SIT checklist (SIT-01..08).
- **SIT-01..08**: manual (llama-server qwen 32k) — QA handoff per STP.

## Next session entry point
All automated waves complete. Remaining: TA review gate (design-conformance),
Phase 5.7 security re-verification (SEC-360-01/02/04/06/07 remediations are IN),
Phase 6 QA run + SIT manual checklist.
