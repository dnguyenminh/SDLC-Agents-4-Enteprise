# Release Notes (RLN)

## SDLC Agents for Enterprise — SA4E-356: [Bug] MCP tools — relative file_path resolves against process CWD (Kiro install dir) instead of workspace root

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.52.0 (git tag `v1.52.0`) — **fold vào release 1.52.0 của SA4E-355 session** (commit `683f070` "SA4E-355 release v1.52.0 DONE") |
| Release Date | 2026-10-14 (UAT PASSED) — 2 fix của ticket này đã nằm trong **combined build 1.52.0** deployed trên Kiro |
| Jira Ticket | SA4E-356 |
| Environment | UAT (PASSED) → PROD (release nội bộ từ main) |
| Author | DevOps Agent |
| Status | Released |

> **Ghi chú fold-release:** v1.52.0 đã được release bởi session song song (SA4E-355/SA4E-360) trước khi pipeline 356/358 tới Phase 7. RLN này **không bump version mới** — fix path resolution (SA4E-356) và CORS Origin/Host gate (SA4E-358) là thành phần của build 1.52.0 đang chạy. Deployed reality đã verify: marker `PATH_NO_WORKSPACE` + `OriginGate` strings có trong bundle, **0 `ACAO: *`** trên server live (port configured `:9183`).

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-14 | DevOps Agent | Initiate document — fold vào release 1.52.0 |

---

## 1. What's New

### 1.1 Feature Summary

Phiên bản 1.52.0 (thành phần SA4E-356) sửa **bug path resolution nghiêm trọng của MCP tools**: mọi tool nhận tham số `file_path` (jira_attach_file, embed_image, drawio_export_png, drawio_auto_layout, mem_ingest_file, sandbox_run, confluence_add_attachment, stream_write_file) trước đây resolve đường dẫn **tương đối** theo process CWD của MCP server — tức **thư mục cài Kiro** (`C:\Users\...\Programs\Kiro`) — thay vì workspace root của project đang mở. Hậu quả: **toàn bộ** file-based calls với relative path fail `ENOENT`, buộc agent phải retry bằng absolute path ở mọi thao tác (tốn token + latency, gián đoạn pipeline SDLC tự động L3), và tệ hơn là agent có thể kết luận sai "file không tồn tại".

Fix: tách path-resolution logic thành **shared helper `PathResolver`** (extension/src/services/PathResolver.ts — 223 dòng) áp dụng cho **100% tools trong audit list (8/8)**: relative path giờ resolve theo **primary workspace folder**, absolute path passthrough, escape ngoài workspace bị chặn fail-loud với error message chứa **đường dẫn đã resolve + gợi ý tự-sửa**.

### 1.2 User-Facing Changes (Behavior Changes — cho end-users / AI agents)

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | **Relative path giờ đúng workspace** | Tool gọi với `file_path` tương đối (vd `documents/SA4E-356/STATUS.json`) resolve theo workspace root — thành công ngay lần đầu, không còn `ENOENT` từ thư mục cài Kiro | High |
| 2 | **Absolute path `C:\...` hoa/thường không còn bị reject-oan (R-1)** | Containment check giờ **case-fold trên Windows** — absolute path với drive letter viết hoa `C:\projects\...` PASS ngay cả khi workspace trả về `c:\projects\...` (trước đây bị "Path rejected: outside workspace" oan) | High |
| 3 | **Error messages mới: resolved path + hint** | File không tồn tại → `FILE_NOT_FOUND` Format 1 chứa absolute path **đã resolve** + gợi ý dùng absolute path → agent tự sửa trong đúng 1 lượt retry | Medium |
| 4 | **Fail-loud khi không mở workspace (BR-06b)** | Relative path khi KHÔNG mở workspace → từ chối rõ ràng `PATH_NO_WORKSPACE` (Format 3) thay vì resolve âm thầm vào thư mục cài Kiro; absolute path bên trong `process.cwd()` vẫn passthrough (DISC-1) | Medium |
| 5 | **Payload limits 10 MB / 25 MB (N-9)** | `content` > 10 MB bị refuse trước resolve; pre-read file > 25 MB bị refuse trước đọc — chặn disk-fill/OOM | Low |
| 6 | **Escape ngoài workspace bị chặn (AC-3)** | `../` traversal, prefix-collision (`WS-evil` sibling), NUL/control chars (`PATH_INVALID`), symlink/junction dir escape — đều fail-closed với Format 2 byte-exact | Medium |
| 7 | **Schema descriptions minh bạch (AC-4)** | 100% tools trong audit list mô tả rõ rule resolution trong inputSchema — agent biết chính xác cách `file_path` được interpret | Low |

### 1.3 Screenshots

N/A — see UAT evidence: `documents/SA4E-356/` (RUN-LOG #57-59: build 1.48.0 deployed → marker `PATH_NO_WORKSPACE` verified trong bundle → stream_write_file relative path live PASS → user confirm UAT).

---

## 2. Technical Changes

### 2.1 API Changes

None (không đổi MCP tool signature / protocol). Thay đổi resolution behavior nội bộ + schema descriptions. Error surface mới:

| Code / Format | Mô tả |
|---------------|-------|
| `PATH_NO_WORKSPACE` (Format 3) | Relative path khi không mở workspace — fail-loud trước khi chạm fs |
| `PATH_INVALID` | NUL/control chars trong path — fail trước resolve |
| `PATH_REJECTED` (Format 2) | Escape ngoài workspace root — không leak path bên ngoài |
| `FILE_NOT_FOUND` (Format 1) | Chứa resolved path + hint — byte-exact builder |
| `Wrapper Error:` prefix | Bắt buộc trên mọi error từ ToolProxy (chat ToolResult không có isError) |

### 2.2 Database Changes

None — extension-only release.

### 2.3 Configuration Changes

| Item | Change Type | Description |
|------|-------------|-------------|
| PathResolver shared helper | New | 223 dòng, pure helper (C-2: không fs import), per-call provider, case-fold win32, multi-root deterministic (primary folder) |
| Payload caps N-9 | New | 10 MB content / 25 MB pre-read — đặt trước resolve/read |
| Symlink guard I-7 | New | realpath dirname + re-check containment ở handler layer (7 điểm chạm fs) |
| SA-02 fix | Fix | Sanitize `resolved` echo backend (CWE-117 log forging — 0-gap) |
| PT-02 fix | Fix | Sanitize `console.debug` call-site imageToDataUri |
| Runtime settings | Unchanged | Không có config/env/flag mới bắt buộc |

### 2.4 Infrastructure Changes

None — desktop VSIX deployment (Kiro ≥ 1.2). CI/CD thêm `ci-sa4e-356.yml` (5 jobs, matrix ubuntu+windows) + Semgrep rules N-8 + vitest coverage gate (≥95% PathResolver — đạt 100%).

---

## 3. Features & Fixes (Commit Chain)

| # | Item | Summary | Commit |
|---|------|---------|--------|
| 1 | PathResolver + resolve-all-tools | Shared helper PathResolver.ts + 6 test files + refactor 8 tool call sites + Base64ProxyService/ToolProxy/remote-backend + backend drawio disambiguation; WrapperServer envelope fix (return-await) | `bb17b39` (20 files, +2587/−164) |
| 2 | UG v1.0 + SECURITY-ASSESSMENT + SA-02 fix | User Guide 11 sections + security code review APPROVED + sanitize resolved echo backend | `7c525a8` (6 files) |
| 3 | TEST-REPORT Phase 6 | CONDITIONAL PASS 33/33 (REG-1/2 manual close-gate PENDING tại thời điểm đó — đã đóng qua UAT) | `65afa5b` (4 files) |
| 4 | PENTEST + PT-02 fix | Pentest report SECURE-WITH-NOTES + harness rerunnable + sanitize console.debug:347 | `f453e77` |
| 5 | CI/CD + docs (Phase 4.5) | `ci-sa4e-356.yml` + Semgrep N-8 + coverage gate + docs BRD/FSD/TDD/STP/STC | `9c75f90` (34 files) |
| 6 | UG v1.1 multi-worktree | Path rules multi-worktree/multi-root + worktree parallel pipeline strategy | `2a6967b` |

Docs/release-gate commits: `7c002ab`, `d67c57e`, `0832ba3`, `06de02f`.

---

## 4. Highlights (Verification Evidence)

| Gate | Kết quả |
|------|---------|
| Acceptance Criteria | **AC-1..AC-5: 5/5 ✅** (AC-5 = replay repro gốc SA4E-355 attach 18/18 files bằng relative path) |
| Full regression suite | **2660/2660 tests PASS** (278 files) — 0 regression |
| STC v1.1 | **33/33** (PBT 4/4, UT 15/15, IT 10/10, SCAN 2/2, E2E-API harness 3/3) |
| Coverage N-7 | PathResolver.ts **100%** (gate ≥95%) |
| N-8 static scan | **0 violations** (no single-arg resolve / no raw fs.* on file_path) |
| Pentest Phase 6.3 | **92 attempts · 0 bypass** — 12 escape vectors fail-closed; verdict SECURE-WITH-NOTES |
| Security Assessment 5.7 | **APPROVED WITH FINDINGS — Overall Risk LOW** (0 Critical/High; SEC-01..08 verified 8/8) |
| Security Deploy Review 6.7b | **APPROVED WITH CONDITIONS — GO Phase 7** |
| UAT | **User confirm "UAT pass" 2026-10-14** (RUN-LOG #59 — REG-1/REG-2 trên build deployed) |

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SA4E-355 Context Budget Governance | 1.52.0 | Released | Parent epic — bug phát hiện trong epic này; full-suite green dependency |
| SA4E-358 CORS Origin/Host gate | 1.52.0 | Released (combined build) | Đóng SA-01 do 356 security review phát hiện — deploy combined |

### 5.2 Follow-up Tickets

| Ticket | Nội dung | Status |
|--------|----------|--------|
| SA4E-358 | CORS/Origin validation (SA-01) — đã release cùng 1.52.0 | ✅ Released |
| SA4E-359 | OI-1 drawio proxy-route follow-up | Backlog |

---

## 6. Migration Notes

### 6.1 Data Migration

None — no data migration required.

### 6.2 Breaking Changes

**Không breaking trên nhánh chính (có mở workspace)** — hành vi resolution tổng thể giữ nguyên, chỉ sửa đúng theo contract tool-agent.

**2 behavior changes có chủ đích ở nhánh fallback KHÔNG mở workspace** (edge case hiếm, đã BA-approve trong BRD §1.5 v1.0.1/v1.0.2):
1. *(DISC-1)* Absolute path ngoài `process.cwd()` giờ được cho phép (trước đây `stream_write_file` chặn "Path rejected" oan — containment theo thư mục cài Kiro vô nghĩa về security).
2. *(BR-06b / SEC-02)* Relative path giờ bị **từ chối fail-loud** `PATH_NO_WORKSPACE` thay vì resolve âm thầm vào thư mục cài Kiro (pollute install dir / EACCES).

### 6.3 Backward Compatibility

Fully backward compatible với workflows hợp lệ: relative path (giờ hoạt động ĐÚNG như schema hứa), absolute path trong workspace (không đổi), stdio transport + native MCP clients (zero regression — 2660 tests + UAT verify). Absolute paths tiếp tục hoạt động như trước.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Full suite (extension, vitest) | 2660 tests / 278 files | 2660 | 0 | 0 | 100% |
| Backend suite (drawio-tool + local-tools) | 19 + 42 | 61 | 0 | 0 | 100% |
| STC v1.1 (PBT/UT/IT/SCAN/E2E-API) | 33 | 33 | 0 | 0 (REG-1/2 manual đã đóng qua UAT) | 100% |
| Coverage N-7 (PathResolver) | — | 100% | — | — | Gate ≥95% ✅ |
| Pentest (92 attempts) | 92 | 90 | 0 bypass | 2 NOTE (PT-01/PT-02 Low) | SECURE-WITH-NOTES |
| UAT (user confirm) | REG-1 + REG-2 | PASS | — | — | ✅ 2026-10-14 |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 0 | 0 | 0 | 0 |
| Minor | 3 (SA-02, PT-02, R-1 casing) | 3 | 0 | 0 |

---

## 8. Deployment Instructions

See: [Deployment Guide](DPG.md) — **combined build 1.52.0 chứa cả fix SA4E-356 + SA4E-358**, đã deploy trên Kiro (UAT machine).

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Build VSIX (`npm run package:prod` trong `extension/`) | 2 min |
| 2 | Verify markers trong bundle: `PATH_NO_WORKSPACE` + `PATH_INVALID` | 1 min |
| 3 | Install: `kiro --install-extension sdlc-agents-4-enterprise-1.52.0.vsix --force` | 1 min |
| 4 | **Reload Window ngay** (transition window < 5 phút — SD-04) | 1 min |
| 5 | Verification: smoke relative-path call + REG-1/REG-2 replay | 5 min |
| **Total** | | **~10 min** |

> ⚠️ Đơn vị deployment cho 356/358 là **combined build** — KHÔNG install 1.48.0 (build UAT 356 đơn lẻ) trừ khi rollback (xem §9).

---

## 9. Rollback Plan

See DPG §8 (Option A/B + worktree cleanup).

**Rollback Decision Criteria:**
- Tool file-based hợp lệ (relative trong workspace) bị reject sai → rollback now
- Escape path (`../`, prefix-collision) KHÔNG còn bị chặn → rollback now (security regression)
- Extension activation failure / wrapper crash loop → rollback now
- Error message format sai byte-level → hotfix, no rollback

**Estimated Rollback Time:** Option B (binary — reinstall VSIX trước + reload + verify) ~5 phút · Option A (git revert + rebuild + reinstall) ~30-45 phút.

> ⚠️ **Rollback constraint (SD-05, áp dụng combined):** reinstall 1.48.0 = **mất CORS gate của SA4E-358**, quay về posture SA-01 (`ACAO: *` + no authN). Chấp nhận được **interim time-bound** — primary là **forward-fix** (reinstall combined 1.52.0), KHÔNG để rollback thành trạng thái dài hạn.

---

## 10. Known Issues & Limitations (Follow-ups)

| # | Issue | Severity | Impact | Workaround / Plan |
|---|-------|----------|--------|-------------------|
| 1 | **PT-01** — ensureDir chạy trước symlink guard: thư mục trống có thể được tạo ngoài workspace root qua junction có sẵn (file write vẫn bị chặn) | Low | Side-effect dir creation — không phải containment bypass | Follow-up hardening P3: guard/rollback trước-sau ensureDir |
| 2 | **SA-07** — npm audit 1 HIGH transitive: `@modelcontextprotocol/sdk 1.27.1` nested trong `pi-web-access 0.33.0` (direct dep 1.29.0 clean; ticket zero runtime-dep change) | Info (pre-existing) | Client-side usage, không expose network surface mới | Theo dõi upstream bump `pi-web-access`; triage won't-fix-có-căn cứ; **GATE cho public release** |
| 3 | **SA-04** — file-level symlink escape residual (guard chỉ realpath dirname — design-accepted AD-17) | Info | Hardlink hoạt động không cần privilege (pentest live-confirmed) | OI-2 follow-up: realpath file cho READ path |
| 4 | SA-01 (CORS `*` trên :9181) | Medium (pre-existing) | Đã đóng bởi **SA4E-358** (Origin/Host gate) — release cùng 1.52.0 | ✅ Resolved |
| 5 | E2E-API REG-1/REG-2 manual close-gate | — | Đã thực hiện trong UAT (RUN-LOG #59) | ✅ Closed |

---

## 11. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | SM Agent | RUN-LOG.md | Release coordination |
| Dev Lead | DEV Agent | session log | Technical issues |
| QA Lead | QA Agent | TEST-REPORT.md | Testing sign-off |
| DevOps | DevOps Agent | session log | Deployment execution |
| Security | Security Agent | SECURITY-ASSESSMENT.md / PENTEST-REPORT.md | Security sign-off |
| Business Owner | User (UAT confirmee) | Jira SA4E-356 | Business sign-off |

---

## 12. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | 2026-10-12 | ☑ Approved (TA implementation review) |
| QA Lead | | 2026-10-14 | ☑ Approved (UAT PASSED) |
| Security | | 2026-10-14 | ☑ Approved (Deploy Review GO Phase 7) |
| Business Owner | | 2026-10-14 | ☑ Approved (UAT PASSED confirmed) |
| Release Manager | | | ☐ Approved |

---

## Appendix — Jira Attachments (34 files)

| Loại | Files |
|------|-------|
| DOCX | BRD-v1, FSD-v1.3, TDD-v1.2, STP-v1.1, STC-v1.1, UG-v1.1 |
| Reports | TEST-REPORT.md + CSV (33 rows), SECURITY-ASSESSMENT, PENTEST-REPORT + pentest-results.csv |
| Diagrams | 10 drawio (use-case, business-flow, architecture, component, class, sequence, state, test-coverage, test-execution-flow, ...) + 10 PNG |

*End of Release Notes — SA4E-356 — Release 1.52.0 (fold)*
