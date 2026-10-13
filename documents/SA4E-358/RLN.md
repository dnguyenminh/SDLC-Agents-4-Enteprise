# Release Notes (RLN)

## SDLC Agents for Enterprise — SA4E-358: [Follow-up SA4E-356/SA-01] CORS * + no authN trên loopback :9181 — Origin/Host validation

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.52.0 (git tag `v1.52.0`) — **fold vào release 1.52.0 của SA4E-355 session** (commit `683f070`) — **combined build 356+358** |
| Release Date | 2026-10-14 (UAT PASSED) — CORS gate đã LIVE trên wrapper port configured (`:9183` trên máy hiện tại) |
| Jira Ticket | SA4E-358 |
| Environment | UAT (PASSED) → PROD (release nội bộ từ main) |
| Author | DevOps Agent |
| Status | Released |

> **Ghi chú fold-release:** RLN này **không bump version mới** — fix được fold vào release v1.52.0 đã tag. Deployed reality đã verify trên Kiro: marker `PATH_NO_WORKSPACE` (356) + gate strings (358) có trong bundle, **0 `ACAO: *`** trên server live. N-QA2 harness 15/15 PASS dev-host `:9183` (evidence/n-qa2-devhost-9183.log).

> ⚠️ **PORT NOTE (quan trọng):** wrapper port là config **có sẵn** `sdlcAgents.mcpServerPort` — máy hiện tại **9183** (KHÔNG phải default 9181). Mọi lệnh verify/smoke PHẢI dùng port configured, **KHÔNG hardcode 9181**. Gate so Host với port listen THỰC TẾ (G-7/AD-7) nên đổi config không vỡ gate.

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-14 | DevOps Agent | Initiate document — fold vào release 1.52.0 (combined build) |

---

## 1. What's New

### 1.1 Feature Summary

Phiên bản 1.52.0 (thành phần SA4E-358) đóng finding bảo mật **SA-01** do Security Assessment của SA4E-356 phát hiện: MCP WrapperServer loopback (bind `127.0.0.1`) trước đây trả `Access-Control-Allow-Origin: *` và không có authentication — **website bất kỳ** user truy cập có thể (a) đọc dữ liệu Atlassian (Jira/Confluence) qua browser drive-by (response trả thẳng về attacker page), (b) trigger side-effect (ghi file trong workspace, upload file lên Jira), và (c) DNS rebinding.

Fix: **OriginGate** — module pure `extension/src/services/OriginGate.ts` (179 dòng, 7 phases G-1..G-8) đặt **gate-first trước handleMcp**: chỉ `vscode-webview://*`, `localhost`/`127.0.0.1` (bất kỳ port) và native client (không có Origin) được qua; web origin lạ → **403 uniform** `{"error":"Forbidden"}` không kèm CORS header nào → browser chặn readback. Đóng cả vector **DNS rebinding** qua Host validation áp cho mọi request có Host header (kể cả no-Origin — SEC-358-01 Option A).

### 1.2 User-Facing Changes (⚠️ Behavior Changes — QUAN TRỌNG cho users)

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | **`ACAO: *` KHÔNG CÒN** | Server KHÔNG trả `Access-Control-Allow-Origin: *` ở bất kỳ response nào (kể cả 404/health) — website lạ gọi API → 403 zero-CORS → browser chặn đọc response | **High** (web origin lạ) |
| 2 | **Preflight OPTIONS được gate** | Cross-origin preflight từ origin lạ → 403 (không còn 204 pass) | High |
| 3 | **Host validation mới (kể cả no-Origin)** | Request có Host ≠ loopback (vd `attacker.com:9181` sau DNS rebind) → 403 `host-mismatch` — áp cho MỌI request có Host, kể cả không có Origin (SEC-358-01). Carve-out duy nhất: no-Origin + không Host (HTTP/1.0 legacy, H-9) | High |
| 4 | **Vary: Origin** | Response echo Origin thêm `Vary: Origin` — đúng semantics cache | Low |
| 5 | **Deny 403 uniform** | Mọi deny: HTTP 403 + body `{"error":"Forbidden"}` — không leak allowlist config, không echo header attacker; deny log 1 dòng sanitized (anti log-forging) | Low |
| 6 | **Client hợp lệ không đổi** | vscode-webview + localhost OK (echo Origin đúng); native MCP client (no-Origin) PASS; stdio không qua HTTP — không đổi | — |
| 7 | **[::1] deny by design** | IPv6 loopback không nằm allowlist (server bind `127.0.0.1` — không thể gặp trong thực tế) | Info |

### 1.3 Screenshots

N/A — see UAT evidence: `documents/SA4E-358/evidence/n-qa2-devhost-9183.log` (LH-01..04 evil→403 zero-CORS; LH-05..07 webview→echo EXACT; LH-08 native session `[200,202,200,200,200]` deny-log delta 0; LH-13 SEC-358-01 live).

---

## 2. Technical Changes

### 2.1 API Changes

None (handshake MCP giữ nguyên byte-level cho caller được phép). Thay đổi HTTP surface:

| Item | Before | After |
|------|--------|-------|
| `Access-Control-Allow-Origin` | `*` vô điều kiện (`WrapperServer.ts:126-128`) | **Xóa** — chỉ echo khi Origin ∈ allowlist (constant) |
| `Vary:` | — | `Origin` |
| Origin lạ / Host lạ | 200 / passthrough | **403** trước `handleMcp` |
| Preflight OPTIONS | 204 luôn | 204 chỉ khi Origin được phép; ngược lại 403 |
| SSE GET /mcp | mở tự do | cùng gate (AC-6) |

### 2.2 Database Changes

None — extension-only release.

### 2.3 Configuration Changes

| Item | Change Type | Description |
|------|-------------|-------------|
| Allowlist | New (immutable constant) | `vscode-webview://*` (pattern theo scheme) + `http(s)://localhost:<any>` + `http://127.0.0.1:<any>` — **KHÔNG có setting UI/config**; thay đổi qua code + unit test (BR-09) |
| `sdlcAgents.mcpServerPort` | Unchanged | Config có sẵn — port hiện tại 9183; gate tự so với port listen thực tế |
| Shared-secret authN | **KHÔNG có** | Immature scope — là follow-up OI-1; gate không thay thế authN (threat model: loopback local) |

### 2.4 Infrastructure Changes

None — cùng VSIX deployment surface với 356 (combined build 1.52.0, 2028 files). CI/CD thêm `ci-sa4e-358.yml` (4 jobs) + Semgrep CORS rules (3 rules) + `check-cors-gate-sa4e358.sh` (G1/G2/G3).

---

## 3. Features & Fixes (Commit Chain)

| # | Item | Summary | Commit |
|---|------|---------|--------|
| 1 | Implement CORS Origin/Host gate | OriginGate.ts (185→179 dòng, 7 phases) + WrapperServer gate-first + xóa ACAO vô điều kiện + echo-only + Vary: Origin + 46 unit + 40 integration tests + bench + cors-pentest-harness LH-01..15 | `7bb9222` (23 files) |
| 2 | UG v1.0 + SECURITY-ASSESSMENT | Origin Gate Rules 7 rules + Troubleshooting decision tree + security code review APPROVED | `65feabf` |
| 3 | TEST-REPORT + PENTEST | Phase 6 CONDITIONAL PASS 62/64 + pentest SECURE-WITH-NOTES 53 attempts 0 bypass | `3f4af4e` (13 files) |
| 4 | CI/CD + docs Phases 3.7-4.5 | `ci-sa4e-358.yml` + Semgrep + CORS check script + coverage gate | `05bb0cd` (31 files) |
| 5 | Docs Phase 1-3 | BRD v1.0 + FSD v1.1 + TDD v1.0 | `ce37044` |
| 6 | Release gate | DPG + UAT evidence + STATUS | `0832ba3`, `06de02f` |

Design note: SEC-358-01 (DNS rebinding same-origin qua nhánh no-Origin) được fold **Option A** vào Phase 5 — Host check áp cho mọi request có Host (I-8/AD-10, Phase 1.5 trong contract 7 phases) — tránh follow-up bắt buộc trước release.

---

## 4. Highlights (Verification Evidence)

| Gate | Kết quả |
|------|---------|
| Acceptance Criteria | **AC-1..AC-8: 8/8 ✅** |
| Merge conditions (SECURITY-REVIEW) | **7/7 ✅** (live harness green incl. dev-host leg) |
| Full regression suite | **2808/2808 tests PASS** — 0 regression |
| STC v1.1 | 64 cases: **62 PASS / 0 FAIL / 2 PENDING** (dev-host build combined) → **N-QA2 15/15 PASS dev-host :9183** đóng đủ |
| Coverage | OriginGate **100%** lines / **96.42%** branches; PathResolver 100% (356) |
| G1/G2/G3 static gates + Semgrep | ALL GREEN (grep 0 `ACAO: *`) |
| Perf bench | p99 **38.8 µs** (< 1 ms budget), delta −0.0185 ms |
| Pentest Phase 6.3 | **53 attempts adversarial · 45 PASS · 8 NOTE · 0 FAIL · 0 bypass** — I-8 live-proven (mọi Host xấu → 403 host-mismatch kể cả no-Origin) |
| Security Assessment 5.7 | **APPROVED WITH FINDINGS — Overall Risk LOW** (0 Critical/High/Medium; 1 Low pre-existing SA358-R1 + 2 Info) |
| UAT | **User confirm "UAT pass" 2026-10-14** (RUN-LOG #46 — N-QA2 15/15 dev-host :9183, LH-13 live) |

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SA4E-356 PathResolver | 1.52.0 | Released | Parent finding SA-01; sanitization pattern (sanitizeLogText) tái sử dụng cho deny log |
| SA4E-355 Context Budget Governance | 1.52.0 | Released | Combined build base |

### 5.2 External System Changes

| System | Change Required | Status |
|--------|----------------|--------|
| Native MCP clients (VS Code/Kiro) | Không đổi gì (no-Origin passthrough) | ✅ Zero regression |
| Webview/web clients | Chỉ vscode-webview + localhost được phép | ✅ OK |

---

## 6. Migration Notes

### 6.1 Data Migration

None — no data migration required.

### 6.2 Breaking Changes

**Không breaking cho clients hợp lệ.** Breaking duy nhất là **with-hostile/by-design**: web origin lạ (`https://evil.com` hoặc bất kỳ site nào không nằm allowlist) gọi wrapper → 403 + zero-CORS (đây chính là mục đích của fix). Không có config migration bắt buộc cho client nào.

### 6.3 Backward Compatibility

- **Native MCP clients (stdio + http)**: không đổi — stdio không qua HTTP; http client không gửi Origin → passthrough; nếu gửi Origin localhost → vẫn pass (2 lớp bảo vệ AC-4).
- **vscode-webview + localhost**: preflight 204 + ACAO echo EXACT, POST/SSE bình thường.
- **Multi-root / multi-worktree / port config**: gate tự thích ứng port động (G-7).
- **Không có config allowlist** (immutable constant) — client hợp lệ mới ngoài allowlist (hiếm) cần code change 1 commit nhỏ (R-1/R-2); shared-secret authN là follow-up OI-1, không trong release này.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Full suite (extension, vitest) | 2808 | 2808 | 0 | 0 | 100% |
| STC v1.1 (63 cases / 64 rows) | 64 | 62 | 0 | 2 PENDING → đóng qua N-QA2 dev-host 15/15 | 100% |
| N-QA2 live harness (dev-host :9183) | 15 | 15 | 0 | 0 (LH-09 SKIP theo design) | 100% |
| Coverage (OriginGate) | — | 100% / 96.42% branches | — | — | ✅ |
| Pentest (53 attempts) | 53 | 45 PASS | 0 bypass | 8 NOTE (documented/accepted) | SECURE-WITH-NOTES |
| UAT (user confirm) | N-QA2 + V-4 | PASS | — | — | ✅ 2026-10-14 |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Medium | 1 (SEC-358-01 — design) | 1 (Option A folded) | 0 | 0 |
| Low | 1 (SA358-R1 pre-existing) | 0 | 1 (backlog) | — |

---

## 8. Deployment Instructions

See: [Deployment Guide](DPG.md) — **combined build 1.52.0** (356+358), đã deploy + Reload Window + N-QA2 15/15 PASS trên dev-host :9183.

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Build combined VSIX (`npm run package:prod`) | 2 min |
| 2 | Verify 4 gate markers trong bundle + **0 `ACAO: *`** | 1 min |
| 3 | Install `--force` + **Reload Window ngay** (transition < 5 phút — SD-04) | 2 min |
| 4 | CORS smoke: 4 curl checks + N-QA2 harness trên port configured | 5 min |
| **Total** | | **~10 min** |

> ⚠️ Port: dùng `sdlcAgents.mcpServerPort` (hiện **9183**) — KHÔNG hardcode 9181. Deny log: `[WrapperServer] Denied request — reason=<origin-not-allowed|host-mismatch>` (outputChannel, sanitized).

---

## 9. Rollback Plan

See DPG §6 (rollback + combined constraints).

**Rollback Decision Criteria:**
- Native MCP client (no-Origin) bị 403 sai → rollback now (gate false-positive)
- vscode-webview/localhost bị 403 sai → rollback now
- Server crash loop khi nhận malformed header → rollback now (SA358-R1 crash-risk)
- Web origin lạ vẫn đọc được response → security regression — rollback + re-investigate

**Estimated Rollback Time:** Option B (binary — reinstall **1.48.0** + reload + verify) ~5 phút · Option A (git revert `7bb9222` + rebuild + reinstall) ~30-45 phút.

> ⚠️ **Rollback = MẤT CORS GATE (SD-05 / điều kiện C3 Security Deploy Review 356):** reinstall 1.48.0 quay về posture SA-01 (`ACAO: *` + no authN). Chỉ rollback khi **blocking defect** — phải **time-bound + document** thời hạn tối đa; primary là **forward-fix** (reinstall combined 1.52.0). KHÔNG để rollback thành trạng thái dài hạn.

---

## 10. Known Issues & Limitations (Follow-ups)

| # | Issue | Severity | Impact | Workaround / Plan |
|---|-------|----------|--------|-------------------|
| 1 | **SA358-R1 / PT-51** — `new URL(req.url)` ngoài try/catch: absolute-form request-target malformed (chỉ non-browser gửi được) → unhandledRejection (crash-risk/log-noise); live-confirmed lần đầu với repro chính xác (server sống nhờ harness handler) | Low (pre-existing backlog) | Không phải bypass; non-browser only | Backlog hardening cùng SEC-358-04: move vào try → 404 (1 dòng) |
| 2 | **PT-42** — deny-log flood: 200 denies trong 36ms ≈ **5.556 lines/s**, no rate-limit (quantified, accepted) | Info | Log amplification in-memory | OI-3: rate-limit/throttle deny-log theo reason |
| 3 | **Shared-secret authN (OI-1)** — gate KHÔNG thay thế authN | Info (threat model: loopback local) | Posture phụ thuộc gate + bind 127.0.0.1 | Follow-up OI-1 khi cần posture mạnh hơn |
| 4 | **Public-release blockers** — bắt buộc trước marketplace publish | Medium (SD-01, SD-02) / Low (SD-03) / Info (SD-09) | SD-01: VSIX chứa dev artifacts (info-disclosure nội bộ + phình 12.43MB); SD-02: lock drift khiến npm audit blind; SD-03: VSIX unsigned + không checksum; SD-09: SA-07 transitive HIGH gate | Fix SD-01/02 (P2) + publish SHA256SUMS/signed VSIX (SD-03) + bump pi-web-access (SD-09) trước khi ra public |
| 5 | Không có config allowlist | — | Client hợp lệ mới ngoài allowlist cần code change | 1 commit nhỏ + unit test (immutable constant — BR-09) |

---

## 11. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | SM Agent | RUN-LOG.md | Release coordination |
| Dev Lead | DEV Agent | session log | Technical issues |
| QA Lead | QA Agent | TEST-REPORT.md | Testing sign-off |
| DevOps | DevOps Agent | DPG.md | Deployment execution |
| Security | Security Agent | SECURITY-ASSESSMENT.md / PENTEST-REPORT.md | Security sign-off |
| Business Owner | User (UAT confirmee) | Jira SA4E-358 | Business sign-off |

---

## 12. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | 2026-10-14 | ☑ Approved (TA implementation review iteration 2) |
| QA Lead | | 2026-10-14 | ☑ Approved (UAT PASSED — N-QA2 15/15) |
| Security | | 2026-10-14 | ☑ Approved (LOW — 7/7 merge conditions) |
| Business Owner | | 2026-10-14 | ☑ Approved (UAT PASSED confirmed) |
| Release Manager | | | ☐ Approved |

---

*End of Release Notes — SA4E-358 — Release 1.52.0 (fold, combined build)*
