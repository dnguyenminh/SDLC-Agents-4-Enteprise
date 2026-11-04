# 🔒 Security Assessment Report

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (code-intel MCP backend + VS Code/Kiro extension) |
| Ticket | SA4E-394 — Multi-Worktree `base_dir` Support for All `file_path` Tools |
| Scope | Static code review of branch `dnguyenminh/SA4E-394-2` (7 commits `9a4b8562..408a925d`: 47 files, +2,418/−239) — 8 MCP tools: `mem_ingest_file`, `embed_image`, `drawio_export_png`, `drawio_auto_layout`, `jira_attach_file`, `confluence_add_attachment`, `sandbox_run`, `stream_write_file` |
| Date | 2026-11-02 |
| Assessor | security-agent (GLM-5.3) |
| Version | 1.0 |
| Status | Open findings — 1 High, 4 Medium, 4 Low, 3 Informational |

## Executive Summary

The `base_dir` feature introduces a **single, well-designed containment pipeline** (`MultiWorktreePathResolver` + `WorkspaceAllowlist`) that all 8 tools now target: normalize → allowlist → resolve → containment **after** resolution, plus a runtime symlink-escape re-check (T3), win32 case-folding on both sides, NUL-byte rejection, and sanitized path echoing (anti log-forging). Fail-closed semantics are consistent: a non-string `base_dir` yields a typed error, and calls rejected before allowlisting produce **zero side effects** (no execution, no HTTP calls — verified in test matrix TC-307..TC-314/TC-703). The migration **also removed a real pre-existing bug**: the Atlassian tools' `ALLOWED_BASES = [process.cwd()]` containment used a raw `startsWith()` boundary check (prefix-collision bypass, e.g. `/cwd-evil/x`), now replaced by the separator-aware resolver.

The main concern is **asymmetric coverage of the same attack surface**: the ticket hardens the *new* `base_dir` path, but for `mem_ingest_file` the **legacy path (base_dir omitted) still has no containment at all** — any absolute existing file on the host can be read and ingested into the KB (pre-existing, deliberately preserved byte-for-byte per contract C-3, but it directly contradicts the ticket's containment goal and remains the strongest read primitive on this server). Secondary hardening gaps: `sandbox_run` feeds the resolved host path into a shell command **without quoting**; the extension's base64 output write-back re-validates against the *default* root instead of the per-call `base_dir` (fail-closed but inconsistent + functional regression); the extension lacks the backend's T3 symlink-escape check on input reads; and the dependency inventory carries a **High zod CVE** (reachable via the MCP tool-arg validator) plus Hono `serveStatic` CVEs (not currently reachable).

No authentication/authorization, XSS, SSRF, or cryptographic changes were introduced by this feature; the allowlist is operator-owned env/file config (no secrets involved).

**Overall Risk Rating: 🟡 MEDIUM** (containment design is sound; risk is concentrated in the uncontained legacy ingest path and patchable hardening gaps)

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 4 |
| 🔵 Low | 4 |
| ℹ️ Informational | 3 |

## Findings Summary Table

| ID | Severity | Category (CWE) | File | Description | Remediation |
|----|----------|----------------|------|-------------|-------------|
| SEC-01 | 🟠 High | Broken Access Control (CWE-22) | `backend/src/modules/memory/dispatchers/crud-ingest-file.ts`, `helpers.ts:22-25` | Legacy `mem_ingest_file` (no `base_dir`) accepts any absolute path that exists on the host and ingests its content into the KB — arbitrary file read primitive | Route legacy calls through the same resolver or gate legacy mode behind an explicit config flag; minimum: enforce containment in `resolvePath()` when `hasBaseDirArg` is false |
| SEC-02 | 🟡 Medium | Command Injection floor (CWE-78) | `backend/src/modules/sandbox/tools/command-builders.ts:60-81`, `tool-handlers.ts:104-114` | `buildRunCommand` interpolates the resolved HOST path unquoted into `bash -c`/`cmd.exe` commands; workspace names with shell metacharacters (agent-writable) → command splitting; Windows paths with spaces break the command | Use argv arrays or shell-escape `file` in `buildRunCommand`; unit test with workspace dir containing `;`, `&`, spaces |
| SEC-03 | 🟡 Medium | Inconsistent Boundary Enforcement (CWE-283) + functional defect | `extension/src/services/Base64ProxyService/output-proxy.ts:60-63` | Write-back re-resolve (I-7 guard) validates against the **default root** without forwarding per-call `base_dir`; base_dir≠default-root writes fail (PROXY_WRITE_FAILED); under `cwd_fallback` the second containment silently disappears | Pass `extractBaseDirArg(args)` into the re-resolution at the guard step; add TC-111 variant test with base_dir ≠ default root |
| SEC-04 | 🟡 Medium | Vulnerable Dependency — zod HIGH CVE (CWE-400) | `backend/package.json` (`zod 3.25.76 < 4.6.6`) | GHSA-mrhx-c7xc-m3w5: memory exhaustion validating oversized constrained collections; `zod` is the primary validator of MCP tool args (`ToolValidator`, Atlassian schemas, gateguard) → agent-triggerable memory DoS | Upgrade to zod ≥ 4.6.7 (breaking) or add argument-size caps in the tool-router layer |
| SEC-05 | 🔵 Low | Vulnerable Dependencies (CWE-1104) | `backend/package.json` | hono + @hono/node-server `serveStatic` double-decode bypass — **not reachable today** (serveStatic unused); fast-uri 3.1.8 (via ajv, 4 CVEs); ip-address 10.7.3 (quadratic ReDoS, via express-rate-limit) | `npm audit fix`; keep serveStatic out or upgrade before any static-file adoption |
| SEC-06 | 🔵 Low | TOCTOU / Missing Read-side Symlink Guard (CWE-59) | `extension/src/backend-local-tools/fs-guards.ts:18-38`, `embed-image.ts` | `checkSymlinkGuard` realpaths only the **parent** — an input file that is itself a symlink escapes the root on **reads** (embed_image); backend resolver has the stronger T3 check | Mirror backend T3 ancestor-realpath walk for read paths |
| SEC-07 | 🔵 Low | TOCTOU (CWE-59) | `backend/src/servers/atlassian/tools/path-resolution.ts:47-52` | `finalizeAttachmentPath()` realpaths then returns; caller reads/uploads WITHOUT re-checking containment vs `effectiveRoot` — symlink swap between resolve and finalize uploads an arbitrary file (race) | Re-check containment after `realpath()` before `readFile()` |
| SEC-08 | 🔵 Low | SQL string assembly (CWE-89 style, defense-in-depth) | `backend/src/modules/memory/dispatchers/graph-node-cleanup.ts:26-30` | `DELETE … WHERE entry_id IN (…)` built by string interpolation; safe because `knowledge_entries.id` is INTEGER, but the pattern invites SQLi if the key type changes | Parameterize the IN-list |
| SEC-09 | 🔵 Low | Release Hygiene (CWE-1188 adj.) | `package-lock.json` (1.55.12), `backend/package-lock.json` (1.55.11), `extension/package-lock.json` (1.55.11) | Lockfiles stale vs `package.json` = **1.55.13** — breaks reproducible build/version-sync guardrail | `npm install --package-lock-only` per workspace and commit locks with the bump |
| SEC-10 | ℹ️ Info | Cross-surface parity | `extension/src/services/base-dir-resolution.ts:22-27` | `extractBaseDirArg` silently treats non-string/empty `base_dir` as *absent* → legacy path; backend returns typed INVALID_BASE_DIR error. Guard message emits `…OUTSIDE_WORKSPACE` code on base_dir branch | Align to backend typed-error contract |
| SEC-11 | ℹ️ Info | Configuration robustness | `backend/src/shared/workspace-allowlist.ts:104-118` | Allowlist split on platform delimiter (`;` on win32) — directory names containing `;` cannot be expressed in the env var (must use `MCP_WORKSPACE_ROOTS_FILE`) | Document in README/UG; consider line-based-only parsing |
| SEC-12 | ℹ️ Info | Documentation accuracy | `README.md` changelog v1.55.13 | States branch `dnguyenminh/SA4E-394`; actual audited branch is `dnguyenminh/SA4E-394-2` | Fix changelog text |

## Detailed Findings

### SEC-01 — 🟠 High · A01:2021 Broken Access Control (CWE-22) — Legacy `mem_ingest_file` reads arbitrary host files

| Attribute | Value |
|-----------|-------|
| Severity | High (CVSS ≈ 7.5 — network-exposed MCP transport assumption; A: L if strictly stdio-local) |
| Location | `backend/src/modules/memory/dispatchers/crud-ingest-file.ts:47-63,142-147`; `backend/src/modules/memory/dispatchers/helpers.ts:22-25` |
| Status | Open (pre-existing, preserved by contract C-3) |

**Description:** Every call carrying `base_dir`/`workspace_root` is routed through the new resolver (containment verified). When **neither** argument is present, the legacy branch is untouched:

**Evidence:**

```ts
// crud-ingest-file.ts:51-57 — base_dir branch (contained)
if (hasBaseDirArg(a)) {
  const resolution = (pathResolver ?? getSharedPathResolver(logger)).resolve({
    filePath, baseDir: a.base_dir, workspaceRoot: a.workspace_root });
  if (!resolution.ok) return `Error: ${resolution.message}`;
  filePath = resolution.resolvedPath;
}
// helpers.ts:22-25 — used by readFileContent() on the LEGACY branch
export function resolvePath(fp: string, workspace: string): string {
  if (path.isAbsolute(fp) && fs.existsSync(fp)) return fp;   // ← ANY existing host file
  const ws = path.resolve(workspace, fp);
  return fs.existsSync(ws) ? ws : path.resolve(fp);
}
```

`readFileContent()` then does `fs.promises.readFile(resolved, 'utf-8')` and stores the full text as a KB entry (`engine.insert({ source: filePath, ... })`), retrievable later via `mem_search`.

**Impact:** An MCP client (agent) can exfiltrate the content of any readable file on the backend host (`~/.ssh/id_rsa`, other projects' `.env`, credential stores) by ingesting it and searching it back. This is exactly the primitive the ticket was created to contain — the `base_dir` branch fixes it; the dominant legacy usage does not.

**Remediation (contract-preserving for relative paths):**

```ts
// helpers.ts — fail-closed for legacy/absolute inputs
export function resolvePath(fp: string, workspace: string): string | null {
  if (path.isAbsolute(fp) && fs.existsSync(fp)) {
    const abs = path.resolve(fp);
    return abs.startsWith(path.resolve(workspace) + path.sep) ? abs : null;
  }
  const ws = path.resolve(workspace, fp);
  return fs.existsSync(ws) ? ws : null;
}
// call sites treat null as `Error: file not found`.
// Cross-worktree ingest remains available explicitly via base_dir.
```

Minimum-viable alternative (no contract change): keep legacy reads only behind env opt-in `MCP_LEGACY_INGEST_UNCONTAINED=0` default-off.

**References:** CWE-22, OWASP A01:2021.

---

### SEC-02 — 🟡 Medium · A03:2021 (CWE-78) — `sandbox_run` builds shell commands from unquoted resolved host path

| Attribute | Value |
|-----------|-------|
| Severity | Medium (CVSS ≈ 5.5; impact bounded by the sandbox purpose "run code"; local mode has no isolation per FSD §7.4) |
| Location | `backend/src/modules/sandbox/tools/command-builders.ts:60-81`; wired at `tool-handlers.ts:104-114`; executed via `executors/LocalExecutor.ts:72-81` (shell `cmd.exe`/`/bin/bash`) or `executors/DockerCommandRunner.ts:34` (`['bash','-c',command]`) |
| Status | Open (pre-existing exec design; newly fed host absolute paths by this ticket) |

**Description:** In the `base_dir` branch the handler resolves `file` host-side pre-mount and passes the **host absolute path** into `buildRunCommand()`. The path is constrained to an allowlisted workspace root, but directory/file names inside it are agent-writable (via `stream_write_file`), so names like `x;id&` or paths with spaces are reachable. The command string is then interpreted by a **full shell** (`spawn(..., { shell: 'cmd.exe' })` / `bash -c`), producing command splitting/injection — and Windows host paths inside a docker exec are broken regardless.

**Evidence:**

```ts
const fileArg = resolved.resolvedPath;                   // C:\Users\John Doe\wt\script.js
const command = buildRunCommand(runtime, fileArg, args); // `node C:\Users\John Doe\wt\script.js`
await manager.execute(sessionId, command, …);            // shell: cmd.exe | /bin/bash | docker bash -c
```

**Impact:** Arbitrary command fragments interpreted outside the intended interpreter variable; breaks the boundary assumption "containment ⇒ safe execution"; functional breakage for space-containing roots.

**Remediation:**

```ts
// Prefer argv-based execution in the executors; minimally, quote in the builder:
const shquote = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`;  // POSIX
export function buildRunCommand(runtime: string, file: string, args: string[]): string {
  const f = process.platform === 'win32' ? `"${file}"` : shquote(file);
  // …and switch LocalExecutor/DockerCommandRunner to execFile-style arrays when feasible
}
```

**Test requirement:** unit test with a workspace directory named `a;id > pwned;` and one containing spaces.

**References:** CWE-78, OWASP A03:2021.

---

### SEC-03 — 🟡 Medium · A05/A01 (CWE-283) — Output write-back re-validates against the default root, not the per-call `base_dir`

| Attribute | Value |
|-----------|-------|
| Severity | Medium (fail-closed — **no escape path found**; but inconsistent enforcement + functional regression for the headline use case "write artifact into worktree B") |
| Location | `extension/src/services/Base64ProxyService/output-proxy.ts:60-63` (guard re-resolve); `136-149` (path derivation correctly uses base_dir) |
| Status | Open |

**Evidence:**

```ts
// Step 1 — correct: per-call base_dir honored (this ticket)
const baseDir = args.base_dir !== undefined ? args.base_dir : args.workspace_root;
const resolved = ctx.resolvePath(args.output_path as string, baseDir);   // validated vs base_dir
// Step 2 — I-7 re-resolve: baseDir NOT forwarded → validated vs DEFAULT workspace root
const outResolution = resolveWorkspacePath(outputPath, {
  rootProvider: () => ctx.resolveRoot(),     // ← default root, not base_dir
});
if (!outResolution.ok) throw new PathResolverError(outResolution.message); // PROXY_WRITE_FAILED
```

**Impact & analysis:** The comment "re-resolve is idempotent" no longer holds under base_dir semantics. With a VS Code workspace open (default root = main worktree) and `base_dir` = a sibling worktree, every `drawio_export_png`/`embed_image` write-back **fails with PROXY_WRITE_FAILED** even though step-1 allowed it; under `cwd_fallback` (no workspace open) the second containment silently disappears — still safe because step-1 validated against the allowlisted base_dir, so the fail direction is closed, but the boundary is enforced against the wrong root. Untested by TC-703 (tests cover the local-tool path, not proxyOutput with base_dir).

**Remediation:**

```ts
const outResolution = resolveWorkspacePath(outputPath, {
  rootProvider: () => ctx.resolveRoot(),
  baseDir: args.base_dir !== undefined ? args.base_dir : args.workspace_root, // keep effective root identical
});
```

Add test: proxyOutput with `base_dir` ≠ default root writes successfully and re-checks containment against base_dir.

---

### SEC-04 — 🟡 Medium · A06:2021 (CWE-400) — zod 3.25.76 High CVE reachable through tool-arg validation

| Attribute | Value |
|-----------|-------|
| Severity | Medium (agent/client-triggerable memory DoS; `hono/body-limit` exists only on selected HTTP routes) |
| Dependency | `zod@3.25.76` (`backend/package.json`: `"zod": "^3.23.0"`) — vendor severity **High**, fix 4.6.6 (GHSA-mrhx-c7xc-m3w5; 4.6.7 is a breaking upgrade) |
| Reachability | `backend/src/tool-router/ToolValidator.ts:1`; Atlassian Zod schemas (`jira-schemas.ts`, `confluence-schemas.ts`); gateguard models; HTTP route validators |
| Status | Open |

**Remediation:** Plan the zod v4 upgrade (breakingly installs 4.6.7 — scan all schema definitions for v4 API changes; prioritize the tool-router path). Interim mitigation: cap `args` payload size in `ToolValidator` before schema parse (reject > 1 MB or > 10,000 array items).

---

### SEC-05 — 🔵 Low · A06:2021 — Remaining moderate CVEs (not currently reachable)

| Dependency (installed) | CVE(s) | Fixed In | Reachability note |
|---|---|---|---|
| hono 4.12.25 | GHSA-5r4p-p66f-jhc7 (serveStatic double-decode bypass) | 4.13.11+ | `serveStatic` NOT imported anywhere in backend/src → no current reach; upgrade cheap |
| @hono/node-server 1.19.14 | GHSA-rmxm-3fg6-px4f (same class) | 2.1.3+ | only `serve()` is used |
| fast-uri 3.1.8 (via ajv) | GHSA-w74x-v6f9-j3xg, GHSA-xhq7-xmqj-769h, GHSA-wjr9-j795-jxcr, GHSA-333x-w4r6-6crp | 3.2.0 | URI scheme spoofing/normalization via ajv formats; low reachability |
| ip-address 10.7.3 (via express-rate-limit) | GHSA-rxp7-6hxx-x8q5 (quadratic stall) | 10.8+ / 11.x | ReDoS-class stall on long strings |
| jimp 1.6.1 (29 "high" audit entries) | all "Depends on vulnerable zod" | resolves with zod upgrade | direct backend dep (image processing) |

`npm audit --omit=dev` (backend): **33 vulnerabilities (4 moderate, 29 high)** — the 29 "high" are entirely the zod chain propagated through jimp/via-deps, addressed by SEC-04. No typosquatting indicators in the dependency list (hono/pino/zod/knex/jose/bcrypt/dockerode/sqlite3/pg/@modelcontextprotocol-sdk are canonical). No new dependency added by this feature (`package.json` diff = version bump only).

---

### SEC-06 — 🔵 Low · TOCTOU/symlink on extension input reads (parity gap vs backend T3)

`checkSymlinkGuard()` realpaths **only the parent** ("never the file itself — so writing NEW files keeps working", `fs-guards.ts:18-38`). For `embed_image` the *input* path is resolved by `resolveWithBaseDir()` (string-only, no existence/realpath check — `base-dir-resolution.ts:98-136`): an existing input file that is itself a symlink pointing outside the allowlisted root passes the guard and is READ. The backend's `MultiWorktreePathResolver.symlinkEscape()` (T3, `multi-worktree-path-resolver.ts:174-186`) walks to the deepest existing ancestor and re-checks containment, so backend-surface reads are covered; the extension surface is not. Pre-existing for the default root; now equally applicable to any allowlisted root.

**Remediation:** For read-style tools (embed_image input), mirror T3: realpath the deepest existing ancestor of `resolvedPath` and re-run `isPathWithinRoot`; keep parent-only logic for write-only targets.
**References:** CWE-59, OWASP A01/A04.

---

### SEC-07 — 🔵 Low · TOCTOU in Atlassian attachment finalize (missing final containment re-check)

`finalizeAttachmentPath()` (`path-resolution.ts:47-52`) returns `realpath(resolved)`; both callers (`jira-attachment-tools.ts`, `confluence-content-tools.ts`) immediately `readFile(finalPath)` and upload **without re-checking** the real path against the effective root. Combined with the resolver's race window (resolve-then-read), an attacker with local FS access can swap the target for an out-of-root symlink between the two steps → arbitrary file upload to Jira/Confluence.

**Remediation (3 lines):**

```ts
const real = await realpath(resolution.resolved);
if (!containsFolded(effectiveRoot, real)) {
  return { ok: false, code: 'PATH_REJECTED_OUTSIDE_ALLOWLIST', message: 'path escaped root via symlink' };
}
```

Note the severity is LOW: requires a local filesystem race (T3 already closed the static-symlink case; this closes the swap window).

---

### SEC-08 — 🔵 Low · Interpolated IN-list SQL (defense-in-depth)

`graph-node-cleanup.ts:26-30`: `DELETE FROM graph_nodes WHERE entry_id IN ('doc-N', …)` with `idList` built by string interpolation from DB-read ids. Safe today because `knowledge_entries.id` is `INTEGER PRIMARY KEY AUTOINCREMENT` (`migrations/000-init-system-tables.cjs:38`) and `source` is parameterized (`WHERE source = $1`). The same pattern exists elsewhere (`memory/consolidation/service.ts:108,169`). Parameterize the IN-list (placeholder array or JSON-table join) to prevent future-DB-change regressions. OWASP A03:2021 (not exploitable as written).

---

### SEC-09 — 🔵 Low · Lockfile/version desync

`package.json`×3 bumped to **1.55.13** in commit 408a925d, but root lock = **1.55.12**, backend lock = **1.55.11**, extension lock = **1.55.11**. Violates the repo's version-sync guardrail (#4) and reproducibility (`npm ci` installs mismatched package versions vs the published changelog). Run `npm install --package-lock-only` in root/backend/extension and include leases with the bump commit.

---

### SEC-10 — ℹ️ Info · Extension/back-end parity on malformed `base_dir`

Backend `extractBaseDir()` (`multi-worktree-path-resolver.ts:141-149`): non-string `base_dir` → typed error `PATH_REJECTED_OUTSIDE_ALLOWLIST: base_dir must be a non-empty string workspace root`. Extension `extractBaseDirArg()` (`base-dir-resolution.ts:22-27`): non-string/null → treated as **absent** → legacy semantics (still contained, so no escape — but silently different contract). Also `fs-guards.ts:33` emits code `PATH_REJECTED_OUTSIDE_WORKSPACE` even when the effective root came from `base_dir` (should be `…_ALLOWLIST`). Align for TC-702 contract parity and audit-log accuracy.

### SEC-11 — ℹ️ Info · Allowlist tokenization edge (win32 `;` in directory names)

`MCP_WORKSPACE_ROOTS` splits on `path.delimiter` (`;` on Windows); a root path containing `;` cannot be expressed via the env var. Use `MCP_WORKSPACE_ROOTS_FILE` (line-based format, `#` comments). Document in README/UG (the v1.55.13 changelog already mentions the file option); MAX_CONFIG_FILE_BYTES = 64 KB and MAX_ROOTS = 100 bound abuse.

### SEC-12 — ℹ️ Info · README branch-name mismatch

Changelog claims branch `dnguyenminh/SA4E-394`; audited branch is `dnguyenminh/SA4E-394-2` (this workspace's current branch).

## Findings by OWASP Top 10 (2021)

| Category | Result |
|----------|--------|
| A01 Broken Access Control | SEC-01 (High); SEC-03/06/07 boundary inconsistencies |
| A02 Cryptographic Failures | No issues found ✅ (no new crypto/secrets in the diff; jose/bcrypt untouched) |
| A03 Injection | SEC-02 (CWE-78 floor); SEC-08 (style-only SQL); DB access otherwise parameterized ✅ |
| A04 Insecure Design | Legacy uncontained ingest path by contract (SEC-01 design dimension); proxyOutput parity test-gap (SEC-03) |
| A05 Security Misconfiguration | SEC-03, SEC-09; allowlist fail-closed defaults ✅ |
| A06 Vulnerable & Outdated Components | SEC-04 (zod High), SEC-05 (hono/fast-uri/ip-address/jimp chain) |
| A07 Identification & Authentication Failures | No issues in scope ✅ (transport auth unchanged by the diff) |
| A08 Software & Data Integrity | SEC-09 (lockfile/manifest integrity of build inputs) |
| A09 Logging & Monitoring Failures | Positive control ✅ — `sanitizePathText`/`sanitizeLogText` strip `[\r\n\0]`; allowlist/rejection decisions logged at WARN |
| A10 SSRF | No issues found ✅ (no new outbound fetch in the diff) |

## Security Controls Verified (positive findings)

1. **ONE containment pipeline** — all 8 tools (+admin/index routes) target `MultiWorktreePathResolver`; per-call explicit resolver injection with `getSharedPathResolver()` singleton fallback (BR-13: one allowlist load per process, installed at boot in `backend/src/index.ts`).
2. **Fail-closed on malformed `base_dir`** — non-string/empty handled with typed errors before any fs call (TC-401/TC-406) on BOTH backend and extension.
3. **Ordering correctness** — allowlist check BEFORE existence (BR-11; prevents a root-existence oracle); containment AFTER resolution kills `../` including mixed-separator tricks; legacy `resolveWithinWorkspace` rejects `..`, absolute and NUL (`path-safety.ts:13-23`).
4. **Symlink anti-escape (T3)** backend-side: ancestor realpath + containment re-check; extension keeps the I-7 parent-realpath guard for writes.
5. **Case-folding on win32 both sides** (`foldKey` in allowlist Set, `containsFolded` in containment) — closes case-insensitivity gaps (P7).
6. **Zero side-effect rejections verified by tests** — sandbox zero-execution, Atlassian zero-HTTP (BR-23); allowlist caps (64 KB config, 100 roots) bound memory abuse.
7. **Pre-existing bug fixed** — Atlassian `ALLOWED_BASES.startsWith()` prefix-collision bypass eliminated by the resolver.
8. **Anti log-forging** — all echoed paths sanitized (`sanitizePathText`, `sanitizeLogText`).
9. **No new secrets** — allowlist sourced from env/config file only; `MCP_WORKSPACE_ROOTS` semantics require restart (deterministic, no hot-reload race).
10. **Test matrix** — 71 cases incl. traversal/absolute-escape/symlink-escape/alias-precedence/malformed-base_dir; extension TC-702 parity.

## Dependency Vulnerabilities

| Dependency | Current | CVE(s) | Severity | Fixed In |
|---|---|---|---|---|
| zod | 3.25.76 | GHSA-mrhx-c7xc-m3w5 | High (vendor) | 4.6.6+ |
| hono | 4.12.25 | GHSA-5r4p-p66f-jhc7 | Moderate | 4.13.11+ |
| @hono/node-server | 1.19.14 | GHSA-rmxm-3fg6-px4f | Moderate | 2.1.3+ |
| fast-uri | 3.1.8 | 4 GHSA advisories (scope/host/decoder) | Moderate | 3.2.0+ |
| ip-address | 10.7.3 | GHSA-rxp7-6hxx-x8q5 | Moderate | 10.8+/11.x |
| jimp | 1.6.1 | via vulnerable zod | High (correlated) | after zod upgrade |

## Remediation Priority

| Priority | Finding | Effort | Impact if fixed |
|---|---|---|---|
| 1 | SEC-01 legacy ingest containment | Low (one helper + unit tests) | Closes the arbitrary-file-read primitive — biggest risk |
| 2 | SEC-04 zod upgrade (+ schema v4 scan) | Medium | Removes the only High vendor-severity dependency risk |
| 3 | SEC-02 quote/execFile for sandbox_run | Low | Prevents shell interpretation of validated paths |
| 4 | SEC-03 output-proxy guard baseDir parity + test | Low | Restores intended write-back flow, consistent boundary |
| 5 | SEC-07 finalize re-check (3 lines) | Low | Closes race window on uploads |
| 6 | SEC-05 npm audit fix (hono trio) | Low | Clears the npm-audit CI gate |
| 7 | SEC-09 lockfile sync | Trivial | Release integrity (guardrail #4) |
| 8 | SEC-06 extension T3 parity for reads | Medium | Read-side symlink containment on extension surface |
| 9 | SEC-08 param IN-list; SEC-10..12 | Low | Defense-in-depth hygiene |

## Recommendations Summary

**Immediate (High/Medium):**
1. Contain the legacy `mem_ingest_file` read path (SEC-01) — even a minimal `resolvePath()` hardening closes the read primitive without breaking the relative-path contract; cross-worktree ingest flows through the new `base_dir` parameter by design.
2. Upgrade zod to ≥4.6.7 and re-run the full vitest suite around validators; add arg-size caps in `ToolValidator` meanwhile.
3. Quote/argv-ify `sandbox_run` command construction (SEC-02) and add the metachar-name unit test.
4. Forward `base_dir` into the output-proxy I-7 re-resolve (SEC-03) + add the TC-111 base_dir-variant test.

**Short-term (Medium/Low):**
5. Re-check containment after `realpath` in `finalizeAttachmentPath` (SEC-07).
6. `npm audit fix` for hono/@hono/node-server/fast-uri/ip-address (SEC-05); monitor zod-4 adoption.
7. Sync lockfiles with the 1.55.13 version bump (SEC-09) before tagging v1.55.13.
8. Mirror T3 read-side symlink checks in the extension (SEC-06).

**Long-term hardening (Low/Info):**
9. Parameterize interpolated IN-lists across `memory/*` (SEC-08).
10. Align extension base_dir error contract & guard codes with the backend (SEC-10); document `;` in paths → use config file (SEC-11); fix README branch name (SEC-12).

## Scope Limitations

- **Static analysis only** — no runtime/dynamic exploitation or fuzzing; TOCTOU windows were reason-verified, not demonstrated.
- **Auth/transport unchanged** by this diff — the standing MCP transport authentication posture was out of scope; SEC-01's CVSS assumes the server's own exposure model.
- Extension VS Code-runtime behaviors (settings sync of `workspaceRoots`, webview rendering of tool output) reviewed as code paths only; not executed — **no live-app evidence captured** (no UI deliverable in this change set; all findings carry file:line code evidence).
- Docker executor hardening (dockerode BR-12) and the sandbox exec-by-design threat model assessed at the newly-changed interface only (pre-2024 executor internals per SA4E-6).
- Knowledge Base ingest of this report (mem_ingest) was NOT performed — the code-intel dynamic tools available in this session expose only `stream_write_file`/`embed_image`; the gap is recorded here per evidence policy (no silent gaps).

## Appendix

### A. Tools & Methodology
- Static code review (manual, backend + extension), git-diff driven (7 commits `9a4b8562..408a925d`)
- `npm audit --omit=dev` (backend) + lockfile version cross-check (root/backend/extension)
- Test-matrix cross-verification (TC-307..TC-314, TC-702/703, TC-800, BR-23 zero-side-effect)
- OWASP Testing Guide v4.2 / Top-10:2021 mapping, CVSS v3.1 qualitative anchoring

### B. Evidence trail (key artifacts)
- Containment core: `backend/src/shared/multi-worktree-path-resolver.ts`, `workspace-allowlist.ts`, `path-resolution-types.ts`, `path-safety.ts`, `path-resolver-provider.ts`
- Backend wiring: `backend/src/index.ts` (allowlist boot), `UtilityModule.ts`, `engine/tools/code-intel-handlers.ts`, `drawio-tool.ts`, `drawio-export-png.ts`, `register-tools.ts`, `memory/dispatchers/crud-ingest-file.ts`, `graph-node-cleanup.ts`, `sandbox/tools/tool-handlers.ts`, `atlassian/tools/path-resolution.ts`
- Extension: `services/base-dir-resolution.ts`, `services/PathResolver.ts`, `services/Base64ProxyService(.output-proxy)`, `backend-local-tools/{stream-write,embed-image,fs-guards,definitions}`, `mcp/atlassian/{jira-attachment,confluence-content}-tools`
- Audit log: `documents/SA4E-394/.security-audit-log.md`

### C. Glossary
- **CWE**: Common Weakness Enumeration · **CVSS**: Common Vulnerability Scoring System · **TOCTOU**: Time-Of-Check-Time-Of-Use · **BR/TC/T#**: Business Requirement / Test Case / Threat identifiers per SA4E-394 FSD/TDD numbering

*End of report — generated by security-agent, 2026-11-02. Branch `dnguyenminh/SA4E-394-2` @ 408a925d.*
