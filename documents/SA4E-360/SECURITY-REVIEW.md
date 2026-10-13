# 🔒 Security Design Review — SA4E-360 (READ-ONLY)

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-360 — Multi-Resolution Context Supply for Pi Harness — P1: Code Skeletonization + Agentic Context Loading |
| Review target | TDD.md **v1.1** (documents/SA4E-360/TDD.md), FSD.md **v1.2** (TA-ENRICHED, DISC-1..7 applied) |
| Governance baseline | SA4E-355 TDD **v1.3 §13** (3-point budget gate — UNTOUCHED constraint) |
| Review type | Security DESIGN review (static, docs + code verification) — không test động, không exploit |
| Date | 2026-10-14 |
| Assessor | Security Agent |
| Version | 1.0 |
| Status | Final |

## Scope & Methodology

**Phạm vi:** thiết kế security của 5 UC (skeleton injection, read_method, functional map, regex fallback, governance regression), 2 backend tool mới (code_symbol_locate, code_extract_signatures), wire points (pi-agent-session-host, workspace-info-tool, pi-workflow-gate, pi-workflow-adapter), và loopback MCP query chain.

**Methodology:** static review tài liệu thiết kế + đối chiếu trực tiếp source code shipped/dormant được design trích dẫn (file:line). Không chạy dynamic test, không penetration test. Các khẳng định "verified" dưới đây là kết quả đọc code thật trong workspace, không phải tin thiết kế.

**Code verified trong review này:**

- extension/src/pi-agent/context-retrieval/path-containment.ts (SEC-325-D1 — \0, UNC, lexical isWithin, realpath symlink)
- extension/src/pi-agent/context-retrieval/search-provider.ts (SEC-325-D2/D4 — loopback-only fail-closed, X-Session-Nonce, 5s AbortSignal, MAX_QUERY_CHARS fail-closed)
- extension/src/pi-agent/context-retrieval/symbol-outline-extractor.ts (MAX_READ_BYTES 1MB stat-first, render kind/name/signature, trimSignature 120 chars)
- extension/src/pi-agent/context-retrieval/file-exclusion-filter.ts + types.ts (EXCLUDED_DIRS = .git/node_modules/out/dist)
- extension/src/pi-workflow/workspace-info-tool.ts (layoutCache TTL 60s key=workspaceRoot), pi-agent-session-host.ts (hosts Map L62, getSessionToolLoadout L71), pi-workflow-gate.ts (READ_ONLY_TOOLS L103), pi-event-mapper.ts (MAX_TOOL_RESULT_CHARS = 16_000)
- backend/src/engine/parsers/signature-extractor.ts (ReDoS C2: MAX_LINE_LENGTH 8192 blanking; bounded patterns; estimateEndLine scan ≤ 200 lines)
- backend/src/engine/query/query-layer.ts (parameterized SQL, sanitizeFtsQuery/sanitizeLikeQuery, findSymbols LIKE prefix)
- backend/src/engine/tools/code-symbols.ts, register-tools.ts; backend/src/server/HttpServer.ts (auth middleware map, endpoint /mcp L189)
- backend/src/engine/indexer/file-scanner.ts / file-watcher.ts (detectLanguage null → file KHÔNG được index)
- package.json extension + backend (dependency inventory)
- Hono routing behavior test thực tế: middleware '/mcp/*' match đúng cả path '/mcp' chính xác (không auth gap do wildcard)

---

## Executive Summary

Thiết kế SA4E-360 kế thừa một nền tảng kiểm soát đã được hardened tốt từ SEC-325 và SA4E-355: path containment nhiều lớp (\0/UNC/symlink/lexical), loopback-only fail-closed + session nonce, query cap fail-closed, ReDoS guard C2, read cap 1MB stat-first, tenant scope `__projectId`, và 3-point budget gate được giữ nguyên (wire-only, không gate thứ 4). Các quyết định OI-1..OI-6 đều fail-safe (degrade chứ không fail-open).

Không phát hiện **Critical** hay **High**. Hai finding **Medium**: (1) skeleton/RAW_HEAD không có bước redaction secret-like strings — hardcoded secret trong dòng signature hoặc khai báo đầu file sẽ đi vào system context của LLM (và có thể vào session file trên disk); (2) per-file token bound = whole-skeleton cap không bound tổng, truncation loop O(parts²) có thể vỡ ngân sách ≤ 2 s p95 trên workspace lớn/nhiều RAW_HEAD. Còn lại là các finding Low/Informational mang tính hardening.

**Overall Risk Rating: MEDIUM (chấp nhận được với khuyến nghị — không chặn triển khai)**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 |
| 🔵 Low | 4 |
| ℹ️ Informational | 2 |

---

## Findings by OWASP Top 10 (2021)

| Category | Kết quả |
|----------|---------|
| A01 Broken Access Control | ✅ Không có vấn đề mới — containment SEC-325-D1 reused cho slice read; tenant scope giữ nguyên |
| A02 Cryptographic Failures | ✅ N/A (không crypto mới; nonce dùng crypto.randomUUID) |
| A03 Injection | ⚠️ 1 Low (LIKE wildcard injection pre-existing; SQL parameterized, không exec mới) |
| A04 Insecure Design | ⚠️ 2 Medium (secret redaction gap; truncation loop không bound tổng) |
| A05 Security Misconfiguration | ⚠️ 1 Low (auth wrapper opt-in qua env, không rate limit /mcp) |
| A06 Vulnerable & Outdated Components | ✅ Không thêm dependency mới (verified) |
| A07 Identification & Authentication Failures | ⚠️ xem SEC-360-03 (local trust boundary, nonce không được verify server-side) |
| A08 Software & Data Integrity Failures | ✅ Index checksum-based freshness; fingerprint mtime + hash-confirm |
| A09 Security Logging & Monitoring Failures | ✅ Telemetry counts-only, không code bodies; đủ event family PI_SKELETON_* / PI_READ_METHOD_RESULT |
| A10 SSRF | ✅ Không có outbound mới; loopback-only validation fail-closed (verified HttpMcpCaller) |

---

## Detailed Findings

### SEC-360-01 — Không có secret redaction trong skeleton render / RAW_HEAD path

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP** | A04 Insecure Design |
| **CWE** | CWE-200 (Information Exposure), CWE-312 (Cleartext Storage of Sensitive Information) |
| **Location** | extension/src/pi-agent/context-retrieval/symbol-outline-extractor.ts (extractOutline L35-48, extractChunk L50-54); backend/src/engine/parsers/signature-extractor.ts L43-58 |
| **Status** | Open (design-level) |

**Mô tả:** Trả lời trực tiếp câu hỏi review: skeleton builder **KHÔNG có bước strip secret-like strings**. Đã đọc toàn bộ SymbolOutlineExtractor và signature-extractor — không tồn tại pattern redaction nào (không quét `sk-`/`AKIA`/`ghp_`/`xoxb-`/`BEGIN PRIVATE KEY`/`password`/`token`). Ba đường payload vào skeleton:

1. **Signature lines:** extractor index cả kind = constant/variable. Dòng như `const API_KEY = "sk-live-..."` — signatureGroup capture toàn dòng (slice 500 chars ở index, 120 chars khi render) — **phần đầu secret vẫn lộ**.
2. **RAW_HEAD degradation (UC-360-04 AF-1):** `extractChunk` → `readHead` đọc **raw head-of-file** (imports + declarations) ≤ 1MB — hardcoded secret trong khai báo đầu file đi thẳng vào skeleton; `trimToTokenBudget` chỉ trim theo token, không redact.
3. **Doc comment:** extractOutline hiện KHÔNG render docComment (verified — chỉ render kind/name/signature) ✅, nhưng signature-extractor vẫn thu thập docComment (500 chars) — nếu DEV sau này "surface doc comments" theo ghi chú FSD §3.1.4 scope note, secret trong JSDoc sẽ theo vào.

**Attack vector:** Không phải attacker từ ngoài — là **risk thu thập/bền vững hóa**: secret rải rác trong source bị **tập trung sao chép** vào (a) system context của LLM, (b) session transcript, (c) session file persist trên disk (getSessionFile — cần DEV xác nhận agentsFile override có nằm trong file persist hay không), (d) nếu user share transcript/log. Mức độ: workspace-local (máy đã chứa source), nhưng tạo bản sao secret ở nơi mới có vòng đời dài hơn và dễ bị export/share hơn source gốc.

**Mitigations đã có trong design:**

- ✅ `.env`-style files KHÔNG vào index: detectLanguage trả null với extension lạ → file-watcher L69 skip (verified) → không có trong corpus → không được gửi tới code_extract_signatures.
- ✅ EXCLUDED_DIRS (.git/node_modules/out/dist) trong corpus walk.
- ✅ Signature trim 120 chars + không render docComment + không render method bodies.
- ✅ Telemetry chỉ counts/decisions, không code content (verified payload shapes TDD §11).
- ⚠️ Nhưng: KHÔNG có secret-file name exclusion (.env.*, credentials*, *.pem, id_rsa...), KHÔNG có content redaction.

**Khuyến nghị bổ sung:**

1. Thêm 1 pass `redactSecretLike(text)` (≤ 20 lines, regex deny-list: `sk-[A-Za-z0-9]{16,}`, `AKIA[0-9A-Z]{16}`, `ghp_/gho_`, `xox[bap]-`, `BEGIN ... PRIVATE KEY`, `(?i)(password|passwd|secret|token|api[_-]?key)\s*[:=]\s*[^"']{8,}`) áp dụng TRƯỚC trimSignature và trong trimToTokenBudget (RAW_HEAD) — thay literal bằng `[REDACTED]`.
2. Thêm secret-file name exclusion vào skeleton corpus walk (tên file: .env*, *.pem, *.key, id_rsa*, credentials*, *secret*) — tách khỏi EXCLUDED_DIRS để không ảnh hưởng caller khác.
3. DEV: xác nhận + ghi TSDoc xem agentsFile override (skeleton) có được persist vào session file; nếu có — cân nhắc đánh dấu section non-persist hoặc redact.
4. STP: thêm test case — workspace chứa file `config/keys.ts` với `const API_KEY = "sk-..."` → skeleton output phải chứa `[REDACTED]`.

---

### SEC-360-02 — Per-file token bound = whole-skeleton cap: tổng skeleton KHÔNG bị bound khi render; truncation loop O(parts²) có thể vỡ ngân sách ≤ 2 s p95

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP** | A04 Insecure Design (resource exhaustion — CWE-400/407) |
| **Location** | TDD §2.2 step 4-5, §9.1; FSD §3.1.5 (C-360-S1), §6.1 pseudocode |
| **Status** | Open (design-level) |

**Mô tả:** Thiết kế đặt `extractOutline(filePath, symbols, maxTokens = floor(0.70 × staticBudget))` — **per-file bound bằng đúng cap của CẢ skeleton**. Điều này bound từng file nhưng KHÔNG bound tổng: với N file, joined skeleton có thể đạt N × 13,767 tokens @32k trước khi vào truncation loop. Vòng lặp truncation re-measure bằng cách **join lại toàn bộ parts sau MỖI lần drop** (FSD §6.1 pseudocode: `estimateTokenCount(parts.join('\n'))` trong while) → chi phí O(parts² × partSize). TDD §9.1 tự nhận "O(parts²) worst-case **with tiny parts count**" — giả định parts count nhỏ CHƯA được chứng minh cho workspace nhiều file grammar-less: mỗi file RAW_HEAD có thể đạt tới 1MB head → ~250K tokens → bị trim ở cap 13,767/file. 100+ file RAW_HEAD → joined ~1.38M tokens (~5.5MB chars) → 99 lần drop × re-join toàn bộ → dễ vượt 2 s p95, block session assembly (extension host). Termination thì OK (parts strictly shrink + break khi hết victim — verified pseudocode), nhưng **latency budget** không đảm bảo.

**Attack vector:** Không cần attacker — chỉ cần workspace hợp lệ lớn/nhiều ngôn ngữ không có grammar (Svelte, template engines...). Trường hợp hostile workspace (file khai báo hàng nghìn symbol trùng prefix) làm trầm trọng thêm. Hệ quả: session creation treo extension host, vi phạm NFR ≤ 2 s p95 (TC-360-01 verification fail), user-perceived DoS.

**Mitigations đã có trong design:**

- ✅ Loop CHẮC CHẮN terminate (strict-shrink proof + break khi victim undefined) — không infinite loop.
- ✅ Module-priority order giới hạn số drop thực tế trong ca thông thường.
- ✅ CI timing assert (loose bound) được liệt kê trong §9.1 verification.
- ⚠️ Nhưng: per-file cap = cap toàn phần + re-measure full-join là thiết kế tự gây ra pathological case.

**Khuyến nghị bổ sung:**

1. **Global incremental budget:** render file theo module priority, truyền vào extractOutline `maxTokens = cap − measuredSoFar` (extractOutline đã hỗ trợ incremental check) → khi global cap đầy, các file sau tự rỗng → **loại bỏ hầu hết truncation loop**, vẫn giữ BR-360-01.
2. Nếu vẫn giữ truncator: thay `parts.join + estimate` mỗi vòng bằng token accounting tăng dần (trừ token của part bị drop khỏi tổng) → O(parts) thay vì O(parts²) — vẫn đáp ứng INV-2 nếu dùng chính estimateTokenCount đo từng part 1 lần khi build.
3. Thêm hard iteration cap (ví dụ ≤ 500 drops) → vượt cap thì REJECT theo BR-360-02 (fail-safe đã có sẵn, đúng semantics).
4. STP: thêm test 200 file RAW_HEAD cỡ lớn đo wall-clock (hiện chỉ có TC-360-01 happy path).

---

### SEC-360-03 — Loopback MCP wrapper: không rate limit cho tool calls; auth opt-in; session nonce không được verify server-side

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP** | A05 Security Misconfiguration / A07 Auth Failures (CWE-770, CWE-306) |
| **Location** | backend/src/server/HttpServer.ts L100-104, L189-198; search-provider.ts L16-19, L204-234 |
| **Status** | Open (pre-existing surface — SA4E-360 mở rộng bằng 2 tool mới) |

**Mô tả:** (1) rateLimiter chỉ gắn ở `/api/admin/*` và `/api/v1/pega/*` — **endpoint /mcp không có rate limit**; (2) apiKeyAuth là no-op khi `CODE_INTEL_API_KEY` unset (mặc định local dev → wrapper loopback không authn); (3) X-Session-Nonce do client gắn nhưng **không có logic verify server-side** (grep toàn backend: chỉ extension tham chiếu) — control yếu hơn nhìn trên giấy. Với threat model single-user local IDE đây là trust boundary chấp nhận được (SA4E-358 đã thêm Origin/Host validation server-side chống browser-based attack/DNS rebinding — xem SECURITY-ASSESSMENT SA4E-358), nhưng SA4E-360 thêm `code_extract_signatures` — tool đọc file thật (≤ 50 file × 1MB/batch) — vào surface này: một local process bất kỳ (loopback) có thể gọi liên tục gây CPU/IO amplification, hoặc dump toàn bộ symbol corpus (file paths + signatures) của workspace đang index.

**Attack vector:** Local process unprivileged → `POST http://127.0.0.1:{port}/mcp` tools/call `code_extract_signatures` (không cần nonce/key khi env unset) → lặp batch 50 file × 1MB → chiếm CPU/IO backend; hoặc enumerate symbols/file paths. Không leo thang đặc quyền — disclosure boundary nằm trong workspace mà mọi process local đã đọc được qua filesystem.

**Mitigations đã có trong design:**

- ✅ Loopback-only validation fail-closed (client + HttpMcpCaller construction re-validate) — wrapper URL không thể trỏ remote.
- ✅ Origin/Host validation server-side (SA4E-358 shipped) — chặn browser/DNS-rebinding vector.
- ✅ 5s AbortSignal timeout + 60s outer cap (McpBridge L16) + 2s search timeout + 1 retry — không có hang vĩnh viễn.
- ✅ 1MB/file cap + ≤ 50 files/batch + fail-soft — mỗi call bounded.
- ✅ Tenant scope `__projectId` injected (SA4E-41) — không cross-tenant.
- ✅ Hono middleware `/mcp/*` ĐÃ match đúng path `/mcp` chính xác (verified bằng test thực tế với hono trong repo — middleware chạy cho cả `/mcp` và `/mcp/sub`; không có auth gap do wildcard).

**Khuyến nghị bổ sung:**

1. Gắn rateLimiter cho /mcp (per-process hoặc per-IP loopback) — pattern đã có sẵn trong repo (`server/middleware/rate-limiter.ts`), chỉ thêm `app.use('/mcp/*', rateLimiter)`.
2. IndexFreshnessChecker: thêm cooldown (≥ 30-60 s) cho reindex delegate — hiện mỗi read_method trên file stale đều có thể trigger runFullIndex; TurnBudgetGuard chỉ bound identical (tool, args) — args khác nhau né được guard.
3. Document trust boundary trong TSDoc của 2 tool mới; cân nhắc bật CODE_INTEL_API_KEY mặc định ở build shipped (giữ no-op trong dev).

---

### SEC-360-04 — Backend containment twin cho code_extract_signatures: rủi ro lệch chuẩn với path-containment.ts (SEC-325-D1)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP** | A01 Broken Access Control (CWE-22 Path Traversal) |
| **Location** | TDD §4.3 ("resolve + verify the path is inside the backend workspace root (defense-in-depth mirroring path-containment)") |
| **Status** | Open (design-level — code chưa implement) |

**Mô tả:** path-containment.ts nằm trong extension package, backend không import được (khác package — chính thiết kế OI-1 đã ghi nhận separation này). TDD yêu cầu backend "mirroring path-containment" nhưng không chỉ định test vectors bắt buộc → rủi ro DEV implement bản twin thiếu kiểm tra (bỏ qua UNC, bỏ qua symlink realpath, hoặc chỉ lexical resolve). Nếu backend containment yếu hơn, một MCP caller (agent bị prompt-injection) có thể gửi absolute path ra ngoài backend workspace root → đọc file bất kỳ mà backend process có quyền.

**Attack vector:** MCP client (loopback) → code_extract_signatures `{ files: [{ path: "C:\\secrets.txt" }] }` → nếu containment twin thiếu realpath/symlink check → signature lines của file ngoài workspace trả về caller. Limit exposure: chỉ dòng match GENERIC_PATTERNS (function/class/struct...) — nhưng với source file là đủ để lộ nội dung khai báo.

**Mitigations đã có trong design:**

- ✅ Extension chỉ gửi corpus/index-derived paths (không phải user/LLM-supplied paths) — luồng chính không có path từ LLM.
- ✅ Defense-in-depth được chỉ định rõ ở backend (T5 test list có "containment re-check").
- ✅ 1MB read cap server-side (SEC-325-D3 twin).
- ✅ Fail-soft: file lỗi → `skipped[]`, không fail batch.

**Khuyến nghị bổ sung:**

1. Yêu cầu DEV port ĐỦ 4 lớp của path-containment.ts: reject `\0`, reject UNC (`\\` prefix), lexical isWithin sau path.resolve, **realpathSync follow-symlink-within** — và viết unit test cho từng vector (\0, UNC, `..`, symlink-out, case-insensitivity Windows) trong code-extract.test.ts (hiện T5 chỉ ghi "containment re-check" chung chung).
2. Chấp nhận chỉ absolute path HOẶC chỉ relative path (chọn 1, reject loại kia) để giảm surface; cân nhắc reject path chứa `..` hoàn toàn.

---

### SEC-360-05 — LIKE wildcard injection trong QueryLayer.findSymbols (pre-existing)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP** | A03 Injection (CWE-89 — biến thể wildcard injection, KHÔNG phải SQL injection) |
| **Location** | backend/src/engine/query/query-layer.ts L179 (name + "%"), L216 (listModulesWithPatterns) |
| **Status** | Open (pre-existing shipped code — KHÔNG thuộc code mới của SA4E-360) |

**Mô tả:** findSymbols parametrize đúng (`?` placeholder — không SQL injection) nhưng **không escape % / _** trong `name` trước khi ghép `LIKE 'name%'` — trong khi repo ĐÃ có sẵn `sanitizeLikeQuery` (L258) làm đúng việc này nhưng không được dùng ở 2 điểm trên. Kết quả: caller MCP có thể truyền name = "%" → LIKE '%%' quét toàn bảng symbols (trong LIMIT 50) — enumeration/mega-scan nhẹ. QueryLayer đã có sanitizeLikeQuery và sanitizeFtsQuery — đây là lỗ hổng nhất quán (cơ chế có sẵn nhưng chưa áp dụng), không phải thiếu cơ chế.

**Attack vector:** MCP caller → code_symbols `{ name: "%" }` → listing toàn bộ symbols + file paths (tenant-scoped). Ảnh hưởng thấp (loopback, dữ liệu đã trong boundary).

**Mitigations đã có:**

- ✅ Parameterized query (không SQL injection).
- ✅ Tenant scope `__projectId`.
- ✅ LIMIT enforced (default 50; locateSymbol mới design LIMIT 25).

**Khuyến nghị bổ sung:** Áp dụng sanitizeLikeQuery cho findSymbols/listModulesWithPatterns (1 dòng mỗi chỗ). ĐIỂM TỐT: thiết kế locateSymbol mới (TDD §4.2) dùng **equality** (`s.name = @method`) — không có vector này ở tool mới. Không phải blocker cho SA4E-360; khuyến nghị fix kèm task T3 vì cùng file.

---

### SEC-360-06 — read_method slice thiếu hard size cap (dòng/byte)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP** | A04 Insecure Design (CWE-770) |
| **Location** | TDD §4.5, §7.2; FSD §6.2 pseudocode |
| **Status** | Open (design-level) |

**Mô tả:** EF-4 kiểm tra `endLine ≤ lineCount` từ index — chống slice sai/stale tốt, nhưng KHÔNG cap kích thước slice. Symbol hợp lệ nhưng spanning cả file khổng lồ (endLine ≈ lineCount = 200k dòng) → đọc ~vài chục MB vào extension host trước khi gate #3/compaction xử lý và MAX_TOOL_RESULT_CHARS (16k, verified pi-event-mapper.ts L29) cắt phần hiển thị. Bộ nhớ transient + churn compaction không cần thiết.

**Mitigations đã có:**

- ✅ Bounds check từ index TRƯỚC khi đọc file (không đọc-first) — thiết kế đúng (EF-4).
- ✅ Path containment trên mọi path index-derived.
- ✅ Gate #3 + atomic tool-unit compaction absorb tool result; MAX_TOOL_RESULT_CHARS 16k cắt text hiển thị.
- ✅ TurnBudgetGuard bound lặp 4× identical.

**Khuyến nghị bổ sung:** Thêm MAX_SLICE_LINES (ví dụ 2,000 dòng) / MAX_SLICE_BYTES (256KB) trong read-method-tool: vượt → trả envelope `ok` truncated kèm note `"sliceTruncated": true, "totalLines": N` — không đọc quá cap. 1 const + 1 check — đúng phong cách MAX_READ_BYTES/SEC-325-D3.

---

### SEC-360-07 — Prompt-injection surface qua code-derived text trong system context

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP** | A04 / LLM01 (Prompt Injection) |
| **Location** | skeleton render + RAW_HEAD path |
| **Status** | Open (acknowledged risk) |

**Mô tả:** Skeleton (kind/name/signature) và RAW_HEAD là **nội dung file do workspace kiểm soát**, được inject vào system context. Signature/comment mang payload kiểu "IGNORE PREVIOUS INSTRUCTIONS..." về mặt kỹ thuật là injection surface. Trong threat model hiện tại (reviewer LLM đọc chính workspace, user single local) rủi ro chấp nhận được — LLM vốn đọc được source qua read/grep. Ghi nhận để có awareness + defense-in-depth.

**Khuyến nghị:** strip control characters/zero-width (U+200B, U+202E RTL override, \x00-\x08) trong trimSignature và trimToTokenBudget; ghi nhận risk trong UG. Không bắt buộc.

---

### SEC-360-08 — Điểm mạnh confirmed (Informational — Positive Findings)

| # | Control đã verified trong code | Ghi chú |
|---|-------------------------------|---------|
| 1 | Path containment SEC-325-D1: reject \0 (L20), reject UNC (L46-48), lexical isWithin (L51-53), realpath symlink-follow-within (L56-64) | read_method slice read design đúng cơ chế này |
| 2 | Loopback-only fail-closed: validateLoopbackWrapperUrl (L171-186) — malformed/remote/non-HTTP reject; re-validate lúc HttpMcpCaller construction (L209) | SSRF surface = none |
| 3 | X-Session-Nonce (crypto.randomUUID, L192) + 5s AbortSignal.timeout trên mọi wrapper call | SEC-325-D2 shipped |
| 4 | Query cap fail-closed MAX_QUERY_CHARS 4096 → RetrievalValidationError (L159-163) | anti-oversized-query |
| 5 | ReDoS C2: MAX_LINE_LENGTH 8192 blanking trước matchAll (signature-extractor L40-51) + estimateEndLine scan ≤ 200 dòng | UC-360-04 an toàn regex |
| 6 | 1MB read cap stat-first (MAX_READ_BYTES L12, FsContentReader L17-26) | SEC-325-D3 — multi-GB/hostile file không vào extension host |
| 7 | .env không được index (detectLanguage null → file-watcher skip) — verified | skeleton corpus không chứa .env |
| 8 | Gate #2/#3 UNTOUCHED — SA4E-360 chỉ supply measured content; REJECT fail-safe BR-09; provider never called oversized | SA4E-355 TDD §13 constraint tôn trọng |
| 9 | Telemetry counts-only (PI_SKELETON_* / PI_READ_METHOD_RESULT payload shapes TDD §11) — không code bodies vào logs | A09 OK |
| 10 | Không thêm dependency mới: zod/typebox/tree-sitter/web-tree-sitter đã có sẵn (verified EXT + BE package.json) | BR-11/INV-4 compliance |
| 11 | Multi-session isolation: layoutCache + hosts Map + skeleton cache đều key = workspaceRoot (verified L20/L62 + design §5.6) | OI-3 an toàn by construction |
| 12 | SQL parameterized toàn bộ QueryLayer; locateSymbol design dùng equality + named params; không có exec/command mới | A03 clean cho code mới |

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | SEC-360-01 secret redaction (redactSecretLike + secret-file exclusion) | Low | Chống sao chép secret vào LLM context/session file |
| 2 | SEC-360-02 global incremental token budget + O(parts) truncator | Medium | Đảm bảo ≤ 2 s p95, tránh treo session assembly trên workspace lớn |
| 3 | SEC-360-06 MAX_SLICE cap cho read_method | Low | Tránh transient memory spike + compaction churn |
| 4 | SEC-360-03 rate limit /mcp + reindex cooldown | Low | Hardening local trust boundary |
| 5 | SEC-360-04 backend containment twin test vectors bắt buộc | Low | Đảm bảo defense-in-depth thực chất |
| 6 | SEC-360-05 sanitizeLikeQuery cho findSymbols (kèm T3) | Low | Consistency, chống wildcard enumeration |
| 7 | SEC-360-07 control-char strip | Low | Defense-in-depth prompt injection |

## Recommendations Summary

### Immediate (trước khi DEV hoàn thành T5/T6 — đưa vào task checklist §12)

1. SEC-360-01: redactSecretLike + secret-file name exclusion — thêm task con vào T6 (skeleton-provider) hoặc T1 (types + helper).
2. SEC-360-02: đổi per-file maxTokens thành remaining-global-budget + incremental accounting trong truncator (T1).

### Short-term (trong scope ticket)

3. SEC-360-06: MAX_SLICE cap (T4).
4. SEC-360-04: chỉ định rõ 4 test vectors containment backend (T5).
5. STP bổ sung: test secret-in-source → [REDACTED]; test 200-file RAW_HEAD wall-clock; test multi-root cache isolation đã có trong T8 ✅.

### Long-term (hardening sau ticket)

6. SEC-360-03: rate limit /mcp + reindex cooldown + mặc định CODE_INTEL_API_KEY ở build shipped.
7. SEC-360-05: sanitizeLikeQuery ở findSymbols/listModulesWithPatterns.
8. SEC-360-07: control-char strip + ghi risk prompt-injection vào UG.

---

## Verdict

# ✅ PASS WITH NOTES

- 0 Critical / 0 High — không có finding nào chặn triển khai.
- 2 Medium (SEC-360-01, SEC-360-02) — đều có mitigation cốt lõi trong design (fail-safe, terminate, bounded reads) nhưng cần bổ sung trong lúc implement; khuyến nghị đưa remediation vào task checklist TDD §12 (T1/T4/T5/T6) thay vì trì hoãn sang ticket khác.
- Nền tảng kế thừa (SEC-325-D1/D2/D3/D4 + SA4E-355 3-gate) được thiết kế tham chiếu đúng và đã verify tồn tại trong code — wire-only compliance tốt về mặt security.
- Lưu ý phạm vi: đây là DESIGN review (static) — code SA4E-360 chưa implement; các finding design-level cần re-verify ở Phase 5.7 (Security Code Review) sau khi DEV hoàn thành, đặc biệt: backend containment twin, redaction pass, MAX_SLICE cap, session-file persistence của skeleton.

---

*Security Agent — 2026-10-14. Static design review; no dynamic testing performed. All file:line citations verified against workspace codebase at review time.*
