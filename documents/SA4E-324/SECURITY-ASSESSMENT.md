# 🔒 Security Assessment (Phase 5.7 — Code Review) — SA4E-324: Pi Context Budget + Model Registry

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-324 |
| Phase | 5.7 — Post-implementation security assessment (code as shipped in Phase 5) |
| Scope (code) | `extension/src/pi-agent/model-registry.ts`, `context-budget.ts`, `thinking-level-mapper.ts`, `session-configurator.ts` (budget gate), shared wiring `session-factory.ts`, `types.ts`; verification of all 13 findings from Phase 3.7 design review |
| Design baseline | `documents/SA4E-324/TDD.md` v1.1 FINAL; Phase 3.7 verdict: **CONDITIONAL PASS** (`documents/SA4E-324/SECURITY-REVIEW.md` v1.0) |
| Date | 2026-09-27 |
| Assessor | Security Agent (static code review, no exploitation) |
| Version | 1.0 |

## Executive Summary

The implemented SA4E-324 subset (Model Registry + Budget Calculator + Threshold Gate + ThinkingLevelMapper + SessionConfigurator) preserves the core fail-closed security properties specified in the TDD: `contextWindow <= 0 → usage 100%` (never divide-by-zero), REJECT throws `ContextBudgetError` **before** `sdk.createAgentSession` is invoked, diagnostics carry only counts/percents (no prompt text), credentials pass through as reference-only `CredentialRef`, and `reserveTokens` is clamped to `MIN_RESERVE_TOKENS = 2000`. The registry `validate()` rejects malformed entries without corrupting the registry.

However, **none of the 13 Phase-3.7 findings have been fixed in code** — the 3 High findings (SEC-324-01 baseUrl SSRF, SEC-324-02 ONNX path traversal, SEC-324-03 MCP bridge tool-chaining) remain open in the provider/bridge files this ticket's TDD also owns. Code review additionally found that (1) the budget gate is **optional at the only call surface** (`contextBudget` omitted → estimated ≈ 2000 tokens → always ALLOW, no production caller passes it), (2) TDD M-01 (mapper throws on invalid level) is **not implemented** — the mapper silently defaults to `medium` (fail-open), and (3) `SessionManager.inMemory(cwd)` is constructed **before** the gate rejects. The TDD's provider-side work (M-04 `countTokens`, M-08 window cache, D-01 `js-tiktoken`) is also not yet in code — consistent with an incremental epic, but it means the PII-in-transit concern (SEC-324-04) is latent, not yet active.

**Overall Risk Rating: Medium** (within-scope gate logic is sound; High-severity debt is tracked cross-file and must land before production wiring).

| Severity | Count (new findings) |
|----------|----------------------|
| 🔴 Critical | 0 |
| 🟠 High | 0 new (3 carried open from Phase 3.7: SEC-324-01/02/03) |
| 🟡 Medium | 1 (SEC-324-A1) |
| 🔵 Low | 3 (SEC-324-A2, A3, SEC-324-11 confirmed open) |
| ℹ️ Informational | 1 (SEC-324-A4) |

## Part 1 — Verification of Phase 3.7 Findings (fix status in code)

| ID | Severity | Title | Status in code (2026-09-27) |
|----|----------|-------|------------------------------|
| SEC-324-01 | High | Provider `baseUrl` SSRF + API-key exfiltration | **OPEN** — providers still do `(baseUrl \|\| DEFAULT).replace(/\/$/,'')` with no `validateBackendUrl`; `package.json:19-20` `restrictedConfigurations` still lacks `kiroSdlc.anthropicBaseUrl/openaiBaseUrl/lmstudioBaseUrl/openrouterBaseUrl` (manifest lines 318–338) |
| SEC-324-02 | High | ONNX `modelId` path traversal (`onnx-provider.ts:36-39`) | **OPEN** — no `^[a-z0-9][a-z0-9._-]*$` guard, no realpath containment; `isAvailable()` still checks only `model.onnx` (line 74) |
| SEC-324-03 | High | MCP bridge `execute_dynamic_tool` chaining (`tool-definitions.ts:67-96`) | **OPEN** — required-field-only validation, no tool allowlist, no approval/audit hook |
| SEC-324-04 | Medium | Cloud `countTokens` PII hop | **LATENT / N-A** — `countTokens` not yet implemented (no matches in `langgraph/`); re-assess when M-04 lands |
| SEC-324-05 | Medium | `CredentialsError` echoes raw `ref` | **OPEN** — `credentials-manager.ts:23` still interpolates `${ref}`; `env:` resolution still unbounded (lines 39–45) |
| SEC-324-06 | Medium | `SettingsManager` fail-open + `__proto__` + unbounded parse | **OPEN** — `settings-manager.ts:50-53` resets to `{}` silently; `parseSimpleYaml` uses plain `{}` accumulator (line 57); no size cap |
| SEC-324-07 | Medium | `cwd`/`agentDir` uncontained + `SYSTEM.md` symlink read | **OPEN** — `agent-configurator.ts:64-74` unbounded `readFileSync`, no realpath; `session-orchestrator.ts:34-41` still falls back to `process.cwd()` |
| SEC-324-08 | Medium | `js-tiktoken` pin/audit | **PARTIAL / N-A** — `js-tiktoken` not yet added as a direct dependency (only transitive 1.0.21 in lockfile); `@earendil-works/pi-agent-core@0.80.10` IS pinned exact ✅ |
| SEC-324-09 | Low | Unbounded sync tokenizer read | **OPEN** — `onnx-tokenizer.ts` unchanged |
| SEC-324-10 | Low | `logger.ts` no redaction | **OPEN** — unchanged |
| SEC-324-11 | Low | `fallbackFrom` log injection | **OPEN** — `session-configurator.ts:91` logs raw `requested` string |
| SEC-324-12 | Low | No window cache / billable health pings | **N-A yet** — M-08 not implemented |
| SEC-324-13 | Info | MCP wrapper no timeout/auth; tracker map; undisposed sessions | **OPEN** — `mcp-wrapper-client.ts` unchanged (no `AbortSignal`, no auth) |

**Fix rate: 0/13.** This is acceptable for an incremental epic only if the 3 High items are tracked as blocking conditions for production wiring (see Verdict).

## Part 2 — New Findings from Code Review

### SEC-324-A1: Budget gate is optional — bypass by omission

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP** | A04:2021 Insecure Design |
| **CWE** | CWE-636: Not All Resources or Parameters Checked for Consistency |
| **Location** | `extension/src/pi-agent/session-configurator.ts:116-150` (`createAgentSession`, `enforceBudgetGate`), `context-budget.ts:47-58` |
| **Status** | Open |

**Description / Evidence:** `params.contextBudget` is optional; when omitted, `resolveFields` treats every input as `0` and only `reserveTokens = 2000` is counted, so `usagePercent ≈ 2000/window × 100` — e.g. 1.6% for `gpt-4o-mini` → **ALLOW on every call**. Grep of the codebase shows no production caller passes `contextBudget` (only `__tests__/session-configurator.budget.test.ts:56,76,90`). The gate therefore never rejects in real flows — it protects nothing until the TDD §3.5 `resolveBudgetInputs()` (counting real system/tool/retrieval/history text) is wired.

```typescript
// session-configurator.ts:137 — gate silently passes when inputs are omitted
const budget = SessionConfigurator.calculateBudget(params.model, params.contextBudget);
// context-budget.ts:51 — correct fail-closed math, but numerator ≈ 0 by default
```

**Impact:** Small-context models can be handed oversized prompts (the exact OOM/cost scenario the ticket exists to prevent) whenever the caller forgets the optional field.

**Recommendation:** Require budget inputs on the session path (fail-closed), or default `contextBudget` from the real session payload per TDD §3.5:
```typescript
static createAgentSession(sdk, cwd, params: SessionConfigParams & { contextBudget: ContextBudgetInputs }) {
  // …or: if (!params.contextBudget) throw new ContextBudgetError('contextBudget inputs required', …);
}
```

### SEC-324-A2: `SessionManager.inMemory(cwd)` executed before the gate rejects

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A04:2021 |
| **CWE** | CWE-667: Improper Ordering of Resource Initialization |
| **Location** | `session-configurator.ts:124-133` |
| **Status** | Open |

**Description:** `const sessionManager = sdk.SessionManager.inMemory(cwd)` (line 124) runs **before** `enforceBudgetGate` (line 125). On REJECT, a Pi SessionManager has already been allocated. TDD §2.1/§6.5 specify "REJECT, no Pi call". `createAgentSession` is correctly never called on REJECT ✅, but the manager allocation should move after the gate. *Impact:* wasted resources + a Pi-observable side effect on rejected sessions.

**Recommendation:** Reorder: `const gate = enforceBudgetGate(params); const sessionManager = sdk.SessionManager.inMemory(cwd); …`

### SEC-324-A3: TDD M-01 not implemented — mapper silently defaults invalid thinking level (fail-open)

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP** | A04:2021 |
| **CWE** | CWE-754: Improper Check for Unusual or Exceptional Conditions |
| **Location** | `thinking-level-mapper.ts:22-27` vs TDD §5.2 (M-01) |
| **Status** | Open |

**Description:** TDD §5.2 requires `resolveLevel` to **throw** `Invalid thinkingLevel '…'`; the shipped code returns `DEFAULT_THINKING_LEVEL` (`medium`) for any invalid value. Compensating control: `SessionConfigurator.validateThinkingLevel` (line 60-64) throws on the `buildSessionConfig` path before mapping — so the main session path is fail-closed ✅, but any direct `mapper.map()` caller gets a silent downgrade. This is a TDD-compliance deviation with fail-open semantics.

**Recommendation:** Implement M-01 exactly as specified (throw), keep the default only for the *omitted* (`undefined`) case per BR-11.

### SEC-324-A4: Legacy heuristic constants remain (M-05/M-06 pending)

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **Location** | `context-budget.ts:1,5` (`CHARS_PER_TOKEN`, `DEFAULT_SYSTEM_PROMPT_CHARS = 7500`) |
| **Status** | Open (no security impact) |

**Description:** The dead `DEFAULT_SYSTEM_PROMPT_CHARS` and char-based system estimate are still present (TDD M-05/M-06 say delete). Verified **no implicit application**: `calculateBudget` counts omitted `systemPromptChars` as 0 — the REJECT golden case only fires when callers pass real values. Cleanup item; risk is drift toward the old heuristics.

## Positive Controls Verified in Code ✅

- Fail-closed denominator: `contextWindow > 0 ? … : 100` — `context-budget.ts:51`; REJECT path throws `ContextBudgetError` before any Pi session creation (`session-configurator.ts:139-144`).
- `SessionDiagnostics` = counts/percents/decision only; no prompt text, no key material (`session-configurator.ts:33-41,152-166`).
- `attachExternalConfig` copies only `{credentialKey, credentialValueRef}` — reference-only credentials (NFR-09) (`session-configurator.ts:104-114`).
- Registry `validate()` + duplicate rejection keeps the registry usable on bad input (`model-registry.ts:52-80`); all seed values integers, `maxOutput <= contextWindow`, thinking map bounded by `maxOutput`.
- `resolveNumber` treats negative/non-finite as invalid + `conservative=true` — never negative totals (`context-budget.ts:81-89`); `reserveTokens` clamped `>= 2000` with `forced` flag.
- `ThinkingLevelMapper.map` clamps to `min(thinkingMap[level], maxOutput)` — no over-allocation (`thinking-level-mapper.ts:8-12`).
- No dynamic `require(variable)` anywhere in `extension/src` (grep-verified) — the "unsafe dynamic require" threat is not present.

## Risk Rating

**Medium.** The in-scope gate implementation is defensively coded and fail-closed, but the gate is currently a no-op in real flows (SEC-324-A1) and all Phase-3.7 Highs remain unfixed in adjacent files the ticket's TDD governs.

## Verdict

**APPROVED-WITH-CONDITIONS** — SA4E-324's own 4-file implementation is safe to keep in the codebase (it is not yet wired into any production entry point; only tests call it). Merge/production wiring is conditional on:

1. **(Blocking, cross-file)** Fix SEC-324-01, SEC-324-02, SEC-324-03 before any ticket wires `SessionConfigurator`/Pi sessions into the chat pipeline (per Phase 3.7 remediation plan).
2. **(Blocking, in-scope)** Make the budget gate effective: require `contextBudget` inputs (SEC-324-A1) and implement TDD M-01 throw semantics (SEC-324-A3).
3. (Same PR) Reorder `inMemory` after the gate (SEC-324-A2); redact `fallbackFrom` in logs (SEC-324-11); fix `CredentialsManager` echo + `env:` allowlist (SEC-324-05); harden `SettingsManager` (SEC-324-06); contain `SYSTEM.md`/cwd (SEC-324-07).
4. Re-run this assessment when M-04/M-08/D-01 (`countTokens`, window cache, `js-tiktoken`) land — SEC-324-04/08/12 become active then.

## Appendix — Methodology & Limitations

- Static review of the 6 listed files + targeted grep verification (`countTokens`, `validateBackendUrl`, `restrictedConfigurations`, `require(`, `js-tiktoken`, callers of `createAgentSession`/`PiSessionFactory`). No runtime/DAST, no `npm audit` (deferred per SEC-324-08), no exploitation.
- Tests reviewed for security coverage: functional suites only — **no security test cases exist** (no traversal/injection/log-assertion tests). QA gap: recommend contract tests asserting (a) gate REJECT with no Pi call, (b) no key material in any log call (BR-18/NFR-09), (c) invalid `thinkingLevel` throws.
- Pi SDK internals (`SessionManager.inMemory`, `createAgentSession` in `@earendil-works/pi-agent-core@0.80.10`) not audited (out of scope).
