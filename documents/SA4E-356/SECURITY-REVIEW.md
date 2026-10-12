# Security Design Review — SA4E-356

## Thông tin tài liệu

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (SA4E extension + backend child server) |
| Ticket | SA4E-356 — [Bug] MCP tools: relative file_path resolves against process CWD instead of workspace root |
| Scope | Design review TDD v1.1 + FSD v1.2 + BRD v1.0.1 + DISCREPANCY.md v2 (không test runtime, không pentest infra) |
| Date | 2026-10-12 |
| Assessor | Security Agent (Phase 3.7 SDLC pipeline) |
| Verdict | **PASS WITH FIXES** — thiết kế được duyệt có điều kiện, không có Critical chặn Phase 4 |
| Sources verified | `extension/src/backend-local-tools.ts:113–149,160–175`, `extension/src/mcp/atlassian/jira-attachment-tools.ts:19–31`, `extension/src/mcp/atlassian/confluence-content-tools.ts:18–32`, `extension/src/proxy/ToolProxy.ts:42–66`, `extension/src/services/Base64ProxyService.ts:32–185`, `extension/src/services/WrapperServer.ts:190–260`, `backend/src/engine/tools/drawio-tool.ts:34–71` |

---

## 1. Verdict tổng thể: PASS WITH FIXES

Thiết kế `PathResolver` (single source of truth, containment có trailing-separator boundary + case-fold win32 hai vế, fail-loud, invariant I-3 "resolve fail → không gọi HTTP") là **đúng hướng và đóng được lỗ hổng gốc** (arbitrary file read qua `jira_attach_file`/`confluence_add_attachment`/`embed_image` bằng absolute path tùy ý + exfiltration qua upload). Không phát hiện flaw kiến trúc nào ở mức Critical.

Tuy nhiên review phát hiện **3 findings Medium phải xử lý trước khi close ticket** (1 cái là bypass containment thật sự — SEC-01), **5 findings Low** cho Phase 5, và 2 ghi nhận Informational. Không finding nào chặn Phase 4 (Test Planning — QA cứ sinh STC theo FSD §10 + các test bổ sung trong mục 4), nhưng **SEC-01/SEC-02/SEC-03 yêu cầu SA cập nhật TDD trước Phase 5** (DEV không tự ý fix bypass bằng workaround — xem `no-workaround-rule`).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 3 (SEC-01, SEC-02, SEC-03) |
| 🔵 Low | 5 (SEC-04 .. SEC-08) |
| ℹ️ Informational | 2 (INFO-01, INFO-02) |

**Có Critical block Phase 4 không? Không.** Phase 4 được tiếp tục. Điều kiện sang Phase 5: SA resolve SEC-01/SEC-02/SEC-03 trong TDD (v1.2).

---

## 2. Bảng findings

| # | Severity | Location | Mô tả | Remediation | Owner |
|---|----------|----------|-------|-------------|-------|
| SEC-01 | Medium | `extension/src/backend-local-tools.ts:182–192` (`embedMarkdownImages`); TDD §5.4 row 2; FSD §5.5 row 2 | **Inner markdown image refs bypass containment.** Sau fix, `file_path`/`output_path` được resolve + containment, nhưng các image refs **bên trong** nội dung markdown (`![alt](../../secret.png)`, `![alt](C:\Windows\file.png)`) được resolve ở dòng 186 bằng `path.resolve(baseDir, decodeURI(src))` mà **không qua containment check**. `imageToDataUri` đọc file ngoài workspace và nhúng base64 vào output file (nằm trong workspace) → agent đọc tiếp output bằng `mem_ingest_file` (hợp lệ) rồi attach ra Jira = **kênh đọc file tùy ý (arbitrary file read) lách containment**. FSD §5.5 row 2 ghi rõ "Image refs KHÔNG qua helper" như hành vi giữ nguyên — đây chính là lỗ hổng, không phải tính năng. Khai thác cần agent (bị prompt-injection) điều khiển được nội dung markdown hoặc trỏ tới markdown độc hại — realistic trong threat model của TDD §8.1. | SA cập nhật TDD §5.4 row 2 + FSD cần clarify: truyền `workspaceRoot` vào `embedMarkdownImages(markdown, baseDir, root)`; mỗi `src` sau `path.resolve` phải qua `isPathWithinRoot(root, abs)` — ngoài root → `skipped++`, giữ nguyên `match` (pattern fail-closed, không throw để không break ảnh URL hợp lệ). Thêm unit test: markdown chứa `../../../../etc/passwd`-style ref + absolute ngoài root → assert `embedded === 0`, output giữ nguyên ref. DEV implement đúng spec này. | SA (spec) → DEV (implement) |
| SEC-02 | Medium | TDD §3.2 Step 2+4, §8.2 item 2 (nhánh `cwd_fallback`); FSD §6.3 Note DISC-1 | **Nhánh `cwd_fallback` (không mở workspace): relative path resolve vào thư mục cài Kiro + absolute path không giới hạn.** Đồng ý với SA/DISC-1 rằng containment theo `process.cwd()` (Kiro install dir) vô nghĩa về security. Nhưng thiết kế hiện tại vẫn resolve **relative** theo `process.cwd()` — nghĩa là `stream_write_file` có thể **ghi file vào thư mục cài đặt Kiro** (pollute install dir, hoặc EACCES fail khó hiểu), và absolute path được chấp nhận toàn bộ (đọc `C:\Users\<name>\.ssh\...`, `.env` ngoài project rồi exfil qua `jira_attach_file` — đúng lúc không có workspace thì agent càng không có lý do chính đáng để đọc file nhạy cảm). Trạng thái không-workspace là hiếm nhưng là trạng thái **kém tin cậy nhất** (không có boundary nào). | SA bổ sung rule BR-06b trong TDD: khi `rootSource === "cwd_fallback"`, **từ chối relative path fail-loud** (`PATH_NO_WORKSPACE: no workspace open — use an absolute path inside the intended folder or open a workspace`), chỉ cho absolute passthrough; error Format 1-fallback giữ nguyên (đã tốt). Thêm T5b unit test. Không áp containment cho absolute (đúng như DISC-1 đã chốt) nhưng log `warn` + audit (TDD §8.5 đã có — giữ). | SA (spec) → DEV |
| SEC-03 | Medium | TDD §3.3 + §8.3 (OI-2 accepted limitation); áp cho mọi call site §5.4 | **Symlink/junction escape: "accepted limitation" chưa kèm điều kiện chấp nhận và control bù.** Containment là string-compare trên lexical path — symlink/junction/subst **nằm trong workspace trỏ ra ngoài** lọt qua. TDD/FSD lập luận "agent không tạo được symlink qua tool trong audit" — đúng nhưng chưa đủ: (a) workspace thực tế chứa sẵn symlink/junction (quen thuộc nhất: `node_modules/.bin/*`, monorepo symlinks, `subst` drives) — `stream_write_file` ghi xuyên junction = ghi ra ngoài root; (b) attacker không cần tạo symlink, chỉ cần workspace đã có sẵn (repo clone về có symlink là bình thường); (c) đọc xuyên symlink `node_modules/...` rồi upload Jira là exfil ngoài-root không qua containment. Likelihood thấp nhưng impact là arbitrary read/write — xứng đáng Medium, không thể "accept" bằng một dòng. | Chấp nhận có điều kiện (SA ghi vào TDD §8.3): (1) document rõ attack cần symlink **có sẵn** trong workspace; (2) control bù rẻ tiền, không vi phạm C-2/N-1 đáng kể: sau resolve OK, gọi `fs.realpathSync(path.dirname(resolvedPath))` (parent luôn tồn tại ở thời điểm check cho read; cho write thì `ensureDir` trước rồi realpath) + re-check `isPathWithinRoot(realDir, …)` — chỉ 1 syscall, không break use-case ghi file mới (vì realpath parent, không realpath file); (3) QA thêm test doc: symlink trong tmpdir trỏ ra ngoài → assert bị chặn (nếu implement control) hoặc assert hành vi được ghi nhận; (4) follow-up dùng realpath toàn phần khi có NFR perf mới (giữ OI-2). Nếu SA quyết định vẫn không làm control bù thì phải ghi explicit risk-acceptance với chữ ký owner, không để "accepted" miệng. | SA (quyết định + spec) → DEV/QA |
| SEC-04 | Low | `backend/src/engine/tools/drawio-tool.ts:59–71` (`resolveFilePath`); TDD §7.4 + §5.4 row 10 | **Backend containment vẫn case-sensitive — cùng họ bug R-1, TDD không fix.** Dòng 68: `canonical.startsWith(normalizedWorkspace + sep)` so sánh case-sensitive. Trên Windows, backend `config.workspace` casing (`c:\...`) khác caller (`C:\...`) → `resolveFilePath` trả `null` → sau fix §7.4 sẽ báo "Path rejected … outside backend workspace" **sai sự thật** (path hợp lệ bị coi là escape). Nhẹ hơn R-1 vì chỉ gây reject-oan (availability) chứ không cho-lọt, và tool này đã broken sẵn (OI-1), nhưng fix chỉ 2 dòng mà TDD bỏ sót. | DEV (SA confirm, không cần TDD lớn): áp cùng `fold` win32 trong `resolveFilePath` backend (copy logic `isPathWithinRoot`, hoặc export helper dùng chung nếu backend import được — nếu không thì duplicate có comment cross-ref). Thêm backend unit test casing `C:`/`c:` pass. Sau đó message §7.4 mới có ngữ nghĩa đúng. | SA (confirm) → DEV |
| SEC-05 | Low | TDD §3.2 Step 1 (validate); `PathResolutionErr.message` echo `rawPath` | **NUL bytes và control characters không bị từ chối tường minh.** `typeof x === "string" && trim() !== ""` cho `a\0b`, `..\x00..`, `file\r\nINJECTED` đi qua. NUL: `path.resolve` giữ nguyên, `fs.*` ném `TypeError [ERR_INVALID_ARG_VALUE]` — các handler hiện có try/catch (local sync trong `try`, jira/confluence qua `registerTool` wrapper) nên fail-loud gián tiếp, nhưng là error-path không được spec/test (không có `CODE:` prefix — vi phạm E-1). `\r\n` trong `rawPath` được echo vào Format 2 message + `console.warn`/OutputChannel → **log forging** (kẻ tấn công chèn dòng log giả vào extension log). Likelihood thấp (cần prompt-injection điều khiển path), impact thấp. | DEV (bổ sung nhỏ, SA ack): Step 1 thêm `rawPath.includes("\0") → PATH_EMPTY` (hoặc code mới `PATH_INVALID` — SA chọn, E-2 stable); sanitize message/log: `rawPath.replace(/[\r\n\0]/g, "?")` trước khi đưa vào message và log line. Thêm T8 case NUL + CRLF. | SA (chọn code) → DEV |
| SEC-06 | Low | TDD §3.3 `isPathWithinRoot`; FSD N-3 corpus; FSD §10.1 T8 | **Windows filename quirks (trailing dots/spaces, 8.3 short names, `\\?\` prefix) ngoài corpus N-3.** `path.normalize` KHÔNG strip trailing dots/spaces (`C:\ws\file. ` ≠ `C:\ws\file` ở tầng string nhưng là cùng file ở tầng Win32) và không expand 8.3 short names (`C:\PROJEC~1\...`). Phân tích: để **escape root vẫn cần `..`/absolute** — trailing-dot/8.3 đơn lẻ không tự traverse, và prefix `\\?\` làm containment fail-closed (reject-oan, không cho-lọt). Nên không phải bypass trực tiếp — nhưng là khoảng mù trong corpus "0 escape leak" (N-3 claim mạnh trong khi corpus thiếu các biến thể Windows thực tế), và root/candidate một bên có `\\?\` một bên không gây reject-oan khó debug. | QA/DEV: mở rộng boundary corpus N-3/T3b/T8: trailing-dot/space (`secret.`, `dir ..Eatिम्मick`), 8.3-style (`PROJEC~1`), `\\?\C:\...` cả hai phía, drive-relative (`C:foo`), forward-slash absolute (`C:/...` — đã có UC-02 EF-3, bổ sung test). Kỳ vọng: escape bị chặn, non-escape quirks fail-closed có log rõ (chấp nhận reject-oan có document, không silent). SA ghi chú vào TDD §8.3/OI-3. | QA (corpus) + DEV + SA (ghi nhận) |
| SEC-07 | Low | `handleStreamWriteFile` (`content` unbounded); TDD không NFR payload | **Không giới hạn kích thước `content`/`file` — disk-fill / memory DoS cục bộ.** Agent (bị injection) gọi `stream_write_file` với `content` hàng trăm MB → `writeFileSync` block event-loop extension host + đầy đĩa; `embed_image`/`mem_ingest_file` đọc file tùy ý lớn vào RAM (`readFileSync`, base64 +33%). Loopback-only nên không phải remote DoS, nhưng extension host treo ảnh hưởng toàn bộ Kiro session (availability). | SA bổ sung NFR + TDD: `content` > 10 MB (SA chốt số) → `FS_ERROR: payload too large` fail-loud; `proxyInput`/`ToolProxy` pre-read file > 25 MB → từ chối kèm gợi ý (tránh OOM base64). DEV implement 3 dòng mỗi điểm + test. Con số là policy, SA quyết. | SA (policy) → DEV |
| SEC-08 | Low | `proxy/ToolProxy.ts:42–50` (chat path shape); `backend-local-tools.ts:114,161` (`args.path` alias) | **(a) Chat-path error thiếu marker lỗi.** `callTool` trả `{ content: [...] }` không có `isError` cho cả resolve-fail lẫn fs-fail — consumer (chat handler) có thể render như kết quả thường, agent hiểu nhầm "đọc file thành công". TDD §5.7 giữ shape hiện có ("Wrapper Error" pattern) nhưng không yêu cầu prefix phân biệt. **(b) Alias `args.path` không documented** (stream_write_file 114, embed_image 161): bề mặt input ngầm ngoài schema (`file_path` là param duy nhất trong inputSchema) — validation của helper chỉ áp sau khi đã chọn alias, may là cả hai alias đều đi qua helper sau fix nên không phải bypass; nhưng là contract mờ (BR-09 "signature không đổi" trong khi runtime chấp nhận param ngoài schema). | (a) Chuẩn hóa chat-path error text bắt đầu bằng `Wrapper Error:` (đã có cho fs-fail — mở rộng cho resolve-fail) + document trong TDD §5.7 là chat consumer PHẢI coi text khởi đầu bằng `Wrapper Error:` là failure; hoặc tốt hơn: thêm `isError: true` nếu `ToolResult` type cho phép (DEV check type, SA quyết — backward-compat với chat renderer). (b) SA quyết: hoặc đưa `path` vào schema (không — vi phạm BR-09 minimal), hoặc **xóa alias** (khuyến nghị — grep caller nội bộ, không ai dùng `path`), hoặc document explicit trong TDD §5.4 row 1c/2. | SA (quyết định) → DEV |
| INFO-01 | Info | FSD §7.2 (resolved path trong error là Internal); TDD §7.2 Format 1/2 ví dụ; TDD §8.5 audit log fields | **Disclosure cấu trúc thư mục + username trong error/log — trade-off đã được chấp nhận đúng.** AC-2 bắt buộc in absolute path (chứa `C:\Users\<name>\...`) — agent cùng-user đã biết workspace; error đi trong session đã xác thực. Lưu ý vận hành: (1) log fields (`rawPath`, `resolvedPath`, `rootPath`) chỉ ở extension log local — KHÔNG forward lên Jira/Confluence/remote; (2) evidence REG-1 đính Jira nên che username trong path (QA redact khi chụp attachment ID); (3) backend message §7.4 in `workspace` của backend host — OK local, nhưng nếu backend remote thì lộ server path cho client — OI-1 follow-up nên generic message khi remote. Không yêu cầu thay đổi thiết kế. | QA (redact evidence) + SA (note cho OI-1) |
| INFO-02 | Info | Invariants I-1..I-6; WrapperServer loopback `:9181`; sandbox_run out-of-scope | **TOCTOU check-then-use + thiếu rate limiting: chấp nhận được trong context này, ghi nhận để CI/CD scan khỏi báo false-positive.** (a) TOCTOU: handler Node đơn luồng; tác nhân duy nhất sửa FS đồng thời là chính agent (gọi tool tuần tự) — không có adversary cạnh tranh trên máy dev local. Không yêu cầu `O_NOFOLLOW`/open-then-fstat trong ticket này (đắt, break write-new-file). (b) Không rate-limit/size-limit trên tool loopback — blast radius là user local; SEC-07 đã cover phần size. Scanner (semgrep/CodeQL) có thể flag `readFile(resolvedPath)` là "tainted path" — DEV/QA đánh dấu false-positive có căn cứ (đã containment + test T3/T3b). Không action code. | — (ghi nhận cho Phase 4.5 scan triage) |

**Điểm làm tốt (ghi nhận — DEV giữ khi implement):** (1) Không dependency mới (chỉ `path`/`fs` built-in) — zero supply-chain risk; (2) Boundary rule trailing-separator + equality (T3b) đúng chuẩn CWE-22; (3) Case-fold áp **cả hai vế** nên escape không lợi dụng được fold (fold là quan hệ tương đương, không mở lỏng); (4) `PATH_EMPTY` trước resolve chặn abuse path rỗng về root; (5) I-3 (resolve fail → không HTTP) chặn exfil-then-fail; (6) Backend drawio parser regex-based, không XML lib → không XXE; (7) `PathResolverError` → tool error result thay vì `-32603` (tránh lộ stack qua JSON-RPC — WrapperServer `sendError(err.message)` ở dòng 198 vẫn có thể lộ message backend thô cho lỗi khác, nhưng ngoài scope ticket này, ghi nhận cho hardening chung).

---

## 3. Đánh giá từng trọng tâm checklist

### 3.1 Tool access boundary (authN/authZ nội bộ extension host)

MCP wrapper bind loopback `:9181` trong Extension Host process cùng-user — **không có và không cần authN giữa agent và tool** (attacker remote không chạm được loopback; threat thực tế duy nhất là **prompt injection điều khiển agent đã xác thực** — TDD §8.1 threat model nêu đúng). Thiết kế containment + I-3 chính là "authorization layer" thay cho role check: mọi tool bị giới hạn trong workspace bất kể agent bị ép truyền gì. Đánh giá: **đúng mô hình đe dọa, không yêu cầu thêm auth mechanism**. Lưu ý: `execute_dynamic_tool` cho agent chọn `toolName` tùy ý trong `innerArgs` — proxy sets quyết định theo schema backend (server-side), agent không tự nâng đặc quyền — OK. OI-5 (2 đường `mem_ingest_file`) không tạo chênh lệch policy sau fix (cùng helper) — OK.

### 3.2 Data protection (AC-2 in resolved path; PII/file content)

AC-2 vs confidentiality: trade-off **được chấp nhận có lý do** (agent cần resolved path để self-heal; FSD §7.2 classify Internal — đúng). File content chỉ di chuyển: disk → tool → (Jira/Confluence upload **sau** containment, hoặc error message). Kênh exfil còn lại sau fix: (a) SEC-01 (inner image refs — phải fix), (b) symlink read-through (SEC-03 điều kiện), (c) nhánh `cwd_fallback` (SEC-02). Không phát hiện secret hardcode trong code đã đọc; `AtlassianHttpClient` dùng extension authenticated session (không thấy credential handling trong scope review). Khuyến nghị vận hành xem INFO-01 (redact Jira evidence).

### 3.3 Input validation (non-string, empty, NUL, trailing dots/spaces, separators, 8.3, UNC, case)

Non-string/empty: tốt (`PATH_EMPTY`, C-1 never-throw). Mixed separators/dot-segments: tốt (`path.resolve` normalize). Case tricks: tốt (fold hai vế win32 + T6). UNC: fail-closed (đúng). Còn hở: **NUL/control chars (SEC-05)**, **trailing dots/spaces + 8.3 + `\\?\` + drive-relative** ngoài corpus (SEC-06), alias `args.path` ngầm (SEC-08b). Không finding nào cho-lọt trực tiếp — đều là hardening corpus/validate để claim N-3 "0 escape leak" đứng vững.

### 3.4 Path traversal / containment design (case-insensitive win32 + trailing-separator)

**Thiết kế đúng và đủ cho lexical containment:** boundary rule chặn prefix-collision (UC-03 EF-2, giữ pattern proven line 132); fold hai vế trên win32 fix R-1 mà không mở bypass (chứng minh: fold là hàm đơn điệu trên quan hệ startsWith khi áp đồng nhất hai vế — escape `C:\WS\..\evil` sau resolve không còn prefix dù fold kiểu gì). `path.resolve` trước compare nên `../` đã canonical. UNC fail-closed. Điểm trừ duy nhất thuộc tầng khác (lexical vs FS-thật): symlink (SEC-03) và Win32 name quirks (SEC-06). Không yêu cầu đổi thuật toán.

### 3.5 Symlink escape (OI-2)

Xem SEC-03: **chưa đủ điều kiện để "accept"** — cần risk-acceptance explicit + control bù parent-realpath rẻ tiền. Lập luận "agent không tạo symlink" bỏ qua symlink có sẵn (`node_modules/.bin`, repo clone). Mức: Medium, SA quyết trong TDD v1.2.

### 3.6 TOCTOU giữa containment check và fs operation

Xem INFO-02: **risk Low, chấp nhận được** — adversary đồng thời không tồn tại trong deployment thực tế (single-user local, agent gọi tuần tự). Không yêu cầu open-then-validate trong ticket này. Ghi nhận để scanner khỏi raising.

### 3.7 `process.cwd()` fallback + bỏ containment nhánh cwd_fallback (DISC-1 RESOLVED)

Đồng ý với verdict DISC-1: rationale cũ sai fact, behavior change mới là đúng (boundary theo Kiro install dir vô nghĩa + chặn oan). **Nhưng thiết kế mới đi chưa đủ xa** — xem SEC-02: relative-trong-fallback vẫn resolve vào install dir (ghi file vào đó là hành vi nguy hiểm/vô nghĩa), absolute không giới hạn nào trong trạng thái kém-tin-cậy-nhất. Yêu cầu bổ sung BR-06b (từ chối relative khi fallback). Không reopen DISC-1 — đây là hardening tiếp theo, SA bổ sung TDD v1.2.

### 3.8 Fix R-1 case bug (stream_write_file từ chối absolute hợp lệ)

**Fix đúng:** fold `toLowerCase()` cả hai vế, chỉ `process.platform === "win32"`, giữ boundary + equality. Không có over-normalization (không strip/sửa path, chỉ compare). T6 + T2/INT-1 cover. Lưu ý lan tỏa: cùng họ bug còn sống ở **backend `resolveFilePath`** (SEC-04) — TDD phải bao luôn để error §7.4 có ngữ nghĩa đúng. OI-3 (macOS) giữ nguyên là quyết định an toàn đúng (fail-closed).

### 3.9 Command injection / drawio XML / backend error message

**Command injection: không phát hiện.** Paths chỉ vào `fs.*`/`basename`/`FormData`, không vào `child_process`/`eval`; `sandbox_run` (nơi duy nhất build command) out-of-scope và path là sandbox-internal — đúng. **Drawio XML: không XXE** (regex parser, không XML lib/external entity — verify `drawio-parser.ts:3`). `handleApply` write in-place theo path đã `resolveFilePath` — OK (trừ SEC-04). **Backend error message §7.4 (10 dòng):** lộ `workspace` path backend + echo `args.file_path` — chấp nhận local (INFO-01), nhưng sửa SEC-04 trước để message không vu oan path hợp lệ; khi backend remote (OI-1) phải generic message. `decodeURI(src)` ném `URIError` với `%` malformed — đã nằm trong try/catch handler → fail-loud, OK (DEV giữ).

### 3.10 Dependency mới

**Không có — điểm cộng lớn.** TDD §1.3 xác nhận chỉ `fs`/`path` built-in + lazy `vscode`. Không supply-chain risk, không license risk, không CVE mới. Phase 4.5 scan chỉ cần baseline hiện có.

---

## 4. Recommendations

### 4.1 Cho Phase 5 (DEV) — bắt buộc

1. **SEC-01 trước mọi call site khác:** implement containment cho inner image refs theo spec SA (mục 2) — đây là bypass thật sự; test kẻ tấn công (markdown độc hại) phải đỏ trước fix, xanh sau fix.
2. **SEC-02:** implement BR-06b (từ chối relative khi `cwd_fallback`) + T5b.
3. **SEC-03:** implement parent-dir realpath re-check (SA chốt trong TDD v1.2) HOẶC có risk-acceptance ký tên — DEV không tự chọn, chờ SA.
4. **SEC-04:** fold win32 trong backend `resolveFilePath` + test casing (làm cùng C9 backend 10 dòng).
5. **SEC-05/SEC-06/SEC-07/SEC-08:** NUL-reject + sanitize log; mở rộng corpus quirks Windows; size cap `content`/pre-read; chuẩn hóa chat error marker + xử lý alias `args.path` (xóa — sau khi grep không caller nào dùng).
6. Giữ nguyên mọi invariant I-1..I-6, C-1..C-6; mọi error giữ `CODE:` prefix (E-1); không sửa `backend/` ngoài 2 điểm đã duyệt (BR-12 + SEC-04).
7. Quality gate trước merge: N-8 grep scan (0 raw `fs.*(file_path`, 0 `resolve(file_path)` 1 đối số trong `extension/src/`) + `vitest --coverage` PathResolver ≥ 95% + boundary corpus mới pass.

### 4.2 Cho Phase 4.5 (CI/CD security scan)

1. Phạm vi scan: `extension/src/**` + `backend/src/engine/tools/drawio*.ts`; baseline secret-scan toàn repo 1 lần (không kỳ vọng secret mới — ticket không thêm credential).
2. Triage sẵn (đánh dấu won't-fix có căn cứ, xem INFO-02): SAST flag `readFile(resolvedPath)` dạng "tainted path from tool input" → false-positive (đã containment + T3/T3b/T8); thiếu rate-limit loopback → accepted (single-user local + SEC-07 size cap).
3. Thêm semgrep rule tùy chỉnh (giữ N-8 sống trong CI): cấm `path.resolve(<*>file_path)` 1 đối số và `fs.*Sync(<*>file_path` raw trong `extension/src/` (exclude `__tests__/`, `PathResolver.ts`) — fail build nếu match, thay vì grep thủ công.
4. PNG/DOCX/Jira evidence của REG-1: redact username trong path (INFO-01) trước khi attach.
5. OI-1 follow-up ticket (proxy-route cho `drawio_auto_layout`) phải qua security review riêng: bề mặt mới (`content_base64` input + `output_base64` → write) cần containment cho `output_path` ngay từ TDD follow-up.

---

## 5. Scope limitations

- Static design review trên tài liệu + source tại thời điểm verify (line refs có thể drift — DEV re-grep theo symbol, OI-7).
- Không dynamic testing, không fuzz path corpus thật, không pentest mạng/infra, không review Atlassian credential storage (ngoài scope ticket).
- Giả định: WrapperServer bind loopback theo TDD §2.3; `vscode.workspace` là nguồn root đáng tin; agent cùng-user với extension host (mọi boundary đều là bảo vệ chống **nhầm lẫn/injection**, không phải chống user độc hại — user độc hại vốn có toàn quyền FS).

---

*— Hết Security Review SA4E-356 (Phase 3.7) — Verdict: PASS WITH FIXES, 0 Critical, Phase 4 tiếp tục —*
