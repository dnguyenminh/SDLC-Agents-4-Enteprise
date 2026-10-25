# DPG — SA4E-381-chat-ux: Deployment Guide

**Ticket:** SA4E-381-chat-ux  
**Document:** Deployment Guide — v1.0  
**Ticket version:** 1.55.6  
**Author:** DevOps Agent  
**Date:** 2026-10-25  
**Status:** Draft  

---

## 1. Overview

**Feature:** SDLC CHAT Transcript Redesign — thinking block 3 trạng thái (STREAMING / COLLAPSED / EXPANDED) + work-trace container mỗi lượt (Q → trace → A).  
**Scope:** Webview-only. 16 file trong `extension/webview-assets/chat/` (3 mới: `chat-tabroute.js`, `chat-trace.js`, `chat-jump-pill.js`; 13 sửa) + `extension/src/chat-panel/ChatHtmlBuilder.ts` sửa.  
**Host protocol:** KHÔNG thay đổi — `originTabId` đã có từ SA4E-381 Issue 1 (TDD §3.1).  
**Target environments:** Local Kiro profile (manual install via VSIX).  
**Artifact:** `extension/sdlc-agents-4-enterprise-1.55.6.vsix` (2073 files, 11.05 MB).

---

## 2. Prerequisites

| Item | Detail |
|------|--------|
| VS Code / Kiro | vscode ^1.85.0 (package.json engines L14) |
| VSIX file | `extension/sdlc-agents-4-enterprise-1.55.6.vsix` |
| Extension profile | Kiro profile `~/.kiro/extensions/dnguyenminh.sdlc-agents-4-enterprise-1.55.6` |
| Access | Kiro window, `kiro --install-extension` CLI, Reload Window |
| Previous version | v1.55.5 artifact (for rollback), if available |

---

## 3. Pre-Deployment Checklist

- [ ] Code merged to release branch (main)
- [ ] All tests passed: 107 TC + 24 E2E-UI + 6 PBT ALL PASS (TEST-REPORT.md L21-24)
- [ ] Regression suite: 3,272/3,272 PASS, `tsc` 0 errors (TEST-REPORT.md L102-104)
- [ ] Go/No-Go = GO (TEST-REPORT.md L131)
- [ ] VSIX 1.55.6 built: `extension/sdlc-agents-4-enterprise-1.55.6.vsix`
- [ ] Rollback artifact v1.55.5 identified (if available)
- [ ] Configuration unchanged (host protocol NOT changed — TDD §3.1)
- [ ] Rollback plan reviewed (Section 8)

---

## 4. Database Migration

**Không có.** Ticket này chỉ thay đổi webview (frontend presentation). Không có database, không có schema migration, không có script migration.  
**Nguyên nhân:** `tab.messages` stays flat chronological; trace is presentation-only render-time grouping wrapper (TDD §9, §10.3).

---

## 5. Application Deployment

### 5.1 Install extension (DEV / local profile)

```powershell
kiro --install-extension extension\sdlc-agents-4-enterprise-1.55.6.vsix --force
```

### 5.2 Reload Window

Sau khi install thành công, thực hiện **Reload Window** để extension kích hoạt phiên bản mới.

### 5.3 Verify installation

1. Mở Kiro → tab SDLC Agents → `sdlcAgents.status` confirm extension active.
2. Mở Chat Panel (`sdlcAgents.openAgenticChat`), webview `ready` handshake posted (TDD §13.1).
3. `window.ChatState` present in webview DOM.

---

## 6. Configuration Changes

**Không có cấu hình mới cần cập nhật.**  
- Host protocol không đổi (`originTabId` đã có — TDD §3.1).
- Không có environment variable mới.
- Không có feature flag.

---

## 7. Post-Deployment Verification

| Check | Expected | Evidence source |
|-------|----------|-----------------|
| peer_list không loop | `peer_list` không lặp lại vô hạn khi switch tab | TDD §5.4 |
| Response render đúng tab | Response render đúng active tab, không bleed sang tab khác | TDD §5, chat-tabroute.js |
| Thinking không co 1 dòng | `.thinking-block.collapsed` hiển thị chevron `▸` + `Thinking · N chars · Ns`, min-height 28px | TDD §4.2, §7.1 |
| Work-trace group Q→trace→A | `.work-trace` với `.trace-summary` chứa `⚙ Work trace · N tools · ...`, `.trace-body` ẩn khi collapsed | TDD §5.1, §7.1 |
| Trace sticky | Click trace summary → `data-user-managed="true"`; turn ends → trace giữ trạng thái | TDD §5.2 |
| Export/copy byte-identical | Markdown/JSON export output khớp pre-change build | TDD §10.2 |
| Health check | Extension active + webview `ready` message + `window.ChatState` present | TDD §13.1 |

---

## 8. Rollback Plan

### 8.1 Trigger criteria

| Tình huống | Action |
|-----------|--------|
| Health check fail sau install | Rollback ngay |
| Error rate tăng > 5% | Rollback ngay |
| Smoke test fail (Section 7) | Rollback ngay |
| Performance degradation > 50% | Rollback ngay |
| Minor issue, có workaround | Báo cáo, đợi quyết định từ SM/PO |

### 8.2 Rollback steps

1. Gỡ extension 1.55.6:
   ```powershell
   kiro --uninstall-extension dnguyenminh.sdlc-agents-4-enterprise
   ```
2. Cài lại v1.55.5 (nếu artifact cũ còn lại):
   ```powershell
   kiro --install-extension <path-to-1.55.5.vsix> --force
   ```
3. Reload Window.
4. Verify rollback: health check (Section 7) + smoke test.

### 8.3 Verification after rollback

- Extension active, version hiển thị 1.55.5.
- Chat Panel mở được, webview `ready` handshake.
- Không có lỗi thinking co 1 dòng / response bleed / tool leak tab khác.

---

## 9. Environment-Specific Notes

| Environment | Configuration | Approval | Contact |
|-------------|---------------|----------|---------|
| Local / DEV | VSIX install manual `--force` | DevOps | DevOps Agent |
| SIT | N/A (webview-only, local profile) | SM | SM |
| UAT | N/A | PO | PO |
| PROD | N/A (extension published via marketplace separately) | Release Manager | Release Manager |

**Ghi chú:** Ticket này deploy thủ công qua VSIX vào profile Kiro của user. Không có CI/CD pipeline thay đổi cho ticket này (TDD §1.3: "no CI/CD change for this ticket").

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-25 | DevOps | Initial DPG for SA4E-381-chat-ux v1.55.6 |

---

**End of DPG.**
