# 🔒 Security Assessment Report — SA4E-356 (Phase 5.7)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (SA4E extension + backend child server) |
| Ticket | SA4E-356 — [Bug] MCP tools: relative file_path resolves against process CWD instead of workspace root |
| Scope | Code audit commit `bb17b39` (20 files, +2587/−164) — đối chiếu TDD v1.2 (§8 + AD-15..AD-23) với implementation; tìm findings mới trong code |
| Date | 2026-10-12 |
| Assessor | Security Agent (Phase 5.7 SDLC pipeline) |
| Design baseline | TDD v1.2 (TA APPROVED) + SECURITY-REVIEW.md Phase 3.7 (verdict PASS WITH FIXES, SEC-01..08) |
| Method | Static code review (file-based — MCP degraded session, không dùng code-intel index, không ingest KB) |
| Verdict | **APPROVED WITH FINDINGS** |
| Overall Risk Rating | **Low** (đối với code của ticket) — 0 Critical, 0 High trong commit được audit |

---

## 1. Executive Summary

Implementation của DEV tại commit `bb17b39` **đối chiếu khớp với security design TDD v1.2** ở toàn bộ 8 findings của Phase 3.7 (SEC-01..08). Ba findings Medium của design review — SEC-01 (per-ref containment fail-closed cho inner image refs), SEC-02 (BR-06b: từ chối relative khi `cwd_fallback`), SEC-03 (symlink guard parent-dir realpath ở handler layer, giữ nguyên C-2 pure helper) — đều được implement đúng spec, đúng vị trí layer, kèm unit tests chứng minh hành vi attacker đỏ-trước/xanh-sau (T-SEC01, T5b, SQ-1). N-9 payload guards (10 MB / 25 MB) đặt đúng vị trí **trước** resolve/read; WrapperServer envelope PathResolverError + fix `return await` hoạt động đúng (TC-29 xác nhận lỗi path trả MCP tool error result, không rò JSON-RPC -32603).

Kiểm chứng độc lập do Security Agent thực hiện: **N-8 gate PASS trên toàn bộ 523 file production** (`bash scripts/check-pathresolver-n8.sh --all` → 0 violation); `PathResolver.ts` khớp reference implementation §5.2 từng bước (validate → root per-call → PATH_NO_WORKSPACE → resolve → containment chỉ khi workspace → success); containment có đủ trailing-separator boundary + case-fold **hai vế** win32 + equality (chặn prefix-collision `ws-evil`, không mở bypass qua fold); UNC và `\\?\` fail-closed; drive-relative (`C:foo`) bị xử lý an toàn ở cả hai nhánh. Không có hardcoded credential (Atlassian auth đọc từ SecretStorage per-request); CI workflow dùng `permissions: contents: read`, không có secret; npm audit HIGH duy nhất là **pre-existing transitive** (`@modelcontextprotocol/sdk` 1.27.1 nested qua `pi-web-access`) — commit này **không đổi `package.json`/lock** (pin vitest 4.1.8 nằm ở commit Phase 4.5 `9c75f90`).

Assessment tìm thấy **1 finding Medium mới — pre-existing ngoài phạm vi ticket**: WrapperServer loopback `:9181` trả `Access-Control-Allow-Origin: *` và không có authN → website bất kỳ trong browser của user có thể POST `tools/call` và **đọc response** (đọc dữ liệu Jira/Confluence qua chính tool proxy có sẵn session của user) và trigger side-effect. Vector này bị **giảm mạnh bởi chính containment mới** của ticket (FS tools bị chặn ngoài workspace), nhưng kênh readback Atlassian-data vẫn mở. Đây không phải regression của bb17b39 (CORS pre-existing, không nằm trong diff) → không block Phase 6, nhưng **bắt buộc tạo follow-up ticket**. Ngoài ra 1 finding Low (log-forging gap còn sót 1 biến `resolved` chưa sanitize ở backend `drawio-tool.ts`) và 5 ghi nhận Informational.

**Overall Risk Rating: Low.** Không có Critical/High → **không block Phase 6** (Testing). Điều kiện đi kèm verdict: (1) follow-up ticket cho SA-01 (CORS/Origin validation) và SA-07 (pi-web-access bump) được SM tạo trước khi close ticket; (2) SA-02 fix được gộp vào ticket này nếu còn chỉnh sửa backend lần nữa, hoặc đưa vào follow-up chung.

### Severity Counts

| Severity | Count | IDs |
|----------|-------|-----|
| 🔴 Critical | 0 | — |
| 🟠 High | 0 | — |
| 🟡 Medium | 1 | SA-01 (pre-existing, ngoài diff ticket) |
| 🔵 Low | 1 | SA-02 |
| ℹ️ Informational | 5 | SA-03..SA-07 |

**Có Critical/High block Phase 6 không? KHÔNG.** Phase 6 tiếp tục (REG-1/REG-2 manual gate như kế hoạch STP).

---

## 2. Findings Table

| ID | Severity | Category | File:line | Description | Remediation | Owner |
|----|----------|----------|-----------|-------------|-------------|-------|
| SA-01 | 🟡 Medium (pre-existing) | A01/A05 — Broken Access Control (CORS + no authN trên loopback) | `extension/src/services/WrapperServer.ts:126-128` (+ `handleRequest`/`handleMcp` — không có token check) | **Website bất kỳ đọc/điều khiển local MCP qua browser.** Server bind `127.0.0.1:9181` nhưng trả `Access-Control-Allow-Origin: *` + `Access-Control-Allow-Headers: Content-Type` → preflight pass, request cross-origin thành công; `/mcp` không có authN. Trang web độc hại visit bởi user có thể: (a) **đọc dữ liệu Atlassian** (jira_get_attachments, confluence_get_comments, find_tools…) vì các tool dùng session/credential extension-side — response trả thẳng về attacker page nhờ ACAO `*`; (b) trigger side-effect (ghi file trong workspace, upload workspace file lên Jira/Confluence của user). Post-fix containment của ticket giảm đáng kể vector FS (đọc/ghi ngoài workspace bị chặn), nhưng (a) và (b)-trong-workspace vẫn mở. Pre-existing — CORS không nằm trong diff bb17b39; Phase 3.7 đánh giá "attacker remote không chạm được loopback" chưa xét drive-by-qua-browser. | Follow-up ticket (không block ticket này): (1) validate `Origin`/`Host` header — chỉ chấp nhận request không có Origin (MCP client native) hoặc allowlist origin của IDE; (2) hoặc thêm shared-secret token do extension cấp cho MCP client (header check trước `handleMcp`); (3) tối thiểu: bỏ `*`, trả ACAO chỉ khi Origin ∈ allowlist, và chỉ khi `Host: 127.0.0.1:<port>` (chặn DNS rebinding). | SM (ticket mới) → DEV |
| SA-02 | 🔵 Low | A03/A09 — Log Forging (SEC-05 gap còn sót ở backend) | `backend/src/engine/tools/drawio-tool.ts:42-48` | Message (b) của §7.4 sanitize đúng `args.file_path` (dòng 42), nhưng `resolved` ở dòng 43 được tính từ **raw chưa sanitize** rồi echo nguyên vào message (dòng 45): path chứa `\r\n` → dòng log giả trong backend log. TDD §10.1 yêu cầu "backend §7.4 message (b) cũng sanitize" — DEV sanitize 1/2 biến. Extension side đầy đủ (`PathResolver.ts:158-159` sanitize cả trimmed lẫn resolvedPath). | 1 dòng: `const resolvedSafe = path.resolve(workspace, sanitized);` rồi dùng `resolvedSafe` trong message (hoặc bọc `${sanitize(resolved)}` theo pattern `sanitizeLogText`). Thêm assert vào UT-10 branch (b). | DEV (quick-fix) |
| SA-03 | ℹ️ Info (design-accepted — TA flag được đánh giá lại) | A04 — Insecure Design (fail-loud gap) | `extension/src/services/Base64ProxyService.ts:130-152` | **proxyOutput guard-failure trả raw result** (đúng như TA note). Xác minh risk thực tế: mọi throw bên trong try (resolvePath fail cho `output_path` ngoài workspace, symlink-guard block, write fail) đều bị catch → `console.warn` → trả result gốc chứa `output_base64`. **Write containment vẫn giữ vững** (không có fs write xảy ra khi throw). Dữ liệu trong raw result là output do **backend tự sinh** từ input đã qua containment — không phải dữ liệu FS tùy ý; agent vốn đã có nguồn. Hành vi khớp đúng TDD §8.4 ("parse/write fail → return raw result — tránh silent data loss, out of scope"). Residual: agent nhận success-shape dù write bị skip (confusion, không phải leak). | Hardening follow-up (không bắt buộc trong ticket): guard/resolve failure trong proxyOutput → trả `{ isError: true, content: [...] }` thay vì raw result; giữ raw-result chỉ cho JSON-parse fail của result không phải proxy output. | DEV (follow-up) |
| SA-04 | ℹ️ Info (residual design-accepted, AD-17) | A01 — Symlink escape (file-level) | `extension/src/backend-local-tools.ts:102-123` (`checkSymlinkGuard`) | Guard realpath **chỉ dirname** (đúng design — không break ghi file mới): symlink/junction **thư mục** trỏ ra ngoài bị chặn; nhưng **file-symlink** nằm trong thư mục thật trỏ ra ngoài không bị phát hiện → `readFileSync`/`appendFileSync` theo symlink ra ngoài root (read → exfil qua jira_attach_file). Đúng đúng mức TDD §8.3 (control bù parent-only, full realpath = OI-2 follow-up). Có test: "blocks symlink escapes but passes internal links". | Giữ theo design. OI-2 follow-up: khi có NFR perf, realpath toàn phần candidate cho READ path (file tồn tại → an toàn realpath file; chỉ write mới cần parent-only). | SA (OI-2 tracking) |
| SA-05 | ℹ️ Info (pre-existing) | A03 — Input validation (URL path interpolation) | `extension/src/mcp/atlassian/jira-attachment-tools.ts:65,85` · `confluence-content-tools.ts:22,60,67,73,84` | `issue_key`/`page_id`/`attachment_id`/`version_number` được nội suy thẳng vào URL path (ví dụ `/rest/api/2/issue/${issue_key}/attachments`) không validate format → agent bị injection có thể thao túng path trong surface Atlassian API (same-tenant). Không phải SSRF full (client build URL từ baseUrl cấu hình; `jira_download_attachment` chỉ lấy `pathname+search` → vẫn bám host Atlassian). Pre-existing, ngoài scope ticket. | Follow-up hardening: validate `issue_key` theo `/^[A-Z][A-Z0-9]+-\d+$/`, `page_id`/`attachment_id` theo `^\d+$`, encode-uri component trước khi nội suy. | DEV (follow-up) |
| SA-06 | ℹ️ Info | A06/A08 — Supply chain (CI) | `.github/workflows/ci-sa4e-356.yml:81,84,134,149,172` | Third-party actions pin theo **major tag** (`actions/checkout@v7`, `setup-node@v7`, `upload-artifact@v4`) — mutable references; `pip install semgrep` (dòng 172) unpinned version. Job semgrep là informational (continue-on-error) nên risk thực tế thấp; N-8 grep gate mới là blocking enforcement (đúng thiết kế). `permissions: contents: read` ✅ least-privilege; không có secret trong workflow ✅; `npm audit --omit=dev --audit-level=high` blocking ✅. | Pin actions theo full-length commit SHA (dependabot/renovate cập nhật); `pip install semgrep==<pin>` hoặc dùng container digest. | DevOps (follow-up) |
| SA-07 | ℹ️ Info (pre-existing) | A06 — Vulnerable & Outdated Components (transitive) | `extension/package-lock.json` — `pi-web-access 0.33.0` → nested `@modelcontextprotocol/sdk 1.27.1` | npm audit 1 HIGH pre-existing: `@modelcontextprotocol/sdk` **1.27.1** nested trong `pi-web-access` (direct dep của extension là 1.29.0 — clean). **Xác minh commit bb17b39 KHÔNG đổi dependency**: `package.json`/`package-lock.json` không nằm trong diff; pin `vitest 4.1.8` + `@vitest/coverage-v8 4.1.8` (dev-only, exact pin + integrity trong lock — không có CVE nào biết đến tại 4.1.8) đến từ commit Phase 4.5 `9c75f90`. Không phát hiện typosquatting trong deps thay đổi. | Không fix được cục bộ (transitive, upstream pin). Theo dõi release `pi-web-access` mới bump SDK ≥ fixed version; tạm thời đánh giá exposure: MCP SDK client-side dùng cho agent tooling local — không expose network surface mới. Ghi nhận won't-fix-có-căn cứ trong triage audit. | SM (tracking) / DevOps (triage) |

---

## 3. Verification Matrix — SEC-01..08 (design findings → implementation)

| # | Design finding (Phase 3.7) | Yêu cầu remediation (TDD v1.2) | Implemented? | Verified? (evidence) |
|---|---------------------------|--------------------------------|--------------|----------------------|
| SEC-01 | Medium — inner markdown image refs bypass containment | §5.4.1/AD-15: `embedMarkdownImages(markdown, baseDir, root)`; per-ref `isPathWithinRoot`; ngoài root → `skipped++`, giữ `match`, KHÔNG throw (fail-closed) | ✅ ĐÚNG | `backend-local-tools.ts:320-340` — đúng signature mới, skip fail-closed, không throw; `imageToDataUri` chỉ chạy **sau** containment (đọc file ngoài root không thể xảy ra); baseDir = `dirname(resolvedPath)` (:285-289). Tests: `T-SEC01` + `IT-09` trong `backend-local-tools.test.ts` (attacker-red-then-green theo spec) |
| SEC-02 | Medium — nhánh `cwd_fallback` quá rộng | BR-06b/AD-16: relative khi fallback → `PATH_NO_WORKSPACE` fail-loud; absolute passthrough (DISC-1, BA-acked) | ✅ ĐÚNG | `PathResolver.ts:128-143` — Step 2b đúng vị trí (trước resolve); message Format 3 + sanitize. Tests: `UT-11 T5b` (relative bị chặn / absolute passthrough phân biệt), `tool-proxy.test.ts` BR-06b với `Wrapper Error:` marker. Audit §8.5: handler `console.warn` khi resolve fail ✅ |
| SEC-03 | Medium — symlink escape thiếu control bù | AD-17/I-7: guard ở **handler layer** (C-2 helper giữ pure); realpath `dirname`; write: `ensureDir` trước rồi realpath; re-check containment | ✅ ĐÚNG | `backend-local-tools.ts:102-123` — `checkSymlinkGuard` standalone, đúng thứ tự; áp đủ 7 điểm chạm fs: stream_write (:199-208 — ensureDir :199 trước guard :204), embed input (:269-273) + output (ensureDir :291 → guard :295), jira (:41-48 trước HTTP — I-3 ✅), confluence (:40-47), ToolProxy pre-read (`ToolProxy.ts:55-58`), proxyInput (`Base64ProxyService.ts:96-97`) + proxyOutput write (:138-143). `PathResolver.ts` không có fs import — C-2 preserved ✅. Residual file-level symlink = design-accepted (SA-04) |
| SEC-04 | Low — backend containment case-sensitive (R-1 sibling) | AD-18: fold win32 2 vế trong `resolveFilePath` + cross-ref comment | ✅ ĐÚNG | `backend/src/engine/tools/drawio-tool.ts:81-88` — fold cả 2 vế + equality, comment cross-ref `PathResolver.ts`; không đổi resolve behavior (BR-12 ✅) |
| SEC-05 | Low — NUL/control chars + log forging | AD-19: `PATH_INVALID` cho NUL fail-loud trước resolve; sanitize `[\r\n\0]→?` mọi message/log | ✅ Extension / ⚠️ Backend partial | Extension: `PathResolver.ts:98-109` (`PATH_INVALID`), `sanitizeLogText` (:189-191) áp đầy đủ cho PATH_INVALID/NO_WORKSPACE/REJECTED messages; mọi handler wrap fs error qua `formatFsError`/`formatFileNotFound` (sanitize err.message) ✅. Backend: raw echo sanitized nhưng **`resolved` echo chưa** → SA-02 (Low) |
| SEC-06 | Low — Windows quirks ngoài corpus N-3 | AD-20: corpus mở rộng (trailing-dot/space, 8.3, `\\?\` 2 phía, drive-relative, forward-slash) — fail-closed | ✅ ĐÚNG | Test suite có describe `N-QA2 quirk corpus (SEC-06)` + `PBT-03 containment monotonicity` trong `path-resolver.test.ts` (47 it cases). Phân tích code: `\\?\` prefix → containment reject (fail-closed ✅); drive-relative `C:foo` → `isAbsolute=false` → workspace: resolve + containment áp / fallback: `PATH_NO_WORKSPACE` ✅ |
| SEC-07 | Low — payload unbounded (disk-fill/OOM) | AD-21/N-9: `content` > 10 MB → fail trước resolve; pre-read > 25 MB → `PathResolverError` trước read | ✅ ĐÚNG | 10 MB: `backend-local-tools.ts:27-28,176-189` — `Buffer.byteLength` check **trước** `resolveWorkspacePath` (:191) ✅; 25 MB: `Base64ProxyService.ts:30-31,98-109` — stat trước `readFileSync` ✅; guard I-7 chạy trước cả stat ✅. Messages không leak thông tin ngoài path (đã chấp nhận INFO-01) ✅. Tests: `T-size` refuse + boundary (10 MB exactly accepted; 25 MB exactly succeeds) ✅ |
| SEC-08 | Low — (a) chat error thiếu marker; (b) alias `args.path` ngầm | AD-22: (a) `Wrapper Error:` prefix bắt buộc (ToolResult chat không có isError); (b) giữ alias, document explicit, cả hai qua helper | ✅ ĐÚNG | (a) `ToolProxy.ts:49-52` (resolve-fail), :55-57 (guard), :63-66 (fs-fail) — **cả 3 đường lỗi** đều có marker + CODE: prefix giữ nguyên (C-5 ✅). Đã xác nhận `HttpClient.ts:20-22` — `ToolResult` thật sự không có `isError` field → marker là giải pháp đúng contract. (b) Alias documented tại cả 3 điểm (:43-45, `backend-local-tools.ts:164-167,238`); test "accepts args.path alias (no bypass)" + "rejects escape-shaped input via the path alias identically" ✅ |

**Kết luận matrix: 8/8 design findings được implement; 7/8 verified đầy đủ, SEC-05 verified với 1 gap Low còn sót ở backend (SA-02).**

### Bonus verifications (ngoài SEC matrix)

| Item | Status | Evidence |
|------|--------|----------|
| §5.6 PathResolverError envelope | ✅ | `WrapperServer.ts:245-253` — tool error result, KHÔNG -32603; test TC-29; outputChannel audit line |
| Return-await fix (TA noted) | ✅ | `WrapperServer.ts:237-244` — 4× `return await` + comment giải thích gotcha; đúng kỹ thuật |
| N-8 consistency gate | ✅ PASS | Chạy độc lập `--all`: 523 file scanned, 0 violation; semgrep rules scope đúng (`extension/src/**`, exclude tests + PathResolver.ts; chỉ match token `file_path` — không flag false-positive `readFile(resolvedPath)`) |
| Schema M-1..M-4 | ✅ | `Base64ProxyService.ts:216-247` — file_path LUÔN ghi đè (M-1), output_path theo M-2 suffix DISC-2, required-array logic giữ nguyên (M-3), shared constant (M-4) |
| remote-backend-client provider | ✅ | :64-66 — live vscode read → activation-captured fallback → helper tự cwd fallback, đúng chuỗi TDD row 7 |
| Invariant I-3 (resolve fail → không HTTP) | ✅ | jira (:34-48) và confluence (:33-47): resolve + guard đều return **trước** FormData/HTTP |
| Threat model §8.1 (arbitrary file read closed) | ✅ | Cả 3 tool đọc-file-then-upload (jira/confluence/embed) đều qua resolve+containment+guard trước read |

---

## 4. OWASP Top 10 (2021) Mapping

| OWASP | Kết quả audit scope này |
|-------|------------------------|
| A01 Broken Access Control | ⚠️ SA-01 (Medium, pre-existing CORS); ℹ️ SA-04 (residual symlink, design-accepted). Core containment **đã đóng** đúng design |
| A02 Cryptographic Failures | ✅ No issues — Basic auth build per-request từ SecretStorage; không crypto mới trong ticket |
| A03 Injection | ⚠️ SA-02 (log forging gap — Low); ℹ️ SA-05 (URL path interpolation — Info, pre-existing). SQL/command injection: không có (không `child_process`, không SQL trong paths); N-8 PASS |
| A04 Insecure Design | ℹ️ SA-03 (proxyOutput fail-silent shape — design-accepted); threat model §8.1 áp dụng đúng |
| A05 Security Misconfiguration | ⚠️ SA-01 (ACAO `*` + no authN); SSE/body-limit (1 MB)/404 handling đúng |
| A06 Vulnerable & Outdated Components | ℹ️ SA-07 (pre-existing transitive HIGH); ticket zero runtime-dep change ✅ |
| A07 Identification & Authentication Failures | ✅ No issues — loopback no-authN là design có chủ đích (§3.1 design review); authN gap thực chất của SA-01 |
| A08 Software & Data Integrity Failures | ✅ Lock integrity đầy đủ cho vitest/coverage pin; semgrep rule comments có triage records |
| A09 Security Logging & Monitoring Failures | ✅ Audit §8.5 implemented (console.warn handler + outputChannel WrapperServer); log forging mitigated extension-side, ⚠️ 1 gap backend (SA-02) |
| A10 SSRF | ✅ No issues — `jira_download_attachment` chỉ extract pathname+search → request bám baseUrl Atlassian; không fetch theo URL agent kiểm soát hoàn toàn |

---

## 5. Dependency Assessment

| Dependency | Version (lock) | Vị trí | Ghi chú |
|-----------|----------------|--------|---------|
| `@modelcontextprotocol/sdk` (nested qua `pi-web-access` 0.33.0) | 1.27.1 | runtime (transitive) | **1 HIGH pre-existing** (npm audit) — SA-07. Direct dep 1.29.0 clean. Fix cần upstream bump; không phải regression của ticket |
| `vitest` | 4.1.8 (exact pin) | dev-only | Không có CVE nào biết đến tại 4.1.8; pin exact + integrity trong lock — đúng yêu cầu provider==runner |
| `@vitest/coverage-v8` | 4.1.8 (exact pin) | dev-only | Bump đồng bộ với vitest (comment CI yêu cầu) ✅ |
| Runtime deps khác | — | — | **bb17b39 không đổi `package.json`/lock** (verified qua `git diff bb17b39~1 bb17b39 --stat`) — claim TDD §1.3 "KHÔNG thêm dependency" ✅ đúng事实 |

> CVE ID cụ thể của HIGH không được re-verify gegen GHSA trong session này (MCP degraded, không network audit tool) — số liệu dựa trên npm audit trước đó của DEV + lockfile version check. Khuyến nghị DevOps chạy `npm audit --omit=dev` hiện trạng để chốt ID + fixed-in version.

---

## 6. Remediation Priority

| # | Finding | Effort | Impact | Deadline đề xuất |
|---|---------|--------|--------|------------------|
| 1 | SA-01 — CORS/Origin validation trên :9181 | Medium | Đóng kênh cross-origin readback Atlassian-data + tool-abuse từ browser | Follow-up ticket, priority P2 (trước release public) |
| 2 | SA-02 — sanitize `resolved` echo backend | Low (1 dòng + 1 assert) | Chốt SEC-05 đầy đủ, log forging 0-gap | Gộp ticket này nếu còn backend edit; ngược lại follow-up P3 |
| 3 | SA-03 — proxyOutput guard-failure → isError | Low | Fail-loud đúng principle, tránh agent-confusion | Follow-up P3 |
| 4 | SA-05 — validate Atlassian identifiers | Low | Chặn path manipulation same-tenant | Follow-up P3 |
| 5 | SA-06 — pin CI actions SHA + pip version | Low | Supply-chain hardening | Follow-up P3 |
| 6 | SA-07 — theo dõi pi-web-access bump | Low (tracking) | Đóng audit HIGH | SM tracking, P3 |

---

## 7. Recommendations Summary

### Immediate (trước khi close ticket)
1. **Tạo follow-up ticket cho SA-01** (CORS/Origin validation loopback MCP) — SM tạo, SA viết TDD ngắn; không block Phase 6 vì pre-existing + đã được giảm bởi containment mới.
2. **Fix SA-02** (1 dòng sanitize backend) — nhỏ, gọn, chốt SEC-05 100%.

### Short-term (follow-up ticket)
3. SA-03: proxyOutput guard-failure → `isError: true` result.
4. SA-05: regex-validate `issue_key`/`page_id`/`attachment_id`.
5. SA-06: pin SHA cho GitHub Actions + pin `semgrep` pip version.
6. OI-2 (theo §8.3): realpath toàn phần cho READ paths khi có NFR perf — đóng nốt file-level symlink (SA-04).

### Long-term / Hardening
7. SA-07: bump `pi-web-access` khi upstream phát hành SDK fixed; triage audit có căn cứ.
8. Xem xét shared-secret token cho `/mcp` như defense-in-depth sau Origin validation.
9. Đưa corpus SEC-06 (quirk) vào STC regression thường kỳ để N-3 claim giữ giá trị theo thời gian.

---

## 8. Scope Limitations

- **Static review only** — không dynamic testing, không fuzz path runtime, không pentest mạng/infra, không review Atlassian credential storage chi tiết (chỉ xác nhận đọc từ SecretStorage, không hardcode).
- Line references tại commit `bb17b39` trên branch `main`; có thể drift nếu merge mới.
- CVE re-verify gegen GHSA/NVD không thực hiện được trong session (MCP degraded — không network tool); đánh giá dependency dựa trên lockfile versions + npm audit kết quả đã có.
- Giả định giữ nguyên từ design review: `vscode.workspace` là nguồn root đáng tin; threat model = agent bị prompt injection (không chống user độc hại); WrapperServer bind loopback theo §2.3.
- MCP degraded session: không ingest KB, không dùng code-intel index — toàn bộ verify bằng direct file read + git + grep script.

---

## Appendix

### A. Tools & Methodology
- Static code review thủ công (read full-file) đối chiếu TDD v1.2 ↔ implementation, từng file theo scope directive.
- Kiểm chứng độc lập: `bash scripts/check-pathresolver-n8.sh --all` (PASS, 523 files); `git show/diff` xác định phạm vi thật của bb17b39 (20 files, không có package.json); `Select-String` trên package-lock.json cho dependency chain.
- Review test suites để xác nhận security tests tồn tại và assert đúng hành vi (path-resolver.test.ts 47 cases; backend-local-tools.test.ts T-SEC01/IT-09/T-size; wrapper-server.test.ts TC-28/29; tool-proxy.test.ts BR-06b/alias).
- OWASP Testing Guide v4.2 methodology (static portion).

### B. Glossary
- **CWE-22**: Path Traversal; **CWE-117**: Log Injection; **CWE-942**: Permissive CORS Policy; **CWE-346**: Origin Validation Error.
- **I-7**: invariant symlink guard (TDD §6.5); **BR-06b**: rule từ chối relative khi cwd_fallback; **AD-15..23**: architecture decisions v1.2.

---

*— Hết Security Assessment SA4E-356 (Phase 5.7) — Verdict: APPROVED WITH FINDINGS · 0 Critical · 0 High · 1 Medium (pre-existing SA-01) · 1 Low (SA-02) · 5 Info — Phase 6 KHÔNG bị block —*
