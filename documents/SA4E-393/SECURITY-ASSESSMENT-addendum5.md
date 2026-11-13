# Security Code Review - Addendum 5 (auto-trust git worktree)
## SA4E-393, Phase 5.7

| Field | Value |
|-------|-------|
| Author | security-agent |
| Date | 2026-11-13 |
| Scope | `git diff ff753553..HEAD` (49 files): backend lib `1ac80e4b`, resolver `760316a5`, extension `b0c8d9ad..46a001c0` |
| Baseline | `SECURITY-REVIEW-addendum5.md` (SEC-WT-1..19, rounds 1-2) |
| Method | Static review of the code, plus a one-off PoC script run outside the repo (temp dir, deleted afterwards). Vitest suites run for the worktree code. No source file was modified. |
| **Overall risk** | **MEDIUM**. 0 Critical, 0 High open, 3 Medium, 3 Low, 2 Info. |
| Verdict | **PASS-WITH-CONDITIONS**: fix SEC-WT-20 and SEC-WT-21 before release; SEC-WT-22 is pre-existing but amplified by this feature. |

Executed: backend `vitest` on `src/shared/worktree-trust` + `multi-worktree-path-resolver.worktree.test.ts` (4 files, 60 passed, 2 skipped). Extension `vitest` on `backend-local-tools.worktree.test.ts` + `worktree-trust.sync.test.ts` (10 passed). `node scripts/sync-worktree-trust.mjs --check`: 13 generated files in sync. The 2 skipped backend tests were not identified; I did not verify whether they cover a security scenario.

---

## 1. SEC-WT-16 confirmation: CLOSED

The hole: a lexical `path.resolve` of link text collapsed `..` after a symlink hop (`L -> d/../x`, `d -> outside`).

| Item | Location |
|------|----------|
| Fix | `backend/src/shared/worktree-trust/symlink-containment.ts` `realResolve` (line 38), `step` (52): `..` runs `st.prefix = P.dirname(st.prefix)` (line 58) on the already-resolved REAL prefix. `follow` (76) splices link text as components into the todo stack (line 89) and never calls `path.resolve` on link text. |
| Realpath vs realpath | `symlinkEscapeCheck` (line 97): `realRoot = realpathSync(root)`, then `isInsideFolded(realRoot, r.real)` (line 104). This also closes SEC-WT-17. |
| Backend wiring | `backend/src/shared/path-containment.ts:15` (`symlinkEscape` is now a wrapper), called at `multi-worktree-path-resolver.ts:139`. |
| Extension wiring | `extension/src/backend-local-tools/fs-guards.ts` `checkFullPathEscape` (line 41), invoked at line 33, after the parent-realpath check. Generated mirror `extension/src/services/worktree-trust/symlink-containment.ts` is byte-synced (drift guard OK). |
| Test (backend) | `worktree-trust/__tests__/worktree-security.test.ts:44` `symlinkDotDotCollapse` (real fs), `:51` `symlinkDotDotInside`, `:58` fake POSIX fs (runs on every host: collapse gives `real_outside /o/x`, inside gives `null`, cycle gives `link_depth`, dangling gives `real_outside`), `:77` `dotDotAfterMissing` and EACCES fail closed. |
| Test (extension) | `extension/src/__tests__/backend-local-tools.worktree.test.ts:59-84` "SEC-WT-16 checkSymlinkGuard": junction then `..` escape is rejected, `..` that stays inside and new files inside are accepted. The test builds the path with `raw()` (no normalisation), so the original attack shape is exercised. |
| Result | Tests pass. The final-component symlink case (SEC-WT-17 of the earlier design) and the dangling-link case (SEC-WT-3) are also covered by the same algorithm. |

Residual: `..` after a MISSING component is rejected (`dotdot_after_missing`, fail-closed). This is correct, but file_path values like `new/../x` are rejected, though the resolvers `path.resolve` them beforehand, so only direct callers of `realResolve` can see it.

---

## 2. Findings

| ID | Severity | Title | File |
|----|----------|-------|------|
| SEC-WT-20 | Medium | In-tree `<repo>/worktrees/<n>/` accepted as a "bare" worktree registration, forged trust (PoC) | `worktree-trust/trust-steps.ts:21`, `admin-steps.ts:41-43` |
| SEC-WT-21 | Medium | `sdlcAgents.workspace.worktreeAutoTrust=false` does not disable the backend (kill switch not propagated) | `extension/src/mcp-config-builder.ts` (`openFoldersEnv`), `extension/src/services/worktree-open-folders.ts:37-39`, `backend/src/shared/worktree-trust-factory.ts:23` |
| SEC-WT-22 | Medium | `ensureDir` runs before the symlink guard (pre-existing), creates directories outside the root through repo-authored links | `extension/src/backend-local-tools/stream-write.ts:49 vs 54`, `embed-image.ts:107 vs 111`, `Base64ProxyService/output-proxy.ts:58 vs 73` |
| SEC-WT-23 | Low | `sameFile` identity check is skipped when `dev`/`ino` is 0 | `worktree-trust/admin-steps.ts:75` |
| SEC-WT-24 | Low | Check-then-use window and cache context ignores allowlist changes | `trust-service.ts` `ctxSig`, tool call sites |
| SEC-WT-25 | Low | `symlinkEscape` is now fail-closed for all callers (legacy gate): behaviour change when root cannot be realpath-ed | `path-containment.ts:15`, `symlink-containment.ts:100` |
| SEC-WT-26 | Info | Windows 8.3 handling covers `base_dir` only; other inputs fail closed | `path-fold.ts:76` |
| SEC-WT-27 | Info | Design-doc hygiene items R2-1 not verifiable in code | n/a |

### SEC-WT-20 (Medium): forged "bare" registration inside an ordinary trusted repo

**Description.** `parentSet` adds `<S>/worktrees` for EVERY trusted root S (`trust-steps.ts:21`, comment says it is for the bare layout). If S is an ordinary repo, a plain tracked directory `S/worktrees/x/` is therefore accepted as an "admin dir". `stepCommon` falls back to `<admin>/../..` = S when `commondir` is absent, requires only `S/HEAD` to be a file (a committed file satisfies it), and classifies S as `bare` because `basename(S) != '.git'` (`admin-steps.ts:41-43`). `stepParent` then passes when S is allowlisted (`isAllowlisted(trustRoot)`). In a typical deployment the workspace root is in `MCP_WORKSPACE_ROOTS`. None of this requires git to have registered the worktree.

**Evidence (PoC, executed).** Temp layout: `S/.git/` (dir, empty), `S/HEAD` (file), `S/worktrees/x/gitdir` = `<B>/.git`, `B/.git` = `gitdir: <S>/worktrees/x`; S allowlisted via `MCP_WORKSPACE_ROOTS`. `createWorktreeTrust(...).check(B)` returned `{"trusted":true,"kind":"bare","repoRoot":"<S>",...}`. Temp files were deleted.

**Impact.** Content committed to a trusted repo (for example from an untrusted branch or PR) can nominate an arbitrary directory B as a writable `base_dir` root, as long as the attacker can place a `.git` pointer file in B. This breaks the trust anchor ("registered by git under the trusted repo's `.git/worktrees`"). Exploitability is limited because B must already contain an attacker-written `.git` file, so I rate it Medium, not High.

**Remediation (file / owner: DEV).**
1. `trust-steps.ts:21`: only add `<S>/worktrees` for roots that are actually bare, i.e. when `S` has no `.git` entry and contains `HEAD`, `objects` and `refs`; or drop the entry unless S is explicitly allowlisted AND passes a bare-repo check.
2. `admin-steps.ts` `stepCommon`: for `kind: 'bare'` require `objects/` and `refs/` directories next to `HEAD`, and require that `S/.git` does not exist.
3. Test: add `forgedBareInOrdinaryRepo` (the PoC above) to `worktree-security.test.ts`, expecting `submodule_or_unknown_layout`. Mirror via the sync script (extension copy is generated).

### SEC-WT-21 (Medium): the setting does not reach the backend

**Description.** `worktreeAutoTrust` is declared with `"scope": "machine"` (`extension/package.json` ~348-353, good, SEC-WT-7 OK) and is read only inside the extension (`worktree-open-folders.ts:37-39`, passed to `loadTrustConfig` at line 65). The backend builds its config with `loadTrustConfig(env)` and no setting reader (`worktree-trust-factory.ts:23`). `mcp-config-builder.ts` forwards only `MCP_OPEN_WORKSPACE_FOLDERS`; a repo-wide grep for `MCP_WORKTREE_AUTOTRUST` in non-test extension code finds no writer. A user who sets the documented kill switch to `false` therefore disables trust for extension-run tools but the backend resolver still auto-trusts worktrees.

**Impact.** A security switch that silently covers only half of the surface; users believe the feature is off.

**Remediation (DEV).** In `openFoldersEnv`/`resolveConfig`, add `MCP_WORKTREE_AUTOTRUST: "0"` to `config.env` when the setting is not `true`; re-apply on `onDidChangeConfiguration` (restart or env refresh). Add a test in `mcp-config-builder.worktree.test.ts`. Alternatively document that only the env var governs the backend (weaker).

### SEC-WT-22 (Medium): `ensureDir` before the guard (pre-existing)

**Description.** `stream-write.ts:49` calls `ensureDir(dirname(resolvedPath))` (`fs.mkdirSync(..., {recursive:true})`) and only afterwards `checkSymlinkGuard` (line 54). `embed-image.ts` (107 then 111) and `output-proxy.ts` (58 then 73) have the same order. `mkdirSync` follows symlinks and junctions. The guard now blocks the write, but the directory outside the worktree has already been created. Auto-trusted worktrees contain repo-authored symlinks, which increases exposure of this older defect. The new component-wise check (`symlinkEscapeCheck`) works for non-existent tails, but `checkSymlinkGuard` first does `realpathSync(parentDir)` (fs-guards.ts, parent must exist), so the old order was kept.

**Impact.** Empty directory trees created at attacker-chosen locations outside the root (no file content). Modest, but it is a filesystem side effect of a rejected request, and it can pre-create directories for a later race or link.

**Remediation (DEV).** Call `symlinkEscapeCheck(rootPath, resolvedPath)` BEFORE `ensureDir` (it needs no existing parent), then keep the existing parent-realpath check after `ensureDir`. Add a test: `link -> outside`, `file_path = "link/newdir/f.txt"`, assert `outside/newdir` is NOT created.

### SEC-WT-23 (Low): identity check weakened on `dev`/`ino` = 0

`admin-steps.ts:75` returns `true` if either side reports 0 (FAT/exFAT, some network or virtual filesystems), so only the folded string compare applies. This matches SEC-WT-19 (accepted, documented). The string compare remains the primary gate and the Kelvin-sign style collision needs an NTFS-like fold. Recommend a `debug` log when the fallback is used. Accepted.

### SEC-WT-24 (Low): residual race windows

- Guard then use: tools check containment and then perform a separate `fs` call. A link swapped between the two (needs a concurrent writer inside the worktree) wins. Not closable without `O_NOFOLLOW`/`openat`-style APIs; accept and document.
- Cache: positive TTL 10 s (`cache.ts:19`); each hit re-checks `.git` signature, back-link signature and `realpath(baseDir) === ev.realBase` (cache.ts:69). `ctxSig` (`trust-service.ts`) contains only `enabled|openFolders`, not the allowlist, so removing a root from the extension setting leaves a cached positive for up to 10 s. Include a hash of `allowlistRoots()` in `ctxSig`. The `realpath` comparison on win32 is case-sensitive (`===`): a mismatch only forces re-verification (safe).

### SEC-WT-25 (Low): fail-closed behaviour change for existing callers

`symlinkEscape` (`path-containment.ts`) used to return `null` on errors; it now returns the input path when `realpathSync(root)` fails or an unexpected fs error occurs. Callers such as the legacy path gate will reject where they used to allow (for example root deleted, EACCES on a parent). This is the intended fail-closed direction (SEC-WT-3), but regression-test legacy-path-gate error messages for a non-existent root.

### SEC-WT-26 (Info): Windows 8.3

`isShortNameAlias` (`path-fold.ts:76`) accepts a short-name-shaped component only if `realpathNative` of the prefix ends with the same name (anchored regex, `proj~2` style names are not false-rejected unless they are aliases). It runs on `base_dir` in `stepGitFile`. Pointers/back-links with 8.3 spellings do not match the lexical trusted-prefix set or the realpath compare and fail closed. In `file_path`, `realResolve` does not expand aliases, so an alias spelling reads as outside the real root and is rejected (false negatives only). Not executed on a Windows machine with 8.3 generation enabled; verified by reading only.

### SEC-WT-27 (Info)

R2-1 (superseded-text markers, diagram step 16 = 10 s) is a document item and was not part of this code review.

---

## 3. Checklist requested by the task

| Area | Result | Evidence |
|------|--------|----------|
| SEC-WT-16 | **Closed** | Section 1 |
| Back-link check | OK | `admin-steps.ts:56-69`: `<admin>/gitdir` realpath must equal `<realBase>/.git` (folded string AND dev/ino, `sameFile`). `commondir` must equal `<admin>/../..` (`stepCommon`). Weak point: SEC-WT-23. |
| Prefix check | OK for git layouts, **flawed for bare** | `trust-steps.ts:27-38` runs before any fs access to the pointer target (FIFO/UNC unreachable, SEC-WT-1 closed). `readSmall` is lstat-first (`git-files.ts`). Bare spoofing: SEC-WT-20. |
| UNC guard | OK | Backend: `multi-worktree-path-resolver.ts:113` before `allowlist.contains`; `workspace-allowlist.ts` `contains` returns false for unlisted UNC before `realpathSync`; `hasLiteral` pure Set lookup. Extension: `allowlist-mirror.ts` `realOrNull` skips UNC; `base-dir-resolution.ts` `admit`. `realResolve` returns `fs_error` with zero fs calls for UNC/device. `precheck` and pointer validation reject UNC. |
| Symlink containment | OK | Section 1; link depth 40, cycles rejected, dangling links resolve to the creatable location and are checked. |
| TOCTOU | Partially | Cache re-validates evidence plus `realpath(baseDir)`; use-time window and `ensureDir` order remain (SEC-WT-22/24). |
| Setting scope machine | OK for scope, **not propagated** | `extension/package.json` ~348-353 `"scope": "machine"`; non-boolean value fails closed (`worktree-open-folders.ts:37-39`). SEC-WT-21. |
| Fail-closed | OK | `verifyWorktree` catch gives `io_error`; budget gives `limit_exceeded`; unknown env flag gives off + warning (`config.ts`); throwing setting reader gives disabled; `realResolve` rejects non-ENOENT/ENOTDIR errors; disable wins across env AND setting. |
| `stream_write_file` ensureDir-before-guard | **Still present** | SEC-WT-22 |
| Windows 8.3 | OK / info | SEC-WT-26 |

## 4. Not verified

- Behaviour on POSIX (FIFO tests, `O_NOFOLLOW`) and on macOS/APFS case-insensitivity; the 2 skipped backend tests.
- Real Windows junction/subst/8.3 edge cases beyond the executed tests.
- Dynamic exploitation of SEC-WT-22 (read from code only) and of races (SEC-WT-24).
- That `git worktree add` real worktrees pass on all git versions (covered only by the repo's own fixtures).

## 5. Required actions

| # | Action | Gate |
|---|--------|------|
| 1 | SEC-WT-20: restrict the bare layout + test | Before release (blocking) |
| 2 | SEC-WT-21: propagate the kill switch to the backend env | Before release (blocking) |
| 3 | SEC-WT-22: guard before `ensureDir` on 3 call sites + test | Recommended in this ticket (pre-existing) |
| 4 | SEC-WT-24/25: allowlist hash in `ctxSig`; legacy-gate regression test | Non-blocking |

---

## 6. Round 2 re-review (HEAD `83960f98`)

| Field | Value |
|-------|-------|
| Date | 2026-11-13 |
| Scope | Commits `050cd40b`, `9ccbb5ec`, `826a5a19`, `7532ec8b`, `83960f98` (read in full via `git show`) |
| Method | Code diff review, tests re-run, SEC-WT-20 PoC re-run outside the repo (temp dir under `%TEMP%`, deleted; `Test-Path` returns False). No source file modified. |

### 6.1 Status per finding

| ID | Sev (R1) | Round 2 status | Evidence |
|----|----------|----------------|----------|
| SEC-WT-16 | (closed R1) | **Still CLOSED** | `symlink-containment.ts` not touched by the 5 commits. `worktree-security.test.ts` (symlinkDotDotCollapse / Inside / fake POSIX fs) and extension "SEC-WT-16 checkSymlinkGuard" tests pass. |
| SEC-WT-20 | Medium | **CLOSED** | `050cd40b`: new `bare-layout.ts` `isBareRepoRoot` requires NO `.git` entry (lstat; any non-ENOENT answer = false) plus `HEAD` file, `objects/` and `refs/` dirs. `trust-steps.ts` `parentSet` puts `<S>/worktrees` in `ok` only for a genuine bare S, otherwise in `notBare`, which fails with `submodule_or_unknown_layout`. `admin-steps.ts` `stepCommon` re-checks it for `kind: 'bare'` (defence in depth). Extension copy regenerated; drift check "14 generated files in sync". |
| SEC-WT-21 | Medium | **CLOSED** (one caveat, see 6.3) | `9ccbb5ec`: `mcp-config-builder.ts` `autoTrustEnv()` writes `MCP_WORKTREE_AUTOTRUST=0` unless the setting is unset or exactly `true`. A non-boolean value therefore also disables (fail-closed). The backend `loadTrustConfig(env)` already honours the variable. Test `mcp-config-builder.worktree.test.ts:15-28` covers false/non-boolean (env=0) and unset/true (no key). |
| SEC-WT-22 | Medium | **CLOSED** | `826a5a19`: new `checkSymlinkGuardBeforeEnsureDir` (component-wise `checkFullPathEscape`, needs no existing parent) is called before `ensureDir` in `stream-write.ts`, `embed-image.ts` and `output-proxy.ts` (the old `ensureDir` before the guard in the proxy was moved after it). The post-ensureDir `checkSymlinkGuard` stays. Test `backend-local-tools.worktree.test.ts:91` "SEC-WT-22 symlink guard runs BEFORE ensureDir" passes. I did not read the test body line by line to confirm it asserts that the outside directory is absent. |
| SEC-WT-23 | Low | Open, accepted (unchanged) | Not in the fix set. Already accepted in R1 (SEC-WT-19 rationale). |
| SEC-WT-24 | Low | **CLOSED for the cache part** | `7532ec8b`: `ctxSig` now includes a sha256 of the sorted, folded `allowlistRoots()`. Test `worktree-security.test.ts:126` "removing an allowlist root invalidates a cached positive immediately" passes. The check-then-use race (part 1) remains by design (needs `openat`/`O_NOFOLLOW`), accepted and to be documented. |
| SEC-WT-25 | Low | **CLOSED** | `83960f98`: regression test `backend/src/shared/__tests__/legacy-path-gate.missing-root.test.ts` (2 tests) passes. Test only, no code change. The fail-closed behaviour is intentional. |
| SEC-WT-26 | Info | Open, informational | Unchanged. |
| SEC-WT-27 | Info | Open, informational | Document item, out of code scope. |

### 6.2 Verification executed

| Check | Result |
|-------|--------|
| Backend vitest: `src/shared/worktree-trust`, `multi-worktree-path-resolver.worktree.test.ts` | 4 files, 54 passed, 2 skipped (same 2 skipped as R1, still not identified) |
| Backend vitest: `legacy-path-gate.missing-root.test.ts` | 2 passed |
| Extension vitest: `backend-local-tools.worktree`, `mcp-config-builder.worktree`, `worktree-trust.sync` | 3 files, 17 passed |
| `node scripts/sync-worktree-trust.mjs --check` | 14 generated files in sync |
| Genuine bare repo regression | `worktree-verifier.test.ts` WT-IT-09 (real `git clone --bare` plus `git worktree add`): registered worktree trusted, unregistered rejected. Passes, so the SEC-WT-20 fix does not break the legitimate bare layout. |
| SEC-WT-20 PoC re-run (temp dir outside the repo, real `verifyWorktree` and `nodeFs`, S allowlisted) | Case A (S has `.git/`, `HEAD`, forged `worktrees/x`): `{"trusted":false,"reason":"submodule_or_unknown_layout"}`. Case B (no `.git`, `HEAD` only, no `objects`/`refs`): `{"trusted":false,"reason":"submodule_or_unknown_layout"}`. R1 result was `trusted:true, kind:bare`. Temp dir deleted. |

### 6.3 New or remaining observations (none above Low)

| ID | Sev | Note |
|----|-----|------|
| SEC-WT-28 | Low | SEC-WT-21 is applied only when the MCP config is written (code comment says the same). Changing `worktreeAutoTrust` to `false` takes effect on the backend after reload window / MCP restart, until then the backend can still auto-trust. A security kill switch with a delayed effect; document it in the user guide, or re-inject on `onDidChangeConfiguration`. Not blocking. |
| SEC-WT-29 | Info | `checkSymlinkGuardBeforeEnsureDir` returns `null` when `rootSource !== "workspace"`. This matches the existing guard scope (non-workspace roots are not covered by the symlink guard either), so no regression, but SEC-WT-22 protection applies only to workspace roots. |

### 6.4 Not verified

- The 2 skipped backend tests (same as R1).
- The body of the SEC-WT-22 test (that the outside directory is not created); I confirmed it exists and passes.
- Windows 8.3 and POSIX-specific behaviour (unchanged from section 4).
- The `git status` of the workspace shows unrelated modified files (`.kiro/*`, `documents/SA4E-393/RUN-LOG.md`, `STATUS.json`, checksums). I did not touch them; they are not part of the 5 commits.

### 6.5 Final verdict (Round 2)

| Severity | Open |
|----------|------|
| Critical | **0** |
| High | **0** |
| Medium | **0** (SEC-WT-20, 21, 22 closed) |
| Low | 2 (SEC-WT-23 accepted, SEC-WT-28 new, plus the accepted race in SEC-WT-24) |
| Info | 3 (SEC-WT-26, 27, 29) |

**Verdict: PASS.** No Critical, High or Medium finding is open. The two release-blocking items from Round 1 (SEC-WT-20, SEC-WT-21) are fixed and verified by code, tests and the PoC. SEC-WT-16 remains closed. The overall risk rating drops from MEDIUM to **LOW**. Remaining Low/Info items are non-blocking and can be tracked in the shared backlog (SA4E-438).
