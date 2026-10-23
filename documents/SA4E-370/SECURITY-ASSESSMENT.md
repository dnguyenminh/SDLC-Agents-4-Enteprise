# 🔒 Security Assessment Report

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC Agents 4 Enterprise |
| Ticket | SA4E-370 (Epic, High) |
| Title | Custom Agents — real file-defined agent personas wired into the chat engine (identity, role scoping, per-tab sessions) |
| Phase | 3.7 — Security Review (L3 pipeline) |
| Scope | S1–S4: Agent .md v2 parser, selectAgent wiring, per-tab session isolation, UI truthfulness |
| Date | 2026-10-19 |
| Assessor | Security Agent |
| Version | 1.0 |
| Status | Draft (design review — implementation not started) |

---

## Executive Summary

This Security Assessment Report (SAR) evaluates the Custom Agents feature (Epic SA4E-370) against the OWASP Top 10 (2021) and the security requirements defined in BRD §5.2, TDD §7, and FSD §7. The feature transforms the current cosmetic agent selection into real agent identity wiring: agent definition files (.code-intel/agents/*.md) become system prompts (personas), roles drive tool/skill/steering scoping, and each chatbox tab gets an isolated AgentSession.

**Overall Risk Rating:** 🟠 High

The design includes strong compensating controls (four governance layers, fail-open fallback, budget gate PI_CONTEXT_BUDGET_EXCEEDED, backward-compatible parser), but several findings require remediation before implementation:

- Prompt injection via malicious agent .md personaBody (A03) — no content sanitization of injected system prompt.
- Broken access control — per-tab session isolation not yet implemented (registry keyed by workspaceRoot only today); no authorization check on agentId selection.
- Insecure design — fail-open (BR-07) fallback may allow an attacker-crafted agent file to obtain a broader tool loadout than intended; no JSON Schema validation for v2 frontmatter.
- Security misconfiguration — invalid role/model fall back with warning instead of fail-closed; legacy path hardcodes sm-agent.
- Audit trail specified in TDD §7.6 but not yet implemented in code.

No new network sockets, no new external dependencies, no code execution from agent files. Trust posture: agent files are workspace files, read+parse only (BR-04).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 3 |
| 🟡 Medium | 4 |
| 🔵 Low | 2 |
| ℹ️ Informational | 3 |

---

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control

No issues found in the current code for the selectAgent stub (it does not enforce anything). However, the target design has access control gaps that must be remediated during implementation (S2/S3):

- **SA4E-370-F01 (High):** Registry keyed by workspaceRoot only — no per-tab session isolation today. All tabs share one AgentSession. (TDD §2.2, registry.ts:13)
- **SA4E-370-F02 (High):** No authorization check on agentId — any tab can select any agent discovered in .code-intel/agents/; no matrix mapping which user/tab may use which agent.
- **SA4E-370-F03 (Medium):** Role/phase from agent definition validated only by fallback+warning (BR-07); an attacker-edited agent file with a crafted role may influence tool loadout scoping.

### A02:2021 — Cryptographic Failures

- **SA4E-370-F04 (Informational):** Agent definition files stored as plaintext in workspace (.code-intel/agents/*.md). No encryption at rest. Acceptable per threat model (user-controlled workspace files), but sensitive persona content is not protected.
- No cryptographic operations introduced by this feature (no signing, no encryption of persona in transit — all in-process).

### A03:2021 — Injection

- **SA4E-370-F05 (High):** Prompt injection via malicious agent .md personaBody. The persona body is injected as system prompt content into the LLM context (TDD §12.2 step 5). There is no sanitization, allowlisting, or content scanning of personaBody. A malicious agent file could contain instructions to exfiltrate data, issue tool calls, or bypass governance. Mitigating controls: (a) persona stays within the user's own workspace trust boundary; (b) persona passes through the budget gate; (c) no code execution from persona. Residual risk: Medium-High.
- **SA4E-370-F06 (Medium):** YAML frontmatter parsed via regex (content.match(/^---\r?\n[\s\S]*?\r?\n---/)) in fs-helpers.ts:14 — not a YAML parser. Vulnerable to ReDoS on crafted frontmatter and to frontmatter bypass (e.g., multiple --- sections, nested delimiters).
- **SA4E-370-F07 (Low):** Cosmetic [Agent: X] prefix mechanism (message-routing.ts:66) is being retired per FR-05 but remains in current code — low risk as it is only a string prefix, not code execution.

### A04:2021 — Insecure Design

- **SA4E-370-F08 (High):** Fail-open (BR-07) privilege risk. Role scoping errors fall back to base loadout; invalid role falls back to default + warning. An attacker who can write agent files in the workspace could craft a role that results in a less-restrictive loadout. No deny-list or explicit role allowlist enforcement at parse time (validation deferred to engine).
- **SA4E-370-F09 (Medium):** No JSON Schema validation for v2 frontmatter. TDD §14.2 Open Question #1: schema validation deferred (simple field validation suffices). Malformed role/phase/model values are accepted with fallback, not rejected.
- **SA4E-370-F10 (Medium):** Backward compatibility (FR-03) may allow bypass. v1 agent files (name+description only) load with role/phase/model = undefined. If future governance depends on role being present, v1 files could bypass role-scoped restrictions.

### A05:2021 — Security Misconfiguration

- **SA4E-370-F11 (Medium):** Invalid role/model fall back with warning only (BR-03/BR-07), not fail-closed. Operator may not notice the fallback; agent runs with unintended capabilities.
- **SA4E-370-F12 (Low):** Legacy path hardcodes sessionRole = sm-agent (adapter-legacy-turns.ts:83) — to be removed by S2, but present in current code.
- **SA4E-370-F13 (Low):** No CSP / security headers configured for the VS Code webview chat panel (out of scope of this feature but relevant to XSS surface for rendered agent badges/history).
- No hardcoded credentials/secrets found in the custom-agent code paths (verified via grep).

### A06:2021 — Vulnerable and Outdated Components

See Dependency Vulnerabilities section below. No new dependencies introduced by SA4E-370 (NFR: zero new deps, reuses pi-dev extensions).

### A07:2021 — Identification and Authentication Failures

- **SA4E-370-F14 (Informational):** No authentication within the feature — relies on VS Code workspace trust model. Users operate within their own workspace; agent .md files are user-controlled. No session tokens, no MFA, no identity assertion for agent selection. Acceptable for a local extension feature, but must be documented in trust posture.

### A08:2021 — Software and Data Integrity Failures

- **SA4E-370-F15 (Medium):** Agent .md files are not signed or integrity-verified. Hot-reload watcher (dir-watchers.ts) re-parses on every file change without signature verification. A compromised workspace file directly becomes a system prompt.
- Persona body is not hashed/tamper-evident before injection.

### A09:2021 — Security Logging and Monitoring Failures

- **SA4E-370-F16 (Medium):** Audit trail specified but not implemented. TDD §7.6 / FSD §7.3 requires logging: agent switch (tabId, agentId, success, timestamp, error), budget gate rejects, parse errors, session create/dispose. Current code: console.debug/debugLog only, no structured security events, no retention enforcement.
- Session history persisted to .pi/sessions/*.jsonl — may contain user prompts and agent responses; not encrypted at rest.

### A10:2021 — Server-Side Request Forgery (SSRF)

- **SA4E-370-F17 (Informational):** N/A — no outbound network connections. NFR §6 (Configurability: Zero-config) and TDD §1.5 Constraints: No new network sockets from this feature. Agent files are read from local file system only. SSRF not applicable.

---

## Dependency Vulnerabilities

No new dependencies introduced by SA4E-370 (reuses existing pi-dev extensions). Review of extension/package.json (relevant runtime deps):

| Dependency | Current Version | Role in SA4E-370 | Notes |
|------------|----------------|------------------|-------|
| @earendil-works/pi-coding-agent | 0.99.1 | Session host / AgentSession | Core session mechanism — verify no known CVEs |
| @earendil-works/pi-agent-core | 0.99.1 | Tool types, loadout | — |
| @earendil-works/pi-ai | 0.99.1 | Model registry | — |
| @modelcontextprotocol/sdk | ^1.29.0 | MCP bridge (skeleton) | Optional; degraded if absent |
| undici | ^6.21.0 | HTTP client (LLM provider) | Not used by custom-agent feature directly |
| ajv | ^8.17.1 | JSON Schema | Available — could be used for v2 frontmatter validation (F09 remediation) |
| billion-context-pi | 0.1.82 | Context pipeline | Governance layer |

Action: Run npm audit on extension/ before implementation to confirm no known CVEs in the above. No typosquatting or suspicious dependency names observed.

---

## Security Headers Assessment

The custom-agent feature runs inside a VS Code webview (chat panel). Webview security headers are controlled by VS Code, not by the extension. Relevant considerations:

| Header / Control | Status | Recommendation |
|------------------|--------|----------------|
| Content-Security-Policy (webview) | ⚠️ VS Code-managed | Ensure webview localresource roots restrict to workspace; avoid unsafe-inline for rendered agent badge/history content |
| X-Content-Type-Options | ⚠️ VS Code-managed | N/A (webview) |
| X-Frame-Options | ⚠️ VS Code-managed | N/A (webview) |
| Referrer-Policy | ❌ Not applicable | Extension-to-LLM traffic uses provider SDK; ensure API key not leaked in Referer |
| Cache-Control | ⚠️ N/A | Agent file content read from FS, not cached with sensitive data |

Note: Agent badge and conversation history are rendered in the webview. If persona content contains HTML/JS and is rendered unsanitized, XSS risk exists. Mitigation: render agent name/description as text only (never innerHTML).

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | SA4E-370-F05 — Prompt injection via personaBody (no sanitization) | Medium | High — system prompt compromise |
| 2 | SA4E-370-F01 — No per-tab session isolation (registry key) | Medium | High — history/token leak across tabs |
| 3 | SA4E-370-F02 — No authorization on agentId selection | Low | Medium — any tab can use any agent |
| 4 | SA4E-370-F08 — Fail-open role fallback may broaden loadout | Low | Medium — privilege escalation via crafted role |
| 5 | SA4E-370-F16 — Audit trail not implemented | Medium | Medium — no security event visibility |
| 6 | SA4E-370-F06 — YAML regex parsing (ReDoS/bypass) | Low | Low-Medium |
| 7 | SA4E-370-F09 — No JSON Schema validation for v2 frontmatter | Low | Low |
| 8 | SA4E-370-F04/F15 — Plaintext agent files, no integrity verification | Medium | Low |

---

## Recommendations Summary

### Immediate Actions (Critical/High)

1. Sanitize personaBody before injection — treat as untrusted user content; strip dangerous prompt-injection patterns or display a warning when persona contains suspicious instructions (addresses F05).
2. Implement per-tab registry key (workspaceRoot+tabId) with safe session dispose on tab close (addresses F01, BR-05).
3. Add authorization check on agentId — verify the requesting tab/context is allowed to select the agent (addresses F02).
4. Enforce role allowlist at parse time against SA4E-355 role matrix; reject unknown roles instead of silent fallback (addresses F08, BR-07 refinement).

### Short-term Improvements (Medium)

5. Implement audit trail per TDD §7.6: structured logs for agent switch, budget gate rejects, parse errors, session create/dispose (addresses F16).
6. Replace regex YAML parsing with a safe YAML parser or bounded regex with ReDoS protection (addresses F06).
7. Add JSON Schema validation for v2 frontmatter fields (role, phase, model) using existing ajv dependency (addresses F09).
8. Hash/tamper-evidence for agent files or at least log file modifications with mtime (addresses F15).

### Long-term Hardening (Low/Informational)

9. Encrypt sensitive persona content at rest if agent files may contain secrets (addresses F04).
10. Render agent name/description as text only in webview (no innerHTML) to prevent XSS (addresses F13/F07 residual).
11. Fail-closed for invalid model/role instead of warning+fallback (addresses F11).
12. Run npm audit and pin dependency versions before implementation (addresses A06).

---

## Appendix

### A. Tools & Methodology
- Static code analysis (manual review of BRD/FSD/TDD/STATUS and source code)
- OWASP Testing Guide v4.2 methodology
- OWASP Top 10 (2021) mapping
- CVSS v3.1-aligned severity classification

### B. Scope Limitations
- Static analysis only — no dynamic/penetration testing, no runtime behavior verification.
- Implementation not yet started (TDD/FSD are design documents; current code has stubs: selectAgent stub, v1 parser, workspaceRoot-only registry). Findings F01–F04, F07–F12 refer to the target design and current code gaps.
- Infrastructure, network, and VS Code platform security out of scope.
- No dependency CVE scanning performed (recommend npm audit).

### C. Evidence Files Reviewed
| File | Relevance |
|------|-----------|
| documents/SA4E-370/BRD.md | Business requirements, BR-01..BR-07, trust posture |
| documents/SA4E-370/FSD.md | Functional requirements, security requirements §7 |
| documents/SA4E-370/TDD.md | Technical design, §7 Security Design, audit trail §7.6 |
| documents/SA4E-370/STATUS.json | Scope, non-goals, code evidence (exists/missing) |
| extension/src/chat-panel/ChatStateManager/fs-helpers.ts | v1 agent parser (regex YAML) |
| extension/src/pi-workflow/session-host/registry.ts | Session registry (workspaceRoot key today) |
| extension/src/pi-workflow/pi-workflow-adapter/adapter-core.ts | selectAgent stub |
| extension/src/pi-workflow/pi-workflow-adapter/adapter-legacy-turns.ts | Hardcoded sm-agent role |
| extension/src/pi-workflow/session-host/create-host.ts | Governance layers, budget gate, scoped steering |
| extension/src/pi-workflow/session-host/loadout.ts | Role-aware tool loadout, BR-06 core tools |
| extension/src/chat-panel/message-routing.ts | [Agent: X] cosmetic prefix |
| extension/src/chat-panel/message-protocol.ts | v1 message types (agentsLoaded, agentSwitched) |
| extension/src/pi-agent/session-budget-gate.ts | runSessionBudgetGate, PI_CONTEXT_BUDGET_EXCEEDED |
| extension/src/pi-agent/scoped-steering.ts | Role-scoped steering, fail-open |
| extension/package.json | Dependencies, no new deps for SA4E-370 |

### D. Glossary
- CVSS: Common Vulnerability Scoring System
- CWE: Common Weakness Enumeration
- OWASP: Open Web Application Security Project
- BR: Business Rule (BRD §5.2)
- FR: Functional Requirement (BRD §2.2)
- NFR: Non-Functional Requirement (BRD §6)