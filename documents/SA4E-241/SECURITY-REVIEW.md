# 🔒 Security Design Review — SA4E-241

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-241 |
| Feature | Incremental indexing bằng checksum (Pega rule + code non-Pega + document) |
| Kiến trúc | Plugin/Extension (VS Code/Kiro) + Monolith backend (Hono/TypeScript) |
| Phase | 3.7 — Security Design Review |
| Nguồn review | TDD.md v1.0 (§1–§12), FSD.md §7/§12, source code hiện có (`pega-api.ts`, `HttpServer.ts`, `file-meta.ts`) |
| Assessor | Security Agent |
| Ngày | 2026-04-30 |
| Version | 1.0 |

---

## 1. Executive Summary (Tiếng Việt)

Thiết kế SA4E-241 về mặt **dữ liệu checksum** là an toàn theo nguyên lý: checksum là digest (sha256/sha1), **không chứa nội dung rule**, và bulk-check chỉ truyền `projectId + checksums` → giảm phơi bày dữ liệu (đúng như TDD §8 khẳng định). Việc tính checksum trong extension dùng `crypto.createHash` **in-process** (không shell-out) nên **không có command injection** ở lõi checksum mới.

Tuy nhiên, review phát hiện **1 Critical + 2 High** liên quan đến **authorization / tenant isolation** ở tầng backend. Điểm mấu chốt: backend **đã có** hạ tầng auth (`jwtAuth` bind identity vào `X-Project-Id`/JWT `pid`, áp cho `/api/index/*`, `/api/tags/*`, `/mcp/*`) — nhưng **toàn bộ nhóm route `/pega/*` KHÔNG được bảo vệ**, và endpoint mới `POST /pega/rulecatalog/bulk-check` kế thừa đúng lỗ hổng đó. TDD §8 tuyên bố "Tenant isolation: mọi truy vấn scope theo project_id", nhưng `projectId` lại **do client tự khai trong body** và **không được ràng buộc với danh tính đã xác thực** → cross-tenant enumeration/poisoning.

**Kết luận chặn Phase 4:** ⛔ **CÓ Critical** → phải cập nhật TDD (SA) để address SEC-01 trước khi sang Phase 4. SEC-02/SEC-03 (High) phải fix hoặc user chấp nhận rủi ro có văn bản.

### Tổng hợp mức độ

| Severity | Count |
|----------|-------|
| 🔴 Critical | 1 |
| 🟠 High | 2 |
| 🟡 Medium | 4 |
| 🔵 Low | 3 |
| ℹ️ Informational | 2 |

---

## 2. Findings Table

| ID | Severity | Category | Mô tả | Remediation |
|----|----------|----------|-------|-------------|
| **SEC-01** | 🔴 Critical | Broken Access Control / Tenant Isolation (A01) | `POST /pega/rulecatalog/bulk-check` (và cả nhóm `/pega/*`) **không có auth middleware**. `HttpServer.ts` chỉ áp `jwtAuth` cho `/api/index/*`, `apiKeyAuth` cho `/api/tags/*`+`/mcp/*` — **KHÔNG áp cho `/pega/*`**. `projectId` lấy trực tiếp từ body (`body.projectId \|\| 'PegaCollProj'`) và **không đối chiếu với `pid` trong JWT**. Attacker gửi `projectId` bất kỳ → enumerate checksum tồn tại của tenant khác (oracle) và poison state (ingest checksum giả → skip sai → false-negative, vi phạm BR-15). TDD §8 "Tenant isolation theo project_id" **không được enforce** ở tầng authz. | (1) Áp `jwtAuth` cho nhóm `/pega/*` trong `HttpServer.ts`. (2) **KHÔNG** tin `body.projectId`: derive/verify projectId từ danh tính đã xác thực — dùng `c.get('projectId')` do `jwtAuth` set (X-Project-Id/pid) làm nguồn sự thật; nếu body.projectId ≠ identity projectId → 403. (3) Bỏ default `'PegaCollProj'` (fail-closed). Cập nhật TDD §8 để mô tả cơ chế authz thực tế, không chỉ "scope theo project_id". |
| **SEC-02** | 🟠 High | Broken Access Control (A01) — ghi/xoá dữ liệu chéo tenant | Cùng gốc SEC-01 nhưng ở luồng **ghi**: `ingest`/`saveChecksum` và endpoint `pega/clear-project` (`DELETE ... WHERE project_id = $1 OR project_id = 'PegaCollProj'`) dùng `projectId` client-controlled → attacker có thể **xoá/ghi đè state** của project khác (đặc biệt hard-coded `'PegaCollProj'` bị xoá kèm mọi request). Kết hợp với migration full-re-index (§5.5) → có thể ép re-index toàn bộ (DoS chi phí). | Sau khi SEC-01 fix (identity-bound projectId), **loại bỏ mệnh đề `OR project_id = 'PegaCollProj'`** trong mọi DELETE/UPDATE. Mọi mutation phải scope đúng projectId đã xác thực. Ghi checksum idempotent + kiểm tra ownership trước ghi. |
| **SEC-03** | 🟠 High | Cryptographic Failures / Secrets (A02, A07) — hardcoded credential | Trong codebase hiện có (`pega-api.ts` fetch-rule route) tồn tại **credential Pega hardcode**: `username: body.username \|\| 'SSA@TGB'`, `password: body.password \|\| 'pega123!'`; FSD §12 cũng ghi `SSA@TGB:pega123!`. TDD §8 nói "không hardcode" nhưng thiết kế mới **tái sử dụng luồng fetch cũ** (§6.3) → thừa hưởng credential mặc định. Rủi ro lộ credential + tài khoản Pega dùng chung. | (1) Xoá mọi default credential trong code; fail-closed khi thiếu auth (giống `MISSING_AUTH` đã có ở discover route). (2) Extension: credential đọc từ **VS Code SecretStorage** (đúng như scope); backend chỉ nhận `authHeader` per-request hoặc từ secret manager/env, **không** literal. (3) Rotate `pega123!` (đã lộ trong repo/docs). Bổ sung mục này vào TDD §8. |
| **SEC-04** | 🟡 Medium | Injection / Input Validation (A03) — zod chưa đủ chặt | TDD §6.1/§8 yêu cầu validate hex + batch ≤5000 nhưng **chưa đặc tả zod schema server-side rõ ràng** (chỉ mô tả bằng lời). Nếu backend không strict-validate: `checksums[]` có thể chứa item không phải hex (dù dùng `= ANY($2)` parameterized nên **không SQL injection**), array quá lớn → memory pressure, hoặc `projectId` ký tự lạ đi vào log/registry. | Đặc tả **zod schema top-level** (code-standards): `projectId: z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)`, `checksums: z.array(z.string().regex(/^[0-9a-f]{40}$\|^[0-9a-f]{64}$/)).min(1).max(5000)`. Dùng `safeParse` → 400 khi fail. Áp cho **cả** bulk-check và ingest. |
| **SEC-05** | 🟡 Medium | DoS / Resource Exhaustion (A05) — resumable download | Luồng resumable download (F1, §6.3) base64-decode chunk + verify `x-file-size`. TDD nêu verify size + magic `PK\x03\x04` nhưng **chưa đặc tả MAX_CHUNKS / max total size / decompression ratio guard**. `x-file-size` do server Pega khai → nếu bị điều khiển (MITM/compromise) có thể ép tải/giải nén file khổng lồ (zip bomb, billion-laughs qua nested) → OOM client. | Đặt hằng số **`MAX_TOTAL_SIZE`** (VD 200MB) và **`MAX_CHUNKS`** rõ ràng; abort khi `x-file-size` > ngưỡng hoặc tổng bytes nhận > `x-file-size`. Khi giải nén catalog ZIP: giới hạn **uncompressed size + entry count** (chống zip bomb), không chỉ magic bytes. Đặc tả vào TDD §8. |
| **SEC-06** | 🟡 Medium | Path Traversal / Zip-Slip (A01) — chưa đặc tả đủ | TDD §8 nói "extract dùng basename (Zip-Slip guard)". Nhưng: (a) chỉ basename có thể **mất cấu trúc thư mục** hoặc vẫn rủi ro nếu basename chứa `..`/absolute trên một số OS; (b) fallback checksum đọc `fileContent` theo `relativePath` — cần đảm bảo path đã canonicalize và **nằm trong workspaceRoot** trước khi đọc. | Sau khi resolve, kiểm tra `path.resolve(dest, entryName)` **bắt đầu bằng** `path.resolve(dest) + sep` (containment check chuẩn) thay vì chỉ basename; reject entry có `..`, absolute path, symlink. File-scan (Nguồn C/D): canonicalize + assert trong `workspaceRoot`. |
| **SEC-07** | 🟡 Medium | Injection — OS Command (A03) — luồng git kế cận | Lõi checksum mới (`GitBlobChecksumStrategy`) dùng `crypto` in-process → **an toàn**. Nhưng feature phụ thuộc trạng thái git ("hasGit") và codebase có `file-meta.ts` chạy `execSync(\`git ${args.join(' ')}\`, { cwd })` — **string interpolation** với `cwd = workspaceRoot`. Nếu sau này path/args lấy từ input chưa kiểm soát → command injection. `mcp-config-builder.ts` build PowerShell script từ path (có escape `''`) cũng cần rà. | Thiết kế SA4E-241 **KHÔNG** dùng `git hash-object` shell-out (tốt — giữ nguyên). Khuyến nghị: mọi lời gọi git dùng **`execFile('git', [args])`** (array args, không shell) thay `execSync` string. Không đưa dữ liệu Pega/CSV vào tham số shell. Ghi rõ trong TDD §8: "checksum git-blob tính in-process bằng crypto, KHÔNG shell-out". |
| **SEC-08** | 🔵 Low | Rate Limiting (A05) | `rateLimiter` chỉ áp `/api/admin/*` + `/api/admin/auth/login`. `/pega/rulecatalog/bulk-check` **không rate limit** → cho phép enumeration nhanh (kết hợp SEC-01 tăng tác động oracle) và brute-force checksum space (dù không gian sha256 lớn, vẫn nên chặn abuse). | Áp `rateLimiter` cho `/pega/*` (per-identity sau khi có auth). Giới hạn số bulk-check request/phút/tenant. |
| **SEC-09** | 🔵 Low | Logging — lộ thông tin nhạy cảm (A09) | `pega-api.ts` có `logger.debug({ err }, ...)`, `logger.error({ err }, ...)`. Cần đảm bảo **không log `authHeader`/Basic credential**, và checksum tuy không phải nội dung nhưng là định danh state — log số lượng thay vì list đầy đủ. `project_registry` insert dùng `body.projectId` chưa validate (SEC-04). | Redact `Authorization`/`authHeader` trong mọi log. Log `checksums.length` thay vì mảng. Không log rule JSON content ở mức debug production. |
| **SEC-10** | 🔵 Low | Insecure Design — bulk-check là oracle | Ngay cả khi có auth đúng (SEC-01 fixed), endpoint trả `existing` là một **existence oracle** trong phạm vi tenant. Với tenant hợp lệ đây là chấp nhận được (chính là chức năng), nhưng cần giới hạn để không rò rỉ cross-project. | Đảm bảo `existing` chỉ chứa checksum thuộc **đúng projectId đã xác thực** (điều kiện `project_id = <identity>`), không bao giờ trả checksum của project khác kể cả khi trùng giá trị. |
| **SEC-11** | ℹ️ Info | Data Protection — nội dung rule/PII | Checksum không chứa nội dung (tốt). Nhưng luồng `ingest` **có** gửi `ruleJson` đầy đủ (có thể chứa business logic/PII) lên backend và lưu `symbols`/`files`. Ngoài scope so-checksum nhưng cần lưu ý ở luồng ingest tái dùng. | Đảm bảo transport TLS (HTTPS) cho ingest; at-rest: cân nhắc quyền truy cập DB `symbols`/`files`. Ghi nhận trong data classification, không chặn phase. |
| **SEC-12** | ℹ️ Info | Migration fail-safe (A04) | Full re-index 1 lần (§5.5) đúng về correctness (no-workaround) nhưng tạo **spike tải** một lần/project sau deploy. Kết hợp SEC-02 (nếu chưa fix) có thể bị lạm dụng để ép re-index. | Sau khi SEC-01/02 fixed, spike chỉ trong phạm vi tenant hợp lệ → chấp nhận được. Nên có thông báo/throttle cho lần full re-index. |

---

## 3. Đánh giá theo câu hỏi của SM

| Câu hỏi | Kết luận |
|--------|----------|
| **1. Auth/Authz — bulk-check có cần auth? projectId giả mạo/cross-tenant?** | ⛔ **CÓ vấn đề (SEC-01 Critical).** Cần auth; hiện `/pega/*` không có middleware; `projectId` từ body không bind identity → cross-tenant. |
| **2. Data protection — checksum vs credential/rule content** | Checksum: ✅ an toàn (digest, không nội dung). Credential: ⚠️ SEC-03 (hardcode default). Rule content: ℹ️ SEC-11 (ở luồng ingest, cần TLS + access control). |
| **3. API security — validation/rate limit/payload size/injection qua projectId·checksum** | zod chưa đặc tả đủ (SEC-04 Medium); rate limit thiếu (SEC-08 Low); payload ≤5000 hợp lý nhưng cần enforce bằng schema. |
| **4. SQL injection qua checksum/projectId (ChecksumStore)** | ✅ **An toàn** — thiết kế dùng parameterized `= ANY($2)` và `$1` (đã thấy pattern parameterized trong `pega-api.ts`). Không nối chuỗi SQL. Vẫn cần zod validate định dạng (SEC-04). |
| **5. Path/Zip-Slip/fallback đọc file** | ⚠️ SEC-06 Medium — "chỉ basename" chưa đủ; cần containment check chuẩn + canonicalize file-scan trong workspaceRoot. |
| **6. Resumable download — resource exhaustion / MAX_CHUNKS** | ⚠️ SEC-05 Medium — chưa đặc tả MAX_CHUNKS/MAX_TOTAL_SIZE + zip-bomb ratio guard; `x-file-size` do server khai. |
| **7. Secrets — không hardcode, không log Basic auth** | ⚠️ SEC-03 (hardcode) + SEC-09 (redact log). |
| **8. Supply chain — git hash-object command injection** | ✅ Lõi checksum **in-process crypto**, không shell-out → an toàn. Nhưng codebase kế cận (`file-meta.ts`) dùng `execSync` string interpolation → SEC-07 khuyến nghị chuyển `execFile` array-args. |

---

## 4. Remediation Priority

| Ưu tiên | Finding | Bắt buộc trước | Effort |
|--------|---------|----------------|--------|
| 1 | SEC-01 (Critical) — auth + identity-bound projectId cho `/pega/*` | **Phase 4** (chặn) | Medium |
| 2 | SEC-02 (High) — mutation scope + bỏ `OR 'PegaCollProj'` | Phase 5 (DEV) hoặc cùng SEC-01 | Low |
| 3 | SEC-03 (High) — xoá default credential + rotate + SecretStorage | Phase 5, rotate ngay | Low |
| 4 | SEC-04, SEC-05, SEC-06, SEC-07 (Medium) — zod, MAX_CHUNKS, containment check, execFile | Phase 5 (DEV) | Medium |
| 5 | SEC-08..SEC-12 (Low/Info) | Phase 5–6, defense-in-depth | Low |

---

## 5. Kết luận (Gate Phase 3.7)

⛔ **CÓ Critical (SEC-01) → CHẶN sang Phase 4.**

**Hành động bắt buộc:**
1. **SA cập nhật TDD §8 (Security Design)** để đặc tả cơ chế authz thực tế: `/pega/*` áp `jwtAuth`, `projectId` **derive từ identity đã xác thực** (không tin body), fail-closed (bỏ default `'PegaCollProj'`) — address SEC-01. Bổ sung zod schema (SEC-04), MAX_CHUNKS/zip-bomb guard (SEC-05), containment check (SEC-06), khẳng định "checksum in-process, no shell-out" (SEC-07), redact log (SEC-09).
2. **SEC-02/SEC-03 (High):** DEV phải fix; nếu không fix trong scope → **user chấp nhận rủi ro bằng văn bản** trước Phase 4.
3. Sau khi TDD cập nhật → re-review nhanh mục Security Design (tối đa 2 vòng).

> Lưu ý (No-Workaround): SEC-01 là **design flaw về authorization phân tán** — `projectId` được tin từ body ở nhiều route. Fix đúng = **single source of truth cho projectId = identity đã xác thực** (giống pattern `jwtAuth` bind `X-Project-Id`), KHÔNG map/patch tạm ở từng route.

---

## 6. Re-review v1.1 (Phase 3.7 — sau khi TDD cập nhật)

| Field | Value |
|-------|-------|
| Nguồn re-review | TDD.md **v1.1** — §8 (viết lại), §8.2, §5.5, §6.1 |
| Ngày | 2026-04-30 |
| Loại | Re-review nhanh (design-level) |

### 6.1 Xác nhận từng finding (mức THIẾT KẾ)

| ID | Sev | Yêu cầu design | TDD v1.1 address | Kết luận |
|----|-----|----------------|------------------|----------|
| **SEC-01** | 🔴 Critical | `jwtAuth` cho `/pega/*`, projectId từ identity, fail-closed, bỏ default `PegaCollProj`, body.projectId chỉ đối chiếu → 403 mismatch | §8.2.2: (1) `app.use('/pega/*', jwtAuth)`; (2) route derive `identityProjectId = c.get('projectContext').projectId`, **không** tin body; thiếu identity → **401** `MISSING_PROJECT_IDENTITY` (fail-closed); (3) body.projectId ≠ identity → **403** `PROJECT_MISMATCH`; (4) truy vấn scope theo `identityProjectId`; bỏ default `'PegaCollProj'`. Bất biến SEC-INV-1/2/3 (§8.2.3). §6.1 khớp (headers + error codes 401/403/400). | ✅ **ĐỦ — Addressed ở design** |
| **SEC-02** | 🟠 High | Bỏ `OR project_id='PegaCollProj'`, mutation scope identity | §8.3: bỏ hoàn toàn mệnh đề `OR 'PegaCollProj'` trong mọi DELETE/UPDATE (có ví dụ SQL đúng/sai); mutation scope theo `identityProjectId`; upsert idempotent + ownership check. §5.5 M2 cập nhật: ghi/xoá scope theo `identityProjectId`, không `OR 'PegaCollProj'`. | ✅ **Addressed** (DEV impl Phase 5) |
| **SEC-03** | 🟠 High | Bỏ hardcode credential, SecretStorage, authHeader per-request, rotate | §8.4: xoá default `SSA@TGB/pega123!`, fail-closed `MISSING_AUTH`; extension đọc SecretStorage; backend nhận `authHeader` per-request; rotate password đã lộ (note DevOps); redact log. §6.3 tham chiếu. | ✅ **Addressed** (DEV impl Phase 5 + rotate là action vận hành) |
| **SEC-04** | 🟡 Medium | zod schema server-side chặt | §8.5: schema top-level `BulkCheckRequestSchema`/`IngestRequestSchema`, `projectId` regex+max128, `checksums` hex min1/max5000, `safeParse` → 400. | ✅ Addressed |
| **SEC-05** | 🟡 Medium | MAX_CHUNKS/MAX_TOTAL_SIZE + zip-bomb guard | §8.6: hằng số `MAX_TOTAL_SIZE`/`MAX_CHUNKS`/`MAX_UNCOMPRESSED_SIZE`/`MAX_ZIP_ENTRIES`; đo thực tế khi stream, không tin header ZIP. | ✅ Addressed |
| **SEC-06** | 🟡 Medium | Containment check chuẩn + canonicalize file-scan | §8.7: `isContained()` (`resolve` + `startsWith(dest+sep)`), reject `..`/absolute/symlink; file-scan assert trong `workspaceRoot`. | ✅ Addressed |
| **SEC-07** | 🟡 Medium | Checksum in-process, execFile array-args | §8.8: git-blob = `crypto` in-process, cấm `git hash-object` shell-out; git calls dùng `execFile('git',[args])`. | ✅ Addressed |
| SEC-08..SEC-10 | 🔵 Low | rate limit, redact log, existing đúng identity | §8.2.2 (`rateLimiter` cho `/pega/*`), §8.4#5, SEC-INV-3. | ✅ Addressed |

### 6.2 Kết luận Critical (SEC-01)

✅ **SEC-01 ĐÃ được address ở mức THIẾT KẾ.** Thiết kế v1.1 fix đúng gốc (No-Workaround): **single source of truth cho projectId = identity đã xác thực**, fail-closed 401 khi thiếu identity, 403 khi body mismatch, bỏ default `PegaCollProj`, scope truy vấn theo `identityProjectId`. Các bất biến SEC-INV-1/2/3 phát biểu rõ ràng và §6.1 (API) nhất quán với §8.2.

### 6.3 Gate decision

🟢 **GỠ BLOCK — cho phép sang Phase 4 (Test Planning).**

⚠️ **Điều kiện bắt buộc (carry-over sang Phase 5 + 5.7):**
1. SEC-01/02/03 mới ở mức **design** — DEV PHẢI **implement đúng** ở Phase 5 (đặc biệt: `app.use('/pega/*', jwtAuth)`; route không đọc `body.projectId` làm scope; bỏ mọi `OR 'PegaCollProj'`; xoá default credential).
2. **Phase 5.7 (Security Code Review)** PHẢI verify lại trên source thật: grep xác nhận không còn `|| 'PegaCollProj'`, không còn default `'SSA@TGB'`/`'pega123!'`, `/pega/*` có middleware auth, mọi mutation scope theo identity.
3. **Rotate `pega123!`** — action vận hành (DevOps), thực hiện trước production.

**Verdict re-review v1.1:** ✅ Critical resolved at design level → **PASS (design gate)**. Implementation verification deferred to Phase 5.7.
