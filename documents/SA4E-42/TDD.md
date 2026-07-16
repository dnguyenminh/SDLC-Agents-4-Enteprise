# Technical Design Document (TDD)

## SDLC Agents for Enterprise (SA4E) — SA4E-42: find_tools does not re-index when child MCP server connects late

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-42 |
| Title | find_tools does not re-index when child MCP server connects late |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-02-14 |
| Status | Draft — for Security Design Review (Phase 3.7) |
| Related BRD | BRD-v1-SA4E-42.docx |
| Related FSD | FSD-v1-SA4E-42.docx (§12 Technical Appendix, IR-1..IR-10) |
| Issue Type | Bug |
| Component | MCP orchestration backend (Node.js / Hono / better-sqlite3) |
| Architecture Pattern | ai-agent |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-14 | SA Agent | Initial TDD from FSD (UC-01..UC-04, BR-01..BR-11) and FSD §12 (IR-1..IR-10). New `reindex/` package design, migration DDL, scoped SQL, concurrency model, error handling, security, implementation checklist. |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies the technical design for fixing SA4E-42: the `find_tools` semantic index (`mcp_tools`) goes stale when a child MCP server connects after backend startup (or disconnects at runtime), because the index is populated only once during bootstrap in `backend/src/index.ts`. The design introduces an event-driven **Re-index Subscriber** that reacts to `ServerStateChangeEvent`s (SA4E-37) and applies strictly server-scoped, idempotent, non-blocking, fail-soft add/remove operations to `mcp_tools`.

### 1.2 Scope

In scope (per FSD §1.2 + §12): a new `reindex/` package inside the orchestration module; subscription lifecycle wiring in `OrchestrationModule.initialize()`/`shutdown()`; an additive `server` column + index on `mcp_tools`; scoped upsert/prune/delete SQL; per-server concurrency control; and setting the `server` column at startup ingest.

Out of scope: the embedding model/ranking algorithm, the `execute_dynamic_tool` routing path, the SA4E-37 health/auto-reconnect mechanism itself (only consumed), and exposing proxied tools flatly at root (IR-10).

### 1.3 Design Grounding (verified against code)

| Source file | Fact used |
|-------------|-----------|
| `backend/src/index.ts` | Startup `ingestTools` transaction; embedding text `"Tool: {name}\nDescription: {description}"`; `Buffer.from(new Float32Array(vector).buffer)`; upsert by unique `name`. |
| `modules/orchestration/OrchestrationModule.ts` | `initialize()` calls `clientManager.initializeAll()` then `startHealthMonitor()`; `shutdown()` calls `stopHealthMonitor()` then `shutdownAll()`; holds `registry` + `clientManager`; `find_tools` reads `SELECT * FROM mcp_tools`. |
| `modules/orchestration/McpClientManager.ts` | `onServerStateChange(cb): Unsubscribe`; `getProxiedTools()` (each proxied tool has `category = serverName`); `isServerConnected(name)`; `registerServerTools` sets `category: name`; reconnect registers tools **before** the `connected` transition. |
| `modules/orchestration/types/health.ts` | `ServerStateChangeEvent` shape; `ConnectionState`; `VALID_TRANSITIONS` (a `connected` server reaches `failed` only via `reconnecting`). |
| `engine/db/schema.ts` | `mcp_tools(id, name UNIQUE, description, schema_json, category, vector)`; SA4E-41 `project_id` additive-migration precedent. |

---

## 2. Architecture Overview

### 2.1 Position of the Re-index Subscriber

The backend is a single-threaded Node.js process. `OrchestrationModule` owns `McpClientManager` (event source + tool source) and a reference to `ModuleRegistry` (to resolve the `memory` module's SQLite handle). The new **Re-index Subscriber** is a runtime collaborator owned by `OrchestrationModule`; it is created and subscribed in `initialize()` (after `initializeAll()` + `startHealthMonitor()`) and torn down in `shutdown()`.

Event → re-index flow:

1. `ConnectionStateTracker` (SA4E-37) emits a `ServerStateChangeEvent`.
2. `ReindexSubscriber.onEvent` routes by `newState` (mapper: `connected`→ingest, `disconnected`/`failed`→remove, else no-op — BR-10).
3. The event is debounced (250 ms) then enqueued on a **per-server** promise chain (`PerServerTaskQueue`) so tasks for one server run strictly sequentially while different servers run concurrently (BR-05/BR-07).
4. When the task runs, `ReindexService` applies a latest-state guard against live `clientManager` state, generates embeddings (connect path), and persists changes via `McpToolsRepository` inside a single `db.transaction` (BR-03/04/05).
5. `find_tools` continues reading `SELECT * FROM mcp_tools` on the request path, unaffected (BR-09).

![Architecture Overview](diagrams/architecture.png)

### 2.2 Why subscribe in `OrchestrationModule.initialize()` (not `index.ts`)

Grounded in FSD §12.1.3: `OrchestrationModule` already owns both collaborators; registering **after** `initializeAll()` means the startup connect-burst is handled solely by the one-shot `index.ts` ingest, and the subscriber handles only *runtime* transitions (late connect, auto-reconnect, disconnect, failed). This preserves BR-03 idempotency by construction and avoids a double-ingest race. The `memory` DB is resolved **lazily at event time** (never captured at registration) because modules initialize in parallel.

### 2.3 Design principles applied

- **SOLID / SRP** — one class per responsibility: routing (`ReindexSubscriber`), concurrency (`PerServerTaskQueue`), orchestration (`ReindexService`), persistence (`McpToolsRepository`), mapping (`ReindexActionMapper`). Data classes live in `models/`.
- **Observer pattern** — `ReindexSubscriber` subscribes to the `onServerStateChange` observable and reacts to events.
- **Dependency Inversion** — `ReindexService` depends on a `DbProvider` callback (lazy `() => Database`) and an `IEmbeddingService` abstraction, not concretions, so it is unit-testable with fakes.
- **Code-standards size limits** — every file ≤200 lines, every function ≤20 lines (achieved by the multi-class split).

---

## 3. API / Data Design

### 3.1 No external API change

No new MCP tool, HTTP route, or public interface is added. `find_tools` / `execute_dynamic_tool` schemas are unchanged (IR-10). `find_tools` uses `SELECT *` and ignores unknown columns, so the new `server` column requires no read-path change.

### 3.2 Data model change — additive migration on `mcp_tools`

Follows the SA4E-41 `project_id` additive precedent already in `schema.ts`.

**Base DDL (update in `schema.ts` so fresh installs include the column):**

```sql
CREATE TABLE IF NOT EXISTS mcp_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  category TEXT,
  server TEXT,          -- SA4E-42: explicit owning child-server (NULL = local/core tool)
  vector BLOB
);
```

**Idempotent migration (for existing databases):**

```sql
ALTER TABLE mcp_tools ADD COLUMN server TEXT;              -- NULL for local/core tools
CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server);
```

The `ALTER TABLE` must be guarded (SQLite has no `ADD COLUMN IF NOT EXISTS`): probe `PRAGMA table_info(mcp_tools)` for a `server` column and only add it when absent, mirroring how existing additive migrations run in the engine. The `CREATE INDEX IF NOT EXISTS` is naturally idempotent.

| Column | Type | Nullable | Purpose | Rule |
|--------|------|----------|---------|------|
| `server` | TEXT | Y | Owning child-server name for proxied tools; `NULL` for local/core tools. Explicit scoping key for scoped upsert/delete. | BR-05 |

**Why a dedicated `server` column (not reuse `category`)** — FSD §12.3: `category` is semantically overloaded (functional class for core tools, server name for proxied tools). A dedicated `server` column makes `DELETE ... WHERE server = ?` unable to match a core tool (whose `server` is `NULL`), so BR-05 becomes safe by construction rather than depending on an unenforced naming assumption. `idx_mcp_tools_server` makes scoped delete/prune index-backed.

### 3.3 Scoped SQL contract (bound params, no string interpolation)

**Scoped upsert on `connected` (idempotent, keyed by unique `name` — BR-03):**

```sql
SELECT id FROM mcp_tools WHERE name = @name;              -- probe per tool

INSERT INTO mcp_tools (name, description, schema_json, category, server, vector)
VALUES (@name, @description, @schema_json, @category, @server, @vector);   -- when absent

UPDATE mcp_tools
   SET description = @description, schema_json = @schema_json,
       category = @category, server = @server, vector = @vector
 WHERE id = @id;                                          -- when present
```

`@category = @server = serverName`; `@vector = Buffer.from(new Float32Array(await embed(text)).buffer)`, `text = "Tool: {name}\nDescription: {description}"` (identical to `index.ts`).

**Prune tools removed upstream (BR-04), after upserting the current set:**

```sql
DELETE FROM mcp_tools
 WHERE server = @server
   AND name NOT IN (/* @name_1, @name_2, ... generated placeholders */);
```

Edge case: if the server exposes **zero** tools on a `connected` event, **skip the prune** (empty `NOT IN` is unsafe) and log per BR-06 — never wipe the server's rows.

**Scoped delete on `disconnected` / `failed` (BR-02, BR-05):**

```sql
DELETE FROM mcp_tools WHERE server = @server;             -- returns changes count for BR-11 log
```

**Atomicity (FSD §12.2.4):** the full per-server operation (all upserts + prune, or the single delete) runs in one synchronous `better-sqlite3` `db.transaction(...)`. Embedding generation is async and MUST complete **before** the transaction opens (transactions must not `await`).

---

## 4. Class / Module Design

### 4.1 New package layout

```
backend/src/modules/orchestration/reindex/
├── ReindexSubscriber.ts        # Observer: subscribe/route/debounce/enqueue  (≤200 lines)
├── PerServerTaskQueue.ts       # async mutex (promise chain) + debounce      (≤200 lines)
├── ReindexService.ts           # connect/remove orchestration + latest-state guard
├── McpToolsRepository.ts       # scoped SQL over mcp_tools (transactions)
├── ReindexActionMapper.ts      # newState → ReindexAction (Strategy selector)
└── models/
    ├── PreparedTool.ts         # { name, description, schemaJson, category, server, vector }
    ├── ReindexResult.ts        # { server, upserted, removed, elapsedMs }
    └── ReindexAction.ts        # 'ingest' | 'remove' | 'noop'
```

![Component / Class Design](diagrams/component.png)

### 4.2 Responsibilities

| Class | Responsibility | Key methods | Pattern |
|-------|---------------|-------------|---------|
| `ReindexSubscriber` | Subscribe to `onServerStateChange`; map + debounce + enqueue; own the `Unsubscribe` handle. | `start()`, `stop()`, `onEvent(e)` | Observer |
| `PerServerTaskQueue` | Serialize tasks per server (promise chain); debounce/coalesce rapid events (250 ms). | `enqueue(server, task, debounceMs)` | Async mutex |
| `ReindexService` | Per-event work: latest-state guard, fetch scoped tools, embed, invoke repository; measure latency; fail-soft logging. | `reindexConnected(server)`, `reindexRemoved(server)` | Facade over repo+embed |
| `McpToolsRepository` | Scoped SQL only, all via `db.transaction`, bound params. | `upsertScoped(items, server)`, `pruneRemoved(server, names)`, `deleteByServer(server)` | Repository |
| `ReindexActionMapper` | Pure map `newState → ReindexAction`. | `fromState(newState)` | Strategy selector |

### 4.3 Runtime sequence (connect path)

`ServerStateChangeEvent(connected)` → `ReindexSubscriber.onEvent` (mapper → `ingest`, debounce) → `PerServerTaskQueue.enqueue` → `ReindexService.reindexConnected`: guard `isServerConnected` → `getProxiedTools().filter(t => t.category === server)` (defensive no-op if empty) → embed each tool (skip-on-fail) → `McpToolsRepository.upsertScoped` + `pruneRemoved` in one transaction → log counts; warn if elapsed > 5 s. The disconnect/failed path skips fetch+embed and calls `deleteByServer(server)` only. (Detailed sequence for the connect/disconnect flows: see FSD diagrams `sequence-late-connect.png` / `sequence-disconnect.png`.)

### 4.4 Files to CREATE

| # | File | Purpose |
|---|------|---------|
| 1 | `reindex/ReindexSubscriber.ts` | Observer subscription, routing, debounce, enqueue. |
| 2 | `reindex/PerServerTaskQueue.ts` | Per-server serialized queue + debounce. |
| 3 | `reindex/ReindexService.ts` | Connect/remove orchestration + latest-state guard + latency log. |
| 4 | `reindex/McpToolsRepository.ts` | Scoped upsert/prune/delete SQL in transactions. |
| 5 | `reindex/ReindexActionMapper.ts` | `newState → ReindexAction` mapping. |
| 6 | `reindex/models/PreparedTool.ts` | Prepared-tool DTO. |
| 7 | `reindex/models/ReindexResult.ts` | Result/metrics DTO. |
| 8 | `reindex/models/ReindexAction.ts` | Action union type. |
| 9 | Unit/integration tests under `backend/test/...` (QA/DEV phase) | Cover UC-01..UC-04, BR-01..BR-11. |

### 4.5 Files to MODIFY

| # | File | Change |
|---|------|--------|
| 1 | `engine/db/schema.ts` | Add `server TEXT` to base `mcp_tools` DDL; add `idx_mcp_tools_server`; add guarded `ALTER TABLE` migration for existing DBs. |
| 2 | `modules/orchestration/OrchestrationModule.ts` | In `initialize()` (after `startHealthMonitor()`): construct `ReindexSubscriber(clientManager, registry, logger)` and call `start()`. In `shutdown()` (before `shutdownAll()`): call `reindexSubscriber.stop()`. Store as private field. |
| 3 | `backend/src/index.ts` | In startup `ingestTools`, set `server = tool.category` for proxied tools and `server = NULL` for local `registry.getAllToolDefinitions()` tools; extend INSERT/UPDATE column lists to include `server`. |

---

## 5. Concurrency Design

| Mechanism | Rule | Rule refs |
|-----------|------|-----------|
| Per-server serialization | `Map<serverName, Promise>` chain; each event appends its task; different servers run concurrently (disjoint scopes). | BR-05, BR-07 |
| Debounce / coalesce | 250 ms window per server collapses connect/disconnect flapping to one refresh for the latest state. | BR-07 |
| Latest-state guard | At task start, re-check `clientManager.isServerConnected(server)`; if it no longer matches the event, skip (a newer event's task reconciles). | BR-05 |
| Atomic write | Upsert+prune (or delete) in one `db.transaction`; embeddings generated before the transaction. | BR-03/04 |
| Fail-soft isolation | A throw in one task is caught, logged with `{server, phase}`, and never rejects the shared callback or blocks other servers' chains. | BR-06 |

Rationale: better-sqlite3 statements/transactions are synchronous and cannot interleave; the real hazard is `await` interleaving (embedding, tool reads) between handlers for the same server. The per-server mutex + guard eliminate out-of-order writes.

---

## 6. Error Handling

Aligned with code-standards ("no swallowed exceptions; always surface"). Here the "user" is the platform operator via structured logs; every catch logs with `serverName` + phase and continues (fail-soft per BR-06).

| Phase / scenario | Severity | Log signal | Behavior | Rule / FSD |
|------------------|----------|-----------|----------|-----------|
| `memory` module not `ready` at event time | Warn | `memory not ready; skip, will retry next event` | Skip; retry on next event | IR-8, BR-06 |
| Proxied tool set empty on `connected` | Warn | `no proxied tools on connect; no-op` | No-op; do not prune/delete | §12.1.3, BR-06 |
| Embedding fails for a tool | Info/Warn | `embedding failed for {tool} ({server}); skip tool` | Skip tool, continue others | UC-01 EF-3, BR-06 |
| Upsert/prune write fails | Warn | `re-index write failed for {server}; retry next event` | Prior state unchanged; other servers untouched | UC-01 EF-2, BR-05/06 |
| Scoped delete fails | Warn | `re-index remove failed for {server}; retry next event` | Retry next event; never delete other servers | UC-02 EF-1, BR-05/06 |
| Callback/task throws | Warn | `state-change handler error for {server}` | Chain `.catch`; subscriber keeps processing | UC-03 EF-1, BR-06 |
| Refresh exceeds 5 s target | Info | `re-index for {server} took {ms}ms (> target)` | Tools still become discoverable | UC-04 EF-1, NFR |
| Success (add/update or remove) | Info | `re-index add/update done` / `re-index remove done` with counts | Observability | BR-11 |

No `catch` block is empty; each either logs-and-continues (fail-soft event loop) or the transaction rolls back leaving prior state intact.

---

## 7. Security Design

This is an internal, backend-only event/index feature with no new external interface, no new authN/authZ surface, and no user PII (FSD §7).

| Area | Design decision |
|------|-----------------|
| Attack surface | No new MCP tool, HTTP route, or socket. Trigger is an internal, in-process event from SA4E-37. No change to `find_tools`/`execute_dynamic_tool` contracts (IR-10). |
| SQL injection | All statements are `better-sqlite3` prepared statements with bound parameters; the prune's `NOT IN` uses generated positional placeholders bound to tool-name values — no string interpolation of any server- or tool-derived value. |
| Data sensitivity | Only tool metadata (name/description/schema) and derived embedding vectors — classified Internal (FSD §7.2). No secrets read or logged. |
| Log hygiene | Logs contain `serverName`, phase, counts, and error messages only; no tool arguments, credentials, or transport secrets. Server names come from operator-authored `orchestration.json`. |
| Scope isolation (integrity) | The dedicated `server` column guarantees scoped delete/prune cannot affect other servers' or core tools' rows (BR-05) — prevents an accidental or event-triggered mass-delete of the discovery index. |
| Denial-of-service resilience | Debounce + per-server serialization bound the work triggered by connect/disconnect flapping to one refresh per settled state (BR-07), preventing an event storm from saturating the event loop or the embedding service. |
| Availability / fail-closed for reads | Failures leave the prior index state intact (no partial wipe); `find_tools` degrades gracefully to the last-known-good index rather than erroring. |
| Dependencies | No new runtime dependencies introduced; reuses existing `better-sqlite3`, `EmbeddingService` (ONNX), and `pino`. |

Open items for the Security Design Review (Phase 3.7): confirm log-field allowlist (no accidental inclusion of `event.error` payloads that could carry child-server stack traces), and confirm the guarded `ALTER TABLE` migration runs under the same file permissions as the existing schema bootstrap.

---

## 8. Non-Functional Design Targets

| NFR (FSD §8) | Design mechanism |
|--------------|------------------|
| Re-index latency ≤ 5 s after `connected` | Async off-request-path work; embeddings batched before a short synchronous transaction; latency measured and warned if exceeded. |
| No restart | Runtime subscription reacts to live events; no bootstrap dependency. |
| Non-blocking | All work runs on the event loop off the `find_tools`/`execute_dynamic_tool` path; DB write holds the lock only for the brief synchronous transaction (never across `await`). |
| Consistency / convergence | Upsert + prune makes the server's indexed set match its current `tools/list`; scoped delete on disconnect; converges to `orchestration_status` counts (BR-08). |
| Idempotency | Upsert keyed by unique `name`; subscriber handles only runtime transitions, avoiding startup double-ingest. |
| Observability | Per-server add/update/remove counts logged (BR-11). |

---

## 9. Implementation Checklist (IR-1..IR-10 mapping)

| IR | Requirement | Design element (this TDD) | Status |
|----|-------------|---------------------------|--------|
| IR-1 | Subscribe in `initialize()` after `initializeAll()`+`startHealthMonitor()`; retain `Unsubscribe`; call in `shutdown()`. | §4.5 (OrchestrationModule mods), `ReindexSubscriber.start/stop` (§4.2). | ✅ designed |
| IR-2 | Route by `newState`: connected→ingest, disconnected/failed→remove, else no-op. | `ReindexActionMapper.fromState` (§4.2, §3-BR-10). | ✅ designed |
| IR-3 | Read tools from `getProxiedTools()` filtered by `category === serverName`. | `ReindexService.reindexConnected` (§4.3). | ✅ designed |
| IR-4 | Embeddings via `EmbeddingService.getInstance().generateEmbedding(text)`, `text = "Tool: {name}\nDescription: {description}"`, `Buffer.from(new Float32Array(vector).buffer)`. | §3.3, `ReindexService.prepareTools`. | ✅ designed |
| IR-5 | Scoped upsert + prune (connect) / scoped delete (disconnect/failed) in one `db.transaction`. | §3.3, `McpToolsRepository` (§4.2). | ✅ designed |
| IR-6 | Add `server` column + `idx_mcp_tools_server`; populate at ingest/registration. | §3.2, `schema.ts` + `index.ts` mods (§4.5). | ✅ designed |
| IR-7 | Per-server serialization (async mutex), 250 ms debounce, latest-state guard. | §5, `PerServerTaskQueue` + `ReindexService` guard. | ✅ designed |
| IR-8 | Resolve `memory` DB lazily at event time; skip+log if not ready. | §2.2, `ReindexService` DbProvider (§4.1 DIP). | ✅ designed |
| IR-9 | Fail-soft: catch/log every phase with `serverName`; never reject shared callback; log counts. | §6, `PerServerTaskQueue.catch` + `ReindexService`. | ✅ designed |
| IR-10 | Do not expose proxied tools flatly at root; discovery stays via `find_tools`. | §3.1 (no change to `getToolDefinitions`). | ✅ preserved |

### 9.1 Suggested implementation order (DEV)

1. `schema.ts` migration (server column + index + guarded ALTER).
2. `models/` DTOs.
3. `McpToolsRepository` (scoped SQL + transaction) with unit tests.
4. `PerServerTaskQueue` (mutex + debounce) with unit tests.
5. `ReindexActionMapper`, then `ReindexService` (guard, embed, persist) with unit tests.
6. `ReindexSubscriber` (Observer wiring).
7. Wire into `OrchestrationModule.initialize/shutdown`.
8. Update `index.ts` startup ingest to populate `server`.
9. Integration tests for UC-01..UC-04 (late connect, disconnect, idempotency, scope isolation, non-blocking).

---

## 10. Testing Considerations (design view)

Maps FSD §10 TC-01..TC-09. Key techniques: real `better-sqlite3` DB (no mock) for repository/integration tests; fake `IEmbeddingService` for deterministic vectors; fake event source to drive `onServerStateChange`; timing tests to assert debounce coalescing and non-blocking `find_tools` during a refresh. Scope-isolation tests must assert a connect/disconnect of one server never mutates another server's rows or core (`server IS NULL`) rows.

---

## 11. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component / Class Design | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |

Supporting runtime sequences are provided by the FSD: [sequence-late-connect.png](diagrams/sequence-late-connect.png), [sequence-disconnect.png](diagrams/sequence-disconnect.png), [state-connection.png](diagrams/state-connection.png).

### Traceability

| FSD requirement | TDD section |
|-----------------|-------------|
| UC-01 late connect | §2.1, §3.3, §4.3 |
| UC-02 disconnect removal | §3.3, §4.3 |
| UC-03 event-driven refresh | §2.1, §4.2 |
| UC-04 non-blocking | §5, §8 |
| BR-01..BR-11 | §3, §5, §6 |
| IR-1..IR-10 | §9 |

### Consistency with FSD

No discrepancies were found between the FSD (§12 IR-1..IR-10) and the actual codebase; this TDD implements the FSD design 1:1. See `DISCREPANCY.md` status note (none raised).
