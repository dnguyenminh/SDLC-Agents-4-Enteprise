## Implementation Summary — SA4E-363 (MCP wrapper body cap 1 MB → 64 MB + clean HTTP 413)

### Root cause
`WrapperServer.readBody()` (extension/src/services/WrapperServer.ts) capped request bodies at
`MAX_BODY_SIZE = 1 MB` and called `req.destroy()` on exceed — socket torn down with no HTTP
response → client saw ECONNRESET ("connection forcibly closed") instead of a JSON-RPC error.
Blocked `export_docx` for any Markdown > ~1 MB (e.g. BRD-embedded.md, 1.57 MB with base64 PNGs).

### Fix (4-part validated design from .agents/tasks/docx-export-bodylimit/)
1. `DEFAULT_MAX_BODY_SIZE = 64 * 1024 * 1024` (below backend 100 MB ingress cap); instance
   `maxBodySize` from optional `WrapperServerDeps.maxBodyBytes` (default fallback). Strict `>`
   comparison on cumulative body bytes preserved (exactly-at-cap accepted).
2. `readBody()`: exported `BodyTooLargeError` sentinel (instanceof-matched). On exceed: latch
   flag, STOP buffering, FREE chunks (`chunks.length = 0`), then **bounded drain** of the
   remainder (variant a: drain-then-reject) before rejecting — the 413 is guaranteed deliverable,
   no mid-upload RST race. Drain bounded by `maxBodySize` extra bytes (~2× cap total → clean 413
   for AC-5's far-above probe) or 5 s (`DRAIN_TIMEOUT_MS`) — pathological infinite chunked flood
   → destroy AFTER the sentinel is latched (response path sees `res.destroyed` and stays silent).
   Never `req.destroy()` before the response is flushed.
3. `handleMcp()`: Content-Length pre-check before readBody (`Number(cl) > maxBodySize` →
   immediate 413, NaN/chunked falls through); the readBody await is wrapped in its OWN try/catch
   at the original call site (NOT inside the rpc-parsing try — its catch reads `rpc.id` =
   TypeError trap). `sendError()` extended with optional `status` param (backward compatible, 4
   existing call sites) + `Connection: close` when 413 + `res.destroyed` guard. 413 envelope:
   `{ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Request body too large (max <cap> bytes)" } }`
   — static message incl. effective cap, leaks nothing.
4. Optional setting `sdlcAgents.mcpMaxBodyBytes` (package.json: default 67108864, min 1048576,
   max 104857600): read in `startWrapper()` via exported `resolveMcpMaxBodyBytes()` —
   type-validated (string/NaN/non-integer/0/negative → default 64 MB) and clamped in code to
   [1 MiB, 100 MiB] (VS Code does not enforce manifest min/max). Restart-to-apply.

### Files modified (commit 5194d8d, branch SA4E-363)
- extension/src/services/WrapperServer.ts (+162/−15 region) — core fix
- extension/src/remote-backend-client.ts (+4) — setting wiring in startWrapper()
- extension/package.json (+7) — sdlcAgents.mcpMaxBodyBytes declaration
- extension/src/__tests__/wrapper-server.test.ts — TC-28 strengthened: own server capped at 1 MB
  (default is now 64 MB, a 1 MB+1 body is under-cap there — see IT-BODY-03), asserts 413 +
  Connection: close + exact JSON-RPC envelope
- extension/src/__tests__/wrapper-body-limit.test.ts (NEW, 243 lines) — IT-BODY-01..07 + 6 UTs
  for resolveMcpMaxBodyBytes clamp; reuses wrapper-server.helpers (MockDeps/postMcp/
  requestWithHeaders/sendRawRequest), 1 KB/4 KB injected caps (no 64 MB allocations)

### Test results
- wrapper-body-limit.test.ts + wrapper-server.test.ts: 53/53 PASS
- Full extension suite (npm test): 2917/2918 PASS; the single failure
  (pi-workflow/__tests__/pi-session-routing.test.ts "cloud provider with key") is PRE-EXISTING
  and caused by SA4E-364's uncommitted WIP (pi-workflow-adapter.ts passes 3 callbacks to
  promptTurn) — PROVEN independent of this change by stashing the 3 SA4E-363 production files
  and re-running: identical failure without them.
- tsc -p ./ (compile): clean.

### Orchestration note (for SM)
The working tree was switched to branch SA4E-364 (same commit cdccd97, no divergent commits)
mid-session by another session; SA4E-363 work was restored via targeted stash and committed on
SA4E-363 only. SA4E-364 WIP files remain uncommitted/untouched in the tree.
