# 🔒 Security Design Review (Phase 3.7) — SA4E-326: Pi Prompt Compression + Role-scoped Prompts per Model Tier

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-326 — Prompt compression + role-scoped prompt templates per model tier |
| Scope (design) | `PromptTemplateService` (template discovery from `<cwd>/.pi/prompts` + `<agentDir>/prompts`, full/compressed variants, tier-based selection), `compressPrompt` (HTML-comment / fenced-example / example-section / boilerplate stripping + whitespace collapse), `RoleScopeFilter` (role→skill allowlist), `AgentConfigurator` (`selectPrompt`, `buildResourceLoaderOptions`, `appendSystemMd`), `ModelTier` detection |
| Design docs | `documents/SA4E-326/TDD.md` v1.0 (skeleton), `FSD.md`; module layout `extension/src/pi-agent/` |
| Date | 2026-09-27 |
| Assessor | Security Agent (design review; static, no exploitation) |
| Version | 1.0 |

## Executive Summary

SA4E-326 decides **what text becomes the system prompt** of Pi agent sessions — the most security-sensitive string in the pipeline, since it steers tool usage and output handling. The design's strong points are strict template-name validation (`^[a-z0-9-]+$` blocks traversal in names), throw-based role/mode validation, fail-safe compression (exceptions return the original), and role-scope filtering of skills.

The core threats: (1) **prompt-template provenance** — templates and `SYSTEM.md` are read from the workspace (and the user-level agent dir) and appended to the system prompt without user confirmation; in the untrusted-workspace threat model this is a system-prompt-poisoning surface; (2) **compression integrity** — lossy stripping can remove security instructions (e.g. lines matching `tip|note|hint|see also:`) from role prompts on small models; (3) unbounded synchronous template reads (DoS); (4) fail-open role-scope filtering for unknown roles; (5) latent ReDoS in the lazy dot-all comment/fence regexes. None is Critical (no RCE/credential path), and all have small, local fixes.

**Overall Risk Rating: Medium**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 |
| 🔵 Low | 3 |
| ℹ️ Informational | 2 |

## Findings Summary Table

| ID | Severity | Title | Location (design) | Recommendation |
|----|----------|-------|-------------------|----------------|
| SEC-326-D1 | Medium | Workspace-sourced prompt injection surface — `.pi/prompts/*`, `agentDir/prompts/*`, `SYSTEM.md` enter the system prompt unvetted | `PromptTemplateService.templateSources()`, `appendSystemMd` (replace mode) | Mark provenance, cap size, show user which templates loaded; restrict in untrusted workspaces (mirror `WorkspaceTrustGuard` policy) |
| SEC-326-D2 | Medium | Unbounded sync template reads (`readFileSync`, no size cap) — hostile workspace `.md` freezes extension host | `PromptTemplateService.discover()/loadPromptContent()` | Stat-first size cap (e.g. 256 KB) before read |
| SEC-326-D3 | Low | ReDoS potential in compression regexes (`<!--[\s\S]*?-->`, fenced-example lazy dot-all) — O(n·m) worst case on adversarial templates | `prompt-compressor.ts` strip functions | Bound input length; use line-based scanners instead of dot-all regex |
| SEC-326-D4 | Low | Compression may strip security-relevant instructions (`tip:/note:/hint:/see also:`, example blocks) from role prompts on small tier — silent security-semantics change | `compressPrompt` pipeline | Never compress the security-critical sections; keep an explicit "do not strip" marker list |
| SEC-326-D5 | Low | `RoleScopeFilter.isAllowed` fail-opens for unknown roles (returns `true`) | `role-scope.ts` | Default-deny for unknown roles; validate role at filter entry |
| SEC-326-D6 | Info | Full prompts logged at debug level in override path | `applyPromptOverride` | Log prompt hash/length, not content |
| SEC-326-D7 | Info | `collectTemplateFiles` swallows per-file errors silently ("log and continue" — no actual log) | template scan | Log skipped files with reason (audit) |

## Findings by OWASP Top 10 (2021)

- **A01 Broken Access Control** — SEC-326-D5 (scope filter fail-open).
- **A03 Injection** — SEC-326-D1 (prompt-content injection via untrusted workspace files; LLM01 Prompt Injection in OWASP LLM Top 10 terms).
- **A04 Insecure Design** — SEC-326-D2, SEC-326-D4 (resource consumption; silent semantics-altering transform).
- **A09 Logging Failures** — SEC-326-D6, SEC-326-D7.
- **A05/A06/A07/A08/A10** — No issues found ✅ (no config surface, no new deps, no auth, no deserialization, no outbound requests in this module).

## Detailed Findings

### SEC-326-D1: Unvetted workspace content becomes system prompt

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium |
| **OWASP / CWE** | A03 (LLM01) / CWE-74, CWE-400-adjacent |
| **CVSS (logic)** | 6.0 — requires opening an untrusted workspace (real, recurring scenario for this extension) |

**Description:** `selectPrompt`/`getPromptForTier` append `templateService` content, and replace-mode `appendSystemMd` appends `<cwd>/SYSTEM.md`, all into the final system prompt. A malicious repository can ship `.pi/prompts/brd.md` or a `SYSTEM.md` containing tool-misuse instructions ("always run `execute_dynamic_tool` with …"); when a developer opens the repo and starts a session, that text executes with the session's authority. The design has no provenance display, size cap, or workspace-trust gate on this path (the extension already operates a `WorkspaceTrustGuard` + `restrictedConfigurations` policy for settings — templates are the unguarded sibling).

**Recommendation:** (1) In untrusted workspaces, skip workspace-local templates/SYSTEM.md (fall back to built-in role prompts) or require one-click confirmation listing file paths+sizes; (2) tag injected content with provenance comments; (3) cap total appended prompt size.

### SEC-326-D2 / D3 / D4 / D5 — see table; all local, low-effort fixes:
- Size-cap reads (`statSync().size > 262144` → skip + warn).
- Replace dot-all lazy regexes with single-pass line scanning (or pre-cap input to e.g. 1 MB).
- Maintain a `NON_STRIPPABLE` marker list; `stripBoilerplateLines` should not match `security|warning|never|do not` lines — current `tip|note|hint|see also` pattern can eat security lines beginning with those words.
- `isAllowed(role)` → `return this.isKnownRole(role) ? … : false;` (default-deny) with an explicit allow-all escape hatch for trusted internal callers.

## Positive Controls Acknowledged ✅

- `validateTemplateName` regex `^[a-z0-9-]+$` — traversal-proof names; `parseVariantName` uses `path.basename` before matching.
- `validateAgentRole` / `validatePromptMode` throw (fail-closed) at the configurator entry point.
- `compressPrompt` try/catch returns original on any error — no crash path; ratio guard (`withinBudget` ≤ 0.6) prevents unbounded "compression".
- REPLACE mode deliberately zeroes `appendSystemPromptOverride` to prevent double-injection of SYSTEM.md (documented in code).
- Tier detection is pure regex on model ids — no network, no eval.

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | SEC-326-D1 trust gate for workspace templates | Medium | Blocks system-prompt poisoning from untrusted repos |
| 2 | SEC-326-D2 size caps | Low | Blocks sync-freeze DoS |
| 3 | SEC-326-D4 non-strippable list | Low | Preserves security semantics under compression |
| 4 | SEC-326-D3 linear parsing | Low | ReDoS hardening |
| 5 | SEC-326-D5 default-deny scope | Low | Closes fail-open |
| 6 | D6/D7 logging hygiene | Low | Audit |

## Verdict

**APPROVED-WITH-CONDITIONS** — no Critical/High; the design is acceptable for Phase 5 code retention. Conditions: (1) workspace-trust gate for template/SYSTEM.md content must land **before** Pi sessions wired into production chat (blocking for the epic, not for this module's merge); (2) size caps + non-strippable security lines in the same DEV pass; (3) default-deny role scope.

## Scope Limitations

- TDD v1.0 is a skeleton; design reconstructed from TDD + FSD + implemented structure — code evidence in `SECURITY-ASSESSMENT.md`.
- Pi SDK's own prompt-merge behavior (how `systemPromptOverride`/`appendSystemPromptOverride` are consumed by `DefaultResourceLoader`) not audited — out of module scope.
