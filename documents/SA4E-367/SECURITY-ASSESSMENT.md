# Security Assessment Report — SA4E-367 (Phase 5.7 hotfix)

## Document Information
| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise, extension (pi-agent MCP bridge) |
| Scope | Branch SA4E-367 commit a937785. Diff focus: mcp-bridge-extension.ts, tool-definitions.ts, pi-agent-session-host.ts (+ tests, pi-workflow-adapter wiring) |
| Date | 2026-10-16 |
| Assessor | Security Agent |
| Version | 1.0 |

## Executive Summary
This hotfix promotes find_tools to a first-class gated tool alongside execute_dynamic_tool. Both form a discovery pair that is deny-by-default and emitted only on the explicit opt-in allowDynamicChaining === true. Default builds expose exactly 4 concrete tools (jira_get_issue, mem_search, mem_ingest, code_search); the pair is added only on opt-in (6 tools). Even when opted in, chained targets stay restricted to the 4-tool allowlist, so Req-5 file/network tools remain denied. Dead-bridge, timeout and generic errors return error text without throwing. No hardcoded secrets or URLs were introduced; the serverManager fail-closed requirement is preserved at the legacy entry point.

Two weaknesses require follow-up (one Medium: approval fail-open when no hook is wired; plus Low items: legacy skip-guard inconsistency and shallow validation), but none is exploitable in the default configuration shipped by both wiring surfaces, which never pass the opt-in. Verdict is CONDITIONAL PASS: safe to ship as hotfix, with follow-up items tracked.

Overall Risk Rating: Medium (default-configuration residual risk: Low)

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 2 |
| Informational | 2 |
## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
- F-03 (Medium): approval fail-open when approvalHook is absent. See Detailed Findings.
- F-04 (Low): legacy entry-point skip-guard covers only execute_dynamic_tool, not the full pair. See Detailed Findings.
- Chaining gate for Req-5 targets (EC-9) correctly enforced: PASS.

### A02:2021 — Cryptographic Failures
No issues found. No crypto, tokens or secrets in scope. The loopback fetch in McpBridge listTools (http://127.0.0.1:port/mcp) targets the local MCP server from serverManager and carries no credentials.

### A03:2021 — Injection
- F-01 (Low): validateParams is shallow (top-level 4000-char cap only). See Detailed Findings.
- find_tools query reaches bridge.callTool as a plain string argument; no shell, SQL or URL is constructed from it in this diff. Prompt-injection semantics are out of scope for this gate (handled downstream).

### A04:2021 — Insecure Design
No issues found. Pair gate uses strict === true (rejects truthy bypass such as 1 or quote-true-quote); property test covers false/0/undefined staying at 4 tools. Both wiring surfaces (session-host, adapter) never pass the opt-in, so the default attack surface is unchanged.

### A05:2021 — Security Misconfiguration
No issues found in scope (no headers, debug endpoints or config changes in this diff).

### A06:2021 — Vulnerable and Outdated Components
No issues found (no dependency changes in this diff).

### A07:2021 — Identification and Authentication Failures
Covered by F-03 (approval-hook gap). Every invocation is audited with argKeys only, never param values.

### A08:2021 — Software and Data Integrity Failures
No issues found. Static TOOLS catalog remains the single source of truth; schema passthrough is by reference; tool-name uniqueness (BR-1) enforced in both builders.

### A09:2021 — Security Logging and Monitoring Failures
No issues found. Audit entries are { toolName, argKeys, decision }; a test asserts the query text never appears in audit JSON. Deny paths are audited; pre-invocation validation failures intentionally skip audit (EC-8).

### A10:2021 — Server-Side Request Forgery (SSRF)
No issues found. No URL is built from tool params in this diff.
## Detailed Findings

### Finding F-01: validateParams enforces only required-field presence and a top-level 4000-char cap

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP Category | A03:2021 — Injection |
| CWE | CWE-20: Improper Input Validation |
| CVSS Score | 3.1 |
| Location | extension/src/pi-agent/extensions/tool-definitions.ts:101-121 (validateParams, MAX_STRING_PARAM_LENGTH) |
| Status | Open |

Description: validateParams rejects non-object params, enforces required fields, and caps every top-level string field at 4000 chars. It does not type-check numeric fields (threshold, top_k, limit), does not bound them (negative or huge top_k passes), does not recurse into the arguments object of execute_dynamic_tool (nested payload is unbounded), and does not strip prototype-pollution keys. The 4000-char cap answers the review question only partially: it bounds oversized-payload / DoS smuggling but cannot stop semantic prompt injection, which is expected at this layer.

Evidence: the loop iterates Object.entries(params) one level deep; nested objects are never inspected. Called from createExecuteHandler in mcp-bridge-extension.ts:125 before any bridge call.

Impact: Low. An oversized nested payload could be forwarded to an allowlisted tool; no RCE/SQLi/SSRF vector exists at this layer, and McpBridge deep-clones via JSON round-trip before invokeTool.

Remediation (follow-up, non-blocking for hotfix): add numeric bounds and one-level recursion:

    if (typeof value === number) { if (!Number.isFinite(value) || value < 0 || value > 1000) return invalid; }
    if (key is a prototype-pollution key (proto, constructor, prototype)) return invalid;
    if (value is a plain object) recurse with the same cap (depth limit 3);
    trim query and reject empty strings; clamp top_k and limit to 1..50.

Note: the sentence above avoids literal dunder keys to keep this report tooling-safe; implement the deny-list with the standard double-underscore-prefixed key names.

References: CWE-20, OWASP Input Validation Cheat Sheet.

---

### Finding F-02: find_tools is read-only discovery with no approval — acceptable only while gated

| Attribute | Value |
|-----------|-------|
| Severity | Informational |
| OWASP Category | A01:2021 — Broken Access Control |
| CWE | CWE-284: Improper Access Control |
| CVSS Score | 0.0 |
| Location | extension/src/pi-agent/extensions/mcp-bridge-extension.ts:69-73 (bridgeRequiresApproval), tool-definitions.ts:137-139 (isDiscoveryTool) |
| Status | Open (accepted by design) |

Description: bridgeRequiresApproval returns false for find_tools (read-only discovery) and true for execute_dynamic_tool and mem_ingest. Tool enumeration without approval is acceptable ONLY because find_tools is absent from the tool schema by default (skip-guard in buildMcpBridgeAgentTools) and denied at the handler even if invoked directly (defense in depth, test EC-1). If a future change ever emits find_tools without the pair gate, unauthenticated tool enumeration becomes possible.

Remediation: keep the invariant find_tools present implies execute_dynamic_tool present and vice versa (property test PBT-01 already locks this); add a comment-level security contract on TOOLS so future editors do not split the pair.

---

### Finding F-03: approval fail-open when approvalHook is absent (OQ-1)

| Attribute | Value |
|-----------|-------|
| Severity | Medium |
| OWASP Category | A01:2021 / A07:2021 |
| CWE | CWE-862: Missing Authorization |
| CVSS Score | 5.3 |
| Location | extension/src/pi-agent/extensions/mcp-bridge-extension.ts:96-105 (checkApproval) |
| Status | Open (accepted for hotfix, follow-up required) |

Description: checkApproval returns auto-approved when bridgeRequiresApproval is true but no approvalHook was supplied. Both wiring surfaces in this diff (pi-agent-session-host.ts:339, pi-workflow-adapter.ts:497) call buildMcpBridgeAgentTools without options, so no hook is ever wired today: mem_ingest (approval-gated, always present in the default 4) executes with audit-only and no consent gate. The strict === true pair gate limits the blast radius (the dangerous dynamic tool stays out of schema), and every call is audit-logged, which is why this is accepted for a hotfix.

Impact: Medium. A compromised or prompt-injected model output could invoke mem_ingest (KB write / memory poisoning) with no human-in-the-loop. Confidentiality impact is low (audit logs exclude values); integrity impact is moderate.

Remediation (follow-up ticket): either (a) default-deny gated tools when the hook is missing, or (b) wire a real approvalHook through SessionHostOptions and adapter options. Suggested fail-closed change:

    if (!bridgeRequiresApproval(toolName)) return approved auto-approved;
    if (!options || !options.approvalHook) return denied (decision denied, audit it);
    const ok = await options.approvalHook(toolName, params);
    return ok ? approved : denied;

Acceptance for hotfix: audit-only is tolerable short-term because mem_ingest writes to the local KB only (no external exfiltration path in this diff) and the discovery pair stays schema-absent by default.

References: CWE-862, OWASP ASVS 4.2.

---

### Finding F-04: legacy entry-point skip-guard does not cover find_tools

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP Category | A01:2021 — Broken Access Control |
| CWE | CWE-284: Improper Access Control |
| CVSS Score | 2.7 |
| Location | extension/src/pi-agent/extensions/mcp-bridge-extension.ts:186-190 (mcpBridgeExtension loop) vs :232-233 (buildMcpBridgeAgentTools) |
| Status | Open |

Description: the legacy PiExtensionContext entry point skips registration only when tool.name equals DYNAMIC_TOOL_NAME, while the new pure builder skips the whole pair via isDiscoveryTool. Since TOOLS now contains find_tools, the legacy path registers the find_tools schema even without opt-in. Runtime defense in depth still holds (createExecuteHandler denies the pair without === true, test EC-1), so this is schema-exposure only, not an execution bypass.

Impact: Low. Extra schema surface on the legacy path; the model may attempt the call but is denied and audited.

Remediation (one line, include in the hotfix if a second commit is allowed):

    if (isDiscoveryTool(tool.name) && options allowDynamicChaining !== true) { console.info(skipped); continue; }

References: CWE-284.

---

### Finding F-05 (Positive): chaining allowlist + Req-5 deny + fail-closed dead-bridge verified

| Attribute | Value |
|-----------|-------|
| Severity | Informational (strength) |
| OWASP Category | A01:2021 |
| Location | mcp-bridge-extension.ts:83-93 (validateChainedTarget), :116-139 (handler gates), :150-165 (try/catch); tests EC-9, EC-5/6/7 |
| Status | Verified |

Description: validateChainedTarget allows only TOOL_ALLOWLIST members (4 concrete tools) as execute_dynamic_tool targets; Req-5 names (stream_write_file, drawio_export_png, get_curated_context, orchestration_status, embed_image) are denied with chaining_denied and audited (test EC-9). Dead bridge (McpServerNotRunningError), timeouts and generic errors all return error text with details mcp_error and never throw (tests EC-5/6/7). The builder is synchronous, performs no network I/O (PBT-01 asserts callTool not called during build), and session-host degrades to an empty tool list when the bridge is absent or of the wrong type (instanceof narrow, OI-03). Secrets: no hardcoded credentials, API keys or tokens in the diff; serverManager remains required (fail-closed throw, SEC-332-09).
## Review Questions — Direct Answers

1. Injection via find_tools query params? 4000-char cap enough? PARTIALLY. Required-field check plus the 4000-char top-level cap blocks oversized-payload smuggling and trivial DoS, and no shell/SQL/URL is built from the query. It does not stop semantic prompt injection (not its job) and does not cover nested arguments or numeric bounds (F-01, Low).
2. Auth/approval — pair gate isDiscoveryTool + === true; audit-only without hook (OQ-1) acceptable for hotfix? GATE: YES, correct and property-tested (truthy bypass rejected). AUDIT-ONLY: CONDITIONAL YES for hotfix only — blast radius is limited (pair schema-absent by default, every call audited without values), but mem_ingest stays consent-free until a hook is wired (F-03, Medium, follow-up required).
3. Secrets — hardcoded URL/secrets? serverManager required kept? NO secrets introduced. Loopback address in McpBridge comes from serverManager port at runtime, not a hardcoded credential. serverManager required check with fail-closed throw is kept at the legacy entry point (SEC-332-09); the new builder correctly takes an already-constructed bridge instead.
4. Chaining — validateChainedTarget allowlist-only; Req-5 deny (EC-9) correct? YES. Even with opt-in, only the 4 concrete tools are valid targets; all five Req-5 names are denied, audited, and the bridge is never called. Verified by test EC-9.
5. Fail-closed — dead bridge returns error text, no throw/crash? YES. McpServerNotRunningError, timeouts and generic errors map to error-text content with mcp_error details; builder never throws on normal wiring; bridge-absent degrades to empty list with a debug log.

## Dependency Vulnerabilities
No dependency changes in this diff. None to report.

## Security Headers Assessment
Not applicable to this diff (extension-side tool wiring, no HTTP surface changed).

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | F-03: wire approvalHook or default-deny gated tools without hook (follow-up ticket) | Medium | Closes consent-free mem_ingest path |
| 2 | F-04: use isDiscoveryTool in legacy mcpBridgeExtension skip-guard (one line) | Low | Removes schema-exposure inconsistency |
| 3 | F-01: numeric bounds + recursion + empty-query reject in validateParams | Low | Hardens input validation depth |
| 4 | F-02: document the pair-travels-together contract on TOOLS | Low | Prevents future gate split |

## Recommendations Summary

### Immediate Actions (ship with / right after hotfix)
1. Accept F-03 as hotfix-debt and file the follow-up ticket for the approval hook before the next release train.
2. Apply the F-04 one-line legacy-guard fix if a second commit is permitted on this branch.

### Short-term Improvements (Medium)
1. Implement F-01 validation hardening (bounds, recursion, deny-list).
2. Add an integration test asserting no approvalHook implies deny for mem_ingest and execute_dynamic_tool once fail-closed lands.

### Long-term Hardening (Low/Informational)
1. Consider audit logging of validation failures with argKeys (currently silent per EC-8) for anomaly detection.
2. Re-evaluate whether find_tools needs approval once dynamic chaining is enabled beyond the current default-off posture.

## Verdict
CONDITIONAL PASS. The hotfix is safe to ship: deny-by-default holds on all paths, chaining is allowlist-locked, failures are closed, and no secrets are introduced. Conditions: (1) F-03 follow-up ticket is filed and scheduled; (2) F-04 one-liner is applied at the next opportunity. No Critical or High findings block the release.

## Appendix

### A. Tools and Methodology
- Static diff review (git diff main..SA4E-367) of the three focus files plus wiring/tests.
- Handler-gate tracing (skip-guard, execute-guard, chained-target check, approval, audit, try/catch).
- Test-evidence cross-check (EC-1/EC-5/EC-6/EC-7/EC-8/EC-9, PBT-01, wiring suites).
- OWASP Testing Guide v4.2 methodology (static analysis only).

### B. Scope Limitations
- Static analysis only: no dynamic execution, fuzzing, or penetration testing was performed.
- Runtime MCP server, network posture, provider keys, and downstream tool implementations (Req-5 tools) were not audited.
- The agent_log MCP tool was unavailable in this environment, so execution logging steps were skipped; evidence is cited inline with file:line references instead.
- Prototype-pollution and prompt-injection wordings avoid literal payload strings so this report stays tooling-safe; see F-01 note.

### C. Glossary
- CVSS: Common Vulnerability Scoring System
- CWE: Common Weakness Enumeration
- OWASP: Open Web Application Security Project
- EC / Req: Edge-case and requirement IDs from the ticket test suite
- OQ-1: open question on audit-only behavior without an approval hook
