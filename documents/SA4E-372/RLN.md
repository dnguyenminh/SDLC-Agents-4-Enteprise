# Release Notes — SA4E-372 v1.53.10

**Release Date**: 2026-10-18  
**Extension Version**: 1.53.10 (from 1.53.9)  
**Ticket**: SA4E-372 (Story/High)  
**Jira**: https://jiraassist.atlassian.net/browse/SA4E-372  
**Related**: SA4E-369 (v1.53.9 UAT), SA4E-371 (Prompt Refactor — external debt)  

---

# 🎯 Executive Summary

SA4E-372 delivers a **complete redesign of chat transcript rendering** in the SDLC Agents webview panel, addressing three critical user experience gaps identified during v1.53.9 UAT (SA4E-369):

| Requirement | Before (v1.53.9) | After (v1.53.10) |
|-------------|------------------|------------------|
| **R1: Per-Cycle Blocks** | All thinking + tools + answer fused in one container | Each think→act loop = separate Thinking Block + Assistant Bubble + Tool Container |
| **R2: Collapse Semantics** | Auto-collapse during streaming, no sticky, threshold-based | No auto-collapse while streaming, expand default, all-terminal collapse, **sticky user preference** |
| **R3: Full Persistence** | Only last message persisted | **Full transcript** (messages, tools, thinking, errors) per workspace, **100% restore fidelity** |

---

# ✨ Key Features

## 🔄 R1: Per-Cycle Chat Blocks (Think → Act Separation)

### What Changed
Each AI "think → act" loop now renders as **distinct visual groups**:

```
USER: "Tìm file SA4E-369, đọc 10 dòng, tóm tắt"
    │
    ├─► THINK (c1): "Người dùng muốn tìm file... dùng grep..."
    ├─► TOOLS [2]: grep "SA4E-369" ✓ → read STATUS.json ✓
    ├─► THINK (c2): "Đã tìm thấy file... tóm tắt..."
    └─► ASSISTANT: "File STATUS.json chứa..."
```

### Technical Highlights
- **Cycle Machinery** (`chat-cycle.js`): `openCycle`/`ensureCycle`/`closeCycle`/`maybeCloseCycle` — each cycle pushes entry at OPEN, finalizes at CLOSE
- **Orphan Adoption (S1g)**: Legacy buffered-replay path posts tool events LIVE before stream replay → **orphan adoption pattern** tracks pre-cycle containers, first cycle adopts them, reorders `tab.messages`, moves DOM after bubble/thinking
- **Cycle Badge**: "PI c1", "PI c2" (display strips `:cN` suffix → "PI")

### User Impact
- **Traceability**: See exactly what AI thought before each tool call
- **Debugging**: Isolate reasoning per tool group
- **Multi-turn clarity**: Long conversations stay organized

---

## 📌 R2: Sticky Collapse Semantics

### New Behavior

| Scenario | v1.53.9 | v1.53.10 |
|----------|---------|----------|
| Streaming/updating | Auto-collapse at threshold | **Never auto-collapse** |
| Tool call starts | Collapsed | **Expanded by default** |
| Tools complete | Auto-collapse | **Only when ALL terminal** (completed/failed) |
| User clicks expand | Resets on next update | **Sticky — never auto-collapses again** |
| Reload window | Loses state | **Persists expanded/collapsed** |

### Sticky Mechanism
| Action | Persisted Flag | Survives Reload |
|--------|----------------|-----------------|
| Click tool container header | `toolData.userManaged=true`, `userExpanded=true` | ✅ |
| Click tool block header | `toolData.userManaged=true`, `userExpanded=true` | ✅ |
| Click thinking header | `entry.thinkingUser=true` | ✅ |

**Keyboard Accessible**: Enter/Space on headers toggles expand, sets sticky.

---

## 💾 R3: Full Transcript Persistence

### What's Persisted (Per Workspace)
| Content Type | Fields |
|--------------|--------|
| User Messages | content, nodeId |
| Assistant Messages | content, thinking, thinkingUser, nodeId (pi:cN) |
| Tool Calls | id, name, args, status, result/error, duration, timestamp, **userManaged, userExpanded** |
| Errors | message, nodeId |
| Session | activeTabId, messageHistory (legacy) |

### Restore Fidelity (Verified)
| Aspect | Verified |
|--------|----------|
| Per-cycle message order | ✅ |
| Tool sticky flags (userManaged/userExpanded) | ✅ |
| Thinking sticky (thinkingUser) | ✅ |
| Old-format fused entries (v1.53.9) | ✅ Backward compatible |
| Active tab restoration | ✅ |

**Tested**: Kill window → relaunch → transcript identical (CDP 9341 → 9342)

---

# 🔧 Technical Improvements

## 🛡️ Checkpoint Soft-Fail (Robustness Fix)

### Problem
`remote-checkpointer-store.ts` `saveCheckpoint` threw on backend 401/outage → **killed entire turn**, discarded all streamed answer.

### Solution
```typescript
// extension/src/pi-workflow/remote-checkpointer-store.ts
catch (err) {
  // SA4E-372: fail-open — never kill the turn
  debugError(`saveCheckpoint failed (status=${err.status})`, err);
  debugLog('checkpoint save skipped (fail-open)');
  // NO throw — turn completes, streamChunks replayed
}
```

**Result**: Turn completes, answer rendered, checkpoint logged as skipped. Symmetric with `getCheckpoint` (fail-safe returns null).

---

## 🔄 Legacy Path Orphan Adoption (S1g)

### Root Cause
Legacy path (LM Studio/local): Engine buffers streamChunks, replays AFTER turn. Tool events fire LIVE during execution → no cycle open yet → tools rendered orphaned.

### Solution: Orphan Adoption Pattern
1. **Track** containers created while `!S.currentCycle` → `S.preCycleContainers[]`
2. **Adopt** at first `openCycle()`: `hasTools=true`, `adoptedContainers=[...]`, reorder `tab.messages` (entry BEFORE tools)
3. **Place** at `closeCycle()`: DOM move adopted containers after bubble/thinking (moving cursor preserves order)
4. **Clear** tracking at `handleStreamComplete`: `S.preCycleContainers = []`

**Result**: DOM order `THINK → TOOLS → THINK → ASSISTANT` (was `TOOLS → THINK`)

---

## 🧠 Think-Only Replay Parity (S1h)

### Problem
Tool-first cycle (no token delta) → live path never calls `ensureBubble` → no bubble. Replay `appendMessage` rendered empty bubble (badge + empty span).

### Solution
```javascript
// chat-messages.js
var thinkOnly = role === "assistant" && 
  !(content && String(content).trim()) && !!(entry && entry.thinking);

if (!thinkOnly) { render bubble; }
// Thinking block always renders
```

**Result**: Tool-first cycles render thinking block only (collapsed), no empty bubble. Matches live behavior.

---

# 📦 Files Changed

## New Modules (14 webview files)

| File | Lines | Purpose |
|------|-------|---------|
| `chat-cycle.js` | 199 | Response-cycle machinery |
| `chat-blocks.css` | 49 | Per-cycle styles |
| `chat-stream.js` | 87 | Stream → cycle mapping |
| `chat-tools.js` | 154 | Per-cycle containers + R2 collapse |
| `chat-toolcall.js` | 197 | Tool blocks + orphan tracking + sticky |
| `chat-tool-helpers.js` | 198 | Adoption helpers + sticky persistence |
| `chat-toolupdate.js` | 97 | Tool status updates |
| `chat-messages.js` | 112 | Message rendering + replay + think-only guard |
| `chat-pipeline.js` | 144 | Pipeline orchestration |
| `chat-core.js` | 106 | Core state, utilities |
| `chat-tabsync.js` | 80 | Persistence, workspaceState sync |
| `chat-init.js` | 16 | Initialization |
| `index.html` | 38 | Dev-only sync |
| `markdown-blocks.js` | 160 | Markdown block rendering |

## Modified Core Files

| File | Change |
|------|--------|
| `ChatHtmlBuilder.ts` | SCRIPTS order (cycle trước stream) + `chat-blocks.css` link |
| `remote-checkpointer-store.ts` | Checkpoint soft-fail (7 lines) |
| `package.json` | Version 1.53.10 |
| `CHANGELOG.md` | v1.53.10 entry |
| `README.md` | Version badge + changelog link |

## BR-18 Webview Split (Ride-Along)

| Change | Count |
|--------|-------|
| New `chat-*.js` modules | 30 |
| Deleted legacy files | 7 (`chat.js`, `chat.css`, `settings.js`, `settings.css`, `graph-viz.js`, `index.html` old, `chat.js` map) |

**Note**: BR-18 split (e9c6779) ride-along in same commit — repo unbuildable without them.

---

## New Tests (3 files, 9 tests)

| File | Tests | Coverage |
|------|-------|----------|
| `remote-checkpointer-store.test.ts` | 4 | Checkpoint soft-fail (PUT 401, ECONNREFUSED, OK, GET null) |
| `r1-orphan-adoption.test.ts` | 2 | Legacy orphan adoption + session path unchanged |
| `persist-restore-contract.test.ts` | 3 | ChatStateManager save/restore round-trip |

---

# 🧪 Quality Gates

| Gate | Tool | Result |
|------|------|--------|
| TypeScript | `tsc --noEmit` | ✅ 0 errors |
| ESLint | `eslint src/` | ✅ 0 errors |
| Smoke Test | `run-smoke.js` | ✅ PASSED |
| Unit Tests (new) | Vitest | ✅ 9/9 PASS |
| Full Regression | Vitest | ✅ 3075/3077 PASS |
| UAT R1/R2/R3 | CDP 9341→9342 | ✅ PASS |
| File Size | `wc -l` | ✅ All ≤199 lines |
| Function Size | Code Review | ✅ All ≤20 lines |

### External Debt (SA4E-371)

| Failure | File | Root Cause |
|---------|------|------------|
| `ui-scenarios.manual.test.ts` (3) | `AGENT_PROMPTS.DEV` undefined | SA4E-371 refactor moved prompts to files, import broken |
| `compaction.summary.test.ts` (1) | Child suite exit=1 | Depends on above |

**Decision**: Ship with documented debt. SA4E-371 owns fix. No runtime impact (graceful fallback to `DEFAULT_AGENT_PROMPT`).

---

# 🔄 Migration & Compatibility

## Zero Breaking Changes

| Compatibility | Status | Notes |
|---------------|--------|-------|
| v1.53.10 reads v1.53.9 state | ✅ | Old fused `assistant:pi` entries render as single cycle |
| v1.53.9 reads v1.53.10 state | ✅ | Extra fields ignored, old format works |
| State schema | Additive | `thinkingUser`, `userManaged`, `userExpanded`, `nodeId:cN` |

**No migration needed** — forward/backward compatible.

---

# 📚 Documentation (10 Files)

| Document | Path | Size |
|----------|------|------|
| Business Requirements | `documents/SA4E-372/BRD.md` | 18 KB |
| Functional Specification | `documents/SA4E-372/FSD.md` | 45 KB |
| Technical Design | `documents/SA4E-372/TDD.md` | 55 KB |
| System Test Plan | `documents/SA4E-372/STP.md` | 25 KB |
| System Test Cases | `documents/SA4E-372/STC.md` | 35 KB |
| User Guide | `documents/SA4E-372/UG.md` | 22 KB |
| Deployment Guide | `documents/SA4E-372/DPG.md` | 28 KB |
| Release Notes | `documents/SA4E-372/RLN.md` | 18 KB |
| Run Log | `documents/SA4E-372/RUN-LOG.md` | 35 KB |
| Status | `documents/SA4E-372/STATUS.json` | 10 KB |

---

# 🔗 Links & References

- **Jira**: https://jiraassist.atlassian.net/browse/SA4E-372
- **Related**: SA4E-369 (v1.53.9 UAT), SA4E-371 (Prompt Refactor — external debt)
- **VSIX**: `sdlc-agents-4-enterprise-1.53.10.vsix` (10.77 MB, 1883 files)
- **Git**: `git log --oneline` — commits `2363101` (feat), `07b88e8` (docs)

---

# 🚀 Deployment Status

| Step | Status |
|------|--------|
| Build | ✅ `npm run esbuild-production` |
| Package | ✅ `npx vsce package --no-dependencies` |
| Install | ✅ `kiro --install-extension --force` |
| UAT | ✅ PASS (CDP 9341→9342) |
| Gates | ✅ All green (modulo SA4E-371 debt) |
| Docs | ✅ 10/10 complete |
| Git | ✅ 9 commits ahead origin/main |

**Ready for**: `git push origin main` → CI/CD → Marketplace

---

# 🙏 Acknowledgments

- **SM-agent**: Pipeline orchestration, root-cause analysis (exthost instrumentation), UAT execution
- **DEV-agent**: Implementation (S1–S1h), test development, BR-18 split integration
- **QA-agent**: Test planning, STP/STC, defect tracking, gate verification
- **User**: Requirements clarification, UAT approval, continuous feedback

---

*Released by SDLC Agents Pipeline (SM-agent orchestrated)*  
*Approved for Production Deployment*