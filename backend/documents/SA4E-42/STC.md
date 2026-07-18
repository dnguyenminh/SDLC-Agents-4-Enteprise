# System Test Cases (STC)

## SDLC Agents for Enterprise (SA4E) — SA4E-42: find_tools does not re-index when child MCP server connects late

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-42 |
| Title | find_tools does not re-index when child MCP server connects late |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-02-14 |
| Status | Draft — Test Planning (Phase 4) |
| Related STP | STP-v1-SA4E-42.docx |
| Component | MCP orchestration backend (Node.js / TypeScript / better-sqlite3) |

---

## Legend

- **Technique:** PBT (Property-Based), UT (Unit), IT (Integration), E2E-API.
- **Fakes:** Fake `IEmbeddingService` (deterministic vectors), fake event source (`onServerStateChange`), fake `ClientManager` (`getProxiedTools()`, `isServerConnected()`), silent/spy `pino`.
- **Real:** better-sqlite3 via `makeTempDb()`; in-process MCP client via `connectMcp()`.
- **SUT classes:** `ReindexActionMapper`, `PerServerTaskQueue`, `McpToolsRepository`, `ReindexSubscriber`, `ReindexService`.

---

## 1. PBT — Property-Based Test Cases (4)

### PBT-01 — Idempotency: N connect events ≡ 1 connect event

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Technique** | PBT (fast-check) + real DB |
| **Maps** | BR-03, UC-03, TC-05 |
| **Precondition** | Real temp DB; fake embedding; fake client manager returning a fixed tool set for server `S`. |
| **Generators** | `serverName ∈ arb.string`, `tools ∈ arb.array(toolDef, 0..30)`, `n ∈ arb.integer(1..10)`. |
| **Steps** | 1. Seed the client manager with `tools` for `S` (all `category = S`). 2. Apply `n` `connected` events for `S` (awaiting each re-index). 3. Query `SELECT * FROM mcp_tools WHERE server = S`. |
| **Expected** | Final row set is identical regardless of `n`: row count = `tools.length`, one row per unique tool name, no duplicates. Equals the state after a single connect. |
| **Oracle** | `rowsAfter(n) === rowsAfter(1)` for all generated `n`. |

### PBT-02 — Scope isolation across arbitrary event interleavings

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Technique** | PBT + real DB |
| **Maps** | BR-05, TC-06 |
| **Precondition** | Seed rows for servers `{A, B, C}` and one core tool with `server IS NULL`. |
| **Generators** | Random sequence of `(server, newState ∈ {connected, disconnected, failed})` events across `{A,B,C}`. |
| **Steps** | 1. Snapshot each server's rows + the core row. 2. Apply the generated event sequence. 3. For each event on server `X`, assert rows of `Y ≠ X` and the core row are byte-identical before/after. |
| **Expected** | No event on server `X` ever adds/updates/deletes a row whose `server ≠ X`. Core (`server IS NULL`) rows never change. |
| **Oracle** | For every step, `rows(Y).unchanged === true` and `coreRow.unchanged === true`. |

### PBT-03 — Prune convergence to current tool set

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Technique** | PBT + real DB |
| **Maps** | BR-04, BR-08 |
| **Precondition** | Server `S` pre-indexed with an initial tool set. |
| **Generators** | `initial ∈ arb.array(toolDef, 1..20)`, `next ∈ arb.array(toolDef, 1..20)` (overlapping/disjoint names). |
| **Steps** | 1. Connect `S` with `initial`. 2. Change client manager to expose `next`. 3. Fire `connected` for `S`. 4. Read indexed names for `S`. |
| **Expected** | Indexed name set for `S` == set(`next`) exactly: names in `next` present, names only in `initial` pruned, no duplicates. |
| **Oracle** | `set(indexed(S)) === set(next.map(name))`. |

### PBT-04 — Injection-safety of tool names (F-06)

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Technique** | PBT + real DB |
| **Maps** | F-06, BR-05 |
| **Precondition** | Real temp DB. |
| **Generators** | `toolName ∈ arb.string` including adversarial samples: `x'); DROP TABLE mcp_tools;--`, `a" OR "1"="1`, names with quotes/newlines/`%`/`_`. |
| **Steps** | 1. Connect server `S` with tools whose names are generated (incl. adversarial). 2. Re-index. 3. Assert each name stored verbatim as data. 4. Fire a prune with a changed set; 5. Assert `mcp_tools` table still exists and only intended rows affected. |
| **Expected** | Adversarial names are stored/pruned as literal data; no SQL executed from names; table intact; row counts correct. |
| **Oracle** | `SELECT name FROM mcp_tools WHERE server=S` returns exact generated strings; `sqlite_master` still lists `mcp_tools`. |

---

## 2. UT — Unit Test Cases (32)

### 2.1 ReindexActionMapper (5)

| ID | Precondition | Steps | Expected | Maps |
|----|--------------|-------|----------|------|
| UT-01 | Mapper instance | `fromState('connected')` | returns `'ingest'` | IR-2, BR-01 |
| UT-02 | Mapper instance | `fromState('disconnected')` | returns `'remove'` | IR-2, BR-02 |
| UT-03 | Mapper instance | `fromState('failed')` | returns `'remove'` | IR-2, BR-02, TC-04 |
| UT-04 | Mapper instance | `fromState('unhealthy')` | returns `'noop'` | IR-2, BR-10 |
| UT-05 | Mapper instance | `fromState('reconnecting')` | returns `'noop'` | IR-2, BR-10 |

### 2.2 PerServerTaskQueue (5)

| ID | Precondition | Steps | Expected | Maps |
|----|--------------|-------|----------|------|
| UT-06 | Queue; server `A` | Enqueue 3 async tasks for `A` recording start/end order | Tasks run strictly sequentially (no overlap): order `t1→t2→t3` | IR-7, BR-05 |
| UT-07 | Queue; servers `A`,`B` | Enqueue a slow task for `A` and a task for `B` | `B`'s task is not blocked by `A`'s (runs concurrently) | IR-7, BR-09 |
| UT-08 | Fake timers; server `A` | Emit 5 events for `A` within 250 ms; advance timers | Exactly one task executes (debounce coalesced) | IR-7, BR-07 |
| UT-09 | Queue; server `A` | Enqueue a task that throws, then another | First rejection caught + logged; second task still runs; chain not broken | IR-9, BR-06 |
| UT-10 | Fake timers | Emit connect then disconnect for `A` within window | Only the latest event's task runs after debounce | IR-7, BR-07 |

### 2.3 McpToolsRepository (9)

| ID | Precondition | Steps | Expected | Maps |
|----|--------------|-------|----------|------|
| UT-11 | Real temp DB, empty | `upsertScoped([t1,t2], 'S')` | 2 rows inserted with `server='S'`, `category='S'`, vectors set | IR-5, BR-01 |
| UT-12 | Row for `t1`/`S` exists | `upsertScoped([t1'], 'S')` (changed desc) | Row updated in place, no duplicate; count stays 1 | IR-5, BR-03 |
| UT-13 | `S` has `[t1,t2,t3]` | `pruneRemoved('S', ['t1','t2'])` | `t3` deleted; `t1`,`t2` remain | IR-5, BR-04 |
| UT-14 | `S` has `[t1,t2]` | `pruneRemoved('S', [])` (empty current set) | Prune skipped; both rows remain (no wipe); warn logged | BR-04, BR-06 |
| UT-15 | Rows for `S` and `T` | `deleteByServer('S')` | Only `S` rows deleted; `T` rows and core (`NULL`) untouched | IR-5, BR-05, BR-02 |
| UT-16 | No rows for `S` | `deleteByServer('S')` | Returns `changes = 0`; no error | BR-06, UC-02 AF-2 |
| UT-17 | `S` has >900 tools | `pruneRemoved('S', names[>900])` | Uses temp-table anti-join fallback; no bound-variable error; correct prune | F-04 |
| UT-18 | Row for `t1` owned by `A` | `upsertScoped([t1], 'B')` | Probe is scope-aware: `A`'s row NOT overwritten; collision warning logged; `B` skips `t1` | F-01, BR-05 |
| UT-19 | Repository | Inspect generated prune SQL text for N names | Placeholder list is only `?,?,...` (N `?`); no quotes/values interpolated | F-06 |

### 2.4 ReindexSubscriber (8)

| ID | Precondition | Steps | Expected | Maps |
|----|--------------|-------|----------|------|
| UT-20 | Fake event source | `start()` then `stop()` | `start` calls `onServerStateChange` and retains Unsubscribe; `stop` invokes it (no leaks) | IR-1 |
| UT-21 | Subscriber started | Emit `connected` for `S` | Enqueues an `ingest` task for `S` | IR-2, BR-01 |
| UT-22 | Subscriber started | Emit `disconnected` for `S` | Enqueues a `remove` task for `S` | IR-2, BR-02 |
| UT-23 | Subscriber started | Emit `unhealthy` and `reconnecting` | No task enqueued (no-op) | BR-10 |
| UT-24 | `memory` module status = not `ready` | Emit `connected` for `S` | Handler skips + logs "memory not ready"; retries next event; no throw | IR-8, BR-06 |
| UT-25 | Client manager reports `S` NOT connected | Emit stale `connected` for `S` | Latest-state guard skips re-index (no write) | IR-7, BR-05 |
| UT-26 | Force re-index elapsed > 5000 ms (fake clock) | Emit `connected` for `S` | Warn log "re-index exceeded target" emitted; tools still indexed | UC-04 EF-1 |
| UT-27 | Handler forced to throw with error containing path/stack + multiline | Emit event | Logged error is bounded (≤500 chars), message-only, allowlisted fields `{server, phase, err}`; raw `event.error` not dumped verbatim | F-03, BR-06, BR-11 |

### 2.5 ReindexService (5)

| ID | Precondition | Steps | Expected | Maps |
|----|--------------|-------|----------|------|
| UT-28 | Client manager has tools for `S` and `T` mixed | `reindexConnected('S')` | Only tools with `category === 'S'` selected for upsert | IR-3, BR-01 |
| UT-29 | Client manager returns empty set for `S` | `reindexConnected('S')` | No-op: no delete/prune; warn "no proxied tools on connect" | BR-06, §12.1.3 |
| UT-30 | Fake embedding throws for `t2` only | `reindexConnected('S')` with `[t1,t2,t3]` | `t2` skipped + logged; `t1`,`t3` upserted; no throw | IR-4, BR-06, UC-01 EF-3 |
| UT-31 | Guard: `S` disconnected at task start | `reindexConnected('S')` | Skips (latest-state guard) — no write | IR-7, BR-05 |
| UT-32 | Repository write throws | `reindexConnected('S')` | Error caught + logged "write failed; retry next event"; prior rows intact | IR-9, BR-06, UC-01 EF-2 |

---

## 3. IT — Integration Test Cases (13)

Real better-sqlite3 (`makeTempDb`) + fake event source + fake embedding. Assert against actual `mcp_tools` rows.

### IT-01 — Late connect makes tools discoverable (≤5 s)

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Maps** | TC-01, UC-01, BR-01, IR-4 |
| **Precondition** | DB seeded so `atlassian` has no rows (disconnected at startup). Fake client manager exposes 72 `atlassian` tools once "connected". Subscriber started. |
| **Steps** | 1. Record `t0`. 2. Emit `ServerStateChangeEvent{serverName:'atlassian', newState:'connected'}`. 3. Await re-index settle. 4. Query `mcp_tools WHERE server='atlassian'`. 5. Record elapsed. |
| **Expected** | atlassian tools present (incl. `jira_create_issue`) with valid `schema_json` and vector; elapsed ≤ 5000 ms; add-count logged (BR-11). No restart. |

### IT-02 — Previously indexed tools survive a late connect

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Maps** | TC-02, UC-01 |
| **Precondition** | `markdown-exporter` tools already indexed at startup. |
| **Steps** | 1. Emit `connected` for `atlassian`. 2. After settle, query all rows. |
| **Expected** | `markdown-exporter` rows remain intact and discoverable; atlassian rows added alongside. No loss/regression. |

### IT-03 — Disconnect removes only that server's rows

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Maps** | TC-03, UC-02, BR-02, BR-05 |
| **Precondition** | `atlassian` + `markdown-exporter` indexed. |
| **Steps** | 1. Emit `disconnected` for `atlassian`. 2. After settle, query rows. |
| **Expected** | Zero `atlassian` rows; `markdown-exporter` rows unaffected; removed-count logged (BR-11). |

### IT-04 — `failed` state removes tools

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Maps** | TC-04, UC-02 AF-1 |
| **Precondition** | `atlassian` indexed. |
| **Steps** | 1. Emit `failed` for `atlassian` (max retries exhausted). 2. After settle, query rows. |
| **Expected** | `atlassian` rows removed (same as disconnect path). |

### IT-05 — Idempotent repeated connects

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Maps** | TC-05, BR-03 |
| **Precondition** | `atlassian` exposes a fixed tool set. |
| **Steps** | 1. Emit `connected` for `atlassian` 5 times (with settle between, bypassing/serializing debounce). 2. Query row count. |
| **Expected** | Row count == unique tool count; no duplicates; stable across repeats. |

### IT-06 — Scoped operations (other servers + core untouched)

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Maps** | TC-06, BR-05 |
| **Precondition** | Rows for `atlassian`, `markdown-exporter`, and core tools (`server IS NULL`). |
| **Steps** | 1. Snapshot `markdown-exporter` + core rows. 2. Emit connect then disconnect for `atlassian`. 3. Compare snapshots. |
| **Expected** | `markdown-exporter` and core rows byte-identical before/after; only `atlassian` rows changed. |

### IT-07 — Non-blocking read during refresh

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Maps** | TC-07, BR-09 |
| **Precondition** | Slow fake embedding (adds latency) so re-index is in flight. |
| **Steps** | 1. Emit `connected` for `atlassian`. 2. While re-index in flight, issue a `find_tools`-equivalent `SELECT * FROM mcp_tools` read. 3. Measure read latency. |
| **Expected** | Read returns current index promptly (not blocked by the async refresh); new tools appear after settle. |

### IT-08 — Fail-soft on embedding/fetch error

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Maps** | TC-08, BR-06 |
| **Precondition** | `atlassian` previously indexed; fake embedding forced to throw for this connect. |
| **Steps** | 1. Emit `connected` for `atlassian`. 2. Observe logs + rows. 3. Emit a later valid `connected`. |
| **Expected** | Error logged with server name; prior `atlassian` rows unchanged (no wipe); later event processes successfully (subscriber still alive). |

### IT-09 — Convergence after connect/disconnect cycles

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Maps** | TC-09, BR-08 |
| **Precondition** | `atlassian` tool set fixed. |
| **Steps** | 1. Emit connect→disconnect→connect→disconnect→connect for `atlassian` (serialized). 2. After final settle, query rows and compare to "connected" tool count. |
| **Expected** | Final `mcp_tools` count for `atlassian` == its connected tool count; no stale, no missing, no duplicates. |

### IT-10 — Prune tools removed upstream on reconnect

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Maps** | BR-04, UC-01 AF-3 |
| **Precondition** | `atlassian` indexed with `[t1..t5]`. |
| **Steps** | 1. Change client manager to expose `[t1,t2,t6]` for `atlassian`. 2. Emit `connected`. 3. Query rows. |
| **Expected** | Index for `atlassian` == `{t1,t2,t6}`: `t3,t4,t5` pruned, `t6` added, no duplicates. |

### IT-11 — Migration adds `server` column + idempotent index

| Field | Value |
|-------|-------|
| **ID** | IT-11 |
| **Maps** | IR-6, F-02 |
| **Precondition** | Temp DB created with a pre-migration `mcp_tools` (no `server` column). |
| **Steps** | 1. Run the migration (PRAGMA `table_info` probe + `ADD COLUMN` + `CREATE INDEX IF NOT EXISTS`). 2. Re-run the migration a second time. 3. Inspect schema. |
| **Expected** | `server` column present (nullable); `idx_mcp_tools_server` exists; second run is a safe no-op (no error, no swallow-all catch masking a real failure). Existing rows keep `server = NULL`. |

### IT-12 — Cross-server name collision not silently hijacked (F-01)

| Field | Value |
|-------|-------|
| **ID** | IT-12 |
| **Maps** | F-01, BR-05 |
| **Precondition** | Server `A` indexed with tool `common_tool` (`server='A'`). |
| **Steps** | 1. Server `B` exposes a tool also named `common_tool`. 2. Emit `connected` for `B`. 3. Query the `common_tool` row + logs. |
| **Expected** | `A`'s `common_tool` row is NOT overwritten to `server='B'`; a collision warning is logged ("tool name already owned by another server"); `B` does not hijack the row. |

### IT-13 — Subscription lifecycle (initialize/shutdown)

| Field | Value |
|-------|-------|
| **ID** | IT-13 |
| **Maps** | IR-1 |
| **Precondition** | `OrchestrationModule` with fake client manager + registry (memory ready). |
| **Steps** | 1. `initialize()`. 2. Emit `connected` for `S` → assert re-index occurs. 3. `shutdown()`. 4. Emit another `connected` for `S`. |
| **Expected** | After `initialize()`, events are processed; after `shutdown()` the Unsubscribe is called and post-shutdown events cause no DB writes. |

---

## 4. E2E-API — Test Cases (4)

In-process MCP client via `connectMcp(registry)`; real `OrchestrationModule` + real temp DB + fake client manager/event source.

### API-01 — find_tools discovers late-connected server's tools

| Field | Value |
|-------|-------|
| **ID** | API-01 |
| **Maps** | TC-01, UC-01, BR-01, IR-10 |
| **Precondition** | Backend up via harness; `atlassian` initially absent from index. |
| **Steps** | 1. `client.callTool('find_tools', {query:'jira create issue'})` → assert empty/no atlassian tool. 2. Emit `connected` for `atlassian`; await settle. 3. Call `find_tools('jira create issue')` again. |
| **Expected** | Step 3 returns `jira_create_issue` (and related) with valid, executable schemas usable by `execute_dynamic_tool`; discovery happens only via `find_tools` (no flat root exposure). |

### API-02 — find_tools stops returning disconnected server's tools

| Field | Value |
|-------|-------|
| **ID** | API-02 |
| **Maps** | TC-03, UC-02, BR-02 |
| **Precondition** | `atlassian` + another server discoverable. |
| **Steps** | 1. Confirm `find_tools('jira create issue')` returns atlassian tools. 2. Emit `disconnected` for `atlassian`; await settle. 3. Call `find_tools` again. |
| **Expected** | No atlassian tools returned; the other server's tools still discoverable. |

### API-03 — execute_dynamic_tool succeeds during re-index (non-blocking)

| Field | Value |
|-------|-------|
| **ID** | API-03 |
| **Maps** | TC-07, UC-04, BR-09 |
| **Precondition** | A known tool (e.g. `mem_admin`) is executable; slow embedding makes a re-index in flight. |
| **Steps** | 1. Emit `connected` for `atlassian` (starts slow re-index). 2. Concurrently call `execute_dynamic_tool` for the known tool. |
| **Expected** | `execute_dynamic_tool` returns success without waiting for the re-index; call not blocked. |

### API-04 — orchestration_status converges with mcp_tools count

| Field | Value |
|-------|-------|
| **ID** | API-04 |
| **Maps** | BR-08, UC-03 |
| **Precondition** | Harness up; `atlassian` connected with known tool count. |
| **Steps** | 1. Emit `connected` for `atlassian`; await settle. 2. Call `orchestration_status`. 3. Compare its atlassian `toolCount` with `SELECT COUNT(*) FROM mcp_tools WHERE server='atlassian'`. |
| **Expected** | Counts match after events settle (converged; no stale, no missing). |

---

## 5. Test Data Reference

| File | Purpose | Used by |
|------|---------|---------|
| `test-data-tools.csv` | Tool fixtures per server (name, description, schema, server, category) | IT-01..IT-12, API-01..04, UT-11..19, UT-28..32 |
| `test-data-events.csv` | State-change event sequences (server, previousState, newState, expectedAction) | IT-01..IT-13, UT-01..05, UT-21..26 |

---

## 6. Summary

| Level | Cases | IDs |
|-------|-------|-----|
| PBT | 4 | PBT-01..04 |
| UT | 32 | UT-01..32 |
| IT | 13 | IT-01..13 |
| E2E-API | 4 | API-01..04 |
| E2E-UI | 0 | N/A (no UI) |
| SIT | 0 | N/A (no external integration) |
| **Total** | **53** | — |

All UC-01..04, BR-01..11, TC-01..09, IR-1..10, and testable security findings (F-01, F-03, F-04, F-06) are traced to ≥1 test case (RTM in STP §4 = 100%).
