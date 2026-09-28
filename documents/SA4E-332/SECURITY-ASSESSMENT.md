# 🔒 Security Assessment Report — SA4E-332 Shared Kernel Extraction (Code Review, Post-Implementation)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise |
| Ticket | SA4E-332 — Shared kernel extraction (move McpBridge/providers/stream-handler out of langgraph) |
| Epic | SA4E-289 Migrate LangGraph → Pi SDK (Option C) |
| Scope | Implemented code on branch `SA4E-332` HEAD `5537ed7` (kernel move `5b05539` + scope-narrow `5537ed7` on top of `1721971` decommission). Direct code reads only — DEV report NOT trusted. |
| Date | 2026-09-27 |
| Assessor | Security Agent (static code review, no exploitation, no code modified) |
| Version | 1.0 |
| Baseline | SECURITY-REVIEW.md v1.0 (3.7, design review, verdict CONDITIONAL PASS, 4 High) |
| Verdict | **CONDITIONAL** (merge allowed; Pi production wiring blocked until carried-High hardening tickets land) |

## Executive Summary

SA4E-332 implemented exactly what the 3.7 design promised: a **pure relocation + transport-swap** (`git mv` + import-specifier-only diff + one thin adapter `McpBridgeCaller` + `serverManager` fail-closed throw). Verified byte-level against pre-move tree (`79579bc:extension/src/langgraph/core/mcp-bridge.ts` vs `HEAD:extension/src/mcp/mcp-bridge.ts`): **only 4 import lines differ** (depth `../` → `../../` + `McpToolDefinition` owner `../vscode/tool-registry` → `./mcp-types`); interceptors, timeouts, error strings, SEC-324-03 order are **byte-identical**.

**Answer to the 6 audit questions:**

1. **`mcp-bridge.ts` (moved) — interceptors intact, timeouts intact, zero new containment (by design).** `_as_path` arbitrary-read (`:62-80`) and `_filename` traversal-write (`:95-96`) preserved as-is; `DEFAULT_TOOL_TIMEOUT_MS 60s` (`:16`) + `LIST_TOOLS_TIMEOUT_MS 10s` (`:19`) + `AbortController` (`:125-126`) + `timer.unref` (`:46`) all intact. No `realpath`/workspace-containment/`basename`/size-cap was added — correct per "move-as-is", but carried Highs SEC-332-01/02/08/10 remain open and are now reachable from **Pi LLM-controlled params** via the cutover (amplification noted in 3.7, confirmed real).
2. **SEC-324-03 order intact after cutover; `serverManager` fail-closed CLOSED.** `createExecuteHandler` order chaining-deny (`:104`) → validate (`:109`) → chained-target allowlist (`:117`) → approval (`:125`) → audit keys-only (`:126`) matches the frozen contract. Entry `mcpBridgeExtension` throws when `serverManager` missing (`:158-160`) — SEC-332-09 CLOSED, `grep 127.0.0.1:9181 extension/src = 0` verified. Carried gaps preserved (honestly): fail-open approval when hook absent (`:87`, SEC-332-03) + validation-fail emits no audit (`:110-114`, SEC-332-04). `search-provider.ts` cutover is clean (`McpBridgeCaller`, `withSearchTimeout`, retry-once, 200-char slices).
3. **`mcp-types.ts` single owner, no cycle — PASS.** Exactly one `interface McpToolDefinition` (`mcp-types.ts:9`), zero value imports (type-only leaf), two type-importers (`mcp-bridge.ts:13`, `llm-provider.ts:8`). Old owner `langgraph/vscode/tool-registry.ts` (82 lines) was **deleted** in `1721971` (0 importers); kernel `grep vscode/tool-registry = 0` (CI-gated). `McpBridgeCaller` deliberately avoids `implements McpCaller` via import (structural typing, `:7-9`) so the madge 0-cycles gate holds.
4. **Deletions verified — PASS.** `pi-agent/extensions/mcp-wrapper-client.ts` (76 lines) gone; `pi-agent/extensions/__tests__/mcp-wrapper-client.test.ts` (69 lines) gone; `extension/tests/mcp-bridge.test.ts` + `.js` + `.js.map` gone. `grep McpWrapperClient|createMcpClient|mcp-wrapper-client extension/src = 0`; `grep 127.0.0.1:9181 extension/src = 0`; `extension/tests/*.js = 0`, `extension/src/**/*.js = 0`. SEC-332-11 CLOSED (stale `.js` invisible-to-lint surface removed).
5. **OWASP spot-check: no NEW vulnerability from the move.** Secrets scan on kernel+Pi files = 0 hardcoded credentials (SecretStorage path preserved; only loopback defaults `11434`/`8990` carried Low). No `child_process`/`eval`/`innerHTML` in kernel. `lint` script fixed (`npx eslint src/`, `package.json:456`) + test-dir override added (`eslint.config.js:40`) + blanket `__tests__` ignore removed — SEC-332-06 CLOSED with residuals (`**/*.js` ignore remains, `require()` not covered by `no-restricted-imports`, `madge` still `npx -y`). Workflow-panel eslint override is single-file, commented, CI-mirrored — NOT abused.
6. **Sole exclusion `panels/workflow-panel.ts:11` — ACCEPTABLE (conditional).** Verified the ONLY `from.*langgraph` outside `src/langgraph/` in the entire tree. Target `langgraph/workflow/workflow-graph-data.ts` is zero-import pure data. Panel was deleted in `1721971`, restored by scope-narrow `5537ed7` (SM decision: yield to SA4E-289 merge-first); its CSP `unsafe-eval` (three.js) dies with the panel. Condition: DO NOT extend; SA4E-289 deletes both files.

**Against the 4 Highs of 3.7: zero new Highs introduced by the move.** SEC-332-01 (High, carried), SEC-332-02 (High, carried), SEC-332-03 (High, carried fail-open), SEC-332-09 (High-conditional → **CLOSED** in-ticket). Residual risk is carried debt + 3 small in-ticket residuals (require-bypass Medium, js-ignore + madge Low) — none merge-blocking, all tracked below.

**Overall Risk Rating:** Medium (no Critical; 3 High carried — all pre-existing, all require separate hardening tickets before SA4E-289 production wiring).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 3 carried (SEC-332-01, 02, 03 — all pre-existing, move preserves byte-identically) |
| 🟡 Medium | 4 (SEC-332-04, 05-residual, 08, 10 — all carried except 05-residual which is a freeze-gap) |
| 🔵 Low | 4 (SEC-332-06-residual, 07, 12-residual, OBS-332-13 new) |
| ℹ️ Informational | 3 (SEC-332-I1, I2 carried + OBS-332-14 panel-CSP note) |
| ✅ Closed in-ticket | 3 (SEC-332-09 fail-closed, SEC-332-06 lint-runnable core, SEC-332-11 stale-.js) |

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control

- **SEC-332-01 (High, carried):** `_as_path` arbitrary file read, no containment — `extension/src/mcp/mcp-bridge.ts:62-80`. Now reachable from Pi LLM-controlled params (amplified). Separate hardening ticket required.
- **SEC-332-02 (High, carried):** `_filename` path traversal on write — `extension/src/mcp/mcp-bridge.ts:95-96`. Separate hardening ticket required.
- **SEC-332-03 (High, carried):** fail-open approval when `approvalHook` absent — `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:87`. Separate hardening ticket (or documented risk acceptance + wired hook) required.
- **SEC-332-09 (High-conditional → CLOSED ✅):** `serverManager` fail-closed throw — `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:158-160`. Verified + `grep 127.0.0.1:9181 = 0` + wrapper deleted. No fallback to hardcoded URL exists.

### A02:2021 — Cryptographic Failures

No issues found ✅ (no crypto in moved kernel; `SecretStorage` secret path preserved; no new TLS/key material).

### A03:2021 — Injection

- **SEC-332-02 (High, carried):** counted here as well (remote-influenced `_filename` → `path.join`, no sanitization).
- No `eval`/`Function`/template-injection/`child_process`/LDAP/XXE sinks found in `extension/src/mcp/**` (grep = 0). `JSON.parse(JSON.stringify(args))` deep-clone neutralizes `__proto__` pollution as own-property (see SEC-332-I1).

### A04:2021 — Insecure Design

- **SEC-332-08 (Medium, carried):** unbounded base64 decode + `Date.now()` filename collisions — `extension/src/mcp/mcp-bridge.ts:82-109`. Separate ticket (10 MB cap + random suffix).
- **SEC-332-10 (Medium, carried):** TOCTOU + absolute-path log leak — `extension/src/mcp/mcp-bridge.ts:68-72`. Separate ticket.
- Timeouts (60 s tool / 10 s list + `AbortController` + `unref`) verified intact — good design preserved.

### A05:2021 — Security Misconfiguration

- **SEC-332-05 (Medium, residual):** `no-restricted-imports` does not cover `require()`; providers use lazy `require` (`extension/src/mcp/providers/index.ts:64,74,78,85,97,112` pattern preserved). Compensated by CI grep gate (`require.*langgraph = 0` verified) but not enforced in-IDE. Keep open as residual.
- **SEC-332-06 (Medium → CLOSED core, Low residual ✅/⚠️):** `lint` script fixed (`extension/package.json:456` = `npx eslint src/`), test-dir override added (`extension/eslint.config.js:40`), blanket `__tests__` ignore removed. Residual: `**/*.js` ignore at `eslint.config.js:12` remains (currently harmless — 0 checked-in `.js` verified — but hides future artifacts).
- **SEC-332-07 (Low, carried):** loopback defaults `http://localhost:11434` (`providers/index.ts:35`) + `http://127.0.0.1:8990/anthropic` (`:84`) — loopback-only, behind `validateProviderBaseUrl`. Accept, allowlist in scans.
- Workflow-panel override (`eslint.config.js:38`) is single-file + commented + CI-mirrored — NOT abused ✅.

### A06:2021 — Vulnerable and Outdated Components

No new runtime dependencies introduced (constraint upheld, verified in `5b05539 --stat`: only moves + adapter + config). `madge@8.0.0` via `npx -y` remains unpinned supply-chain residual (SEC-332-12, Low). No `npm audit` performed in this static review (no lockfile diff in scope — recommend CI gate owns it).

### A07:2021 — Identification and Authentication Failures

No issues found ✅ (no auth logic in moved kernel; approval-hook wiring is A01, not credential auth; `SecretStorage` preserved).

### A08:2021 — Software and Data Integrity Failures

- **SEC-332-11 (Low → CLOSED ✅):** stale checked-in `.js` deleted (`extension/tests/mcp-bridge.test.js` + `.ts` + `.map`); `**/*.js` ignore now covers only genuine build output (0 checked-in `.js` remain).
- **SEC-332-12 (Low, residual):** `madge` via unauthenticated `npx -y` + import-only cycle view (blind to `require()` edges) — `.github/workflows/ci-sa4e-332.yml:138`. Pin as devDependency or shasum-verify; pair with `require.*langgraph` grep (already present).
- `git log --follow` history preserved through `git mv` (verified for `mcp-bridge.ts`: `5b05539` + ancestors) ✅.

### A09:2021 — Security Logging and Monitoring Failures

- **SEC-332-04 (Medium, carried):** `validateParams` failure returns with NO audit entry (`mcp-bridge-extension.ts:110-114`), breaking the "exactly one audit per invocation" invariant — attacker can fuzz the 4000-char cap untraced. Chaining-deny (`:105`), chained-target deny (`:120`), approval (`:126`) all audit; this branch does not. One-line fix in separate ticket.
- **SEC-332-10 (Medium, carried):** `console.error` logs full absolute `filePath` (`mcp-bridge.ts:72`) — log `basename` only.
- Positive: keys-only audit preserved (`argKeys: Object.keys(params)`, never values; `defaultAuditLog :50-52`; tests assert `argKeys: ['content']` / `['query']`) ✅.

### A10:2021 — Server-Side Request Forgery (SSRF)

- `listTools()` loopback POST `http://127.0.0.1:{port}/mcp` with **numeric** `port` (`mcp-bridge.ts:120-129`) — minimal SSRF surface, `AbortController` 10 s ✅. `port` type stays `number|null` (never string URL) — verified.
- Provider SSRF guard preserved: `validateProviderBaseUrl` → `validateBackendUrl` + `isLoopbackHost` opt-in in all three providers (`anthropic/ollama/openai-provider.ts`) ✅.
- Deleting `mcp-wrapper-client.ts` **removed** the hardcoded `127.0.0.1:9181` + no-timeout surface — net SSRF/hang gain ✅.

## Detailed Findings

### Finding #1: `_as_path` arbitrary file read — no containment (carried + Pi-amplified)

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A01:2021 Broken Access Control / A04:2021 Insecure Design |
| **CWE** | CWE-73 (External Control of File Name), CWE-22 (Path Traversal), CWE-59 (Link Following) |
| **CVSS Score** | 7.5 |
| **Location** | `extension/src/mcp/mcp-bridge.ts:62-80` (moved byte-identically from `extension/src/langgraph/core/mcp-bridge.ts`) |
| **Status** | Open (carried; NOT introduced by move — verified 0 behavior diff) |

**Description:**
`interceptRequestArgs` converts any key ending `_as_path` into `fs.readFileSync(filePath, "base64")` with zero validation: no workspace-root containment, no `realpath` canonicalization, no symlink rejection, no file-size cap, no readable-directory allowlist. Recursive descent (including arrays) means nested attacker keys also trigger. Post-cutover, **Pi LLM-controlled `params`** (via `mcp-bridge-extension.ts:135` → `bridge.callTool` and `search-provider.ts` → `McpBridgeCaller`) reach this transport, so a prompt-injected tool argument can exfiltrate host files into base64 tool args.

**Evidence:**

```typescript
// extension/src/mcp/mcp-bridge.ts:62-80 — VULNERABLE (preserved as-is, verified vs 79579bc)
private interceptRequestArgs(args: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(args)) {
    if (key.endsWith("_as_path")) {
      const originalKey = key.replace("_as_path", "");
      const filePath = args[key] as string;
      try {
        if (fs.existsSync(filePath)) {                          // TOCTOU, no realpath
          args[originalKey] = fs.readFileSync(filePath, "base64"); // arbitrary read, no size cap
        }
      } catch (e) {
        console.error(`[McpBridge] Failed to read ${filePath} for base64 translation:`, e);
      }
      delete args[key];
    } else if (typeof args[key] === "object" && args[key] !== null) {
      args[key] = this.interceptRequestArgs(args[key] as Record<string, unknown>);
    }
  }
  return args;
}
```

**Impact:**
Confidential file disclosure (user secrets, `.env`, keys) to MCP backend / LLM context. Extension-host FS permissions bound the blast radius, but the host can read user secrets.

**Remediation (SEPARATE ticket — DO NOT bundle into SA4E-332 per move-as-is):**

```typescript
import * as fs from "fs";
import * as path from "path";
const MAX_AS_PATH_BYTES = 2 * 1024 * 1024;
const ALLOWED_READ_ROOTS: string[] = [workspaceRoot];

function safeReadAsPath(filePath: string, workspaceRoot: string): string | null {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.length > 1024) return null;
  let real: string;
  try { real = fs.realpathSync(filePath); } catch { return null; }
  const allowed = ALLOWED_READ_ROOTS.some((root) => {
    const r = fs.realpathSync(root);
    return real === r || real.startsWith(r + path.sep);
  });
  if (!allowed) return null;
  const stat = fs.statSync(real);
  if (!stat.isFile() || stat.size > MAX_AS_PATH_BYTES) return null;
  return fs.readFileSync(real, "base64");
}
```

**References:**
- CWE-73, CWE-59; OWASP A01; 3.7 SEC-332-01.

---

### Finding #2: `_filename` path traversal on `_base64_file` write

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A01:2021 / A03:2021 Injection |
| **CWE** | CWE-22 (Improper Limitation of Pathname), CWE-73 |
| **CVSS Score** | 7.0 |
| **Location** | `extension/src/mcp/mcp-bridge.ts:95-96` |
| **Status** | Open (carried) |

**Description:**
`interceptResponse` does `path.join(tmpDir, filename)` where `filename = resultObj._filename || output_{Date.now()}.bin` is remote-influenced (MCP server response). No `basename`, no character allowlist, no stay-in-dir check. `_filename: "../../.vscode/settings.json"` escapes `documents/tmp/`.

**Evidence:**

```typescript
// extension/src/mcp/mcp-bridge.ts:92-99
const tmpDir = path.join(workspaceRoot, "documents", "tmp");
if (!fs.existsSync(tmpDir)) { fs.mkdirSync(tmpDir, { recursive: true }); }
const filename = resultObj._filename || `output_${Date.now()}.bin`; // attacker-controlled
const outPath = path.join(tmpDir, filename);                        // traversal escapes tmpDir
fs.writeFileSync(outPath, Buffer.from(resultObj._base64_file, "base64")); // unbounded
```

**Impact:**
Arbitrary file write within extension-host permissions (overwrite settings, plant startup scripts). MCP server compromise → host compromise.

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

**References:**
- CWE-22; 3.7 SEC-332-02.

---

### Finding #3: Fail-open approval when `approvalHook` absent

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A01:2021 Broken Access Control |
| **CWE** | CWE-862 (Missing Authorization) |
| **CVSS Score** | 7.1 |
| **Location** | `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:87` (frozen, preserved) |
| **Status** | Open (carried; entry wiring is the control) |

**Description:**
`checkApproval` returns auto-approved when no `approvalHook` is wired — even for `mem_ingest` and `execute_dynamic_tool`, which `bridgeRequiresApproval` marks as gated (`:56`). If production wires `mcpBridgeExtension({pi}, { serverManager })` without a hook, gated tools execute silently.

**Evidence:**

```typescript
// extension/src/pi-agent/extensions/mcp-bridge-extension.ts:81-90
async function checkApproval(toolName, params, options?): Promise<...> {
  if (!bridgeRequiresApproval(toolName)) return { approved: true, decision: "auto-approved" };
  if (!options?.approvalHook) return { approved: true, decision: "auto-approved" }; // FAIL-OPEN
  const ok = await options.approvalHook(toolName, params);
  return ok ? { approved: true, decision: "approved" } : { approved: false, decision: "denied" };
}
```

**Impact:**
`mem_ingest` (KB-poisoning vector) and `execute_dynamic_tool` (chaining) execute without consent if the entry is mis-wired.

**Remediation (SEPARATE ticket or TDD addendum — no code change in this review):**

```typescript
if (!options?.approvalHook) {
  if (bridgeRequiresApproval(toolName)) return { approved: false, decision: "denied" }; // fail-closed
  return { approved: true, decision: "auto-approved" };
}
```

Minimum: document in TDD §3.4 that production entry MUST pass `approvalHook` + startup assertion/test + risk acceptance if fail-open is kept.

**References:**
- CWE-862; 3.7 SEC-332-03.

---

### Finding #4: Validation failure emits no audit (A09 gap)

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A09:2021 Security Logging and Monitoring Failures |
| **CWE** | CWE-778 (Insufficient Logging) |
| **CVSS Score** | 5.3 |
| **Location** | `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:110-114` |
| **Status** | Open (carried) |

**Description:**
Chaining-deny (`:105`), chained-target deny (`:120`), approval (`:126`) all audit; the `validateParams` failure branch returns `validation` with no `audit(...)`. The "exactly one audit per invocation" invariant is false for this branch — oversized/malformed param fuzzing is untraced.

**Evidence:**

```typescript
// extension/src/pi-agent/extensions/mcp-bridge-extension.ts:109-115
const validation = validateParams(parametersSchema as any, params);
if (!validation.valid) {
  return {  // <-- NO audit(...) here; compare :105, :120, :126 which all audit
    content: [{ type: 'text' as const, text: `Validation failed: ${validation.error}` }],
    details: { error: 'validation', toolName },
  };
}
```

**Impact:**
Detection bypass for param-fuzzing / 4000-char cap probing.

**Remediation (separate ticket, one line):**

```typescript
if (!validation.valid) {
  audit({ toolName, argKeys: Object.keys(params), decision: "denied" });
  return { content: [{ type: 'text' as const, text: `Validation failed: ${validation.error}` }], details: { error: "validation", toolName } };
}
```

**References:**
- CWE-778; 3.7 SEC-332-04.

---

### Finding #5: Lint freeze bypass via `require()` (residual)

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-693 (Protection Mechanism Failure) |
| **CVSS Score** | 5.0 |
| **Location** | `extension/eslint.config.js:29` (rule) + `extension/src/mcp/providers/index.ts:64,74,78,85,97,112` (lazy-`require` precedent) |
| **Status** | Open (residual; CI grep compensates, IDE does not) |

**Description:**
`no-restricted-imports` only checks `import` statements, not `require()` calls. Providers already use lazy `require("./anthropic-provider")`; a future `require("../langgraph/...")` or `require("../../langgraph/...")` bypasses the freeze silently in-IDE. CI gate `grep require.*langgraph = 0` (verified 0 hits today) compensates in pipeline only.

**Evidence:**

```javascript
// extension/eslint.config.js:29 — import-only gate
'no-restricted-imports': ['error', { patterns: langgraphFreezePatterns }],
// No 'no-restricted-require' or equivalent; providers/index.ts uses require() 6× (verified).
```

**Impact:**
Freeze bypass path for future contributors (re-introducing legacy-tree coupling without lint error locally).

**Remediation (in-ticket follow-up, cheap):**

```javascript
// eslint.config.js — alongside no-restricted-imports (or CI keeps owning it):
// Option A: 'no-restricted-require': ['error', { patterns: ['**/langgraph/**'] }],
// Option B (already partially done): keep CI grep gate — document it as the owner.
```

**References:**
- CWE-693; 3.7 SEC-332-05.

---

### Finding #6: Unbounded base64 decode (DoS) + filename collisions

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A04:2021 Insecure Design |
| **CWE** | CWE-400 (Uncontrolled Resource Consumption), CWE-789 |
| **CVSS Score** | 5.7 |
| **Location** | `extension/src/mcp/mcp-bridge.ts:82-109` |
| **Status** | Open (carried) |

**Description:**
No pre-decode length check on `_base64_file`. A compromised/malicious MCP response with a large base64 string balloons extension-host memory via `Buffer.from(..., "base64")`. Fallback `output_{Date.now()}.bin` collides under burst (same ms) → overwrite.

**Remediation (separate ticket):**
Reject `resultObj._base64_file.length > 14_000_000` (~10 MB decoded) with `Proxy Error: base64 payload exceeds limit`; add `randomBytes(4).toString("hex")` to fallback name.

**References:**
- CWE-400; 3.7 SEC-332-08.

---

### Finding #7: `_as_path` TOCTOU + path leak in logs

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A09:2021 / A04:2021 |
| **CWE** | CWE-367 (TOCTOU), CWE-532 (Sensitive Info in Logs) |
| **CVSS Score** | 4.8 |
| **Location** | `extension/src/mcp/mcp-bridge.ts:68-72` |
| **Status** | Open (carried) |

**Description:**
`existsSync` then `readFileSync` (race window; EISDIR handled only by catch-all). `console.error` logs the full absolute `filePath` (may disclose username/host layout in shared logs).

**Remediation (separate ticket):**
Single `try { readFileSync } catch` (drop `existsSync`); log `path.basename` + error `code` only.

**References:**
- CWE-367, CWE-532; 3.7 SEC-332-10.

---

### Finding #8: Hardcoded loopback defaults (carried Low)

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-547 (Use of Hardcoded Value) |
| **CVSS Score** | 3.1 |
| **Location** | `extension/src/mcp/providers/index.ts:35` (`http://localhost:11434`), `:84` (`http://127.0.0.1:8990/anthropic`) |
| **Status** | Open (carried; loopback-only, accepted) |

**Description:**
Loopback-only literals, always passed through `validateProviderBaseUrl` → `validateBackendUrl`. No credentials. Violates single-source-of-truth cosmetically; explicitly allowlist in secret/URL scans.

**Remediation (defense-in-depth):**
Lift to `package.json` settings defaults or named constants; add to scan allowlist explicitly.

---

### Finding #9: `madge` via `npx -y` + import-only cycle view (residual Low)

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A08:2021 Software and Data Integrity Failures |
| **CWE** | CWE-829 (Untrusted Download) |
| **CVSS Score** | 3.3 |
| **Location** | `.github/workflows/ci-sa4e-332.yml:138` (`npx -y madge@8.0.0 --circular src/mcp/`) |
| **Status** | Open (residual) |

**Description:**
Unauthenticated fetch with no integrity pin; `madge` sees only `import` edges, not lazy `require()` (paired with Finding #5). No `madge` in `package.json` (verified 0 hits) — by design, no new dependency.

**Remediation:**
Pin as devDependency with lockfile hash, or verify shasum in CI; document that type-only cycles are compile-time only; keep `require.*langgraph` grep as the companion gate (already present).

---

### Finding #10: `**/*.js` lint ignore remains (residual Low)

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A05:2021 Security Misconfiguration |
| **CWE** | CWE-693 |
| **CVSS Score** | 2.0 |
| **Location** | `extension/eslint.config.js:12` |
| **Status** | Open (residual; currently harmless) |

**Description:**
Blanket `**/*.js` ignore persists. Harmless today (verified 0 checked-in `.js` under `extension/src/**` and `extension/tests/`), but would hide a future checked-in artifact the way it hid `mcp-bridge.test.js` pre-move.

**Remediation:**
Narrow to genuine build output dirs (`out/`, `dist/`) or add a CI gate asserting `git ls-files extension '*.js' = 0` outside vendored assets.

---

### Finding #11 (new observation): Fail-closed `serverManager` throw has no test

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A05:2021 / A09:2021 (assurance gap, not a vulnerability) |
| **CWE** | CWE-693 |
| **CVSS Score** | 2.5 |
| **Location** | `extension/src/pi-agent/extensions/mcp-bridge-extension.ts:158-160` (code) vs `extension/src/pi-agent/extensions/__tests__/mcp-bridge-extension.test.ts` (no `serverManager` case) |
| **Status** | Open (new observation from this review) |

**Description:**
The fail-closed throw (SEC-332-09 fix) is implemented but untested: the test file covers validation (`:58`), chaining-deny (`:96-129`), approval+audit (`:138-157`) — all preserved — but no case asserts `mcpBridgeExtension({pi}, {} as any)` throws. A future refactor could silently reintroduce a fallback.

**Remediation:**

```typescript
it('fail-closed: throws without serverManager', () => {
  expect(() => (mcpBridgeExtension as any)({ pi: { registerTool: () => {} } }, {}))
    .toThrow(/requires IServerManager/);
});
```

---

### Informational notes

- **SEC-332-I1 (carried):** `JSON.parse(JSON.stringify(args))` (`mcp-bridge.ts:38`) neutralizes `__proto__` pollution (becomes own property) but drops `undefined`/functions — acceptable for `Record<string,unknown>`; consider `structuredClone` + explicit `__proto__`/`constructor` drop in hardening.
- **SEC-332-I2 (carried):** `listTools()` numeric-port loopback POST + `AbortController` 10 s (`mcp-bridge.ts:120-139`) — sound; `Date.now()` JSON-RPC id collision harmless.
- **OBS-332-14 (new):** `panels/workflow-panel.ts:47` CSP includes `'unsafe-eval'` for three.js/force-graph + inline `nonce` scripts (`:34-36,53-60`) + `acquireVsCodeApi()` message handler without origin check (`:55-58`, standard for VS Code webviews — `event.origin` is not applicable, but `handlePanelMessage` is a global). Pre-existing, dies with the panel under SA4E-289 decommission. Accepted conditionally with Finding exclusion; no action in SA4E-332.

## Dependency Vulnerabilities

| Dependency | Current Version | CVE | Severity | Fixed In |
|-----------|----------------|-----|----------|----------|
| (no lockfile diff in scope) | — | — | — | — |

No new runtime dependencies introduced by SA4E-332 (verified: `5b05539 --stat` shows moves + 18-line adapter + config only; `package.json` diff is lint-script + test-script surface). `undici`/`ws`/`@modelcontextprotocol/sdk` versions unchanged by this ticket. Recommend the existing `npm audit` CI gate owns CVE tracking (out of scope for this move ticket, consistent with 3.7). No typosquatting observed. `madge@8.0.0` deliberately NOT added to `package.json` (see Finding #9).

## Security Headers Assessment

Not applicable — no HTTP server, no webview HTML, no CSP/HSTS surface in the moved kernel itself. Sole network hop is loopback `POST 127.0.0.1:{port}/mcp` with `Content-Type: application/json` (`mcp-bridge.ts:129-138`).

| Header | Status | Recommendation |
|--------|--------|----------------|
| Strict-Transport-Security | ➖ N/A (no HTTP server) | — |
| Content-Security-Policy | ⚠️ Panel-only (`workflow-panel.ts:47` has `unsafe-eval` for three.js; dies with panel under SA4E-289) | Delete with panel; do not copy pattern to new webviews |
| X-Content-Type-Options | ➖ N/A | — |
| X-Frame-Options | ➖ N/A | — |
| Referrer-Policy | ➖ N/A | — |
| Permissions-Policy | ➖ N/A | — |

`validateBackendUrl`/`validateProviderBaseUrl` HTTPS-remote enforcement (backend-url.ts + provider-url-policy.ts) is preserved by the move — verified sound.

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| P0 (separate tickets, block SA4E-289 production wiring — NOT merge) | #1 `_as_path` containment + #2 `_filename` sanitization + #6 size caps | Medium | Blocks arbitrary file read/write amplification via Pi LLM params |
| P0 (separate ticket, block production wiring) | #3 fail-closed approval + #4 validation-audit | Low | Closes consent bypass + logging blind spot (KB-poison chain) |
| P1 (in-ticket follow-up) | #5 `require()` gate (rule or documented CI ownership) + #11 fail-closed test | Low | Freeze actually enforceable in-IDE; regression-proof |
| P2 (defense-in-depth) | #7 TOCTOU/log hygiene, #8 loopback constants to settings, #9 madge pin, #10 narrow `*.js` ignore | Low | Hardening |
| Done ✅ | SEC-332-09 fail-closed, SEC-332-06 lint-runnable, SEC-332-11 stale-.js | — | Verified in code + grep |

## Recommendations Summary

### Immediate Actions (Critical/High — separate tickets before SA4E-289 production wiring)

1. File `_as_path` containment ticket (realpath + workspace roots + symlink + size cap) — Findings #1/#7.
2. File `_filename` sanitization + base64 size-cap ticket — Findings #2/#6.
3. File approval fail-closed + validation-audit ticket — Findings #3/#4. Record risk acceptance if fail-open is intentionally kept, and wire `approvalHook` at the production entry.

### Short-term Improvements (Medium)

1. Add `require.*langgraph` to lint-or-documented-CI ownership (Finding #5) + add fail-closed unit test (Finding #11).
2. Narrow `**/*.js` ignore or add checked-in-`.js` CI gate (Finding #10); pin `madge` (Finding #9).

### Long-term Hardening (Low/Informational)

1. Lift `8990`/`11434` loopback defaults to settings; extend secret/URL scan allowlist explicitly (Finding #8).
2. Evaluate `structuredClone` + `__proto__` drop + `WorkspaceTrustGuard` check for `_as_path` reads (I1).
3. Consider `eslint-plugin-import/no-cycle` as permanent guard alongside madge.

## What was done well (acknowledged)

- Move-as-is discipline held: 4-line import-only diff on `mcp-bridge.ts` (proven by direct old-vs-new comparison), `git log --follow` history preserved, `git mv` semantics honored.
- `McpToolDefinition` single-owner correctly kills the `mcp-bridge ↔ tool-registry` cycle; old 82-line owner deleted (not duplicated).
- `McpBridgeCaller` kernel-side adapter avoids pi-agent imports (even type-only) — cycle gate holds by construction.
- `serverManager` fail-closed throw + wrapper deletion + `9181` grep-0 removes the hardcoded-URL + no-timeout surface — net security gain in-ticket.
- Keys-only audit, 4000-char `validateParams` cap, `TOOL_ALLOWLIST` deny-by-default, provider URL policy, timeouts — all preserved byte-identically.
- CI move gates (old-bridge-path, `.js`-suffixed, `from.*langgraph` with single exclusion, wrapper consumers, `require.*langgraph`, hardcoded-URL, tool-registry) are comprehensive and mirror the eslint freeze.
- Test preservation: validation/chaining/approval/audit keys-only assertions intact in `mcp-bridge-extension.test.ts`.

## Verdict: CONDITIONAL

**CONDITIONAL** — the SA4E-332 implementation is **approved to merge as specified** (move-as-is + adapter + Option B lint + fail-closed + deletions + gates), subject to:

1. **Merge conditions (verified ✅ except 1b-test):** (a) import-specifiers-only diff ✅ (proven 4-line diff); (b) fail-closed unit test recommended (Finding #11, non-blocking); (c) `tsc` 0 / eslint 0 / grep-0 gates per CI (owned by DEV PR evidence); (d) no extension of the `workflow-panel.ts` exclusion.
2. **Separate hardening tickets filed before SA4E-289 production wiring (blockers for wiring, NOT for this merge):** `_as_path`/`_filename`/size-cap (Findings #1/#2/#6/#7) and approval/audit (#3/#4). The vulnerabilities exist today; the move does not worsen them beyond the noted Pi `_as_path` amplification, which the follow-ups close.
3. **No new behavior in move:** any `git diff` beyond specifiers + `McpToolDefinition` ownership + adapter + DI threading → STOP (upheld ✅).

**Not CLEAN** because 3 carried Highs + audit/approval gaps remain exploitable via Pi-reachable params and must be tracked, not waved through. **Not BLOCKED** because: no Critical, zero new Highs from the move (proven), no new remote/network surface, SEC-324-03 semantics preserved in order, cycle correctly resolved, secrets path sound, and in-ticket must-haves (fail-closed, lint-runnable, stale-delete) are implemented and verified in code.

## Appendix

### A. Tools & Methodology

- Static code analysis (direct file reads, zero trust in DEV report): `mcp-bridge.ts` (182), `mcp-bridge-caller.ts` (18), `mcp-types.ts` (13), `mcp-bridge-extension.ts` (196), `search-provider.ts` (141), `eslint.config.js` (41), `workflow-panel.ts` (84), `providers/index.ts` (121), `package.json` lint line, `ci-sa4e-332.yml` gates.
- Byte-diff proof: `git show 79579bc:extension/src/langgraph/core/mcp-bridge.ts` vs `HEAD:extension/src/mcp/mcp-bridge.ts` → only 4 import lines differ.
- Grep sweeps: `from.*langgraph` (1 hit = panel exclusion), `require.*langgraph` (0), `McpWrapperClient|createMcpClient|mcp-wrapper-client` (0), `127.0.0.1:9181` in `extension/src` (0), `vscode/tool-registry` in `extension/src/mcp` (0), `McpToolDefinition` defs (1), `child_process|execFile|spawn|eval` in kernel (0), secrets sweep on kernel+Pi (0 creds), `*.js` under `extension/src` + `extension/tests` (0).
- History: `git log --follow -- extension/src/mcp/mcp-bridge.ts` (preserved), parent chain `5537ed7→1721971→f2c6447→5b05539→79579bc` (note: `5b05539` is an ancestor of `1721971`; `5537ed7` diff vs `1721971` is the 6-file narrow only — full SA4E-332 scope = `79579bc..5b05539` + narrow).
- KB search (`mem_search` SA4E-332/SEC-324) for baseline context; OWASP Testing Guide v4.2 (static) + OWASP Top 10 2021 + CWE/CVSS per finding. No dynamic testing, no exploitation, no production modification, no code changes (per instructions).

### B. Scope Limitations

- Static analysis only: no runtime/pen-test, no dependency CVE scan (`npm audit` recommended in CI), no infra/network review beyond loopback POST.
- MCP protocol/backend internals, UI (except panel exclusion + CSP note), DOCX/Jira attach out of scope.
- `agent_log` Step-START/DONE entries emitted via `execute_dynamic_tool(agent_log)`; `stream_write_file` dynamic tool targets the code-intel server workspace in this environment, so the report artifact was written via direct filesystem write to the session workspace (`documents/SA4E-332/SECURITY-ASSESSMENT.md`) — content identical to the logged stream payload.
- Post-narrow tree only (`5537ed7`); pre-move line refs given as `old → new` pairs where relevant.

### C. Glossary

- **CVSS**: Common Vulnerability Scoring System
- **CWE**: Common Weakness Enumeration
- **OWASP**: Open Web Application Security Project
- **Move-as-is (move nguyên trạng):** `git mv` + import-specifier-only diff.
- **McpBridgeCaller:** NEW thin adapter `McpCaller` ← `McpBridge.callTool` (sole intentional adaptation).
- **SEC-324-03:** allowlist + deny-dynamic-chaining + approval + keys-only audit (frozen).
- **FROZEN:** `langgraph/` post-extraction (no new importers; phased deletion under SA4E-289).
