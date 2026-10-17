# SA4E-365 — UAT Deployment Report (Kiro Extension)

**Date:** 2026-10-16 (7:36 AM local)
**Environment:** UAT (local Kiro IDE — user acceptance testing)
**Branch:** `SA4E-365` @ `2512421` (chore(git): ignore .pi/sessions/ — SDK persists reasoning transcripts, F-2 fix)
**Status:** ✅ INSTALL OK

---

## 1. Summary

| Item | Value |
|------|-------|
| Extension ID | `dnguyenminh.sdlc-agents-4-enterprise` |
| Version installed | **1.53.1** |
| Package mode | `package:prod` (esbuild-production + copy-resources + gen-checksums + vsce) — prod pipeline passed, **no debug fallback needed** |
| VSIX | `sdlc-agents-4-enterprise-1.53.1.vsix` (1544 files, 10.19 MB) |
| Install target | Kiro CLI (`C:\Users\ASUS\AppData\Local\Programs\Kiro\bin\kiro.cmd`) with `--force` |
| Build source | Dedicated git worktree (NOT the main working dir — main is checked out to `SA4E-362` by another session) |
| MCP | DOWN — all steps executed via shell + local files only |

---

## 2. Pre-Build Verification (worktree isolation)

Main working dir `C:\projects\kiro\SDLC-Agents-4-Enterprise` is checked out to `SA4E-362` by a **different session** and its tree lacks `mcp-bridge-extension.ts` (F-1). Therefore the build was done in an isolated worktree.

**Commands & results:**

```
git worktree add "$env:LOCALAPPDATA\Temp\opencode\sa4e-365-deploy" SA4E-365
→ EXIT=0, HEAD is now at 2512421 (F-2 fix commit)

git merge-base --is-ancestor 2512421 HEAD   → EXIT=0 ✅
git merge-base --is-ancestor 78b667b HEAD   → EXIT=0 ✅ (merge commit
  "Merge branch 'SA4E-364' into SA4E-365 — bring buildMcpBridgeAgentTools
   into tree (F-1 fix)" is in history)
Test-Path extension/src/pi-agent/extensions/mcp-bridge-extension.ts → True ✅
```

> Note: the task brief referenced `extension/src/mcp-bridge-extension.ts`; the actual
> path after the SA4E-364 merge is `extension/src/pi-agent/extensions/mcp-bridge-extension.ts`.
> F-1 is confirmed resolved.

Extension metadata (from `extension/package.json`): publisher `dnguyenminh`, name `sdlc-agents-4-enterprise`, version `1.53.1`.

---

## 3. Build Steps

| # | Step | Command | Result |
|---|------|---------|--------|
| 1 | Worktree | `git worktree add %TEMP%\opencode\sa4e-365-deploy SA4E-365` | ✅ EXIT=0 |
| 2 | Deps | `npm ci` (root; workspaces `backend`+`extension`; postinstall `patch-vendored-deps.mjs` ran; note Node v24.8.0 vs engines `22.x` — npm warn only, no block) | ✅ EXIT=0, 1230 pkgs, ~2m |
| 3 | tsc gate | `cd extension && npm run compile` | ✅ EXIT=0, no type errors |
| 4 | Package prod | `npm run package:prod` | ✅ EXIT=0 → 105 checksums generated (v1.53.1), vsix packaged 10.19 MB |
| 5 | Bundle sanity | `Test-Path extension/out/pi-agent/extensions/mcp-bridge-extension.js` | ✅ True (fix bundled) |
| 6 | Locate Kiro CLI | `Get-Command kiro` → `C:\Users\ASUS\AppData\Local\Programs\Kiro\bin\kiro.cmd` | ✅ found on PATH |
| 7 | Install | `& kiro.cmd --install-extension <vsix> --force` | ✅ "successfully installed", EXIT=0 |
| 8 | Verify | `& kiro.cmd --list-extensions --show-versions \| Select-String sdlc` | ✅ `dnguyenminh.sdlc-agents-4-enterprise@1.53.1` |

Install dir confirmed fresh: `%USERPROFILE%\.kiro\extensions\dnguyenminh.sdlc-agents-4-enterprise-1.53.1` (LastWriteTime 2026-10-16 7:36 AM).

---

## 4. Artifacts

- **VSIX (reusable for SIT/reinstall):**
  `C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e-365-deploy\extension\sdlc-agents-4-enterprise-1.53.1.vsix`
- **Worktree (KEPT for future SIT build — do not delete):**
  `C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e-365-deploy` (branch `SA4E-365` @ `2512421`, node_modules installed)
  - If cleanup is ever required: remove any `node_modules` junction first, then `git worktree remove`.

---

## 5. User Instructions (UAT)

1. **Reload Kiro window** (required for the new 1.53.1 to take effect):
   - `Ctrl+Shift+P` → **"Developer: Reload Window"** (or restart Kiro entirely).
2. **Verify version**: Extensions panel (`Ctrl+Shift+X`) → search `SDLC Agents 4 Enterprise` → should show **1.53.1**.
3. **Verify the thinking fix (SA4E-365 scope)**:
   - Run any SDLC agent task and observe that the agent's **thinking/reasoning block renders correctly** (no raw/persisted reasoning transcript leakage from `.pi/sessions/`).
   - **F-2 check**: `git status` in any repo workspace must **not** show `.pi/sessions/` as untracked/modified (it is now gitignored by the SDK).
4. **F-1 regression check**: agent flows that use MCP bridge tools (`buildMcpBridgeAgentTools`) should complete without "missing module" errors.

## 6. Rollback (if UAT fails)

```
# Reinstall the previous known-good vsix if available, e.g.:
& "C:\Users\ASUS\AppData\Local\Programs\Kiro\bin\kiro.cmd" `
  --install-extension <path-to-previous>.vsix --force
# Then reload the Kiro window.
```
No DB/server-side changes are involved in this deployment — rollback is extension reinstall + window reload only.

## 7. Notes / Observations

- `%USERPROFILE%\.kiro\extensions\` still contains an **orphaned** `dnguyenminh.sdlc-agents-4-enterprise-1.31.0` folder (from 2026-08-20) and an old loose `sdlc-agents-4-enterprise-1.25.0.vsix`. They are inactive (CLI lists only 1.53.1) — left untouched; optional manual cleanup.
- `npm ci` emitted deprecation/audit warnings (11 vulnerabilities: 4 moderate, 7 high) — pre-existing, not introduced by SA4E-365; no action taken per deployment scope.
- Nothing was pushed; `SA4E-362` checkout, `master`, and other branches were not touched.
