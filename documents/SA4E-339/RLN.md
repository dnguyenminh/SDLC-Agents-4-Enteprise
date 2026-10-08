# [SA4E-339] Release Notes (RLN)
**Version:** 1.0
**Status:** Draft — pending SM review
**Author:** devops-agent
**Ticket:** SA4E-339 — Fix Automatic Session Compaction Hook in ChatPanelProvider
**Target Release:** v1.47.2 (proposal)

---

## 1. Release Summary

**SA4E-339** fixes the missing automatic session compaction hook in `ChatPanelProvider`. Previously, when context-window usage reached 95–100%, the chat session overflowed and showed the red `Context window is full. Start new tab` banner, forcing users to abandon the tab. Now the extension automatically compacts the session at the threshold: conversation history is replaced by a `[compaction]` summary + 2 most recent messages, and the context meter drops toward the safe zone (<70%) — no new tab, no interruption.

### Highlights

- 🔵 **Auto-compaction wired in** — `SessionMonitor.shouldCompact()` consulted every turn (`updateContextUsageAfterTurn`), single source of truth `COMPACT_USAGE_THRESHOLD = 0.95`.
- 🔵 **Effective boundary 94.5%** — usage percentage is `Math.round`-ed before normalization, so compaction triggers from 94.5% true usage (documented + tested, STC-339-05).
- 🔵 **History preserved safely** — summary (`role: 'user'`, `[compaction]` prefix) + 2 recent messages; never fewer, never empty.
- 🔵 **Non-fatal by design** — every failure path (summarizer throw → truncate fallback, missing engine API → silent skip) keeps the chat usable (NFR-02).
- 🔵 **Security controls enforced** — SEC-330-01 (role elevation prevention), SEC-330-02 (usage scale contract, clamped `[0,1]`).
- 🔵 **SA4E-182 preserved** — steering + MCP tool-definition token accounting blocks untouched; 178/178 chat regression tests pass.

---

## 2. Changes

| Type | Change | File |
|---|---|---|
| Feature | Wire `SessionCompactor` into turn lifecycle; auto-trigger at ≥0.95; extract helpers `buildCompactableSession` / `applyCompactionAndRecount`; refetch payload after compaction (AC-04) | `extension/src/chat-panel/chat-panel-provider.ts` |
| Tests | New compaction test suite: 11 tests mapping STC-339-01…11 (threshold, 94.5% boundary, ≤2-message guard, engine null, non-compact actions, SEC-330-01/02, AC-05 regression) | `extension/src/chat-panel/__tests__/chat-panel-provider.compaction.test.ts` |
| Docs | BRD v1.2, FSD v1.2, TDD v1.1, STP v1.3, STC v1.3, TEST-REPORT v1.4, UG v1.0, DPG v1.0, RLN (this) + 10 diagrams (drawio + PNG) | `documents/SA4E-339/` |

---

## 3. Verification Evidence

| Gate | Result | Source |
|---|---|---|
| `npx tsc --noEmit` | EXIT=0 | TEST-REPORT.md |
| `npm run lint` | EXIT=0 | TEST-REPORT.md |
| Compaction suite | 11/11 PASSED | TEST-REPORT.md §3.2 |
| Chat regression suite (`__tests__/chat`) | 178/178 PASSED | TEST-REPORT.md §3.3 |
| Full suite | 249 files / 2395 tests / 0 fail (2026-10-07 17:58) | TEST-REPORT.md §3.1 |
| Security review | PASS-with-fixes — 0 Critical/High | RUN-LOG round 3/4 |
| Document review | 4 rounds; round 4: 9/9 DoD met, 0 NOT DONE | STATUS.json |

**⚠️ Out-of-scope known failure:** `layout.integration.test.ts` (webview) currently fails due to an untracked `svelte-compile-helper.ts` (another WIP session) importing `svelte/store` unresolved from the extension root. **Not caused by SA4E-339**; SA4E-339 scope tests all pass. Fix tracked separately with the webview WIP.

---

## 4. Breaking Changes

**None.** No public API, config, storage, or network contract changed.

---

## 5. Migration Notes

**None required.** The feature introduces no persistent storage; existing workspace/chat state remains compatible. After upgrading, the extension host reloads automatically — users see the new behavior on the next chat turn.

---

## 6. Version-Sync Check (guardrail #4 — trước khi tag)

⚠️ **DISCREPANCY DETECTED — KHÔNG TAG cho đến khi đồng bộ:**

| Artifact | Current state |
|---|---|
| `package.json` (root / extension / backend) | **1.47.0** |
| Git tags | `v1.47.0` ✅, `v1.47.1` ⚠️ (tag tồn tại nhưng packages KHÔNG bump lên 1.47.1) |
| README changelog | `v1.47.1 (2026-10-04)` + install ref `1.47.1.vsix` ⚠️ (vsix 1.47.1 không khớp package 1.47.0) |

**Required trước release SA4E-339:**
1. Quyết định: re-tag v1.47.1 đúng cách (bump packages → 1.47.1) hoặc bỏ tag; khuyến nghị bump cả 3 package.json lên **1.47.2** cho SA4E-339 (bugfix trên nền 1.47.0) và ghi changelog khớp.
2. Update 3 `package.json` (root, extension, backend) → cùng một version.
3. Update README changelog + vsix install reference khớp version.
4. Sau đó mới: `git tag v<version>` + package .vsix khớp.

## 7. Install (sau release)

```powershell
kiro --install-extension sdlc-agents-4-enterprise-<version>.vsix
```

---

## 8. Known Limitations (carry-over)

1. `COMPACT_USAGE_THRESHOLD = 0.95` là hằng số trong code — chưa cấu hình runtime.
2. `modelId` cố định `"default"` (quyết định D-1a) — accessor model-id thật chưa có.
3. Summary không persist giữa các tab/session.
4. Carry-over Medium/Minor (không block): STC-339-09 tautological, TDD §4 missing `formatSummaryMessage` ref, BRD AC-05 stale note.

---

*End of Release Notes — SA4E-339 v1.0*
