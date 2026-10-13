# Deployment Guide (DPG)

## SDLC-Agents-4-Enterprise — SA4E-356: [Bug] MCP tools — relative file_path resolves against process CWD instead of workspace root

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-356 |
| Title | [Bug] MCP tools: relative file_path resolves against process CWD (Kiro install dir) instead of workspace root |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-10-14 |
| Status | Draft — chờ SM review (UAT PASSED 2026-10-14) |
| Related TDD | documents/SA4E-356/TDD.md (v1.2 — §13 rollback, §5 file-by-file) |
| Related Docs | STP.md v1.1 (§2 environments) · TEST-REPORT.md (§4.2 REG-1/REG-2 steps) · SECURITY-ASSESSMENT.md (APPROVED WITH FINDINGS) · PENTEST-REPORT.md (SECURE-WITH-NOTES) · documents/worktree-parallel-pipeline.md (R6) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-14 | DevOps Agent | Initiate DPG sau UAT PASS. Deployment model: VSIX per-user vào Kiro (build reality đã verify trên main: package:prod → VSIX 1.48.0 UAT / package.json hiện 1.52.0); marker check PATH_NO_WORKSPACE trong bundle đã verify; rollback theo TDD §13 + R6 (deploy từ main) |

---

## Sign-Off

| Name | Role | Signature and date |
|------|------|--------------------|
| | Dev Lead | ☐ Approved for deployment |
| | QA Lead | ☐ Testing completed (UAT PASS — user confirm 2026-10-14) |
| | Ops Lead | ☐ Infrastructure ready |

---

## 1. Overview

### 1.1 Feature Summary

Bug fix SA4E-356 chuẩn hóa **Path Resolution** cho toàn bộ MCP tool nhận tham số đường dẫn, thông qua **một shared helper duy nhất** — `PathResolver` (`extension/src/services/PathResolver.ts`):

- **Root cause đóng:** relative `file_path` trước đây resolve theo Process CWD của Extension Host (thư mục cài Kiro `C:\Users\ASUS\AppData\Local\Programs\Kiro`) thay vì Workspace Root → ENOENT trên mọi relative-path call (bug gốc từ SA4E-355).
- Sau fix: 100% tool in-scope (6 tool + 2 đường mem_ingest_file) resolve relative path theo **Primary Workspace Folder** đọc **mỗi call**; absolute passthrough giữ nguyên vị trí (backward compat); containment case-insensitive trên win32; path escape bị chặn fail-loud; error có `CODE:` prefix + resolved path + gợi ý (self-heal ≤ 1 retry); inputSchema description chuẩn trên cả 4 schema surfaces (AC-4).
- TDD v1.2 bổ sung security fixes (SEC-01..08): per-ref containment cho inner image refs, BR-06b (relative bị từ chối `PATH_NO_WORKSPACE` khi không mở workspace), symlink guard parent-dir realpath, payload caps 10 MB / 25 MB, NUL → `PATH_INVALID` + log sanitize.

**Trạng thái:** UAT **PASSED** (user confirm 2026-10-14, REG-1/REG-2 verified trên VSIX 1.48.0 đã cài). DPG này mô tả quy trình build + install chuẩn cho mọi lần deploy tiếp theo từ main.

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| Extension VSIX (sdlc-agents-4-enterprise) | Modified | PathResolver module mới + refactor 8 call sites + schema descriptions (SA4E-356); build từ main còn bao gồm thêm SA4E-358 (CORS Origin/Host gate :9181) và các fix khác đã merge |
| Backend child server | Modified (~10 dòng) | `drawio-tool.ts` error disambiguation + win32 fold (BR-12 / SEC-04); resolve behavior KHÔNG đổi |
| Database | N/A | Không có schema/migration — `PathResolutionResult` là ephemeral, không persist |
| Configuration | N/A | Không có env var / feature flag / config file mới (TDD §13 — thuần code) |
| Infrastructure | N/A | Topology không đổi (TDD §2.3) — không service/container/mạng mới |

### 1.3 Target Environments

Mô hình deploy là **per-user desktop extension** — không có server DEV/SIT/UAT/PROD riêng biệt:

| Environment | Đối tượng | Deploy Order | Approval Required | Trạng thái |
|-------------|-----------|--------------|-------------------|------------|
| DEV | Workstation dev (developer tự build/run) | 1 | No | Đã deploy suốt pipeline |
| UAT | Workstation user — VSIX 1.48.0 cài qua Kiro CLI + Reload Window | 2 | User confirm | ✅ **PASSED 2026-10-14** (REG-1/REG-2 verified) |
| PROD | = workstation user (bản release sau merge/tag từ main) | 3 | SM + User | Pending — theo quy trình Section 5 |

### 1.4 Deployment Architecture

```
┌─ Kiro Desktop (per-user) ───────────────────────────────────────────┐
│  Extension Host process (process.cwd() = Kiro install dir)          │
│   └─ Extension dnguyenminh.sdlc-agents-4-enterprise (VSIX <ver>)    │
│       ├─ MCP WrapperServer — bind 127.0.0.1:9181 (loopback only)    │
│       │    · SA4E-358: CORS Origin/Host gate + deny log             │
│       │      (outputChannel)                                        │
│       ├─ PathResolver (SA4E-356) — resolveWorkspacePath() đọc       │
│       │    workspaceFolders[0] MỖI call (không cache); fallback     │
│       │    process.cwd() chỉ cho absolute passthrough (BR-06b)      │
│       ├─ Local tools + Base64ProxyService + ToolProxy               │
│       │    │ REST JSON (content_base64)                             │
│       │    ▼                                                        │
│       └─ Backend child server — :48721 (port thật đọc từ            │
│            .code-intel/settings.json → mcpUrl; standalone mode      │
│            bind 1 workspace theo config.workspace)                  │
└──────────────────────────────────────────────────────────────────────┘
         │ outbound HTTPS multipart (auth từ SecretStorage per-request)
         ▼
   Atlassian REST (Jira / Confluence attachments)
```

**Điểm then chốt của kiến trúc deploy:**

1. **VSIX per-user duy nhất** — Kiro chỉ giữ 1 version extension mỗi user; install bằng `--force` ghi đè. Đây là lý do R6 (worktree-parallel-pipeline): **chỉ deploy từ main** (integration point), KHÔNG deploy VSIX build từ worktree feature khi ≥2 ticket cùng sửa `extension/src/`.
2. **Extension Host là process chứa MCP wrapper** — `process.cwd()` của nó = thư mục cài Kiro (không đổi được — root cause). Fix SA4E-356 nằm hoàn toàn trong bundle extension; deploy = thay bundle.
3. **Loopback :9181** (WrapperServer, bind 127.0.0.1) + **backend orchestration :48721** (port thật có thể khác — LUÔN resolve runtime từ `.code-intel/settings.json`, cấm hardcode port).
4. **Reload Window là bước deploy bắt buộc** — extension host process phải restart để load bundle mới; bỏ qua bước này = vẫn chạy code cũ dù VSIX đã cài.
5. **Không có health-check server mới** — `/health` của WrapperServer (`{"status":"ok","mode":"wrapper"}`) và backend health giữ nguyên (TDD §10.3).

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| Kiro Desktop đã cài | Ready | `C:\Users\ASUS\AppData\Local\Programs\Kiro` — Kiro CLI tại `bin\kiro.cmd` |
| Loopback ports khả dụng | Ready | :9181 (WrapperServer, bind 127.0.0.1); backend port resolve runtime từ `.code-intel/settings.json` (mcpUrl) — cấm hardcode |
| Workspace có thể mở trong Kiro | Ready | Precondition bắt buộc cho relative-path verify (REG-1) và cho AC-1 |
| Git repo branch main | Ready | HEAD chứa fix chain (verify ở Checklist #1) |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js + npm | theo repo hiện có | Installed |
| vsce (qua npm scripts, devDeps) | package.json | Installed — `npm run package:prod` gọi `vsce package --no-dependencies` |
| esbuild | devDeps | Installed — bundle `out/extension.js` |
| PowerShell 7 (pwsh) | 7.x | Installed — môi trường chạy verify commands |
| Git | hiện có | Installed |

**KHÔNG có dependency runtime mới** (TDD §1.3 — commit bb17b39 không đổi `package.json`/lock, verified bởi Security Assessment §5).

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|--------------|
| Write access tới thư mục extension của Kiro | User-level (KHÔNG cần admin) | Người thực hiện install |
| Jira credentials (SecretStorage) | Extension-managed | REG-1 attach evidence |
| Git push quyền trên main | SSH/HTTPS | DevOps (chỉ khi rollback code — Option A) |

### 2.4 Backup Requirements

- [ ] VSIX phiên bản đang cài (hoặc bản pre-fix) còn giữ trong `extension/` — inventory rollback binary (hiện có: 1.44.1 … 1.47.2 … 1.52.0; **bản pre-fix cuối: 1.47.2**, built 2026-10-10)
- [ ] Git state clean trên main trước khi build (gen-checksums hash từ git HEAD — file uncommitted KHÔNG vào checksums)
- [ ] Không cần DB backup — N/A (Section 4)

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Verify bằng | Status |
|---|------|-------------|-------------|--------|
| 1 | Fix chain trên main: `bb17b39` (PathResolver implement) → `7c525a8` (UG + SA-02 sanitize) → `65afa5b` (test report) → `f453e77` (pentest + PT-02 fix); HEAD ≥ `3f4af4e` (bao gồm SA4E-358: `7bb9222` CORS gate + `65feabf`/`3f4af4e` docs/test) | DevOps | `git log --oneline` | ☐ |
| 2 | Full test suite PASS: **≥ 2,808 tests** (gate hiện tại trên main; tại TEST-REPORT: 2,660 extension + 19 backend, 0 FAIL — tăng thêm bởi test của 358/360) | QA | `cd extension && npm run test` | ☐ |
| 3 | Coverage gate N-7: `PathResolver.ts` ≥ 95% statements+branches (đạt **100%** tại TEST-REPORT §6) | QA | `npm run test:coverage` | ☐ |
| 4 | Static gates: `tsc --noEmit` 0 errors (extension + backend), eslint 0 errors, **N-8 scan 0 violations** trên 523+ file production | QA/DEV | `bash scripts/check-pathresolver-n8.sh --all` | ☐ |
| 5 | CI green (GitHub Actions workflow của ticket — lint/test/npm audit/semgrep; `permissions: contents: read`, không secret) | DevOps | CI dashboard | ☐ |
| 6 | UAT PASS confirmed (2026-10-14, REG-1/REG-2 trên VSIX 1.48.0 — STATUS.json `uat: done`) | SM/User | STATUS.json + user confirmation | ☑ |
| 7 | **No secrets trong VSIX**: không `.env`/`jira.conf`/token trong bundle; auth Jira/Confluence build per-request từ SecretStorage (Security Assessment §2 — A02 verified) | DevOps | grep bundle + review packaging | ☐ |
| 8 | Checksums generated: `vscode:prepublish` tự chạy `gen-checksums` → `extension/resources/.sdlc-checksums.json` (hash từ git HEAD, version khớp package.json) | DevOps | kiểm tra artifact sau build | ☐ |
| 9 | **R6 — deploy từ main**: KHÔNG build/install VSIX từ worktree feature (VSIX per-user là global — deploy từ worktree sẽ thiếu fix của worktree khác) | SM/DevOps | worktree-parallel-pipeline.md §3 R6 | ☐ |
| 10 | VSIX backup pre-fix còn trong `extension/` (1.47.2) cho rollback binary | DevOps | `Get-ChildItem extension\*.vsix` | ☐ |
| 11 | Rollback plan reviewed (Section 8) | Team | review Section 8 | ☐ |
| 12 | Deployment window: không cần cửa sổ đặc biệt (desktop per-user, không downtime service) — KHÔNG reload giữa REG replay đang chạy | SM | — | ☐ |

---

## 4. Database Migration

**N/A — ticket này KHÔNG có thay đổi persistent data model.** Không DB, không migration, không dual-write, không feature flag (TDD §4 + §13). Logical entity duy nhất là `PathResolutionResult` — ephemeral, 1 tool call : 1 result, không persist.

Hệ quả cho deploy/rollback: **không có bước DB nào**; rollback = git revert (code) và/hoặc reinstall VSIX (binary) — xem Section 8.

---

## 5. Application Deployment (Step-by-Step Procedure)

### 5.1 Deployment Flow (tóm tắt)

`git sync main` → `npm run package:prod` (trong `extension/`) → **verify VSIX** (marker `PATH_NO_WORKSPACE` trong bundle + checksums + version) → `kiro --install-extension --force` → **Reload Window (BẮT BUỘC, từng cửa sổ)** → verify post-deploy (Section 7).

### 5.2 Deployment Steps

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| 0 | Sync main (R6 — build từ integration point) | `git checkout main && git pull origin main` | HEAD ≥ `3f4af4e`; `git log --oneline -15` chứa chain Checklist #1 |
| 1 | (Tuỳ — lần đầu hoặc sau khi lockfile đổi) Cài deps | `cd extension; npm ci` | `node_modules` đầy đủ, không error |
| 2 | Build production VSIX | `cd extension; npm run package:prod` | Tạo `extension/sdlc-agents-4-enterprise-<ver>.vsix` (~12.4–12.6 MB). `vscode:prepublish` tự chạy: `esbuild-production` → `copy-resources` → `gen-checksums` |
| 3 | **Verify VSIX — marker trong bundle** (bắt buộc) | PowerShell: copy `.vsix` → `.zip`, `Expand-Archive`, rồi `Select-String -Path <extract>\extension\out\extension.js -Pattern "PATH_NO_WORKSPACE" -SimpleMatch` | **≥ 1 occurrence** (bundle minified — marker này chỉ tồn tại nếu fix SA4E-356 đã vào bundle; đã verify trên build hiện tại: 1 match) |
| 3b | Verify VSIX — checksums + version | Kiểm tra `<extract>\extension\resources\.sdlc-checksums.json` tồn tại + trường version khớp tên file | version = `<ver>` = `extension/package.json` |
| 3c | Verify VSIX — không secret | `Select-String` bundle cho pattern `.env`/`jira.conf`/token literal | 0 match (auth đọc SecretStorage runtime) |
| 4 | Install vào Kiro | `& "C:\Users\ASUS\AppData\Local\Programs\Kiro\bin\kiro.cmd" --install-extension "<abs-path>\sdlc-agents-4-enterprise-<ver>.vsix" --force` | Exit 0 — "Extension was successfully installed" |
| 5 | Confirm version đang cài | `kiro.cmd --list-extensions --show-versions` | `dnguyenminh.sdlc-agents-4-enterprise@<ver>` |
| 6 | **Reload Window — BẮT BUỘC** | Kiro: Command Palette → `Developer: Reload Window` — **thực hiện ở TỪNG cửa sổ Kiro đang mở** (mỗi cửa sổ = 1 extension host process riêng) | Extension host restart; sau reload, MCP wrapper :9181 sống lại với code mới |
| 7 | Post-deploy verification | Xem Section 7 | PASS toàn bộ |

**Thực tế đã thực hiện trong UAT (đã verify hoạt động end-to-end):** build `package:prod` trong `extension/` → `sdlc-agents-4-enterprise-1.48.0.vsix` (13,031,429 bytes ≈ 12.43 MB, built 2026-10-12 15:27) → verify marker → install bằng đúng lệnh Step 4 → Reload Window → REG-1/REG-2 PASS (Section 7.3).

### 5.3 Version Management

- Tên VSIX theo `extension/package.json` `version` tại thời điểm build — **luôn là specific version, không tồn tại khái niệm "latest"**.
- UAT build: **1.48.0**. Hiện tại package.json trên main: **1.52.0** (đã bump qua UAT pass của SA4E-355; build 1.49.0–1.52.0 chứa thêm fix 358/360). Lần deploy tiếp theo dùng version package.json tại thời điểm build — nếu cần release riêng cho ticket, SM bump version trước khi build.
- KHÔNG install đồng thời 2 version; `--force` ghi đè version hiện có (per-user duy nhất).

---

## 6. Configuration Changes

**N/A — không có thay đổi cấu hình** (TDD §13: không feature flag, không config, không env var mới; topology không đổi — TDD §2.3).

Ghi chú vận hành (không phải thay đổi của ticket này):

| Item | Nguồn | Ghi chú |
|------|-------|---------|
| MCP URL / backend port | `.code-intel/settings.json` → `mcpUrl` | Resolve runtime, KHÔNG hardcode port (R2 — standalone backend chỉ đúng cho workspace nó bind) |
| CORS Origin/Host gate :9181 | SA4E-358 (đã có trong main) | Deny log ghi vào outputChannel — xem Section 9 |
| Workspace root | `workspaceFolders[0]` của cửa sổ Kiro | Không cấu hình được qua ticket — mở đúng workspace trước khi gọi relative path (UG.md §3.4) |

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Endpoint/Command | Expected Result | Timeout |
|-------|-----------------|-----------------|---------|
| WrapperServer health | `GET http://127.0.0.1:9181/health` | `{"status":"ok","mode":"wrapper"}` (HTTP 200) | 10s |
| Backend child server | health endpoint theo port từ `.code-intel/settings.json` (mcpUrl) | HTTP 200, status ok | 10s |
| MCP handshake | POST `http://127.0.0.1:9181/mcp` — `initialize` JSON-RPC | `result.serverInfo` trả về (đã verify trong pentest P6-07) | 10s |

> Nếu :9181 không phản hồi sau Reload Window → extension chưa activate: kiểm tra Extensions panel (disabled/error?) + Developer Tools console, xem Section 9 trước khi rollback.

### 7.2 Smoke Tests (key happy path — chạy ngay sau deploy)

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | **Relative path ghi đúng workspace root** | Gọi `stream_write_file` với `file_path` = đường dẫn RELATIVE trong workspace (vd `documents/SA4E-356/deploy-smoke-<timestamp>.md`, content = "deploy smoke") | Trả "Wrote file: <workspace-root>\documents\..." — resolved vào **workspace**, KHÔNG phải Kiro install dir. Kiểm tra file tồn tại, sau đó xoá file smoke |
| 2 | **AC-4 — schema description mới trên tool catalog** | Gọi `tools/list` (hoặc xem schema của `stream_write_file`/`embed_image`/`jira_attach_file`/`confluence_add_attachment`/`mem_ingest_file`/`drawio_export_png`) | `file_path.description` = "Relative paths resolve against the primary workspace folder; absolute paths pass through; paths outside the workspace root are rejected." — xuất hiện trên đủ 4 surfaces (static defs, rewrite, find_tools response) |
| 3 | Negative control (tuỳ) | Gọi với `file_path` = `../x.md` (workspace đang mở) | `PATH_REJECTED_OUTSIDE_WORKSPACE` (Format 2, fail-loud, không fs side-effect). Không mở workspace → relative bị từ chối `PATH_NO_WORKSPACE` (Format 3, BR-06b) |

### 7.3 REG-1 / REG-2 Replay — ✅ VERIFICATION ĐÃ THỰC HIỆN (UAT PASS)

Steps chuẩn (nguồn: TEST-REPORT.md §4.2 ← STC §5 + STP §2.4):

**REG-1 (E2E-API-01 — relative replay, P1 Critical):**
1. Kiro mở workspace `C:\projects\kiro\SDLC-Agents-4-Enterprise` (workspace MỞ — precondition bắt buộc).
2. Gọi `jira_attach_file(issue_key="SA4E-355", file_path="documents/SA4E-355/FSD.md")` — **relative, KHÔNG fallback absolute**.
3. Expected: thành công ở **lần gọi đầu tiên**; attachment xuất hiện trên issue SA4E-355 đúng tên + nội dung; ghi attachment ID làm evidence.
4. Mở rộng bộ docs SA4E-355 (BRD.md, TDD.md, … mô phỏng 18-file run) — tất cả attach thành công bằng relative path; tổng tool calls **≤ 2 call/file** (N-6 — pattern "fail-then-absolute-retry" phải biến mất).
5. Spot-check 1 relative call mỗi tool còn lại: `embed_image`, `mem_ingest_file`, `drawio_export_png` — thành công từ workspace root.

**REG-2 (E2E-API-02 — absolute control, backward compat):**
1. Cùng host như REG-1.
2. `jira_attach_file` với absolute path `C:\projects\...\FSD.md` → thành công, vị trí resolve giống hệt pre-fix (N-4 — byte-identical buffer).
3. Lặp với lowercase-drive `c:\projects\…` → thành công (R-1 — case-fold win32).

**Trạng thái:** ✅ **PASS — đã thực hiện trong UAT (2026-10-14, user confirmed, trên VSIX 1.48.0 đã cài)** — STATUS.json: `uat: done`. CI harness anti-regression 3/3 PASS (TEST-REPORT §2.2.5). Evidence quy tắc redaction username trước khi attach Jira: STP §4.4.

**Re-verify policy:** nếu build version mới hơn (1.52.0+) chứa thay đổi ngoài scope ticket → lặp lại tối thiểu REG-1 (1 file) + Smoke #1/#2 trước khi release; N-6 đo lại trên full 18-file run khi làm release chính thức.

### 7.4 Log Verification

| Log Entry | Level | Expected | Location |
|-----------|-------|----------|----------|
| Extension activation | INFO | Không ERROR/FATAL mới sau Reload Window | Kiro → Help → Toggle Developer Tools (Console) |
| WrapperServer audit line | INFO | outputChannel appendLine theo pattern hiện có; không unexpected stack | Output channel của extension |
| Path errors (nếu có) | warn | Đúng format `CODE:` prefix (PATH_*/FILE_NOT_FOUND/FS_ERROR) + path đã sanitize (0 raw CR/LF — SEC-05/PT-02 đã fix) | Console + outputChannel |

### 7.5 Monitoring Dashboard

- N/A server-side (per-user desktop, không metrics endpoint mới — TDD §10.2). Quan sát thay thế: outputChannel deny-log (Section 9) + Developer Tools console + error rate của file-tool calls trong REG replay.

---

## 8. Rollback Plan

### 8.1 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Attach/file-op fail hàng loạt ngay sau deploy (ENOENT, PATH_* sai ngữ nghĩa) | **Rollback ngay — Option B** (binary) |
| Extension không activate / wrapper :9181 không lên sau Reload Window | Rollback binary (Option B) + triage nguyên nhân trước khi thử lại |
| Build mới hơn (1.52.0+) fail REG replay | KHÔNG release; giữ/hoàn nguyên bản trước nếu đã cài đè (Option B) |
| Defect logic path nghiêm trọng sau release (escape leak, containment sai) | **Rollback ngay — Option A** (git revert theo TDD §13) + hotfix |
| Minor issue có workaround | Báo cáo, đợi quyết định SM/PO (không tự retry deploy không approval) |

### 8.2 Option A — Code Rollback (git revert → rebuild → reinstall)

Thay đổi thuần code (1 module mới + 8 call site + schemas + ~10 dòng backend) — rollback = git revert (TDD §13):

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| A1 | Revert toàn bộ fix chain | `git checkout main && git revert bb17b39..f453e77 --no-edit` (hoặc revert từng commit C1–C9 theo TDD §12 nếu partial) | Conflict-free; `npm run test` xanh trở lại (suite pre-fix) |
| A2 | Partial-revert notes (nếu chỉ revert một phần) | Revert `remote-backend-client.ts:62` wiring **TRƯỚC** `Base64ProxyService` (tránh constructor/provider mismatch); C8 (schemas) revert an toàn độc lập; C9 (backend 10 dòng) revert độc lập | tsc 0 errors cả extension + backend |
| A3 | Rebuild | `cd extension; npm run package:prod` | VSIX version mới (bump version trước nếu cần phân biệt) |
| A4 | Reinstall | `kiro.cmd --install-extension "<vsix>" --force` | Exit 0 |
| A5 | Reload Window từng cửa sổ | — | Wrapper :9181 sống lại |
| A6 | Verify rollback | Health 7.1 + Smoke 7.2 #1 (dùng absolute path nếu đã revert về pre-fix — relative sẽ ENOENT như cũ) + REG-2 absolute (passthrough không đổi ở cả 2 bản — luôn pass) | PASS |

Lưu ý E-4: error-text changes (`PATH_EMPTY:`, Format 2 mới) đi kèm C3/C8 — revert **cùng** commit tương ứng, không rollback được "một nửa" error text.

### 8.3 Option B — Binary Rollback (reinstall VSIX version trước — nhanh, khuyến nghị khi cần phục vụ ngay)

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| B1 | Xác định VSIX pre-fix còn giữ | `Get-ChildItem extension\*.vsix` — **bản pre-fix cuối: `sdlc-agents-4-enterprise-1.47.2.vsix`** (built 2026-10-10, trước fix chain 356); hoặc VSIX đang cài trước deploy | File tồn tại, size khớp inventory |
| B2 | Reinstall | `& "C:\Users\ASUS\AppData\Local\Programs\Kiro\bin\kiro.cmd" --install-extension "C:\projects\kiro\SDLC-Agents-4-Enterprise\extension\sdlc-agents-4-enterprise-1.47.2.vsix" --force` | Exit 0 |
| B3 | Confirm version | `kiro.cmd --list-extensions --show-versions` | `...@1.47.2` |
| B4 | Reload Window từng cửa sổ | — | Wrapper :9181 sống lại (bản cũ) |
| B5 | Verify rollback | Health 7.1; REG-2 absolute attach PASS (workaround SA4E-355: absolute path hoạt động như trước fix) | PASS |

⚠️ **Lưu ý bản 1.47.2:** CHƯA có fix SA4E-356 (relative path vẫn ENOENT — dùng absolute workaround) VÀ CHƯA có CORS gate SA4E-358. Chỉ dùng làm **bridge khẩn cấp**; quay lại build có fix ngay khi root cause được triage.

### 8.4 Worktree & Artifact Cleanup (sau deploy thành công hoặc rollback)

- Worktree ticket (nếu còn): `git worktree remove C:\projects\kiro\wt-SA4E-356` (nếu có) + `git branch -d SA4E-356` — theo worktree-parallel-pipeline §4 Step 7. Fix đã trên main, branch không cần giữ.
- Junk QA suite (leftover đã biết, không phải của pentest): `extension/src/__tests__/.tmp-local-tools`, `extension/src/__tests__/sa4e-356-sq1-outside` — xoá khi dọn repo.
- Pentest temp: harness tự dọn (verified 0 leftover dưới `%TEMP%\opencode` — PENTEST-REPORT §6).
- **KHÔNG xoá VSIX cũ trong `extension/`** — đó là inventory rollback binary.
- KHÔNG merge/tag trong session DevOps này — SM xử lý git release (merge/tag/README changelog).

### 8.5 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Option B (binary reinstall + reload + verify) | ~5 phút |
| Option A (revert + rebuild + reinstall + verify) | ~30–45 phút |
| Database rollback | N/A |
| **Tổng tối đa (Option A)** | **~45 phút** |

---

## 9. Monitoring & Alerting

Không hạ tầng monitoring mới (bug fix thuần code — TDD §10.2); điểm quan sát là 3 kênh sau:

| Kênh | Cái gì | Ngưỡng/Signal | Hành động |
|------|--------|---------------|-----------|
| **Deny log — outputChannel (SA4E-358)** | CORS Origin/Host gate trên :9181 ghi DENY mỗi request cross-origin/Host lạ | DENY bất thường/tần suất cao → drive-by browser dò :9181, hoặc MCP client hợp lệ bị chặn (cấu hình client sai — xem UG SA4E-358) | DENY từ client hợp lệ → sửa cấu hình client; dò bất thường → giữ gate, review nguồn |
| **KB ingest anomalies** | `mem_ingest_file` fail với `PATH_*` codes | Spike `PATH_NO_WORKSPACE` → agent chạy khi workspace CHƯA mở (user quên mở workspace / cửa sổ sai); `PATH_REJECTED_OUTSIDE_WORKSPACE` → path ngoài root | Mở đúng workspace rồi retry; kiểm tra agent dùng relative path trong root (UG.md §3.4) |
| **Extension host errors** | Developer Tools console + outputChannel của extension | ERROR/FATAL mới sau Reload Window; pattern: activation fail, wrapper không bind :9181 | Triage theo Section 7.1/7.4; rollback Option B nếu block thao tác |

**Error patterns bình thường:** trong hoạt động ổn định, rate các code `PATH_REJECTED`/`PATH_NO_WORKSPACE`/`PATH_INVALID` trong log ≈ 0. Mọi error path phải có `CODE:` prefix + path đã sanitize (SEC-05, PT-02 đã fix `f453e77`); gặp raw CR/LF trong log = regression của PT-02 → báo SM.

---

## 10. Known Residuals & Follow-ups

Tổng hợp từ Security Assessment (Phase 5.7) + Pentest (Phase 6.3) — KHÔNG block deploy:

| ID | Mô tả | Severity | Trạng thái / Follow-up |
|----|-------|----------|------------------------|
| SA-01 | CORS `ACAO: *` + no authN trên :9181 — drive-by browser có thể đọc/điều khiển MCP (pentest live-confirmed ×3: P6-15/16/17) | Medium (pre-existing) | ✅ **FIXED riêng — SA4E-358** (commit `7bb9222`: CORS Origin/Host gate + deny log; đã trên main HEAD, có trong mọi build từ main). Follow-up ticket không còn cần thiết cho phần này |
| PT-01 | `ensureDir` chạy TRƯỚC symlink guard → thư mục rỗng được tạo ngoài workspace root xuyên qua junction có sẵn (file write vẫn bị chặn — không data leak) | Low | Open — follow-up hardening P3: guard/rollback trước-sau mkdir (PENTEST-REPORT §3 có remediation gợi ý) |
| PT-02 | Log forging `console.debug` (`backend-local-tools.ts:347` — CRLF echo) | Low | ✅ **FIXED inline — commit `f453e77`** (sanitize theo pattern `sanitizeLogText`) |
| SA-02 | Backend `resolved` echo CRLF (`drawio-tool.ts:42-48`) | Low | ✅ **FIXED — commit `7c525a8`**; live-verified P7-02 (error JSON 0 raw CR/LF) |
| SA-04 / OI-2 | File-level hardlink/symlink đọc/ghi xuyên link (guard chỉ realpath parent-dir; **hardlink tạo được KHÔNG cần privilege** — pentest P2-04/05 làm residual thực tế hơn đánh giá ban đầu) | Info (design-accepted AD-17) | Open — realpath toàn phần cho READ path khi có NFR perf; **khuyến nghị nâng độ ưu tiên OI-2** sau pentest |
| SA-05 | URL path interpolation Atlassian identifiers (issue_key/page_id không validate format) | Info (pre-existing) | Open — follow-up hardening P3 |
| SA-06 | CI actions pin theo major tag (mutable references), semgrep unpinned | Info | Open — DevOps follow-up P3: pin full-length commit SHA |
| SA-07 | npm audit 1 HIGH transitive: `@modelcontextprotocol/sdk` 1.27.1 nested qua `pi-web-access` 0.33.0 (direct dep 1.29.0 clean); commit KHÔNG đổi deps | Info (pre-existing) | Open — tracking; theo dõi upstream bump `pi-web-access`; triage won't-fix-có-căn cứ (client-side local, không expose network surface mới) |
| OI-1 | `drawio_auto_layout` backend tự resolve theo `config.workspace` riêng (audit gap BR-12 — chỉ error disambiguation trong ticket này) | Tech-debt | Open — follow-up ticket proxy-route (SM tạo + cross-link trước khi close SA4E-356 — ràng buộc close) |

---

## 11. Environment-Specific Notes

### 11.1 DEV (workstation dev)

- Build debug: `npm run package:debug` hoặc chạy trực tiếp via F5 — không dùng cho UAT/PROD.
- N-8 gate local: `bash scripts/check-pathresolver-n8.sh --staged` trước commit.

### 11.2 UAT (workstation user — ĐÃ PASS)

- VSIX 1.48.0 cài 2026-10-12 → REG-1/REG-2 verified 2026-10-14 (Section 7.3). Không còn action UAT mở.
- Mọi build UAT tiếp theo phải từ main (R6) — đã note trong Checklist #9.

### 11.3 PROD (release từ main)

- **Deployment window:** không cần cửa sổ đặc biệt (desktop, không service downtime); tránh reload giữa REG replay đang chạy.
- **Approval:** SM (git release: merge/tag/README changelog) + User (confirm hoạt động sau deploy).
- **Communication:** SM báo user trước khi cài đè version đang dùng; sau deploy user Reload Window rồi xác nhận smoke.
- **On-call:** DevOps agent (session này) → escalate SM.

### 11.4 Lưu ý chung multi-window / multi-worktree (R2/R6)

- Sau install, **Reload Window TỪNG cửa sổ Kiro** đang mở — window chưa reload vẫn chạy code cũ trong extension host của nó.
- KHÔNG dùng standalone backend của 1 worktree cho workspace khác (R2 — chỉ đúng workspace nó bind); extension-mode MCP per-window tự đúng sau fix 356.
- KHÔNG multi-root workspace chứa 2 worktree (folder[0]-only sẽ gây nhầm resolve).

---

## 12. Appendix

### 12.1 Build Artifact Inventory (liên quan rollback)

| VSIX | Size (bytes) | Built | Ghi chú |
|------|--------------|-------|---------|
| sdlc-agents-4-enterprise-1.47.2.vsix | 23,756,707 | 2026-10-10 | **Pre-fix cuối** — rollback Option B |
| sdlc-agents-4-enterprise-1.48.0.vsix | 13,031,429 | 2026-10-12 | **UAT build** — REG-1/2 PASS trên bản này |
| sdlc-agents-4-enterprise-1.52.0.vsix | 13,050,832 | 2026-10-13 | Bản mới nhất trên main hiện có (chứa fix 356 + CORS gate 358) |

### 12.2 Verify Bundle Marker (tham chiếu lệnh Step 3)

```powershell
$vsix = "extension\sdlc-agents-4-enterprise-<ver>.vsix"
Copy-Item $vsix "$env:TEMP\vsix-check.zip" -Force
$dest = "$env:TEMP\vsix-check-<ver>"
Expand-Archive "$env:TEMP\vsix-check.zip" $dest -Force
(Select-String -Path "$dest\extension\out\extension.js" -Pattern "PATH_NO_WORKSPACE" -SimpleMatch).Count   # expected >= 1
```

### 12.3 Contacts

| Role | Name | Contact |
|------|------|---------|
| Scrum Master | SM Agent | qua pipeline session |
| DevOps | DevOps Agent | session này |
| Reporter / Requirements Owner | Duc Nguyen Minh | Jira SA4E-356 reporter |

### 12.4 Related Tickets & Evidence

| Ticket / Doc | Summary | Relationship |
|--------------|---------|--------------|
| SA4E-355 | Bug gốc — MCP ENOENT relative path (absolute workaround) | Baseline regression (REG-1/REG-2 attach lên issue này) |
| SA4E-358 | CORS Origin/Host gate :9181 (+ deny log) | Fix riêng cho SA-01 — đã merge main |
| SA4E-360 | Multi-Resolution Context Supply (song song) | Cùng main — R6 áp dụng |
| TEST-REPORT.md §4.2 | REG-1/REG-2 manual steps | Nguồn Section 7.3 |
| PENTEST-REPORT.md | 92 attempts, 0 bypass, PT-01/PT-02 | Nguồn Section 10 |
| worktree-parallel-pipeline.md | R1–R7 quy tắc song song | Nguồn R6 (Section 1.4/Checklist #9) |

### 12.5 Deployment Report Template (điền sau mỗi lần deploy)

```markdown
## Deployment Report — SA4E-356
Date: <timestamp> | Environment: <UAT/PROD> | Version: <ver> | Status: PASS/FAIL
Steps: build → marker-verify → checksums → install → reload → smoke (7.2) → health (7.1)
Sanity: health [ ] | smoke relative-path [ ] | AC-4 tools/list [ ] | logs 0 ERROR [ ]
Rollback: N/A / Option <A|B> — trigger: <...>
```

---

*— Hết DPG SA4E-356 v1.0 — Deployment model: VSIX per-user Kiro · UAT PASSED 2026-10-14 · Rollback: git revert (TDD §13) hoặc reinstall 1.47.2 · Deploy chỉ từ main (R6) —*
