# Software Test Cases (STC) — SA4E-157

| Field | Value |
|-------|-------|
| Ticket | SA4E-157 |
| Author | dev-agent (test gap closure) |
| Version | 1.0 |
| Date | 2026-08-30 |
| Based on | TDD v1.0, FSD v1.0, BRD v1.0, STP v1.0 |

> All cases below are **automated** (UT = unit, IT = integration). They map 1:1 to the
> test files added in this gap-closure. SIT-level manual cases are intentionally omitted.

---

## A. Schema — `EnrichmentStatusSchema` (TI-2)

| ID | Title | Level | Precondition | Steps | Expected | File |
|----|-------|-------|-------------|-------|---------|------|
| UT-SCH-01 | idle when all zero | UT | — | call `deriveEnrichmentState({0,0,0,0})` | `'idle'` | EnrichmentStatusSchema.test.ts |
| UT-SCH-02 | running when pending/processing > 0 | UT | — | `derive({pending:5,...})`, `derive({processing:3,...})` | `'running'` | idem |
| UT-SCH-03 | error when done w/ failures | UT | — | `derive({completed:10,failed:2})` | `'error'` | idem |
| UT-SCH-04 | complete when done clean | UT | — | `derive({completed:10,failed:0})` | `'complete'` | idem |
| UT-SCH-05 | running overrides error precedence | UT | — | `derive({pending:1,completed:10,failed:2})` | `'running'` | idem |
| UT-SCH-06 | valid running response parses | UT | — | `safeParse(validResponse)` | `success===true` | idem |
| UT-SCH-07 | negative count rejected | UT | — | `safeParse({...valid,completedRules:-1})` | `success===false` | idem |
| UT-SCH-08 | percent out of 0..100 rejected | UT | — | `safeParse({...valid,percent:150})`, `percent:-5` | both `false` | idem |
| UT-SCH-09 | invalid state enum rejected | UT | — | `safeParse({...valid,state:'frobnicated'})` | `success===false` | idem |
| UT-SCH-10 | string projectId accepted | UT | — | `safeParse({...valid,projectId:'proj-1'})` | `success===true` | idem |
| UT-SCH-11 | enum has 4 members | UT | — | `EnrichmentStateEnum.options.sort()` | `['complete','error','idle','running']` | idem |
| UT-SCH-12 | negative `totalRules` rejected | UT | — | `safeParse({...valid,totalRules:-1})` | `success===false` | idem |

## B. Route — `enrichment-status-routes` (TI-1)

| ID | Title | Level | Precondition | Steps | Expected | File |
|----|-------|-------|-------------|-------|---------|------|
| IT-RT-01 | GET status 200 (no scope) | IT | TaskWorker initialized; stats = {1,2,3,0} | `GET /enrichment/status` | 200; `state=running`, `totalRules=6`, `percent=50`, activeTasks + recentFailures present; `getStats()` used | enrichment-status-routes.test.ts |
| IT-RT-02 | GET status 200 project-scoped | IT | `X-Project-Id: proj-7` | request with header | 200; `projectId='proj-7'`; `getStatsByProject('proj-7')` called | idem |
| IT-RT-03 | GET status 503 service missing | IT | registry returns `taskWorker:null` | `GET /enrichment/status` | 503; `error='Enrichment service unavailable'` | idem |
| IT-RT-04 | GET status 500 on DB error | IT | `getEarliestActiveTimestamp` rejects | `GET /enrichment/status` | 500; `error='Failed to retrieve enrichment status'` | idem |
| IT-RT-05 | POST retry-failed 200 | IT | `reconcileOrphans→2`, `retryAllFailed→4` | `POST /enrichment/retry-failed` | 200; `data.resetCount=4`, `data.purgedCount=2`, `error=null` | idem |
| IT-RT-06 | POST retry-failed 503 missing | IT | `taskWorker:null` | `POST /enrichment/retry-failed` | 503 | idem |
| IT-RT-07 | POST reconcile-orphans 200 | IT | `reconcileOrphans→3` | `POST /enrichment/reconcile-orphans` | 200; `data.purgedCount=3` | idem |
| IT-RT-08 | POST reconcile-orphans 503 missing | IT | `taskWorker:null` | `POST /enrichment/reconcile-orphans` | 503 | idem |

## C. Repository — `getEarliestActiveTimestamp` (TI-3)

| ID | Title | Level | Precondition | Steps | Expected | File |
|----|-------|-------|-------------|-------|---------|------|
| IT-REPO-01 | null when empty | IT | empty table | call | `null` | PendingTaskRepository.earliest.test.ts |
| IT-REPO-02 | PROCESSING started_at returned | IT | 1 PROCESSING w/ `started_at` | call | equals that timestamp | idem |
| IT-REPO-03 | MIN across PROCESSING rows | IT | 3 PROCESSING different times | call | earliest of the three | idem |
| IT-REPO-04 | PROCESSING null + no pending → null | IT | 1 PROCESSING w/ NULL `started_at`, no PENDING | call | `null` | idem |
| IT-REPO-05 | only PENDING → now() | IT | 1 PENDING | call | non-null recent ISO | idem |
| IT-REPO-06 | PROCESSING preferred over PENDING | IT | PENDING + PROCESSING w/ time | call | PROCESSING time | idem |
| IT-REPO-07 | COMPLETED/FAILED only → null | IT | COMPLETED + FAILED | call | `null` | idem |

## D. Service — `EnrichmentStatusService` (TI-4)

| ID | Title | Level | Precondition | Steps | Expected | File |
|----|-------|-------|-------------|-------|---------|------|
| UT-SVC-01 | poll success updates StatusBar | UT | `ok:true`, valid body | `pollNow()` | returns response; StatusBar text contains "Enriching"; logs prefixed `[Enrichment]` | EnrichmentStatusService.test.ts |
| UT-SVC-02 | success resets failure counter | UT | 1 ok then 2 non-200 | sequence | after 2 failures (<3) StatusBar NOT "Offline" | idem |
| UT-SVC-03 | offline after 3 failures | UT | 3× `ok:false` | `pollNow()`×3 | StatusBar text contains "Offline" (EF-1) | idem |
| UT-SVC-04 | malformed JSON → no failure | UT | `ok:true, body:'not-json'` | `pollNow()` | returns null; StatusBar stays `"$(database) KB: Ready"` | idem |
| UT-SVC-05 | zod-invalid body → null | UT | `state:'frobnicated'` | `pollNow()` | `null` (EF-3) | idem |
| UT-SVC-06 | completion notified once | UT | running → complete → complete | poll×3 | `showInformationMessage` called **once** (BR-06) | idem |
| UT-SVC-07 | error warning + retry cmd | UT | running → error(failed=3) | poll×2 | `showWarningMessage` once; `executeCommand('sa4e.retryFailedEnrichment')` (BR-07) | idem |
| UT-SVC-08 | dashboard empty sparkline | UT | no running polls | `buildDashboardData()` | `chartData=[]`, `ratePerSec=0`, `etaSeconds=null` | idem |
| UT-SVC-09 | dashboard two running polls | UT | running(40) → running(45) | poll×2 then `buildDashboardData()` | `chartData.length=2`, `ratePerSec≈4.5`, `etaSeconds≈12.2` | idem |
| UT-SVC-10 | timer lifecycle | UT | fake timers | `start()` then `dispose()` | timer count 1 after start, 0 after dispose (BR-11) | idem |
| UT-SVC-11 | dispose safe pre-start | UT | not started | `dispose()` | no throw | idem |

---

## E. Execution Result (2026-08-30)

| Suite | Files | Tests | Result |
|-------|-------|-------|--------|
| Backend schema | `EnrichmentStatusSchema.test.ts` | 12 | PASS |
| Backend route | `enrichment-status-routes.test.ts` | 8 | PASS |
| Backend repo | `PendingTaskRepository.earliest.test.ts` | 7 | PASS |
| Extension service | `EnrichmentStatusService.test.ts` | 11 | PASS |
| **Total** | **4 files** | **38** | **0 failed** |

> Note: schema suite = 6 derivation cases (UT-SCH-01..06) + 6 schema-validation cases (UT-SCH-07..12).
