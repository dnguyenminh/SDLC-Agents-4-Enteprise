# Screenshot Manifest — SA4E-411 (UG images, TEXT metadata only)

Ảnh được chụp bằng `orca computer get-app-state --app pid:29420 --json` trên **instance Kiro cô lập**
(profile riêng, mở workspace-file trỏ tới worktree SA4E-411). Ảnh **không crop**, giữ nguyên toàn cửa sổ.
Provenance được chứng minh bằng **dữ liệu văn bản** (SHA-256 / bytes / mtime / cây accessibility) — không mở
để xem pixel trong báo cáo.

| Thuộc tính | Giá trị |
|------------|---------|
| Ứng dụng | Kiro (instance cô lập) |
| PID cửa sổ | 29420 |
| Tiêu đề cửa sổ | `core-tools.ts - sa411 (Workspace) - Kiro` |
| Profile dir | `C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-kiro` |
| Workspace file | `C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-kiro\sa411.code-workspace` |
| Extension | `SDLC Agents 4 Enterprise` **1.55.21** — VSIX build từ worktree này (`extension/sdlc-agents-4-enterprise-1.55.21.vsix`, 9.537.408 B, 14:06) |
| Backend | `http://127.0.0.1:48731` (PID node 40064) — **không** phải instance dùng chung `:48721` |
| Backend data dir | `C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-data` |
| Backend log | `C:\Users\ASUS\AppData\Local\Temp\opencode\sa411-logs\backend.log` |

## Dòng log backend chứng minh freshness

```text
WORKTREE   = C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-411
PORT       = 48731
{"level":30,"time":1794812215841,"pid":40064,"config":{"port":48731,"host":"127.0.0.1"},"msg":"Starting Backend MCP Server"}
{"level":30,"time":1794812278845,"pid":40064,"port":48731,"host":"127.0.0.1","listening":true,"msg":"Backend server started - debug: server listening"}
{"level":30,"time":1794812278894,"pid":40064,"port":48731,"version":"1.0.0","msg":"Backend MCP Server ready"}
{"level":30,"time":1794813817097,"pid":40064,"projectId":"22b039993db3","msg":"[ensureProjectRegistered] auto-upserted project"}
```

## Danh sách ảnh

| # | File | SHA-256 | Bytes | mtime (UTC) | Flow trong UG | Nội dung (chứng minh bằng cây accessibility) |
|---|------|---------|-------|-------------|---------------|---------------------------------------------------|
| 1 | `diagrams/ug-sa411-01-sdlc-agents-panel.png` | `0AC40C8CEF487C6DD8EF78AF7A3C68451C2A01BF5A5F73CED5FE529F75D7DE38` | 274084 | 2026-11-16T10:20:47.8165732Z | Luồng 1 — Mở panel SDLC Agents (điểm vào) | `tree item Backend Target http://127.0.0.1:48731` · `tree item Status: Running Port 9185` · `button SDLC Agents: Show Status` · `group SA4E-411 (Git) - dnguyenminh/SA4E-411*` · `button check SDLC Agents, SDLC Agents: Connected (Local / Standby)` |
| 2 | `diagrams/ug-sa411-02-ai-context-symbol.png` | `C56A24393E5350E968AC2C34723AA2DF1AA79846BA3EFA86F6056F45779FC8DD` | 274311 | 2026-11-16T10:22:18.8600892Z | Luồng 2 — Lấy ngữ cảnh AI cho một symbol (kết quả chính) | `text Line 25, column 14: export class CoreAgentTools {` · `text Info: Context for "CoreAgentTools" copied to clipboard.` · `tree item Backend Target http://127.0.0.1:48731` |
| 3 | `diagrams/ug-sa411-03-no-active-editor.png` | `912E19F33AAE3F711E4AC6AB4E6FB2B0D90BD56C641C3F0EB3DA6ACCEEF564A7` | 133419 | 2026-11-16T10:23:03.4308341Z | Luồng 3 — Gọi lệnh khi không có file đang mở (trạng thái lỗi) | `text Warning: No active editor. Open a file first.` · `dialog Warning: No active editor. Open a file first., source: SDLC Agents 4 Enterprise, notification` · `tree item Backend Target http://127.0.0.1:48731` |

## File trạng thái text đi kèm

| Ảnh | File trạng thái text |
|-----|--------------------|
| `ug-sa411-01-sdlc-agents-panel.png` | `evidence/.state-01-entry-sdlc-agents-panel.txt` |
| `ug-sa411-02-ai-context-symbol.png` | `evidence/.state-02-primary-ai-context.txt` |
| `ug-sa411-03-no-active-editor.png` | `evidence/.state-03-no-active-editor.txt` |

## Ghi chú về provenance

- Instance Kiro cô lập được **khởi động lại 2 lần** trong pass này; lý do ghi ở `evidence/.kiro-restart-reason.txt`.
  Lần khởi động lại đầu là do instance cũ thoát đột ngột; lần khởi động lại sau là để hoàn nguyên
  override `sdlcAgents.backend.url` trong workspace-file (một panel cài đặt của extension đã ghi đè
  giá trị mặc định `:48721` vào file đó).
- **Không** chụp ảnh nào từ Kiro repo `main` hay từ backend dùng chung `:48721`.
- File `UG-evidence-appendix.md` và `UG-evidence-appendix-v2-SA4E-411.docx` đã xoá (transcript kỹ thuật nội bộ).

