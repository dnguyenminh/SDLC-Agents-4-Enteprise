# Software Test Plan (STP)

## SDLC Agents 4 Enterprise — SA4E-362: [Pega Ingest] Invalid or expired token — Refresh-on-401 cho ingest path

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-362 |
| Title | [Pega Ingest] Invalid or expired token - ingest path thieu refresh-on-401 khi access JWT het han giua job dai |
| Type / Priority | Bug / High |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-15 |
| Status | Draft (pending BA review gate) |
| Branch | SA4E-362 (do NOT commit from QA phase) |

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-16 | QA Agent | Initiate STP — lean bug-fix scope, RTM traced to BRD US-1..US-4 (FSD viết song song, sync pass sau sẽ map FRs); BA review gate iteration 1 incorporated |

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| BA Agent (business coverage review) | ☐ |
| SM Agent (gate) | ☐ |

---

## 1. Introduction

### 1.1 Purpose

STP định nghĩa chiến lược kiểm thử cho fix SA4E-362: ingest path (PegaStreamIngester → PegaBfsIndexer → PegaBfsPipeline, BackendHttpPoster/bulk-check, wiring IndexingService) thiếu refresh-on-401 khi access JWT hết hạn giữa job dài → 25k+ rules bị skip âm thầm. Plan kiểm tra hành vi SAU fix: refresh-on-401 + retry đúng một lần, graceful stop khi refresh token chết, bulk-check refresh-retry, và một contract IngestAuthProvider duy nhất.

### 1.2 Scope

**Được test:**

1. Refresh-on-401 trên cả 3 call site của PegaStreamIngester — submitJob (:119), pollUntilComplete (:149, headers phải rebuild per-request), ingestSingleRule (:212) — qua helper fetchWithAuthRetry (fix plan §4.2).
2. Stream replay: body NDJSON dựng lại qua factory makeBody() khi retry (không reuse ReadableStream đã consume), duplex:'half' giữ nguyên ở cả 2 lần gửi.
3. Graceful auth-dead stop: typed IngestAuthError → authDead → stop-hook shouldStop trong PipelineOptions của PegaBfsPipeline (producer ngừng phát việc, consumer hoàn tất item đang chạy) — với CẢ 2 trigger: refresh trả undefined VÀ retry vẫn 401; KHÔNG auto-login; đúng 1 thông báo "login lại".
4. Bulk-check refresh-on-401: BackendHttpPoster nhận signature union (() => string cũ | IngestAuthProvider mới) — 3 test cũ tại extension/src/code-intel/delta/__tests__/BackendHttpPoster.test.ts :31/:44/:58 phải giữ xanh.
5. Wiring IndexingService: provider đầy đủ getTokenSync + refreshToken, this.token đồng bộ (SA4E-300 GAP 4).
6. Static-token path còn sót: PegaSchemaIndexer (trước đây thiếu hẳn Authorization), audit 0 static-token path trên /api/v1/pega/*.
7. AuthManager concurrent refresh dedupe (refreshInFlight) — nhiều 401 song song → đúng 1 refresh network call.

**Không test (out of scope):** xem §3.2.

### 1.3 References

| Document | Location |
|----------|----------|
| BRD v1.0 (US-1..US-4 + AC) | documents/SA4E-362/BRD.md |
| Fix Plan §4 (design), §7 (verify plan) | SessionTimeout-FIX-PLAN.md (repo root) |
| Test conventions | extension/src/services/__tests__/IndexerHttpClient.token-refresh.test.ts (vi.stubGlobal + mockResolvedValueOnce + tokenRefresher stub); IndexerHttpClient.ingest.test.ts (jsonResponse helper, (client as any)); extension/src/auth/__tests__/auth-manager.test.ts (makeSecrets Map-based, okJson) |
| Vitest discovery | extension/vitest.config.ts — include src/**/__tests__/**/*.test.ts (test dir mới tự được pick up) |
| Pattern nguồn | IndexerHttpClient refresh-on-401 (SA4E-99, SA4E-300) |

### 1.4 Test Objectives (map Success Metrics BRD §2.4)

| # | Objective | Metric BRD |
|---|-----------|-----------|
| O-1 | 0 lần lặp lại "Invalid or expired token" SAU điểm refresh trong một run | SM-1 |
| O-2 | 0 silent skip do auth (tối đa item in-flight khi dừng) | SM-2 |
| O-3 | Refresh chết → dừng sạch, đúng 1 thông báo, rerun incremental | SM-3, SM-4 |
| O-4 | 0 "bulk-check HTTP 401" spam, không full catalog re-fetch | SM-5 |
| O-5 | 0 static-token path còn sót trên /api/v1/pega/* | SM-6 |
| O-6 | Regression toàn suite xanh (compile + test:unit) | SM-7 |

---

## 2. Test Strategy

### 2.1 Test Levels (6 levels)

| Level | Scope | Automation | Tools | TCs |
|-------|-------|------------|-------|-----|
| PBT | Property "retry-once": mọi chuỗi status đầu vào → ≤2 HTTP request, ≤1 lời gọi refresh (PBT-01) | Automated | vitest + fast-check ^4.9.0 |
| UT | 14 unit cases: PegaStreamIngester (3 call sites + retry-vẫn-401), PegaBfsIndexer/PegaBfsPipeline (authDead), BackendHttpPoster (union signature), IndexingService (wiring), AuthManager (dedup), PegaSchemaIndexer | Automated | vitest — vi.stubGlobal('fetch'), mockResolvedValueOnce chains, jsonResponse helper, (client as any), vi.useFakeTimers cho POLL_INTERVAL_MS=3000 |
| IT | Component wiring đã gộp vào UT-11 (provider → ingester qua fetch stub). IT process-level riêng: N/A — xem §2.2 | — | — |
| E2E-API | Contract 4 ingest endpoints (POST /api/v1/pega/ingest-rule, POST /api/v1/pega/ingest-stream, GET /api/v1/pega/jobs/:id, POST /api/v1/pega/bulk-check) — auth + error handling | Covered-by-SIT (manual, chạy trong SIT-01) — justification §2.2 | curl/REST client + local backend |
| E2E-UI | N/A — VS Code extension, không có web UI. Smoke extension command chỉ thực hiện trong SIT | — | — |
| SIT | 2 manual scenarios: TTL ép 60s (SIT-01), refresh token chết (SIT-02) | Manual | Log viewer + local backend |

### 2.2 Justification cho level bị lược bỏ/giới hạn

- **PBT (giới hạn 1 property):** đây là bug fix hẹp, không phải feature mới. Chỉ 1 property đáng giá: fetchWithAuthRetry retry đúng tối đa một lần với MỌI chuỗi status — property này tổng quát hóa UT-01..UT-03.
- **IT (N/A):** extension unit-testable hoàn toàn qua fetch stub (conventions hiện có); integration thật với KB backend cần login JWT + kiểm soát TTL → chuyển xuống SIT. Wiring giữa các component (IndexingService → ingester) được phủ bởi UT-11 ở mức component.
- **E2E-API (covered-by-SIT, không chạy trong CI):** ACCESS_TTL_SEC là compile-time constant (backend/src/admin/db/jwt.ts:14, giá trị 15 * 60) — không có env override; ép TTL=60 đòi hỏi sửa tạm source backend rồi revert, không khả thi trong CI extension. Suite e2e hiện có của extension fork code-intel backend, không phải KB auth flow với login thật. Do đó 4 case E2E-API được thực thi thủ công trong SIT-01 (same steps, same expected results).
- **E2E-UI (N/A):** không có giao diện web; "UI" duy nhất là extension command → SIT.

### 2.3 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 1 | 1 | 0 |
| UT | 14 | 14 | 0 |
| IT | 0 | 0 | 0 |
| E2E-API | 4 | 0 | 4 (covered-by-SIT) |
| E2E-UI | 0 | 0 | 0 |
| SIT | 2 | 0 | 2 |
| REG | 1 | 1 | 0 |
| **Total** | **22** | **16 (73%)** | **6 (27%)** |

### 2.4 Entry / Exit Criteria

| Level | Entry | Exit |
|-------|-------|------|
| PBT/UT | Fix plan §4 signatures đã implement; npm run test:unit chạy được trên branch SA4E-362 | 100% UT pass; mock fetch đúng pattern (stubGlobal); fake timers không leak (afterEach restore) |
| E2E-API | Local backend boot; login lấy được access + refresh token | 4 endpoint contract khớp bảng expected (401 TOKEN_INVALID trước handler) |
| SIT | Backend build với ACCESS_TTL_SEC=60 (tạm); project Pega test nhỏ (chạy >60s) | SM-1..SM-5 đạt; log evidence lưu evidence/ |
| REG | Toàn bộ UT mới + cũ trong working tree | npm run compile + npm run test:unit xanh; 3 test cũ BackendHttpPoster giữ nguyên xanh |

---

## 3. Test Scope

### 3.1 In Scope (trace BRD)

| # | Feature / Story | Priority |
|---|-----------------|----------|
| 1 | US-1 — Refresh-on-401 + retry một lần cho ingest path (3 call sites, stream replay, poll per-request, dedup) | MUST |
| 2 | US-2 — Graceful stop khi refresh token chết (typed IngestAuthError, shouldStop, 1 thông báo, rerun incremental) | MUST |
| 3 | US-3 — Bulk-check refresh-on-401 (BackendHttpPoster/BulkCheckClient) | MUST |
| 4 | US-4 — Một contract IngestAuthProvider duy nhất; PegaSchemaIndexer có Authorization; audit 0 static-token path | SHOULD |

### 3.2 Out of Scope

| # | Item | Lý do (BRD §1.2) |
|---|------|------------------|
| 1 | Auto-login khi refresh token chết | Quyết định thiết kế — chỉ dừng sạch + báo user |
| 2 | JWT backend (jwt-auth.ts, LocalHS256Verifier) / TTL policy | Middleware hoạt động đúng — lỗi ở client |
| 3 | AuthManager timer nền (scheduleAccessRefresh/TokenRefreshTimer) | Giữ nguyên; chỉ thêm refresh-on-demand |
| 4 | Download path (IndexerHttpClient) | Đã proven SA4E-99/300 — chỉ regression |
| 5 | Giao thức ingest NDJSON / API backend | Không thuộc nguyên nhân gốc |
| 6 | Load test 33.677 rules quy mô đầy đủ | SIT dùng project nhỏ; scale đã verify bằng kiến trúc (BFS + incremental) |

---

## 4. Test Environment & Data

### 4.1 Environment

| Thành phần | Chi tiết |
|-----------|----------|
| OS / Node | Windows, Node ≥ 20, VS Code extension dev host |
| Unit test runner | vitest 4.1.8 + fast-check ^4.9.0 (extension/) |
| Backend | Local KB backend (Kotlin/Ktor) tại localhost:48721 |
| Access TTL | ACCESS_TTL_SEC = 15 * 60 (backend/src/admin/db/jwt.ts:14) — SIT-01 yêu cầu sửa tạm thành 60 rồi REVERT sau khi test (không có env override) |
| Refresh token TTL | 7 ngày (backend/src/admin/db/refresh-tokens.ts:14) — SIT-02 mô phỏng refresh chết bằng revoke/xóa refresh token |
| JWT middleware | 401 phát TRƯỚC handler (HttpServer.ts:111-119) → retry POST an toàn, không side-effect |

### 4.2 Test Data

| File | Nội dung |
|------|----------|
| test-data/http-status-scenarios.csv | 7 status (200/202/400/401/403/500/503) × refresh true/false → expectedRetry/expectedOutcome |
| test-data/token-auth-provider-scenarios.csv | Token rỗng, refresh undefined, constructor không auth, wiring GAP-4, concurrent dedup |
| test-data/pipeline-error-scenarios.csv | IngestAuthError vs non-auth 500 → authDead + hành vi pipeline; 2 kịch bản SIT |
| test-data/TEST-REPORT-SA4E-362.csv | Execution tracker (22 TCs, Status=NOT_RUN pre-filled) |
| evidence/ | Thư mục chứa screenshot/log evidence của SIT |

Fetch mocking theo conventions: vi.stubGlobal('fetch', fetchMock) + mockResolvedValueOnce chains; jsonResponse(body, status); private access qua (client as any); makeSecrets/okJson cho AuthManager. **Bắt buộc vi.useFakeTimers() + vi.advanceTimersByTimeAsync(3000) cho mọi test chạm pollUntilComplete (POLL_INTERVAL_MS = 3000) — nếu không test sẽ sleep 3s/loop.**

---

## 5. Test Schedule

| Phase | Hoạt động | Deliverable |
|-------|-----------|-------------|
| Phase 4 (hiện tại) | STP + STC v1.0 + CSV test data | documents/SA4E-362/STP.md, STC.md, test-data/*.csv |
| Phase 5 (DEV) | Implement theo fix plan §4; DEV chạy REG-13 (compile + test:unit) | Code + UT-01..14/PBT-01/REG-13 xanh |
| Phase 6 (QA) | QA review test implementation vs STC (mock discipline); chạy E2E-API + SIT-01/02 manual; TEST-REPORT | TEST-REPORT v1.0 + evidence |
| Phase 6 exit | BA/SM gate, Jira attach | STP/STC/TEST-REPORT DOCX trên Jira |

---

## 6. Resources & Responsibilities

| Role | Trách nhiệm |
|------|-------------|
| QA Agent | STP/STC, CSV test data, review test implementation (mock discipline), execute SIT, TEST-REPORT |
| DEV Agent | Implement fix plan §4; viết UT theo STC (≤20 dòng/test, ≤200 dòng/file); giữ 3 test cũ BackendHttpPoster xanh |
| BA Agent | Business coverage review của STC/RTM (Review Gate) |
| SM Agent | Điều phối, gate, Jira attach |

Tools: Vitest, fast-check, VS Code extension dev host, local KB backend, curl (E2E-API), log viewer (SIT).

---

## 7. Risks & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|-----------|
| R-1 | Test quên fake timers → suite chậm 3s/poll loop | Medium | High | Bắt buộc vi.useFakeTimers trong mọi test pollUntilComplete (UT-05); verify suite runtime |
| R-2 | Đổi contract auth làm vỡ call site hiện có | High | Medium | REG-13 toàn suite; 3 test cũ BackendHttpPoster giữ nguyên (union signature) |
| R-3 | Sửa ACCESS_TTL_SEC quên revert sau SIT | High | Medium | Checklist SIT-01 có bước revert + git diff xác nhận sạch trước khi commit |
| R-4 | Test dùng mock thay real dependency theo STC (mock discipline) | High | Medium | QA review code test ở Phase 6: UT qua stubGlobal fetch là hợp lệ (unit); khối integration phải dùng real |
| R-5 | Jira MCP 404 cho issue SA4E (BRD ghi nhận) → không attach được | Low | High | Fallback: SM attach thủ công; log vào RUN-LOG |
| R-6 | FSD viết song song chưa kịp map FRs | Low | High | RTM trace BRD-level US/AC; sync pass sau sẽ bổ sung cột FSD FR |

---

## 8. Defect Management

- **Severity:** Critical (refresh loop vô hạn / vẫn mass-skip) > Major (retry sai số lần, stream không replay được, pipeline không dừng khi authDead) > Minor (log thiếu/thừa, message không đúng chữ) > Trivial (typo).
- **Priority:** P1 chặn merge (SM-1..SM-7 vi phạm), P2 nên sửa trước release.
- **Lifecycle:** New → Open → In Progress → Fixed → Verified → Closed (Jira SA4E-362 + sub-bug nếu cần; Jira MCP 404 → ghi RUN-LOG).
- **SLA:** Critical 24h, Major 48h, Minor trước Phase 6 exit.
- Bug test-side (test sai, không phải code sai) → QA sửa trực tiếp, không mở defect.

---

## 9. Test Metrics

| Metric | Target | Nguồn |
|--------|--------|-------|
| TC pass rate | 100% (22/22 pass trước exit Phase 6) | TEST-REPORT CSV |
| RTM coverage | 100% US-1..US-4 + 17 ACs | STC RTM |
| Automation share | ≥ 70% (hiện 16/22 = 73%) | STP §2.3 |
| Regression suite | 0 fail (compile + test:unit) | REG-13 |
| Defect density | 0 Critical/Major open tại exit | TEST-REPORT CSV |
| SM-1..SM-5 (SIT) | Đạt hết | SIT evidence |

---

*STP v1.0 — QA Agent, 2026-10-16. Lean bug-fix scope: RTM trace BRD US-1..US-4; FSD v0.9 (song song) sẽ được map trong sync pass sau qua cột FR của RTM.*