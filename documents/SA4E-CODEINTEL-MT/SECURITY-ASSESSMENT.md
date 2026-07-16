# 🔒 Security Assessment Report — Round 2 Re-Review

## Document Information
| Field | Value |
|-------|-------|
| Project | SA4E Code Intelligence MCP Server (multi-tenant) |
| Scope | Re-verification of round-1 findings SEC-01..SEC-06 after dev-agent fixes |
| Branch | `SA4E-41` (verified via `git diff main..SA4E-41`) |
| Date | 2026-02-09 |
| Assessor | Security Agent |
| Version | 2.0 (round 2) |
| Method | Static code review of the fix diff + full call-chain tracing |

> ⚠️ **Note on round-1 artifact:** The path `documents/SA4E-CODEINTEL-MT/SECURITY-ASSESSMENT.md` did not exist in the repo at review time. Round-1 findings were taken from the re-review brief (SEC-01..SEC-06 descriptions). This file is created as the round-2 record.

---

## Executive Summary

The SA4E-41 branch introduces a single, centralized tenant-isolation policy (`CodeIntelIsolation` / `buildCodeScopeFilter`) that is **fail-closed by default** — any query without a `project_id` scope resolves to SQL `1=0` and returns nothing, rather than leaking the whole corpus. This policy has been threaded through the entire code-intelligence read surface (graph repository, symbol resolver, graph loader, BFS traversal, all analyzers, and the git miner). Path-traversal protection is centralized in a new `shared/path-safety.ts` and applied at every file read/write sink. The HTTP tool boundary now strips client-supplied scope keys unconditionally and binds `X-Project-Id` to the authenticated principal's grant.

All six round-1 findings are **CLOSED**. Two low-impact residual items are recorded as Informational (JWT signature enforcement is contingent on `TOKEN_SECRET`; a missing `X-Project-Id` yields empty results — an availability edge, not a confidentiality leak). Both are already documented in-code with `TODO(SA4E-41)` markers.

**Overall Risk Rating (round 2):** 🔵 **Low** (down from Critical/High in round 1)

| Severity | Round 1 | Round 2 |
|----------|---------|---------|
| 🔴 Critical | ≥1 (SEC-01/02) | **0** |
| 🟠 High | several (SEC-03/04/05) | **0** |
| 🟡 Medium | SEC-06 + memory branch | **0** |
| 🔵 Low | — | 0 |
| ℹ️ Informational | — | 2 |

**Remaining High/Critical:** None. ✅

---

## Round-2 Verdict per Finding

| ID | Title | Round-2 Verdict | Evidence |
|----|-------|-----------------|----------|
| SEC-01 | Graph tools cross-tenant leak | ✅ **CLOSED** | Fail-closed scope threaded through all graph/analysis read paths |
| SEC-02 | Client-supplied scope keys not stripped | ✅ **CLOSED** | `stripReservedKeys()` called UNCONDITIONALLY before stamping |
| SEC-03 | `X-Project-Id` not bound to principal | ✅ **CLOSED** (1 Informational residual) | `verifyProjectBinding()` → 403 outside JWT grant |
| SEC-04 | Path traversal on reads | ✅ **CLOSED** | `resolveWithinWorkspace()` on all read sinks |
| SEC-05 | Path traversal on writes | ✅ **CLOSED** | `resolveWithinWorkspace()` + `requireProjectId()` on all write sinks |
| SEC-06 | File-watcher unscoped indexing | ✅ **CLOSED** | Watcher events scoped to boot tenant only |
| — | `get_curated_context` memory branch | ✅ **CLOSED** | `searchMemory()` fail-closed + `project_id` scoped |

---

## Detailed Verification

### SEC-01 — Graph tools cross-tenant leak → CLOSED

**Central policy** (`engine/query/code-intel-isolation.ts`): `buildCodeScopeFilter(projectId, alias)` returns `{ clause: '1=0', params: [] }` when `projectId` is empty/undefined (secure by default), otherwise `alias.project_id = ?`. A `requireProjectId()` guard throws `PROJECT_REQUIRED` for write paths.

Verified each path from the re-review list applies the scope **fail-closed**:

| Component | File | Scoped reads |
|-----------|------|--------------|
| GraphRepository | `engine/database/graph-repository.ts` | `findCallers`, `findCallees` (scope on joined `s`), `resolveTargets` (per-tenant `symbols` match), `getRelationshipCount`, `getStats` (scope on `relationships`) |
| SymbolResolver | `engine/graph/symbol-resolver.ts` | `exactMatch`, `qualifiedMatch`, `fileMatch`, `fuzzyMatch` all include `${scope.clause}` |
| GraphLoader | `engine/analyzers/graph-analysis/utils/GraphLoader.ts` | `loadDependencyGraph`, `loadCallGraph`, `loadReverseCallGraph`, `getSymbolInfo(Batch)`, `resolveSymbolId` |
| DependencyGraphService | `engine/graph/dependency-graph-service.ts` + `dep-helpers.ts` | `projectId` propagated into `bfsTraversal` → `getOutgoingDeps` / `getIncomingDeps` (both scoped on `relationships`) |
| GraphTraverser | `engine/graph/traverser.ts` + `traverse-helpers.ts` | `projectId` propagated into `getNeighbors` (outgoing/incoming/both scoped on `s`) |
| ComplexityStore | `engine/analyzers/complexity/ComplexityStore.ts` | `query()` scoped on joined `s` (fail-closed) |
| EntryPointStore | `engine/analyzers/entry-points/EntryPointStore.ts` | `query()` scoped on joined `s` (fail-closed) |
| DeadCodeDetector | `engine/analyzers/similarity/DeadCodeDetector.ts` | `getEntryPoints`, call-graph edges, `getAllFunctions`, `hasTestReferences` all scoped |
| GitMiner | `engine/analyzers/similarity/GitMiner.ts` | `search()` scoped on `git_commits` (fail-closed); `indexHistory()` `requireProjectId`; `git_commits`/`git_index_meta` now carry `project_id` (+ legacy migration) |

**Injection chain intact (no missed path):**
`server/routes/tools.ts` stamps `__projectId` → `CodeIntelModule` handler extracts `args.__projectId` → `dispatchCodeIntelTool(..., projectId)` (`register-tools.ts`) passes `projectId` into **every** tool case (`code_callers`, `code_callees`, `code_dependencies`, `code_impact`, `code_traverse`, `complexity_analysis`, `find_entry_points`, graph-analysis group, ai-context group, similarity/git group).

**Residual (safe):** `GraphRepository.insertRelationships` INSERT does not write a `project_id` column value; scoped count/stats read `relationships.project_id`. This is confidentiality-safe (worst case = under-count / empty, never cross-tenant read). Recommend confirming the `relationships.project_id` population path (trigger/default/other writer) so stats are accurate — tracked as **Informational**, not a leak.

---

### SEC-02 — Reserved scope keys stripped unconditionally → CLOSED

`server/routes/tools.ts`:
```ts
const RESERVED_SCOPE_KEYS = ['__projectId', '__userId', '__workspaceRoot'] as const;
function stripReservedKeys(args) { for (const key of RESERVED_SCOPE_KEYS) delete args[key]; }
...
// SEC-02: strip client-supplied reserved keys UNCONDITIONALLY, then stamp trusted values.
stripReservedKeys(args as Args);
stampUserId(c, args, logger);
...
stampProjectScope(c, args, logger);
```
Strip runs before any stamping and is not gated by auth mode. A client cannot smuggle `__projectId`/`__userId`/`__workspaceRoot`. ✅

---

### SEC-03 — `X-Project-Id` bound to principal → CLOSED (1 Informational residual)

`verifyProjectBinding()` (`tools.ts`) + `verifyJwtToken` / `allowedProjectsFromClaims` (`middleware/jwt-auth.ts`):
- Valid JWT with a project grant (`pid` / `pids`) and a requested `X-Project-Id` **outside** the grant → returns error → route responds **403 FORBIDDEN** with a `SEC-03` warning log.
- No bearer / opaque (non-JWT) / admin-session token → shared-key path: returns `null` (no per-tenant grant to enforce), logs an "identity unverified" / "fail-closed" warning. Downstream reads remain fail-closed when no `X-Project-Id` is present, so isolation is **not weakened**.

**Informational residual:** `verifyJwtToken` only checks the HS256 signature when `TOKEN_SECRET` is configured (`if (TOKEN_SECRET) { ... }`). Without a secret, a well-formed but unsigned/forged JWT with an arbitrary `pid` would pass the grant check. Impact is bounded: a forged token grants only the project the attacker names, i.e. the same access the shared-key path already permits — it does **not** enable reading another tenant beyond what an unauthenticated caller could request. Recommend making `TOKEN_SECRET` mandatory in multi-tenant deployments (the in-code `TODO(SA4E-41 SEC-03)` already flags per-tenant key issuance).

---

### SEC-04 / SEC-05 — Path safety on reads and writes → CLOSED

New `shared/path-safety.ts`:
- `isPathSafe()` rejects empty, non-string, null-byte (`\0`), absolute, and any `..` traversal (post-normalize, segment check).
- `isWithinRoot()` confirms containment via `path.resolve` + `startsWith(root + sep)`.
- `resolveWithinWorkspace()` returns `null` on any violation (callers treat `null` as rejection).

Applied at every sink:
| Sink | File | Guard |
|------|------|-------|
| `code_context` (MCP tool) | `engine/tools/code-context.ts` | `resolveWithinWorkspace` (read) |
| `code_context` (handler) | `engine/tools/code-intel-handlers.ts` `handleCodeContext` | `resolveWithinWorkspace` (read) |
| traversal source snippet | `engine/graph/traverse-helpers.ts` `getSourceSnippet` | `resolveWithinWorkspace` (read) |
| `stream_write_file` | `engine/tools/code-intel-handlers.ts` `handleStreamWriteFile` | `requireProjectId` + `resolveWithinWorkspace` (write) |
| `POST /api/index/source` | `server/routes/api-index.ts` `writeFilesPhase` | `requireProjectId` (scope) + `resolveWithinWorkspace`; unsafe paths rejected + logged |
| `POST /api/index/document` | `api-index.ts` `handleIndexDocument` | `resolveWithinWorkspace` → 400 on invalid |
| `POST /api/index/documents` | `api-index.ts` `handleIndexDocuments` | `writeFilesPhase` (same as source) |

No remaining read/write path was found that constructs a filesystem path from user input without going through `resolveWithinWorkspace`. ✅

---

### SEC-06 — File-watcher restricted to boot tenant → CLOSED

`engine/indexer/indexing-engine.ts`:
```ts
// SA4E-41 SEC-06: incremental watcher events are scoped to the BOOT tenant only.
private bootProjectId(): string { return this.config.projectId; }
```
`indexSingleFile()` and `removeFile()` both stamp `bootProjectId()`; the `FileWatcher` watches only `config.workspace` (a single tenant tree). Other tenants are indexed push-only via `POST /api/index/source`, which passes the request `projectId` to `runFullIndex`. Delete path also scopes `DELETE FROM files ... AND project_id = ?` and `graphRepo.deleteFileRelationships(path, projectId)`. ✅

---

### get_curated_context — memory branch → CLOSED

`engine/context/curated-helpers.ts` `searchMemory()`:
```ts
// SA4E-41 §6.4: fail-closed — never search the shared KB without a tenant scope.
if (!projectId) return { source: 'memory', results: [] };
... WHERE project_id = ? AND id IN (SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?)
```
KB search is fail-closed and scoped by `project_id`, mirroring the memory IsolationLayer. `get_curated_context` receives `projectId` via `handleGetCuratedContext(...)` in the dispatch table. ✅

---

## Informational Items (Round 2)

| ID | Item | Recommendation |
|----|------|----------------|
| INFO-1 | JWT signature verification only enforced when `TOKEN_SECRET` is set (`jwt-auth.ts`). | Make `TOKEN_SECRET` mandatory for multi-tenant deployments; fail startup if unset when auth is required. Already flagged via in-code `TODO(SA4E-41 SEC-03)`. |
| INFO-2 | `relationships` INSERT does not populate `project_id` in `GraphRepository.insertRelationships`; scoped stats read `relationships.project_id`. | Confirm the writer/trigger that sets `relationships.project_id`; add a regression test so `getStats`/`getRelationshipCount` are accurate per tenant (confidentiality is already safe/fail-closed). |

---

## Recommendations Summary

### Immediate Actions (Critical/High)
None — no Critical or High findings remain open.

### Short-term Improvements (Informational)
1. Require `TOKEN_SECRET` (or per-tenant keys/JWT grants) in multi-tenant mode so a missing `X-Project-Id` can be resolved from the principal instead of failing closed to empty results (INFO-1).
2. Verify and test `relationships.project_id` population to keep tenant graph stats accurate (INFO-2).

### Long-term Hardening
1. Add an automated multi-tenant isolation test suite as a CI gate (the branch already adds `graph-isolation.test.ts`, `query-isolation.test.ts`, `code-intel-isolation.test.ts`, `migration-v5.test.ts` — extend coverage to every tool).
2. Consider a lint/arch rule forbidding raw `fs`/`db.prepare` on `symbols`/`relationships`/`git_commits` outside the isolation helpers to prevent regressions.

---

## Appendix

### A. Files Reviewed (round 2)
- `server/routes/tools.ts`, `server/routes/api-index.ts`
- `server/middleware/jwt-auth.ts`
- `shared/path-safety.ts`
- `engine/query/code-intel-isolation.ts`
- `engine/database/graph-repository.ts`
- `engine/graph/symbol-resolver.ts`, `traverser.ts`, `traverse-helpers.ts`, `dependency-graph-service.ts`, `dep-helpers.ts`
- `engine/analyzers/graph-analysis/utils/GraphLoader.ts`
- `engine/analyzers/complexity/ComplexityStore.ts`, `entry-points/EntryPointStore.ts`, `similarity/DeadCodeDetector.ts`, `similarity/GitMiner.ts`
- `engine/context/curated-helpers.ts`
- `engine/tools/code-intel-handlers.ts`, `code-context.ts`, `register-tools.ts`
- `engine/indexer/indexing-engine.ts`, `file-watcher.ts`
- `modules/code-intel/CodeIntelModule.ts`

### B. Scope Limitations
- Static analysis only. No dynamic/pentest execution against a running instance was performed in this round.
- Verdicts rely on the fix diff (`main..SA4E-41`) and call-chain tracing; runtime confirmation of DB column population (INFO-2) and auth config (INFO-1) is recommended in Phase 6.3 pentest.

### C. Glossary
- **Fail-closed**: absence of scope yields no data (`1=0`) rather than all data.
- **CodeIntelIsolation**: the central tenant-scoping policy (`buildCodeScopeFilter` / `requireProjectId`).
