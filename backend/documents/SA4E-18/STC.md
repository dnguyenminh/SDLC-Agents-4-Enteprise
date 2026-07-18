# Software Test Cases (STC)

## Kiro Backend MCP Server — SA4E-18: Tool Visibility Tiers — reduce LLM context by hiding rarely-used tools

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-18 |
| Title | Tool Visibility Tiers — reduce LLM context by hiding rarely-used tools |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-09 |
| Status | Draft |
| Related STP | STP-v1-SA4E-18.docx |
| Related FSD | FSD-v1-SA4E-18.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-09 | QA Agent | Initiate document — auto-generated from FSD use cases, business rules, and TDD §11.2/§11.3 |

---

## Test Level Prefixes

| Prefix | Level | Automation | Tools |
|--------|-------|------------|-------|
| PBT-XX | Property-Based Test | Automated | fast-check + vitest/jest |
| UT-XX | Unit Test | Automated | vitest/jest |
| IT-XX | Integration Test (in-process MCP handler + real SQLite) | Automated | vitest/jest + better-sqlite3 |
| E2E-API-XX | MCP JSON-RPC E2E (running server) | Automated | MCP client / in-process transport |
| E2E-UI-XX | Browser UI E2E | N/A | No UI in this feature |
| SIT-XX | Manual exploratory / operator | Manual | MCP client / terminal |

## Test Case Summary

| Level | ID Range | Count | Automated | Manual |
|-------|----------|-------|-----------|--------|
| Property-Based | PBT-01 to PBT-04 | 4 | 4 | 0 |
| Unit | UT-01 to UT-12 | 12 | 12 | 0 |
| Integration | IT-01 to IT-05 | 5 | 5 | 0 |
| E2E-API | E2E-API-01 to E2E-API-10 | 10 | 10 | 0 |
| E2E-UI | — | 0 | 0 | 0 |
| SIT (manual) | SIT-01 to SIT-03 | 3 | 0 | 3 |
| **Total** | | **34** | **31 (91%)** | **3 (9%)** |

> **Note on E2E-UI:** SA4E-18 is a headless backend/protocol change with no user interface. E2E-UI is Not Applicable; all UI-equivalent behavior is asserted at the E2E-API level. SIT is minimized to human-judgement checks only.

---

## 1. Property-Based Tests (PBT)

### PBT-01: resolveCoreToolNames always includes all META_TOOLS

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Functional (invariant) |
| **Requirement** | BR-03, UC-01 |
| **File** | backend/src/config/__tests__/CoreTools.property.test.ts |
| **Preconditions** | `resolveCoreToolNames` importable; fast-check available. |

**Property:** For any randomly generated array of strings (including empty, garbage, and arbitrary tool names) supplied as the allowlist source, the resolved Set MUST contain every entry in `META_TOOLS` (`find_tools`, `execute_dynamic_tool`, `orchestration_status`).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary `string[]` inputs (fc.array(fc.string()), 1000 runs) | Each run produces a candidate allowlist |
| 2 | Call `resolveCoreToolNames()` (resolver reads CORE_TOOLS; property harness parametrizes input) | Returns a `Set<string>` without throwing |
| 3 | Assert `META_TOOLS.every(m => set.has(m))` | True for every generated input |

**Test Data:** `testdata/resolve-core-scenarios.csv` (rows PBT-01)
**Postconditions:** No state; pure function.

---

### PBT-02: resolveCoreToolNames output is always duplicate-free

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | Medium |
| **Type** | Functional (invariant) |
| **Requirement** | BR-08 |
| **File** | backend/src/config/__tests__/CoreTools.property.test.ts |
| **Preconditions** | `resolveCoreToolNames` importable. |

**Property:** For any input array containing duplicates, the returned `Set` size equals the count of distinct valid names union META_TOOLS (a `Set` inherently de-duplicates).

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arrays with injected duplicates (fc.array of a small name pool) | Candidate lists with repeats |
| 2 | Resolve names | Returns Set |
| 3 | Assert `[...set].length === new Set([...set]).size` | Always true (no duplicates) |

**Test Data:** `testdata/resolve-core-scenarios.csv` (rows PBT-02)
**Postconditions:** None.

---

### PBT-03: resolveCoreToolNames never throws for any input

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Type** | Functional (robustness invariant) |
| **Requirement** | BR-04, BR-05, EF-1 |
| **File** | backend/src/config/__tests__/CoreTools.property.test.ts |
| **Preconditions** | `resolveCoreToolNames` importable. |

**Property:** For any input including empty strings, whitespace, non-string coerced values, and empty arrays, the resolver returns a valid Set and never throws; invalid entries are dropped, META_TOOLS still present.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate mixed arrays incl. "", "   ", valid names (fc.oneof) | Candidate lists |
| 2 | Wrap `resolveCoreToolNames()` in try/catch | Never enters catch |
| 3 | Assert result is a non-empty Set containing META_TOOLS only-or-more | True; invalid entries absent |

**Test Data:** `testdata/resolve-core-scenarios.csv` (rows PBT-03)
**Postconditions:** None.

---

### PBT-04: incrementToolUsage is monotonic — N calls yield call_count == N

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | High |
| **Type** | Functional (invariant) |
| **Requirement** | BR-12, BR-07, UC-03 |
| **File** | backend/src/modules/memory/__tests__/MemoryEngine.property.test.ts |
| **Preconditions** | Fresh temp SQLite DB with `tool_usage` table per run. |

**Property:** For any tool name and any N in [1..200], calling `incrementToolUsage(name)` exactly N times results in `getToolUsage(name)[0].call_count === N`.

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary `(name, N)` (fc.string filtered non-empty, fc.integer 1..200) | Candidate pairs |
| 2 | Open fresh DB, apply schema | Empty `tool_usage` |
| 3 | Call `incrementToolUsage(name)` N times | No throw |
| 4 | Read `getToolUsage(name)` | `call_count === N`; `last_called_at` non-null |

**Test Data:** `testdata/usage-scenarios.csv` (rows PBT-04)
**Postconditions:** Temp DB discarded.

---
## 2. Unit Tests (UT)

### UT-01: resolveCoreToolNames — valid CORE set resolves to exactly 8 names

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-02, UC-01, Story 1 AC-1 |
| **File** | backend/src/config/__tests__/CoreTools.test.ts |
| **Preconditions** | Default `CORE_TOOLS` constant as shipped. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `resolveCoreToolNames()` | Returns a `Set<string>` |
| 2 | Assert set size and members | Exactly 8: mem_search, mem_ingest, mem_ingest_file, code_search, get_curated_context, find_tools, execute_dynamic_tool, orchestration_status |

**Test Data:** `testdata/core-tools-list.csv`
**Postconditions:** None.

---

### UT-02: resolveCoreToolNames — empty CORE_TOOLS falls back to META_TOOLS only

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | BR-03, EF-1 (FSD §3.1) |
| **File** | backend/src/config/__tests__/CoreTools.test.ts |
| **Preconditions** | Resolver invoked with empty/undefined source (spy/override). |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide empty array as CORE_TOOLS source | Resolver runs |
| 2 | Assert result | Set equals exactly META_TOOLS (3 names); no throw |
| 3 | Inspect logger | A warning is logged; startup continues |

**Test Data:** `testdata/resolve-core-scenarios.csv` (UT-02)
**Postconditions:** None.

---

### UT-03: resolveCoreToolNames — duplicate entries de-duplicated

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | BR-08, AF-2 (FSD §3.1) |
| **File** | backend/src/config/__tests__/CoreTools.test.ts |
| **Preconditions** | Source with repeated `mem_search`. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide `["mem_search","mem_search","find_tools"]` | Resolver runs |
| 2 | Assert `mem_search` appears once | Set contains mem_search once |
| 3 | Assert META_TOOLS present | find_tools, execute_dynamic_tool, orchestration_status present |

**Test Data:** `testdata/resolve-core-scenarios.csv` (UT-03)
**Postconditions:** None.

---

### UT-04: resolveCoreToolNames — invalid entries (empty/whitespace/non-string) ignored with warning

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Negative |
| **Requirement** | BR-05, EF-2 (FSD §3.2) |
| **File** | backend/src/config/__tests__/CoreTools.test.ts |
| **Preconditions** | Source with `["", "   ", "mem_search"]`. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide array with empty and whitespace entries | Resolver runs, no throw |
| 2 | Assert invalid entries absent from result | "" and "   " not present |
| 3 | Assert `logger.warn` called with `ignoring invalid entry (BR-05)` | Warning logged per invalid entry |
| 4 | Assert valid entry + META_TOOLS present | mem_search + 3 meta present |

**Test Data:** `testdata/resolve-core-scenarios.csv` (UT-04)
**Postconditions:** None.

---

### UT-05: resolveCoreToolNames — unknown name is kept in set; mcpServer warns at startup

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | BR-04, AF-1 (FSD §3.1), EF-1 (FSD §3.2) |
| **File** | backend/src/config/__tests__/CoreTools.test.ts |
| **Preconditions** | Source with `["mem_search","not_a_real_tool"]`. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve names (resolver does not know registry) | Set includes `not_a_real_tool` (resolver is registry-agnostic) |
| 2 | In mcpServer, compare coreNames vs registered names | `not_a_real_tool` has no registered tool |
| 3 | Assert `logger.warn` `has no registered tool — skipped (BR-04)` | Warning logged; startup succeeds |
| 4 | Assert ListTools result excludes unmatched name | Only registered CORE tools serialized |

**Test Data:** `testdata/resolve-core-scenarios.csv` (UT-05)
**Postconditions:** None.

---

### UT-06: incrementToolUsage — first call inserts row with call_count = 1

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-07, BR-12, AF-1 (FSD §3.3) |
| **File** | backend/src/modules/memory/__tests__/MemoryEngine.test.ts |
| **Preconditions** | Fresh temp DB with empty `tool_usage`. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `incrementToolUsage("mem_search")` once | No throw |
| 2 | `getToolUsage("mem_search")` | 1 row: call_count = 1 |
| 3 | Assert `last_called_at` not null | Timestamp populated |

**Test Data:** `testdata/usage-scenarios.csv` (UT-06)
**Postconditions:** Temp DB discarded.

---

### UT-07: incrementToolUsage — subsequent calls increment existing row (UPSERT)

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-12, BR-07 |
| **File** | backend/src/modules/memory/__tests__/MemoryEngine.test.ts |
| **Preconditions** | Fresh temp DB. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `incrementToolUsage("code_search")` 3 times | No throw |
| 2 | `getToolUsage("code_search")` | Exactly 1 row (no duplicate rows) |
| 3 | Assert call_count = 3 | Counter equals number of calls |

**Test Data:** `testdata/usage-scenarios.csv` (UT-07)
**Postconditions:** Temp DB discarded.

---

### UT-08: getToolUsage — no filter returns rows ordered by call_count DESC

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UC-03 AF-2, TDD §4.3 (read path) |
| **File** | backend/src/modules/memory/__tests__/MemoryEngine.test.ts |
| **Preconditions** | Temp DB seeded: mem_search=5, code_search=2, find_tools=9. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getToolUsage()` (no arg) | Returns all rows |
| 2 | Assert order | find_tools(9), mem_search(5), code_search(2) — descending by call_count |

**Test Data:** `testdata/usage-scenarios.csv` (UT-08)
**Postconditions:** Temp DB discarded.

---

### UT-09: getToolUsage — filter by tool_name returns single matching row

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | TDD §4.3 (read path), OI-1 |
| **File** | backend/src/modules/memory/__tests__/MemoryEngine.test.ts |
| **Preconditions** | Temp DB seeded with multiple tools. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getToolUsage("mem_search")` | Returns 1-element array |
| 2 | Assert row.tool_name === "mem_search" | Correct row |
| 3 | Call `getToolUsage("never_called")` | Returns empty array (no throw) |

**Test Data:** `testdata/usage-scenarios.csv` (UT-09)
**Postconditions:** Temp DB discarded.

---

### UT-10: trackToolUsage — no-op when memory module not ready

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | BR-09, EF-1 (FSD §3.3) |
| **File** | backend/src/server/__tests__/toolUsageTracker.test.ts |
| **Preconditions** | Registry stub returns memory module with `status !== 'ready'`. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `trackToolUsage(registry, logger, "mem_search")` | Returns void, no throw |
| 2 | Assert engine `incrementToolUsage` NOT called | Silently no-ops |
| 3 | Assert no unhandled error | Tool call path unaffected |

**Test Data:** `testdata/usage-scenarios.csv` (UT-10)
**Postconditions:** None.

---

### UT-11: trackToolUsage — DB write throws is swallowed with warn (non-blocking)

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | High |
| **Type** | Negative — Exception Flow |
| **Requirement** | BR-09, EF-1 (FSD §3.3), Story 3 AC-3 |
| **File** | backend/src/server/__tests__/toolUsageTracker.test.ts |
| **Preconditions** | Memory module `ready`; engine.incrementToolUsage stubbed to throw. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `trackToolUsage(...)` | Does NOT throw |
| 2 | Assert `logger.warn` called with `increment failed — non-blocking (BR-09)` + `{err, toolName}` | Warning logged |
| 3 | Assert caller continues normally | Non-blocking guarantee holds |

**Test Data:** `testdata/usage-scenarios.csv` (UT-11)
**Postconditions:** None.

---

### UT-12: trackToolUsage — guards empty / non-string tool name

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | Medium |
| **Type** | Negative |
| **Requirement** | BR-09 (defensive), BR-05 |
| **File** | backend/src/server/__tests__/toolUsageTracker.test.ts |
| **Preconditions** | Memory module `ready`. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `trackToolUsage(registry, logger, "")` | Returns early, no throw |
| 2 | Call with non-string (cast) name | Returns early, no throw |
| 3 | Assert `incrementToolUsage` NOT called for invalid name | Guard clause effective |

**Test Data:** `testdata/usage-scenarios.csv` (UT-12)
**Postconditions:** None.

---
## 3. Integration Tests (IT)

> IT drives the real MCP request handlers wired to a real `ModuleRegistry` and a real (temp) `better-sqlite3` DB — no mocks for local infrastructure (DB is a real instance). Only the transport is in-process.

### IT-01: ListTools handler returns exactly the 8 CORE tools (real registry)

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-01, BR-02, BR-11, UC-01 |
| **File** | backend/src/server/__tests__/mcpServer.listtools.it.test.ts |
| **Preconditions** | Server created via `getMcpServer(registry, logger)` with full tool set registered. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Register full tool set (>= the 8 CORE + several EXTENDED) | Registry has all tools |
| 2 | Invoke the `ListToolsRequestSchema` handler | Returns `{ tools: [...] }` |
| 3 | Assert `tools.length === 8` and names == CORE set | Only CORE tools present |
| 4 | Assert no EXTENDED tool name in result | EXTENDED omitted (BR-11: filter only here) |

**Test Data:** `testdata/core-tools-list.csv`
**Postconditions:** None.

---

### IT-02: CallTool success increments the tool_usage row (real DB)

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-07, BR-12, UC-03 |
| **File** | backend/src/server/__tests__/mcpServer.calltool.it.test.ts |
| **Preconditions** | Memory module `ready` on temp DB; a CORE tool handler registered. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke `CallToolRequestSchema` for `mem_search` returning success (isError=false) | Handler result returned |
| 2 | Query `tool_usage` via `getToolUsage("mem_search")` | call_count == 1 |
| 3 | Invoke a handler that returns `isError:true` | Result returned |
| 4 | Assert its counter NOT incremented | Errors not counted (BR-12) |

**Test Data:** `testdata/usage-scenarios.csv` (IT-02)
**Postconditions:** Temp DB discarded.

---

### IT-03: execute_dynamic_tool increments inner tool once; wrapper counted separately (no double count)

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-12, BR-07, OI-3, UC-04 |
| **File** | backend/src/modules/orchestration/__tests__/Orchestration.dynamic.it.test.ts |
| **Preconditions** | Registry with a native EXTENDED tool `mem_admin`; memory ready on temp DB. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate full dynamic path: CallTool(name=execute_dynamic_tool) -> inner handler(mem_admin) success | Result returned |
| 2 | Assert `getToolUsage("mem_admin").call_count === 1` | Inner tool counted exactly once |
| 3 | Assert `getToolUsage("execute_dynamic_tool").call_count === 1` | Wrapper counted in a distinct row |
| 4 | Assert these are two different rows | No double count of inner tool (BR-12) |

**Test Data:** `testdata/usage-scenarios.csv` (IT-03)
**Postconditions:** Temp DB discarded.

---

### IT-04: mem_admin action=tool_usage read path returns usage rows (OI-1)

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | TDD §4.3, OI-1, UC-03 AF-2 |
| **File** | backend/src/modules/memory/__tests__/MemoryToolDispatcher.it.test.ts |
| **Preconditions** | Temp DB seeded with usage rows; dispatcher wired to engine. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `mem_admin` with `{action:"tool_usage", limit:20}` via dispatcher | Returns content[0].text |
| 2 | Parse JSON array | Array of `{tool_name, call_count, last_called_at}` |
| 3 | Call with `{action:"tool_usage", tool_name:"mem_search"}` | Returns single matching row |
| 4 | Assert `mem_admin` is NOT in ListTools (EXTENDED) but callable here | Read path adds 0 ListTools footprint |

**Test Data:** `testdata/usage-scenarios.csv` (IT-04)
**Postconditions:** Temp DB discarded.

---

### IT-05: schema DDL creates tool_usage table idempotently on startup

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | BR-10, TDD §5.1/§5.5 |
| **File** | backend/src/engine/db/__tests__/schema.it.test.ts |
| **Preconditions** | Fresh temp DB file. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Apply `SCHEMA_V1` to fresh DB | `tool_usage` table exists (PRAGMA table_info) |
| 2 | Assert columns: tool_name(PK), call_count(NOT NULL DEFAULT 0), last_called_at | Schema matches DDL |
| 3 | Re-apply `SCHEMA_V1` (simulate restart) | No error (CREATE TABLE IF NOT EXISTS) |
| 4 | Seed a row, re-apply schema, read row | Existing data preserved (idempotent) |

**Test Data:** `testdata/usage-scenarios.csv` (IT-05)
**Postconditions:** Temp DB discarded.

---
## 4. E2E-API Tests (from TDD §11.2)

> Driven through the MCP JSON-RPC surface against a running server instance (or in-process transport) with the FULL tool set ingested into `mcp_tools`. No browser. Type: Automated (MCP client + vitest/jest).

### E2E-API-01: listtools_core_only — tools/list returns exactly 8 CORE tools

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated (MCP client) |
| **File** | backend/e2e/listtools.core-only.e2e.test.ts |
| **Traces To** | BR-01, BR-02, UC-01, Story 1 AC-1/AC-3 |
| **Preconditions** | Server running with full tool set registered + ingested. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send `{method:"tools/list", params:{}}` | 200 / JSON-RPC result |
| 2 | Assert `result.tools.length === 8` | Exactly 8 tools |
| 3 | Assert names == CORE set (exact match, order-independent) | mem_search, mem_ingest, mem_ingest_file, code_search, get_curated_context, find_tools, execute_dynamic_tool, orchestration_status |
| 4 | Assert a known EXTENDED tool (e.g., mem_admin) is absent | EXTENDED omitted |

**Test Data:** `testdata/core-tools-list.csv`
**Postconditions:** None.

---

### E2E-API-02: listtools_meta_always — meta-tools present even if CORE_TOOLS emptied

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated (MCP client) |
| **File** | backend/e2e/listtools.meta-always.e2e.test.ts |
| **Traces To** | BR-03, EF-1, Story 1 AC-4 |
| **Preconditions** | Server started with CORE_TOOLS overridden to empty. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start server with empty CORE_TOOLS source | Startup succeeds, warning logged |
| 2 | Send `tools/list` | Result returned (no crash) |
| 3 | Assert find_tools, execute_dynamic_tool, orchestration_status present | 3 meta-tools always visible |

**Test Data:** `testdata/resolve-core-scenarios.csv` (UT-02 row reused)
**Postconditions:** None.

---

### E2E-API-03: token_reduction — serialized tools/list >= 70% smaller vs full set

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High |
| **Type** | Automated (Performance) |
| **File** | backend/e2e/listtools.token-reduction.e2e.test.ts |
| **Traces To** | NFR (BRD §6 / FSD §8.1), Story 1 AC-2 |
| **Preconditions** | Ability to obtain both full (unfiltered) and CORE payloads. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Capture serialized full tool set payload (~60 tools) as baseline bytes | baseline_bytes recorded |
| 2 | Capture serialized filtered CORE payload (8 tools) | core_bytes recorded |
| 3 | Compute reduction = 1 - core_bytes/baseline_bytes | Value computed |
| 4 | Assert reduction >= 0.70 | >= 70% reduction |

**Test Data:** derived at runtime from registry
**Acceptance Criteria:** reduction >= 70%
**Postconditions:** None.

---

### E2E-API-04: hidden_discoverable — find_tools returns an EXTENDED tool

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High |
| **Type** | Automated (MCP client) |
| **File** | backend/e2e/find-tools.hidden.e2e.test.ts |
| **Traces To** | BR-13, UC-04, Story 4 AC-1 |
| **Preconditions** | Full tool set ingested into `mcp_tools`; `mem_admin` is EXTENDED. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `tools/call find_tools {query:"admin usage analytics", threshold:0.3, top_k:5}` | Result with tools array |
| 2 | Assert an EXTENDED tool (e.g., mem_admin) is among matches | Hidden tool discoverable |
| 3 | Assert each match includes name + schema + score | Contract intact (unchanged) |

**Test Data:** `testdata/core-tools-list.csv` (EXTENDED rows)
**Postconditions:** find_tools counter incremented (verified in E2E-API-07).

---

### E2E-API-05: hidden_callable_dynamic — execute_dynamic_tool(hidden, args) succeeds

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High |
| **Type** | Automated (MCP client) |
| **File** | backend/e2e/execute-dynamic.hidden.e2e.test.ts |
| **Traces To** | BR-14, BR-16, UC-04, Story 4 AC-2 |
| **Preconditions** | `mem_admin` EXTENDED and registered. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `execute_dynamic_tool {toolName:"mem_admin", arguments:{action:"status"}}` | isError=false; result returned |
| 2 | Assert result equals pre-change behavior of mem_admin status | Identical output (0 regression) |
| 3 | Assert `arguments` accepted as object (not JSON string) | Contract honored |

**Test Data:** `testdata/usage-scenarios.csv` (E2E-API-05)
**Postconditions:** mem_admin + execute_dynamic_tool counters incremented.

---

### E2E-API-06: hidden_callable_direct — CallTool(hidden) succeeds (no "Unknown tool")

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-06 |
| **Priority** | High |
| **Type** | Automated (MCP client) — Regression |
| **File** | backend/e2e/calltool.hidden-direct.e2e.test.ts |
| **Traces To** | BR-11, BR-15, BR-16, UC-04, Story 4 AC-3 |
| **Preconditions** | `mem_admin` EXTENDED and registered. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send `tools/call {name:"mem_admin", arguments:{action:"status"}}` directly | isError=false; result returned |
| 2 | Assert NO "Unknown tool" error introduced by visibility change | Direct call works (BR-15) |
| 3 | Confirm filter is not enforced on execution path | BR-11 upheld |

**Test Data:** `testdata/usage-scenarios.csv` (E2E-API-06)
**Postconditions:** mem_admin counter incremented once.

---

### E2E-API-07: usage_both_paths — counter reflects CallTool + execute_dynamic_tool

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-07 |
| **Priority** | High |
| **Type** | Automated (MCP client) |
| **File** | backend/e2e/usage.both-paths.e2e.test.ts |
| **Traces To** | BR-07, UC-03, Story 3 AC-4 |
| **Preconditions** | Fresh usage state; read via mem_admin action=tool_usage. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Direct `CallTool(code_search)` success x1 | code_search counter += 1 |
| 2 | `execute_dynamic_tool(code_search)` success x1 | code_search counter += 1 (inner) |
| 3 | Read `mem_admin action=tool_usage tool_name=code_search` | call_count == 2 |
| 4 | Assert both paths contributed to same per-tool counter | BR-07 satisfied |

**Test Data:** `testdata/usage-scenarios.csv` (E2E-API-07)
**Postconditions:** None.

---

### E2E-API-08: usage_persist_restart — counts preserved after DB reopen

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-08 |
| **Priority** | High |
| **Type** | Automated (MCP client) |
| **File** | backend/e2e/usage.persist-restart.e2e.test.ts |
| **Traces To** | BR-10, UC-03, Story 3 AC-2 |
| **Preconditions** | Persistent (file-based) SQLite DB path shared across restarts. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke `mem_search` N=3 times | counter == 3 |
| 2 | Shut down server / close DB | Clean shutdown |
| 3 | Restart server against same DB file | Startup OK; table exists |
| 4 | Read usage for mem_search | call_count still == 3 (persisted) |

**Test Data:** `testdata/usage-scenarios.csv` (E2E-API-08)
**Postconditions:** DB file cleaned after test.

---

### E2E-API-09: usage_nonblocking — simulated write failure still returns tool result

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-09 |
| **Priority** | High |
| **Type** | Automated (Negative) |
| **File** | backend/e2e/usage.nonblocking.e2e.test.ts |
| **Traces To** | BR-09, EF-1, UC-03, Story 3 AC-3 |
| **Preconditions** | Ability to force a usage-write failure (e.g., readonly DB / stubbed engine throw). |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Force `tool_usage` write to fail | Write path throws internally |
| 2 | Invoke a tool via CallTool | isError=false; valid result returned to client |
| 3 | Assert warn logged, error NOT propagated | Non-blocking (BR-09) |

**Test Data:** `testdata/usage-scenarios.csv` (E2E-API-09)
**Postconditions:** Restore DB writability.

---

### E2E-API-10: no_double_count — dynamic call increments inner once, wrapper separately

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-10 |
| **Priority** | High |
| **Type** | Automated (MCP client) |
| **File** | backend/e2e/usage.no-double-count.e2e.test.ts |
| **Traces To** | BR-12, OI-3, UC-03, Story 3 AC-1 |
| **Preconditions** | Fresh usage state. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `execute_dynamic_tool {toolName:"mem_admin", arguments:{action:"status"}}` once | Success |
| 2 | Read usage for `mem_admin` | call_count == 1 (inner, once) |
| 3 | Read usage for `execute_dynamic_tool` | call_count == 1 (wrapper, distinct row) |
| 4 | Assert inner tool NOT counted twice | BR-12 satisfied |

**Test Data:** `testdata/usage-scenarios.csv` (E2E-API-10)
**Postconditions:** None.

---

## 5. E2E-UI Tests

**Not Applicable.** SA4E-18 is a headless backend/MCP protocol change with no user interface. There are no screens or visual elements to validate. All observable behavior is asserted at the E2E-API level (Section 4). No Cucumber/Serenity/WebDriver scenarios are created for this feature.

---
## 6. Manual SIT Tests (exploratory / operator — human judgement only)

> Only scenarios that cannot be meaningfully automated or that benefit from human observation are kept as manual SIT. Everything deterministic is automated as E2E-API above.

### SIT-01: LLM session context reduction — visual confirmation

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | Medium |
| **Type** | Manual — exploratory (UX/observation) |
| **Requirement** | UC-01, Story 1 AC-2 (NFR context) |
| **Preconditions** | A running server; an MCP client / real LLM agent session. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Connect an MCP client / LLM agent to the server | Session established |
| 2 | Observe the tool list surfaced to the model | Only 8 CORE tools shown |
| 3 | Compare against pre-change (full ~60) observed context footprint | Noticeably smaller tool block; agent still functions |
| 4 | Capture screenshot/log of the reduced tool list | Evidence saved to evidence/SIT-01-listtools.png |

**Test Data:** live session
**Postconditions:** None.

---

### SIT-02: Operator reads usage counts — output readability

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | Medium |
| **Type** | Manual — operator |
| **Requirement** | UC-03 AF-2, TDD §4.3 (OI-1), Story 3 AC-1 |
| **Preconditions** | Server ran for a while with real tool calls; operator has MCP client access. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `execute_dynamic_tool {toolName:"mem_admin", arguments:{action:"tool_usage", limit:20}}` | JSON array returned |
| 2 | Inspect rows | Human-readable {tool_name, call_count, last_called_at}, sorted desc by call_count |
| 3 | Sanity-check counts against known activity | Values plausible; top tools reflect real usage |
| 4 | Capture output | Evidence saved to evidence/SIT-02-usage.png |

**Test Data:** live DB
**Postconditions:** None.

---

### SIT-03: Maintainer config edit workflow (UC-02) — single-file visibility change + restart

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | Medium |
| **Type** | Manual — maintainer workflow |
| **Requirement** | UC-02, BR-06, Story 2 AC-1/AC-2/AC-4 |
| **Preconditions** | Source access to `backend/src/config/CoreTools.ts`; server restartable. |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Add a currently-EXTENDED tool name to `CORE_TOOLS` (only this file) | Single-file edit; no module code touched (BR-06) |
| 2 | Restart server; call `tools/list` | Added tool now visible in ListTools (AC-1) |
| 3 | Remove a tool from `CORE_TOOLS`; restart; call `tools/list` | Tool no longer listed, but still callable via execute_dynamic_tool (AC-2) |
| 4 | Confirm no module file was edited to change visibility | Verified by diff/code review (AC-4) |
| 5 | Capture before/after tool lists | Evidence saved to evidence/SIT-03-config.png |

**Test Data:** `testdata/core-tools-list.csv`
**Postconditions:** Restore original CORE_TOOLS.

---

## 7. Requirements Traceability Matrix (RTM)

### 7.1 Business Rules Coverage

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| BR-01 (ListTools only CORE) | FSD §3.1.3 | IT-01, E2E-API-01 | Covered |
| BR-02 (exact 8 CORE) | FSD §3.1.3 | UT-01, IT-01, E2E-API-01 | Covered |
| BR-03 (meta always visible) | FSD §3.1.3 | PBT-01, UT-02, E2E-API-02 | Covered |
| BR-04 (unknown name warn+continue) | FSD §3.2.3 | PBT-03, UT-05 | Covered |
| BR-05 (non-empty string entries) | FSD §3.2.3 | PBT-03, UT-04, UT-12 | Covered |
| BR-06 (single config edit, 0 module edits) | FSD §3.2.3 | SIT-03 | Covered |
| BR-07 (both paths increment) | FSD §3.3.3 | PBT-04, UT-06, IT-02, IT-03, E2E-API-07 | Covered |
| BR-08 (de-duplicate entries) | FSD §3.2.3 | PBT-02, UT-03 | Covered |
| BR-09 (non-blocking write failure) | FSD §3.3.3 | UT-10, UT-11, E2E-API-09 | Covered |
| BR-10 (persist across restart) | FSD §3.3.3 | IT-05, E2E-API-08 | Covered |
| BR-11 (filter only at ListTools) | FSD §3.1.3 | IT-01, E2E-API-06 | Covered |
| BR-12 (no double count, +1 on success) | FSD §3.3.3 | PBT-04, UT-06, UT-07, IT-02, IT-03, E2E-API-10 | Covered |
| BR-13 (all tools ingested/discoverable) | FSD §3.4.3 | E2E-API-04 | Covered |
| BR-14 (execute_dynamic_tool any tier) | FSD §3.4.3 | E2E-API-05 | Covered |
| BR-15 (direct CallTool any tool) | FSD §3.4.3 | E2E-API-06 | Covered |
| BR-16 (100% backward compat, 0 regression) | FSD §3.4.3 | E2E-API-05, E2E-API-06 | Covered |

### 7.2 Use Case Coverage

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 (Filtered ListTools) | FSD §3.1.2 | UT-01, UT-02, IT-01, E2E-API-01, E2E-API-02, E2E-API-03, SIT-01 | Covered |
| UC-02 (Central allowlist config) | FSD §3.2.2 | UT-01..05, SIT-03 | Covered |
| UC-03 (Usage tracking) | FSD §3.3.2 | PBT-04, UT-06..12, IT-02, IT-03, IT-04, E2E-API-07, E2E-API-08, E2E-API-09, E2E-API-10, SIT-02 | Covered |
| UC-04 (Backward-compat discover/call) | FSD §3.4.2 | IT-03, E2E-API-04, E2E-API-05, E2E-API-06 | Covered |

### 7.3 BRD Acceptance Criteria Coverage

| AC | Source | Test Cases | Coverage |
|----|--------|------------|----------|
| Story 1 AC-1 (exactly 8 tools) | BRD §2.3 | UT-01, E2E-API-01 | Covered |
| Story 1 AC-2 (token reduction >= 70%) | BRD §2.3 | E2E-API-03, SIT-01 | Covered |
| Story 1 AC-3 (EXTENDED absent) | BRD §2.3 | E2E-API-01 | Covered |
| Story 1 AC-4 (meta always present) | BRD §2.3 | E2E-API-02 | Covered |
| Story 2 AC-1 (add tool -> visible after restart) | BRD §2.3 | SIT-03 | Covered |
| Story 2 AC-2 (remove tool -> hidden but callable) | BRD §2.3 | SIT-03 | Covered |
| Story 2 AC-3 (unknown name -> warn, startup ok) | BRD §2.3 | UT-05 | Covered |
| Story 2 AC-4 (0 module edits) | BRD §2.3 | SIT-03 | Covered |
| Story 3 AC-1 (count == N invocations, +1 each) | BRD §2.3 | PBT-04, UT-07, E2E-API-10 | Covered |
| Story 3 AC-2 (persist across restart) | BRD §2.3 | E2E-API-08 | Covered |
| Story 3 AC-3 (tracking non-blocking) | BRD §2.3 | UT-11, E2E-API-09 | Covered |
| Story 3 AC-4 (both paths -> same counter) | BRD §2.3 | E2E-API-07 | Covered |
| Story 4 AC-1 (hidden discoverable) | BRD §2.3 | E2E-API-04 | Covered |
| Story 4 AC-2 (hidden callable dynamic) | BRD §2.3 | E2E-API-05 | Covered |
| Story 4 AC-3 (hidden callable direct) | BRD §2.3 | E2E-API-06 | Covered |
| Story 4 AC-4 (100% backward compat) | BRD §2.3 | E2E-API-05, E2E-API-06 | Covered |

### 7.4 Coverage Summary

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Business Rules (BR-01..16) | 16 | 16 | 100% |
| Use Cases (UC-01..04) | 4 | 4 | 100% |
| BRD Acceptance Criteria | 16 | 16 | 100% |
| TDD §11.2 E2E scenarios | 10 | 10 | 100% |
| **Overall** | **46** | **46** | **100%** |

---

## 8. Appendix

### Test Data Files

| File | Purpose |
|------|---------|
| `testdata/core-tools-list.csv` | CORE vs EXTENDED tool classification fixture (ListTools + find_tools tests) |
| `testdata/resolve-core-scenarios.csv` | Inputs/expected outputs for `resolveCoreToolNames` (PBT + UT config tests) |
| `testdata/usage-scenarios.csv` | Usage tracking scenarios (paths, counts, expected counters) |

### Environment Configuration

- Automated tests run under Node.js/TypeScript with `better-sqlite3` using a temp/in-memory DB per test (except E2E-API-08 which uses a file-based DB to test restart persistence).
- E2E-API tests bootstrap the server with the full tool set ingested into `mcp_tools`.
- No external network dependencies.

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage Matrix | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
