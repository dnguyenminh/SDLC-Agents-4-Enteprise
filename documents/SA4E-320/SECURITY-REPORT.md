# 🔒 Security Assessment Report

## Document Information
| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code/Kiro Extension) |
| Ticket | SA4E-320 — Opt-in checkbox to bypass HTTPS enforcement for remote backend server |
| Related Requirement | SEC-289-03 (Transport Security) |
| Scope | Security Design/Code Review of `allowInsecureRemote` bypass implementation (8 files, static analysis) |
| Date | 2026-09-23 |
| Assessor | Security Agent (SECURITY) |
| Version | 1.0 |
| Method | Static code review + `git diff` baseline comparison + unit test execution (9/9 passed) |

## Executive Summary

SA4E-320 introduces an **opt-in** VS Code setting `kiroSdlc.backend.allowInsecureRemote` (boolean, default `false`) that relaxes SEC-289-03 HTTPS enforcement for non-loopback backend URLs. The implementation is **secure-by-default**: the package.json default is `false`, `validateBackendUrl()` without options preserves pre-change enforcement byte-for-byte (verified against `git show HEAD` + behavioral equivalence review), a `console.warn` security warning is emitted on **every validation call** while the bypass is active, and the bypass scope is strictly limited to the HTTP-vs-HTTPS check — protocol allowlist (`http`/`https` only) and malformed-URL rejection remain enforced with the bypass ON (test-verified for `ftp`, `ws`, malformed input). The Settings UI warning is hidden by default and accurately conveys credential-interception risk. The flag is read fresh from VS Code configuration at each validation (no cache) and cannot be influenced by environment variables or URL query parameters.

However, three significant issues were identified: (1) **`KnowledgeClient` constructor re-validates the URL without the bypass flag**, so the bypass does NOT flow to KB client paths — remote HTTP + bypass ON causes `[Security]` throw at extension activation (`extension.ts:211`) and all `new KnowledgeClient(resolveKbBaseUrl())` call sites (fail-closed, but ticket checklist item #8 is unmet and enforcement is inconsistent across consumers); (2) the flag is persisted at **Workspace scope**, meaning a malicious repository's `.vscode/settings.json` can silently enable the bypass and point `backend.url` at an attacker HTTP server without the user ever touching the checkbox; (3) **pre-existing gaps** outside this diff: `extension.ts:177`, `indexer-http.ts:11-13`, and `indexer.ts:13-15` read `backend.url` raw and never enforce SEC-289-03 at all, and `isLoopbackHost` treats any hostname starting with `127.` (e.g. `127.attacker.com`) as loopback — allowing HTTP without bypass or warning.

**Overall Risk Rating of this change: Medium** (secure core design; residual risks and cross-consumer inconsistencies require conditions).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 *(pre-existing — not introduced by this diff)* |
| 🟡 Medium | 3 *(1 pre-existing)* |
| 🔵 Low | 1 |
| ℹ️ Informational | 3 |

**Verdict: APPROVE WITH CONDITIONS** (see bottom of report).

---

## Review Checklist Results

| # | Checklist Item | Result | Evidence |
|---|----------------|--------|----------|
| 1 | Opt-in only: default OFF, backward compatible | ✅ PASS | `extension/package.json:193` → `"default": false`; `backend-url.ts:76` → `options.allowInsecureRemote === true` (missing options → enforcement ON) |
| 2 | OFF branch byte-identical to pre-change | ✅ PASS | `git diff` shows pure refactor of same predicates; 4 original SEC-289-03 tests + 5 new tests = **9/9 passed** (vitest run verified) |
| 3 | Warning logged when bypass active | ✅ PASS | `backend-url.ts:37-41` → `console.warn` on **every** `validateBackendUrl` call with bypass ON (not once — persistent visibility) |
| 4 | UI warning visible when checked, hidden when unchecked | ✅ PASS | `SettingsPanel.ts:134` → warning div has `hidden` attr by default; `settings.js:421-424` toggles on change; `settings.js:624-628` restores from state; copy covers credential interception |
| 5 | Bypass scope limited to HTTP-vs-HTTPS check | ✅ PASS (within validator) | `backend-url.ts:75-78` → only `http:` branch consults flag; `rejectUnsupportedProtocol` (line 78) always runs; tests `backend-url.test.ts:59-85` prove `ftp`/`ws`/malformed still rejected with bypass ON. ✅ Finding #1 resolved post-fix (see Addendum) |
| 6 | Persistence scope + fresh re-read | ⚠️ PASS with condition | Written at `ConfigurationTarget.Workspace` (`SettingsMessageHandler.ts:216`); read fresh at every validation (`backend-url.ts:102-104`, `SettingsMessageHandler.ts:194-197`) — no stale cache. ⚠️ Workspace scope enables silent set via `.vscode/settings.json` (Finding #2) |
| 7 | Flag source integrity (config only, no env/query) | ✅ PASS | Flag read exclusively via `vscode.workspace.getConfiguration("kiroSdlc").get("backend.allowInsecureRemote")`. `CODE_INTEL_PORT` env (`knowledge-client.ts:140-146`) only overrides port and **forces loopback host** `127.0.0.1` — cannot inject remote host or the flag |
| 8 | knowledge-client bypass flow correctness | ✅ PASS (re-verified post-fix) | constructor now forwards `allowInsecureRemote` via `getAllowInsecureRemote()` (`knowledge-client.ts:177-186`), consistent with `getBackendUrl()`/`resolveKbBaseUrl()`; regression tests `knowledge-client-bypass.test.ts` prove bypass ON + remote HTTP does **NOT** throw while bypass OFF still throws `[Security]` (Finding #1 regression); `ftp`/`ws`/malformed still rejected with flag ON |
| 9 | OWASP/transport residual risks covered by warning | ⚠️ PARTIAL | UI warning + package.json description cover "credentials and data can be intercepted"; `console.warn` says only "unencrypted HTTP" (Finding #7); `sso_token` in URL query (Finding #8) not explicitly called out |

---

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
- **Finding #2 (Medium):** Workspace-scope security flag settable via workspace settings without explicit user UI interaction (silent opt-in vector).

### A02:2021 — Cryptographic Failures
- **Finding #3 (High, pre-existing):** Multiple consumers never enforce transport security — Bearer tokens/chat data can transit HTTP regardless of bypass state.
- **Finding #4 (Medium, pre-existing):** Loopback prefix check allows `127.attacker.com`-style hostnames over HTTP with no bypass and no warning.
- **Finding #8 (Info):** Residual: `sso_token` in query string over cleartext HTTP when bypass is deliberately ON.

### A03:2021 — Injection
No issues found in this diff ✅ — URL parsed via `new URL()`; no string-concatenated SQL/shell/HTML paths introduced; webview message handling uses typed switch cases.

### A04:2021 — Insecure Design
- **Finding #1 (Medium):** Inconsistent security-control propagation — the bypass flag is honored by `getBackendUrl()` consumers but silently ignored by `KnowledgeClient`'s own validation (fail-closed hard-fail), creating divergent behavior for the same setting.

### A05:2021 — Security Misconfiguration
- **Finding #2 (Medium):** No `capabilities.untrustedWorkspaces.restrictedConfigurations` declaration for `kiroSdlc.backend.allowInsecureRemote` / `kiroSdlc.backend.url` in `extension/package.json`.
- **Finding #5 (Low):** Toggling bypass OFF with a remote HTTP URL still stored leaves consumers throwing (fail-closed, availability impact).
- **Finding #6 (Info):** Raw `msg.enabled` persisted without boolean coercion (mitigated by strict `=== true` at validation).

### A06:2021 — Vulnerable and Outdated Components
No new dependencies introduced by this change ✅ — no package additions in diff.

### A07:2021 — Identification and Authentication Failures
- **Finding #8 (Info, residual):** When bypass is ON, auth material (`sso_token` query param, `Authorization: Bearer`, `X-Project-Id`) transits cleartext — inherent to deliberate HTTP opt-in; covered generically by UI warning.

### A08:2021 — Software and Data Integrity Failures
No issues found ✅ — no deserialization, no unsigned payload paths added.

### A09:2021 — Security Logging and Monitoring Failures
- **Finding #7 (Info):** `console.warn` on bypass-active lacks explicit credential-interception/MITM wording (UI copy has it). Positive: warning fires on **every** validation call, not once.
- Positive: rejection path also logs `console.warn` before throw (`backend-url.ts:44`).

### A10:2021 — Server-Side Request Forgery (SSRF)
No issues introduced ✅ — flag cannot be set from env/URL; `CODE_INTEL_PORT` forces loopback host.

---

## Detailed Findings

### Finding #1: KnowledgeClient constructor does not honor `allowInsecureRemote` — bypass does not flow (inconsistent enforcement) — ✅ RESOLVED post-fix (see Addendum)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A04:2021 — Insecure Design |
| **CWE** | CWE-693: Protection Mechanism Failure |
| **CVSS Score** | 5.3 (AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:L) — functional impact; security posture is fail-closed |
| **Location** | `extension/src/knowledge-client.ts:173-174` (also `extension/src/extension.ts:211`, `SessionManager.ts:26`, `remote-checkpointer.ts:50`, `remote-checkpointer-store.ts:70`) |
| **Status** | Open |

**Description:**
`resolveKbBaseUrl()` correctly honors the bypass via `getBackendUrl()` and returns a remote HTTP URL when `allowInsecureRemote=true`. However, the `KnowledgeClient` constructor immediately re-validates the same URL with `validateBackendUrl(baseUrl)` — **without passing `{ allowInsecureRemote }`**. The validator's default (`options.allowInsecureRemote === true` → `false`) means remote HTTP is always rejected here, regardless of the user's opt-in. `[Security]` errors are re-thrown (line 176), so construction hard-fails.

**Evidence:**
```typescript
// knowledge-client.ts:172-178 — NO options passed → bypass ignored
try {
  const { validateBackendUrl } = require("./config/backend-url");
  this.baseUrl = validateBackendUrl(baseUrl);   // ← allowInsecureRemote not forwarded
} catch (err: any) {
  if (err.message && err.message.startsWith("[Security]")) throw err;
  this.baseUrl = (baseUrl || "").replace(/\/$/, "");
}

// extension.ts:177 + 211 — raw read, then KnowledgeClient throws for remote HTTP
const backendUrl = mcpConfig.get<string>("backend.url") || "http://127.0.0.1:48721";
const kbClient = new KnowledgeClient(backendUrl, { ... });  // throws [Security] if remote HTTP
```

**Impact:**
- With bypass ON + remote HTTP URL: extension activation crashes at `extension.ts:211`; `SessionManager`, `RemoteCheckpointer`, `KbRemoteCheckpointerStore` all fail to construct → KB chat/checkpoint features unavailable.
- Ticket checklist item #8 ("confirm bypass flows correctly to knowledge-client") is **NOT met**.
- Security posture is **fail-closed** (does not weaken transport security) but enforcement is inconsistent: `getBackendUrl()` consumers (tree-view, panel-html, RemoteConverter, graph-panel, ProviderConfigService) DO allow HTTP with only a `console.warn`, while KnowledgeClient paths hard-fail — same setting, two different behaviors.

**Remediation:**
Option A (make bypass work end-to-end — matches ticket intent):
```typescript
// knowledge-client.ts — forward the flag at construction time
constructor(baseUrl: string, options: KnowledgeClientOptions = {}) {
  try {
    const { validateBackendUrl } = require("./config/backend-url");
    const { getConfiguration } = require("vscode");
    const allowInsecureRemote =
      getConfiguration?.("kiroSdlc")
        ?.get?.("backend.allowInsecureRemote") === true;
    this.baseUrl = validateBackendUrl(baseUrl, { allowInsecureRemote });
  } catch (err: any) {
    if (err.message && err.message.startsWith("[Security]")) throw err;
    this.baseUrl = (baseUrl || "").replace(/\/$/, "");
  }
  // ...
}
```
Option B (keep fail-closed): document in ticket that KnowledgeClient intentionally never accepts remote HTTP, and remove the claim that the bypass flows to knowledge-client — then `extension.ts:177` must use `getBackendUrl()` so activation surfaces a controlled error instead of an unhandled throw.

**References:**
- CWE-693: https://cwe.mitre.org/data/definitions/693.html
- VS Code Configuration API: https://code.visualstudio.com/api/references/vscode-api#workspace

---

### Finding #2: Workspace-scope security flag can be silently enabled via `.vscode/settings.json`

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A01:2021 — Broken Access Control |
| **CWE** | CWE-15: External Control of System or Configuration Setting |
| **CVSS Score** | 6.0 (AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:L/A:N) |
| **Location** | `extension/src/panels/settings/SettingsMessageHandler.ts:214-217`; `extension/package.json:191-195` (no `scope` / no `restrictedConfigurations`) |
| **Status** | Open |

**Description:**
The flag is written with `vscode.ConfigurationTarget.Workspace` and the contributed setting declares no machine-only scope. A repository can therefore ship:
```jsonc
// .vscode/settings.json (committed by attacker)
{
  "kiroSdlc.backend.allowInsecureRemote": true,
  "kiroSdlc.backend.url": "http://attacker.example:48721"
}
```
Opening the workspace activates the bypass **without the user ever clicking the checkbox** — contradicting the ticket's "deliberate opt-in" intent. The extension manifest declares **no** `capabilities.untrustedWorkspaces.restrictedConfigurations` for these keys. UI mitigation exists (checkbox restores checked + warning visible via state), but only after the Settings panel is opened; traffic (AuthManager/MCP/indexer) may already flow.

**Evidence:**
```typescript
// SettingsMessageHandler.ts:214-217
private async handleSetAllowInsecureRemote(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration("kiroSdlc")
    .update("backend.allowInsecureRemote", enabled, vscode.ConfigurationTarget.Workspace);
}
```

**Impact:**
Supply-chain style silent transport downgrade: user's backend URL redirected to attacker-controlled HTTP endpoint; credentials and KB data exposed to MITM without explicit UI opt-in.

**Remediation:**
```jsonc
// extension/package.json → contributes.configuration.properties
"kiroSdlc.backend.allowInsecureRemote": {
  "type": "boolean",
  "default": false,
  "scope": "machine",
  "description": "..."
}
```
And/or declare trust restrictions:
```jsonc
// extension/package.json → top-level
"capabilities": {
  "untrustedWorkspaces": {
    "supported": true,
    "restrictedConfigurations": [
      "kiroSdlc.backend.allowInsecureRemote",
      "kiroSdlc.backend.url"
    ]
  }
}
```
If Workspace scope must be kept (per UI-SPEC parity with `backend.url`), add a persistent status-bar/Output-channel warning whenever `config.inspect("backend.allowInsecureRemote")?.workspaceValue === true` so a repo-supplied flag is always visible outside the Settings panel.

**References:**
- CWE-15: https://cwe.mitre.org/data/definitions/15.html
- VS Code Workspace Trust: https://code.visualstudio.com/api/overview/extension-capabilities#workspace-trust

---

### Finding #3: Raw `backend.url` reads bypass ALL transport validation (pre-existing — outside this diff)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High *(pre-existing — not introduced by SA4E-320)* |
| **OWASP Category** | A02:2021 — Cryptographic Failures |
| **CWE** | CWE-319: Cleartext Transmission of Sensitive Information |
| **CVSS Score** | 7.4 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:H/A:N) |
| **Location** | `extension/src/extension.ts:177`; `extension/src/indexer-http.ts:11-13`; `extension/src/indexer.ts:13-15` |
| **Status** | Open (pre-existing — recommend separate follow-up ticket) |

**Description:**
Three call sites read `kiroSdlc.backend.url` directly via `getConfiguration().get()` and **never call `validateBackendUrl`/`getBackendUrl`**:
```typescript
// extension.ts:177 — feeds AuthManager, McpServerManager, KnowledgeClient, IndexerHttpClient
const backendUrl = mcpConfig.get<string>("backend.url") || "http://127.0.0.1:48721";

// indexer-http.ts:11-13 — no validation at all
function getBackendUrl(): string | undefined {
  return vscode.workspace.getConfiguration("kiroSdlc").get<string>("backend.url");
}

// indexer.ts:13-15 — no validation at all
function getBackendUrl(): string {
  return vscode.workspace.getConfiguration("kiroSdlc").get<string>("backend.url") || "http://127.0.0.1:48721";
}
```
These paths neither enforce SEC-289-03 when bypass is OFF, nor consult/emits warnings when bypass is ON. Bearer tokens (`Authorization`) and document content are POSTed to whatever URL is configured — including remote HTTP — with zero transport checks and zero warnings.

**Impact:**
SEC-289-03 is only partially enforced (defense-in-depth gap). An attacker who can write workspace settings (Finding #2 vector) gets token exfiltration over HTTP via indexer/AuthManager **even when `allowInsecureRemote=false`** — the new checkbox gives a false sense that all remote-HTTP paths are gated.

**Remediation:**
```typescript
// extension.ts:177 — route through the central validator
import { getBackendUrl } from "./config/backend-url";
const backendUrl = getBackendUrl(); // enforces SEC-289-03 + honors allowInsecureRemote

// indexer-http.ts / indexer.ts — delete local shadows, import shared getBackendUrl
import { getBackendUrl } from "./config/backend-url";
```
File as follow-up ticket referencing SEC-289-03 + SA4E-320.

**References:**
- CWE-319: https://cwe.mitre.org/data/definitions/319.html

---

### Finding #4: `isLoopbackHost` prefix match treats `127.attacker.com` as loopback (pre-existing)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium *(pre-existing — unchanged by this diff)* |
| **OWASP Category** | A02:2021 — Cryptographic Failures |
| **CWE** | CWE-184: Incomplete List of Disallowed Inputs (loopback allowlist too broad) |
| **CVSS Score** | 5.9 (AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N) |
| **Location** | `extension/src/config/backend-url.ts:25` (`hostname.startsWith("127.")`) |
| **Status** | Open (pre-existing — verified via `git show HEAD` identical logic) |

**Description:**
```typescript
export function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.")   // ← matches "127.evil.com", not just 127.0.0.0/8 IPs
  );
}
```
`http://127.attacker.com:48721` (attacker-controlled DNS → any IP) is classified as loopback → **HTTP accepted with bypass OFF, no warning, no throw** — a silent hole in SEC-289-03 that predates this ticket.

**Impact:**
Transport enforcement bypass without the new opt-in flag and without any log line — worse than the bypass feature itself, which at least warns.

**Remediation:**
```typescript
import { isIP } from "node:net";

export function isLoopbackHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "::1" || hostname === "[::1]") return true;
  if (isIP(hostname) === 4) return hostname.startsWith("127.");   // real IPv4 only
  if (isIP(hostname) === 6) return hostname === "::1";
  return false;   // DNS names other than localhost → NOT loopback
}
```
Add regression test: `expect(validateBackendUrl("http://127.evil.com")).toThrow(/Insecure backend URL rejected/)`.

**References:**
- CWE-184: https://cwe.mitre.org/data/definitions/184.html
- RFC 1122 §3.2.1.3 (127.0.0.0/8)

---

### Finding #5: Toggling bypass OFF leaves stored remote HTTP URL → unhandled throws in consumers (fail-closed availability impact)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-703: Improper Check or Handling of Exceptional Conditions |
| **CVSS Score** | 3.3 (AV:L/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L) |
| **Location** | `extension/src/panels/settings/SettingsMessageHandler.ts:214-217`; consumers `tree-view-provider.ts:76`, `ProviderConfigService.ts:32`, `panel-html.ts:16` |
| **Status** | Open |

**Description:**
`handleSetAllowInsecureRemote(false)` only flips the flag — it does not re-validate the currently stored `backend.url`. If the URL is still `http://remote...`, every subsequent `getBackendUrl()` throws `[Security] Insecure backend URL rejected`. Callers such as `KiroTreeViewProvider.getRootItems()` (`tree-view-provider.ts:76`) and `ProviderConfigService.getCurrentState()` (`ProviderConfigService.ts:32`) have **no try/catch**, so the sidebar and Settings state load break until the user fixes the URL manually.

**Evidence:**
```typescript
// SettingsMessageHandler.ts:214-217 — no URL re-validation on disable
private async handleSetAllowInsecureRemote(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration("kiroSdlc")
    .update("backend.allowInsecureRemote", enabled, vscode.ConfigurationTarget.Workspace);
}
```

**Impact:**
Security-wise correct (fail-closed — will not transmit insecurely). Availability/UX degradation; user may not connect the sidebar failure to the checkbox they unchecked.

**Remediation:**
```typescript
private async handleSetAllowInsecureRemote(enabled: boolean): Promise<void> {
  await vscode.workspace.getConfiguration("kiroSdlc")
    .update("backend.allowInsecureRemote", enabled, vscode.ConfigurationTarget.Workspace);
  if (!enabled) {
    try {
      const url = vscode.workspace.getConfiguration("kiroSdlc").get<string>("backend.url", "");
      validateBackendUrl(url, { allowInsecureRemote: false });
    } catch (err: any) {
      this.postMessage({
        type: "backendUrlSaved", success: false,
        message: `Bypass disabled — current URL is invalid: ${err.message}`,
      });
    }
  }
}
```
Wrap `getBackendUrl()` in try/catch at tree-view/settings state boundaries as defense-in-depth.

**References:**
- CWE-703: https://cwe.mitre.org/data/definitions/703.html

---

### Finding #6: Raw `msg.enabled` persisted without boolean coercion

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-20: Improper Input Validation |
| **CVSS Score** | 0.0 |
| **Location** | `extension/src/panels/settings/SettingsMessageHandler.ts:214-216` |
| **Status** | Open |

**Description:**
Webview message field `enabled` is written to configuration without type assertion. Mitigated by strict `=== true` checks at both read sites (`backend-url.ts:76`, `backend-url.ts:103`) — non-boolean truthy values fail closed (enforcement stays ON).

**Remediation:**
```typescript
private async handleSetAllowInsecureRemote(enabled: unknown): Promise<void> {
  await vscode.workspace.getConfiguration("kiroSdlc")
    .update("backend.allowInsecureRemote", enabled === true, vscode.ConfigurationTarget.Workspace);
}
```

**References:**
- CWE-20: https://cwe.mitre.org/data/definitions/20.html

---

### Finding #7: `console.warn` bypass message lacks explicit credential-interception/MITM wording

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A09:2021 — Security Logging and Monitoring Failures |
| **CWE** | CWE-532: Insertion of Sensitive Information into Log File (message clarity — inverse: under-informative warning) |
| **CVSS Score** | 0.0 |
| **Location** | `extension/src/config/backend-url.ts:38-40` |
| **Status** | Open |

**Description:**
Console warning states "traffic ... is unencrypted HTTP" but does not mention credential/data interception or MITM — the risk language used in the UI warning and package.json description. Operators reading only extension logs get a weaker risk signal.

**Evidence:**
```typescript
console.warn(
  `[Security] WARNING: Insecure remote backend URL allowed (allowInsecureRemote=true) — traffic to "${parsed.hostname}" is unencrypted HTTP.`
);
```

**Remediation:**
```typescript
console.warn(
  `[Security] WARNING: Insecure remote backend URL allowed (allowInsecureRemote=true) — traffic to "${parsed.hostname}" is unencrypted HTTP. ` +
  `Credentials and data can be intercepted (MITM). Only use on trusted private networks.`
);
```
Positive note: warning fires on **every** validation call while active (good for audit trails).

**References:**
- CWE-532: https://cwe.mitre.org/data/definitions/532.html

---

### Finding #8: Residual — auth material in cleartext when bypass deliberately ON (`sso_token` in URL query)

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational (Residual risk of the deliberate opt-in) |
| **OWASP Category** | A07:2021 — Identification and Authentication Failures |
| **CWE** | CWE-598: Use of GET Request Method With Sensitive Query Strings |
| **CVSS Score** | 0.0 (requires deliberate bypass activation) |
| **Location** | `extension/src/panels/panel-html.ts:32`; applies to all Bearer-header callers when bypass ON |
| **Status** | Documented (inherent to HTTP opt-in — covered generically by UI warning) |

**Description:**
When bypass is ON, `getIframeHtml` embeds `sso_token=${encodedToken}` in the iframe `src` query string over HTTP — tokens appear in URL, proxy/server access logs, and are interceptable. `Authorization: Bearer` headers (KnowledgeClient, RemoteConverter, indexer) also transit cleartext. The UI warning ("credentials and data can be intercepted") covers this generically; recommend listing it explicitly in the ticket's residual-risk comment.

**Remediation (hardening, optional):**
Prefer cookie-based or header-based bootstrap instead of query-string tokens for the admin iframe; at minimum, document the residual risk in DPG/RLN when bypass is enabled.

**References:**
- CWE-598: https://cwe.mitre.org/data/definitions/598.html

---

## Secure Controls Verified (Positive Findings)

| Control | Evidence |
|---------|----------|
| Secure-by-default (flag OFF) | `extension/package.json:193` → `"default": false` |
| Backward-compatible validator signature | `backend-url.ts:65-67` → `options = {}` optional; no-options call → enforcement ON (`:76`) |
| OFF branch behaviorally identical to pre-change | `git show HEAD:extension/src/config/backend-url.ts` predicate-equivalent refactor; original 4 SEC-289-03 tests unmodified and passing |
| Warning on every bypass-active validation | `backend-url.ts:37-41` inside `enforceHttpsForRemote`, called from `:76` on each `validateBackendUrl` invocation |
| Protocol allowlist unaffected by bypass | `backend-url.ts:48-56` runs unconditionally at `:78`; tests `backend-url.test.ts:59-67` (ftp, ws) |
| Malformed URL rejection unaffected by bypass | `backend-url.ts:80-87`; test `backend-url.test.ts:80-85` |
| Loopback HTTP / HTTPS remote unaffected + no false warning | test `backend-url.test.ts:69-78` asserts `warnSpy` not called |
| Save-time + test-time server-side validation | `SettingsMessageHandler.ts:199-212` (save), `:219-227` (test) with fresh flag read `:194-197` |
| Optimistic-UI error override | `settings.js:554-557` → `backendUrlSaved` failure replaces premature "Saved ✓" (`:415-418`) |
| UI warning default-hidden, a11y attributes | `SettingsPanel.ts:134` → `hidden` + `aria-describedby` + `aria-live="polite"` |
| State restore of checkbox + warning | `settings.js:624-628` from `ProviderConfigService` state (`:33`, `:51`) |
| Flag source = VS Code config only | No env/query read of `allowInsecureRemote` anywhere in codebase (grep verified) |
| Strict boolean gate (fail-closed) | `backend-url.ts:76` and `:103` → `=== true` |
| Unit tests executed | `npx vitest run src/config/__tests__/backend-url.test.ts` → **9/9 passed** |

---

## Dependency Vulnerabilities

| Dependency | Change in this diff | CVE | Severity | Notes |
|-----------|---------------------|-----|----------|-------|
| *(none)* | No dependency additions/removals in SA4E-320 diff | — | — | No new attack surface from third-party packages |

---

## Security Headers Assessment

*Not applicable to this change* — extension webview HTML (not an HTTP server response). Webview uses `nonce` + `Content-Security-Policy` patterns pre-existing in `panel-html.ts` (out of diff scope; not re-assessed).

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | #1 KnowledgeClient does not honor bypass flag | Medium | Ticket requirement unmet; activation crash / inconsistent enforcement |
| 2 | #2 Workspace-scope silent flag enable | Low | Blocks supply-chain silent transport downgrade |
| 3 | #3 Raw `backend.url` reads (pre-existing) | Low | Closes SEC-289-03 enforcement gaps on AuthManager/MCP/Indexer paths |
| 4 | #4 `isLoopbackHost` `127.` prefix (pre-existing) | Low | Eliminates silent HTTP acceptance for `127.*` DNS names |
| 5 | #5 Bypass-OFF with stale remote HTTP URL | Low | Prevents sidebar/Settings fail-closed breakage |
| 6 | #6/#7 Input coercion + warning copy polish | Low | Defense-in-depth + consistent risk messaging |
| 7 | #8 Residual auth-material-in-URL | Medium (hardening) | Document now; optional header/cookie bootstrap later |

---

## Recommendations Summary

### Immediate Actions (before/at merge — Conditions of Approval)
1. **Fix Finding #1** — propagate `allowInsecureRemote` into `KnowledgeClient` construction (Option A), OR amend ticket to document intentional fail-closed KB behavior and switch `extension.ts:177` to `getBackendUrl()` for controlled error handling.
2. **Add residual-risk comment to SA4E-320** covering MITM, credential interception, `sso_token` query exposure, and workspace-scope flag (list below).
3. **File follow-up tickets** for Finding #3 (raw config reads) and Finding #4 (`isLoopbackHost` prefix) referencing SEC-289-03.

### Short-term Improvements (Medium)
1. Add `scope: "machine"` or `restrictedConfigurations` for the bypass flag (Finding #2); or add persistent status-bar warning when `workspaceValue === true`.
2. Re-validate stored URL when bypass is toggled OFF and surface error to user (Finding #5).
3. Coerce `enabled === true` before persisting (Finding #6).

### Long-term Hardening (Low/Informational)
1. Enrich `console.warn` with MITM/credential wording (Finding #7).
2. Replace `sso_token` query bootstrap with header/cookie mechanism (Finding #8).
3. Route all `getBackendUrl`-equivalent call sites through the single validated helper; delete local shadow functions in `indexer.ts` / `indexer-http.ts`.
4. Consider structured logger with redaction instead of raw `console.warn` for security events (aligns with SA4E-289 prior recommendation).

---

## Residual Risks for Ticket Comment (SA4E-320)

> To be pasted into the Jira ticket by SM/DevOps:
>
> **Residual risks accepted with this change (bypass ON, deliberate user opt-in):**
> 1. **MITM / eavesdropping** — all traffic to the remote backend (KB chat, checkpoints, MCP tool calls, document content, `X-Project-Id`) transits cleartext HTTP; an on-path attacker can read and modify data.
> 2. **Credential/token interception** — `Authorization: Bearer` headers and `X-Project-Id` are trivially captured; `sso_token` bootstrap token for the admin iframe appears in the **URL query string** (`panel-html.ts:32`) and may persist in proxy/server access logs (CWE-598).
> 3. **Workspace-scope persistence** — the flag and URL can be committed in `.vscode/settings.json`; opening a crafted workspace can activate the bypass without clicking the checkbox (UI restores checkbox=checked + warning, but only after opening Settings).
> 4. **Inconsistent enforcement (known gap)** — `KnowledgeClient` ignores the flag (fail-closed hard-fail); `extension.ts:177` / `indexer.ts` / `indexer-http.ts` read the URL raw and never enforce transport checks at all (pre-existing, follow-up tickets required).
> 5. **Loopback check weakness (pre-existing)** — hostnames matching `127.*` but not being loopback IPs (e.g. `127.attacker.com`) are accepted over HTTP with bypass OFF and **no warning** (follow-up ticket required).
> 6. **Warning visibility** — while bypass is ON, risk signal is limited to `console.warn` in extension logs + Settings panel warning div; no persistent status-bar indicator outside the Settings panel.
> 7. **Assurance level** — static analysis + unit tests only; no dynamic MITM/proxy testing, no infrastructure/TLS configuration review performed.

---

## Verdict

# ✅ APPROVE WITH CONDITIONS

**Rationale:** The core security design of SA4E-320 meets SEC-289-03's intent: secure-by-default (default `false`, verified in `package.json`), opt-in only (validator without options unchanged — backward compatible), warning on every bypass-active validation, UI warning accurate and hidden-by-default, bypass scope strictly limited to the HTTP-vs-HTTPS check (protocol allowlist and malformed-URL rejection remain enforced — test-verified), flag sourced exclusively from VS Code configuration with fresh reads at validation time, and the OFF branch is behaviorally identical to pre-change (9/9 tests pass). No Critical findings; no finding introduced by this diff warrants rejection.

**Conditions (must be satisfied before merge / at latest as tracked follow-ups):**
1. **Finding #1 (blocking for ticket acceptance):** Either propagate `allowInsecureRemote` into `KnowledgeClient` construction so the bypass flows end-to-end, or formally amend the ticket to document fail-closed KB behavior and fix `extension.ts:177` to use `getBackendUrl()` so activation fails gracefully with a user-visible message.
2. **Findings #3 and #4:** File follow-up tickets (pre-existing, not introduced here) — raw `backend.url` reads and `isLoopbackHost` `127.` prefix weakness must not be forgotten while SEC-289-03 is being relaxed.
3. **Residual risks:** Paste the "Residual Risks for Ticket Comment" section into SA4E-320 (required by ticket: Security Design Review documentation).
4. **Finding #2 (strongly recommended in same PR or immediate follow-up):** Restrict the flag via `scope: "machine"` or `restrictedConfigurations`, or add a persistent indicator when the bypass is active outside the Settings panel.

---

## Appendix

### A. Tools & Methodology
- Static code analysis (manual review of 8 specified files + all `getBackendUrl`/`validateBackendUrl`/`allowInsecureRemote` call sites via ripgrep)
- Baseline comparison: `git diff` + `git show HEAD:extension/src/config/backend-url.ts` for OFF-branch equivalence
- Unit test execution: `npx vitest run src/config/__tests__/backend-url.test.ts` → 9/9 passed (v4.1.8)
- KB search first: `mem_search` for SA4E-320 / SEC-289-03 design docs (no prior entries found)
- OWASP Testing Guide v4.2 / OWASP Top 10 (2021) methodology; CVSS v3.1 severity alignment

### B. Scope Limitations
- **Static analysis only** — no dynamic testing, no live MITM/proxy interception, no running-extension behavioral test
- **Not tested:** infrastructure/TLS termination, backend server-side enforcement, VS Code Workspace Trust runtime behavior (capability default assumed from manifest inspection — no `capabilities` block present)
- **Out of this diff but reviewed for context:** pre-existing raw-read consumers (`extension.ts`, `indexer.ts`, `indexer-http.ts`) and `isLoopbackHost` — reported as pre-existing findings, not regressions of SA4E-320
- **Not reviewed:** backend (`backend/`) transport enforcement, PegaHttpClient's separate `backendUrl` setting (different key), HTTP client certificate validation (`http-client-utils`) beyond URL validation entry point
- Assumption: VS Code `ConfigurationTarget.Workspace` writes to `.vscode/settings.json` (committed unless gitignored)

### C. Glossary
- **CVSS**: Common Vulnerability Scoring System
- **CWE**: Common Weakness Enumeration
- **OWASP**: Open Web Application Security Project
- **SEC-289-03**: Project security requirement — Transport Security (HTTPS enforcement for non-loopback backend)
- **Bypass flag**: `kiroSdlc.backend.allowInsecureRemote` (boolean, default false)
- **Fail-closed**: System refuses insecure operation when security control cannot be satisfied

### D. Files Reviewed
| # | File | Reviewed Lines / Focus |
|---|------|------------------------|
| 1 | `extension/src/config/backend-url.ts` | Full (105 lines) — validator, bypass, loopback, getBackendUrl |
| 2 | `extension/package.json` | `:186-195` config contribution (default false) |
| 3 | `extension/src/panels/settings/SettingsPanel.ts` | `:134` checkbox + warning HTML |
| 4 | `extension/src/panels/settings/SettingsMessageHandler.ts` | Full (321 lines) — save/test/toggle handlers |
| 5 | `extension/src/services/ProviderConfigService.ts` | Full (126 lines) — state exposure |
| 6 | `extension/webview-assets/settings/settings.js` | `:56-58`, `:415-430`, `:554-557`, `:624-628` — binding/toggle/restore |
| 7 | `extension/src/config/__tests__/backend-url.test.ts` | Full (86 lines) + executed 9/9 pass |
| 8 | `extension/src/knowledge-client.ts` | `:138-155` resolveKbBaseUrl, `:168-182` constructor validation |
| + | Consumers: `extension.ts:177,211`, `tree-view-provider.ts:76`, `panel-html.ts:16,32`, `graph-panel.ts:46`, `RemoteConverter.ts:40`, `SessionManager.ts:26`, `remote-checkpointer.ts:50`, `remote-checkpointer-store.ts:70`, `indexer.ts:13`, `indexer-http.ts:11` | Bypass propagation / raw-read gaps |

---

## Addendum — Finding #1 RESOLVED (post-review, 2026-09-24)

> Amended 2026-09-24 by Security Agent (SECURITY) — post-review follow-up for SA4E-320. This addendum records the post-fix resolution of Finding #1. Original finding bodies, severity ratings, and the overall verdict are preserved unchanged (historical record); status changes are recorded here and via the ✅ RESOLVED heading marker only.

| Attribute | Value |
|-----------|-------|
| **Status** | Finding #1 (🟡 Medium, blocking for ticket acceptance) → **RESOLVED** — Conditions of Approval item #1 satisfied (code path) |
| **What changed** | `KnowledgeClient` constructor now reads `kiroSdlc.backend.allowInsecureRemote` via `getAllowInsecureRemote()` and forwards it to `validateBackendUrl(baseUrl, { allowInsecureRemote })` — enforcement is now consistent between `getBackendUrl()`/`resolveKbBaseUrl()` consumers and `KnowledgeClient` |
| **Fail-closed preserved** | Flag read failure → bypass OFF (enforcement stays ON); `[Security]`-prefixed validation errors are re-thrown from the constructor |

**Evidence:**

| # | Evidence | Detail |
|---|----------|--------|
| (a) | Code refs | `extension/src/knowledge-client.ts:176-186` — constructor forwards `allowInsecureRemote` via `getAllowInsecureRemote()` (source comment: "SA4E-320 Finding #1: forward the opt-in bypass flag so KnowledgeClient validation is consistent with getBackendUrl()/resolveKbBaseUrl(). Flag read failure → fail-closed (bypass OFF, enforcement stays ON)."); `:141-159` — `resolveKbBaseUrl()` delegates to `getBackendUrl()`, which reads both `backend.url` and the `allowInsecureRemote` flag |
| (b) | Tests | `extension/src/config/__tests__/knowledge-client-bypass.test.ts` — 12 tests incl. **"bypass ON + remote HTTP → new KnowledgeClient does NOT throw (Finding #1 regression)"** and **"bypass OFF + remote HTTP → new KnowledgeClient still throws [Security]"**; `ftp`/`ws`/malformed URL still rejected with flag ON; loopback HTTP still allowed — **22/22 pass** (12 bypass + 10 backend-url) verified 2026-09-24 via `npx vitest run src/config/__tests__/knowledge-client-bypass.test.ts src/config/__tests__/backend-url.test.ts` |
| (c) | Commit | `61ad0f8` on main ("SA4E-320: opt-in checkbox to bypass HTTPS enforcement for remote backend") — `knowledge-client.ts` +22 lines, `knowledge-client-bypass.test.ts` +124 lines; also `backend-url.ts` +82 changed, `backend-url.test.ts` +88 changed |
| (d) | RUN-LOG | `documents/SA4E-320/RUN-LOG.md` #7 — "Fix blocking Finding #1 (forward allowInsecureRemote via getAllowInsecureRemote helper) + hardenings #6/#7" — 90+10+102 tests pass, `tsc` clean, KB ingest id=613792 |

**Impact on verdict:** **Overall verdict remains APPROVE WITH CONDITIONS** — Finding #1 no longer blocks ticket acceptance; remaining open conditions: residual-risk comment (item #2) and splitting pre-existing Findings #3 (High) / #4 (Medium) into separate follow-up tickets (item #3).

**Explicit note:** Pre-existing **Findings #3 and #4 remain OPEN** and are outside this ticket's scope — to be tracked as separate follow-up tickets referencing SEC-289-03 (see Verdict → Conditions #2).
