# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-332: Shared kernel extraction (move McpBridge/providers/stream-handler out of langgraph)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-332 |
| Title | Shared kernel extraction: move McpBridge/providers/stream-handler out of langgraph |
| Epic | SA4E-289 Migrate LangGraph -> Pi SDK (Option C) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-27 |
| Status | Draft |
| Related STP | `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\STP.md` (v1.0) |
| Related FSD | `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\FSD.md` (v1.2) |
| Related TDD | `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\TDD.md` (v1.1 FINAL) |
| Related SECURITY-REVIEW | `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\SECURITY-REVIEW.md` (v1.0) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-27 | QA Agent | Initiate — 37 cases across 6 levels from FSD UC/BR/TC-MOVE + TDD gates + SECURITY-REVIEW 4 High |

---

## Test Case Summary

| Level | IDs | Count | Automated | Priority |
|-------|-----|-------|-----------|----------|
| PBT — Property-Based (fast-check) | PBT-01 → PBT-03 | 3 | 3 | High |
| UT — Unit (vitest) | UT-01 → UT-12 | 12 | 12 | High |
| IT — Move/static gates (grep/tsc/lint/scan/cycle) | IT-01 → IT-10 | 10 | 10 | High |
| E2E-API — Bridge E2E (vitest e2e, real server/loopback) | E2E-API-01 → E2E-API-04 | 4 | 4 | High |
| E2E-UI — Browser UI (Playwright) | — | 0 | 0 | N/A (no UI change) |
| SIT — Manual exploratory / review only | SIT-01 → SIT-08 | 8 | 0 | High |
| **Total** | | **37** | **29 (78%)** | |

E2E-UI = 0 by design: BRD §1.2 / FSD §3.x.5 — no UI/screen change expected; Settings panel keys unchanged.

---

## 1. Property-Based Tests (PBT — Automated, fast-check + vitest)

### PBT-01: `_as_path` recursion property — no `*_as_path` keys survive, input never mutated

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Functional — Property |
| **Requirement** | UC-01, BR-03 (interceptor semantics frozen); SEC-332-01 (interceptors intact after move) |
| **Preconditions** | Kernel `mcp-bridge.ts` importable from `extension/src/mcp/`; `fs` mocked (`readFileSync` returns `"ZmlsZQ=="` for paths containing `"exists"`, throws otherwise) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary nested args: objects/arrays/primitives with random keys, 10% of string keys ending `_as_path` (fast-check, ≥1000 runs) | Generator yields mixed shapes incl. nested arrays |
| 2 | Deep-freeze a copy of input; call `interceptRequestArgs` (via `callTool` with mocked `invokeTool` echoing args, or direct private access in test) | Call resolves without throwing for every input |
| 3 | Assert output contains zero keys ending `_as_path` at any depth | Property holds for all runs |
| 4 | Assert frozen input copy is unchanged (deep-clone rule: `JSON.parse(JSON.stringify())`, no aliasing) | Property holds — LangGraph state aliasing impossible |

**Test Data:** See `testdata/bridge-behavior-testdata.csv` rows `PBT-01-*` (arbitrary seeds; concrete examples: `{"doc_as_path":"exists.txt"}`, `{"nested":{"arr":[{"f_as_path":"missing.txt"}]}}`).
**Postconditions:** Interceptor recursion incl. arrays verified intact post-move; any counterexample → STOP (behavior diff, separate ticket).

---

### PBT-02: Budget conservativeness property — invalid input forces conservative + floor

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Functional — Property |
| **Requirement** | UC-03, BR-25 (`CHARS_PER_TOKEN=4`, `MIN_RESERVE_TOKENS=2000`, conservative-on-invalid; WARN >85% / REJECT >95%) |
| **Preconditions** | Kernel `context-budget.ts` importable; no mocks needed (pure) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary `ContextBudgetInputs` with random/invalid numbers (NaN, negative, Infinity, huge) + valid context windows (≥1000 runs) | Generator covers invalid + boundary shapes |
| 2 | Call `BudgetCalculator.calculateBudget(inputs, window)` for each | Never throws `TypeError`; may throw documented `ContextBudgetError` on over-budget path only |
| 3 | For every invalid-number input: assert `conservative === true` AND `reserveTokens >= 2000` | Property holds for all runs |
| 4 | For usage >95%: assert `ThresholdGate.evaluate` returns REJECT with exact message shape; >85%: WARN shape | Threshold shapes byte-identical to pre-move |

**Test Data:** See `testdata/providers-stream-budget-testdata.csv` rows `PBT-02-*`.
**Postconditions:** Budget math frozen post-move; counterexample → STOP.

---

### PBT-03: Timeout race property — hung transport always fails with `McpToolTimeoutError`

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Type** | Functional — Property |
| **Requirement** | UC-01, BR-02 (60 000 ms call / 10 000 ms list frozen); FSD TC-BR-01; NFR timeouts kept 60 s / 10 s |
| **Preconditions** | Bridge with `mcpManagerMock` (`status: "running"`); `invokeTool` mocked to never-resolve or delay-random (0–500 ms) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random `timeoutMs` in [5, 200] ms + random tool names/args (≥500 runs) | Inputs cover small-timeout regime (fast suite; 60 s default covered by UT-01/E2E-API-03) |
| 2 | Call `callTool(name, args, timeoutMs)` against never-resolving `invokeTool` | Every call rejects (never hangs, never resolves) |
| 3 | Assert rejection is `McpToolTimeoutError` with message `MCP tool '{name}' timed out after {ms}ms` | Exact message shape for all runs |
| 4 | Assert `timer.unref?.()` path does not keep the process alive (vitest exits cleanly) | No open-handle warnings |

**Test Data:** See `testdata/bridge-behavior-testdata.csv` rows `PBT-03-*`.
**Postconditions:** Timeout protection intact post-move for all Pi tool calls (reliability NFR).

---

## 2. Unit Tests (UT — Automated, vitest)

### UT-01: `callTool` timeout — hung backend throws `McpToolTimeoutError` (mirrors TC-15)

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Functional + Regression |
| **Requirement** | UC-01, BR-02; FSD TC-BR-01; TDD §3.2 |
| **Preconditions** | `extension/src/mcp/__tests__/mcp-bridge.test.ts` (moved from `src/langgraph/__tests__/`, specifier `../mcp-bridge`); `mcpManagerMock = { status: "running", port: 12345, invokeTool: vi.fn() }` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock `invokeTool` to resolve after 100 ms: `mockImplementation(() => new Promise(r => setTimeout(r, 100)))` | Mock installed |
| 2 | `await expect(bridge.callTool("test-tool", {}, 10)).rejects.toThrow(McpToolTimeoutError)` | Rejects with `McpToolTimeoutError`, message `MCP tool 'test-tool' timed out after 10ms` |
| 3 | Assert `clearTimeout` ran on both race paths (no timer leak) | No open handles |

**Test Data:** `bridge-behavior-testdata.csv` row `UT-01` (`toolName=test-tool, timeoutMs=10, hangMs=100`).
**Postconditions:** 60 s default + per-call timeout intact; Pi paths gain fail-fast (was: raw fetch hang).

---

### UT-02: `listTools` success — returns tools from loopback `tools/list`

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Functional + Regression |
| **Requirement** | UC-01, BR-02; FSD TC-BR-02 (TC-16) |
| **Preconditions** | Same suite; `global.fetch = vi.fn()` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock fetch OK: `{ ok: true, json: () => Promise.resolve({ result: { tools: [{ name: "tool_a", description: "d", inputSchema: {} }] } }) }` | Mock installed |
| 2 | `const tools = await bridge.listTools()` | `tools` length 1, `tools[0].name === "tool_a"` |
| 3 | Assert POST went to `http://127.0.0.1:12345/mcp` with `Content-Type: application/json`, body `{ jsonrpc: "2.0", method: "tools/list", params: {} }` | URL uses `mcpManager.port` (never hardcoded) |

**Test Data:** `bridge-behavior-testdata.csv` row `UT-02`.
**Postconditions:** `listTools` contract unchanged; port resolution via `IServerManager.port`.

---

### UT-03: `listTools` abort — `AbortError` maps to `McpToolTimeoutError("tools/list", 10_000)`

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Type** | Functional + Regression |
| **Requirement** | UC-01, BR-02; FSD TC-BR-02 (TC-17); NFR 10 s list timeout kept |
| **Preconditions** | Same suite; `global.fetch = vi.fn()` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock fetch reject with `AbortError`: `const e = new Error("The operation was aborted"); e.name = "AbortError"` | Mock installed |
| 2 | `await expect(bridge.listTools()).rejects.toThrow(McpToolTimeoutError)` | Rejects; error message `MCP tool 'tools/list' timed out after 10000ms` |
| 3 | Mock fetch OK with `{ ok: false, status: 500, statusText: "ISE" }` → `listTools()` | Rejects `HTTP 500: ISE` (unchanged passthrough) |
| 4 | Mock fetch OK with `{ result: null, error: { code: -32601, message: "not found" } }` → `listTools()` | Rejects `MCP error (-32601): not found` (unchanged) |

**Test Data:** `bridge-behavior-testdata.csv` rows `UT-03a/b/c`.
**Postconditions:** 10 s abort + HTTP/MCP error passthrough intact.

---

### UT-04: `_as_path` interceptor — read-and-replace + drop-on-miss, never throws (SEC-332-01 intact)

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Functional + Security (carried finding coverage) |
| **Requirement** | UC-01, BR-03; SEC-332-01 (interceptors intact after move — carried, byte-identical) |
| **Preconditions** | Same suite; mocked `fs` (`existsSync`, `readFileSync`, `writeFileSync`, `mkdirSync` as `vi.fn()`); `invokeTool` echoes received args |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `existsSync` → true, `readFileSync` → `"ZmlsZQ=="`; call `callTool("t", { doc_as_path: "/ws/a.txt", keep: 1 })` | `invokeTool` received `{ doc: "ZmlsZQ==", keep: 1 }` — suffix key replaced, original key dropped |
| 2 | Nested: `{ nested: { arr: [{ f_as_path: "/ws/b.txt" }] } }` | Recursion handles nested objects AND arrays (index keys recurse identically) |
| 3 | `existsSync` → false (missing file) | Key dropped + `console.error` called; call does NOT throw |
| 4 | `readFileSync` throws (unreadable, e.g. EISDIR) | Key dropped + `console.error` called; call does NOT throw |
| 5 | Assert original `args` object passed by caller is unmodified (deep clone) | No LangGraph state aliasing |

**Test Data:** `bridge-behavior-testdata.csv` rows `UT-04a/b/c/d`.
**Postconditions:** `_as_path` semantics byte-identical post-move. NOTE (SEC-332-01): no `realpath`/containment is asserted here BY DESIGN (carried debt) — hardening is follow-up ticket gating SIT-08, not this move.

---

### UT-05: `_base64_file` interceptor — save-to-`documents/tmp/`, exact `Proxy Error` strings, non-JSON passthrough (SEC-332-02 intact)

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | High |
| **Type** | Functional + Security (carried finding coverage) |
| **Requirement** | UC-01, BR-03; SEC-332-02 (`_filename` handling intact after move — carried, byte-identical) |
| **Preconditions** | Same suite; mocked `fs` + `vscode.workspace.workspaceFolders = [{ uri: { fsPath: "/mock/workspace" } }]` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `invokeTool` resolves `'{"_base64_file":"aGVsbG8=","_filename":"out.bin"}'` | Result `File saved successfully to: /mock/workspace/documents/tmp/out.bin`; `mkdirSync` + `writeFileSync(Buffer.from("aGVsbG8=","base64"))` called |
| 2 | Same but without `_filename` | Fallback filename `output_{Date.now()}.bin` used |
| 3 | `workspaceFolders = []` (no workspace) with `_base64_file` payload | Returns `Proxy Error: Cannot save base64 file because workspace is undefined.` — no write attempted |
| 4 | `writeFileSync` throws (disk failure) | Returns `Proxy Error: Failed to save base64 file to disk ({reason})` — message contains NO base64 |
| 5 | `invokeTool` resolves non-JSON string `"plain text"` and JSON without `_base64_file` | Both returned raw/unchanged |

**Test Data:** `bridge-behavior-testdata.csv` rows `UT-05a/b/c/d/e`.
**Postconditions:** `_base64_file` semantics byte-identical. NOTE (SEC-332-02/08): no `basename`/allowlist/size-cap asserted BY DESIGN — follow-up ticket (SIT-08).

---

### UT-06: Availability guard — `isAvailable` + `McpServerNotRunningError` on `callTool`/`listTools`

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | High |
| **Type** | Functional + Regression |
| **Requirement** | UC-01, BR-04; FSD §9 (server-not-running row) |
| **Preconditions** | Same suite |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `mcpManagerMock.status = "running"` → `bridge.isAvailable()` | `true`, no I/O, no throw |
| 2 | `status = "stopped"` → `isAvailable()`; then `callTool("t", {})` and `listTools()` | `false`; both throw `McpServerNotRunningError` ("MCP Server is not running."), `invokeTool`/fetch never called |
| 3 | `status = "running"`, `port = null` → `listTools()` | Throws `McpServerNotRunningError` (port null-check) |

**Test Data:** `bridge-behavior-testdata.csv` rows `UT-06a/b/c`.
**Postconditions:** Early-fail guard intact — Pi gains availability check it lacked with raw fetch.

---

### UT-07: `McpBridgeCaller` adapter — `callMcpWrapper` → `bridge.callTool`, policy assertions identical (SEC-332-03 wiring)

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | High |
| **Type** | Functional + Security |
| **Requirement** | UC-02, BR-10 → BR-13; FSD TC-PI-01; TDD §3.3; OPEN-05 (re-mock `mcp-bridge-extension.test.ts:9,31,97`) |
| **Preconditions** | `mcp-bridge-caller.ts` (NEW kernel file); `mcp-bridge-extension.test.ts` re-mocked: `McpWrapperClient` fake replaced by `McpBridge` fake exposing `callTool`/`listTools`/`isAvailable`; policy constants (`TOOL_ALLOWLIST`, `DYNAMIC_TOOL_NAME`, `bridgeRequiresApproval`) unchanged |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `new McpBridgeCaller(bridge).callMcpWrapper("mem_search", { query: "x" })` with bridge `callTool` resolving `"ok"` | Resolves `"ok"` (`Promise<string>` → `Promise<unknown>` safe); `bridge.callTool` called with `("mem_search", { query: "x" })` (default 60 s timeout) |
| 2 | Allowlisted tool via `createExecuteHandler(bridge, ...)` | Executes transport; result mapped `{ content: [{ type: "text", text }], details: { toolName, success: true } }` — identical shape to pre-cutover |
| 3 | `execute_dynamic_tool` with `allowDynamicChaining !== true` | `chaining_denied`, NO transport call, audited `denied` |
| 4 | Opted-in dynamic call with inner `tool_name` NOT in `TOOL_ALLOWLIST` | `chaining_denied` + audited `denied` |
| 5 | `mem_ingest` without approval (hook resolves false) | `approval_denied`, NO transport, audited `denied` |
| 6 | `validateParams` failure (oversized string) | `validation` payload, NO transport (audit gap noted → SIT-05 tracks SEC-332-04 follow-up) |
| 7 | Bridge throws `McpToolTimeoutError` | `mcp_error` payload `Error invoking {tool}: {message}` with `cause` preserved; never empty success |

**Test Data:** `pi-cutover-testdata.csv` rows `UT-07a/b/c/d/e/f/g`.
**Postconditions:** Transport swapped, policy outcomes identical; decision order (validate → chaining → allowlist → approval → audit → transport) frozen per BR-10.

---

### UT-08: Search provider on bridge — retry / fail-open / dedupe / `topK` preserved

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-02, BR-16; FSD TC-PI-02 |
| **Preconditions** | `createMcpSearchProviderFromBridge(bridge, config)` (TDD §3.3); mocked bridge; `RetrievalConfig { searchTimeoutMs, retryBackoffMs, topK }` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `code_search` fails once then succeeds | `withRetry` retries once after `retryBackoffMs`; success returned |
| 2 | `mem_search` persistently fails | `optional` wrapper returns `[]` (fail-open), no throw |
| 3 | Outer `searchTimeoutMs` shorter than bridge 60 s; simulate slow bridge | Outer `withSearchTimeout` rejection wins; bridge timer cleared via `clearTimeout` (no double-throw) |
| 4 | Results with duplicates exceeding `topK` | Dedupe + `topK` slice hold exactly as pre-cutover |

**Test Data:** `pi-cutover-testdata.csv` rows `UT-08a/b/c/d`.
**Postconditions:** Search resilience kept on top of bridge timeout.

---

### UT-09: `StreamHandler` semantics unchanged (50 ms / 100 cap / flush behaviors)

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UC-03, BR-24; FSD TC-STREAM-01 |
| **Preconditions** | `src/mcp/__tests__/stream-handler-events.test.ts` (moved from `langgraph/__tests__/`, import depth preserved) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Emit token events rapidly (< 50 ms apart) | Debounced: single flush after 50 ms quiet window |
| 2 | Buffer 100 messages without flush | Flush-on-overflow at 100-cap |
| 3 | Emit status / complete / error / retry / verify / strategy-switch / human-intervention | Immediate flush (no debounce) for each |
| 4 | Dispose handler with pending buffer | Flush-on-dispose; `emitDirect` flushes pending first |

**Test Data:** `providers-stream-budget-testdata.csv` rows `UT-09a/b/c/d`.
**Postconditions:** Streaming contract frozen; `pi-workflow-adapter` still constructs `new StreamHandler(msg => onEvent(msg))` unchanged.

---

### UT-10: Budget math unchanged (4 / 2000 / 85% / 95%)

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UC-03, BR-25; FSD TC-BUDGET-01 |
| **Preconditions** | Kernel `context-budget.ts` (moved from `pi-agent/`); suites `context-budget.test.ts`, `session-configurator.budget.test.ts` (import paths only) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `calculateBudget` with known char counts | `estimatedTokens = ceil(chars / 4)` (`CHARS_PER_TOKEN=4`) |
| 2 | Reserve below 2000 | Forced floor `reserveTokens = 2000` + `conservative = true` |
| 3 | Usage 90% → `ThresholdGate.evaluate` | WARN with exact `Budget warning: usage {pct}% >85%...` shape |
| 4 | Usage 97% → evaluate | REJECT with exact `Session rejected: usage {pct}% >95% threshold...` shape |

**Test Data:** `providers-stream-budget-testdata.csv` rows `UT-10a/b/c/d`.
**Postconditions:** Budget math + message shapes byte-identical.

---

### UT-11: Provider factory resolution unchanged (incl. `Unknown provider type`)

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-03, BR-21/22; FSD TC-PROV-01 |
| **Preconditions** | `src/mcp/providers/` (whole-dir move, lazy `require("./...")` relatives preserved); suites provider-registry/openai/ollama/onnx/anthropic/base-provider (paths only) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `createLlmProvider("anthropic")`, `("ollama")`, `("onnx")`, `("kiro")` | Correct special-case instances (incl. kiro gateway default `http://127.0.0.1:8990/anthropic` — loopback allowlisted, SEC-332-07) |
| 2 | `createProviderByType("custom", { baseUrl })` (openai-compatible generic) | Generic instance with `openaiBaseUrl` fallback chain |
| 3 | `createProviderByType("nope")` without URL | Throws `Unknown LLM provider type: nope. Add it to provider-registry.ts or provide a base URL.` (exact string) |
| 4 | `PROVIDER_BASE_URL_KEYS` precedence: explicit arg → provider key → `llmBaseUrl` → registry default | Resolution order identical pre/post move |

**Test Data:** `providers-stream-budget-testdata.csv` rows `UT-11a/b/c/d`.
**Postconditions:** No default-URL/timeout-constant change during move.

---

### UT-12: URL SSRF guard + secrets wiring frozen (`validateProviderBaseUrl`, `getSecretKey`)

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | High |
| **Type** | Security |
| **Requirement** | UC-03/UC-04, BR-23/34/35; FSD TC-MOVE-06; suites `provider-url-policy`, `backend-url`, `restricted-configurations` |
| **Preconditions** | Kernel providers; `package.json` settings keys (`mcpServerPort` 9181, `mcpServerUrl`, provider base URLs, `restrictedConfigurations`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `validateProviderBaseUrl("ftp://evil/x")`, `("")`, non-loopback `http://` without opt-in | Each throws fail-closed (`[Security] Provider baseUrl must be a non-empty URL` or backend policy error) |
| 2 | `validateProviderBaseUrl("https://api.example.com")`, loopback with opt-in | Accepted |
| 3 | `getSecretKey("anthropic")`, `("kiro")`, `("openai")` | `kiroSdlc.anthropicApiKey` / `kiroSdlc.anthropicApiKey` / `kiroSdlc.openaiApiKey` mapping via SecretStorage — zero literals |
| 4 | Scan moved providers for `ApiKey'…'…'` literals | 0 hits (see IT-06 for the full gate) |

**Test Data:** `providers-stream-budget-testdata.csv` rows `UT-12a/b/c/d`; `security-gates-testdata.csv` row `UT-12-scan`.
**Postconditions:** Fail-closed secrets/URL wiring survives US-03 untouched.

---

## 3. Integration / Static-Gate Tests (IT — Automated, shell + vitest)

### IT-01: TC-MOVE-01 — old bridge path fully gone (incl. `.js` variant)

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Functional — Move gate |
| **Requirement** | UC-01, BR-05; FSD TC-MOVE-01; TDD §5.6; OPEN-04 |
| **Preconditions** | US-01 importer rewrites done (TDD §5.5 rows 1–17) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `grep -rn "langgraph/core/mcp-bridge" extension/src --include=*.ts` | 0 hits |
| 2 | `grep -rn "mcp-bridge\.js" extension/src --include=*.ts` | 0 hits (covers `kb-client.ts:3` old form) |
| 3 | `grep -rn "\.\./core/mcp-bridge" extension/src --include=*.ts` | 0 hits (covers `tool-registry.ts:6` old relative form) |
| 4 | `Test-Path extension/src/langgraph/core/mcp-bridge.ts` | `False` (original deleted); `Test-Path extension/src/mcp/mcp-bridge.ts` → `True` |

**Test Data:** `move-gates-testdata.csv` row `IT-01` (patterns + expected 0).
**Postconditions:** Old path provably gone; gate blocks merge if red.

---

### IT-02: TC-MOVE-02 — no reverse dependencies remain (`import` + `require` forms)

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Functional — Freeze gate |
| **Requirement** | UC-01/UC-03/UC-04, BR-30/31; FSD TC-MOVE-02; SEC-332-05 (`require` bypass); OPEN-04 |
| **Preconditions** | US-01 → US-03 rewrites done; lint Option B applied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `grep -rn "from.*langgraph/" extension/src --include=*.ts \| grep -v "src/langgraph/"` | 0 files (covers `../langgraph/`, `@/langgraph`, deep `core\|providers\|vscode/*`, `.js` variants) |
| 2 | `grep -rn "require.*langgraph" extension/src --include=*.ts \| grep -v "src/langgraph/"` | 0 hits (SEC-332-05: `no-restricted-imports` misses `require()`; grep closes it) |
| 3 | `grep -rn "langgraph/core/llm-provider(\.js)?" extension/src --include=*.ts \| grep -v "src/langgraph/"` | 0 hits (type-only probes incl. `pi-adapter-context-probe.ts:1` old form) |

**Test Data:** `move-gates-testdata.csv` row `IT-02`.
**Postconditions:** Zero inbound edges to `langgraph/` from outside itself; Option C direction holds.

---

### IT-03: TC-MOVE-03 — no `McpWrapperClient` consumers remain in production

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Functional — Cutover gate |
| **Requirement** | UC-02; FSD TC-MOVE-03; BR-15 |
| **Preconditions** | Pi rewiring done (`mcp-bridge-extension.ts`, `search-provider.ts`); `mcp-wrapper-client.ts` deleted (or `@deprecated` per AF-1) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `grep -rn "mcp-wrapper-client\|McpWrapperClient\|createMcpClient" extension/src/pi-agent extension/src/pi-workflow --include=*.ts \| grep -v __tests__` | 0 hits |
| 2 | `Test-Path extension/src/pi-agent/extensions/mcp-wrapper-client.ts` | `False` (deleted; if AF-1 deprecate-path taken, file exists with `@deprecated` + follow-up ticket key in header — record deviation in SIT-08) |
| 3 | `mcp-bridge-extension.test.ts` + `search-provider` suites run against bridge mocks | All pass, policy assertions identical (links UT-07/UT-08) |

**Test Data:** `move-gates-testdata.csv` row `IT-03`.
**Postconditions:** Single tool transport (`McpBridge`) in Pi paths.

---

### IT-04: TC-MOVE-04 — compile clean (`tsc`)

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | High |
| **Type** | Functional — Build gate |
| **Requirement** | UC-01/UC-03; FSD TC-MOVE-04; TDD §11 phase gates |
| **Preconditions** | All moves + rewrites done; working directory `extension/` (script `"compile": "tsc -p ./"` runs from `extension/`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | From `extension/`: `npm run compile` | Exit 0, zero errors |
| 2 | If any missing/dangling import error | EF-1: fix specifier only; no logic patch to satisfy compiler; re-run |

**Test Data:** `move-gates-testdata.csv` row `IT-04` (exit 0).
**Postconditions:** No dangling specifiers; move is complete.

---

### IT-05: TC-MOVE-05 — lint freeze proven (fixture FAILS, tree PASSES; SEC-332-06 runnable)

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Priority** | High |
| **Type** | Security — Lint gate |
| **Requirement** | UC-04, BR-30/31/32; FSD TC-MOVE-05; TDD §7.3 (Option B); SEC-332-06 (lint runnable); OPEN-03 |
| **Preconditions** | Lint rule applied (Option B split configs + test-dir override); script fixed `"lint": "npx eslint src/"` (drop `--ext .ts`); `**/__tests__/**` blanket ignore narrowed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create temp fixture OUTSIDE `src/langgraph/`: `import { McpBridge } from "../langgraph/core/mcp-bridge"`; run `npm run lint` on fixture | FAILS with message `SA4E-332: langgraph/ is FROZEN — import from extension/src/mcp/... instead` |
| 2 | Same with `.js` form `../langgraph/core/mcp-bridge.js` | FAILS with the `.js`-specific FROZEN message |
| 3 | Fixture inside `src/langgraph/` (intra-legacy) | PASSES (BR-32 allowlist, no false positive) |
| 4 | Full `npm run lint` on tree (fixture removed) | Exit 0 — record both outputs in PR |
| 5 | Test-dir fixture (`src/**/__tests__/` importing `langgraph/`) | FAILS (override carries same patterns — OPEN-03 proven) |

**Test Data:** `security-gates-testdata.csv` rows `IT-05a/b/c/d/e`.
**Postconditions:** Freeze actually enforceable in CI (SEC-332-06 closed in-ticket); merge BLOCKED until fixture-FAIL + tree-PASS recorded.

---

### IT-06: TC-MOVE-06 — secret/URL scan clean (0 literals, 0 hardcoded `9181`)

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Priority** | High |
| **Type** | Security — Scan gate |
| **Requirement** | UC-02/UC-04, BR-15/34/35; FSD TC-MOVE-06; TDD §7.2; SEC-332-09 (URL part) |
| **Preconditions** | Moves + cutover done |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `grep -rn "ApiKey['\"]?\s*[:=]\s*['\"][^'\"]\+['\"]" extension/src/mcp extension/src/pi-agent extension/src/pi-workflow` | 0 hits (no `ApiKey`/token literals) |
| 2 | `grep -rn "127\.0\.0\.1:9181" extension/src` | 0 hits (only `package.json` `mcpServerPort` default 9181 allowed) |
| 3 | `grep -rn "127\.0\.0\.1:9181\|localhost:9181" extension/src/pi-agent extension/src/pi-workflow extension/src/mcp` | 0 hits (Pi paths resolve via `IServerManager.port` / `mcpServerPort` / `mcpServerUrl`) |
| 4 | `restricted-configurations.test.ts` + `backend-url.test.ts` suites | PASS (settings-driven wiring intact) |

**Test Data:** `security-gates-testdata.csv` rows `IT-06a/b/c/d`.
**Postconditions:** Token-from-API + settings-URL hygiene proven; deleting the wrapper is a net gain.

---

### IT-07: TC-MOVE-07 — stale compiled artifacts gone (SEC-332-11)

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Priority** | High |
| **Type** | Security — Integrity gate |
| **Requirement** | FSD TC-MOVE-07 (v1.2 DISC-01/03); TDD §5.8/§13.1; SEC-332-11; OPEN-06 (RESOLVED: DELETE) |
| **Preconditions** | None (deletion is the action) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `Test-Path extension/tests/mcp-bridge.test.ts` and `extension/tests/mcp-bridge.test.js` | Both `False` (DELETED — stale: imports non-existent `base-node`/`core/state`) |
| 2 | `Get-ChildItem extension/tests/*.js` | 0 checked-in `.js` (kept `**/*.js` ignore covers only genuine build output) |
| 3 | `grep -rn "require.*langgraph/core/base-node" extension --include=*` | 0 hits |
| 4 | `Test-Path extension/src/mcp/__tests__/mcp-bridge.test.ts` (healthy suite moved, specifier `../mcp-bridge`) | `True`; suite passes with assertions unchanged (links UT-01 → UT-06) |

**Test Data:** `move-gates-testdata.csv` row `IT-07`.
**Postconditions:** No invisible-to-lint stale artifacts; canonical suite lives in kernel.

---

### IT-08: Cycle gate — `mcp-bridge ↔ tool-registry` resolved, `madge` 0 cycles (OPEN-01)

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Priority** | High |
| **Type** | Security/Structural — Cycle gate |
| **Requirement** | UC-01 EF-4/EF-5; TDD §5.6/§7.5; OPEN-01; FSD §11.5 (single owner `mcp-types.ts`) |
| **Preconditions** | Types-first done (`mcp-types.ts` created before bridge move); all 7 `import type { McpToolDefinition }` re-pointed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `grep -rn "vscode/tool-registry" extension/src/mcp/` | 0 hits (kernel never imports legacy registry) |
| 2 | `npx -y madge@8.0.0 --circular extension/src/mcp/` | 0 cycles (pinned npx, no `package.json` change) |
| 3 | `Test-Path extension/src/mcp/mcp-types.ts` with `McpToolDefinition { name; description; inputSchema }` byte-identical to old `tool-registry.ts:9-13` | Single canonical owner; `tool-registry.ts` re-exports type for backward-compat during phased deletion |

**Test Data:** `security-gates-testdata.csv` rows `IT-08a/b/c`.
**Postconditions:** No runtime cycle carried into kernel; future kernel-internal cycles blocked (paired with `require` grep IT-02 — `madge` sees only `import`, SEC-332-12 noted).

---

### IT-09: `serverManager` fail-closed — missing manager throws, NO hardcoded fallback (SEC-332-09)

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Priority** | High |
| **Type** | Security — Fail-closed gate (merge condition) |
| **Requirement** | UC-02; TDD §3.3 (`BridgeOptions.serverManager` required); SEC-332-09 (conditional High) |
| **Preconditions** | Entry `mcpBridgeExtension({ pi }, options)` requires `BridgeOptions.serverManager` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call entry WITHOUT `serverManager` (`undefined` / `{}`) | Throws `[Security] McpBridge requires IServerManager (no hardcoded fallback)` — synchronously at wiring time |
| 2 | Assert NO fallback path exists: `grep -rn "createMcpClient\|127.0.0.1:9181" extension/src/pi-agent --include=*.ts \| grep -v __tests__` | 0 hits (fallback to wrapper/literal URL forbidden) |
| 3 | Call entry WITH mock `serverManager` (`status/port/invokeTool`) | Builds `new McpBridge(serverManager)`; no throw |
| 4 | Unit: bridge constructed with `status: "stopped"` manager → `callTool` | `McpServerNotRunningError` (fail-closed at transport too) |

**Test Data:** `security-gates-testdata.csv` rows `IT-09a/b/c/d`.
**Postconditions:** Merge BLOCKED if DEV implemented optional-with-fallback; hardcoded-URL surface cannot return.

---

### IT-10: `McpToolDefinition` single owner — exactly one definition, all consumers re-pointed

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Priority** | High |
| **Type** | Functional — Structural gate |
| **Requirement** | UC-01 AF-2/AF-3 (superseded by kernel `mcp-types.ts`); FSD §11.5; TDD §5.2 |
| **Preconditions** | Kernel `mcp-types.ts` exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `grep -rn "interface McpToolDefinition" extension/src --include=*.ts` | Exactly 1 hit (`mcp/mcp-types.ts`); `tool-registry.ts` holds only `import type` + re-export, no local definition |
| 2 | All 7 type imports (`mcp-bridge.ts:13`, `llm-provider.ts:8`, `anthropic-provider.ts:6`, `BaseLlmProvider.ts:7`, `ollama-provider.ts:7`, `ollama-tools.ts:6`, `openai-provider.ts:6` — post-move paths) resolve to `mcp-types` | `tsc` (IT-04) green proves resolution; spot-grep confirms no `vscode/tool-registry` remainder |
| 3 | `llm-provider.chatWithTools(McpToolDefinition[])` + provider `BaseLlmProvider` tool paths compile | Type shapes frozen (BR-26) |

**Test Data:** `move-gates-testdata.csv` row `IT-10`.
**Postconditions:** Compile-time cycle eliminated; freeze gate meaningful.

---

## 4. E2E-API Tests (Automated, vitest e2e + fetch)

### E2E-API-01: `drawio-convert.e2e` on kernel bridge (`../mcp/mcp-bridge`)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated (vitest e2e) |
| **File** | `extension/src/__tests__/drawio-convert.e2e.test.ts` (import `:6` → `../mcp/mcp-bridge` per DISC-02) |
| **Traces To** | BRD US-01 AC-3; FSD TC-E2E-01; OPEN-02 (direct construction accepted, path-only) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update import `:6` to `../mcp/mcp-bridge` (no other edit); construct `new McpBridge(serverManager)` as before | Compiles; construction identical |
| 2 | Run e2e via `vitest.e2e.config.ts` | PASS with assertions unchanged |
| 3 | Assert timeout/port semantics used are the bridge's (60 s, `port` from manager) | No drift vs prod wiring (OPEN-02 follow-up noted, not blocking) |

**Test Data:** `pi-cutover-testdata.csv` row `E2E-API-01` (server fixture: loopback MCP, port from manager).
**Postconditions:** E2E proves kernel bridge serves real conversion flow.

---

### E2E-API-02: `cross-process.e2e` on kernel bridge

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated (vitest e2e) |
| **File** | `extension/src/__tests__/cross-process.e2e.test.ts` (import `:6` → `../mcp/mcp-bridge` per DISC-02) |
| **Traces To** | BRD US-01 AC-3; FSD TC-E2E-01; OPEN-02 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Update import `:6` to `../mcp/mcp-bridge` (no other edit) | Compiles |
| 2 | Run e2e via `vitest.e2e.config.ts` | PASS with assertions unchanged |
| 3 | `timer.unref?.()` keeps CLI/e2e exit clean | Process exits without hanging handles |

**Test Data:** `pi-cutover-testdata.csv` row `E2E-API-02`.
**Postconditions:** Cross-process transport intact through kernel path.

---

### E2E-API-03: Hung Pi tool fails fast — `mcp_error` caused by `McpToolTimeoutError` (~60 s)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High |
| **Type** | Automated (vitest e2e) |
| **File** | `extension/src/__tests__/pi-hang-fails-fast.e2e.test.ts` (new e2e scoping file; reuses `McpBridge` + `createExecuteHandler` helpers) |
| **Traces To** | BRD US-02 AC-3; FSD TC-PI-03; BR-14 (no opt-out from timeout) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Wire Pi extension with kernel `McpBridge` over a hanging `invokeTool` (never resolves); allowlisted tool, approval granted | Setup complete |
| 2 | Invoke tool with default timeout (60 s; e2e may use scaled timeout + assert proportionally — record scale in report) | Rejects at ~timeout (default 60 s; never hangs) |
| 3 | Assert Pi payload | `mcp_error`: `Error invoking {tool}: MCP tool '{tool}' timed out after {ms}ms` with `cause` = `McpToolTimeoutError` |
| 4 | Assert audit | Exactly one `BridgeAuditEntry` (`approved` decision, keys-only) despite transport failure |

**Test Data:** `pi-cutover-testdata.csv` row `E2E-API-03`.
**Postconditions:** Reliability NFR proven: hangs now fail fast instead of hanging (the key Pi gain).

---

### E2E-API-04: Search resilience on bridge — retry + fail-open + dedupe + `topK`

| Field | Value |
|-------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High |
| **Type** | Automated (vitest e2e) |
| **File** | `extension/src/__tests__/pi-search-resilience.e2e.test.ts` (reuses `createMcpSearchProviderFromBridge` helper) |
| **Traces To** | BRD US-02; FSD TC-PI-02; BR-16 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `code_search` fails once (500) then succeeds via bridge | Retried once after `retryBackoffMs`; success returned with `extractText` handling string payload |
| 2 | `mem_search` persistently down | Returns `[]` (fail-open); no throw; caller continues |
| 3 | Overlapping results across providers exceeding `topK` | Dedupe + `topK` slice identical to pre-cutover |

**Test Data:** `pi-cutover-testdata.csv` rows `E2E-API-04a/b/c`.
**Postconditions:** Outer wrappers (`withSearchTimeout`/`withRetry`/`optional`) verified intact on top of bridge.

---

## 5. E2E-UI Tests — N/A (0 cases)

No E2E-UI cases. Justification (traceable, not an omission):

| # | Reason | Source |
|---|--------|--------|
| 1 | No user-visible interface change is expected | BRD §1.2 Out of Scope |
| 2 | No UI spec tables (all FSD §3.x.5 = "Not applicable") | FSD §3.1.5/3.2.5/3.3.5 |
| 3 | Settings panel keys unchanged (only read paths move) | FSD §3.3.5 |
| 4 | All verifiable behavior is module/gate/transport level (covered by PBT/UT/IT/E2E-API) | STP §2.1 |

---

## 6. Manual SIT Tests (SIT — Manual, repo review + terminal)

### SIT-01: Import-only diff review — `git diff` shows specifiers + type-owner move ONLY (BR-01/BR-20)

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | Manual — Review gate |
| **Requirement** | UC-01/UC-03, BR-01, BR-20; TDD §11 phase 6 |
| **Preconditions** | Move commit(s) available; reviewer has FSD §11.5 + TDD §5.2/§5.3 context |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `git diff --stat` — list moved files vs TDD §5.1 layout | Files match layout exactly (bridge, llm-provider, stream-handler, state-types, providers/×12, context-budget, mcp-types.ts + mcp-bridge-caller.ts NEW) |
| 2 | `git diff -U0 \| grep "^[+-]" \| grep -v "^[+-][+-]" \| grep -vi "from .*['\"]" \| grep -vi "import"` — show non-import changed lines | EMPTY except: (a) `McpToolDefinition` definition deletion in `tool-registry.ts` + re-export, (b) `mcp-bridge-caller.ts` NEW, (c) `createMcpSearchProvider`/`createExecuteHandler` signature threading, (d) README FROZEN + lint config |
| 3 | Verify frozen constants in diff: `60_000`, `10_000`, `50`, `100`, `CHARS_PER_TOKEN=4`, `MIN_RESERVE_TOKENS=2000`, 85/95, all `Proxy Error`/`MCP tool`/`HTTP`/`MCP error`/`Session rejected`/`Budget warning` strings | Zero changes (byte-identical) |
| 4 | Any other diff found | REJECT — file separate ticket; move stops (EF-2) |

**Test Data:** `manual-sit-testdata.csv` row `SIT-01` (allowed-diff allowlist).
**Postconditions:** Move-as-is proven by human judgment; evidence: reviewed diff excerpt in TEST-REPORT notes.

---

### SIT-02: History preserved — `git log --follow` per moved file (TC-HIST-01)

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | Medium |
| **Type** | Manual — History gate |
| **Requirement** | BRD US-01 AC-1; FSD TC-HIST-01; TDD §4/§10 |
| **Preconditions** | Moves done via `git mv` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each moved file: `git log --follow --oneline -- extension/src/mcp/mcp-bridge.ts \| head -5` (repeat: llm-provider, stream-handler, state-types, providers/*, context-budget, moved tests) | History present (pre-move commits visible) for EVERY file |
| 2 | Confirm no file was copy+delete (which breaks `--follow`) | Single rename entry per file |

**Test Data:** `manual-sit-testdata.csv` row `SIT-02` (file list).
**Postconditions:** File-history (the analogue of migration safety, TDD §4) verified.

---

### SIT-03: Policy-parity exploratory — allowlist / chaining / approval / audit identical after cutover (TC-PI-01 manual spot)

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | High |
| **Type** | Manual — Exploratory (security witness) |
| **Requirement** | UC-02, BR-10 → BR-13; FSD TC-PI-01; SEC-324-03 preserved; OPEN-05 |
| **Preconditions** | Pi rewired to kernel bridge; re-mocked `mcp-bridge-extension.test.ts` green (UT-07) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Allowlisted tool (`mem_search`, approved) end-to-end | Executes; payload shape identical to pre-cutover recording |
| 2 | Non-allowlisted tool + `execute_dynamic_tool` without opt-in | `chaining_denied` (both), audited `denied`, no transport |
| 3 | `mem_ingest` with approval granted vs denied | Granted → executes; denied → `approval_denied`, no transport |
| 4 | Inspect audit sink for steps 1–3 | Exactly one `BridgeAuditEntry { toolName, argKeys, decision }` per invocation; arg KEYS only, never values |
| 5 | Confirm Pi approval flow NOT unified with LangGraph `ToolApprovalGate`/`hookEngine` (FSD EF-6) | Different layers intact; adapter still exposes `getStreamHandler()` |

**Test Data:** `manual-sit-testdata.csv` row `SIT-03` + `pi-cutover-testdata.csv` parity rows.
**Postconditions:** Security reviewer signs policy parity; evidence paths recorded in TEST-REPORT.

---

### SIT-04: Fail-open approval check — absent `approvalHook` behavior documented + entry wired (SEC-332-03)

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | High |
| **Type** | Manual — Security condition (merge condition) |
| **Requirement** | SEC-332-03 High (fail-open: absent hook = auto-approved incl. `mem_ingest`/`DYNAMIC_TOOL_NAME`) |
| **Preconditions** | Entry signature `mcpBridgeExtension({ pi }, options: BridgeOptions & { serverManager })` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke gated tool (`mem_ingest`) with NO `approvalHook` in options (test harness) | Observed: auto-approved (documents the carried fail-open — do NOT "fix" inside move) |
| 2 | Verify production entry passes a real `approvalHook` (read wiring, not just outcomes) | Hook present at every production call site; startup warns if missing |
| 3 | Confirm follow-up ticket filed: fail-closed when hook missing for gated tools (or explicit risk acceptance recorded) | Ticket key recorded in TEST-REPORT notes; blocks SA4E-289 production wiring, not this move |

**Test Data:** `security-gates-testdata.csv` rows `SIT-04a/b/c`.
**Postconditions:** Residual risk tracked, not waved through (per CONDITIONAL PASS §verdict-2).

---

### SIT-05: Validation-audit gap check — `validateParams` failure emits no audit (SEC-332-04)

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Priority** | Medium |
| **Type** | Manual — Logging gap (follow-up tracker) |
| **Requirement** | SEC-332-04 Medium (breaks "exactly one audit per invocation" for validation branch); BR-13 |
| **Preconditions** | UT-07 step 6 observed (`validation` without audit) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger `validateParams` failure (oversized string >4000 chars) in harness | `validation` payload returned, transport not called |
| 2 | Inspect audit sink | Observed: NO entry (documents the gap — one-line fix is separate ticket, not this move) |
| 3 | Confirm follow-up ticket filed (add `audit({ toolName, argKeys, decision: "denied" })` on validation-fail path) | Ticket key recorded; FSD BR-13 claim annotated as false-for-this-branch until fix |

**Test Data:** `security-gates-testdata.csv` row `SIT-05`.
**Postconditions:** A09 blind spot (fuzzing without trace) tracked.

---

### SIT-06: Interceptor parity spot — `_as_path` / `_base64_file` behavior witnessed post-move (SEC-332-01/02)

| Field | Value |
|-------|-------|
| **ID** | SIT-06 |
| **Priority** | High |
| **Type** | Manual — Parity witness |
| **Requirement** | BR-03; SEC-332-01/02/08/10 (carried — verified intact, hardening separate) |
| **Preconditions** | UT-04/UT-05 + PBT-01 green |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `_as_path` with existing file vs missing file (harness or unit run witness) | Read+replace vs drop+`console.error`, no throw — identical to pre-move |
| 2 | `_base64_file` with/without workspace/without `_filename`/write-failure | `File saved...` / `Proxy Error: Cannot save...workspace is undefined.` / fallback name / `Proxy Error: Failed to save...` (no base64 leak) — identical |
| 3 | Confirm NO containment/`basename`/size-cap was added in the move diff (SIT-01 cross-check) | Move is honest: vulnerabilities carried byte-identically (SEC-332-01/02/08/10 follow-ups filed before merge per SIT-08) |

**Test Data:** `manual-sit-testdata.csv` row `SIT-06`.
**Postconditions:** Interceptors proven intact; Pi `_as_path` amplification (LLM-controlled params) explicitly tracked to P1 follow-up before production wiring.

---

### SIT-07: README FROZEN content check (BR-33)

| Field | Value |
|-------|-------|
| **ID** | SIT-07 |
| **Priority** | Medium |
| **Type** | Manual — Document check |
| **Requirement** | UC-04, BR-33; TDD §7.4; FSD §3.4 README wording |
| **Preconditions** | `extension/src/langgraph/README.md` written |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Read README | Contains: FROZEN header; no-new-code/importers rule; kernel paths AS BUILT (`mcp-bridge.ts` + `mcp-types.ts`, `llm-provider.ts`, `stream-handler.ts`, `state-types.ts`, `providers/*`, `context-budget`); SA4E-289/SA4E-332 refs; token/URL hygiene (SecretStorage + settings + `IServerManager.port`/`mcpServerPort`/`mcpServerUrl`; never hard-code `127.0.0.1:9181`) |
| 2 | Paths in README vs actual kernel layout | Match exactly (if team chose `shared/` or `mcp/bridge/`, README names those — TDD records final) |

**Test Data:** `manual-sit-testdata.csv` row `SIT-07`.
**Postconditions:** Boundary documented where the lint message points.

---

### SIT-08: Merge-condition sign-off — lint runnable + stale `.js` deleted + fail-closed + `require` gate + follow-ups filed

| Field | Value |
|-------|-------|
| **ID** | SIT-08 |
| **Priority** | High |
| **Type** | Manual — Release gate |
| **Requirement** | SECURITY-REVIEW Verdict CONDITIONAL PASS (conditions 1–3); SEC-332-05/06/09/11 |
| **Preconditions** | All automated levels executed; SIT-01 → SIT-07 done |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | IT-05 evidence: fixture-FAIL + tree-PASS outputs recorded in PR | Lint runnable (SEC-332-06), test-dir override proven |
| 2 | IT-07 evidence: both stale files deleted | Stale `.js` gone (SEC-332-11) |
| 3 | IT-09 evidence: `serverManager`-missing throws; prod grep `createMcpClient`/`127.0.0.1:9181` = 0 | Fail-closed (SEC-332-09) |
| 4 | IT-02 evidence: `require.*langgraph` outside `src/langgraph/` = 0 | Freeze bypass closed (SEC-332-05) |
| 5 | Follow-up tickets filed BEFORE merge: `_as_path` containment (01/10), `_filename`+size-cap (02/08), approval fail-closed + validation-audit (03/04) — flagged blockers for SA4E-289 production wiring | Ticket keys recorded; move itself NOT blocked (no Critical, no new remote surface) |
| 6 | Sign merge | All boxes ticked → CONDITIONAL PASS satisfied |

**Test Data:** `manual-sit-testdata.csv` row `SIT-08` (checklist).
**Postconditions:** Ticket merge-ready; residual risk transferred to tracked follow-ups.

---

## 7. Non-Functional Test Cases (covered inline — no separate TC-600 block)

NFRs for this ticket are parity assertions embedded in the levels above (no perf harness, no browser matrix — FSD §8 + TA note):

| NFR | Acceptance (measurable) | Test Cases |
|-----|------------------------|------------|
| Diff import-only | `git diff` (excl. specifiers + type-owner + adapter + DI) EMPTY | SIT-01 |
| Timeouts kept 60 s / 10 s | `McpToolTimeoutError(name, 60000)` default; `("tools/list", 10000)` abort | PBT-03, UT-01, UT-03, E2E-API-03 |
| Stream constants frozen | 50 ms debounce, 100-cap, flush-on-dispose, `emitDirect` flush-first | UT-09 |
| Budget constants frozen | 4 / 2000 / 85% / 95% + exact message shapes | PBT-02, UT-10 |
| History preserved | `git log --follow` per moved file | SIT-02 |
| No hard-coded secrets/URLs | 0 `ApiKey`/token literals; 0 `127.0.0.1:9181` in `extension/src` | IT-06, UT-12 |
| Audit/error parity | `BridgeAuditEntry`/keys-only per invocation; error codes unchanged | UT-07, E2E-API-03, SIT-03 |

---

## 8. Integration Testing (covered as IT level — §3)

No separate TC-700 block: integration surface for this ticket IS the move-gate set (IT-01 → IT-10: grep/tsc/lint/scan/cycle/fail-closed) plus Pi-transport integration (UT-07/UT-08, E2E-API-03/04). No DB, no external system beyond loopback MCP (mocked in UT, real in E2E-API).

---

## 9. Regression Testing (traceability — suites must stay green)

| Existing suite | Disposition (TDD §13.1) | Linked TCs |
|----------------|------------------------|------------|
| `src/langgraph/__tests__/mcp-bridge.test.ts` (229 lines, healthy; TC-15 → TC-20) | MOVES to `src/mcp/__tests__/mcp-bridge.test.ts` (`../mcp-bridge`); assertions unchanged | UT-01 → UT-06, PBT-01/03 |
| `src/langgraph/__tests__/stream-handler-events.test.ts` | MOVES to `src/mcp/__tests__/`; depth preserved | UT-09 |
| `src/langgraph/providers/__tests__/*` (11 files) | Move with dir; no edits | UT-11, UT-12 |
| `extension/tests/mcp-bridge.test.ts` + `.js` (stale) | DELETED (DISC-01/03) | IT-07 |
| `pi-agent/extensions/__tests__/mcp-wrapper-client.test.ts` | DELETED with the client | IT-03 |
| `pi-agent/extensions/__tests__/mcp-bridge-extension.test.ts` | Re-mocked (`McpBridge` fake); policy assertions identical | UT-07, SIT-03 |
| `config/__tests__/restricted-configurations.test.ts`, `backend-url.test.ts` | Unchanged (settings wiring proof) | IT-06, UT-12 |
| `__tests__/drawio-convert.e2e.test.ts`, `cross-process.e2e.test.ts` | Path-only (`../mcp/mcp-bridge`, DISC-02) | E2E-API-01/02 |
| `context-budget.test.ts`, `session-configurator.budget.test.ts` | Import paths only | UT-10 |
| Search-provider suites | Run against `McpBridgeCaller` + mocked bridge | UT-08, E2E-API-04 |

Regression rule (EF-2): any suite needing assertion changes beyond import paths → STOP, file separate ticket, do not bundle.

---

## 10. Requirements Traceability Matrix (RTM — 100%)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 (move bridge, main flow) | FSD 3.1.2 | PBT-01, PBT-03, UT-01 → UT-06, IT-01, IT-04, E2E-API-01, E2E-API-02 | ✅ |
| UC-01 AF-1 (subpath `mcp/bridge/`) | FSD 3.1.2 | IT-01, IT-04 (paths renamed 1:1) | ✅ |
| UC-01 AF-2/AF-3 (type owner — superseded by `mcp-types.ts`) | FSD 3.1.2 + §11.5 | IT-08, IT-10 | ✅ |
| UC-01 AF-4 (stale test — SUPERSEDED: DELETE per DISC-01) | FSD 3.1.2 | IT-07 | ✅ |
| UC-01 AF-5 (`.js`/relative sweep) | FSD 3.1.2 | IT-01, IT-02 | ✅ |
| UC-01 EF-1 (dangling import) | FSD 3.1.2 | IT-04 | ✅ |
| UC-01 EF-2 (assertion must change → STOP) | FSD 3.1.2 | SIT-01 (regression §9 rule) | ✅ |
| UC-01 EF-3 (cycle carried → STOP) | FSD 3.1.2 | IT-08 | ✅ |
| UC-01 EF-4/EF-5 (type re-point defect gates) | FSD 3.1.2 (TA) | IT-08, IT-10 | ✅ |
| UC-01 EF-6 (Pi vs LangGraph approval not unified) | FSD 3.1.2 (TA) | SIT-03 | ✅ |
| UC-02 (Pi cutover, main flow) | FSD 3.2.2 | UT-07, UT-08, IT-03, E2E-API-03, E2E-API-04, SIT-03 | ✅ |
| UC-02 AF-1 (unknown consumer → deprecate) | FSD 3.2.2 | IT-03 | ✅ |
| UC-02 AF-2 (thin adapter) | FSD 3.2.2 | UT-07 | ✅ |
| UC-02 AF-3 (outer timeout wins) | FSD 3.2.2 (TA) | UT-08, E2E-API-04 | ✅ |
| UC-02 EF-1/EF-2/EF-4 (denied payloads, no transport) | FSD 3.2.2 | UT-07 | ✅ |
| UC-02 EF-3 (bridge throws → `mcp_error`) | FSD 3.2.2 | UT-07, E2E-API-03 | ✅ |
| UC-02 EF-5 (leftover `createMcpClient`) | FSD 3.2.2 (TA) | IT-03, IT-09 | ✅ |
| UC-02 EF-6 (`Proxy Error` string as Pi success — accepted) | FSD 3.2.2 (TA) | UT-05, SIT-06 | ✅ |
| UC-03 (US-03 moves, main flow) | FSD 3.3.2 | PBT-02, UT-09 → UT-12, IT-02, IT-04 | ✅ |
| UC-03 AF-1/AF-2/AF-3 (alt kernel home / rename / budget duplicate) | FSD 3.3.2 | IT-02, IT-04, SIT-01 | ✅ |
| UC-03 EF-1/EF-2/EF-3 (wiring/stream/left-behind → STOP) | FSD 3.3.2 | UT-09, UT-11, SIT-01 | ✅ |
| UC-04 (freeze, main flow) | FSD 3.4.2 | IT-02, IT-05, IT-06, SIT-07 | ✅ |
| UC-04 AF-1 (flat vs legacy config) | FSD 3.4.2 | IT-05 | ✅ |
| UC-04 EF-1/EF-2 (false-positive / hardcoded found) | FSD 3.4.2 | IT-05, IT-06 | ✅ |
| BR-01 (move-as-is) | FSD 3.1.3 | SIT-01 | ✅ |
| BR-02 (timeouts 60 000 / 10 000) | FSD 3.1.3 | PBT-03, UT-01, UT-03, E2E-API-03 | ✅ |
| BR-03 (interceptors frozen) | FSD 3.1.3 | PBT-01, UT-04, UT-05, SIT-06 | ✅ |
| BR-04 (availability guard) | FSD 3.1.3 | UT-06 | ✅ |
| BR-05 (grep old path = 0) | FSD 3.1.3 | IT-01 | ✅ |
| BR-06 (history preserved) | FSD 3.1.3 | SIT-02 | ✅ |
| BR-10 (decision order frozen) | FSD 3.2.3 | UT-07 | ✅ |
| BR-11 (chaining deny + inner allowlist) | FSD 3.2.3 | UT-07, SIT-03 | ✅ |
| BR-12 (`bridgeRequiresApproval`) | FSD 3.2.3 | UT-07, SIT-03, SIT-04 | ✅ |
| BR-13 (audit keys-only, 1/invocation) | FSD 3.2.3 | UT-07, SIT-03, SIT-05 | ✅ |
| BR-14 (timeout/interceptor gains, no opt-out) | FSD 3.2.3 | UT-01, E2E-API-03 | ✅ |
| BR-15 (no hard-coded URL) | FSD 3.2.3 | IT-03, IT-06, IT-09 | ✅ |
| BR-16 (search semantics) | FSD 3.2.3 | UT-08, E2E-API-04 | ✅ |
| BR-20 (US-03 move-as-is) | FSD 3.3.3 | SIT-01 | ✅ |
| BR-21 (provider resolution frozen) | FSD 3.3.3 | UT-11 | ✅ |
| BR-22 (secrets frozen) | FSD 3.3.3 | UT-11, UT-12 | ✅ |
| BR-23 (URL SSRF fail-closed) | FSD 3.3.3 | UT-12 | ✅ |
| BR-24 (stream frozen) | FSD 3.3.3 | UT-09 | ✅ |
| BR-25 (budget frozen) | FSD 3.3.3 | PBT-02, UT-10 | ✅ |
| BR-26 (type shapes frozen) | FSD 3.3.3 | IT-10 | ✅ |
| BR-27 (pure-graph NOT moved) | FSD 3.3.3 | SIT-01 | ✅ |
| BR-30 (no new `langgraph/` imports) | FSD 3.4.3 | IT-02, IT-05 | ✅ |
| BR-31 (`.js` + deep paths covered) | FSD 3.4.3 | IT-02, IT-05 | ✅ |
| BR-32 (intra-legacy stays clean) | FSD 3.4.3 | IT-05 | ✅ |
| BR-33 (README names paths + refs) | FSD 3.4.3 | SIT-07 | ✅ |
| BR-34 (tokens from API only) | FSD 3.4.3 | UT-12, IT-06 | ✅ |
| BR-35 (only `9181` in `package.json`) | FSD 3.4.3 | IT-06 | ✅ |
| US-01 AC-1/2/3/4 | BRD 2.3 STORY 1 | SIT-02 / IT-01+IT-04 / E2E-API-01+02 / UT-01 → UT-06 | ✅ |
| US-02 AC-1/2/3/4 | BRD 2.3 STORY 2 | IT-03 / UT-07+SIT-03 / E2E-API-03 / IT-06 | ✅ |
| US-03 AC-1/2/3/4 | BRD 2.3 STORY 3 | IT-02+IT-04 / UT-09 → UT-12 / UT-07 (adapter compiles) / SIT-01 | ✅ |
| US-04 AC-1/2/3/4 | BRD 2.3 STORY 4 | IT-05 / SIT-07 / IT-06 / IT-05 | ✅ |
| TC-MOVE-01 → 07 | FSD §10 | IT-01 → IT-07 | ✅ |
| TC-BR-01/02, TC-PI-01/02/03, TC-PROV-01, TC-STREAM-01, TC-BUDGET-01, TC-E2E-01, TC-HIST-01 | FSD §10 | PBT + UT + E2E-API + SIT-02 (see STP §3.3) | ✅ |
| SEC-332-01 High | SECURITY-REVIEW | UT-04, PBT-01, SIT-06, SIT-08 | ✅ |
| SEC-332-02 High | SECURITY-REVIEW | UT-05, SIT-06, SIT-08 | ✅ |
| SEC-332-03 High | SECURITY-REVIEW | UT-07, SIT-03, SIT-04, SIT-08 | ✅ |
| SEC-332-09 High (conditional) | SECURITY-REVIEW | IT-03, IT-06, IT-09, SIT-08 | ✅ |
| SEC-332-04/05/06/08/10 Med | SECURITY-REVIEW | SIT-05 / IT-02 / IT-05 / SIT-06+SIT-08 / SIT-06+SIT-08 | ✅ |
| SEC-332-07/11/12 Low | SECURITY-REVIEW | UT-11 / IT-07 / IT-08 | ✅ |
| OPEN-01 → 06 | FSD §11.6 | IT-08 / E2E-API-01+02 / IT-05 / IT-01+02 / UT-07+SIT-03 / IT-07 | ✅ |
| NFR parity (60 s/10 s, import-only diff) | FSD §8 | PBT-03, UT-01/03, E2E-API-03, SIT-01 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| User Stories (US-01 → 04) | 4 | 4 | 100% |
| Use Cases (UC-01 → 04 + AF/EF) | 4 UCs, 32 flows | 32 | 100% |
| Business Rules (BR-01 → 35) | 29 listed | 29 | 100% |
| FSD Gates (TC-MOVE/BR/PI/PROV/STREAM/BUDGET/E2E/HIST) | 17 | 17 | 100% |
| Security findings (4 High + 5 Med + 3 Low) | 12 | 12 | 100% |
| Open Issues (OPEN-01 → 06) | 6 | 6 | 100% |
| BRD Acceptance Criteria (4 stories × 4 ACs) | 16 | 16 | 100% |
| **Overall** | **—** | **—** | **100%** |

---

## 11. Appendix

### 11.1 Test Data Files (CSVs cover every TC ID)

| File (absolute) | Covers |
|-----------------|--------|
| `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\testdata\pre-seeded-data.csv` | Baseline: repo state, file inventory, green-suite list (entry for all phases) |
| `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\testdata\move-gates-testdata.csv` | IT-01, IT-02, IT-03, IT-04, IT-07, IT-10 |
| `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\testdata\bridge-behavior-testdata.csv` | PBT-01, PBT-03, UT-01, UT-02, UT-03, UT-04, UT-05, UT-06 |
| `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\testdata\pi-cutover-testdata.csv` | UT-07, UT-08, E2E-API-01, E2E-API-02, E2E-API-03, E2E-API-04 |
| `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\testdata\providers-stream-budget-testdata.csv` | PBT-02, UT-09, UT-10, UT-11, UT-12 |
| `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\testdata\security-gates-testdata.csv` | UT-12-scan, IT-05, IT-06, IT-08, IT-09, SIT-04, SIT-05 |
| `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\testdata\manual-sit-testdata.csv` | SIT-01, SIT-02, SIT-03, SIT-06, SIT-07, SIT-08 |

Verification: every ID (PBT-01 → 03, UT-01 → 12, IT-01 → 10, E2E-API-01 → 04, SIT-01 → 08) appears in ≥1 CSV. E2E-UI has 0 cases by design (§5).

### 11.2 Environment Configuration

- Working directory for gates: `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\extension\` for `npm run compile` (`tsc -p ./`), `npm run test`, `npm run lint`.
- Grep scope: `extension/src --include=*.ts` with `grep -v "src/langgraph/"` allowlist for intra-legacy.
- `madge`: `npx -y madge@8.0.0 --circular extension/src/mcp/` (pinned, no `package.json` change).
- Mocks follow the healthy `mcp-bridge.test.ts` pattern: `vi.mock("vscode")` (workspaceFolders), `vi.mock("fs")` (existsSync/readFileSync/writeFileSync/mkdirSync), `mcpManagerMock { status: "running", port, invokeTool: vi.fn() }`, `global.fetch = vi.fn()`.
- Execution tracking: `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254\documents\SA4E-332\TEST-REPORT-SA4E-332.csv` (all rows `NOT_RUN` initially; evidence dir `.../evidence/`).
