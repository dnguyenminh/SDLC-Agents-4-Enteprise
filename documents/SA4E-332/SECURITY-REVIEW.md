# 🔒 Security Design Review — SA4E-332 Shared Kernel Extraction (Epic SA4E-289 Option C)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise |
| Ticket | SA4E-332 — Shared kernel extraction (move McpBridge/providers/stream-handler out of langgraph) |
| Epic | SA4E-289 Migrate LangGraph -> Pi SDK (Option C) |
| Scope | TDD v1.1 FINAL + FSD v1.2 + BRD v1.0 + verified code (pre-move tree, workspace SA4E-254) |
| Date | 2026-09-27 |
| Assessor | Security Agent |
| Version | 1.0 |
| Status | Final — design review only, NO code/TDD modified |
| Verdict | **CONDITIONAL PASS** (see § Verdict) |

## Executive Summary

SA4E-332 is a **pure relocation + transport-swap** ticket (`git mv` + import-specifier-only diff, one intentional thin adapter `McpBridgeCaller`). The design is **security-honest**: TDD §3.2/§7.1/§12 explicitly freezes current semantics (timeouts, interceptors, SEC-324-03 order, error strings) and forbids behavior fixes inside the move ("any behavior diff → STOP, file separate ticket").

Reviewed against the 5 requested questions:

1. **Move carries vulnerabilities as-is (by design).** `mcp-bridge.ts` interceptors (`_as_path` arbitrary file read, `_filename` path traversal on write, unbounded base64 decode) contain **no `realpath` containment, no workspace containment, no filename sanitization, no size caps**. Move-as-is preserves them byte-identically into `extension/src/mcp/`. TDD does not claim to fix them — correct to flag as **carried debt requiring separate tickets**, not as a reason to mislabel the move itself as "introducing" them — **except one amplification**: after Pi cutover, the `_as_path` file-read capability becomes reachable from **Pi LLM-controlled params** (previously only LangGraph nodes), widening exploitability.
2. **`McpBridgeCaller` adapter does NOT weaken SEC-324-03 order — but the frozen order itself has two pre-existing gaps that the move preserves.** Decision order (chaining-deny → validate → chained-target allowlist → approval → audit → transport) is correctly kept above the transport line. However: (a) `validateParams` failure returns **without any audit entry**, breaking the "exactly one audit per invocation" invariant; (b) **absent `approvalHook` = auto-approved** even for `mem_ingest`/`execute_dynamic_tool` (fail-open). Both must be fixed outside this ticket but gated as conditions.
3. **Import rewrites create no new runtime cycle and minimal attack-surface change.** `mcp-types.ts` single-owner resolution is correct (all 7 `import type` re-pointed; kernel grep `vscode/tool-registry` = 0). No new network/fs endpoints. One caveat: stock `no-restricted-imports` **does not cover `require()`** (providers use lazy `require("./...")`), leaving a bypass path.
4. **Lint + README FROZEN is necessary but not sufficient as specified.** TDD Option B + script fix + test-dir override + fixture proof is the right shape, but still leaves: broken `lint` script (`--ext` removed in v9 — rule currently unrunnable), blanket `**/*.js` ignore hiding checked-in artifacts, `madge` via unauthenticated `npx -y`, and README as advisory-only. All fixable in-ticket (checklist phase 5).
5. **Secrets handling is sound in moved code, with two loopback literals to clean.** `getSecretKey` via `SecretStorage`, `PROVIDER_BASE_URL_KEYS` + `validateProviderBaseUrl` SSRF guard, `IServerManager.port` resolution are all preserved. Remaining literals: `kiro` gateway default `http://127.0.0.1:8990/anthropic` and `ollamaUrl` default `http://localhost:11434` in `providers/index.ts` (loopback-only, Low). Deleting `mcp-wrapper-client.ts` **removes** the hardcoded `127.0.0.1:9181` — a net gain.

**Overall Risk Rating: Medium** (no Critical; 4 High carried/conditional; all exploitable only by callers that can already invoke tools, and all fixable without changing this ticket's move plan).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 4 (SEC-332-01, 02, 03, 09*) |
| 🟡 Medium | 5 (SEC-332-04, 05, 06, 08, 10) |
| 🔵 Low | 3 (SEC-332-07, 11, 12) |
| ℹ️ Informational | 2 (SEC-332-I1, I2) |

\* SEC-332-09 is a *design-condition* High (becomes High only if DEV falls back to hardcoded URL when `serverManager` is missing).

**What the design does well (acknowledged):** `McpToolDefinition` single-owner correctly kills the `mcp-bridge ↔ tool-registry` cycle; `validateParams` 4000-char cap + keys-only audit + `TOOL_ALLOWLIST` deny-by-default + `provider-url-policy` reuse of `validateBackendUrl`/`isLoopbackHost` (with `isIP` fix) + `WorkspaceTrustGuard` untouched + `git mv` history gate + three-pattern grep sweep (`.js` + relative forms) are all mature. Deleting the wrapper removes an SSRF/hang surface (no timeout → 60 s/10 s gains).

## Findings Summary Table

| ID | Title | Severity | CVSS | OWASP 2021 | Location | Remediation (short) |
|----|-------|----------|------|------------|----------|---------------------|
| SEC-332-01 | `_as_path` arbitrary file read — no realpath/workspace containment, no symlink/size guard (carried + amplified to Pi path) | High | 7.5 | A01 Broken Access Control / A04 Insecure Design | `extension/src/langgraph/core/mcp-bridge.ts:62-80` → moves to `extension/src/mcp/mcp-bridge.ts` (same lines) | Separate ticket: realpath + workspace containment + symlink reject + size cap + allowlist; do NOT fix inside move |
| SEC-332-02 | `_filename` path traversal on `_base64_file` write (`path.join(tmpDir, filename)` unsanitized) | High | 7.0 | A01 / A03 Injection | `extension/src/langgraph/core/mcp-bridge.ts:95-96` → `extension/src/mcp/mcp-bridge.ts` | Separate ticket: `basename` + allowlist `^[A-Za-z0-9._-]{1,64}$` + stay-in-dir check; do NOT fix inside move |
| SEC-332-03 | Fail-open approval: absent `approvalHook` = auto-approved even for `mem_ingest` / `DYNAMIC_TOOL_NAME` | High | 7.1 | A01 Broken Access Control | `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:83-84` (frozen by TDD §3.4) | Separate ticket: fail-closed when hook missing for gated tools, or document explicit risk acceptance + wire hook at entry |
| SEC-332-04 | `validateParams` failure returns with NO audit entry (breaks "exactly one audit" invariant) | Medium | 5.3 | A09 Logging & Monitoring Failures | `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:106-112` | Add `audit({toolName, argKeys: Object.keys(params), decision:"denied"})` on validation-fail path (separate ticket; one-line, keeps payload shape) |
| SEC-332-05 | `no-restricted-imports` does not cover `require()` — providers use lazy `require`, bypass possible | Medium | 5.0 | A05 Misconfiguration | `extension/eslint.config.js` (TDD §7.3 snippet) + `extension/src/langgraph/providers/index.ts:64,74,78,85,97,112` | Add `no-restricted-require` / custom rule or ban `require(".*langgraph.*")` + grep gate for `require.*langgraph` |
| SEC-332-06 | `lint` script broken (`--ext` removed in ESLint v9) + blanket `**/__tests__/**` ignore → freeze rule currently unrunnable / blind in test dirs | Medium | 5.0 | A05 Misconfiguration | `extension/package.json:465-466`, `extension/eslint.config.js:4` | Fix in-ticket per TDD §7.3/OPEN-03: `"lint":"npx eslint src/"`, narrow ignores, add test-dir override, prove fixture FAIL + tree PASS |
| SEC-332-08 | Unbounded base64 decode on `_base64_file` (no size cap → memory/DoS) + `Date.now()` filename collisions | Medium | 5.7 | A04 Insecure Design | `extension/src/langgraph/core/mcp-bridge.ts:82-109` | Separate ticket: byte cap (e.g. 10 MB pre-decode), reject oversize with `Proxy Error`, add random suffix to fallback filename |
| SEC-332-09 | `BridgeOptions.serverManager` required but no fail-closed specified — DEV may fallback to hardcoded URL | High (conditional) | 7.4 if fallback added | A01 / A05 | TDD §3.3/`mcp-bridge-extension.ts:153-154` (design, not yet code) | TDD/DEV must throw when `serverManager` missing; forbid fallback to `createMcpClient()`/literal URL; gate `grep 127.0.0.1:9181 extension/src = 0` |
| SEC-332-10 | `_as_path` TOCTOU (`existsSync` → `readFileSync`) + `console.error` leaks absolute path | Medium | 4.8 | A09 / A04 | `extension/src/langgraph/core/mcp-bridge.ts:68-72` | Separate ticket: single `try{readFileSync}` without `existsSync`, log basename only, handle EISDIR/ENOSPC distinctly |
| SEC-332-07 | Hardcoded loopback defaults `http://127.0.0.1:8990/anthropic` (kiro) + `http://localhost:11434` (ollama) | Low | 3.1 | A05 Misconfiguration | `extension/src/langgraph/providers/index.ts:35,84` → `extension/src/mcp/providers/index.ts` | Move to settings defaults (`package.json`) or named constants; keep loopback-only; add to secret/URL scan allowlist explicitly |
| SEC-332-11 | Checked-in stale `.js` (`extension/tests/mcp-bridge.test.js:57`) invisible to lint (`**/*.js` ignore) | Low | 2.5 | A05 / A08 Integrity | `extension/tests/mcp-bridge.test.js:57`, `extension/eslint.config.js:4` | In-ticket per TC-MOVE-07/DISC-03: delete both stale files, keep `**/*.js` ignore only for genuine build output |
| SEC-332-12 | `madge` via `npx -y madge@8.0.0` (unauthenticated fetch, no integrity pin) + no cycle gate for `require()` edges | Low | 3.3 | A08 Integrity | TDD §7.5/§5.6 | Pin as devDependency with lockfile hash, or verify shasum in CI; document that type-only cycles are compile-time only |
| SEC-332-I1 | `JSON.parse(JSON.stringify(args))` deep-clone drops `undefined`/functions — safe for `__proto__` (own-property, not pollution) but lossy | Informational | 0.0 | — | `extension/src/langgraph/core/mcp-bridge.ts:38` | No action in move; if hardening later, use `structuredClone` + explicit `__proto__`/`constructor` key drop |
| SEC-332-I2 | `listTools()` loopback POST `http://127.0.0.1:{port}/mcp` with numeric `port` — SSRF minimal; `Date.now()` as JSON-RPC id kept | Informational | 0.0 | A10 SSRF | `extension/src/langgraph/core/mcp-bridge.ts:129-138` | No action; ensure `port` stays `number\|null` (never string URL), keep `AbortController` 10 s |

## Detailed Findings

### Finding SEC-332-01: `_as_path` arbitrary file read without containment (carried, amplified) — High

| Attribute | Value |
|-----------|-------|
| Severity | High |
| OWASP | A01:2021 Broken Access Control / A04 Insecure Design |
| CWE | CWE-73 (External Control of File Name), CWE-22 (Path Traversal), CWE-59 (Link Following) |
| CVSS | 7.5 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N — tool invoker can read host files) |
| Location | `extension/src/langgraph/core/mcp-bridge.ts:62-80` → `extension/src/mcp/mcp-bridge.ts` (move-as-is) |
| Status | Open (pre-existing; move preserves; exploitability widened by Pi cutover) |

**Description:**
`interceptRequestArgs` converts any key ending `_as_path` into a `fs.readFileSync(filePath, "base64")` with zero validation: no workspace-root containment, no `realpath` canonicalization (the SEC-324-02-style fix is absent here), no symlink rejection, no file-size cap, no readable-directory allowlist. Recursive descent (including arrays) means nested attacker keys also trigger. The `existsSync` pre-check is TOCTOU and adds nothing.

Today only LangGraph nodes reach this transport. After UC-02 cutover, **Pi LLM-controlled `params`** flow through the same `callTool`, so a prompt-injected or malicious tool argument can exfiltrate `/etc/passwd`, `~/.aws/credentials`, `C:\Users\*\AppData\...`, `.env`, private keys into base64 tool args sent to the MCP server.

**Evidence:**
```typescript
// extension/src/langgraph/core/mcp-bridge.ts:62-80 — VULNERABLE (no containment)
private interceptRequestArgs(args: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(args)) {
    if (key.endsWith("_as_path")) {
      const originalKey = key.replace("_as_path", "");
      const filePath = args[key] as string;
      try {
        if (fs.existsSync(filePath)) {                       // TOCTOU, no realpath
          args[originalKey] = fs.readFileSync(filePath, "base64"); // arbitrary read, no size cap
        }
      } catch (e) {
        console.error(`[McpBridge] Failed to read ${filePath} for base64 translation:`, e);
      }
      delete args[key];
    } else if (typeof args[key] === "object" && args[key] !== null) {
      args[key] = this.interceptRequestArgs(args[key] as Record<string, unknown>); // recursion incl. arrays
    }
  }
  return args;
}
```

**Impact:** Confidential file disclosure to MCP backend / LLM context (ties directly into the SEC-325-01 cross-ticket chain: poisoned KB → file read → prompt exfiltration). No privilege escalation beyond extension-host FS permissions, but extension host can read user secrets.

**Remediation (SEPARATE ticket — DO NOT bundle into SA4E-332 move per "move nguyên trạng"):**
```typescript
import * as fs from "fs";
import * as path from "path";
const MAX_AS_PATH_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_READ_ROOTS: string[] = [workspaceRoot, path.join(workspaceRoot, "documents")];

function safeReadAsPath(filePath: string, workspaceRoot: string): string | null {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.length > 1024) return null;
  let real: string;
  try {
    real = fs.realpathSync(filePath); // canonicalize + resolve symlinks
  } catch { return null; }
  const allowed = ALLOWED_READ_ROOTS.some((root) => {
    const r = fs.realpathSync(root);
    return real === r || real.startsWith(r + path.sep);
  });
  if (!allowed) return null;
  const stat = fs.statSync(real);
  if (!stat.isFile() || stat.size > MAX_AS_PATH_BYTES) return null;
  return fs.readFileSync(real, "base64");
}
// Replace existsSync+readFileSync with safeReadAsPath; on null → drop key + audit (basename only in logs).
```
Also: log `path.basename` only (never absolute path), emit a `BridgeAuditEntry`-adjacent debug with `decision:"denied"` for dropped keys, add unit tests for `../../etc/passwd`, symlink-escape, oversized file.

**References:** CWE-73, CWE-59, OWASP A01; prior KB `mem_search` SEC-325-01 (uncontained `fs.readFileSync`).

---

### Finding SEC-332-02: `_filename` path traversal on `_base64_file` write — High

| Attribute | Value |
|-----------|-------|
| Severity | High |
| OWASP | A01 / A03 Injection |
| CWE | CWE-22 (Improper Limitation of Pathname), CWE-73 |
| CVSS | 7.0 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:H/A:L — arbitrary file write as extension host) |
| Location | `extension/src/langgraph/core/mcp-bridge.ts:95-96` → `extension/src/mcp/mcp-bridge.ts` |
| Status | Open (carried) |

**Description:**
`interceptResponse` does `path.join(tmpDir, filename)` where `filename = resultObj._filename || output_{Date.now()}.bin` comes from the MCP server response (remote-influenced). No `basename`, no character allowlist, no stay-in-dir check. `_filename: "../../.vscode/settings.json"` or `"..\\..\\startup.bat"` escapes `documents/tmp/`. Write is `Buffer.from(b64,"base64")` unbounded (see SEC-332-08).

**Evidence:**
```typescript
// mcp-bridge.ts:92-99
const tmpDir = path.join(workspaceRoot, "documents", "tmp");
if (!fs.existsSync(tmpDir)) { fs.mkdirSync(tmpDir, { recursive: true }); }
const filename = resultObj._filename || `output_${Date.now()}.bin`; // attacker-controlled
const outPath = path.join(tmpDir, filename);                        // traversal: ../../ escapes tmpDir
fs.writeFileSync(outPath, Buffer.from(resultObj._base64_file, "base64")); // unbounded
```

**Impact:** Arbitrary file write within extension-host permissions (overwrite settings, plant startup scripts, poison workspace). MCP server compromise → host compromise.

**Remediation (SEPARATE ticket):**
```typescript
function safeOutPath(tmpDir: string, rawName: unknown): string {
  const fallback = `output_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.bin`;
  const name = typeof rawName === "string" && /^[A-Za-z0-9._-]{1,64}$/.test(rawName) ? rawName : fallback;
  const candidate = path.join(tmpDir, path.basename(name));
  const realTmp = fs.realpathSync(tmpDir);
  const realOut = path.normalize(candidate);
  if (realOut !== realTmp && !realOut.startsWith(realTmp + path.sep)) throw new Error("path escape");
  return realOut;
}
```
Enforce byte cap before decode; return `Proxy Error` without leaking base64 (already done — keep).

---

### Finding SEC-332-03: Fail-open approval when `approvalHook` absent — High

| Attribute | Value |
|-----------|-------|
| Severity | High |
| OWASP | A01 Broken Access Control |
| CWE | CWE-862 (Missing Authorization) |
| CVSS | 7.1 (AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:N — gated tool executes without consent if entry mis-wired) |
| Location | `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:83-84` (frozen by TDD §3.4) |
| Status | Open (design preserved; entry wiring is the control) |

**Evidence:**
```typescript
// mcp-bridge-extension.ts:78-87
async function checkApproval(toolName, params, options?): Promise<...> {
  if (!bridgeRequiresApproval(toolName)) return { approved: true, decision: "auto-approved" };
  if (!options?.approvalHook) return { approved: true, decision: "auto-approved" }; // FAIL-OPEN
  const ok = await options.approvalHook(toolName, params);
  return ok ? { approved: true, decision: "approved" } : { approved: false, decision: "denied" };
}
// bridgeRequiresApproval("mem_ingest") === true, but with no hook it auto-approves.
```

**Impact:** If DEV wires `mcpBridgeExtension({pi}, { serverManager })` without an `approvalHook` (TDD only adds `serverManager` as required, hook stays optional), `mem_ingest` (KB poisoning vector) and `execute_dynamic_tool` (chaining) execute silently. The cross-ticket attack chain (KB poison → search → self-certified confidence → compaction persistence) depends on `mem_ingest` being gated.

**Remediation (SEPARATE ticket or TDD addendum — no code change in this review):**
```typescript
// Fail-closed for gated tools:
if (!options?.approvalHook) {
  // Option A (strict): deny gated tools when no hook is wired
  if (bridgeRequiresApproval(toolName)) return { approved: false, decision: "denied" };
  return { approved: true, decision: "auto-approved" };
}
// + at entry: if (!options?.approvalHook) console.warn("[Security] approvalHook missing — gated tools will DENY");
```
Minimum for SA4E-332: document in TDD §3.4 that production entry MUST pass `approvalHook`, add a startup assertion/test for it, and record risk acceptance if fail-open is kept.

---

### Finding SEC-332-04: Validation failure emits no audit (A09 gap) — Medium

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A09 Security Logging and Monitoring Failures |
| CWE | CWE-778 (Insufficient Logging) |
| CVSS | 5.3 (AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:N + detection bypass) |
| Location | `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:106-112` |
| Status | Open (carried) |

**Evidence:** chaining-deny (line 102), chained-target deny (117), approval (123) all audit; `validateParams` fail (106-112) returns `validation` with no `audit(...)`. FSD BR-13 / TDD §7.1 claim "exactly one audit per invocation" — false for this branch. Attacker can fuzz oversized/malformed params (4000-char cap probing) without trace.

**Remediation (separate ticket, one line):**
```typescript
const validation = validateParams(parametersSchema as any, params);
if (!validation.valid) {
  audit({ toolName, argKeys: Object.keys(params), decision: "denied" });
  return { content: [{ type: "text" as const, text: `Validation failed: ${validation.error}` }], details: { error: "validation", toolName } };
}
```

---

### Finding SEC-332-05: Lint freeze bypass via `require()` — Medium

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A05 Security Misconfiguration |
| CWE | CWE-693 (Protection Mechanism Failure) |
| CVSS | 5.0 |
| Location | `extension/eslint.config.js` (TDD §7.3 snippet), `extension/src/langgraph/providers/index.ts:64,74,78,85,97,112` (`require("./...")` precedent) |
| Status | Open (design gap) |

**Description:** `no-restricted-imports` only checks `import` statements, not `require()` calls. Providers already use lazy `require("./anthropic-provider")`; a future `require("../langgraph/core/mcp-bridge")` bypasses the freeze silently. TDD sweep grep covers `from.*langgraph/` (import syntax) but TC-MOVE-02 must also cover `require.*langgraph`.

**Remediation (in-ticket, cheap):**
```js
// eslint.config.js — add alongside no-restricted-imports:
'no-restricted-require': ['error', { patterns: ['**/langgraph/**'] }],
// or if plugin unavailable, add CI grep gate:
// grep -rn "require.*langgraph" extension/src --include=*.ts  # expect 0 outside src/langgraph/
```

---

### Finding SEC-332-06: Lint gate currently unrunnable + test-dir blind — Medium

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A05 |
| CWE | CWE-693 |
| CVSS | 5.0 |
| Location | `extension/package.json:465` (`"lint": "npx eslint src/ --ext .ts"`), `extension/eslint.config.js:4` (`'**/__tests__/**'`) |
| Status | Open (TDD OPEN-03 plans fix — must be verified, not assumed) |

**Description:** `--ext` was removed in ESLint v9 flat mode — `npm run lint` errors before checking anything, so the freeze rule is currently decorative. Blanket `**/__tests__/**` ignore means a `langgraph` import smuggled into any test dir never fires. TDD Option B + script fix + override is correct; this finding tracks that DEV must actually do checklist steps 2-5 and record fixture-FAIL + tree-PASS outputs in the PR, otherwise CONDITIONAL PASS becomes BLOCKED at merge.

**Remediation (in-ticket, per TDD §7.3):** `"lint": "npx eslint src/"`, delete `**/__tests__/**` blanket entry (keep `**/*.js` only for genuine build output post-TC-MOVE-07), add override carrying the same two patterns for `src/**/__tests__/**/*.ts` + `tests/**/*.ts`.

---

### Finding SEC-332-08: Unbounded base64 decode (DoS) — Medium

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A04 Insecure Design |
| CWE | CWE-400 (Uncontrolled Resource Consumption), CWE-789 (Memory Allocation without Limits) |
| CVSS | 5.7 |
| Location | `extension/src/langgraph/core/mcp-bridge.ts:82-109` |
| Status | Open (carried) |

**Description:** No pre-decode length check on `_base64_file`. A compromised/malicious MCP response with a 500 MB base64 string causes `Buffer.from(..., "base64")` to balloon memory in the extension host (DoS). Fallback filename `output_{Date.now()}.bin` collides under burst (same ms) → overwrite.

**Remediation (separate ticket):** reject `resultObj._base64_file.length > 14_000_000` (~10 MB decoded) with `Proxy Error: base64 payload exceeds limit`; add `randomBytes(4).toString("hex")` to fallback name.

---

### Finding SEC-332-09: Missing `serverManager` fail-closed (conditional High)

| Attribute | Value |
|-----------|-------|
| Severity | High (conditional — only if DEV adds fallback) |
| OWASP | A01 / A05 |
| CWE | CWE-1188 (Insecure Default Initialization) |
| CVSS | 7.4 (if fallback to hardcoded URL reintroduced) |
| Location | TDD §3.3 + `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:153-154` (future `BridgeOptions.serverManager`) |
| Status | Design condition — must be enforced |

**Description:** Current entry `mcpBridgeExtension({pi}, options?)` builds `createMcpClient()` (hardcoded `127.0.0.1:9181`). TDD replaces with `new McpBridge(serverManager)` and marks `serverManager` required. If DEV implements "required" as optional-with-fallback (`?? createMcpClient()`), the hardcoded-URL + no-timeout surface returns. TDD text says "required; tests inject mock" but shows no `throw` contract.

**Remediation (TDD addendum, no logic change beyond fail-closed):**
```typescript
export interface BridgeOptions { serverManager: IServerManager; /* ...existing... */ }
export default function mcpBridgeExtension({ pi }: PiExtensionContext, options: BridgeOptions) {
  if (!options?.serverManager) throw new Error("[Security] McpBridge requires IServerManager (no hardcoded fallback)");
  const bridge = new McpBridge(options.serverManager);
  // ...
}
// Gate: grep -rn "127\\.0\\.0\\.1:9181" extension/src  → 0 hits; grep "createMcpClient" prod → 0 hits.
```

---

### Finding SEC-332-10: `_as_path` TOCTOU + path leak in logs — Medium

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP | A09 / A04 |
| CWE | CWE-367 (TOCTOU), CWE-532 (Log Injection of Sensitive Info) |
| CVSS | 4.8 |
| Location | `extension/src/langgraph/core/mcp-bridge.ts:68-72` |
| Status | Open (carried) |

**Evidence:** `existsSync` then `readFileSync` (race window; EISDIR handled only by catch-all). `console.error` logs full absolute `filePath` (may disclose username/host layout in shared logs).

**Remediation (separate ticket):** single `try { readFileSync } catch` (drop `existsSync`), log `path.basename` + `code` only.

---

### Finding SEC-332-07: Hardcoded loopback defaults (kiro 8990 / ollama 11434) — Low

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A05 |
| CWE | CWE-547 (Hardcoded ценности) |
| CVSS | 3.1 (loopback-only, no creds) |
| Location | `extension/src/langgraph/providers/index.ts:35,84` → `extension/src/mcp/providers/index.ts` |
| Status | Open (carried) |

**Evidence:**
```typescript
const ollamaUrl = config.get<string>("ollamaUrl", "http://localhost:11434"); // :35
const gatewayUrl = anthropicBaseUrl || config.get<string>("anthropicBaseUrl", "http://127.0.0.1:8990/anthropic"); // :84
```
Loopback-only so SSRF impact minimal, but violates BR-35 single-source-of-truth (only `9181` allowlisted) and will trip naive secret/URL scans. Move explicitly in scan allowlist or lift to `package.json` defaults.

---

### Finding SEC-332-11: Stale checked-in `.js` invisible to gates — Low

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A05 / A08 Software & Data Integrity |
| CWE | CWE-1104 (Use of Unmaintained Third-Party Components — here, stale artifact) |
| CVSS | 2.5 |
| Location | `extension/tests/mcp-bridge.test.js:57` (`require ../src/langgraph/core/base-node`), `extension/eslint.config.js:4` |
| Status | Open (TDD TC-MOVE-07 + DISC-03 plans DELETE — verify) |

**Remediation (in-ticket):** delete `extension/tests/mcp-bridge.test.ts` + `.js` (FSD v1.2 DISC-01/03), keep `**/*.js` ignore only for genuine build output, gate `grep require.*langgraph/core/base-node = 0`.

---

### Finding SEC-332-12: `madge` via `npx -y` supply-chain — Low

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A08 |
| CWE | CWE-829 (Untrusted Download) |
| CVSS | 3.3 |
| Location | TDD §7.5 / §5.6 (`npx -y madge@8.0.0 --circular extension/src/mcp/`) |
| Status | Open (design choice) |

**Remediation:** prefer `devDependency` + lockfile (`npm i -D madge@8.0.0`), or pin shasum in CI. Note `madge` sees only `import`, not lazy `require` — pair with SEC-332-05 grep.

---

### Informational

- **SEC-332-I1:** `JSON.parse(JSON.stringify(args))` (mcp-bridge.ts:38) neutralizes `__proto__` pollution (becomes own property) but drops `undefined`/functions — acceptable for `Record<string,unknown>`; consider `structuredClone` + explicit `__proto__`/`constructor`/`prototype` drop in hardening ticket.
- **SEC-332-I2:** `listTools()` loopback POST with numeric `port` is minimal-SSRF; `Date.now()` JSON-RPC id collision under burst is harmless (no dedup logic). Keep `AbortController` 10 s. Ensure `port` type stays `number|null` (never string URL).

## Dependency Vulnerabilities

| Dependency | Current | Note |
|------------|---------|------|
| `undici` ^6.21.0, `ws` ^8.21.1, `@modelcontextprotocol/sdk` ^1.29.0, `@anthropic-ai/sdk` ^0.105.0 | extension/package.json | No CVE lookup performed in this static design review (no lockfile diff in scope). `fetch` used is Node native (not `undici` directly in moved code). Recommend `npm audit` in CI (out of scope for SA4E-332). |
| `madge` 8.0.0 (npx only) | TDD §7.5 | Not added to `package.json` by design — see SEC-332-12. |

No typosquatting observed. No new runtime dependencies introduced (constraint upheld).

## Security Headers Assessment

Not applicable — no HTTP server, no webview HTML, no CSP/HSTS surface in scope. Sole network hop is loopback `POST 127.0.0.1:{port}/mcp` with `Content-Type: application/json` (mcp-bridge.ts:129-138). `validateBackendUrl`/`validateProviderBaseUrl` HTTPS-remote enforcement (backend-url.ts + provider-url-policy.ts) is preserved by the move — verified sound (loopback check via `isIP`, explicit opt-in, fail-closed).

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P0 (in-ticket, merge-blocking) | SEC-332-06 lint runnable + test-dir override + fixture proof; SEC-332-11 stale `.js` delete (TC-MOVE-07); SEC-332-09 fail-closed `serverManager` (throw, no fallback) + URL grep 0 | Low | Freeze actually enforceable; no hardcoded-URL regression |
| P0 (in-ticket) | SEC-332-05 `require` gate (rule or grep) | Low | Closes freeze bypass |
| P1 (separate ticket, before Pi production wiring) | SEC-332-01 `_as_path` containment + SEC-332-02 `_filename` sanitization + SEC-332-08 size caps | Medium | Blocks arbitrary file read/write amplification via Pi LLM params |
| P1 (separate ticket) | SEC-332-03 fail-closed approval + SEC-332-04 audit on validation-fail | Low | Closes consent bypass + logging blind spot (KB-poison chain) |
| P2 | SEC-332-10 TOCTOU/log hygiene, SEC-332-07 loopback constants to settings, SEC-332-12 madge pin | Low | Defense-in-depth |

## Recommendations Summary

### Immediate Actions (in SA4E-332, merge-blocking)
1. Fix `lint` script + narrows ignores + test-dir override (SEC-332-06); record fixture-FAIL + tree-PASS in PR.
2. Delete `extension/tests/mcp-bridge.test.ts` + `.js` (SEC-332-11 / TC-MOVE-07); verify `require.*base-node` = 0.
3. Specify `serverManager` fail-closed throw (SEC-332-09); gate `127.0.0.1:9181` in `extension/src` = 0 and `createMcpClient` prod = 0.
4. Add `require.*langgraph` to lint-or-grep gates (SEC-332-05).

### Short-term (separate security tickets, before SA4E-289 production wiring)
1. File `_as_path` containment ticket (realpath + workspace roots + symlink + size cap) — SEC-332-01/10.
2. File `_filename` sanitization + base64 size-cap ticket — SEC-332-02/08.
3. File approval fail-closed + validation-audit ticket — SEC-332-03/04.

### Long-term Hardening
1. Pin `madge` with lockfile hash; consider `eslint-plugin-import/no-cycle` as permanent guard.
2. Lift `8990`/`11434` loopback defaults to `package.json` settings; extend secret/URL scan allowlist explicitly.
3. Evaluate `structuredClone` + `__proto__` drop + `WorkspaceTrustGuard` check for `_as_path` reads.

## Verdict: CONDITIONAL PASS

**CONDITIONAL PASS** — the TDD v1.1 design is **approved to proceed to implementation as specified (move-as-is + adapter + Option B lint + README + cycle/secret/grep gates), subject to:**

1. **In-ticket must-haves (verify at PR):** SEC-332-05, SEC-332-06, SEC-332-09, SEC-332-11 gates green (fixture FAIL + tree PASS recorded, `tsc` 0, all grep 0, `git log --follow` history, `git diff` import-specifiers-only).
2. **Separate tickets filed before merge (not bundled):** `_as_path`/`_filename`/size-cap hardening (SEC-332-01/02/08/10) and approval/audit hardening (SEC-332-03/04), both flagged as **blockers for SA4E-289 production wiring** (not for this move itself — the vulnerabilities exist today and the move does not worsen them beyond the noted Pi `_as_path` amplification, which the follow-ups close).
3. **No new behavior in move:** any `git diff` beyond specifiers + `McpToolDefinition` ownership + adapter + DI threading → STOP per TDD §11 phase gates.

**Not BLOCKED** because: no Critical, no new remote/network surface, SEC-324-03 semantics preserved in order, cycle correctly resolved, secrets path sound, and the Highs are carried debt with a honest "file separately" plan rather than introduced flaws. **Not full PASS** because: Pi `_as_path` amplification + fail-open approval + audit gap + unenforceable-lint-until-fixed leave residual risk that must be tracked, not waved through.

## Appendix

### A. Tools & Methodology
- Static design review (TDD v1.1 509 lines, FSD v1.2 926 lines, BRD, DISCREPANCY.md) + line-verified code reads (mcp-bridge.ts 182, mcp-bridge-extension.ts 189, mcp-wrapper-client.ts 76, search-provider.ts 137, kb-client.ts 100, pi-workflow-adapter.ts 246, tool-registry.ts 86, tool-definitions.ts 129, providers/index.ts 121, provider-url-policy.ts 30, backend-url.ts 124, WorkspaceTrustGuard.ts 47, package.json 511, eslint.config.js 23).
- KB search (`mem_search` SEC-324/MCP bridge) for SEC-324-02/03 context + cross-ticket chain (SA4E-324→330 summary).
- Grep sweeps: `realpath|existsSync|readFileSync|writeFileSync|_as_path|_base64_file`, `ApiKey|secret|token|127.0.0.1:9181`, `from.*langgraph/|TOOL_ALLOWLIST|approval|audit`.
- OWASP Testing Guide v4.2 (static) + OWASP Top 10 2021 mapping + CWE/CVSS per finding. No dynamic testing, no exploitation, no prod modification.

### B. Scope Limitations
- Pre-move tree only; post-move `extension/src/mcp/*` paths reviewed as design targets (files do not exist yet — line refs are `old → new` pairs).
- No lockfile/CVE scan (`npm audit` recommended in CI), no runtime/pen-test, no infra/network review beyond loopback POST.
- MCP protocol/backend, UI, DOCX/Jira attach out of scope per TDD §1.2.
- `realpath` "already fixed in SEC-324-02" premise refers to ONNX `modelId` containment (per KB SA4E-324 summary), not to `mcp-bridge.ts` — the bridge never had containment; nothing is "lost" in the move, but nothing is gained either. Flagged accordingly (SEC-332-01), not as regression.

### C. Glossary
- **Move-as-is (move nguyên trạng):** `git mv` + import-specifier-only diff.
- **McpBridgeCaller:** NEW thin adapter `McpCaller` ← `McpBridge.callTool` (sole intentional adaptation).
- **SEC-324-03:** allowlist + deny-dynamic-chaining + approval + keys-only audit (frozen).
- **FROZEN:** `langgraph/` post-extraction (no new importers; phased deletion under SA4E-289).
- **CVSS/CWE/OWASP:** scoring/weakness/top-10 standards (see per-finding rows).
