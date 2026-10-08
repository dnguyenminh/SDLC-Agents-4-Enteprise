# [SA4E-339] Deployment Guide (DPG)
**Version:** 1.0
**Status:** Draft — pending SM review
**Author:** devops-agent
**Ticket:** SA4E-339 — Fix Automatic Session Compaction Hook in ChatPanelProvider

---

## 1. Overview

Guide này mô tả quy trình deploy thay đổi **SA4E-339** (auto session compaction trong chat panel của extension VS Code). Thay đổi chỉ nằm trong **extension host** — không đổi backend, không đổi DB, không đổi config infra.

| Hạng mục | Giá trị |
|---|---|
| Component | `extension/src/chat-panel/chat-panel-provider.ts` (+ test suite) |
| Scope runtime | Extension host only — in-process, không network boundary mới |
| Breaking changes | **None** |
| Config changes | **None** (ngưỡng là hằng số trong code) |
| Migration | **None** (không persistent storage) |
| Rollback | Uninstall .vsix → cài lại bản trước |

---

## 2. Prerequisites

| Yêu cầu | Phiên bản / Ghi chú |
|---|---|
| Node.js | ≥ 20.x |
| npm | ≥ 10.x (workspaces) |
| VS Code | ≥ 1.90 (extension host API ổn định) |
| `vsce` | Để package .vsix (`npm run package:debug` / `package:prod`) |
| LLM engine | Local model đã cấu hình (llama-server / Ollama / ONNX) — compaction dùng local summarizer |

## 3. Pre-deployment Verification (Quality Gates)

Chạy TẤT CẢ trước khi package — không pass thì không deploy:

```powershell
cd extension
npx tsc --noEmit        # Bắt buộc: EXIT=0
npm run lint            # Bắt buộc: EXIT=0
npx vitest run src/chat-panel/__tests__/chat-panel-provider.compaction.test.ts   # 11/11 PASSED
npx vitest run src/__tests__/chat                                                 # 178/178 PASSED
npm test                # Full suite — mong đợi 0 fail (xem Lưu ý §8 về layout test out-of-scope)
```

**Evidence đã verify (2026-10-07/08):** tsc EXIT=0, lint EXIT=0, compaction 11/11, chat suite 178/178 — chi tiết trong `documents/SA4E-339/TEST-REPORT.md`.

## 4. Deployment Steps

### 4.1 Package extension

```powershell
cd extension
npm run package:prod        # esbuild-production + copy-resources + gen-checksums + vsce package
# Output: sdlc-agents-4-enterprise-<version>.vsix
```

### 4.2 Cài đặt / nâng cấp

**Local (kiro CLI):**
```powershell
kiro --install-extension sdlc-agents-4-enterprise-<version>.vsix
```

**VS Code UI:** Extensions view → `...` → *Install from VSIX…* → chọn file.

**Update trên bản đã cài:** cài đè bằng lệnh trên — VS Code tự reload extension host. Không cần clear state (không đổi storage schema).

### 4.3 Health checks sau deploy

| # | Check | Cách verify | Mong đợi |
|---|---|---|---|
| 1 | Extension activates | Mở chat panel | Panel load, không lỗi trong Output → extension host |
| 2 | Context meter renders | Gửi 1 tin nhắn | Meter hiển thị tokenCount/maxTokens + breakdown |
| 3 | Compaction trigger | Trò chuyện đến usage ≥ 94.5% | Log `Triggering auto-compaction` + history thu gọn (summary + 2 msg) |
| 4 | Meter drops | Sau compaction | Meter giảm về <70% target, KHÔNG banner đỏ |
| 5 | SA4E-182 không regression | Gửi message có MCP tool | Meter breakdown `mcpTools` vẫn được tính |

### 4.4 Smoke test gói .vsix

```powershell
cd extension
npm run smoke:bundle    # node scripts/smoke-bundle/run-smoke.js
```

## 5. Rollback

1. Xác định bản .vsix trước đó (artifact repo / local).
2. Cài lại: `kiro --install-extension sdlc-agents-4-enterprise-<prev-version>.vsix`
3. Reload window (extension host restart).
4. Verify rollback: chat panel hoạt động, meter hiển thị; banner đỏ "Context window is full" **sẽ quay lại** ở usage ≥95% (đây là hành vi của bản cũ — chấp nhận được khi rollback).

**Rollback an toàn vì:** không đổi DB/storage/config; state chat lưu ở webview (workspace state) — tương thích 2 chiều giữa 1.47.x.

## 6. Dependencies & Compatibility

| Dependency | Vai trò trong feature | Rủi ro deploy |
|---|---|---|
| `SessionCompactor` (`extension/src/pi-agent/session-compactor.ts`) | Nén + normalize + ngưỡng | Low — đã có test suite riêng (perf ≤300ms asserted) |
| `ContextUsageTracker` (`extension/src/chat-panel/context-usage-tracker.ts`) | Đếm token, integer percentages | Low — pre-existing (SA4E-182) |
| `PiWorkflowAdapter` (`extension/src/pi-workflow/`) | `getDetectedContextWindow()`, `setChatHistory()` | Low — `setChatHistory` có typeof-guard |
| Local LLM engine | Summarizer | Medium — nếu model offline, summarizer throw → truncate fallback (2 msg cuối), chat vẫn chạy |

## 7. Post-deployment

- [ ] Theo dõi debug log 1–2 ngày đầu: đếm tần suất `Auto-compaction complete`, `error (non-fatal)`.
- [ ] Ghi nhận phản hồi user về hành vi nén (summary chất lượng, latency cảm nhận).
- [ ] Cập nhật README changelog + bump version + tag (xem RLN.md §Version-sync).

## 8. Lưu ý / Known issues khi deploy

1. **`layout.integration.test.ts` fail (out-of-scope)**: test webview layout fail do `svelte-compile-helper.ts` (untracked, WIP session khác) import `svelte/store` không resolve từ extension root. **KHÔNG thuộc SA4E-339** — SA4E-339 scope tests (compaction 11/11, chat 178/178) đều PASS. Deploy vẫn được phép nếu gate scope pass; full-suite gate chờ fix riêng của webview WIP.
2. **Ngưỡng hardcode 0.95**: muốn đổi ngưỡng phải build lại .vsix (chưa cấu hình runtime).
3. **Boundary 94.5%**: nén kích hoạt từ 94.5% usage thật (round-up) — ghi rõ khi report bug "nén sớm".

---

*End of Deployment Guide — SA4E-339 v1.0*
