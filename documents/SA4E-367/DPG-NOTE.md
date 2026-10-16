# DevOps Review — SA4E-367 (hotfix, SLA <1h)

**Branch:** SA4E-367 @ `a937785` | **Date:** 2026-10-16 | **Reviewer:** DevOps agent
**Sources:** `TDD.md v1.0`, `TEST-REPORT.md` (QA PASS), `SECURITY-REVIEW.md`, `git show --stat HEAD`

## 1. Deploy impact — extension-only, rebuild vsix required

- Commit touches **6 files, all under `extension/src/`**: 3 prod
  (`tool-definitions.ts`, `mcp-bridge-extension.ts`, `pi-agent-session-host.ts`)
  + 3 tests. `pi-workflow-adapter.ts` is verify-only (0 diff).
- **No backend change** (WrapperServer / backend-local-tools untouched),
  **no DB / migration, no config key, no new dependency** (TDD §2.3, §10.1).
- `out/` + `*.vsix` are gitignored → the fix ships **only via rebuilt artifact**:
  `node esbuild.js --production` (verified 20,296,607 bytes, contains `find_tools` entry)
  then `vsce package` for distribution. Default runtime behavior is byte-identical
  to today (4 concrete tools; pair absent without opt-in).

## 2. Rollback plan — `git revert a937785` is safe

- Single-commit revert, no migration/DB/config to unwind. Rebuild vsix after revert.
- ⚠️ Caveat (TDD §10.2): revert restores the **broken-build tree** (TS2305, missing
  export) — i.e. rollback = back to the known bug, not to a healthy state.
  Acceptable for a hotfix, but rollback should be followed by a forward-fix, not left reverted.
- No data impact: tool schemas are in-memory constants, audit sink is console-only.

## 3. CI gates — code gates green, 2 ENV-blocked steps remain

| Gate | Status |
|------|--------|
| `tsc -p ./ --noEmit` | ✅ exit 0 |
| `esbuild --production` | ✅ build complete |
| Targeted suites (39/39) + full suite (2959/2959) | ✅ 100% |
| Security review | ✅ APPROVED-WITH-CONDITIONS (default-path risk Low; 3 Mediums gate follow-ups, not this hotfix) |
| IDE-host T2 (CHAT tool listing) / T3 (`find_tools`→jira live) | ⚠️ BLOCKED — headless session, no IDE host; unit-level equivalents proven. **Operator follow-up ~4 min in Kiro IDE** (non-blocking for merge, required before prod sign-off) |
| UAT / user acceptance | ⏳ PENDING — **do NOT deploy prod** until done |

## 4. Version/tag — PATCH bump → `v1.53.3`

- Bug fix, deny-by-default, no breaking change → **patch** (not minor).
- Latest tag on main is `v1.53.2` (SA4E-364); next is **`v1.53.3`**.
- ⚠️ Sync flag: `extension/package.json` on this branch still says `1.53.1`
  (diverged before the v1.53.2 bump) — bump to `1.53.3` + README changelog at merge time.

## Verdict

**🟡 DEPLOY-READY: CONDITIONAL YES for merge → main/staging; NO for prod.**
Code + security gates pass and rollback is trivial. Remaining pre-merge:
(1) bump `package.json` → 1.53.3, (2) IDE-host T2/T3 operator check (~4 min),
(3) merge + tag `v1.53.3`. **Prod deploy waits for UAT/user acceptance.**
