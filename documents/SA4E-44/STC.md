# System Test Cases (STC)

## SA4E — SA4E-44: Persistent Task Queue & Code Intelligence Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-44 |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-17 |
| Status | Draft |
| Related STP | STP-v1-SA4E-44.docx |

---

## 1. Property-Based Tests (PBT)

### PBT-01: Atomic Ingest Transaction Invariant

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Title** | Entry and tasks always created together or not at all |
| **Priority** | Critical |
| **UC** | UC-01 |
| **BR** | BR-01 |
| **Library** | fast-check |
| **Preconditions** | Database connected, MemoryModule initialized |

**Property:** For any valid content string (non-empty, ≤ 50000 chars), after mem_ingest: either (entry exists in DB AND tasks exist) OR (neither exists).

**Generator:**
```typescript
fc.record({
  content: fc.string({ minLength: 1, maxLength: 50000 }),
  type: fc.constantFrom('CONTEXT', 'DECISION', 'PATTERN'),
  tags: fc.option(fc.string({ maxLength: 200 })),
  timestamp: fc.option(fc.date().map(d => d.toISOString()))
})
```

**Assertion:** `count(knowledge_entries WHERE id=result.entry_id) === count(pending_tasks WHERE entry_id=result.entry_id) > 0` OR both are 0 (rollback case).

---

### PBT-02: Task Payload Schema Validation Exhaustive

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Title** | Invalid payloads never persist to pending_tasks |
| **Priority** | Critical |
| **UC** | UC-01 |
| **SEC** | SEC-02 |
| **Library** | fast-check |
| **Preconditions** | Database connected |

**Property:** For any arbitrary JSON object that does NOT match TaskSchema, `PendingTaskRepository.create()` throws ZodError and no row is inserted.

**Generator:**
```typescript
fc.oneof(
  fc.record({ entry_id: fc.constant(-1) }),
  fc.record({ entry_id: fc.constant(null) }),
  fc.record({ content: fc.string({ maxLength: 0 }) }),
  fc.anything()
)
```

**Assertion:** `expect(() => repo.create(input)).toThrow(ZodError)` AND `count(pending_tasks) === 0`.

---

### PBT-03: FIFO Ordering Invariant

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Title** | Tasks always processed in created_at ascending order |
| **Priority** | High |
| **UC** | UC-02 |
| **BR** | BR-02 |
| **Library** | fast-check |
| **Preconditions** | Multiple tasks in PENDING state |

**Property:** Given N tasks created with sequential timestamps, `claimNext()` always returns the task with the earliest `created_at`.

**Generator:**
```typescript
fc.array(fc.nat({ max: 1000 }), { minLength: 2, maxLength: 50 })
  .map(delays => delays.map((d, i) => ({ id: i, created_at: baseTime + d * i })))
```

**Assertion:** Sequence of claimed task IDs matches sorted-by-created_at order.

---

### PBT-04: Exponential Backoff Formula

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Title** | Backoff interval always within [baseInterval, maxInterval] |
| **Priority** | High |
| **UC** | UC-02 |
| **BR** | BR-03 |
| **Library** | fast-check |
| **Preconditions** | None (pure function) |

**Property:** For any idle_count in [0, 100], `calculateBackoff(idle_count)` is in [2000, 30000].

**Generator:** `fc.nat({ max: 100 })`

**Assertion:** `baseInterval <= result && result <= maxInterval`

---

### PBT-05: Retry Count Never Exceeds Max

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Title** | Task retry_count never exceeds max_retries |
| **Priority** | High |
| **UC** | UC-05 |
| **BR** | BR-05 |
| **Library** | fast-check |
| **Preconditions** | Task with max_retries=3 |

**Property:** After any sequence of fail+retry operations, `task.retry_count <= task.max_retries` AND if `retry_count >= max_retries` then `status === 'FAILED'`.

**Generator:** `fc.array(fc.constantFrom('success', 'retryable_error', 'non_retryable_error'), { minLength: 1, maxLength: 10 })`

**Assertion:** Final state satisfies invariant.

---

### PBT-06: Symbol Extraction Determinism

| Field | Value |
|-------|-------|
| **ID** | PBT-06 |
| **Title** | Same file content always produces same symbols |
| **Priority** | Medium |
| **UC** | UC-06 |
| **Library** | fast-check |
| **Preconditions** | Tree-sitter WASM loaded |

**Property:** For any valid TypeScript source, `scanner.scanFile(content)` produces identical symbol list on repeated calls.

**Generator:** `fc.constantFrom(...validTypeScriptFixtures)`

**Assertion:** `deepEqual(scan1.symbols, scan2.symbols)`

---

### PBT-07: Hash Dedup Invariant

| Field | Value |
|-------|-------|
| **ID** | PBT-07 |
| **Title** | Uploading same file twice with same hash results in skip |
| **Priority** | High |
| **UC** | UC-07 |
| **BR** | BR-06 |
| **Library** | fast-check |
| **Preconditions** | Backend running, file already uploaded |

**Property:** For any file payload F, after upload(F) succeeds, upload(F) again returns `skipped: 1, accepted: 0`.

**Generator:** Valid file payload arbitrary with random hash/symbols.

**Assertion:** Second upload returns `{ accepted: 0, skipped: 1, errors: [] }`.

---

### PBT-08: Upload Payload Validation Exhaustive

| Field | Value |
|-------|-------|
| **ID** | PBT-08 |
| **Title** | Invalid upload payloads rejected with clear errors |
| **Priority** | High |
| **UC** | UC-07 |
| **SEC** | SEC-02 |
| **Library** | fast-check |
| **Preconditions** | Backend running |

**Property:** For any payload missing required fields or containing invalid values, `code_intel_upload` returns error (not crash).

**Generator:** Invalid payload variants (empty projectId, >100 files, path traversal).

**Assertion:** Response contains error message, no server crash.

---

### PBT-09: Timestamp Resolution Priority

| Field | Value |
|-------|-------|
| **ID** | PBT-09 |
| **Title** | Timestamp resolves git > fs > now in correct priority |
| **Priority** | Medium |
| **UC** | UC-09 |
| **BR** | BR-09 |
| **Library** | fast-check |
| **Preconditions** | Workspace with git repo |

**Property:** When git timestamp available, result matches git. When git fails, result matches fs.stat. When both fail, result is approximately Date.now().

**Generator:** `fc.record({ hasGit: fc.boolean(), hasFsStat: fc.boolean() })`

**Assertion:** Priority order maintained.

---
## 2. Unit Tests (UT)

### UC-01: Atomic KB Ingest

#### UT-01: Create knowledge entry with valid content

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Title** | Valid mem_ingest creates knowledge entry |
| **Priority** | Critical |
| **Preconditions** | MemoryModule initialized, DB mock |
| **Steps** | 1. Call handleIngest({ content: "Test content", type: "CONTEXT" }) |
| **Expected** | Returns { entry_id: number, tasks_created: number >= 0 } |

#### UT-02: Reject empty content

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Title** | Empty content rejected with validation error |
| **Priority** | Critical |
| **Preconditions** | MemoryModule initialized |
| **Steps** | 1. Call handleIngest({ content: "" }) |
| **Expected** | Throws validation error with code -32602 |

#### UT-03: Reject invalid type enum

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Title** | Invalid type value rejected |
| **Priority** | High |
| **Preconditions** | MemoryModule initialized |
| **Steps** | 1. Call handleIngest({ content: "test", type: "INVALID" }) |
| **Expected** | Throws validation error mentioning valid types |

#### UT-04: Reject summary exceeding 120 chars

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Title** | Summary > 120 chars rejected (SEC-02) |
| **Priority** | High |
| **Preconditions** | MemoryModule initialized |
| **Steps** | 1. Call handleIngest({ content: "test", summary: "x".repeat(121) }) |
| **Expected** | Throws validation error about summary length |

#### UT-05: Task created when TagAnalyzer available

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Title** | TAG_ENRICHMENT task created when service available |
| **Priority** | Critical |
| **Preconditions** | TagAnalyzer mock returns available |
| **Steps** | 1. Call handleIngest with valid content |
| **Expected** | pending_tasks contains TAG_ENRICHMENT entry |

#### UT-06: No tasks when services unavailable (AF-01.3)

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Title** | Entry persisted even when all services down |
| **Priority** | High |
| **Preconditions** | TagAnalyzer=null, EmbeddingService=null |
| **Steps** | 1. Call handleIngest with valid content |
| **Expected** | Entry created, tasks_created=0 |

---

### UC-02: Background Worker

#### UT-07: claimNext returns oldest PENDING task

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Title** | Worker claims FIFO (oldest created_at) |
| **Priority** | Critical |
| **Preconditions** | 3 tasks with different created_at |
| **Steps** | 1. Insert 3 PENDING tasks with timestamps T1 < T2 < T3. 2. Call claimNext() |
| **Expected** | Returns task with created_at = T1, status = PROCESSING |

#### UT-08: claimNext returns null when no PENDING tasks

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Title** | No pending tasks returns null |
| **Priority** | High |
| **Preconditions** | Empty pending_tasks table |
| **Steps** | 1. Call claimNext() |
| **Expected** | Returns null |

#### UT-09: Backoff doubles each idle cycle

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Title** | Idle backoff: 2s -> 4s -> 8s -> 16s -> 30s (capped) |
| **Priority** | High |
| **Preconditions** | TaskWorker config: base=2000, max=30000 |
| **Steps** | 1. Simulate 5 consecutive idle polls |
| **Expected** | Intervals: [2000, 4000, 8000, 16000, 30000] |

#### UT-10: Backoff resets on task found

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Title** | Finding a task resets interval to base |
| **Priority** | High |
| **Preconditions** | Worker in backoff state (idle_count=3) |
| **Steps** | 1. Simulate task found on next poll |
| **Expected** | Next interval = baseInterval (2000ms) |

#### UT-11: markCompleted updates status and completed_at

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Title** | Successful task marked COMPLETED |
| **Priority** | Critical |
| **Preconditions** | Task in PROCESSING state |
| **Steps** | 1. Call markCompleted(taskId) |
| **Expected** | status='COMPLETED', completed_at is set |

#### UT-12: TaskProcessor dispatches by task_type

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Title** | Correct processor called for each task type |
| **Priority** | High |
| **Preconditions** | All 4 processors registered |
| **Steps** | 1. Create tasks of each type. 2. Process each |
| **Expected** | TAG_ENRICHMENT -> TagProcessor, VECTOR_EMBEDDING -> VectorProcessor, etc. |

---

### UC-03: Crash Recovery

#### UT-13: Detect stale tasks (PROCESSING > 5min)

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Title** | Tasks PROCESSING > staleThreshold detected |
| **Priority** | Critical |
| **Preconditions** | Task with started_at = now - 6 minutes |
| **Steps** | 1. Call recoverStaleTasks(300000) |
| **Expected** | Task reset to PENDING, started_at=null |

#### UT-14: Non-stale tasks untouched

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Title** | PROCESSING < 5min not recovered |
| **Priority** | High |
| **Preconditions** | Task with started_at = now - 2 minutes |
| **Steps** | 1. Call recoverStaleTasks(300000) |
| **Expected** | Task remains PROCESSING |

#### UT-15: Stale task with max retries goes to FAILED (AF-03.2)

| Field | Value |
|-------|-------|
| **ID** | UT-15 |
| **Title** | Stale task at max retries becomes dead letter |
| **Priority** | High |
| **Preconditions** | Stale task with retry_count=3, max_retries=3 |
| **Steps** | 1. Call recoverStaleTasks(300000) |
| **Expected** | Task status=FAILED (not reset to PENDING) |

---

### UC-04: Task Monitoring

#### UT-16: getStats returns correct counts

| Field | Value |
|-------|-------|
| **ID** | UT-16 |
| **Title** | Stats reflect actual task counts |
| **Priority** | Medium |
| **Preconditions** | 3 PENDING, 1 PROCESSING, 5 COMPLETED, 2 FAILED |
| **Steps** | 1. Call getStats() |
| **Expected** | { pending: 3, processing: 1, completed: 5, failed: 2 } |

#### UT-17: listFailed returns failed tasks ordered by completed_at DESC

| Field | Value |
|-------|-------|
| **ID** | UT-17 |
| **Title** | Failed tasks listed in reverse chronological order |
| **Priority** | Medium |
| **Preconditions** | 3 FAILED tasks with different completed_at |
| **Steps** | 1. Call listFailed(10) |
| **Expected** | Tasks ordered newest-first, includes error field |

---

### UC-05: Retry/Dead Letter

#### UT-18: Retryable error increments retry_count

| Field | Value |
|-------|-------|
| **ID** | UT-18 |
| **Title** | Service timeout triggers retry |
| **Priority** | Critical |
| **Preconditions** | Task with retry_count=1, max_retries=3 |
| **Steps** | 1. Process task, service throws timeout. 2. Check task state |
| **Expected** | retry_count=2, status=PENDING |

#### UT-19: Max retries reached -> FAILED permanently

| Field | Value |
|-------|-------|
| **ID** | UT-19 |
| **Title** | Dead letter after max retries |
| **Priority** | Critical |
| **Preconditions** | Task with retry_count=2, max_retries=3 |
| **Steps** | 1. Process task, fails again |
| **Expected** | retry_count=3, status=FAILED (dead letter) |

#### UT-20: Non-retryable error -> immediate FAILED

| Field | Value |
|-------|-------|
| **ID** | UT-20 |
| **Title** | entry_not_found fails immediately |
| **Priority** | High |
| **Preconditions** | Task referencing deleted entry |
| **Steps** | 1. Process task, entry not found |
| **Expected** | status=FAILED, retry_count unchanged |

#### UT-21: Manual retry resets task

| Field | Value |
|-------|-------|
| **ID** | UT-21 |
| **Title** | Operator manual retry resets to PENDING |
| **Priority** | Medium |
| **Preconditions** | FAILED task |
| **Steps** | 1. Call retryTask(taskId) |
| **Expected** | status=PENDING, retry_count=0 |

---

### UC-06: Extension Scan

#### UT-22: Discover code files filters by language

| Field | Value |
|-------|-------|
| **ID** | UT-22 |
| **Title** | Scanner discovers only configured languages |
| **Priority** | High |
| **Preconditions** | Workspace with .ts, .kt, .png, .md files |
| **Steps** | 1. Call discoverFiles(root, ['typescript', 'kotlin']) |
| **Expected** | Returns only .ts and .kt files |

#### UT-23: SHA-256 hash computation correct

| Field | Value |
|-------|-------|
| **ID** | UT-23 |
| **Title** | File hash matches expected SHA-256 |
| **Priority** | High |
| **Preconditions** | Known file content |
| **Steps** | 1. Compute hash of "hello world" |
| **Expected** | Matches known SHA-256 hex (64 chars) |

#### UT-24: Skip files matching exclude patterns

| Field | Value |
|-------|-------|
| **ID** | UT-24 |
| **Title** | node_modules and dist excluded |
| **Priority** | High |
| **Preconditions** | Workspace with node_modules/ directory |
| **Steps** | 1. Discover files with excludePatterns=["**/node_modules/**"] |
| **Expected** | No files from node_modules in results |

#### UT-25: Tree-sitter extracts symbols from TypeScript

| Field | Value |
|-------|-------|
| **ID** | UT-25 |
| **Title** | Function and class symbols extracted |
| **Priority** | Critical |
| **Preconditions** | Tree-sitter WASM loaded |
| **Steps** | 1. Parse file with `function foo() {}` and `class Bar {}` |
| **Expected** | symbols contains {name:'foo', kind:'function'} and {name:'Bar', kind:'class'} |

#### UT-26: Handle parse failure gracefully (EF-06.1)

| Field | Value |
|-------|-------|
| **ID** | UT-26 |
| **Title** | Parse error logs warning, returns null |
| **Priority** | Medium |
| **Preconditions** | Malformed file content |
| **Steps** | 1. Call scanFile with binary content |
| **Expected** | Returns null, logs warning, no throw |

---

### UC-07: Upload to Backend

#### UT-27: Skip unchanged file (same hash)

| Field | Value |
|-------|-------|
| **ID** | UT-27 |
| **Title** | File with unchanged hash skipped in upload |
| **Priority** | Critical |
| **Preconditions** | File already in DB with hash "abc123..." |
| **Steps** | 1. Upload same file with same hash |
| **Expected** | skipped=1, accepted=0 |

#### UT-28: UPSERT code_files on changed hash

| Field | Value |
|-------|-------|
| **ID** | UT-28 |
| **Title** | Changed hash triggers UPDATE |
| **Priority** | Critical |
| **Preconditions** | File exists with old hash |
| **Steps** | 1. Upload file with new hash |
| **Expected** | code_files.last_indexed_hash updated, accepted=1 |

#### UT-29: Bulk insert symbols for new file

| Field | Value |
|-------|-------|
| **ID** | UT-29 |
| **Title** | New file symbols bulk-inserted |
| **Priority** | High |
| **Preconditions** | File not in DB |
| **Steps** | 1. Upload file with 5 symbols |
| **Expected** | 5 rows in code_symbols with correct file_id |

#### UT-30: Validate required fields (SEC-02)

| Field | Value |
|-------|-------|
| **ID** | UT-30 |
| **Title** | Missing filePath rejected |
| **Priority** | Critical |
| **Preconditions** | PayloadValidator initialized |
| **Steps** | 1. Validate payload with filePath="" |
| **Expected** | Validation error returned |

#### UT-31: Path traversal prevention (SEC-03)

| Field | Value |
|-------|-------|
| **ID** | UT-31 |
| **Title** | ../../../etc/passwd rejected |
| **Priority** | Critical |
| **Preconditions** | PayloadValidator initialized |
| **Steps** | 1. Validate payload with filePath="../../../etc/passwd" |
| **Expected** | Rejected with path traversal error |

#### UT-32: Null bytes in path rejected (SEC-03)

| Field | Value |
|-------|-------|
| **ID** | UT-32 |
| **Title** | Null byte injection prevented |
| **Priority** | Critical |
| **Preconditions** | PayloadValidator initialized |
| **Steps** | 1. Validate payload with filePath="src/file\x00.ts" |
| **Expected** | Rejected with invalid path error |

---

### UC-08: Query from DB

#### UT-33: code_search returns matching symbols (BR-08)

| Field | Value |
|-------|-------|
| **ID** | UT-33 |
| **Title** | Search finds symbols by name (backward compat) |
| **Priority** | Critical |
| **Preconditions** | code_symbols populated with known data |
| **Steps** | 1. Call codeSearch("parseConfig") |
| **Expected** | Returns results with same format as previous version |

#### UT-34: code_symbols returns file's symbols

| Field | Value |
|-------|-------|
| **ID** | UT-34 |
| **Title** | Query specific file returns all its symbols |
| **Priority** | High |
| **Preconditions** | File with 3 symbols in DB |
| **Steps** | 1. Call codeSymbols("src/config.ts") |
| **Expected** | Returns 3 symbols with correct kind/line info |

#### UT-35: code_modules returns project structure

| Field | Value |
|-------|-------|
| **ID** | UT-35 |
| **Title** | Module tree aggregated from code_files |
| **Priority** | High |
| **Preconditions** | Multiple files in different directories |
| **Steps** | 1. Call codeModules() |
| **Expected** | Returns directory tree with file counts |

#### UT-36: code_traverse follows call graph

| Field | Value |
|-------|-------|
| **ID** | UT-36 |
| **Title** | Callers/callees traversal works |
| **Priority** | High |
| **Preconditions** | call_graph populated: A calls B, B calls C |
| **Steps** | 1. Call codeTraverse("B", "callers") |
| **Expected** | Returns [A] |

#### UT-37: Empty result when no data uploaded (AF-08.1)

| Field | Value |
|-------|-------|
| **ID** | UT-37 |
| **Title** | Graceful empty response before any upload |
| **Priority** | Medium |
| **Preconditions** | Empty code_files table |
| **Steps** | 1. Call codeSearch("anything") |
| **Expected** | Returns empty array with message "No code indexed" |

---

### UC-09: Incremental Re-index

#### UT-38: TimestampResolver prefers git time (BR-09)

| Field | Value |
|-------|-------|
| **ID** | UT-38 |
| **Title** | Git commit time used when available |
| **Priority** | High |
| **Preconditions** | File in git with known commit time |
| **Steps** | 1. Call resolve(filePath, workspaceRoot) |
| **Expected** | Returns git commit ISO timestamp |

#### UT-39: TimestampResolver falls back to fs.stat

| Field | Value |
|-------|-------|
| **ID** | UT-39 |
| **Title** | fs.stat mtime used when git unavailable |
| **Priority** | High |
| **Preconditions** | File not in git repo |
| **Steps** | 1. Call resolve(filePath, workspaceRoot) with no git |
| **Expected** | Returns file mtime ISO timestamp |

#### UT-40: Timestamp stored in code_files (BR-10)

| Field | Value |
|-------|-------|
| **ID** | UT-40 |
| **Title** | Uploaded timestamp persisted to DB |
| **Priority** | High |
| **Preconditions** | Upload with explicit timestamp |
| **Steps** | 1. Upload file with timestamp="2026-07-01T10:00:00Z" |
| **Expected** | code_files.timestamp = "2026-07-01T10:00:00Z" |

---

### UC-10: Remove CodeIntelModule

#### UT-41: No filesystem access in backend (BR-07)

| Field | Value |
|-------|-------|
| **ID** | UT-41 |
| **Title** | Backend has zero fs import/usage |
| **Priority** | Critical |
| **Preconditions** | Backend source code |
| **Steps** | 1. Grep backend for fs.readFile, fs.writeFile, chokidar |
| **Expected** | Zero matches (except test utilities) |

#### UT-42: No startBackgroundIndexing call

| Field | Value |
|-------|-------|
| **ID** | UT-42 |
| **Title** | Event loop not blocked by indexing |
| **Priority** | Critical |
| **Preconditions** | Backend source code |
| **Steps** | 1. Grep for startBackgroundIndexing |
| **Expected** | Zero matches |

---

## 3. Integration Tests (IT)

### UC-01: Atomic Ingest (IT)

#### IT-01: Transaction commits entry + tasks together

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Title** | Atomic commit with real PostgreSQL |
| **Priority** | Critical |
| **Preconditions** | Testcontainers PostgreSQL running, migrations applied |
| **Steps** | 1. Call mem_ingest with valid content. 2. Query knowledge_entries. 3. Query pending_tasks |
| **Expected** | Both tables have new rows, entry_id matches |

#### IT-02: Transaction rollback on failure

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Title** | DB error rolls back entire transaction |
| **Priority** | Critical |
| **Preconditions** | Testcontainers PostgreSQL, simulate constraint violation |
| **Steps** | 1. Force error during task INSERT (e.g., invalid task_type). 2. Query knowledge_entries |
| **Expected** | No entry created (rollback), error returned |

#### IT-03: Concurrent ingest requests

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Title** | 10 concurrent mem_ingest all succeed |
| **Priority** | High |
| **Preconditions** | Testcontainers PostgreSQL |
| **Steps** | 1. Fire 10 parallel mem_ingest calls |
| **Expected** | All 10 entries created, no deadlock, no data corruption |

#### IT-04: Timestamp persisted correctly

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Title** | Provided timestamp stored in knowledge_entries |
| **Priority** | High |
| **Preconditions** | Testcontainers PostgreSQL |
| **Steps** | 1. Call mem_ingest with timestamp="2026-01-15T08:00:00Z" |
| **Expected** | knowledge_entries.timestamp = provided value |

---

### UC-02: Background Worker (IT)

#### IT-05: Worker processes tasks FIFO with real DB

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Title** | Real DB FIFO ordering verified |
| **Priority** | Critical |
| **Preconditions** | 5 tasks inserted with sequential timestamps |
| **Steps** | 1. Start worker. 2. Wait for all 5 processed |
| **Expected** | Processing order matches created_at ASC |

#### IT-06: Worker does not block event loop

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Title** | API responsive during task processing |
| **Priority** | High |
| **Preconditions** | Worker processing slow task (mock 500ms) |
| **Steps** | 1. Start worker. 2. Send API request during processing |
| **Expected** | API responds < 100ms |

#### IT-07: Concurrent claim prevention

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Title** | Only one worker claims a task |
| **Priority** | High |
| **Preconditions** | Single PENDING task |
| **Steps** | 1. Simulate 2 concurrent claimNext() calls |
| **Expected** | Only one returns the task, other returns null |

#### IT-08: Worker dispatches to correct processor

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Title** | TAG_ENRICHMENT goes to TagProcessor |
| **Priority** | High |
| **Preconditions** | TAG_ENRICHMENT task, real DB |
| **Steps** | 1. Insert TAG_ENRICHMENT. 2. Worker processes |
| **Expected** | TagAnalyzer called, entry tags updated |

---

### UC-03: Crash Recovery (IT)

#### IT-09: Stale tasks recovered on startup

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Title** | Crash recovery with real PostgreSQL |
| **Priority** | Critical |
| **Preconditions** | 3 tasks stuck in PROCESSING > 5 min |
| **Steps** | 1. Insert stale tasks. 2. Call recoverStaleTasks() |
| **Expected** | All 3 reset to PENDING |

#### IT-10: Mix of stale and fresh PROCESSING

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Title** | Only stale tasks recovered, fresh untouched |
| **Priority** | High |
| **Preconditions** | 1 stale (6 min), 1 fresh (1 min) |
| **Steps** | 1. Call recoverStaleTasks(300000) |
| **Expected** | Stale -> PENDING, Fresh -> still PROCESSING |

#### IT-11: Recovery then normal processing

| Field | Value |
|-------|-------|
| **ID** | IT-11 |
| **Title** | Recovered tasks get processed normally |
| **Priority** | High |
| **Preconditions** | Recovered stale tasks |
| **Steps** | 1. Recover stale. 2. Start worker. 3. Wait |
| **Expected** | Tasks eventually reach COMPLETED |

---

### UC-04: Monitoring (IT)

#### IT-12: Stats endpoint with real data

| Field | Value |
|-------|-------|
| **ID** | IT-12 |
| **Title** | /internal/tasks/stats returns accurate counts |
| **Priority** | Medium |
| **Preconditions** | Mix of tasks in all statuses |
| **Steps** | 1. Insert tasks in various states. 2. GET /internal/tasks/stats |
| **Expected** | Counts match inserted data exactly |

---

### UC-05: Retry/Dead Letter (IT)

#### IT-13: Full retry cycle with real DB

| Field | Value |
|-------|-------|
| **ID** | IT-13 |
| **Title** | Task retries 3 times then dead letters |
| **Priority** | Critical |
| **Preconditions** | Task with always-failing processor, max_retries=3 |
| **Steps** | 1. Start worker. 2. Wait for 3 retry cycles |
| **Expected** | retry_count=3, status=FAILED, error recorded |

#### IT-14: Retry counter persists across server restarts

| Field | Value |
|-------|-------|
| **ID** | IT-14 |
| **Title** | retry_count survives restart |
| **Priority** | High |
| **Preconditions** | Task with retry_count=2 |
| **Steps** | 1. Restart server. 2. Task fails again |
| **Expected** | retry_count=3, goes to dead letter |

#### IT-15: Manual retry resets and reprocesses

| Field | Value |
|-------|-------|
| **ID** | IT-15 |
| **Title** | Operator retry works end-to-end |
| **Priority** | Medium |
| **Preconditions** | FAILED task, processor now working |
| **Steps** | 1. POST /internal/tasks/:id/retry. 2. Wait for worker |
| **Expected** | Task reprocessed, reaches COMPLETED |

---

### UC-07: Upload to Backend (IT)

#### IT-16: Hash dedup with real DB

| Field | Value |
|-------|-------|
| **ID** | IT-16 |
| **Title** | Same hash upload skipped in PostgreSQL |
| **Priority** | Critical |
| **Preconditions** | File uploaded with hash "abc..." |
| **Steps** | 1. Upload same file again with same hash |
| **Expected** | skipped=1, no DB writes |

#### IT-17: UPSERT updates existing file

| Field | Value |
|-------|-------|
| **ID** | IT-17 |
| **Title** | Changed file updates code_files row |
| **Priority** | Critical |
| **Preconditions** | Existing file in DB |
| **Steps** | 1. Upload same filePath with new hash + new symbols |
| **Expected** | code_files updated, old symbols deleted, new inserted |

#### IT-18: Batch upload 100 files (max)

| Field | Value |
|-------|-------|
| **ID** | IT-18 |
| **Title** | Maximum batch size processes correctly |
| **Priority** | High |
| **Preconditions** | Testcontainers PostgreSQL |
| **Steps** | 1. Upload batch with exactly 100 files |
| **Expected** | All 100 files persisted, response < 2s |

#### IT-19: Transaction rollback on batch error

| Field | Value |
|-------|-------|
| **ID** | IT-19 |
| **Title** | DB error rolls back entire batch |
| **Priority** | High |
| **Preconditions** | Force constraint violation mid-batch |
| **Steps** | 1. Upload batch where file #50 causes DB error |
| **Expected** | No files from batch persisted (atomic) |

#### IT-20: Enrichment task created on dependency change

| Field | Value |
|-------|-------|
| **ID** | IT-20 |
| **Title** | CALL_GRAPH_BUILD task created when deps change |
| **Priority** | High |
| **Preconditions** | File with changed imports uploaded |
| **Steps** | 1. Upload file with new import statements |
| **Expected** | pending_tasks contains CALL_GRAPH_BUILD task |

---

### UC-08: Query from DB (IT)

#### IT-21: code_search ILIKE query with real DB (BR-08)

| Field | Value |
|-------|-------|
| **ID** | IT-21 |
| **Title** | Search returns correct results from PostgreSQL |
| **Priority** | Critical |
| **Preconditions** | Symbols populated: parseConfig, parseYaml, renderPage |
| **Steps** | 1. Call codeSearch("parse") |
| **Expected** | Returns parseConfig and parseYaml (backward compat format) |

#### IT-22: code_search with vector ranking

| Field | Value |
|-------|-------|
| **ID** | IT-22 |
| **Title** | Vector similarity ranking works |
| **Priority** | Medium |
| **Preconditions** | pgvector extension enabled, embeddings populated |
| **Steps** | 1. Call codeSearch("configuration parser") |
| **Expected** | Results ranked by combined text + vector relevance |

#### IT-23: code_traverse call graph query

| Field | Value |
|-------|-------|
| **ID** | IT-23 |
| **Title** | Call graph traversal with real DB joins |
| **Priority** | High |
| **Preconditions** | call_graph: main->init->loadConfig |
| **Steps** | 1. Call codeTraverse("init", "callees") |
| **Expected** | Returns [loadConfig] |

#### IT-24: Query timeout handling (EF-08.3)

| Field | Value |
|-------|-------|
| **ID** | IT-24 |
| **Title** | Complex query returns partial on timeout |
| **Priority** | Medium |
| **Preconditions** | Large dataset, forced slow query |
| **Steps** | 1. Execute complex cross-join query with timeout |
| **Expected** | Partial results returned with timeout warning |

---

### UC-09: Incremental Re-index (IT)

#### IT-25: Single file update persists timestamp (BR-10)

| Field | Value |
|-------|-------|
| **ID** | IT-25 |
| **Title** | Updated timestamp used for freshness ranking |
| **Priority** | High |
| **Preconditions** | File exists in DB |
| **Steps** | 1. Upload file update with new timestamp. 2. Query with sort by timestamp |
| **Expected** | Updated file appears first in results |

#### IT-26: File deletion removes all related data

| Field | Value |
|-------|-------|
| **ID** | IT-26 |
| **Title** | DELETE cascades to symbols and dependencies |
| **Priority** | High |
| **Preconditions** | File with symbols and deps in DB |
| **Steps** | 1. Delete file via upload notification |
| **Expected** | code_files, code_symbols, code_dependencies rows all removed |

---

### UC-10: Remove CodeIntelModule (IT)

#### IT-27: Backend starts without filesystem access

| Field | Value |
|-------|-------|
| **ID** | IT-27 |
| **Title** | No workspace path needed for startup |
| **Priority** | Critical |
| **Preconditions** | Backend config without workspace path |
| **Steps** | 1. Start backend without WORKSPACE_PATH env var |
| **Expected** | Server starts successfully, all tools registered |

---

## 4. E2E API Tests (E2E-API)

### UC-01: Atomic Ingest (API)

#### API-01: Happy path mem_ingest via JSON-RPC

| Field | Value |
|-------|-------|
| **ID** | API-01 |
| **Title** | Full JSON-RPC request creates entry + tasks |
| **Priority** | Critical |
| **Preconditions** | Backend running, DB connected |
| **Steps** | 1. POST /mcp with JSON-RPC: method="tools/call", tool="mem_ingest", args={content:"test",type:"CONTEXT"} |
| **Expected** | 200 OK, result contains entry_id and tasks_created |

#### API-02: mem_ingest with timestamp field

| Field | Value |
|-------|-------|
| **ID** | API-02 |
| **Title** | Timestamp accepted and stored |
| **Priority** | High |
| **Preconditions** | Backend running |
| **Steps** | 1. POST mem_ingest with timestamp="2026-07-15T10:00:00Z" |
| **Expected** | Entry stored with provided timestamp |

#### API-03: mem_ingest without timestamp uses server time

| Field | Value |
|-------|-------|
| **ID** | API-03 |
| **Title** | Missing timestamp defaults to NOW() |
| **Priority** | High |
| **Preconditions** | Backend running |
| **Steps** | 1. POST mem_ingest without timestamp field |
| **Expected** | Entry stored with server time (within 1s of now) |

#### API-04: Invalid payload rejected (SEC-02)

| Field | Value |
|-------|-------|
| **ID** | API-04 |
| **Title** | Missing content field returns -32602 |
| **Priority** | Critical |
| **Preconditions** | Backend running |
| **Steps** | 1. POST mem_ingest with {} (no content) |
| **Expected** | JSON-RPC error code -32602, message mentions "content" |

#### API-05: mem_ingest response < 100ms

| Field | Value |
|-------|-------|
| **ID** | API-05 |
| **Title** | Performance: response latency under threshold |
| **Priority** | High |
| **Preconditions** | Backend running, warm state |
| **Steps** | 1. Send 100 sequential mem_ingest. 2. Measure p95 |
| **Expected** | p95 latency < 100ms |

---

### UC-02: Background Worker (API)

#### API-06: Verify FIFO via stats endpoint

| Field | Value |
|-------|-------|
| **ID** | API-06 |
| **Title** | Tasks processed in order (verified via stats) |
| **Priority** | High |
| **Preconditions** | 5 tasks ingested sequentially |
| **Steps** | 1. Ingest 5 entries. 2. Wait 10s. 3. GET /internal/tasks/stats |
| **Expected** | completed >= 5, pending = 0 |

#### API-07: Worker does not delay API response

| Field | Value |
|-------|-------|
| **ID** | API-07 |
| **Title** | API responsive while worker busy |
| **Priority** | High |
| **Preconditions** | Worker processing tasks |
| **Steps** | 1. Trigger heavy processing. 2. Immediately call mem_ingest |
| **Expected** | mem_ingest responds < 100ms |

---

### UC-03: Crash Recovery (API)

#### API-08: Verify recovery via stats after restart

| Field | Value |
|-------|-------|
| **ID** | API-08 |
| **Title** | Stale tasks recovered visible in stats |
| **Priority** | High |
| **Preconditions** | Tasks manually set to stale in DB, server restarted |
| **Steps** | 1. Force stale state. 2. Restart server. 3. GET /internal/tasks/stats |
| **Expected** | recovered tasks now in PENDING state |

---

### UC-04: Task Monitoring (API)

#### API-09: GET /internal/tasks/stats

| Field | Value |
|-------|-------|
| **ID** | API-09 |
| **Title** | Stats endpoint returns correct JSON |
| **Priority** | Medium |
| **Preconditions** | Mix of tasks in DB |
| **Steps** | 1. GET /internal/tasks/stats |
| **Expected** | JSON with pending, processing, completed, failed, isRunning, lastPollAt |

#### API-10: GET /internal/tasks/failed

| Field | Value |
|-------|-------|
| **ID** | API-10 |
| **Title** | Failed tasks list with errors |
| **Priority** | Medium |
| **Preconditions** | 2 FAILED tasks |
| **Steps** | 1. GET /internal/tasks/failed |
| **Expected** | Array of 2 tasks with error messages |

#### API-11: POST /internal/tasks/:id/retry

| Field | Value |
|-------|-------|
| **ID** | API-11 |
| **Title** | Manual retry resets task |
| **Priority** | Medium |
| **Preconditions** | FAILED task exists |
| **Steps** | 1. POST /internal/tasks/1/retry |
| **Expected** | 200 OK, task status now PENDING |

---

### UC-05: Retry/Dead Letter (API)

#### API-12: Task fails 3 times then dead letters

| Field | Value |
|-------|-------|
| **ID** | API-12 |
| **Title** | End-to-end retry + dead letter cycle |
| **Priority** | Critical |
| **Preconditions** | Failing processor mock |
| **Steps** | 1. Ingest entry. 2. Wait for 3 retry cycles. 3. Check stats |
| **Expected** | failed=1 in stats, task has retry_count=3 |

#### API-13: Non-retryable error immediate dead letter

| Field | Value |
|-------|-------|
| **ID** | API-13 |
| **Title** | Invalid payload task fails immediately |
| **Priority** | High |
| **Preconditions** | Task with corrupted payload in DB |
| **Steps** | 1. Worker picks up task. 2. Check stats |
| **Expected** | failed=1, retry_count=0 (no retry attempted) |

---

### UC-07: Upload to Backend (API)

#### API-14: Happy path batch upload

| Field | Value |
|-------|-------|
| **ID** | API-14 |
| **Title** | Upload 5 files via code_intel_upload |
| **Priority** | Critical |
| **Preconditions** | Backend running |
| **Steps** | 1. POST code_intel_upload with projectId + 5 valid files |
| **Expected** | { accepted: 5, skipped: 0, errors: [] } |

#### API-15: Partial skip (some unchanged)

| Field | Value |
|-------|-------|
| **ID** | API-15 |
| **Title** | Mix of new and unchanged files |
| **Priority** | High |
| **Preconditions** | 2 files already uploaded |
| **Steps** | 1. Upload 5 files (2 existing same hash + 3 new) |
| **Expected** | { accepted: 3, skipped: 2, errors: [] } |

#### API-16: Empty files array

| Field | Value |
|-------|-------|
| **ID** | API-16 |
| **Title** | Empty batch returns zero counts |
| **Priority** | Medium |
| **Preconditions** | Backend running |
| **Steps** | 1. POST code_intel_upload with files=[] |
| **Expected** | { accepted: 0, skipped: 0, errors: [] } or validation error |

#### API-17: Invalid file in batch (SEC-02)

| Field | Value |
|-------|-------|
| **ID** | API-17 |
| **Title** | Invalid file reported in errors array |
| **Priority** | High |
| **Preconditions** | Backend running |
| **Steps** | 1. Upload batch with 1 invalid file (missing hash) |
| **Expected** | errors contains description, valid files still processed |

#### API-18: Path traversal in filePath (SEC-03)

| Field | Value |
|-------|-------|
| **ID** | API-18 |
| **Title** | Traversal path rejected |
| **Priority** | Critical |
| **Preconditions** | Backend running |
| **Steps** | 1. Upload file with filePath="../../secrets/key.pem" |
| **Expected** | Rejected, error mentions path traversal |

#### API-19: Absolute path rejected (SEC-03)

| Field | Value |
|-------|-------|
| **ID** | API-19 |
| **Title** | Absolute path not allowed |
| **Priority** | High |
| **Preconditions** | Backend running |
| **Steps** | 1. Upload file with filePath="/etc/passwd" |
| **Expected** | Rejected with path validation error |

---

### UC-08: Query from DB (API)

#### API-20: code_search backward compatible (BR-08)

| Field | Value |
|-------|-------|
| **ID** | API-20 |
| **Title** | Search response format unchanged |
| **Priority** | Critical |
| **Preconditions** | Data uploaded |
| **Steps** | 1. Call code_search via JSON-RPC |
| **Expected** | Response fields match previous version schema exactly |

#### API-21: code_symbols for specific file

| Field | Value |
|-------|-------|
| **ID** | API-21 |
| **Title** | File symbols returned correctly |
| **Priority** | High |
| **Preconditions** | File uploaded with known symbols |
| **Steps** | 1. Call code_symbols("src/config.ts") |
| **Expected** | All symbols for that file returned |

#### API-22: code_modules project tree

| Field | Value |
|-------|-------|
| **ID** | API-22 |
| **Title** | Module tree reflects uploaded data |
| **Priority** | High |
| **Preconditions** | Multiple files in different dirs uploaded |
| **Steps** | 1. Call code_modules() |
| **Expected** | Tree structure with directories and file counts |

#### API-23: code_traverse callers

| Field | Value |
|-------|-------|
| **ID** | API-23 |
| **Title** | Traverse returns callers of symbol |
| **Priority** | High |
| **Preconditions** | Call graph built |
| **Steps** | 1. Call code_traverse("functionB", "callers") |
| **Expected** | Returns list of caller symbols |

#### API-24: code_search empty DB graceful

| Field | Value |
|-------|-------|
| **ID** | API-24 |
| **Title** | Empty DB returns graceful message |
| **Priority** | Medium |
| **Preconditions** | No data uploaded |
| **Steps** | 1. Call code_search("anything") |
| **Expected** | Empty array or message "No code indexed" |

---

### UC-09: Incremental Re-index (API)

#### API-25: Single file update with new timestamp (BR-10)

| Field | Value |
|-------|-------|
| **ID** | API-25 |
| **Title** | Incremental upload updates timestamp |
| **Priority** | High |
| **Preconditions** | File already in DB |
| **Steps** | 1. Upload same filePath with new hash + new timestamp |
| **Expected** | code_files.timestamp updated, used in query ranking |

---

### UC-10: Remove CodeIntelModule (API)

#### API-26: All code_* tools work without filesystem

| Field | Value |
|-------|-------|
| **ID** | API-26 |
| **Title** | Tools functional from DB only |
| **Priority** | Critical |
| **Preconditions** | No WORKSPACE_PATH, data uploaded via API |
| **Steps** | 1. Call code_search, code_symbols, code_modules, code_traverse |
| **Expected** | All return valid results from DB |

---

### Security Tests (API)

#### API-27: Request without API key rejected (SEC-01)

| Field | Value |
|-------|-------|
| **ID** | API-27 |
| **Title** | Missing API key returns 401 |
| **Priority** | Critical |
| **Preconditions** | Backend with auth enabled |
| **Steps** | 1. POST /mcp without Authorization header |
| **Expected** | 401 Unauthorized |

#### API-28: Invalid API key rejected (SEC-01)

| Field | Value |
|-------|-------|
| **ID** | API-28 |
| **Title** | Wrong API key returns 401 |
| **Priority** | Critical |
| **Preconditions** | Backend with auth enabled |
| **Steps** | 1. POST /mcp with Authorization: Bearer invalid-key-123 |
| **Expected** | 401 Unauthorized |

---

## 5. E2E UI Tests (E2E-UI)

### UC-06: Extension Scan (UI)

#### UI-01: Full workspace scan on activation

| Field | Value |
|-------|-------|
| **ID** | UI-01 |
| **Title** | Extension activates and scans workspace |
| **Priority** | Critical |
| **Preconditions** | Test workspace with 10 TS files, extension installed |
| **Steps** | 1. Open workspace in VS Code test host. 2. Wait for extension activation. 3. Check output channel |
| **Expected** | Output shows "Indexed 10 files, N symbols" |

#### UI-02: Re-index command full scan

| Field | Value |
|-------|-------|
| **ID** | UI-02 |
| **Title** | Manual re-index command works |
| **Priority** | High |
| **Preconditions** | Extension active |
| **Steps** | 1. Execute command "kiroSdlc.reindexWorkspace" |
| **Expected** | Full scan triggered, output shows completion |

#### UI-03: Large workspace UI responsive (AF-06.3)

| Field | Value |
|-------|-------|
| **ID** | UI-03 |
| **Title** | UI not frozen during scan of 500+ files |
| **Priority** | High |
| **Preconditions** | Test workspace with 500 files |
| **Steps** | 1. Trigger scan. 2. Attempt to type in editor during scan |
| **Expected** | Editor remains responsive (no freeze > 100ms) |

#### UI-04: Non-code files skipped

| Field | Value |
|-------|-------|
| **ID** | UI-04 |
| **Title** | .png and .md files not in upload |
| **Priority** | Medium |
| **Preconditions** | Workspace with mixed file types |
| **Steps** | 1. Scan workspace. 2. Inspect upload payload |
| **Expected** | Only configured language files uploaded |

---

### UC-07: Upload (UI)

#### UI-05: Upload triggered after scan

| Field | Value |
|-------|-------|
| **ID** | UI-05 |
| **Title** | Scan results uploaded to backend |
| **Priority** | Critical |
| **Preconditions** | Extension active, backend mock running |
| **Steps** | 1. Activate extension. 2. Wait for scan + upload |
| **Expected** | Backend mock receives code_intel_upload call |

---

### UC-09: Incremental Re-index (UI)

#### UI-06: File save triggers re-index

| Field | Value |
|-------|-------|
| **ID** | UI-06 |
| **Title** | onDidSave triggers single file upload |
| **Priority** | Critical |
| **Preconditions** | Extension active, file previously indexed |
| **Steps** | 1. Modify file content. 2. Save file |
| **Expected** | Single file uploaded to backend (hash changed) |

#### UI-07: Timestamp resolved from git (BR-09)

| Field | Value |
|-------|-------|
| **ID** | UI-07 |
| **Title** | Git commit time used in upload |
| **Priority** | High |
| **Preconditions** | File committed to git |
| **Steps** | 1. Save file. 2. Inspect upload payload timestamp |
| **Expected** | Timestamp matches git log -1 output |

#### UI-08: Unchanged file not re-uploaded (BR-06)

| Field | Value |
|-------|-------|
| **ID** | UI-08 |
| **Title** | Save without content change skips upload |
| **Priority** | High |
| **Preconditions** | File already indexed |
| **Steps** | 1. Open file, save without changes |
| **Expected** | No upload triggered (hash unchanged) |

---

## 6. System Integration Tests (SIT)

#### SIT-01: Full ingest → enrichment → query cycle

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Title** | End-to-end KB ingest with enrichment |
| **Priority** | Critical |
| **Preconditions** | Full stack: Backend + PostgreSQL + TagAnalyzer mock |
| **Steps** | 1. Call mem_ingest. 2. Wait for worker to complete. 3. Query entry |
| **Expected** | Entry has tags (from enrichment) and vector (if embedding available) |

#### SIT-02: Worker processes mixed task types

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Title** | All 4 task types processed correctly |
| **Priority** | High |
| **Preconditions** | Full stack with all processors |
| **Steps** | 1. Create tasks of all 4 types. 2. Wait for processing |
| **Expected** | All tasks reach COMPLETED, results verified per type |

#### SIT-03: Server restart preserves and recovers tasks

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Title** | Crash recovery end-to-end |
| **Priority** | Critical |
| **Preconditions** | Tasks in PENDING and PROCESSING states |
| **Steps** | 1. Kill server mid-processing. 2. Restart. 3. Wait |
| **Expected** | All tasks eventually reach COMPLETED or proper FAILED |

#### SIT-04: Dead letter visible and retriable

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Title** | Failed tasks visible in monitoring, retryable |
| **Priority** | High |
| **Preconditions** | Dead-lettered task exists |
| **Steps** | 1. GET /internal/tasks/failed. 2. Fix processor. 3. POST retry. 4. Wait |
| **Expected** | Task completes successfully after retry |

#### SIT-05: Extension scan → backend receives data

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Title** | Full extension → backend upload flow |
| **Priority** | Critical |
| **Preconditions** | VS Code test host + real backend |
| **Steps** | 1. Open workspace. 2. Wait for scan. 3. Query code_files table |
| **Expected** | All workspace files appear in DB with correct symbols |

#### SIT-06: Upload → query roundtrip

| Field | Value |
|-------|-------|
| **ID** | SIT-06 |
| **Title** | Uploaded data queryable immediately |
| **Priority** | Critical |
| **Preconditions** | Backend running |
| **Steps** | 1. Upload batch with known symbols. 2. Call code_search |
| **Expected** | Uploaded symbols returned in search results |

#### SIT-07: Backward compatibility with agents (BR-08)

| Field | Value |
|-------|-------|
| **ID** | SIT-07 |
| **Title** | Agent tools return same format |
| **Priority** | Critical |
| **Preconditions** | Data uploaded, agent client configured |
| **Steps** | 1. Call all code_* tools via agent MCP client. 2. Compare response schema |
| **Expected** | Response schema identical to pre-migration version |

#### SIT-08: Incremental update reflected in queries

| Field | Value |
|-------|-------|
| **ID** | SIT-08 |
| **Title** | File change → re-index → updated query results |
| **Priority** | High |
| **Preconditions** | File already indexed |
| **Steps** | 1. Modify file (add new function). 2. Save. 3. Wait for re-index. 4. Query |
| **Expected** | New function appears in code_search results |

#### SIT-09: Backend runs without CodeIntelModule (BR-07)

| Field | Value |
|-------|-------|
| **ID** | SIT-09 |
| **Title** | Production-like startup without filesystem |
| **Priority** | Critical |
| **Preconditions** | Docker container, no workspace mount |
| **Steps** | 1. Start backend in container. 2. Call all tools |
| **Expected** | Server starts, all tools respond (empty or with data) |

#### SIT-10: Security end-to-end (SEC-01)

| Field | Value |
|-------|-------|
| **ID** | SIT-10 |
| **Title** | Unauthenticated requests rejected at all endpoints |
| **Priority** | Critical |
| **Preconditions** | Backend with auth enabled |
| **Steps** | 1. Call mem_ingest without key. 2. Call code_intel_upload without key. 3. Call code_search without key |
| **Expected** | All return 401 |

---

## 7. Performance Tests

#### PERF-01: mem_ingest latency < 100ms

| Field | Value |
|-------|-------|
| **ID** | PERF-01 |
| **Title** | Ingest response time under threshold |
| **Priority** | High |
| **Preconditions** | Backend warm, PostgreSQL running |
| **Steps** | 1. Send 500 sequential mem_ingest requests. 2. Measure each response time |
| **Expected** | p50 < 50ms, p95 < 100ms, p99 < 150ms |

#### PERF-02: code_intel_upload 100 files < 2s

| Field | Value |
|-------|-------|
| **ID** | PERF-02 |
| **Title** | Max batch upload within time budget |
| **Priority** | High |
| **Preconditions** | Backend warm, empty DB |
| **Steps** | 1. Upload batch of 100 files (avg 20 symbols each). 2. Measure response |
| **Expected** | Response time < 2000ms |

#### PERF-03: code_search query latency

| Field | Value |
|-------|-------|
| **ID** | PERF-03 |
| **Title** | Search responds quickly with 10K symbols |
| **Priority** | Medium |
| **Preconditions** | 10,000 symbols in DB |
| **Steps** | 1. Call code_search with common term. 2. Measure |
| **Expected** | Response < 500ms |

#### PERF-04: Worker does not block event loop

| Field | Value |
|-------|-------|
| **ID** | PERF-04 |
| **Title** | Event loop latency during worker processing |
| **Priority** | High |
| **Preconditions** | Worker processing heavy tasks |
| **Steps** | 1. Start worker. 2. Measure event loop lag using monitorEventLoop |
| **Expected** | Max event loop lag < 50ms |

#### PERF-05: Extension scan 1000 files performance

| Field | Value |
|-------|-------|
| **ID** | PERF-05 |
| **Title** | Full workspace scan completes in reasonable time |
| **Priority** | Medium |
| **Preconditions** | Test workspace with 1000 TypeScript files |
| **Steps** | 1. Trigger full scan. 2. Measure total time |
| **Expected** | Complete in < 60s, UI responsive throughout |

---

## 8. Edge Case Tests

#### EDGE-01: Empty payload to mem_ingest

| Field | Value |
|-------|-------|
| **ID** | EDGE-01 |
| **Title** | Completely empty JSON body |
| **Priority** | High |
| **Steps** | 1. POST /mcp with empty JSON {} for mem_ingest args |
| **Expected** | -32602 error, no crash |

#### EDGE-02: Max batch size boundary (100 files)

| Field | Value |
|-------|-------|
| **ID** | EDGE-02 |
| **Title** | Exactly 100 files accepted, 101 rejected |
| **Priority** | High |
| **Steps** | 1. Upload 100 files -> success. 2. Upload 101 files -> error |
| **Expected** | 100: accepted. 101: rejected with clear message |

#### EDGE-03: Concurrent uploads same file

| Field | Value |
|-------|-------|
| **ID** | EDGE-03 |
| **Title** | Race condition on same file upload |
| **Priority** | High |
| **Steps** | 1. Two concurrent uploads for same filePath with different hashes |
| **Expected** | One wins (UPSERT), no duplicate rows, no crash |

#### EDGE-04: Crash mid-transaction

| Field | Value |
|-------|-------|
| **ID** | EDGE-04 |
| **Title** | Server crash during transaction rollback |
| **Priority** | Critical |
| **Steps** | 1. Start upload transaction. 2. Kill process mid-transaction. 3. Restart |
| **Expected** | No partial data in DB (transaction rolled back) |

#### EDGE-05: Unicode in file paths and symbols

| Field | Value |
|-------|-------|
| **ID** | EDGE-05 |
| **Title** | Unicode characters handled correctly |
| **Priority** | Medium |
| **Steps** | 1. Upload file with path "src/utils/日本語.ts" and symbols with unicode |
| **Expected** | Stored and queryable correctly |

#### EDGE-06: Very large symbol count per file

| Field | Value |
|-------|-------|
| **ID** | EDGE-06 |
| **Title** | File with 10,000 symbols |
| **Priority** | Medium |
| **Steps** | 1. Upload file with 10,000 symbols |
| **Expected** | Processed without timeout or memory issue |

#### EDGE-07: Hash collision handling

| Field | Value |
|-------|-------|
| **ID** | EDGE-07 |
| **Title** | Different content same hash (theoretical) |
| **Priority** | Low |
| **Steps** | 1. Upload two different files with same hash value |
| **Expected** | Second upload treated as unchanged (acceptable false-skip) |

#### EDGE-08: Backend offline when extension uploads

| Field | Value |
|-------|-------|
| **ID** | EDGE-08 |
| **Title** | Extension queues and retries on reconnect |
| **Priority** | High |
| **Steps** | 1. Stop backend. 2. Save file. 3. Restart backend |
| **Expected** | Extension retries, file eventually uploaded |

---

## 9. Test Data Files

| File | Description | Format |
|------|-------------|--------|
| test-data/valid-payloads.csv | Valid mem_ingest inputs | content, type, tags, source, summary, timestamp |
| test-data/invalid-payloads.csv | Invalid inputs for rejection testing | content, type, expected_error |
| test-data/edge-cases.csv | Boundary values and special chars | scenario, input, expected_outcome |
| test-data/upload-batch-100.json | 100-file upload fixture | FileUploadPayload[] |
| test-data/symbols-fixture.json | Known symbols for query testing | Symbol[] per file |

---

## 10. Appendix

### Test Case Summary

| Level | Count | Coverage |
|-------|-------|----------|
| PBT | 9 | Invariants + exhaustive validation |
| UT | 42 | All modules isolated |
| IT | 27 | Real DB integration |
| E2E-API | 28 | Full JSON-RPC cycle |
| E2E-UI | 8 | Extension behavior |
| SIT | 10 | End-to-end system |
| Performance | 5 | Latency + throughput |
| Edge Cases | 8 | Boundary + error |
| **Total** | **137** | |
