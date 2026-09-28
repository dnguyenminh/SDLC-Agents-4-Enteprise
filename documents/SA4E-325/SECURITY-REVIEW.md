# 🔒 Security Design Review (Phase 3.7) — SA4E-325: Pi Smart Context Retrieval

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-325 — Pi Smart Context Retrieval for repos with thousands of files |
| Scope (design) | Pre-`createAgentSession` retrieval pipeline: QueryRouter → ContextRetriever → MCP `code_search`/`mem_search` (topK=20) → Ranker → Progressive Disclosure (symbol/chunk tiers) → Summary Tree → Session Factory wiring |
| Design docs | `documents/SA4E-325/TDD.md` v1.0, `FSD.md`, `BRD.md`; module layout `extension/src/pi-agent/context-retrieval/` |
| Date | 2026-09-27 |
| Assessor | Security Agent (design review per TDD + implemented module structure; static, no exploitation) |
| Version | 1.0 |

## Executive Summary

The SA4E-325 design routes developer queries through intent classification, MCP-backed semantic search, deterministic ranking, and a token-budgeted progressive-disclosure plan before session creation. The design's security strengths are its hard resource caps (topK ≤ 20, token budget 6000, scanner maxFiles 500 / maxDepth 12 / pageSize 100, search timeout 2s + single retry) and its fail-open-to-summary-tree degradation for availability.

The dominant threat is **trust-boundary violation: file paths returned by MCP tools (`code_search`, `mem_search`) are treated as read targets by progressive disclosure** without any workspace-containment or canonicalization step in the design. Because `mem_search` indexes KB content that any agent can write via `mem_ingest`, a poisoned KB entry (or a compromised MCP wrapper on loopback 9181) can name any absolute path — `~/.aws/credentials`, `~/.ssh/id_rsa` — and the pipeline will read it and inject the first 80 lines into the LLM context. The design also reads files synchronously with no size caps and uses a quadratic-backtracking regex in query routing with no query-length cap.

**Overall Risk Rating: High** (one High finding; downgrades to Low once containment lands).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 3 |
| 🔵 Low | 2 |
| ℹ️ Informational | 1 |

## Findings Summary Table

| ID | Severity | Title | Location (design) | Recommendation |
|----|----------|-------|-------------------|----------------|
| SEC-325-D1 | High | Untrusted MCP-derived file paths reach `fs.readFileSync` without workspace containment → arbitrary file read into LLM context | Progressive disclosure + symbol/chunk extraction (see code: `symbol-outline-extractor.ts`, `progressive-disclosure.ts`) | Canonicalize (`realpath`) every candidate path; reject paths outside `rootDir`; treat `mem_search` output as untrusted |
| SEC-325-D2 | Medium | Loopback MCP wrapper: no auth, no per-request timeout at client, caller-supplied `baseUrl` unvalidated | `McpSearchProvider` → `McpWrapperClient` (default `127.0.0.1:9181`) | Add `AbortSignal.timeout`, validate baseUrl against loopback policy, consider session nonce |
| SEC-325-D3 | Medium | Unbounded synchronous file reads in disclosure tiers (whole-file `readFileSync` before line slicing) → extension-host DoS | Chunk tier design (`extractChunk`) | Stat + size cap (e.g. 1 MB) before read; read only `maxLines` |
| SEC-325-D4 | Medium | ReDoS-prone intent regex + no query length cap (`\bwhere\s+is\s+.+\s+(defined\|…)\b` quadratic backtracking) | QueryRouter STRUCTURAL patterns | Bound query length (e.g. 4 KB) before regex; replace `.+` chains with linear-safe patterns |
| SEC-325-D5 | Low | Sensitive-file classes not excluded (`.env`, `*.pem`, `id_rsa`, `secrets.*`); exclusion list covers only `.git/node_modules/out/dist` | `EXCLUDED_DIRS` design | Extend exclusion list with secret-bearing patterns; strip `.env*` from disclosure |
| SEC-325-D6 | Low | User query logged verbatim in empty-result warn | `ContextRetriever.emptyResult` | Log query hash/truncated+redacted form only (no redaction in `logger.ts` today) |
| SEC-325-D7 | Info | Silent catch-and-fallback (search fail → summary tree) degrades auditability | `retrieveLocal` fallback | Keep fallback but log error classes consistently; include retrieval decision in diagnostics |

## Findings by OWASP Top 10 (2021)

- **A01 Broken Access Control** — SEC-325-D1 (path trust-boundary), SEC-325-D2 (unauthenticated loopback tool source).
- **A03 Injection** — SEC-325-D7-adjacent: search-result *content* also flows into outlines/summaries that enter the prompt (prompt-injection surface inherited from tool outputs; design lacks provenance marking).
- **A04 Insecure Design** — SEC-325-D3, SEC-325-D4 (resource consumption); compensating caps (topK/budget/depth) acknowledged ✅.
- **A05 Security Misconfiguration** — SEC-325-D2.
- **A09 Logging Failures** — SEC-325-D6, SEC-325-D7.
- **A02/A06/A07/A08/A10** — No issues found ✅ (no crypto, no new dependencies, no auth surface, no deserialization of untrusted JSON in this design, no outbound requests other than the fixed loopback wrapper).

## Detailed Findings

### SEC-325-D1: MCP-derived paths reach file reads without containment

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP / CWE** | A01:2021 / CWE-22 (Path Traversal), CWE-912 (function of untrusted input) |
| **CVSS (logic)** | 7.3 — local poisoned-index or compromised-wrapper prerequisite; impact = arbitrary file read exfiltrated to LLM provider |

**Description:** The design pipeline parses tool output lines `File: <path>:<line>` into `SearchCandidate.filePath`, ranks them, and the disclosure plan's symbol/chunk tiers read those paths from disk so their content can be injected as session context. Nothing in the TDD/FSD constrains those paths to the workspace root, canonicalizes symlinks, or treats `mem_search` (KB entries writable by any agent via `mem_ingest`) as untrusted. A single poisoned KB entry such as `[class] AwsCreds / File: /home/user/.aws/credentials:1` that survives ranking causes its target's content to be read and shipped to the model provider — a file-read → prompt-exfiltration primitive.

**Recommendation (design):**
```text
Disclosure invariant: context files ⊂ realpath(rootDir).
1. Resolve rootDir once (workspace resolver).
2. For every candidate path: reject non-relative-to-root after realpath; reject symlink escapes; reject UNC/absolute home paths.
3. Treat mem_search candidates as untrusted by default (flag source; optionally require allowlist for KB-sourced file reads).
```

### SEC-325-D2: Loopback MCP wrapper without auth/timeout; unvalidated baseUrl

**Severity:** Medium — any local process can bind 9181 (or a crashed wrapper's port) and feed crafted "search results" (feeding SEC-325-D1) or hang calls (search-level 2s `withTimeout` at the provider mitigates hangs ✅). `createMcpSearchProvider(config, baseUrl?)` accepts arbitrary baseUrl with no scheme/host policy. **Recommendation:** enforce loopback default + `validateBackendUrl`-style check; add fetch timeout + session nonce header.

### SEC-325-D3: Unbounded synchronous reads (DoS)

**Severity:** Medium — chunk tier reads the **whole** file then slices lines; a multi-GB file (legit or hostile workspace) freezes the extension host. **Recommendation:** `statSync` size cap (≤1 MB) + stream/read-limit; keep disclosure within token budget as designed.

### SEC-325-D4: ReDoS in query routing + unbounded query

**Severity:** Medium — `where\s+is\s+.+\s+(defined|declared|implemented)` exhibits O(n²) backtracking on space-flooded input; `validateQuery` enforces non-empty but no length cap. Query is user-sourced today (self-DoS), but will be LLM/tool-derived in later epic phases → fix now. **Recommendation:** cap query length (e.g. 4,096 chars) before classification; simplify regexes.

### SEC-325-D5 / D6 / D7

See table above; all are defense-in-depth/audit items for the same PR.

## Positive Controls Acknowledged ✅

- Hard caps everywhere: `maxTopK: 20`, `tokenBudget: 6000`, scanner `maxFiles 500 / maxDepth 12 / pageSize 100`; summary tree `maxTokens 1500 / maxDepth 3 / filesPerDir 8`.
- Search calls wrapped in 2s timeout with single retry + backoff; `mem_search` treated as optional (failure continues) — availability-safe.
- Input validation errors (`RetrievalValidationError`) thrown for empty query / bad topK — fail-closed on caller contract violations.
- Ranking is deterministic and local (no external ranker); dedupe prevents result-flooding within topK.

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | SEC-325-D1 containment invariant | Low (path helper + 3 call sites) | Blocks arbitrary-file-read → prompt exfiltration |
| 2 | SEC-325-D3 size caps | Low | Blocks extension-host freeze |
| 3 | SEC-325-D4 query cap + regex | Low | Blocks ReDoS |
| 4 | SEC-325-D2 wrapper hardening | Low-Medium | Blocks local spoofing/hang |
| 5 | SEC-325-D5/D6/D7 | Low | Hardening |

## Verdict

**APPROVED-WITH-CONDITIONS** — design is fit for purpose *given its hard resource caps*, but the **blocking condition** is SEC-325-D1: the workspace-containment invariant for MCP-derived paths MUST be specified in the TDD/FSD and implemented before this pipeline is wired into production session creation. Conditions 2–5 should ride the same DEV pass.

## Scope Limitations

- TDD v1.0 is a skeleton (37 lines); design intent reconstructed from TDD + FSD + implemented module structure — the code review (SECURITY-ASSESSMENT.md) carries the file:line evidence.
- Pi SDK behavior for `contextFiles` (whether it re-reads paths itself) not audited; backend MCP wrapper server assumed trusted-operated but locally bindable by other processes.
