# 🔒 Security Review — SA4E-300 (Phase 3.7, Design)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (Code Intelligence MCP Server + VS Code Extension) |
| Ticket | SA4E-300 — [Extension/Backend] Cải thiện error detail trong luồng ingest source code vào KB |
| Phase | 3.7 — Security Review of **design** (TDD v1.0, 2026-09-17) |
| Date | Backfilled hồi tố ngày 2026-09-19 (design gốc 2026-09-17; review bù sau khi các findings 6.7 đã rõ) |
| Assessor | Security Agent (static design review — report only, NO code changes) |
| Inputs | `documents/SA4E-300/TDD.md v1.0`, `BRD.md`, `FSD.md`, `diagrams/architecture.drawio`, `diagrams/api-sequence-error-surfacing.drawio` |
| Outputs | `documents/SA4E-300/SECURITY-REVIEW.md` (this file) |
| Relation to 6.7 | `SECURITY-DEPLOY-REVIEW.md` (2026-09-22, 13 findings, GO WITH CONDITIONS staging) covers **code as built**. This 3.7 doc covers **design as specified** — it does NOT duplicate 6.7's line-level findings; it traces each late-discovered flaw back to its design root cause. |

## Executive Summary

TDD SA4E-300 thiết kế đúng hướng về error propagation (Backend → HTTP → Extension → Output channel, `indexError` tập trung, `rejectedReasons`/`failedFiles`, không expose stack trace — TDD §1.5/§7.3), nhưng **thiếu threat model cho luồng ingest**. Kẻ tấn công kiểm soát được `files[].path`, `files[].content`, `X-Project-Id`, `body.projectId`, và token hết hạn — TDD không phân tích các vector này. Kết quả: 4 nhóm design flaw chỉ phát hiện trễ ở implementation/testing/deploy-review (BOLA `projectId`, `sync-pega-rules` thiếu RBAC, base path cứng Windows, SQL dùng cột `label` sai schema `relation`), cộng 3 thiếu sót thiết kế phòng thủ (fail-open project default, error echo filesystem path, không có size/count caps).

**Verdict phase 3.7 (hồi tố): CONDITIONAL PASS** — thiết kế error-surfacing đạt yêu cầu chức năng; 4 design flaw phải được ghi nhận làm input cho implementation (đã được fix ở code sau này — xem SECURITY-ASSESSMENT.md 5.7); bài học là đưa security vào design sớm (checklist §6).

**Risk rating (design-only): Medium** — không có RCE-by-design, nhưng BOLA-by-design là High nếu implement đúng như TDD mà không bổ sung gate.

## 1. Scope: What Was Reviewed (Design Only)

- TDD §2 (architecture: Extension → Backend → KB; Temp staging → ingest), §3 (3 endpoints + auth `Bearer + X-Project-Id`), §5 (interfaces `IndexErrorResponse`/`RejectedReason`), §6 (sequence ingest), §7 (security design: §7.1 JWT `requireAuth`, §7.2 project isolation via `X-Project-Id + requireProjectId`, §7.3 `details` chỉ chứa `err.message`/`err.code`), §8–§10 (perf/monitoring/deploy).
- Diagrams: `architecture`, `component`, `deployment`, `api-sequence-error-surfacing`.
- Out of scope for 3.7: code implementation, test execution, deploy config (thuộc 5.7/6.3/6.7).

## 2. Threat Model — Ingest Flow (Missing From TDD)

### 2.1 Assets

| Asset | Location | Sensitivity |
|-------|----------|-------------|
| Source code / docs content (`files[].content`) | Temp + KB `knowledge_entries` | Medium — IP của workspace |
| Filesystem Temp dir (`Temp/{userId}/{projectId}/...`) | Backend host disk | Medium — write primitive nếu traversal |
| KB graph (`knowledge_graph_edges`, `relation`) | SQLite/pg | Medium — poisoning ảnh hưởng mọi consumer |
| Bearer/session token | Extension memory → `Authorization` header | High — credential |
| Error details channel | Backend → Output panel developer | Low-Medium — info disclosure vector |

### 2.2 Attackers & Capabilities

| Attacker | Controls | Cannot do |
|----------|----------|-----------|
| A1 — Authenticated low-privilege user | `files[].path`, `files[].content` (arbitrary strings ≤ bodyLimit), `X-Project-Id` header, `body.projectId` (sync-pega), trigger sync/full/ingest repeatedly | Không bypass `validateSession` (cần token hợp lệ) |
| A2 — Holder of expired/stolen token | Replay request với token hết hạn; nếu có JWT với grant hẹp, thử project ngoài grant | Không tạo session mới nếu secret đúng |
| A3 — Malicious workspace content | File path chứa `../`, absolute, backslash, `%2e%2e`, `C:`, null byte, newline/ANSI (log forging qua Output channel) | Không chạy code trên backend (không có eval/exec trong scope) |
| A4 — Admin-function abuser (A1 + authenticated) | Gọi `sync-pega-rules` / `populate-edges` cho project bất kỳ, lặp lại gây DoS | Không leo lên `RBAC_MANAGE` nếu gate tồn tại |

### 2.3 Data Flow & Trust Boundaries

```
[Dev machine / Extension] ---(B1: HTTP + Bearer + X-Project-Id + files[])---> [Backend api-index.ts]
  Untrusted: path, content, projectId              | writeFilesPhase → Temp/{userId}/{projectId}/batch-docs/
                                                  | handleIngestDocsFromTemp walk → dispatcher → KB
                                                  +---(B2: SQL/pagination/insert)---> [SQLite/pg + KB graph]
                                                  +---(B3: {error,details,action})---> [Extension Output channel]
```

| Boundary | Trust decision TDD đã nêu | Còn thiếu |
|----------|---------------------------|-----------|
| B1 client→backend | §7.1 JWT + §7.2 `requireProjectId` | Không verify `userId ↔ projectId` membership; không cap size/count; không sanitize path ở design |
| Temp dir | Không nêu | `userId` session-bound nhưng `projectId` attacker-controlled → cross-tenant write by design |
| B2 backend→DB | Không nêu | SQL placeholder dialect (pg `?` vs `$n`), unbounded scan — không có trong design |
| B3 backend→Output | §7.3 "không stack trace" | Raw `err.message` chứa absolute path vẫn echo — §7.3 chưa đủ |

## 3. Design Findings (Root Causes of Late-Discovered Flaws)

### D-1 (High): TDD §7.2 "project isolation via X-Project-Id header" is not isolation — BOLA by design

- **Thiết kế:** `resolveRequestScope` tin header nguyên văn; `requireProjectId` chỉ check non-empty. Không có membership check `session.userId ↔ projectId`. `handleSyncPegaRules` lấy `body.projectId` từ JSON, không binding identity.
- **Hậu quả trễ:** 6.7 Finding #1 (High, CWE-639, CVSS 7.1) + #3 (Medium, silent fallback về `config.projectId` khiến `PROJECT_REQUIRED` thành dead code).
- **Thiết kế đúng phải có:** mandatory `X-Project-Id` (fail-closed, không fallback), membership/grant check (JWT `pid/pids` binding + session permission gate), 403 khi ngoài grant.
- **Trạng thái:** đã fix ở code sau 6.7 (`requireIndexPermission` KB_WRITE + `verifyIndexProjectBinding` JWT-grant, fail-closed; session-token opaque vẫn còn residual — xem 5.7).

### D-2 (High): `sync-pega-rules` không có RBAC trong thiết kế

- **Thiết kế:** TDD §3.1 liệt kê endpoint nhưng §7 không gán permission nào; trong khi `populate-edges` (ngoài TDD scope) yêu cầu `GRAPH_MAINTAIN`.
- **Hậu quả trễ:** 6.7 Finding #2 (High, CWE-862, CVSS 7.0) — mọi authenticated user trigger background sync tốn kém cho project bất kỳ.
- **Thiết kế đúng phải có:** `GRAPH_MAINTAIN` (cùng gate `populate-edges`) + concurrency guard.
- **Trạng thái:** đã fix ở code (`requireIndexPermission(..., 'GRAPH_MAINTAIN')` tại `api-index.ts:457-458`).

### D-3 (Medium): Thiết kế Temp path không quy định sanitize/containment

- **Thiết kế:** TDD §2 chỉ nói "ghi Temp", không quy định: sanitize segment, reject absolute/`..`/backslash/encoded/drive-letter/null-byte, verify `path.relative` containment, base path cross-platform.
- **Hậu quả trễ:** DEV phải backfill GAP 1 (`sanitizePathSegment`/`resolveIndexTempBase`/`resolveSafeTargetPath`, xóa 4 base cứng Windows) ở Round 3 (2026-09-19); 18 backend tests mới chứng minh traversal bị chặn (`../evil.ts`, absolute, backslash, encoded, `C:`).
- **Thiết kế đúng phải có:** đặc tả `resolveSafeTargetPath` + `Temp/{sanitizedUserId}/{sanitizedProjectId}/` + `os.tmpdir()/CODE_INTEL_INDEX_TEMP_DIR` ngay trong TDD §2/§5.

### D-4 (Low, nhưng gây build break): Thiết kế tích hợp graph-edge không đối chiếu schema/ký hiệu

- **Thiết kế:** TDD §4 "No schema changes" nhưng không nêu tên cột quan hệ graph; code gọi `EdgeOnIngestStrategy` không tồn tại + `ctx.db.admin` không tồn tại + SQL dùng cột `label` trong khi schema thực là `relation`.
- **Hậu quả trễ:** BUG-002 (backend full build fail, phải fix bằng `extractIngestEdges` + `getDbAdapter()` + cột `relation`, build xanh lần đầu 2026-09-19).
- **Bài học design:** mọi tích hợp cross-module phải ghi rõ interface tồn tại + tên cột schema thực, không giả định.

### D-5 (Medium, defense-in-depth): TDD §7.3 "details = err.message" cho phép filesystem-path disclosure; không có size/count caps

- **Thiết kế:** §7.3 cấm stack trace (tốt) nhưng cho phép raw `fs` message → absolute temp path + `userId`/`projectId` echo cho caller (6.7 Finding #4, CWE-209). Không giới hạn `files.length`, `content` bytes, `path` length (6.7 Finding #5, CWE-400) — chỉ có `bodyLimit 100MB` toàn cục. Backpressure 429 chỉ cho `/source` (6.7 Finding #6).
- **Thiết kế đúng phải có:** `safeFsMessage` (code + basename, strip absolute path), caps (`MAX_FILES`, `MAX_FILE_BYTES = maxFileSize 512KB`, `MAX_PATH_LEN`), backpressure cho mọi route mutating, paginate `populate-edges`.

## 4. Positive Design Decisions (What TDD Got Right) ✅

- Error Propagation Chain + `indexError` tập trung: single responsibility, không nuốt lỗi, backward compatible (`details`/`action` optional, giữ `parseIngestResponse`/`UNCONVERTIBLE`).
- Không expose stack trace trong `details` (TDD §1.5/§7.3) — global error handler generic `INTERNAL_ERROR` ở code tuân thủ đúng.
- Per-file `rejectedReasons`/`failedFiles`: cho phép partial success, không abort batch — đúng cho UX ingest.
- Console → Output channel singleton: tách observability khỏi stdout, tiền đề cho log sanitization sau này.
- Không đổi retry/polling contract: giảm blast radius của change.

## 5. Traceability: Design Flaw → Late Finding → Fix

| Design flaw (3.7) | Late finding | Fix (xem 5.7) |
|---|---|---|
| D-1 BOLA projectId | 6.7 #1 High + #3 Medium | `requireIndexPermission` KB_WRITE + `verifyIndexProjectBinding` JWT-grant; residual session-token cần PO risk-accept |
| D-2 sync-pega no RBAC | 6.7 #2 High | `GRAPH_MAINTAIN` gate `api-index.ts:457-458` + test 403/202 |
| D-3 Temp path unspecified | GAP 1 Round 3 | `sanitize/resolveSafeTargetPath`/relative-verify + 18 tests |
| D-4 graph integration unspecified | BUG-002 build fail | `extractIngestEdges` + `relation` + `getDbAdapter()`, build xanh |
| D-5 verbose errors + no caps | 6.7 #4/#5/#6 | Còn OPEN (sanitize fs message, caps, backpressure mở rộng) — mang sang 5.7 residual |

## 6. Lessons Learned — Đưa Security Vào Design Sớm

1. Mọi endpoint nhận `projectId`/object-id từ client phải có mục "Authorization model" trong TDD (membership/grant + fail-closed khi thiếu), không chỉ "Authentication".
2. Mọi file-write từ input phải đặc tả path-safety (sanitize + normalize + containment check + base cross-platform) ngay ở §2/§5, kèm abuse cases (`../`, absolute, encoded, drive-letter).
3. Error contract phải định nghĩa allowlist nội dung `details` (code + basename), không phải "err.message" nguyên văn.
4. Resource limits (count/size/path-len/concurrency) là yêu cầu thiết kế, không phải "tối ưu sau".
5. Tích hợp cross-module phải trích dẫn interface + schema cột thực tế, có contract test.
6. Áp dụng checklist OWASP Top 10 + Hono-specific (middleware coverage, route-level auth matrix) như gate của design review 3.7.

## 7. Verdict & Limits

- **Verdict (hồi tố): CONDITIONAL PASS** — thiết kế chức năng đạt; 4 design flaw (D-1..D-4) phải kèm remediation trước/song song implementation (thực tế đã fix trễ ở Round 3 + post-6.7).
- **Không có finding mới ngoài 13 findings 6.7** — mọi flaw ở đây đều ánh xạ tới BUG-002/GAP 1/Findings #1–#6 đã biết; 3.7 chỉ bổ sung góc nhìn root-cause ở tầng thiết kế.
- **Limits:** static design review; không dynamic test; không review deploy config (thuộc 6.7); các code fix được đánh giá chi tiết ở SECURITY-ASSESSMENT.md (5.7).
