# 🔒 Security Assessment (Phase 5.7 — Code Review) — SA4E-325: Pi Smart Context Retrieval

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-325 |
| Phase | 5.7 — Post-implementation security assessment |
| Scope (code) | `extension/src/pi-agent/context-retrieval/` — `file-scanner.ts`, `file-exclusion-filter.ts`, `search-provider.ts`, `ranker.ts`, `progressive-disclosure.ts`, `summary-tree.ts`, `symbol-outline-extractor.ts`, `token-counter.ts`, `types.ts`; plus `query-router.ts`, `context-retriever.ts`, wiring `session-factory.ts`; tests in `__tests__/` |
| Design baseline | `documents/SA4E-325/TDD.md` v1.0; Phase 3.7 verdict: **APPROVED-WITH-CONDITIONS** (`SECURITY-REVIEW.md`) |
| Date | 2026-09-27 |
| Assessor | Security Agent (static code review, no exploitation) |
| Version | 1.0 |

## Executive Summary

The implementation matches the reviewed design and confirms its central weakness with concrete evidence: **`SearchCandidate.filePath` parsed from MCP tool output reaches `fs.readFileSync` with zero containment** (`search-provider.ts:45-48` → `context-retriever.ts:79-85` → `progressive-disclosure.ts:53` → `symbol-outline-extractor.ts:13`). `isExcludedPath` (the only filter applied, `context-retriever.ts:80`) blocks just 4 directory-name segments (`.git/node_modules/out/dist`, `types.ts:64`) and does not constrain absolute paths, home-directory reads, or symlink escapes. `FsContentReader.readHead` reads the **entire** file synchronously before slicing lines, with no size cap.

All 7 design-review findings are **confirmed in code, none remediated** (the module is not yet wired into production entry points — `ContextRetriever`/`createMcpSearchProvider` are constructed only in tests today, which limits current exploitability but not the required fix). One new code-level finding was added (SEC-325-C1: scanner accepts arbitrary rootDir). No Critical issues; no ReDoS beyond the design-noted regex; no prototype pollution (plain Maps/Set only ✅).

**Overall Risk Rating: High** (single confirmed High; becomes Low after containment fix).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 (SEC-325-01, confirmed from design) |
| 🟡 Medium | 3 (confirmed) |
| 🔵 Low | 3 (2 confirmed + 1 new) |
| ℹ️ Informational | 1 |

## Findings Table (code-verified)

| ID | Severity | Title | File:Line | Status |
|----|----------|-------|-----------|--------|
| SEC-325-01 | High | MCP-derived file path → uncontained `readFileSync` → arbitrary file read into LLM context | `symbol-outline-extractor.ts:10-18,42-46`; `progressive-disclosure.ts:50-66`; `context-retriever.ts:79-92`; `search-provider.ts:44-52` | Open — **Blocking** |
| SEC-325-02 | Medium | Whole-file sync read, no size cap → extension-host DoS | `symbol-outline-extractor.ts:13` (`readFileSync` then `split('\n').slice`) | Open |
| SEC-325-03 | Medium | Loopback MCP wrapper: no fetch timeout/auth; `baseUrl` param unvalidated | `mcp-wrapper-client.ts:28,45`; `search-provider.ts:134-136` | Open (2s search-level timeout mitigates hangs ✅) |
| SEC-325-04 | Medium | ReDoS-prone structural regex + no query length cap | `query-router.ts:21`; `context-retriever.ts:119-124` | Open |
| SEC-325-05 | Low | Sensitive files not excluded from disclosure (`.env`, keys) | `types.ts:64` (`EXCLUDED_DIRS`); `file-exclusion-filter.ts:5-10` | Open |
| SEC-325-06 | Low | User query logged verbatim on empty result | `context-retriever.ts:114` | Open |
| SEC-325-07 (new) | Low | `FileScanner.listSourceFiles(rootDir)` accepts any path — no workspace containment on scan root | `file-scanner.ts:30-43` | Open |
| SEC-325-08 | Info | Silent `catch {}` swallow in template/collection paths; retrieval falls back to summary tree without error class | `file-exclusion-filter.ts:24-26`; `context-retriever.ts:93-98` | Open (availability-by-design; audit gap) |

## Detailed Findings

### SEC-325-01: Untrusted MCP-derived paths reach `fs.readFileSync` (confirmed)

| Attribute | Value |
|-----------|-------|
| **Severity** | High |
| **OWASP / CWE** | A01:2021 / CWE-22, CWE-912 |
| **Location** | `extension/src/pi-agent/context-retrieval/search-provider.ts:44-52,68-74`; `context-retriever.ts:79-92`; `progressive-disclosure.ts:50-66`; `symbol-outline-extractor.ts:10-18` |
| **Status** | Open — blocking condition for production wiring |

**Evidence (data flow):**
```typescript
// search-provider.ts:45-48 — attacker-influenced line → filePath
const file = /^File:\s*(.+?):(\d+)$/.exec(line);
if (file) { candidate.filePath = file[1]; candidate.startLine = Number(file[2]); }

// context-retriever.ts:80 — ONLY filter applied: 4 dir-name segments
const allowed = candidates.filter((candidate) => !isExcludedPath(candidate.filePath));

// progressive-disclosure.ts:53 → symbol-outline-extractor.ts:13 — full read, no containment
const chunk = this.deps.extractor.extractChunk(file.path, …);
//   → FsContentReader.readHead: fs.readFileSync(filePath, 'utf-8')  ← arbitrary absolute path
```
The content then becomes `ContextFile.outline` (`progressive-disclosure.ts:63-65`), flows into `RetrievalResult.contextFiles`, and `session-factory.ts:36` forwards `contextFiles.map(f => f.path)` into `sdk.createAgentSession` — i.e., into the LLM prompt. `mem_search` sources make the poisoning precondition realistic (KB entries are agent-writable via `mem_ingest`).

**Impact:** Read of any local file (e.g. `~/.ssh/id_rsa`, `.aws/credentials`, browser profiles) whose path an attacker can plant in search output; content exfiltrated to the model provider on the next inference call.

**Remediation (idiomatic, drops into `ContextRetriever`):**
```typescript
// context-retrieval/safe-path.ts (NEW)
import * as fs from 'fs';
import * as path from 'path';

export function containPath(rawPath: string, rootDir: string): string | null {
  try {
    const root = fs.realpathSync(rootDir);
    const resolved = path.resolve(root, rawPath);            // absolute-izes relative, keeps abs
    const real = fs.realpathSync(resolved);                  // resolves symlinks/..//
    if (real !== root && !real.startsWith(root + path.sep)) return null;
    return real;
  } catch { return null; }
}

// context-retriever.ts retrieveLocal — apply after isExcludedPath
const allowed = candidates
  .map((c) => { const p = containPath(c.filePath, this.deps.rootDir); return p ? { ...c, filePath: p } : null; })
  .filter((c): c is SearchCandidate => c !== null);
```
Apply the same guard to `progressive-disclosure.ts` group paths (defense-in-depth) and pass `rootDir` into `ProgressiveDisclosureManager`.

### SEC-325-02: Whole-file sync read without size cap

`readHead` (`symbol-outline-extractor.ts:11-18`) does `fs.readFileSync(filePath, 'utf-8')` — a 10 GB file freezes the extension host before `.slice(0, maxLines)`. **Remediation:** stat-first + size cap + line-limited read:
```typescript
readHead(filePath: string, maxLines: number): string {
  const stat = fs.statSync(filePath);              // throws → caught → ''
  if (!stat.isFile() || stat.size > 1_048_576) return '';   // 1 MB cap
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').slice(0, maxLines).join('\n');
}
```

### SEC-325-03: MCP wrapper client hardening

`McpWrapperClient` (`mcp-wrapper-client.ts:45-51`) has no `AbortSignal` and accepts any `baseUrl` (`search-provider.ts:134-136` passes it through unvalidated). The search path wraps calls in 2s `withTimeout` ✅ but the wrapper itself should add `signal: AbortSignal.timeout(5000)` and validate baseUrl is loopback (reuse `isLoopbackHost` from `config/backend-url.ts`). Local port-spoofing remains a design-accepted loopback risk (see Phase 3.7 SEC-325-D2).

### SEC-325-04: ReDoS + query cap

`query-router.ts:21` `/\bwhere\s+is\s+.+\s+(defined|declared|implemented)\b/i` — quadratic backtracking on `"where is" + " "*n`. `validateQuery` (`context-retriever.ts:119-124`) checks non-empty only. **Remediation:** cap first:
```typescript
const MAX_QUERY_CHARS = 4096;
if (query.length > MAX_QUERY_CHARS) throw new RetrievalValidationError(`Query exceeds ${MAX_QUERY_CHARS} chars`);
// and simplify: /\bwhere\s+is\s+(\S+\s+){0,20}?.../ or strip multi-space runs before test
```

### SEC-325-05: Sensitive-file exclusion gap

`EXCLUDED_DIRS = ['.git','node_modules','out','dist']` (`types.ts:64`). `.env*`, `*.pem`, `id_rsa*`, `*.key`, `secrets.*`, `credentials*` survive both scanning and MCP-result filtering; a query containing "env" ranks them and chunk tier reads them into context. **Remediation:** add a `SENSITIVE_FILE_RE = /(^|\/)\.(env[^/]*|npmrc|netrc|aws|ssh)|(id_rsa|\.pem|\.key|\.p12|credentials|secrets\.).*/i` check in `isExcludedPath`.

### SEC-325-06 / 07 / 08

- **SEC-325-06:** `logger.warn(\`Context retrieval empty: ${warning}\`, { query })` logs the raw user query (`context-retriever.ts:114`) — queries can contain pasted secrets/PII and `logger.ts` has no redaction. Log `query.length` + hash instead.
- **SEC-325-07 (new):** `FileScanner.listSourceFiles(rootDir)` performs BFS from any supplied root with no containment — same invariant as SEC-325-01 applies to the scan root; enforce `rootDir` comes from the workspace resolver only (document + assert).
- **SEC-325-08:** error classes lost in fallbacks (`context-retriever.ts:93-98` logs only `error.message`) — acceptable availability trade-off; include `intent`/`source` in log data for audit.

## Positive Controls Verified ✅

- Hard caps implemented as designed: scanner `maxFiles 500 / maxDepth 12 / pageSize 100` (`file-scanner.ts:30-42`); `maxTopK 20` + `Math.min(topK, maxTopK)` (`context-retriever.ts:126-131`); token budget 6000 enforced per tier (`progressive-disclosure.ts:43,61`); summary tree 1500 tokens/depth 3 (`summary-tree.ts:34-38`).
- Fail-closed caller contract: empty/non-string query and invalid topK throw `RetrievalValidationError` (`context-retriever.ts:119-131`).
- Search timeout 2s + single retry + optional-tool degradation (`search-provider.ts:76-78,112-131`); dedupe prevents duplicate-flooding (`search-provider.ts:84-92`).
- `session-factory.ts:47-57` wraps retrieval failure → continue without context (logged) — no crash path.
- Ranker term extraction capped at 8 terms, linear scoring (`ranker.ts:10,43-48`); token counter O(n) (`token-counter.ts:5-11`).
- No `eval`, no dynamic `require(variable)`, no `JSON.parse` of tool output (string parsing only), no prototype-pollution sinks (Maps/Sets/`Object` literals only).

## Risk Rating

**High** — solely due to SEC-325-01; all other findings are Medium/Low hardening. Current production reachability is limited (retriever constructed only in tests so far), but the fix is mandatory **before** SA4E-325 is wired into session creation.

## Verdict

**APPROVED-WITH-CONDITIONS** — code quality and DoS posture are good; approval conditional on:

1. **(Blocking)** SEC-325-01: implement `containPath` invariant (realpath + rootDir containment) for every MCP-derived path before production wiring; add unit tests with `../` traversal, absolute-home, and symlink-escape cases (none exist today — tests are functional only).
2. (Same PR) SEC-325-02 size cap; SEC-325-04 query cap + regex simplification; SEC-325-05 sensitive-file exclusion.
3. (Follow-up) SEC-325-03 wrapper timeout/loopback validation; SEC-325-06 query redaction; SEC-325-07 scan-root assertion.

## Appendix — Methodology & Limitations

- Static review of 11 source files + 10 test files (read in full) + wiring greps (`new ContextRetriever`, `createMcpSearchProvider`, `contextFiles` flow into `session-factory.ts`). No dynamic testing of the MCP backend, no PoC execution (per role boundary: report only).
- Runtime behavior of `@earendil-works/pi-agent-core` session consumption of `contextFiles` not audited — if the SDK re-reads the paths itself, SEC-325-01's impact extends beyond our `readHead` sink; the containment fix covers both.
- Backend MCP wrapper server (port 9181) assumed operational; its own auth posture is out of this ticket's scope (tracked as SEC-324-13).
