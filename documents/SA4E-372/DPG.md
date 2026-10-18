# Deployment Guide — SA4E-372

**Version**: 1.53.10  
**Ticket**: SA4E-372  
**Status**: Ready for deployment  

---

## 1. Release Summary

| Item | Value |
|------|-------|
| Extension Version | 1.53.10 |
| VSIX File | `sdlc-agents-4-enterprise-1.53.10.vsix` (10.77 MB, 1883 files) |
| Target Platform | VS Code / Kiro (Windows, Linux, macOS) |
| Minimum Kiro Version | Compatible with current stable |
| Breaking Changes | None (backward compatible) |

---

## 2. Artifacts

### 2.1 Source Changes (Extension)

**New Files**:
```
extension/webview-assets/chat/chat-cycle.js          (199 lines)
extension/webview-assets/chat/chat-blocks.css        (49 lines)
extension/src/__tests__/remote-checkpointer-store.test.ts
extension/src/__tests__/chat/r1-orphan-adoption.test.ts
extension/src/__tests__/chat/persist-restore-contract.test.ts
```

**Modified Files**:
```
extension/webview-assets/chat/chat-stream.js         (87 lines, rewrite)
extension/webview-assets/chat/chat-tools.js          (154 lines, per-cycle rewrite)
extension/webview-assets/chat/chat-toolcall.js       (197 lines, +orphan tracking +sticky)
extension/webview-assets/chat/chat-tool-helpers.js   (198 lines, +adoption helpers)
extension/webview-assets/chat/chat-messages.js       (112 lines, +think-only guard)
extension/webview-assets/chat/chat-pipeline.js       (minor)
extension/webview-assets/chat/chat-core.js           (minor)
extension/webview-assets/chat/chat-tabsync.js        (minor)
extension/webview-assets/chat/chat-init.js           (minor)
extension/webview-assets/chat/index.html             (dev-only sync)
extension/src/chat-panel/ChatHtmlBuilder.ts          (SCRIPTS order + chat-blocks.css)
extension/src/pi-workflow/remote-checkpointer-store.ts (soft-fail, 7 lines)
```

**BR-18 Webview Split (ride-along)**:
```
30 new chat-*.js modules (chat-attachments, chat-chips, chat-codeactions, ...)
7 deleted files (chat.js, chat.css, settings.js, graph-viz.js, etc.)
```

### 2.2 Documentation

```
documents/SA4E-372/BRD.md
documents/SA4E-372/FSD.md
documents/SA4E-372/TDD.md
documents/SA4E-372/STP.md
documents/SA4E-372/STC.md
documents/SA4E-372/UG.md
documents/SA4E-372/DPG.md (this file)
documents/SA4E-372/RUN-LOG.md
documents/SA4E-372/STATUS.json
```

### 2.3 Version Bump

```
extension/package.json:     1.53.9 → 1.53.10
extension/CHANGELOG.md:     Added v1.53.10 entry
README.md:                  Updated version badge + changelog link
```

---

## 3. Build & Package Process

### 3.1 Prerequisites

```bash
# Node.js 18+ (bundled with Kiro)
# pnpm/npm available
cd extension
npm ci                    # Install dependencies
```

### 3.2 Build Commands

```bash
# Production build (esbuild)
npm run esbuild-production

# Package VSIX (no dependencies bundling)
npx vsce package --no-dependencies
# Output: sdlc-agents-4-enterprise-1.53.10.vsix
```

### 3.3 Verify Build

```bash
# TypeScript compilation
npx tsc -p ./ --noEmit
# → 0 errors

# ESLint
npx eslint src/
# → 0 errors

# Smoke test
node scripts/smoke-bundle/run-smoke.js
# → SMOKE PASSED

# Unit tests
npx vitest run --reporter=dot
# → 3075/3077 PASS (2 SA4E-371 external debt)
```

---

## 4. Installation

### 4.1 Via Kiro CLI (Recommended)

```bash
# Force reinstall (overwrites existing)
kiro --install-extension sdlc-agents-4-enterprise-1.53.10.vsix --force
```

### 4.2 Via VS Code / Kiro UI

1. Open Extensions panel (`Ctrl+Shift+X`)
2. Click `...` → "Install from VSIX..."
3. Select `sdlc-agents-4-enterprise-1.53.10.vsix`
4. Reload Window (`Ctrl+Shift+P` → "Reload Window")

### 4.3 Verify Installation

1. Open Command Palette → "SDLC Chat: Focus on Chat Panel View"
2. Panel opens with new chat blocks UI
3. Send test message → observe per-cycle blocks

---

## 5. Configuration

### 5.1 Required Settings (User/Workspace)

```json
{
  "sdlcAgents.llmProvider": "lmstudio",
  "sdlcAgents.llmModel": "qwen-text",
  "sdlcAgents.lmstudioBaseUrl": "http://localhost:1234/v1",
  "sdlcAgents.proxy.mode": "none",
  "sdlcAgents.backend.url": "http://127.0.0.1:48721",
  "sdlcAgents.mcpServerPort": 9181,
  "sdlcAgents.enableMcpServer": true
}
```

### 5.2 Optional: Backend Authentication

For full checkpoint persistence (optional):

1. Open Chat Panel → Backend status row → "Login"
2. Enter credentials (default admin / your password)
3. Or set via settings: `sdlcAgents.backend.username`, `sdlcAgents.backend.password` (secret storage)

**Note**: Without backend auth, checkpoint persistence fails silently (soft-fail) — chat works normally, only remote session mirror is skipped.

---

## 6. Rollback Procedure

If critical issues found post-deployment:

```bash
# 1. Uninstall current
kiro --uninstall-extension dnguyenminh.sdlc-agents-4-enterprise

# 2. Install previous version (1.53.9)
kiro --install-extension sdlc-agents-4-enterprise-1.53.9.vsix --force

# 3. Reload Window
```

**Data Compatibility**: v1.53.10 reads v1.53.9 state (backward compatible). Downgrade to 1.53.9 reads 1.53.10 state (forward compatible — extra fields ignored).

---

## 7. Health Checks

| Check | Command | Expected |
|-------|---------|----------|
| Extension loads | `kiro --list-extensions | grep sdlc-agents` | `dnguyenminh.sdlc-agents-4-enterprise@1.53.10` |
| Panel opens | Ctrl+Shift+P → "SDLC Chat: Focus..." | Panel visible, no errors in DevTools console |
| LLM connection | Send "hello" | Response streams, thinking block appears |
| Tool execution | "list files in workspace" | Tool container renders, tools execute |
| Persistence | Reload Window → open panel | History restored, sticky flags intact |

---

## 8. Monitoring & Logs

### 8.1 Extension Logs

- Output Panel → "SDLC Agents Debug" — debugLog output (redacted)
- DevTools Console (webview) — client-side errors

### 8.2 Key Log Patterns

```
[KbRemoteCheckpointerStore] checkpoint save skipped (fail-open)  # Soft-fail OK
[Chat] turn via=legacy ext=1.53.10 ... tools=12 used=2          # Turn execution
HTTP 401: Authentication required                               # Backend auth missing (expected if not logged in)
```

### 8.3 Alerting Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| Turn error rate | >5% | >10% |
| Checkpoint 401 rate | >50% (means no auth) | N/A |
| Panel load time | >3s | >5s |

---

## 9. Known Issues & Workarounds

| Issue | Workaround | Target Fix |
|-------|------------|------------|
| SA4E-371: 2 test failures (ui-scenarios, compaction) | External debt — no runtime impact | SA4E-371 to fix prompt packaging |
| Backend checkpoint 401 (no auth) | Login to backend or accept soft-fail | User action / doc |
| Prompt files not shipped (SA4E-371) | Graceful fallback to default prompt | SA4E-371 to add esbuild copy |

---

## 10. Support Contacts

| Role | Contact |
|------|---------|
| Release Engineer | DevOps-agent |
| Extension Maintainer | DEV-agent |
| QA Lead | QA-agent |
| Product Owner | User (Jira SA4E-372) |

---

## 11. Sign-off Checklist

| Item | Done | Verified By |
|------|------|-------------|
| Build passes (tsc/eslint/smoke) | ✅ | DEV |
| Unit tests PASS | ✅ (9/9 new) | QA |
| Full suite PASS (modulo external) | ✅ (3075/3077) | QA |
| UAT R1/R2/R3 PASS | ✅ (CDP 9341/9342) | SM |
| Docs complete (BRD/FSD/TDD/STP/STC/UG/DPG) | ✅ | SM |
| Version bump + README | ✅ | DevOps |
| VSIX packaged & installed | ✅ | DevOps |

---

**Deployment Approved**: ✅ Ready for production push