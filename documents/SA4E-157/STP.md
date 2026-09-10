# Software Test Plan (STP) — SA4E-157

## 1. Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-157 |
| Title | [Bug] LLM Enrichment Progress Not Visible to User |
| Author | dev-agent (test gap closure) |
| Version | 1.0 |
| Date | 2026-08-30 |
| Based on | TDD v1.0, FSD v1.0, BRD v1.0 |

## 2. Purpose & Scope

This Test Plan covers the **test gap** identified for SA4E-157: the new enrichment
status endpoint, polling service, response schema, and `getEarliestActiveTimestamp()`
query had **no automated tests**, and test-planning documents (STP/STC) were missing.

Scope of testing:
- Backend: `GET /api/v1/enrichment/status` route (+ `retry-failed`, `reconcile-orphans`),
  `EnrichmentStatusSchema` (BR-01 state derivation + response validation),
  `PendingTaskRepository.getEarliestActiveTimestamp()` (BR-12 / TDD §4.3).
- Extension: `EnrichmentStatusService` polling state machine, failure degradation (EF-1),
  completion/error notifications (BR-06), dashboard sparkline (SA4E-169), lifecycle (BR-11).

Out of scope (covered by other tickets / manual SIT): real backend-vs-extension HTTP
round-trip in a live VS Code window, visual StatusBarItem rendering, rate-limiter interaction.

## 3. Test Approach

| Level | Technique | Framework | Where |
|-------|-----------|-----------|-------|
| Unit | White-box, isolated dependencies (fakes/mocks) | Vitest | `backend/src/**/__tests__/*`, `extension/src/**/__tests__/*` |
| Integration | In-process Hono `app.request()` + real SQLite (`:memory:`) | Vitest | `backend/src/server/routes/__tests__`, `backend/src/modules/memory/task-queue/__tests__` |

- Backend uses real `better-sqlite3` in-memory DB + real `PendingTaskRepository`/`SqliteDbAdapter`.
- Route handler uses a faked `ModuleRegistry`/`TaskWorker` to isolate HTTP-layer behavior.
- Extension uses the shared `vscode` mock (`src/test/mocks/vscode.ts`) and an injected fake
  `IndexerHttpClient` (type-only at runtime) — no VS Code host or real network needed.

## 4. Test Items (under test)

| ID | Item | Source file |
|----|------|-------------|
| TI-1 | Enrichment status route handlers | `backend/src/server/routes/enrichment-status-routes.ts` |
| TI-2 | Enrichment status Zod schema + `deriveEnrichmentState` | `backend/src/shared/schemas/EnrichmentStatusSchema.ts` |
| TI-3 | `getEarliestActiveTimestamp()` | `backend/src/modules/memory/task-queue/PendingTaskRepository.ts` |
| TI-4 | `EnrichmentStatusService` polling/state machine | `extension/src/services/EnrichmentStatusService.ts` |

## 5. Environment & Prerequisites

- Node + `npm` (pnpm-equivalent via `npx vitest`).
- `backend/` deps installed (`better-sqlite3`, `hono`, `zod`, `pino`, `vitest`).
- `extension/` deps installed (`zod`, `vitest`); `vscode` aliased to test mock via `vitest.config.ts`.
- Run commands:
  - `cd backend && npx vitest run src/shared/schemas/__tests__/EnrichmentStatusSchema.test.ts src/server/routes/__tests__/enrichment-status-routes.test.ts src/modules/memory/task-queue/__tests__/PendingTaskRepository.earliest.test.ts`
  - `cd extension && npx vitest run src/services/__tests__/EnrichmentStatusService.test.ts`

## 6. Entry / Exit Criteria

- **Entry:** Implementation present (STATUS: implementation=done). Source compiles.
- **Exit:** All listed test cases pass (0 failed); STP + STC created; STATUS synced.

## 7. Traceability (Test Case → Requirement)

| Test Case ID | Requirement | Source |
|--------------|-------------|--------|
| UT-SCH-01..06 | State derivation | BR-01, TDD §3.2 |
| UT-SCH-07..12 | Response schema validation | TDD §3.2, FSD §3.3 |
| IT-RT-01..02 | Status 200 + project scoping | UC-1/UC-4, FSD §3.3 |
| IT-RT-03 | 503 when TaskWorker missing | TDD §3.2 (503) |
| IT-RT-04 | 500 on DB error | TDD §3.2 (500) |
| IT-RT-05..08 | retry-failed / reconcile-orphans | SA4E-165 admin ops |
| IT-REPO-01..07 | `startedAt` derivation | BR-12, TDD §4.3 |
| UT-SVC-01..05 | Poll success / failure handling | EF-1, EF-2, EF-3 |
| UT-SVC-06 | Completion notification once | BR-06 |
| UT-SVC-07 | Error notification + retry action | BR-05/BR-07 |
| UT-SVC-08..09 | Dashboard sparkline | SA4E-169 |
| UT-SVC-10..11 | Timer lifecycle (no orphan) | BR-11 |

## 8. Risks / Notes

- BR-02 specifies `Math.round`; the **implemented** percent uses `Math.floor`
  (floor so 100% only shows when truly complete). Tests assert the implementation's behavior.
- `estimatedCompletion` (BR-08) is computed in the backend route; covered indirectly via the
  200-response shape. The extension does not recompute it (uses `response.estimatedCompletion`).
