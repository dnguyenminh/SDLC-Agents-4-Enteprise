# 🔒 Security Assessment Report (Phase 5.7 — Code Audit)

## SDLC Agents 4 Enterprise — SA4E-380: Content Proxy for Child MCP Tools (incl. OI-14/OI-15 Artifact Cleanup)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-380 |
| Document | Security Assessment (Phase 5.7 — OWASP code audit of the implemented ticket) |
| Scope audited | SA4E-380 source as present in the current workspace (= the running build: backend restarted 2026-10-24, extension wrapper live since 2026-10-24T00:44:54Z, package v1.55.5 carrying the v1.55.3 SA4E-380 changeset + the OI-14/OI-15 working-tree changeset): `backend/src/modules/orchestration/content-proxy/` (all files + tests), `backend/src/modules/orchestration/artifact-cleanup/` (4 files + tests — NEW), `backend/src/config/ContentProxy.ts`, `backend/src/modules/orchestration/McpClientManager.ts`, `backend/src/modules/orchestration/OrchestrationModule.ts`, `extension/src/services/Base64ProxyService/`, `extension/src/services/WrapperServer/request-handler.ts`, plus adjacent trust-boundary wiring (`HttpRouteRegistrar.ts`, `McpConfigRoutes.ts`, `request-logger.ts`, `Base64ProxyService.ts`, `PathResolver`/fs-guards as referenced) |
| Review type | **Static code audit** against the Phase 3.7 review (SECURITY-REVIEW.md, 11 findings, F-01 High + 3 binding approval conditions). Read-only: no code was modified. |
| Assessor | Security Agent |
| Date | 2026-10-24 |
| Version | 1.0 |
| Verdict | **APPROVED WITH FINDINGS** (see §2 and §10) |

---

## 1. Executive Summary

The SA4E-380 implementation **honours all three binding approval conditions** imposed by the Phase 3.7 design review. The single High finding of 3.7 — F-01, the unconfined backend local-path artifact read that would have become an arbitrary **read + delete** primitive once OI-14 shipped — is **closed in code**: `readLocalFile` now refuses any path whose real location (symlinks resolved) falls outside the dedicated `ARTIFACT_OUTPUT_ROOTS`, before any filesystem access, and the delete-after-inline (OI-14) and the periodic sweep (OI-15) shipped **in the same changeset** with that gate. The sweep scans only the dedicated artifact roots — never the raw OS temp directory, never the agent workspace. F-06 (delete-by-path TOCTOU) was implemented exactly as the 3.7 remediation specified (stat-identity re-verification: ino/size/mtimeMs before unlink). The F-02 SSRF hardening deferral remains valid: the only configured child is `markdown-exporter-mcp-local` (stdio, same host), and the deferral condition — harden before any remote (streamable-HTTP) child is enabled — stays binding.

The audit swept OWASP A01–A10 at implementation level. The F-01 confinement was re-attacked in analysis (`..` traversal, symlinks/junctions, Windows case-insensitivity, UNC, drive-relative and `\\?\` verbatim paths, `file:` URIs): **all classes fail closed** because the check canonicalises with `fs.realpathSync` *before* containment and compares with `path.relative` (case-insensitive on win32, cross-device → absolute → rejected). No new Critical or High issue was introduced by this ticket's diff. Fourteen findings are recorded: **1 Critical (pre-existing platform surface, first reported here, outside the SA4E-380 diff), 0 High, 2 Medium (carried residuals from 3.7), 6 Low, 5 Informational**.

The Critical finding (SA-01) is a **platform escalation, not an SA4E-380 blocker**: the child-server configuration API (`POST /api/mcp-servers`) has **no authentication middleware**, and the backend defaults to binding `0.0.0.0` — live-confirmed on the running instance (`0.0.0.0:48721` LISTEN). Any host that can reach the backend port can register a child server whose stdio `command` the backend then **spawns as a process** — an unauthenticated code-execution path that also lets any LAN peer manufacture the "trusted child" on which SA4E-380's S-4/F-02 residual-risk acceptance rests. SA4E-380 did not introduce or touch this endpoint (pre-existing SA4E-92/223 surface, unchanged in this ticket's diff), but it must be routed to the platform security backlog immediately, and the SA4E-380 Deployment Guide must bind remediation (loopback bind and/or auth gate on `/api/mcp-servers`) before any deployment beyond the single-operator dev machine.

**Overall Risk Rating: MEDIUM** for the SA4E-380 changeset itself (strong confinement verified, residuals gated on child trust). **Platform-level: CRITICAL exposure open** via SA-01 until remediated — orthogonal to this ticket's verdict.

### Severity Distribution (this audit)

| Severity | Count | Notes |
|----------|-------|-------|
| 🔴 Critical | 1 | SA-01 — **pre-existing platform** (`/api/mcp-servers` unauth + `0.0.0.0`), first reported here; not introduced by SA4E-380 |
| 🟠 High | 0 | F-01 (3.7 High) verified **closed** |
| 🟡 Medium | 2 | SA-02 (F-02 SSRF, deferred w/ binding condition), SA-03 (F-03 aggregate cap + rate limiting) |
| 🔵 Low | 6 | SA-04…SA-09 (incl. 2 new: SA-05 log path leak, SA-06 data-URI base64 leniency) |
| ℹ️ Informational | 5 | SA-10…SA-14 |

---

## 2. Verification Evidence Base (fresh-instance rule)

All evidence comes from the **current workspace source — the code the restarted build runs** — plus live checks against the running instance (per the UG-evidence policy: no wireframes, no stale captures).

| Evidence | Detail |
|----------|--------|
| Build provenance | Commit `7709f74` "v1.55.3: SA4E-380 Content Proxy… incl. cleanup design OI-14/OI-15 + F-01 binding" + the Phase-5 working-tree changeset implementing OI-14/F-01/OI-15 (`artifact-cleanup/` 4 files + tests untracked-new; `ContentProxy.ts`, `artifact-source.ts`, `McpClientManager.ts`, `OrchestrationModule.ts` modified). Backend live-restarted 2026-10-24 (uptime ≈ 8.7 h at audit time); wrapper live since 00:44:54Z. |
| Feature presence (live) | `GET /health` → healthy, orchestration `ready`, 95 tools loaded. `POST /api/tools/find {"query":"export docx"}` → `export_docx` with `x-content-param` (4 hits) and `x-output-base64` (4 hits) — the SA4E-380 schema markers are **live in the running build**. Wrapper MCP `initialize` on 127.0.0.1:9183 → OK. |
| Focused tests (re-run 2026-10-24) | `vitest run` content-proxy (3 suites) + artifact-cleanup (1 suite) + `McpClientManager.content-proxy.test.ts` → **38/38 pass** (matches STATUS.json implementation record). |
| Live cleanup evidence (RUN-LOG #24) | E-8: wrapper export → DOCX 14,243 B, child job dir emptied after inline (OI-14 live). E-9: one sweep tick reaped **485 orphan files + all job dirs → 0/0** from the child artifacts home (OI-15 live). |
| Socket state (live) | Backend **`0.0.0.0:48721` LISTEN** (PID 37188) — evidence for SA-01. Wrapper `127.0.0.1:9183` LISTEN — loopback invariant holds. |

---

## 3. Findings Summary

| ID | Severity | OWASP 2021 | Title | Location | Origin |
|----|----------|------------|-------|----------|--------|
| SA-01 | 🔴 Critical | A01 · A05 · A07 | Unauthenticated child-server config API on a 0.0.0.0-bound backend → unauthenticated registration of a stdio child whose `command` the backend spawns; manufactures the "trusted child" the content proxy trusts | `McpConfigRoutes.ts:19-130`; `HttpRouteRegistrar.ts:74-103` (no gate covers `/api/mcp-servers`); `config/index.ts:109` (`0.0.0.0` default) | **Pre-existing platform (SA4E-92/223) — first reported here**; NOT in the SA4E-380 diff |
| SA-02 | 🟡 Medium | A10 | SSRF via child-supplied artifact URLs — no allow-list, `redirect: 'follow'` (F-02 carried) | `artifact-source.ts:169-180` | 3.7 F-02, accepted residual; defer valid (see §6.3) |
| SA-03 | 🟡 Medium | A04 · A05 | No aggregate multi-artifact byte cap and no rate limiting on `/api/tools/*` / `/mcp/tools/call` (F-03 carried) | `result-adapter.ts:49-65`; `HttpRouteRegistrar.ts:82,102` | 3.7 F-03, open |
| SA-04 | 🔵 Low | A04 | No decoded-size cap on `content_base64` at the backend (bounded by the 100 MB body limit) — F-04/OI-09 carried | `invocation-adapter.ts:27-32,49-53` | 3.7 F-04, open |
| SA-05 | 🔵 Low | A09 | Cleanup failure paths log raw `err` objects — real Node fs errors embed full host paths (`err.message`/`err.path`), violating the I-3 basename-only invariant; tests use synthetic path-free errors so the leak is untested | `CleanupSweep.ts:106,168`; `delete-artifact.ts:35` | **New (5.7)** |
| SA-06 | 🔵 Low | A02 · A04 | `decodeDataUri` skips the strict base64 alphabet/padding validation applied everywhere else — lenient `Buffer.from(base64)` can inline corrupted data-URI payloads as garbage bytes | `artifact-source.ts:182-193` | **New (5.7)** |
| SA-07 | 🔵 Low | A02 | `NON_CONTENT_PARAM` regex still misses `apikey`, `authorization`, `cookie`, `session`, `credential` (F-07 carried) | `config/ContentProxy.ts:38-39` | 3.7 F-07, open |
| SA-08 | 🔵 Low | A05 | `ARTIFACT_OUTPUT_ROOTS` env override is unvalidated — an operator typo/misconfiguration (e.g. a drive root or the workspace itself) silently turns the sweep into a broad deleter and widens read confinement | `config/ContentProxy.ts:80-92`; `artifact-roots.ts:21-32` | **New (5.7)** (defense-in-depth) |
| SA-09 | 🔵 Low | A08 | Partial descriptor resolution returns success-with-subset; the child's declared count is not carried — implemented per FSD OI-07/EF-6, but **TDD §9.1 wording claims ARTIFACT_FETCH_FAILED**, an undocumented code-vs-TDD inconsistency | `result-adapter.ts:39-42`; `TDD.md:323` vs `FSD.md:1660` | Doc consistency + OI-07 improvement |
| SA-10 | ℹ️ Info | A05 | Transport baseline: wrapper loopback-bound ✅ but backend auth env-gated; wrapper↔backend hop is plaintext loopback HTTP (F-08 carried — DPG must document) | `wrapper-server.ts:107`; `HttpRouteRegistrar.ts:84-102` | 3.7 F-08, accepted |
| SA-11 | ℹ️ Info | A02 | Plaintext Buffers/base64 in memory for one call, no zeroization (F-09 carried — "never logged" claim **verified** at the HTTP layer) | `request-logger.ts:9-26` (clean); `result-adapter.ts:79,97` | 3.7 F-09, accepted |
| SA-12 | ℹ️ Info | A08 | Renderer/child parse surfaces (draw.io XML, HTML export, headless Chrome) remain outside the proxy boundary — proxy is format-blind by design (F-10 carried) | child `markdown-exporter`, renderer stack | 3.7 F-10, accepted |
| SA-13 | ℹ️ Info | A05 | `safeName` still permits Windows reserved device names (`CON`, `NUL`…), ADS colon names, trailing dots/spaces (F-11 carried — write containment is name-independent) | `artifact-name.ts:9-14`; `output-proxy.ts:153-157` | 3.7 F-11, accepted, optional |
| SA-14 | ℹ️ Info | A05 | Hygiene: `isArtifactFileName` is a dead export (the sweep deliberately no longer matches by name); wrapper `initialize` advertises a stale hardcoded `serverInfo.version "1.11.0"` (vs package 1.55.5) | `artifact-roots.ts:35-38`; `request-handler.ts:171` | **New (5.7)**, optional |

**Ticket-introduced findings (SA4E-380 diff only): 0 Critical / 0 High.** SA-05/SA-06/SA-08/SA-09/SA-14 are implementation-level refinements in or adjacent to the new code; none changes the security posture enough to withhold approval.

---

## 4. Approval-Conditions Verification (Phase 3.7 binding conditions)

### 4.1 Condition 1 — OI-14 ships together with the F-01 confinement → **PASS** ✅

The same working-tree changeset contains **both** halves, and the confinement gate precedes every filesystem access on every local read path:

- `artifact-source.ts:127` — `if (!isWithinArtifactRoots(filePath)) return null;` runs **before** `lstatSync`/`readFileSync`; out-of-root → never read, never deleted, caller gets `ARTIFACT_FETCH_FAILED` (fail-loud, no host-layout disclosure).
- `artifact-roots.ts:21-32` — `isWithinArtifactRoots` canonicalises the candidate with `fs.realpathSync` (resolves `..`, symlinks, junctions) and compares against the roots themselves realpathed (`resolveRoot`, :40-46), using `isPathWithinRoot` (`config/ContentProxy.ts:95-98`, `path.relative`-based).
- `file:` URIs inherit the gate (`readLocalFileUri` → `readLocalFile`, artifact-source.ts:148-154); non-local retrieval paths (resource/URL/data-URI/inline blob) never trigger deletion (test UT-46 ✅).
- Roots are shared between OI-14 and OI-15 (single source: `artifactOutputRoots()`), exactly as the 3.7 remediation required.
- Test evidence: `content-proxy.cleanup.test.ts` — out-of-root path → never read/never deleted + `ARTIFACT_FETCH_FAILED` + no path leak (:143-165); read-after-delete verified via stat→ENOENT (UT-44); failed read never deletes (UT-45 step 2). Live E-8 (RUN-LOG #24). **38/38 focused tests pass on re-run.**

### 4.2 Condition 2 — OI-15 sweep scans only the dedicated artifact roots → **PASS** ✅

- `CleanupSweep.ts:54` — `this.roots = deps.roots ?? artifactOutputRoots()`; the configured roots are **only** the dedicated sinks: `%TEMP%\sa4e-artifacts`, `<workspace>/tmp/artifacts`, and the markdown-exporter child's own artifact home (`config/ContentProxy.ts:63-77`). The raw OS temp root and the agent workspace are never scanned (explicit test: "never scans outside the configured roots", `CleanupSweep.test.ts:89-99`).
- Sweep safety envelope verified in code: symlink files/dirs excluded (`isCandidate` :174-176, dir check :111), TTL floor before any delete (:159-163), per-run `maxRunMs` hard bound checked per entry (:110, :134), unreadable roots skipped not fatal (:102-108), timer `unref()`'d and lifecycle-owned by `OrchestrationModule` (:60-62, :68-70).
- Name prefixes are deliberately **not** a criterion anymore — inside dedicated roots every regular non-symlink file older than TTL is an orphan. This resolves 3.7 F-05 (foreign-file deletion in shared temp roots) by construction: the roots are dedicated, so no unrelated user files live there. Live E-9: one tick reaped 485 orphans + all job dirs → 0/0.

### 4.3 Condition 3 — F-02 SSRF hardening deferred only while no remote child is enabled → **PASS (deferral valid today, condition remains binding)** ⚠️

- `fetchHttp` (`artifact-source.ts:169-180`) is unchanged from 3.7: 30 s abort + declared/actual size caps, but no URL allow-list and `redirect: 'follow'`. Accepted residual per TDD §7 S-4.
- Only one child is configured: `markdown-exporter-mcp-local` (stdio, same host as the backend — STATUS.json blocker LIMITATION-REMOTE-PATH-ONLY). **No remote (streamable-HTTP) child is enabled**, so the deferral condition holds today.
- The binding remains: F-02 hardening (allow-list + private-range block + per-hop redirect revalidation) **MUST land before any remote child is enabled**. ⚠️ SA-01 escalates the urgency: an unauthenticated caller can currently *register* such a remote child at runtime via `POST /api/mcp-servers` — the deferral must therefore be enforced by remediation of SA-01, not by convention alone.

---

## 5. OWASP Top 10 (2021) — Audit Results

### A01:2021 — Broken Access Control → **F-01 CLOSED; one pre-existing platform finding (SA-01)**

**F-01 confinement re-attacked at implementation level** (`readLocalFile` + `isWithinArtifactRoots` + `isPathWithinRoot`):

| Attack class | Result | Why |
|---|---|---|
| `..` traversal | ❌ fails closed | `fs.realpathSync(candidate)` resolves `..` *before* the containment compare (artifact-roots.ts:27) |
| Symlink / junction inside a root pointing out | ❌ fails closed twice | realpath resolves the target → outside roots → rejected; then `lstatSync` + `isSymbolicLink()` re-refuses even in-root symlinks (artifact-source.ts:128-129) |
| Windows case-insensitive spoofing (`C:\TEMP\SA4E-ARTIFACTS\` vs configured root) | ❌ fails closed | `path.win32.relative` lowercases both sides for the common-prefix computation → case cannot manufacture containment, and cannot manufacture escape either |
| UNC (`\\server\share\…`) | ❌ fails closed | different device → `path.relative` returns an absolute path → `path.isAbsolute(relative)` → rejected (`isPathWithinRoot`, ContentProxy.ts:95-98) |
| Drive-relative (`C:file`, `\dir`) | ❌ fails closed | `readLocation` normalises via `path.resolve(location)` before the gate (artifact-source.ts:100); resolved path must still be inside a root |
| `\\?\` verbatim paths | ❌ fails closed | either realpath yields the true final path (→ containment applied honestly) or the verbatim device fails the relative compare (→ rejected); false-negatives only, never false-accepts |
| `file:` URI variants | ❌ fails closed | `fileURLToPath` → same `readLocalFile` gate (artifact-source.ts:148-154) |
| Sweep reaching outside roots | ❌ impossible by construction | roots fixed to `artifactOutputRoots()`; no workspace/OS-temp scan; one-level job-dir nesting only |

The order of operations is the correct canonicalize-then-verify shape; the extension write side retains its independent confinement (`resolveWorkspacePath` + parent-realpath `checkSymlinkGuard` on every write, output-proxy.ts:59-65), so containment never depends on the child-supplied name.

**SA-01 (Critical, pre-existing)** — see §7. `/api/mcp-servers` (GET/POST/PUT/DELETE + `/reconnect`) mounts with **no auth middleware** (the middleware stack gates `/api/index/*`, `/api/tags/*`, `/mcp/*`, `/api/v1/*`, `/api/admin/*` — `McpConfigRoutes.ts` matches none), while the backend's default bind is `0.0.0.0` (`config/index.ts:109`; live-confirmed LISTEN). `POST` immediately calls `clientManager.connectServer(name, config)` (McpConfigRoutes.ts:62) → stdio transport **spawns `config.command`**. Impact: unauthenticated arbitrary process execution on the backend host for anyone who can reach port 48721, plus the ability to register the "trusted child" that F-02/S-4 residual-risk acceptance assumes is operator-controlled. Not introduced by SA4E-380 (file untouched by this ticket's diff) — but it is the single most urgent item this audit surfaces.

### A02:2021 — Cryptographic Failures → **Adequate; 1 Low new (SA-06), 1 Low carried (SA-07)**

- **Strict base64, wrapper input**: `decodeBase64Utf8` (invocation-adapter.ts:49-53) — whitespace compacted, length % 4, alphabet `^[A-Za-z0-9+/]+={0,2}$`, UTF-8 decode; invalid → `Invalid content_base64 payload.` and the child is never invoked (test ✅). Mirrors the extension's pre-read cap before any decode (Base64ProxyService.ts:114-125).
- **Strict base64, inline artifacts**: `fromBase64` (artifact-source.ts:110-116) applies the identical validation plus the ≤ 25 MB buffer bound.
- **SA-06 (Low, new)**: `decodeDataUri` (artifact-source.ts:182-193) decodes `;base64` data-URI payloads with bare `Buffer.from(match[3], 'base64')` — Node's lenient decoder ignores invalid characters, so a corrupted child payload can silently become garbage bytes and be written into the workspace (spirit of S-7, on the one retrieval path without the strict check). Same trust domain as an honest child sending valid-base64 garbage, so severity is Low — fix is a one-line reuse of the `fromBase64` validation.
- **SA-07 (Low, carried)**: `NON_CONTENT_PARAM` (config/ContentProxy.ts:38-39) still lacks `apikey`, `authorization`, `cookie`, `session`, `credential`. Narrow exploitability unchanged (single-required-string fallback of BR-03 only; none of the 9 fixed aliases is affected).
- **SA-11 (Info, carried)**: plaintext Buffers/base64 for one call; no zeroization. The 3.7-recorded check — "payloads never logged" — is **verified**: the HTTP request logger records method/path/status/duration only (request-logger.ts:9-26), and `McpClientManager` logs toolName/serverName/wrapperMode only (:97).

### A03:2021 — Injection → **No issues in the audited diff ✅ (residual F-11 note)**

- **Child JSON parsing**: `parseJsonText` (result-adapter.ts:122-130) JSON-parses, accepts plain objects only, no reviver; `shapeResult` and the adapter copies use object-spread (CreateDataProperty semantics) — a `__proto__`-keyed child document cannot pollute prototypes. Verified unchanged from the 3.7 conclusion.
- **Path/name injection**: `safeName` (artifact-name.ts:9-14) is basename-only with `?`/`#` fragment stripping; traversal cannot survive. Residual F-11 (SA-13): Windows reserved device names (`CON`, `PRN`, `NUL`, `COM1`…), ADS colon names (`file.txt:stream`), trailing dots/spaces — all workspace-confined, loud-failing, containment name-independent. Optional hardening only.
- **Command injection**: none — the content-proxy and artifact-cleanup modules import only `fs`/`path`/`url`/`os` + pino types; no `child_process` anywhere in the audited diff.
- **XXE/template/LDAP**: proxy is format-blind by design (P-1/P-6); parse surfaces live in the child/renderer (SA-12).

### A04:2021 — Insecure Design → **F-06 implemented as specified; residuals bounded (SA-03/SA-04/SA-09)**

- **F-06 TOCTOU (the 3.7 remediation "đủ không?" question)**: `deleteArtifactAfterRead` (delete-artifact.ts:25-37) re-stats and unlinks **only when `ino` + `size` + `mtimeMs` all match the pre-read snapshot**; ENOENT = success; mismatch → warn (basename) + skip; any failure never fails the delivered bytes. A microseconds-wide swap window between the identity check and `unlinkSync` remains (as it does for any path-based delete on Windows) — local-attacker-only, confined to artifact roots, non-security files → **adequate for the threat model**; handle-based delete (fd + fstat) remains optional future hardening.
- **Sweep vs in-flight read race** (asked in the ticket): all interleavings fail safe — (a) sweep deletes after the request's read → request's identity lstat gets ENOENT → treated as success (delete-artifact.ts:34); (b) sweep deletes between lstat and readFileSync → ENOENT → `null` → loud `ARTIFACT_FETCH_FAILED`, no delete; (c) file replaced concurrently → identity mismatch → cleanup skipped. The sweep's own unlink can only ever remove a dirent it readdir'd as a regular file; a mid-scan symlink swap unlinks the link, not the target.
- **SA-03 (Medium, carried)**: `collectFiles` still has no aggregate byte cap across `artifacts[]` (N × 25 MB Buffers + base64 strings in memory), and `rateLimiter` still covers only `/api/admin/*` and `/api/v1/pega/*` (HttpRouteRegistrar.ts:82,102) — not `/api/tools/execute` / `/mcp/tools/call`.
- **SA-04 (Low, carried)**: no decoded-size cap on `content_base64` at the backend (OI-09; bounded by the 100 MB body limit, HttpRouteRegistrar.ts:79).
- **SA-09 (Low)**: partial descriptor resolution (2 declared, 1 resolved) returns success-with-subset — implemented per FSD OI-07/EF-6, but TDD §9.1 (:323) states the call "still ends in ARTIFACT_FETCH_FAILED", which the code does not do when ≥ 1 artifact resolves. Documentation fix + consider `expected_total` per OI-07.

### A05:2021 — Security Misconfiguration → **Config parsing fail-safe ✅; SA-08 new; SA-01/SA-10/SA-14 noted**

- `loadArtifactCleanupConfig` (cleanup-config.ts:31-48): `intEnv` uses `parseInt` + `Number.isFinite(parsed) && parsed > 0` — garbage → NaN → **fallback to defaults** (no NaN propagation, no `intervalMs=0` hot loop, no `ttlMs=0` fresh-file reaper). `boolEnv`: only `1`/`true` enables; anything else (including garbage) **disables** the sweep — fail-safe for a destructive background task. Defaults: enabled, 5 min interval, 10 min TTL, 30 s maxRun — safe ✅.
- **SA-08 (Low, new)**: `ARTIFACT_OUTPUT_ROOTS` env override (`parseArtifactRootsEnv`, ContentProxy.ts:80-92) accepts any paths without sanity checks — an operator setting `C:\\` or the workspace root would widen both the sweep's delete scope and `readLocalFile`'s confinement. Operator-trust env access already implies host control, so this is defense-in-depth: refuse roots that equal/contain the workspace root, a filesystem root, or the home directory; log the effective roots at startup (basename-free is fine — they are config, not child data).
- **SA-01 / SA-10**: backend `0.0.0.0` default bind + unauth config API (Critical, §7); env-gated `jwtAuth`/`apiKeyAuth` and plaintext loopback wrapper↔backend hop (Info, DPG must document).
- **SA-14 (Info)**: wrapper `initialize` advertises hardcoded `serverInfo.version "1.11.0"` (request-handler.ts:171) — stale version disclosure inconsistent with the shipped 1.55.x; plus dead `isArtifactFileName` export.

### A06:2021 — Vulnerable and Outdated Components → **PASS ✅ (no new dependencies)**

The SA4E-380 changeset introduces **zero new npm dependencies** — verified from imports: the content-proxy and artifact-cleanup modules use only `node:fs`/`node:path`/`node:url`/`node:os` and the existing `pino`/`@modelcontextprotocol/sdk`; `backend/package.json` dependency list is unchanged by this ticket's diff. Platform-wide CVE screening of the full dependency tree remains a DevOps/platform concern (out of this ticket's scope).

### A07:2021 — Identification and Authentication Failures → **Wrapper posture verified; backend gates env-gated (SA-10); SA-01 Critical**

- Wrapper binds **127.0.0.1 only** (wrapper-server.ts:107 — live-confirmed LISTEN 127.0.0.1:9183). SA4E-358 origin gate is the **first statement** of the request handler (request-handler.ts:41) — no header is set before it; CORS echoes only allow-listed origins, never `*` (:44-49); deny is 403-on-clean-response with sanitised log text (:65-72).
- Wrapper→backend rides authenticated platform routes: `/api/tools/*` and `/api/index/*` behind `jwtAuth` (kb-api.ts:17,125), `/mcp/*` behind `apiKeyAuth`, `/api/v1/*` behind `jwtAuthStrict` — all env-gated (SA-10 residual, DPG statement required). No new endpoint, no new secret introduced by this ticket ✅.
- **SA-01**: `/api/mcp-servers` is the exception — see §7. Any loopback process (and any LAN peer, given `0.0.0.0`) can register/replace child servers unauthenticated.

### A08:2021 — Software and Data Integrity Failures → **Core promises hold ✅ (SA-09/SA-12 noted)**

- **Delete only after materialisation** (ticket question): `readLocalFile` calls `cleanupAfterRead` **after** `readFileSync` has returned and the byte-length was re-verified (artifact-source.ts:130-133) — a failed read never deletes; a failed cleanup never fails the read (cleanupAfterRead swallows, :140-146); non-local retrieval never deletes (UT-46 ✅). Residual (by design, accepted): a crash in the tiny window between unlink and response delivery loses the artifact while the bytes never reached the caller — the §9.1 best-effort contract acknowledges this; the sweep is the inverse safety net.
- **Multi-artifact count verification**: extension-side `written.length !== outputs.length` → `PROXY_WRITE_FAILED: only X/Y` (output-proxy.ts:74-79); zero writes → zero-variant (:69-72); backend-side zero-resolution → `ARTIFACT_FETCH_FAILED` (result-adapter.ts:39-42). The dual fail-loud guard from 3.7 §8.1 is intact.
- **SA-09**: subset-success on partial resolution (OI-07) — declared count not carried; see A04 above.
- **SA-12 (Info)**: content-level parse integrity (draw.io XML/XXE, export HTML/stored-XSS, DOCX converters) remains in the child/renderer trust domain — the proxy correctly guards paths, sizes, names only.

### A09:2021 — Security Logging and Monitoring Failures → **1 new Low (SA-05); otherwise clean ✅**

- **No payload logging — verified**: HTTP request logger = method/path/status/duration (request-logger.ts:9-26); proxy execution logs = toolName/serverName/wrapperMode (McpClientManager.ts:97); log-forging neutralised by `sanitizeLogText` on all echoed paths/messages.
- **SA-05 (Low, new)**: the cleanup failure paths log the **raw error object** — `{ artifact: entry.name, err }` (CleanupSweep.ts:168; also :106 for unreadable roots) and `{ artifact: path.basename(filePath), err }` (delete-artifact.ts:35). Real Node fs errors (`EPERM`/`EBUSY`/`EACCES` on unlink) embed the **full host path** in `err.message` and `err.path` → the I-3 "basenames only" invariant leaks host paths into logs exactly in failure scenarios. The tests (UT-45, sweep-failure case) throw synthetic errors with path-free messages, so the suites assert basename-only while production errors would not be basename-only. Fix: log `err.code` and/or `sanitizeLogText(err.message)` instead of the raw object.
- **Audit trail for deletes**: successful OI-14 deletes are silent by design (contract: only failures log); the sweep logs one aggregate summary per tick (`{ removed, failed, skipped, durationMs }`) plus per-file failures. For a single-operator dev tool this is acceptable; if these artifact roots ever become shared, add a per-delete debug line (basename only).

### A10:2021 — Server-Side Request Forgery → **SA-02 carried (deferred, valid — see §4.3)**

`fetchHttp` unchanged: 30 s `AbortSignal.timeout`, declared content-length pre-check + actual-size check, `redirect: 'follow'`, no host allow-list, no private-range block. Backend can therefore be directed (by a child descriptor) at internal/link-local targets; response bytes ≤ 25 MB are inlined into the workspace. Accepted residual (TDD S-4) while all children are operator-configured stdio processes on the same host. **Binding**: allow-list + private/link-local/metadata-range block + per-hop redirect revalidation must precede enabling any remote child — and SA-01 means "enabling a remote child" must itself be an authenticated, operator-only action first.

---

## 6. 3.7 Findings Disposition Matrix (F-01…F-11 re-verified at code level)

| 3.7 ID | 3.7 Severity | 5.7 disposition | Evidence |
|--------|--------------|-----------------|----------|
| F-01 Unconfined local read → read+delete | 🟠 High (binding) | **CLOSED** | `artifact-source.ts:127` + `artifact-roots.ts:21-32`; dedicated roots in `config/ContentProxy.ts:63-92`; tests UT-44/45/46 + dedicated F-01 case; live E-8 |
| F-02 SSRF via artifact URLs | 🟡 Medium | **OPEN — deferred, valid** (SA-02) | `fetchHttp` unchanged; stdio-only child; binding condition restated + escalated via SA-01 |
| F-03 Aggregate cap + rate limiting | 🟡 Medium | **OPEN** (SA-03) | `collectFiles` unbounded; rateLimiter paths unchanged |
| F-04 Decoded-size cap on `content_base64` | 🔵 Low | **OPEN** (SA-04, OI-09) | `adaptInvocation` unchanged |
| F-05 Sweep deletes unrelated files in shared temp roots | 🔵 Low | **CLOSED by design** | Dedicated-root sweep, name-agnostic inside dedicated sinks; never raw OS temp / workspace (test ✅) |
| F-06 Delete-by-path TOCTOU | 🔵 Low | **CLOSED** | `deleteArtifactAfterRead` identity check (ino/size/mtimeMs), ENOENT=success, mismatch→skip; microsecond residual accepted |
| F-07 `NON_CONTENT_PARAM` regex gaps | 🔵 Low | **OPEN** (SA-07) | Regex unchanged (ContentProxy.ts:38-39) |
| F-08 Transport baseline (env-gated auth, plaintext hop) | ℹ️ Info | **OPEN — accepted** (SA-10) | DPG must document; loopback bind re-verified live |
| F-09 Plaintext buffers in memory | ℹ️ Info | **ACCEPTED — claim verified** (SA-11) | Payloads never logged (request-logger/McpClientManager verified) |
| F-10 Renderer parse surfaces out of scope | ℹ️ Info | **ACCEPTED** (SA-12) | Proxy still format-blind |
| F-11 `safeName` reserved/ADS names | ℹ️ Info | **ACCEPTED — optional** (SA-13) | Unchanged; containment name-independent |

---

## 7. Detailed Findings

### SA-01 (Critical — pre-existing platform surface, first reported here): Unauthenticated child-server config API on a 0.0.0.0-bound backend

| Attribute | Value |
|-----------|-------|
| Severity | **Critical** (CVSS ≈ 9.8 as-deployed-if-reachable: AV:N/AC:L/PR:N/UI:N — C:H/I:H/A:H; reduced to High if host firewall blocks inbound 48721) |
| OWASP | A01 Broken Access Control · A05 Security Misconfiguration · A07 Identification and Authentication Failures |
| CWE | CWE-306 (Missing Authentication for Critical Function); CWE-78 (OS command spawn via stdio `command` registration, config-controlled) |
| Location | `backend/src/modules/orchestration/McpConfigRoutes.ts:19-130`; `backend/src/server/HttpRouteRegistrar.ts:74-103` (no middleware matches `/api/mcp-servers`); `backend/src/config/index.ts:109` (`host: process.env.CODE_INTEL_HOST || '0.0.0.0'`) |
| Status | **Open — platform backlog (not an SA4E-380 diff defect; does not gate this ticket's verdict)** |

**Description.** The MCP server configuration REST API (`GET/POST/PUT/DELETE /api/mcp-servers`, `POST /api/mcp-servers/:name/reconnect`) carries **no authentication middleware**: the global stack gates only `/api/admin/*`, `/api/index/*`, `/api/tags/*`, `/mcp/*`, `/api/v1/pega/*` and `/api/v1/*` (HttpRouteRegistrar.ts:82-102) — none matches `/api/mcp-servers`. A successful `POST` persists the config and **immediately connects** it (McpConfigRoutes.ts:62); for a stdio child the transport factory spawns `config.command` as a process on the backend host. The backend's default bind is `0.0.0.0` — **live-confirmed**: the running instance listens on `0.0.0.0:48721`.

**Impact.** (1) Unauthenticated arbitrary process execution on the backend host for any peer that can reach port 48721; (2) any such caller can register a "trusted child" — manufacturing the precondition that SA4E-380's residual-risk acceptances (S-4 SSRF, content in/out, artifact inlining) rest on; (3) read/delete of child-artifact content via the (now confined) proxy, and workspace file planting via inlined bytes.

**Why it does not gate SA4E-380.** `McpConfigRoutes.ts` is untouched by this ticket (pre-existing SA4E-92/223 surface; no existing document records the gap — checked). SA4E-380's own diff introduces no new endpoint, and its F-01 confinement reduces what a malicious child can read/delete. The finding is escalated for immediate platform action because the content proxy increases the value of controlling a child registration.

**Remediation (platform ticket).**

```typescript
// HttpRouteRegistrar.ts — gate the config API with the strict platform auth
app.use('/api/mcp-servers/*', jwtAuthStrict);   // + the bare path for list/create
app.use('/api/mcp-servers', jwtAuthStrict);
// and/or bind loopback by default in config/index.ts:
host: process.env.CODE_INTEL_HOST || '127.0.0.1',
```

Additionally: require an explicit operator allow-list for stdio commands, and treat remote (httpStream) child registration as an admin-scoped action (this also enforces approval-condition 3 operationally).

**References.** CWE-306: https://cwe.mitre.org/data/definitions/306.html · OWASP A01:2021: https://owasp.org/Top10/A01_2021-Broken_Access_Control/

---

### SA-05 (Low, new): Cleanup failure logs leak full host paths via raw `err` objects

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A09 Security Logging and Monitoring Failures |
| CWE | CWE-532 (Insertion of Sensitive Information into Log File) |
| Location | `backend/src/modules/orchestration/artifact-cleanup/CleanupSweep.ts:106,168`; `artifact-cleanup/delete-artifact.ts:35` |
| Status | Open |

**Description.** Failure paths log `{ artifact: <basename>, err }`. Real Node fs errors embed the full path (`EPERM: operation not permitted, unlink 'C:\\…\\export_x.docx'` plus `err.path`), so the I-3 invariant ("basenames only in logs") breaks in exactly the failure cases the logs exist for. The unit tests throw synthetic path-free errors (`Object.assign(new Error('EPERM'), { code: 'EPERM' })`), so the basename-only assertions pass while production errors would not.

**Remediation.**

```typescript
// log the code and a sanitized message — never the raw error object
this.logger.warn({ artifact: entry.name, errCode: (err as NodeJS.ErrnoException).code }, 'Artifact cleanup sweep failed to remove file');
// delete-artifact.ts — same shape; if a message is needed:
warn(log, { artifact: path.basename(filePath), errCode: err?.code }, 'Artifact cleanup failed after inline');
```

Add one test whose fake error message contains a full path and assert it does not survive into the logged line.

---

### SA-06 (Low, new): `decodeDataUri` skips the strict base64 validation used everywhere else

| Attribute | Value |
|-----------|-------|
| Severity | Low |
| OWASP | A02 Cryptographic Failures (integrity class) · A04 Insecure Design |
| CWE | CWE-130 (Improper Handling of Length/Encoding) |
| Location | `backend/src/modules/orchestration/content-proxy/artifact-source.ts:182-193` |
| Status | Open (one-line consistency fix) |

**Description.** `data:…;base64,<payload>` artifacts are decoded with bare `Buffer.from(match[3], 'base64')` — Node's lenient decoder skips invalid characters. A corrupted child payload can therefore inline garbage bytes silently, defeating the S-7 "corrupted payload never silently succeeds" spirit on this one path (`fromBase64` and `decodeBase64Utf8` both validate strictly). Impact is bounded by the trusted-child assumption (an honest-but-buggy child is the realistic case); the extension write side will happily persist the garbage.

**Remediation.**

```typescript
function decodeDataUri(uri: string): Buffer | null {
  const match = /^data:([^;,]*)(;base64)?,(.*)$/is.exec(uri);
  if (!match) return null;
  try {
    if (match[2]) {
      const compact = match[3].replace(/\s+/g, '');
      if (!compact || compact.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return null; // strict — mirrors fromBase64
      return withinCap(Buffer.from(compact, 'base64'));
    }
    return withinCap(Buffer.from(decodeURIComponent(match[3]), 'utf8'));
  } catch { return null; }
}
```

---

### SA-08 (Low, new): `ARTIFACT_OUTPUT_ROOTS` override accepts any path without sanity checks

| Attribute | Value |
|-----------|-------|
| Severity | Low (operator-misconfiguration class; env control ≈ host control) |
| OWASP | A05 Security Misconfiguration |
| CWE | CWE-16 (Configuration) |
| Location | `backend/src/config/ContentProxy.ts:80-92`; `artifact-cleanup/artifact-roots.ts:21-32` |
| Status | Open (defense-in-depth) |

**Description.** The env override (`;`/`:`-delimited) replaces the defaults wholesale. A root of `C:\\`, `C:\\Users\\<user>` or the workspace itself would make the TTL sweep a broad deleter of old files and widen `readLocalFile` confinement to sensitive trees. The actor is the operator (env access), so this is hardening, not a vulnerability — but the blast radius (silent mass delete) justifies a cheap guard.

**Remediation.** On `artifactOutputRoots()` load: reject entries that are filesystem roots (`path.parse(root).root === path.resolve(root)`), the workspace root itself, or the user home; log the effective root count at startup; document approved roots in the DPG.

---

### SA-09 (Low): Partial descriptor resolution returns success-with-subset; TDD §9.1 wording contradicts the implemented (FSD-accepted) semantics

| Attribute | Value |
|-----------|-------|
| Severity | Low (documented OI-07 gap + documentation inconsistency) |
| OWASP | A08 Software and Data Integrity Failures |
| CWE | CWE-1044 (inconsistent documentation); tracked as FSD OI-07 |
| Location | `result-adapter.ts:39-42` (error only when zero resolve); `TDD.md:323`; `FSD.md:1660` (OI-07) |
| Status | Open — doc fix + optional `expected_total` |

**Description.** When a child declares N artifacts and 1..N−1 resolve, the call succeeds with the resolved subset; extension count verification compares written vs received payloads (2/2 passes) and the declared count is not carried — exactly what FSD OI-07 documents. TDD §9.1 however states the call "still ends in `ARTIFACT_FETCH_FAILED` for the unreadable remainder", which the code does not do when ≥ 1 artifact resolves. An agent reading only `outputs[]` can mistake a subset for the full set (the `artifacts[]` metadata still lists all declared names, which is the only visible discrepancy).

**Remediation.** (1) Correct TDD §9.1 to match FSD OI-07/EF-6; (2) implement OI-07's suggestion — carry `expected_total` (descriptor count) in the shaped result and have the extension warn/fail when `outputs.length < expected_total` in wrapper mode.

---

## 8. Positive Security Observations (verified in code and tests)

1. **F-01 confinement is the correct canonicalize-then-verify shape** — `realpathSync` before containment, roots themselves realpathed, `lstatSync` symlink re-refusal after the gate, and `path.resolve` normalisation of bare/drive-relative paths before the gate. Every bypass class analysed in §5-A01 fails closed.
2. **F-06 implemented exactly as the 3.7 remediation specified** — stat-identity (ino/size/mtimeMs) re-verification, ENOENT-as-success, basename-only warning, cleanup never fails the delivered bytes (`delete-artifact.ts`), wired with the platform logger through `McpClientManager` (:108).
3. **The sweep's safety envelope is complete for its threat**: fixed dedicated roots, TTL floor, per-entry deadline checks against `maxRunMs`, symlink/dir exclusions, one-level job-dir nesting with empty-dir removal, unreadable-root skip-not-fail, `unref()`'d timer, clean shutdown lifecycle in `OrchestrationModule` (:60-62, :68-70).
4. **Config parsing is fail-safe**: NaN/≤0/garbage env values fall back to safe defaults; a garbage `ARTIFACT_CLEANUP_ENABLED` disables rather than enables a destructive task (`cleanup-config.ts:40-48`).
5. **Dual fail-loud guards intact end-to-end**: backend `retrievalError` (result-adapter.ts:107-116) + extension `missingPayload`/X-Y count verification (output-proxy.ts:74-79, 99-111); host paths stripped from every shaped response and error text (I-3 verified; live `ARTIFACT_FETCH_FAILED` messages contain basenames only).
6. **Payloads never logged — verified** at both the HTTP layer (request-logger) and the proxy execution layer (McpClientManager): no `content_base64`/`output_base64` value ever reaches a log line.
7. **No prototype-pollution channel from child JSON** (object-checked parse + spread copies), **no command-execution primitive** and **no new dependencies** in the audited diff.
8. **Wrapper exposure unchanged and minimal**: 127.0.0.1 bind (live-confirmed), origin gate as first statement, CORS echo-only-allowlisted, sanitised log text everywhere.
9. **Test fidelity is high overall**: 38/38 focused tests on the current tree, including the binding F-01 negative case (out-of-root → no read, no delete, loud failure, no path leak) and the OI-14 scope case (resources/URLs/blobs never deleted) — the one blind spot found is SA-05's synthetic error messages.

---

## 9. Remediation Priority

| Priority | Finding | Action | Effort | Owner |
|----------|---------|--------|--------|-------|
| 0 (immediate, platform) | **SA-01** | Auth-gate `/api/mcp-servers` (+ admin-scope child registration) and/or default the backend bind to `127.0.0.1`; record in DPG as a deployment precondition | Low (2 lines + tests) | Platform backlog / DevOps DPG |
| 1 | SA-05 | Log `errCode`/sanitized message instead of raw `err` in cleanup failure paths; add a path-bearing fake-error test | Trivial | DEV (SA4E-380 follow-up) |
| 2 | SA-02 | `isAllowedArtifactUrl` + private/link-local block + per-hop redirect revalidation — **mandatory before any remote child**; pair with SA-01 so registration is authenticated | Medium | SA + DEV (backlog) |
| 3 | SA-03 | Aggregate `MAX_TOTAL_ARTIFACT_BYTES` in `collectFiles`; rate-limit `/api/tools/*` + `/mcp/tools/call` | Low–Medium | DEV (backlog) |
| 4 | SA-06 | Strict base64 check in `decodeDataUri` (reuse `fromBase64` validation) | Trivial | DEV |
| 5 | SA-07 | Extend `NON_CONTENT_PARAM` with `apikey|authorization|cookie|session|credential` | Trivial | DEV |
| 6 | SA-08 | Sanity-check `ARTIFACT_OUTPUT_ROOTS` entries (reject FS/workspace/home roots); log effective roots at startup | Low | DEV |
| 7 | SA-04 / SA-09 / SA-14 / SA-13 | Decoded-size cap (OI-09); TDD §9.1 wording fix + `expected_total` (OI-07); drop dead `isArtifactFileName` + refresh wrapper `serverInfo.version`; optional `safeName` reserved/ADS hardening | Low | SA / DEV |
| 8 | SA-10 / SA-11 / SA-12 | DPG statements: set `CODE_INTEL_REQUIRE_AUTH`/API-key env in any multi-user context; TLS for any non-loopback deployment; renderer sandbox note | Documentation | DevOps (DPG) |

### Immediate Actions
1. Escalate **SA-01** to the platform security backlog today; until fixed, keep port 48721 unreachable off-host (firewall/bind) — the running instance currently listens on `0.0.0.0`.
2. Land SA-05 + SA-06 (trivial, same files as this ticket) in the SA4E-380 changeset before merge.

### Short-term Improvements
1. SA-02 URL allow-listing **as a precondition gate for enabling any streamable-HTTP child** (enforced together with SA-01's auth gate).
2. SA-03 aggregate cap + execution-route rate limiting.

### Long-term Hardening
1. SA-07/SA-08/SA-04/SA-09 refinements as listed; optional handle-based delete (F-06 Option B) if artifact roots ever become shared.
2. Re-run this OWASP sweep at Phase 6.3 (pentest) with dynamic probes against the running build, including the SA-01 registration path.

---

## 10. Sign-Off

| Role | Name / Agent | Verdict | Date |
|------|--------------|---------|------|
| Security code review (Phase 5.7) | Security Agent | **APPROVED WITH FINDINGS** — SA4E-380's implementation satisfies all 3 binding approval conditions (F-01+OI-14 co-shipped ✅, OI-15 dedicated-roots sweep ✅, F-02 deferral valid w/ binding condition ✅); 0 Critical/High introduced by the ticket's diff; merge permitted together with Priority 1 trivial fixes (SA-05/SA-06) and the SA-01 platform escalation | 2026-10-24 |
| Platform escalation | — | **SA-01 (Critical, pre-existing)** — route to platform security backlog immediately; deployment beyond single-operator dev requires its remediation or verified network isolation | 2026-10-24 |
| QA | QA Agent | Pending — add STC cases: cleanup failure with path-bearing error message (assert no host path in logs); data-URI with invalid base64 alphabet → `ARTIFACT_FETCH_FAILED` | — |
| DevOps | DevOps Agent | Pending — DPG must state: auth env vars mandatory, loopback/TLS requirements, `ARTIFACT_OUTPUT_ROOTS` approved roots, and the SA-01 remediation precondition | — |
| Product Owner | Duc Nguyen Minh | Pending | — |

**Verdict: APPROVED WITH FINDINGS** — the ticket's own code is approved for merge (with SA-05/SA-06 recommended in-changeset); the Critical SA-01 is a pre-existing platform exposure outside this ticket's diff, escalated for immediate platform action and mandatory DPG treatment.

---

## Appendix A — Files Audited (evidence base)

| File | Role in audit |
|------|---------------|
| `backend/src/modules/orchestration/content-proxy/artifact-source.ts` | F-01 confinement, OI-14 cleanup hook, fetch/data-URI/local read paths (SA-02, SA-06) |
| `backend/src/modules/orchestration/content-proxy/invocation-adapter.ts` | Wrapper-mode gate, strict base64 (A02, SA-04) |
| `backend/src/modules/orchestration/content-proxy/result-adapter.ts` | Shaping/stripping, partial-resolution semantics (SA-03, SA-09) |
| `backend/src/modules/orchestration/content-proxy/artifact-name.ts`, `detect.ts`, `schema-adapter.ts`, `types.ts` | safeName (SA-13), capability gating, schema markers |
| `backend/src/modules/orchestration/artifact-cleanup/artifact-roots.ts` | realpath containment helper (F-01 core), dead `isArtifactFileName` (SA-14) |
| `backend/src/modules/orchestration/artifact-cleanup/delete-artifact.ts` | OI-14 identity-checked delete (F-06), log leak (SA-05) |
| `backend/src/modules/orchestration/artifact-cleanup/CleanupSweep.ts` | OI-15 sweep: roots, bounds, exclusions, logging (SA-05) |
| `backend/src/modules/orchestration/artifact-cleanup/cleanup-config.ts` | env parsing fail-safety (A05) |
| `backend/src/modules/orchestration/artifact-cleanup/__tests__/CleanupSweep.test.ts` | UT-47/48 + config/roots tests |
| `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.cleanup.test.ts` | UT-44/45/46 + F-01 binding case |
| `backend/src/modules/orchestration/content-proxy/__tests__/content-proxy.test.ts`, `content-proxy.remote.test.ts`, `__tests__/McpClientManager.content-proxy.test.ts` | Core adapter suites (21 + remote + wiring) |
| `backend/src/config/ContentProxy.ts` | Roots config, `NON_CONTENT_PARAM` (SA-07), caps, `isPathWithinRoot` |
| `backend/src/modules/orchestration/McpClientManager.ts`, `OrchestrationModule.ts` | Proxy wiring + cleanup hook injection + sweep lifecycle |
| `backend/src/modules/orchestration/McpConfigRoutes.ts`, `backend/src/server/HttpRouteRegistrar.ts`, `backend/src/config/index.ts`, `backend/src/server/middleware/request-logger.ts` | Adjacent trust boundary: SA-01 evidence, middleware stack, log hygiene |
| `extension/src/services/Base64ProxyService.ts`, `Base64ProxyService/output-proxy.ts`, `dynamic-tool.ts`, `schema-rewrite.ts`, `types.ts` | Read/write-side guards, count verification (I-7, A08) |
| `extension/src/services/WrapperServer/request-handler.ts`, `wrapper-server.ts` | Origin gate, loopback bind, serverInfo version (SA-14) |
| `backend/package.json` | A06 dependency check |
| `documents/SA4E-380/{SECURITY-REVIEW,TDD,FSD,BRD,STP,STC,STATUS.json,RUN-LOG}.md` | 3.7 findings, §9 design, OI-07, acceptance conditions, build/run evidence |

## Appendix B — Scope Limitations

- **Static code audit + live feature-presence checks only** — no exploitation, no payload fuzzing, no dynamic penetration testing (that is Phase 6.3). The SA-01 exposure was confirmed by reading the middleware stack and observing the live socket state, not by sending an attack payload (destructive action prohibited).
- The SA4E-380 diff was audited at line level; adjacent platform code (`PathResolver`, `fs-guards`, auth middlewares) was re-read for boundary correctness but not exhaustively re-audited — those belong to their own tickets.
- Dependency CVE screening of the child `markdown-exporter` and the draw.io/puppeteer renderer stack is external-system work (SA-12); no new npm dependencies were introduced by this ticket (verified).
- Windows-specific behaviours (NTFS file IDs in `Stats.ino`, `path.win32.relative` case-insensitivity) were verified against Node's documented platform semantics, not dynamically exercised on every input class.
- Findings conditional on the trusted-child model (SA-02, SA-06) are bounded by that assumption; SA-01 shows the assumption is only as strong as the (currently missing) registration gate — re-rate after SA-01 remediation.

## Appendix C — Glossary

- **BOLA** Broken Object Level Authorization · **CWE** Common Weakness Enumeration · **CVSS** Common Vulnerability Scoring System · **F-xx** Phase 3.7 review finding · **SA-xx** this audit's finding · **I-3** TDD invariant "no host paths in logs/responses" · **OI-xx** open issue (FSD/TDD numbering) · **S-x** TDD §7 design threat · **TOCTOU** time-of-check time-of-use race · **ADS** NTFS alternate data stream.

---

*End of Security Assessment — SA4E-380 v1.0 (2026-10-24). Generated by the Security Agent from the current workspace source (= the restarted 2026-10-24 build, feature-presence live-verified) and the running instance; no code was modified during this audit.*
