# 🔒 Security Review — Round 1 (Post-Fix Verification)

## Document Information

| Field | Value |
|-------|-------|
| Project | SA4E-394 — base_dir & multi-worktree path resolution |
| Type | Re-review: verification of the 4 security fixes from SECURITY-ASSESSMENT.md v1.0 |
| Date | 2026-11-03 |
| Reviewer | Security Agent (static verification + targeted test execution) |
| Branch | dnguyenminh/SA4E-394-2 @ 570c173c |
| Commits verified | b1da7122 (SEC-01), 616923e8 (SEC-02), a12b9577 (SEC-03), 570c173c (SEC-04) |

## Executive Summary

Verified each fix at source level plus targeted test execution. **4/4 findings are FIXED at root cause**, no regression on AC1–AC5 (S1–S5 matrix PASS), no new High/Critical introduced. Residuals: 2× Low (Docker-mode cross-platform quoting + agent-supplied args not argv-ified — documented in code as long-term debt) and 1× Informational (TOCTOU symlink race — inherent limitation, has compensating controls).

**Overall Risk Rating after fixes: LOW** (before: MEDIUM, driven by SEC-01 High).

| Verdict | Finding |
|---------|---------|
| ✅ FIXED | SEC-01, SEC-02, SEC-03, SEC-04 |
| 🟦 Residual (Low, tracked) | SEC-02-R1, SEC-02-R2 |
| ℹ️ Residual (Info) | SEC-01-R1 |

## Verification Evidence (executed in this review)

| Check | Result |
|-------|--------|
| backend vitest: per-tool-base-dir.mem-ingest + command-builders.sec02 + zod-version-guard + ToolValidator | **4 files / 30 tests PASS** |
| backend vitest: per-tool-base-dir.file-tools + multi-worktree-path-resolver | **2 files / 43 tests PASS** |
| extension vitest: base64-proxy.output-base-dir.test.ts | **1 file / 5 tests PASS** |
| backend tsc --noEmit (zod v4 migration compile check) | **EXIT 0** |
| extension tsc --noEmit (zod overridden to 4.6.6 reaches extension too) | **EXIT 0** |
| Lockfile resolution | zod hoisted **4.6.6** (other copies 4.6.7 — all ≥ floor); MCP SDK 1.32.1 peer ^3.25 or ^4.0 ✓; zod-to-json-schema@3.25.2 peer ^3.25.28 or ^4 ✓ |

---

## Per-Finding Verdicts

### SEC-01 (High, CWE-22) — Legacy mem_ingest_file arbitrary file read → **FIXED ✅**

**Root cause addressed?** YES. Commit b1da7122 adds `backend/src/shared/legacy-path-gate.ts`; the legacy branch (base_dir omitted) is now gated **before every side effect** (`crud-ingest-file.ts:45-55`). Rejection returns before dedup/read/insert; BR-23 zero-side-effects asserted by S6/S7 (`rowCount() == 0`).

Details verified:
- The gate reuses the resolver's own primitives: `containsFolded` (T5/T9 case-fold containment) + `symlinkEscape` (T3), applied in the same pipeline order as the base_dir branch (`containAndResolve`, resolver lines 115–117).
- Relative input → `resolveWithinWorkspace` (the same helper the resolver legacy branch uses — identical semantics; blocks `../` traversal + NUL byte).
- Absolute input → pinned root first, then each configured allowlist root; AC3 backward-compat cross-worktree ingest still works (S8 PASS).
- Rejection: `PATH_REJECTED_OUTSIDE_ALLOWLIST` with the containment message template verbatim from the resolver (AC2 wording).
- **The old cwd-fallback leak in `helpers.resolvePath()` is closed**: previously `path.resolve(fp)` on a non-existent path fell back to CWD (a second arbitrary-read primitive); now relative paths must land inside the workspace and absolute paths are gated by `resolveLegacyRead` first (`helpers.ts:38-41`); null → file-not-found contract preserved.
- Fix is structural, not a workaround: one gate module depending on the resolver's exported primitives — no containment logic duplicated.

**Residual (Informational — SEC-01-R1):** the legacy *relative* path does **not** run the T3 symlink-escape check (exact parity with the resolver's own legacy branch — pre-existing behavior, not a regression of this fix). A symlinked directory inside the pinned root can still be used to read outside. TOCTOU symlink-swap between gate and read is an inherent limitation. Verdict unchanged: agents lack a generic tool primitive to create host-side symlinks, and parity was the design constraint (BR-03). Long-term recommendation: apply T3 to legacy relative inputs as well.

Minor (behavioral, non-security): a legacy relative path with leading/trailing whitespace — the gate trims before validating, while `readFileContent` uses the raw string, so a file whose name genuinely starts/ends with a space can surface as 'file not found'. Accept.

---

### SEC-02 (Medium, CWE-78) — Sandbox run command quoting → **FIXED ✅** (documented residuals)

**Root cause addressed?** YES for the filed scope. `quoteForShell()` (`command-builders.ts:75-78`): POSIX single-quoting with the standard `'\u0027\''` embedded-quote escape; win32 double-quoting. `buildRunCommand()` quotes **both** the source file and the derived Java class name; TC-314 S1/S3 substring contract (quoted command still contains the resolved host path) tested; the 11-metachar × 2-shell matrix plus the classic `a;id > pwned;` payload PASS (34 assertions).

**Residual 1 (Low — SEC-02-R1):** the remaining injection surface of the same CWE-78 class is **by-design agent-facing** (the sandbox intentionally runs shell commands): `args.args` of sandbox_run (`tool-handlers.ts:114`), `testPath`/`configFile` of sandbox_test, `packages`/`flags` of sandbox_install remain unquoted. Impact is low because the agent can already run arbitrary code in local mode. argv-based executor execution remains the correct long-term remediation (documented in code comments).

**Residual 2 (Low — SEC-02-R2):** win32 host + DockerCommandRunner: the path is quoted cmd.exe-style (double quotes) but executed through `bash -c` inside the container — a filename containing `$` or a backtick (legal on NTFS) would be expanded by bash inside double quotes. Also `%VAR%` pairs still expand in cmd.exe (documented in code as a residual; argv-based execution is the long-term fix). Requires attacker-chosen directory names AND docker mode → Low.

Conclusion: the original finding (unquoted resolved host path → command splitting) is **closed**; residuals are extensions of the same risk that were already classified in SECURITY-ASSESSMENT v1.0.

---

### SEC-03 (Medium, CWE-283) — Output-proxy I-7 re-resolve missing per-call base_dir → **FIXED ✅**

**Root cause addressed?** YES. `output-proxy.ts:67-71`: the I-7 re-resolve now forwards `args.base_dir` / `args.workspace_root` into `resolveWorkspacePath`, validating against the SAME effective root as the derivation (both paths share pickBaseDir logic — the CWE-283 drift is gone).

Test coverage (5/5 PASS) covers: (1) write-back landing inside the base_dir worktree, (2) relative `output_path` resolved against base_dir rather than the default root, (3) unregistered base_dir → fail closed `PROXY_WRITE_FAILED` with nothing written, (4) non-string base_dir → fail closed (INVALID sentinel, no write anywhere), (5) legacy regression guard (base_dir omitted → default-root write-back unchanged).

No regression detected: silent cwd-fallback is replaced by fail-closed — correct hardening direction.

---

### SEC-04 (Medium, CWE-400) — zod High CVE → **FIXED ✅**

**Root cause addressed?** YES. `zod` pinned exact **4.6.6** (no caret — a future vulnerable minor cannot slip in) + `overrides` in BOTH backend and root package.json, forcing transitive consumers (MCP SDK layer, zod-to-json-schema, jimp chain) onto the patched copy. Lockfile confirms: hoisted zod 4.6.6; other copies 4.6.7 — all ≥ floor.

Compatibility verified:
- zod-to-json-schema@3.25.2 peerDependency range includes ^4 → official zod 4 support since 3.25.x. ✓
- @modelcontextprotocol/sdk@1.32.1 deps/peers ^3.25 or ^4.0; the new guard test asserts schemas expose the `_zod` marker the SDK compat layer (`isZ4Schema`) keys on. ✓
- The v4 migration (10 files) covers only the breaking-safe API deltas: `z.record(keySchema, valueSchema)`, `.issues` replacing the removed `.errors`, ZodType generics (Output, Input), env-parse issue-path typing. `tsc --noEmit` **EXIT 0 on both backend and extension**.
- No leftover zod-3 idioms (`errorMap`, `catchAll`, `ZodTypeDef`) in backend/src or extension/src (grep = 0 matches; remaining `.errors` hits are AggregateError / ajv `validator.errors` / application-owned error arrays — not ZodError).
- Guard test `zod-version-guard.test.ts` locks the floor: installed version ≥ 4.6.6, `_zod` marker present, oversized constrained collection validation returns a BOUNDED issue list (patch behavior), error surface has `.issues` not `.errors`. Any transitive reintroduction of zod < 4.6.6 fails CI.

Advisory context note: CVE-2023-54404 was rejected on 2026-10-28 per web sources, but the GitHub advisory GHSA-mrhx-c7xc-m3w5 remains active (CVSS 8.2 High, fixed in 4.6.6) and the patch behavior is real. The upgrade remains the correct decision — it also eliminates the 29-high npm-audit chain flagged in the v1.0 assessment.

---

## AC1–AC5 Regression Check

| AC | Test | Result | Status |
|----|------|--------|--------|
| AC1 allowlist resolution (relative + base_dir) | mem-ingest S1 | PASS (ingested, source = wt-B path) | ✅ |
| AC2 containment error verbatim + zero side effects | S2, S4, S5 | PASS | ✅ |
| AC3 backward-compat (legacy absolute inside allowlisted root still ingests) | S3, S8 | PASS | ✅ |
| AC4 rejection before ingest (absolute outside + traversal) | S4, S5, S6, S7 | PASS | ✅ |
| AC5 schema doc / per-tool matrix + resolver + file-tools matrix | 43 tests | PASS | ✅ |
| TC-703 S-variant (proxyOutput base_dir ≠ default root) | base64-proxy.output-base-dir | PASS | ✅ |

Extension `tsc` clean → contract parity with the extension-side resolver is not broken.

---

## New Issues Introduced by the Fixes

| ID | Severity | Title | Evidence | Verdict |
|----|----------|-------|----------|---------|
| SEC-02-R1 | 🟦 Low | Agent-supplied run/install/test arguments remain unquoted (CWE-78 residual; by-design shell surface) | tool-handlers.ts:114, 136, 158-163 | Accept-as-is under the sandbox threat model; track argv-based executor as tech debt |
| SEC-02-R2 | 🟦 Low | cmd.exe-style quoting reused inside docker bash -c on win32 hosts (dollar/backtick filenames expand) | quoteForShell platform branch + DockerCommandRunner | Documented in code; edge case; long-term argv fix |
| SEC-01-R1 | ℹ️ Info | Legacy relative path skips the T3 symlink-escape check (parity with resolver legacy branch — not new) | legacy-path-gate.ts:47-52 vs multi-worktree-path-resolver.ts:55 | Defense-in-depth suggestion only |

No new High/Medium issues.

## Code Quality Snapshot (SDLC standards)

| File | Lines | ≤200 gate | Comment |
|------|-------|-----------|---------|
| crud-ingest-file.ts | 144 | ✅ | gate in handler; read helpers extracted to helpers.ts |
| dispatchers/helpers.ts | 80 | ✅ | |
| legacy-path-gate.ts (new) | 78 | ✅ | error-as-value; never throws on business paths |
| sandbox/tools/command-builders.ts | 135 | ✅ | |
| Base64ProxyService/output-proxy.ts | 187 | ✅ | |

- SOLID: the gate depends on the resolver's exported primitives (DIP, OCP via the allowlistRoots() accessor) — no duplicated containment logic. ✅
- `resolveLegacyRead()` is ~33 lines **including comments** (~15 statements) — drifts past the ≤20-line guideline if comment lines count; suggest splitting the relative/absolute branches if the module is touched again. Minor, non-blocking.
- Every fix ships its own test file covering happy path, fail-closed, and regression. ✅

## Watch Items for Phase 6 (QA focus)

1. **SEC-02-R2 on a Windows host with the docker sandbox runtime**: exercise filenames containing `$`, `%`, and spaces through DockerCommandRunner.
2. **zod v4 message changes**: consumers parsing ToolValidator / registerTool error message format; ToolValidator.test.ts was updated, but QA should confirm agent-facing messages end-to-end.
3. **SEC-01 behavior change (deliberate)**: a legacy call supplying `content`/`content_base64` inline with an out-of-allowlist `file_path` is NOW rejected even when no file is read (previously the path was label-only). This is correct hardening, but monitor post-deploy `PATH_REJECTED` logs for legitimate legacy callers.

## Go/No-Go Recommendation

**GO for Phase 6 Testing.**

- 4/4 findings FIXED with first-hand evidence (source review + 30 + 43 + 5 tests executed during this review; tsc --noEmit EXIT 0 on both workspaces).
- No AC1–AC5 regression; no new High/Medium.
- Phase 6 conditions: (i) cover SEC-02-R2 against the docker runtime, (ii) monitor SEC-01 legacy label-only-path breakage in logs, (iii) keep `zod-version-guard.test.ts` wired into CI as the regression fence (already in place).

**Disclaimer:** this is a static re-review plus targeted test execution, not a dynamic pentest; runtime/infrastructure/transport security remains out of scope (same boundary as SECURITY-ASSESSMENT v1.0).
