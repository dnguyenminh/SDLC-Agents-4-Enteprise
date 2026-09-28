# 🔒 Security Design Review — SA4E-324: Pi Context Budget + Model Registry

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension) |
| Ticket | SA4E-324 (Epic SA4E-289) |
| Scope | Pi Context Budget + Model Registry — `countTokens` per provider, `detectContextWindow`, `BudgetCalculator`, `ModelRegistry`, `ThinkingLevelMapper`, NEW `js-tiktoken` dependency |
| Design docs | `documents/SA4E-324/TDD.md` v1.1 FINAL, `FSD.md` v1.2, `BRD.md` v1.0 |
| Code reviewed | `extension/src/langgraph/providers/*.ts` (anthropic/openai/ollama/onnx-provider, onnx-tokenizer, BaseLlmProvider, provider-registry, openai-helpers, ollama-tools), `extension/src/langgraph/core/llm-provider.ts`, `extension/src/pi-agent/credentials-manager.ts` (reference-only), `settings-manager.ts`, `session-configurator.ts`, `session-orchestrator.ts`, `session-factory.ts`, `model-registry.ts`, `context-budget.ts`, `thinking-level-mapper.ts`, `agent-dir-resolver.ts`, `agent-configurator.ts`, `workspace-root-resolver.ts`, `extensions/mcp-bridge-extension.ts`, `extensions/mcp-wrapper-client.ts`, `extensions/tool-definitions.ts`, `chat-panel/context-usage-tracker.ts`, `chat/compact/secretFilter.ts`, `debug-logger.ts`, `logger.ts`, `extension/package.json` |
| Date | 2026-09-27 |
| Assessor | Security Agent (static design review, no exploitation attempted) |
| Version | 1.0 |
| Verdict | **CONDITIONAL PASS** — design is sound (reference-only credentials, fail-closed budget, diagnostics without raw text); 3 High findings must be fixed before merge (baseUrl key-exfiltration, ONNX path traversal, tool-chaining allowlist) |

## Executive Summary

SA4E-324 adds a pre-session Context Budget Gate and a 9-entry Model Registry inside the VS Code extension host, plus per-provider `countTokens` (Anthropic `count_tokens`, OpenAI-compat `/tokenize`, Ollama `tokenize-or-dry-run`, ONNX `tokenizer.json`, cloud-OpenAI `js-tiktoken` local) and a standardized cached `detectContextWindow`. The TDD/FSD security posture is mature for a design: API keys stay in SecretStorage and travel as `CredentialRef` (never logged, FSD NFR-09), the gate is fail-closed (`contextWindow <= 0 → 100%`), `SessionDiagnostics` carries only counts/percents (no raw prompt), and threat-model-relevant gaps from TA review (M-02 type alias, M-03 window mismatch, M-08 weak contract) are already tracked as TO-BE work.

The review verified **13 findings (0 Critical, 3 High, 5 Medium, 4 Low, 1 Informational)**. The three Highs are all instances of the same root pattern — **caller-controlled strings flowing into security-sensitive sinks without validation**: (1) user-configurable provider `baseUrl` receives the API key on every `chat`/`countTokens`/`detectContextWindow` call (SSRF + key exfiltration, including via untrusted-workspace `.vscode/settings.json` since LLM base URLs are NOT in `restrictedConfigurations`); (2) `OnnxProvider` builds a filesystem path from an unguarded `modelId` (path traversal → arbitrary file read; the TDD §6.4 regex guard is designed but not yet coded, and `isAvailable()` still checks only `model.onnx`); (3) the Pi→MCP bridge exposes `execute_dynamic_tool` with required-field-only validation, letting a compromised tool output chain into any MCP tool without an allowlist or approval gate. None is remotely exploitable without local/workspace influence, hence High rather than Critical — but all three are realistically reachable and each has a short, idiomatic fix provided below.

**Overall Risk Rating: High** (downgrades to Low once SEC-324-01/02/03 remediations land; Mediums are defense-in-depth and can ride the same PR).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 3 |
| 🟡 Medium | 5 |
| 🔵 Low | 4 |
| ℹ️ Informational | 1 |

## Findings Summary Table

| ID | Title | Severity | CVSS | OWASP | Location | Status |
|----|-------|----------|------|-------|----------|--------|
| SEC-324-01 | Provider `baseUrl` SSRF + API-key exfiltration to arbitrary host | High | 7.5 | A01/A10 | `anthropic-provider.ts:22-25`, `openai-provider.ts:22-29`, `ollama-provider.ts:19-23`, `package.json:318-337` | Open |
| SEC-324-02 | ONNX `modelId` path traversal → arbitrary file read (`tokenizer.json`) | High | 7.1 | A01 | `onnx-provider.ts:36-39,92-96`, `onnx-tokenizer.ts:18-21` | Open |
| SEC-324-03 | Pi→MCP bridge allows arbitrary tool chaining (`execute_dynamic_tool`, required-only validation) | High | 6.5 | A01 | `tool-definitions.ts:67-96`, `mcp-bridge-extension.ts:26-52` | Open |
| SEC-324-04 | Cloud `countTokens` ships full prompt/history (PII/secrets) to vendors; `secretFilter` not wired into gate path | Medium | 5.9 | A02 | TDD §3.5/FSD §7.2 vs `secretFilter.ts:35`, `CompactService.ts:17`, `logger.ts:17-33` | Open |
| SEC-324-05 | `CredentialsError` message embeds raw `ref` → secret leaks into logs on rejection | Medium | 5.3 | A09 | `credentials-manager.ts:20-29` | Open |
| SEC-324-06 | `SettingsManager` fail-open + `__proto__` pollution + unbounded `JSON.parse` | Medium | 5.5 | A08 | `settings-manager.ts:31-68` | Open |
| SEC-324-07 | `cwd`/`agentDir` uncontained + `SYSTEM.md` symlink read → prompt-content exfiltration | Medium | 5.0 | A01 | `agent-dir-resolver.ts:17-27`, `agent-configurator.ts:64-74`, `workspace-root-resolver.ts:22-38`, `session-orchestrator.ts:31-41` | Open |
| SEC-324-08 | NEW `js-tiktoken` dependency: inactive maintenance + WASM supply chain, no pin/audit | Medium | 4.5 | A06 | `extension/package.json:494-513` (absent today), TDD §1.3/D-01 | Open |
| SEC-324-09 | Unbounded sync `readFileSync` + `JSON.parse(tokenizer.json)` blocks extension host (DoS) | Low | 3.7 | A04 | `onnx-tokenizer.ts:18-31` | Open |
| SEC-324-10 | Production `logger.ts` has no redaction (unlike `debug-logger.ts`); future `countTokens` error fields at risk | Low | 3.5 | A09 | `logger.ts:17-33` vs `debug-logger.ts:16-23` | Open |
| SEC-324-11 | User-controlled model string flows into logs/diagnostics (`fallbackFrom`) → log injection | Low | 3.3 | A09 | `session-configurator.ts:90-92,136-150` | Open |
| SEC-324-12 | No cache/coalescing/rate-limit on `detectContextWindow`/`countTokens`; health ping costs tokens | Low | 3.7 | A04 | `openai-provider.ts:44-87`, `ollama-provider.ts:27-44`, `BaseLlmProvider.ts:58-72` | Open |
| SEC-324-13 | Loopback MCP `127.0.0.1:9181` without auth/timeout; unbounded tracker map; undisposed sessions (info) | Info | 2.5 | A05 | `mcp-wrapper-client.ts:28-52`, `context-usage-tracker.ts:33-38`, `session-factory.ts:29-45` | Open |

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
SEC-324-01 (baseUrl key-routing), SEC-324-02 (path traversal), SEC-324-03 (tool-chaining authz), SEC-324-07 (cwd/agentDir containment). Strong compensating control acknowledged: `CredentialRef` reference-only passthrough (`session-configurator.ts:104-114`) and registry `validate()` are well designed.

### A02:2021 — Cryptographic Failures
SEC-324-04. Positive: keys in SecretStorage, TLS to vendors, no key material in `SessionDiagnostics`. Gap is PII-in-transit minimization for cloud counting, not key handling.

### A03:2021 — Injection
No shell/command injection in SA4E-324 scope ✅ (`DiagramRenderer` uses fixed-arg `execFile`/`spawn`; gate path uses `fetch` + `JSON.stringify` only). Parameter/log injection covered as SEC-324-03/11; prototype pollution as SEC-324-06.

### A04:2021 — Insecure Design
SEC-324-09, SEC-324-12. Positive: fail-closed budget (`contextWindow <= 0 → 100%`, `context-budget.ts:51`), fail-closed mapper-throw (TO-BE M-01), REJECT-before-Pi-call ordering ✅.

### A05:2021 — Security Misconfiguration
SEC-324-13 (info). No HTTP security headers apply (extension host, no served content); loopback HTTP is by design and consistent with `backend-url.ts` loopback policy.

### A06:2021 — Vulnerable and Outdated Components
SEC-324-08. No known CVE in `js-tiktoken` 1.0.21 (Snyk: 0 direct vulns); risk is maintenance-inactive + WASM opacity, not a vulnerable version.

### A07:2021 — Identification and Authentication Failures
No findings ✅ — auth model (SecretStorage `getApiKey`, local providers keyless, `ensureClient` throw-before-HTTP) is correct; `isHealthyStatus` treating 401/403/429 as "reachable" is intentional and documented.

### A08:2021 — Software and Data Integrity Failures
SEC-324-06. `tokenizer.json`/`settings` files lack integrity/size checks; `onnxruntime-node` dynamic import lacks pinning note.

### A09:2021 — Security Logging and Monitoring Failures
SEC-324-05, SEC-324-10, SEC-324-11. Positive: structured `warn/error` on fallback/WARN/REJECT with model+percent (TDD §9) and existing redaction in `debug-logger.ts`/`diagnostics-feed-service.ts`/`secretFilter.ts` — but the production `logger.ts` path used by the gate is the one without redaction.

### A10:2021 — Server-Side Request Forgery (SSRF)
SEC-324-01 (primary). `McpWrapperClient` loopback default is not SSRF (fixed `127.0.0.1:9181`); the SSRF sink is the user-configurable LLM `baseUrl` family.

## Detailed Findings

### SEC-324-01: Provider `baseUrl` SSRF + API-key exfiltration to arbitrary host

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A01:2021 + A10:2021 |
| **CWE** | CWE-918: Server-Side Request Forgery; CWE-200: Exposure of Sensitive Information |
| **CVSS Score** | 7.5 (AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:L/A:L — requires user to open a workspace / accept settings that override the base URL) |
| **Location** | `extension/src/langgraph/providers/anthropic-provider.ts:22-25`, `openai-provider.ts:22-29`, `ollama-provider.ts:19-23`, `extension/package.json:318-337` |
| **Status** | Open |

**Description:**
Every provider constructor accepts a caller/settings-supplied `baseUrl`/`apiBase` with only a trailing-slash strip — no scheme check, no host allowlist, no HTTPS enforcement:

```typescript
// anthropic-provider.ts:22-25 — representative of all three
this.baseUrl = (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, "");
```

The API key obtained from SecretStorage is then attached to requests against that host on **every** network path the ticket adds traffic to: `chat`/`chatStream`/`chatWithTools` today, plus TO-BE `countTokens` (batched, up to N per-text sub-calls for Anthropic) and `detectContextWindow` (`GET /v1/models`, `POST /api/show`). A `baseUrl` pointing at an attacker host therefore receives `x-api-key` / `Authorization: Bearer` verbatim. The settings surface is broad (`kiroSdlc.anthropicBaseUrl`, `openaiBaseUrl`, `ollamaUrl`, `lmstudioBaseUrl`, `openrouterBaseUrl`, `mcpServerUrl`) and — critically — **LLM base URLs are NOT in `package.json:19-26` `restrictedConfigurations` for untrusted workspaces**, so a malicious repository's `.vscode/settings.json` can redirect counting/window/chat traffic (and the key) without the untrusted-workspace guard that protects `backend.url`. The backend's own `validateBackendUrl` (`extension/src/config/backend-url.ts:34-60`) already implements the correct policy (HTTPS for remote, loopback-HTTP exception, `allowInsecureRemote` opt-in); providers simply do not reuse it. Blind-SSRF to link-local targets (e.g. cloud metadata `169.254.169.254` via a crafted `openaiBaseUrl`) is additionally reachable from the extension host's network position.

**Evidence:**
```typescript
// openai-helpers.ts:34-38 — key attached unconditionally when present
export function buildHeaders(apiKey: string): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) { headers["Authorization"] = `Bearer ${apiKey}`; }
  return headers;
}
// openai-provider.ts:48-51 — arbitrary host + key-adjacent traffic, 5s timeout only control
const response = await fetch(`${this.apiBase}/models`, {
  method: "GET",
  signal: AbortSignal.timeout(5000),
});
```

**Impact:**
Credential exfiltration (Anthropic/OpenAI keys billed to attacker), blind SSRF from the developer workstation into cloud-metadata/intranet endpoints, and prompt-content disclosure (TO-BE `countTokens` posts full history to the same host). Custom gateways (LiteLLM/OmniRoute) are a legitimate use case, so the fix is validation + explicit consent, not removal.

**Remediation:**
Reuse the existing backend policy for provider URLs (HTTPS-remote / loopback-HTTP / explicit opt-in), and never send key material to a non-allowlisted host without one-time user consent:

```typescript
// providers/provider-url-policy.ts (NEW, mirrors config/backend-url.ts)
import { validateBackendUrl } from "../config/backend-url";

export function validateProviderBaseUrl(url: string, provider: string): string {
  // Throws on non-loopback http:// unless kiroSdlc.backend.allowInsecureRemote;
  // throws on non-http(s) schemes (file:, gopher:, ftp:). Reuses tested policy.
  return validateBackendUrl(url);
}

// anthropic-provider.ts constructor — validate once, fail closed
constructor(getApiKey: () => Promise<string | undefined>, baseUrl?: string, defaultModel?: string) {
  super();
  this.getApiKey = getApiKey;
  this.baseUrl = validateProviderBaseUrl(
    (baseUrl || DEFAULT_BASE_URL).replace(/\/$/, ""), "anthropic"
  );
  // ...
}

// + package.json: add "kiroSdlc.anthropicBaseUrl", "kiroSdlc.openaiBaseUrl",
//   "kiroSdlc.ollamaUrl", "kiroSdlc.lmstudioBaseUrl" to
//   capabilities.untrustedWorkspaces.restrictedConfigurations so a hostile
//   .vscode/settings.json cannot silently reroute keys in untrusted workspaces.
```

**References:**
- https://cwe.mitre.org/data/definitions/918.html
- `extension/src/config/backend-url.ts:34-83` (policy to reuse)

---

### SEC-324-02: ONNX `modelId` path traversal → arbitrary file read

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A01:2021 |
| **CWE** | CWE-22: Improper Limitation of a Pathname to a Restricted Directory |
| **CVSS Score** | 7.1 (AV:L/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:L — malicious model id via settings/workspace reaches sync file read) |
| **Location** | `extension/src/langgraph/providers/onnx-provider.ts:36-39,92-96`, `onnx-tokenizer.ts:18-21` |
| **Status** | Open |

**Description:**
`OnnxProvider` joins a caller-supplied `modelId` straight into the tokenizer/model path with no allowlist, no canonicalization, and no containment check — the TDD §6.4 regex guard (`^[a-z0-9][a-z0-9._-]*$`) is designed but **not implemented**:

```typescript
// onnx-provider.ts:36-39 — current code, no guard
this.modelId = modelId || DEFAULT_MODEL_ID;
this.modelDir = path.join(workspaceRoot, ".code-intel", "models", "llm", this.modelId);
// ...
this.tokenizer = await OnnxTokenizer.load(path.join(this.modelDir, modelConfig.tokenizerFile));
```

`OnnxTokenizer.load` then performs a synchronous unbounded `readFileSync` + `JSON.parse`. A `modelId` such as `../../../../.ssh/id_rsa` (or an absolute path, depending on the caller that forwards `params.model` / settings `llmModel`) escapes the models directory; the resulting error text (`ENOENT`/`SyntaxError` naming the resolved path) itself discloses filesystem layout, and a successful parse of a non-tokenizer JSON yields a attacker-influenced vocab (poisoned token counts → budget-gate bypass toward ALLOW on an over-budget session, or systematic REJECT = DoS). Compounding the issue, `isAvailable()` (`onnx-provider.ts:69-79`) checks only `model.onnx` and never `tokenizer.json`, so the TO-BE `countTokens` would fail late at gate time instead of fast-failing (TA EF-05, already tracked — this finding is the security half of that gap).

**Impact:**
Local arbitrary file read (confidentiality), filesystem-layout disclosure via error messages, and budget-gate integrity loss (fabricated counts) if a crafted JSON parses.

**Remediation:**
Implement the TDD-specified guard plus realpath containment, and close the `isAvailable` gap in the same change:

```typescript
// onnx-provider.ts
const MODEL_ID_RE = /^[a-z0-9][a-z0-9._-]*$/; // TDD §6.4 — reject .., /, absolute paths
function resolveModelDir(workspaceRoot: string, modelId: string): string {
  if (!MODEL_ID_RE.test(modelId)) {
    throw new Error(`Invalid modelId '${modelId}'`);
  }
  const base = path.resolve(workspaceRoot, ".code-intel", "models", "llm");
  const dir = path.resolve(base, modelId);
  if (dir !== base && !dir.startsWith(base + path.sep)) {
    throw new Error(`modelId escapes models directory: '${modelId}'`);
  }
  return dir;
}

// isAvailable — check BOTH files (TA EF-05 requirement)
async isAvailable(): Promise<boolean> {
  try {
    const fs = await import("fs");
    const modelConfig = ONNX_MODEL_REGISTRY.find(m => m.id === this.modelId);
    if (!modelConfig) return false;
    return fs.existsSync(path.join(this.modelDir, modelConfig.modelFile))
        && fs.existsSync(path.join(this.modelDir, modelConfig.tokenizerFile));
  } catch { return false; }
}
```

**References:**
- https://cwe.mitre.org/data/definitions/22.html

---

### SEC-324-03: Pi→MCP bridge allows arbitrary tool chaining with required-field-only validation

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP Category** | A01:2021 |
| **CWE** | CWE-20: Improper Input Validation; CWE-693: Protection Mechanism Failure |
| **CVSS Score** | 6.5 (AV:N/AC:H/PR:N/UI:N/S:U/C:L/I:H/A:N — needs a prompt-injected or compromised tool output driving the LLM to call it) |
| **Location** | `extension/src/pi-agent/extensions/tool-definitions.ts:67-96`, `mcp-bridge-extension.ts:26-52` |
| **Status** | Open |

**Description:**
The bridge registers `execute_dynamic_tool` as a Pi-callable tool whose parameters are `{ tool_name: string, arguments: object }` with only `tool_name` required, and `validateParams` enforces nothing else — no type checks, no value allowlist, no length caps:

```typescript
// tool-definitions.ts:84-96
export function validateParams(schema: any, params: Record<string, unknown>) {
  const required = schema.required || [];
  for (const field of required) {
    if (!(field in params)) return { valid: false, error: `Missing required field: ${field}` };
  }
  return { valid: true }; // ← no type/enum/range validation at all
}
```

`createExecuteHandler` then forwards whatever the LLM produced straight to `mcpClient.callMcpWrapper(toolName, params)` — i.e. **any MCP tool by name with arbitrary arguments**, unauthenticated, unapproved, unlogged. The existing `ToolApprovalClassifier` / approval-gate machinery (`chat/engine/ToolApprovalClassifier.ts`, `langgraph-engine.ts`) sits on the LangGraph path, not on this Pi-extension path, so bridge calls bypass per-tool authorization. Combined with tool-output→prompt ingestion elsewhere in the system, this is a textbook tool-chaining privilege-escalation and prompt-injection amplifier: one poisoned `jira_get_issue`/`code_search` result can steer the model into `execute_dynamic_tool({tool_name: <destructive/egress tool>, arguments: {...}})`.

**Impact:**
LLM-driven invocation of arbitrary workspace tools (read, network, memory ingest → KB poisoning, downstream automation) without user approval; turns any single prompt-injection into full toolbelt access.

**Remediation:**
Allowlist + argument schema enforcement + approval hook on the bridge path (not just presence validation):

```typescript
// tool-definitions.ts — per-tool JSON-schema with types, enums, caps
const TOOL_ALLOWLIST = new Set(["jira_get_issue", "mem_search", "code_search"]);
export function validateParams(schema: any, params: Record<string, unknown>) {
  if (typeof params !== "object" || params === null) return { valid: false, error: "params must be an object" };
  for (const field of schema.required || []) {
    if (!(field in params)) return { valid: false, error: `Missing required field: ${field}` };
  }
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === "string" && v.length > 4000) return { valid: false, error: `Field '${k}' exceeds 4000 chars` };
  }
  return { valid: true };
}

// mcp-bridge-extension.ts — deny execute_dynamic_tool chaining by default
if (tool.name === "execute_dynamic_tool" && !options?.allowDynamicChaining) continue; // BR: opt-in only
// + route bridge calls through the same approval classifier used by the engine,
// + log every invocation { toolName, argKeys, decision } for audit.
```

**References:**
- https://cwe.mitre.org/data/definitions/20.html
- OWASP LLM Top 10 LLM06 (Excessive Agency), LLM01 (Prompt Injection)

### SEC-324-04: Cloud `countTokens` ships full prompt/history to vendors; `secretFilter` not wired into gate path

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A02:2021 |
| **CWE** | CWE-201: Insertion of Sensitive Information Into Sent Data |
| **CVSS Score** | 5.9 (AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N — data-residency/PII exposure on every gated session) |
| **Location** | TDD §3.5 / FSD §7.2 (design) vs `extension/src/chat/compact/secretFilter.ts:35`, `chat/compact/CompactService.ts:17`, `extension/src/logger.ts:17-33` |
| **Status** | Open |

**Description:**
The TO-BE gate resolves `{systemText, toolSchemaText, retrievalText, historyText}` into counts with ONE batched `countTokens` call — i.e. the **full confidential prompt, tool schemas, RAG retrieval, and conversation history cross the network** to Anthropic (`POST /v1/messages/count_tokens` per text), to any OpenAI-compatible `/tokenize` endpoint (user-configured LM Studio/llama-server; cloud path is local `js-tiktoken`), or joined with `SEP` into one Ollama `/api/chat` dry-run. FSD §7.2 correctly classifies this content Confidential, but the design specifies no minimization, no pre-filter, and no per-provider routing rule. A `secretFilter` (`filterSecrets`/`containsSecrets`) already exists and is proven in `CompactService`, plus `debug-logger.redactSensitive` and `diagnostics-feed-service SECRET_PATTERNS` — yet **none of them is referenced anywhere in TDD §3.5/§5.3/§7, FSD §6.4, or the provider call sites**. Counting inherently needs content, so the issue is not "don't send" but "send knowingly": today a workspace containing API keys, connection strings, or customer PII in history pays a silent extra exfiltration hop to the counting endpoint on top of the inference hop, and the Ollama dry-run additionally logs the joined content server-side in Ollama request logs.

**Impact:**
PII/secret sprawl to a second endpoint (or a user-configured local server with unknown log retention); regulatory data-residency exposure for cloud counting.

**Remediation:**
Document the hop explicitly and prefer local counting for sensitive batches; add a warn-only tripwire (never silent mutation of counted content, which would corrupt budget math):

```typescript
// BaseLlmProvider.countTokens — tripwire, not rewrite
import { containsSecrets } from "../../chat/compact/secretFilter";
async countTokens(texts: string[]): Promise<number[]> {
  if (texts.some(t => t && containsSecrets(t))) {
    logger.warn("countTokens batch contains secret-like patterns; prefer local counting", {
      provider: this.type, redacted: true, // never log the matched text
    });
  }
  // ... existing timeout + countTokensApi logic
}
// + TDD §7.3/FSD §7.2: state that cloud count_tokens is a second disclosure hop
//   covered by the vendor DPA, and that Ollama dry-run content persists in
//   Ollama server logs; recommend js-tiktoken/ONNX-local counting for
//   secret-bearing workspaces.
```

**References:**
- https://cwe.mitre.org/data/definitions/201.html

---

### SEC-324-05: `CredentialsError` message embeds raw `ref` → secret leaks into logs on rejection

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A09:2021 |
| **CWE** | CWE-209: Generation of Error Message Containing Sensitive Information |
| **CVSS Score** | 5.3 (AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N — whoever triggers the guard leaks the value into exception text) |
| **Location** | `extension/src/pi-agent/credentials-manager.ts:20-29` |
| **Status** | Open |

**Description:**
`validateRef` is meant to reject literal secrets, but its own error strings interpolate the rejected value:

```typescript
// credentials-manager.ts:20-29
if (!/^(env:|ref:)/.test(ref)) {
  throw new CredentialsError(`Credential value ref must be reference, not secret: ${ref}`);
}
if (/^sk-[a-zA-Z0-9]{20,}$/.test(ref)) {
  throw new CredentialsError(`Credential value ref contains secret`);
}
```

The first branch echoes `${ref}` — precisely in the case where `ref` is believed to be a live secret — into an exception that propagates to callers and extension logs (which persist on disk in VS Code log files). The guard also only recognizes `sk-…` literals, missing `sk-ant-`, `ghp_`, `xox-`, `AKIA`, PEM blocks, and `Bearer` tokens, so most real secrets fall into the echoing branch. Secondary issue: `envKey` from `env:…` is used unvalidated (`process.env[envKey]`), so a `CredentialRef` naming `env:AWS_SECRET_ACCESS_KEY` (or any process env) resolves and returns that process secret to the caller — acceptable only because `attachExternalConfig` never resolves (reference-only ✅), but any future `resolve()` caller inherits ambient-authority access to the whole environment.

**Evidence:** same snippet above; positive control acknowledged — `session-configurator.ts:104-114` copies only `{credentialKey, credentialValueRef}`, never material ✅.

**Impact:**
One mistaken `set()`/`resolve()` with a literal key writes that key into logs/diagnostics; overly broad `env:` resolution widens blast radius of a compromised ref string.

**Remediation:**
Never echo the value; broaden detection with the existing shared patterns; pin `env:` to an allowlist:

```typescript
private static validateRef(ref: string): void {
  if (!/^(env:|ref:)/.test(ref)) {
    throw new CredentialsError("Credential value ref must be reference, not secret (value redacted)");
  }
  if (/sk-ant-|ghp_|gho_|xox-|AKIA|BEGIN.*PRIVATE KEY/i.test(ref)) {
    throw new CredentialsError("Credential value ref contains secret (value redacted)");
  }
}
private static readonly ALLOWED_ENV_KEYS = new Set([
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY", // explicit allowlist only
]);
resolve(cred: CredentialRef): string {
  const ref = cred.credentialValueRef;
  CredentialsManager.validateRef(ref);
  if (ref.startsWith("env:")) {
    const envKey = ref.slice(4);
    if (!CredentialsManager.ALLOWED_ENV_KEYS.has(envKey)) {
      throw new CredentialsError(`Environment variable '${envKey}' is not allowlisted`);
    }
    // ...
  }
}
```

**References:**
- https://cwe.mitre.org/data/definitions/209.html

---

### SEC-324-06: `SettingsManager` fail-open + `__proto__` pollution + unbounded `JSON.parse`

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A08:2021 |
| **CWE** | CWE-1321: Improperly Controlled Modification of Object Prototype Attributes; CWE-400: Uncontrolled Resource Consumption |
| **CVSS Score** | 5.5 (AV:L/AC:L/PR:N/UI:R/S:U/C:L/I:L/A:L — malicious/tampered settings file in workspace) |
| **Location** | `extension/src/pi-agent/settings-manager.ts:31-68` |
| **Status** | Open |

**Description:**
Three compounding weaknesses in the file-backed settings path whose output (`getSettings()` spread) flows straight into the Pi session config (`session-configurator.ts:105-107`):

```typescript
// settings-manager.ts:31-53 — errors swallowed, tamper invisible
} catch (err) { this.settings = {}; }          // fail-open, no log
// ...
private parseSimpleYaml(text: string): Settings {
  const out: Settings = {};                     // plain object: __proto__ target
  for (const line of text.split("\n")) {
    const m = line.match(/^([^:#]+):\s*(.*)$/);
    if (m) { out[m[1].trim()] = val; }          // key "__proto__"/"constructor" assignable
```

1. **Fail-open:** any read/parse failure silently resets to `{}` — a tampered or truncated settings file (e.g. attacker clears `thinkingLevel`/model pins) degrades the session to defaults with no signal. 2. **Prototype pollution:** YAML keys land on a plain `{}` via computed assignment; a `__proto__`/`constructor`/`prototype` key from a hostile settings file mutates the object prototype (downstream `settings[key]` reads then behave attacker-controlled). 3. **Unbounded parse:** `readFileSync` + `JSON.parse` on an unbounded file blocks the extension host (GB-sized file = hang) and `JSON.parse` depth can stack-overflow on deeply nested payloads. `filePath` itself is caller-supplied with no containment check (can point outside the workspace).

**Impact:**
Silent security-downgrade (fail-open), prototype-driven logic confusion in session config, local DoS via crafted settings file.

**Remediation:**
Fail-closed with logging, null-prototype accumulator with key denylist, size/depth caps, workspace containment:

```typescript
private load(): void {
  try {
    // ... existing read
    if (raw.length > 1_048_576) throw new SettingsParseError(`Settings file too large: ${raw.length} bytes`);
    // JSON: depth-guard via reviver counter; YAML: denylist below
  } catch (err) {
    logger.warn("Settings load failed, keeping previous settings", { filePath: this.opts.filePath });
    // do NOT reset to {} when a previous good config exists
  }
}
private parseSimpleYaml(text: string): Settings {
  const out: Settings = Object.create(null); // no prototype to pollute
  for (const line of text.split("\n")) {
    const m = line.match(/^([^:#]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    out[key] = val;
  }
  return out;
}
```

**References:**
- https://cwe.mitre.org/data/definitions/1321.html

---

### SEC-324-07: `cwd`/`agentDir` uncontained + `SYSTEM.md` symlink read → prompt-content exfiltration

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP Category** | A01:2021 |
| **CWE** | CWE-59: Improper Link Resolution Before File Access; CWE-22 |
| **CVSS Score** | 5.0 (AV:L/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N — malicious workspace layout / symlinked SYSTEM.md) |
| **Location** | `agent-dir-resolver.ts:17-27`, `agent-configurator.ts:64-74`, `workspace-root-resolver.ts:22-38`, `session-orchestrator.ts:31-41` |
| **Status** | Open |

**Description:**
The session's working directories are resolved without containment and then used for file reads whose content enters the LLM prompt:

```typescript
// agent-dir-resolver.ts:23-26 — normalize only; ../ and absolute paths survive
let resolved = agentDir.replace(/^~(?=$|\/|\\)/, os.homedir());
resolved = path.normalize(resolved);
return resolved; // no existence/containment enforcement (existence is warning-only upstream)
// agent-configurator.ts:64-74 — content of <cwd>/SYSTEM.md appended to prompt, unbounded, follows symlinks
const systemMd = path.join(cwd, "SYSTEM.md");
if (!fs.existsSync(systemMd)) return prompt;
const content = fs.readFileSync(systemMd, "utf-8").trim();
return `${prompt}\n\n${content}`;
```

`WorkspaceRootResolver` accepts the first workspace folder if merely absolute (`startsWith('/')` or `X:\` — UNC `\\share\…` and symlink escapes unhandled; multi-root confusion: only `folders[0]`), and `SessionOrchestrator` falls back to `process.cwd()` when validation fails (fail-open to an unintended directory whose `SYSTEM.md`/`.pi/prompts` then feed the prompt). A workspace where `SYSTEM.md` is a symlink to a sensitive file (or an `agentDir` pointing outside the project) turns prompt construction into a file-content exfiltration primitive: the file's bytes are appended to the system prompt and transmitted to the provider on the next inference call.

**Impact:**
Confidential file disclosure via prompt (symlink attack), session running in an unintended directory (wrong trust context for Pi tool execution).

**Remediation:**
Canonicalize with `realpathSync`, enforce workspace containment, cap `SYSTEM.md` size, fail closed instead of falling back silently:

```typescript
export function appendSystemMd(prompt: string, cwd: string): string {
  const MAX_SYSTEM_MD = 64 * 1024;
  const candidate = path.resolve(cwd, "SYSTEM.md");
  const root = path.resolve(cwd);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return prompt;
  let real: string;
  try { real = fs.realpathSync(candidate); } catch { return prompt; }
  if (!real.startsWith(root + path.sep)) return prompt; // symlink escapes workspace
  const stat = fs.statSync(real);
  if (!stat.isFile() || stat.size > MAX_SYSTEM_MD) return prompt;
  const content = fs.readFileSync(real, "utf-8").trim();
  return content ? `${prompt}\n\n${content}` : prompt;
}
// session-orchestrator.ts: on invalid cwd, throw (fail-closed) instead of
// silently falling back to process.cwd().
```

**References:**
- https://cwe.mitre.org/data/definitions/59.html

---

### SEC-324-08: NEW `js-tiktoken` dependency — inactive maintenance + WASM supply chain, no pin/audit

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium (design/supply-chain risk, not an active CVE) |
| **OWASP Category** | A06:2021 |
| **CWE** | CWE-1104: Use of Unmaintained Third Party Components |
| **CVSS Score** | 4.5 (AV:N/AC:H/PR:N/UI:N/S:U/C:N/I:L/A:N — compromise or abandonment window) |
| **Location** | `extension/package.json:494-513` (dependency absent today — TO-BE per TDD §1.3/D-01), FSD §5.2/OI-03 |
| **Status** | Open |

**Description:**
TDD D-01 (FSD v1.2 DISC-02 ✅) correctly selects `js-tiktoken` for the cloud-OpenAI counting path (offline, sync, no token cost — the `chat/completions` dry-run alternative was rightly rejected). Verification performed for this review: Snyk reports **0 direct vulnerabilities** in `js-tiktoken` 1.0.21 (latest), single `base64-js` runtime dep — genuinely small attack surface. The residual risks are structural: (1) **inactive maintenance** — no npm release in ~12 months, 1 maintainer, 31 open issues, no commits in 6+ months (Snyk health 70/100); a hijacked-maintainer or never-patched WASM bug has a long window; (2) **WASM opacity** — the ranking/bpe data ships as a binary blob that no source review covers; (3) **no version pin specified** in TDD ("latest") — `latest` today resolves to 1.0.21 but floats on every fresh install; (4) the adjacent `tiktoken` family has a real (if local-only) precedent — CVE-2026-90713, tiktoken vocab-handler DoS — so untrusted-vocab robustness is not hypothetical. Related: `@earendil-works/pi-agent-core@0.80.10` is a small-scope publisher artifact; provenance was not verified in this review (typosquat-adjacent risk class, low likelihood).

**Impact:**
Supply-chain compromise or stale-parser drift silently corrupts every cloud-OpenAI budget numerator (systematic ALLOW/REJECT errors); WASM blob cannot be code-reviewed.

**Remediation:**
Pin, verify, and monitor — four lines of process around the already-correct technical choice:

```json
// extension/package.json — exact pin, no float
{ "dependencies": { "js-tiktoken": "1.0.21" } }
```

```bash
# one-time verification + CI gate
npm audit --audit-level=moderate
# enable Dependabot/Snyk for extension/; require npm provenance (--provenance) on publish path
# record SHA-512 of node_modules/js-tiktoken in gen-checksums (existing scripts/gen-checksums.js pattern)
```

**References:**
- https://security.snyk.io/package/npm/js-tiktoken (0 known vulns, maintenance: inactive)
- CVE-2026-90713 (tiktoken-family vocab-handler DoS precedent)

### SEC-324-09: Unbounded sync `readFileSync` + `JSON.parse(tokenizer.json)` blocks extension host (DoS)

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A04:2021 |
| **CWE** | CWE-400: Uncontrolled Resource Consumption |
| **CVSS Score** | 3.7 (AV:L/AC:L/PR:N/UI:R/S:U/C:N/I:N/A:L) |
| **Location** | `extension/src/langgraph/providers/onnx-tokenizer.ts:18-31` |
| **Status** | Open |

**Description:**
```typescript
static async load(tokenizerPath: string): Promise<OnnxTokenizer> {
  const fs = await import("fs");
  const raw = fs.readFileSync(tokenizerPath, "utf-8"); // sync, unbounded
  const config = JSON.parse(raw);                        // unbounded depth/size
```
A large or deeply nested `tokenizer.json` (real BPE vocabs are multi-MB; a hostile one can be GBs) blocks the single-threaded extension host synchronously — UI freeze — and `encode()` itself (`text.split(/(\s+)/)` + per-char fallback, `onnx-tokenizer.ts:33-42`) is O(n·m) on hostile input with no length cap. Mitigated in practice by `ensureLoaded` memoization (once per process) — hence Low, not Medium.

**Remediation:**
```typescript
static async load(tokenizerPath: string): Promise<OnnxTokenizer> {
  const fs = await import("fs");
  const stat = fs.statSync(tokenizerPath);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024) {
    throw new Error(`Tokenizer file rejected (not a file or >100MB): ${tokenizerPath}`);
  }
  const raw = fs.readFileSync(tokenizerPath, "utf-8");
  const config = JSON.parse(raw);
  // ... + cap encode() input: if (text.length > 1_000_000) throw
}
```

---

### SEC-324-10: Production `logger.ts` has no redaction; future `countTokens` error fields at risk

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A09:2021 |
| **CWE** | CWE-532: Insertion of Sensitive Information into Log File |
| **CVSS Score** | 3.5 (AV:L/AC:H/PR:N/UI:N/S:U/C:L/I:N/A:N — latent; current fields are safe) |
| **Location** | `extension/src/logger.ts:17-33` vs `debug-logger.ts:16-23`, `diagnostics-feed-service.ts:23-31`, `secretFilter.ts:8-25` |
| **Status** | Open |

**Description:**
The gate path (`SessionConfigurator`, `BudgetCalculator`, TO-BE `BaseLlmProvider.countTokens`) logs through `extension/src/logger.ts`, which `JSON.stringify`s message + data straight to the console/output log with **zero redaction** — while three separate redaction implementations exist elsewhere (`redactSensitive`, `SECRET_PATTERNS`, `filterSecrets`) and none is wired here. Current call sites log only `{model, usagePercent, provider}` (safe ✅, NFR-09 compliant), but the TDD-specified fallback log shape `{provider, model, cause: err.message}` will carry vendor error text that can echo request fragments, and any future debug addition of `texts[]` or `counts` context would persist secrets to disk logs. Latent-by-one-commit finding.

**Remediation:**
```typescript
// logger.ts — central, zero-call-site-change hardening
import { redactSensitive } from "./debug-logger";
function safe(data?: Record<string, unknown>) {
  if (!data) return undefined;
  return JSON.parse(redactSensitive(JSON.stringify(data)));
}
warn(msg: string, data?: Record<string, unknown>) {
  console.warn(JSON.stringify({ level: "warn", msg: redactSensitive(msg), ...safe(data), timestamp: new Date().toISOString() }));
}
// + review gate for NFR-09: unit test asserting no log call in providers/ or
//   pi-agent/ receives raw texts[] or getApiKey() material.
```

---

### SEC-324-11: User-controlled model string flows into logs/diagnostics (`fallbackFrom`) → log injection

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A09:2021 |
| **CWE** | CWE-117: Improper Output Neutralization for Logs |
| **CVSS Score** | 3.3 (AV:L/AC:L/PR:N/UI:R/S:U/C:N/I:L/A:N — forge/append log lines, poison diagnostics viewers) |
| **Location** | `extension/src/pi-agent/session-configurator.ts:90-92,136-150`, `model-registry.ts:44-50` |
| **Status** | Open |

**Description:**
`resolveModel` records the raw requested string as `fallbackFrom` and it is logged and persisted without sanitization:
```typescript
logger.warn("Model not found, using default", { requested: resolved.fallbackFrom, model: resolved.model });
```
A `model` value containing newlines, ANSI escapes, or JSON-breaking characters (e.g. from workspace settings `llmModel` or a crafted `createAgentSession` caller) forges log lines and pollutes `SessionDiagnostics.fallbackFrom` shown in chat-panel/diagnostics surfaces. Length is unbounded (multi-MB model string = log DoS).

**Remediation:**
```typescript
function sanitizeModelId(raw: string): string {
  const s = String(raw ?? "").slice(0, 128).replace(/[^a-zA-Z0-9._:-]/g, "?");
  return s || "unknown";
}
// use sanitizeModelId(requested) for fallbackFrom + all log fields
```

---

### SEC-324-12: No cache/coalescing/rate-limit on `detectContextWindow`/`countTokens`; health ping costs tokens

| Attribute | Value |
|-----------|-------|
| **Severity** | Low (cost/availability; correctness fix already designed as M-08) |
| **OWASP Category** | A04:2021 |
| **CWE** | CWE-770: Allocation of Resources Without Limits or Throttling |
| **CVSS Score** | 3.7 |
| **Location** | `openai-provider.ts:44-87`, `ollama-provider.ts:27-44`, `BaseLlmProvider.ts:58-72`, `anthropic-provider.ts:85-103` |
| **Status** | Open |

**Description:**
Today every `detectContextWindow` is a live network probe (no 1h cache, no in-flight coalescing — both TO-BE per TDD §3.4/M-08), so N concurrent `createAgentSession` calls produce N× `/v1/models` + N× `/api/show` probes, and TO-BE Anthropic counting fans out to N per-text sub-calls per gate with no per-model rate limiter and only a single 429-retry specified. Separately, `isAvailable()` health pings cost real money: Anthropic `POST /v1/messages` (`max_tokens: 1`) and OpenAI-cloud `POST /chat/completions` (`max_tokens: 1`) are billable inference calls executed on every availability check with no debounce. An extension that polls availability (startup, model switch, pre-gate fast-fail) converts this into recurring spend and a self-inflicted rate-limit/DoS vector.

**Remediation:** implement TDD §3.4 as specified (1h `provider+baseUrl+model` cache + shared in-flight promise + `logger.warn` on keep-default), add a token-bucket (e.g. max 10 count-batches/min/model) with failover to `/4`+`warn`, and replace billable health pings with free endpoints (`GET /v1/models` for Anthropic/OpenAI-cloud where supported; keep the `max_tokens: 1` ping only as a last resort with a 60s debounce).

---

### SEC-324-13: Loopback MCP transport without auth/timeout; unbounded tracker map; undisposed sessions [Informational]

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **OWASP Category** | A05:2021 |
| **CWE** | CWE-306: Missing Authentication for Critical Function (loopback-scoped) |
| **CVSS Score** | 2.5 |
| **Location** | `mcp-wrapper-client.ts:28-52`, `context-usage-tracker.ts:33-38`, `session-factory.ts:29-45` |
| **Status** | Open |

**Description:**
(1) `McpWrapperClient` posts to fixed `http://127.0.0.1:9181/mcp` with no `AbortSignal` timeout and no authentication — any local process can bind 9181 first (or answer after a crash) and feed crafted tool results back into the Pi session (tool-output prompt injection). Loopback scope bounds this to local attackers/malware, hence Informational. (2) `ContextUsageTracker.tabUsage: Map<string, TabContextUsage>` grows per `tabId` with eviction only via explicit `clearTab` — unbounded tab creation leaks memory slowly. (3) `PiSessionFactory`/`SessionConfigurator` never dispose Pi sessions/handles (`onxProvider.dispose` exists but is never called on this path) — long-running hosts accumulate native/ONNX handles. None is independently exploitable; all are worth a hardening line in the DEV pass.

**Remediation:** `AbortSignal.timeout(5000)` on the wrapper fetch + `X-Session-Nonce` shared-secret header verified by the wrapper server; LRU-cap the tracker map (e.g. 100 tabs, evict oldest); `try/finally` dispose on session creation failure paths.

---

## Dependency Vulnerabilities

| Dependency | Current Version | CVE | Severity | Fixed In / Action |
|-----------|----------------|-----|----------|-------------------|
| `js-tiktoken` (NEW, TO-BE per D-01) | `latest` (unpinned; latest published 1.0.21) | None known (Snyk: 0 direct vulns, 2026-09-27) | Medium (process risk) | Pin `1.0.21` exact; `npm audit`; Dependabot/Snyk; checksum WASM bundle; see SEC-324-08 |
| `@earendil-works/pi-agent-core` | 0.80.10 | None known | Low (provenance) | Verify npm provenance + repo ownership; pin exact (already exact ✅) |
| `@anthropic-ai/sdk` | ^0.105.0 (floats) | None known at review time | Low | Pin or lockfile-freeze for release; `npm audit` in CI |
| `undici` | ^6.21.0 | Historical SSRF/redirect CVEs in 6.x family (none confirmed for 6.21.0 in this review) | Low | `npm audit`; keep ≥6.21.0; prefer global `fetch` (Node 18+) where already used |
| `onnxruntime-node` (dynamic import) | not in `dependencies` (optional peer) | None assessed (native binary) | Low | Pin version when added; verify binary signature; isolate load failure (already throws ✅) |
| `tiktoken`-family precedent | — | CVE-2026-90713 (vLLM/Rust vocab-handler DoS, local) | Info | Not directly applicable to `js-tiktoken`; cited as robustness precedent for vocab-input validation |

*Method: `extension/package.json` manifest review + Snyk DB lookup for `js-tiktoken` (2026-09-27). No `package-lock.json` audit executed (lockfile out of ticket scope) — full `npm audit` recommended at implementation time.*

## Security Headers Assessment

Not applicable — SA4E-324 ships no HTTP server or rendered content (in-process VS Code extension logic only). Outbound posture verified instead:

| Control | Status | Recommendation |
|---------|--------|----------------|
| TLS to cloud vendors (Anthropic/OpenAI) | ✅ by SDK/`fetch` default | Keep; add cert-pinning note only if threat model requires |
| Loopback HTTP (`localhost:11434`, `127.0.0.1:9181`, LM Studio `:1234`) | ⚠️ by design | Acceptable for local dev; enforce SEC-324-01 policy so only loopback may use plain HTTP |
| `Strict-Transport-Security` / CSP / `X-Frame-Options` | N/A | No served pages; chat webview CSP unchanged by this ticket |
| API-key transport | ✅ `x-api-key` / `Bearer` over TLS | Gate behind SEC-324-01 host validation |

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | SEC-324-01 baseUrl validation + untrusted-workspace restriction | Low (reuse `validateBackendUrl`, 1 file + manifest) | Blocks key exfiltration + SSRF |
| 2 | SEC-324-02 `modelId` guard + `isAvailable` both-files check | Low (regex + realpath, same PR as M-03) | Blocks arbitrary file read |
| 3 | SEC-324-03 bridge allowlist + approval routing | Medium (schema + classifier wiring) | Blocks LLM tool-chaining privesc |
| 4 | SEC-324-05 error-message redaction + `env:` allowlist | Low | Stops secret-in-log leak |
| 5 | SEC-324-06 settings fail-closed + null-proto + size cap | Low | Stops silent downgrade + pollution |
| 6 | SEC-324-04 counting-hop disclosure note + secret tripwire | Low | Closes PII-governance gap |
| 7 | SEC-324-07 `SYSTEM.md`/cwd containment | Low-Medium | Stops symlink prompt exfiltration |
| 8 | SEC-324-08 pin `js-tiktoken` 1.0.21 + audit gate | Low | Removes supply-chain float |
| 9–13 | SEC-324-09/10/11/12/13 hardening batch | Low | DoS/log/cost hygiene; fold into DEV pass |

## Recommendations Summary

### Immediate Actions (High — gate merge on these)
1. Validate every provider `baseUrl` with the existing `validateBackendUrl` policy and add LLM base-URL keys to `restrictedConfigurations` (SEC-324-01).
2. Land the TDD §6.4 `modelId` regex + realpath containment and the both-files `isAvailable()` check (SEC-324-02).
3. Allowlist Pi-bridge tools, deny `execute_dynamic_tool` chaining by default, route bridge calls through approval + audit log (SEC-324-03).

### Short-term Improvements (Medium — same release)
1. Redact `CredentialsError` values and allowlist `env:` keys (SEC-324-05).
2. Harden `SettingsManager` (fail-closed, null-prototype YAML map, 1MB cap, workspace containment) (SEC-324-06).
3. Prefer local counting for secret-bearing batches; document the cloud-counting disclosure hop (SEC-324-04).
4. Contain `cwd`/`agentDir` and symlink-check `SYSTEM.md` with a size cap (SEC-324-07).
5. Pin `js-tiktoken@1.0.21`, add `npm audit` + Dependabot/Snyk to CI (SEC-324-08).

### Long-term Hardening (Low/Informational)
1. Central redaction in `logger.ts`, model-id sanitization for logs/diagnostics, tokenizer read caps, window-cache + rate limits, wrapper-fetch timeout/nonce, tracker LRU, session disposal (SEC-324-09–13).

## Positive Controls Acknowledged ✅
- Reference-only `CredentialRef` passthrough; keys never in logs/diagnostics (NFR-09, `session-configurator.ts:104-114`).
- Fail-closed budget math + REJECT-before-Pi-call ordering; no divide-by-zero (`context-budget.ts:51`).
- `SessionDiagnostics` carries counts/percents only — no raw prompt persistence.
- Existing redaction assets (`secretFilter`, `redactSensitive`, feed `SECRET_PATTERNS`) — reused by recommendation, not reinvented.
- No command injection surface in ticket scope (fixed-arg `execFile`/`spawn` only; gate path is `fetch` + `JSON.stringify`).

## Appendix

### A. Tools & Methodology
- Manual static design review against TDD v1.1 / FSD v1.2 / BRD v1.0 + 20 source files (file:line-verified; no dynamic execution, no exploitation).
- Dependency posture via `extension/package.json` manifest + Snyk DB lookup (`js-tiktoken`, 2026-09-27).
- OWASP Testing Guide v4.2 (static) + OWASP Top 10:2021 + OWASP LLM Top 10 (tool-chaining) mapping; CWE/CVSS v3.1 per finding.

### B. Scope Limitations
- Static analysis only: runtime Pi-SDK behavior (`SessionManager.inMemory`, `createAgentSession` internals in `@earendil-works/pi-agent-core`), network behavior of `count_tokens`/`tokenize`/`api/show`, and VS Code SecretStorage/OS keychain hardening were NOT tested.
- No `package-lock.json` / `npm audit` run (lockfile out of ticket scope); no SAST/DAST tooling executed.
- Infrastructure, network policy, and backend (Hono) surfaces out of scope — extension-host only.
- Threat model assumes a benign-but-curious local environment + potentially hostile workspace content/settings; a fully compromised extension host is out of scope (game over at that point).

### C. Glossary
- **CVSS**: Common Vulnerability Scoring System (v3.1 vectors summarized)
- **CWE**: Common Weakness Enumeration
- **SSRF**: Server-Side Request Forgery (CWE-918)
- **PII**: Personally Identifiable Information
- **DPA**: Data Processing Agreement (vendor)
- **TO-BE**: TDD/FSD-designed but not yet coded (all M-0x items)
