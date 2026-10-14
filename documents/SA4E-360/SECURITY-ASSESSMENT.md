# 🔒 Security Assessment Report — SA4E-360 (Phase 5.7 Security Code Review)

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-360 — Multi-Resolution Context Supply — P1: Code Skeletonization + Agentic Context Loading |
| Review target | Implementation commits **5225170..1b822b0** (Wave 1-3 + TA-condition fixes + 1.53.0 bump) |
| Baseline docs | TDD v1.1, FSD v1.2, SECURITY-REVIEW.md v1.0 (SEC-360-01..08, design verdict PASS WITH NOTES) |
| Governance baseline | SA4E-355 TDD §13 (3-gate UNTOUCHED), SEC-325-D1..D4 |
| Review type | Security code review (static) — verify implementation vs design + bypass hunt |
| Date | 2026-10-14 |
| Assessor | Security Agent |
| Version | 1.0 |
| Status | Final |

---

## Executive Summary

Implementation SA4E-360 đã remediate đúng 2 yêu cầu MANDATORY của design review ở **đường chính**: (1) `renderCorpusWithGlobalBudget` áp dụng global incremental budget (cap − measuredSoFar), truncator đo tăng dần O(parts) với hard cap 500 drops → REJECT fail-safe; (2) redaction + control-char strip được áp dụng TRƯỚC trim ở signature line và RAW_HEAD, kèm secret-file name exclusion ở corpus walk. Containment twin backend port đủ 4 lớp (null-byte → UNC → lexical → realpath), `locateSymbol` parameterized + equality + LIMIT clamp [1,100], `sanitizeLikeQuery` đã được áp dụng cho findSymbols/listModulesWithPatterns (SEC-360-05 fixed), MAX_SLICE_LINES/MAX_SLICE_BYTES streaming cap shipped, reindex cooldown 30s shipped, touch-only hash refresh (D3) shipped. Git diff xác nhận **không file governed nào bị đụng** (session-budget-gate, turn-budget-guard, intra-turn, path-containment, prompt-compressor, token-counter, pi-event-mapper) — wire-only compliance giữ nguyên.

Tuy nhiên, bypass hunt tìm thấy **1 lỗ hổng redaction thực tế**: rung **REGEX_SIGNATURES của fallback ladder đi qua candidates từ backend KHÔNG qua `sanitizeCandidate`** — signature line do backend `code_extract_signatures` trả về (vd `const API_KEY = "sk-live-..."` trong file grammar-less) render thẳng vào skeleton mà không redact. Đây là vi phạm chính invariant mà chính module secret-redaction.ts tự tuyên bố, và là một phần chưa hoàn tất của remediation SEC-360-01 (MANDATORY). Bên cạnh đó: deny-list còn thiếu nhiều họ secret phổ biến (JWT, connection-string credentials, Stripe/GitLab/npm/Google tokens...), 1 bug misalignment tham số SQL trong `listClassMethods` (AF-4 enrichment luôn rỗng — silent), và vài gap hardening mức Low.

**Overall Risk Rating: MEDIUM (chấp nhận được — không chặn Phase 6, khuyến nghị fix F-1 đầu Phase 6)**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 |
| 🔵 Low | 4 |
| ℹ️ Informational | 3 |

## Verdict

# ✅ APPROVED WITH FINDINGS

- **KHÔNG block Phase 6.** 0 Critical / 0 High; 2 Medium đều có fix nhanh (F-1 ≈ 1 dòng + 1 test; F-2 mở rộng deny-list).
- **F-1 (Medium) nên fix trong Phase 6** trước UAT: SEC-360-01 là remediation MANDATORY theo design review — đường REGEX fallback chưa hoàn tất nghĩa là yêu cầu mandatory chỉ mới đạt ~2/3 vector (grammar ✓, RAW_HEAD ✓, REGEX ✗).
- Nền tảng kế thừa (3-gate, PathResolver, OriginGate, containment, budget gate) **verified untouched và hoạt động đúng** qua git diff + đọc code.---

## Findings Summary

| # | Severity | File:line | Description | Remediation | Owner |
|---|----------|-----------|-------------|-------------|-------|
| F-1 | 🟡 Medium | skeleton-fallback.ts:94-99 + symbol-outline-extractor.ts:35-48 + backend code-extract.ts:125-128 | Rung REGEX_SIGNATURES của fallback ladder render signature từ backend KHÔNG qua redaction — secret trong file grammar-less đi thẳng vào system context/session file | Map candidates qua sanitizeCandidate trước extractOutline, hoặc redact tại sink extractOutline (+ test secret qua extractSignatures) | DEV |
| F-2 | 🟡 Medium | secret-redaction.ts:21-28 | Deny-list thiếu nhiều họ secret phổ biến: JWT, connection-string credentials, Stripe sk_live_, github_pat_, glpat_, npm_, AIza, AWS secret key/session token, AccountKey=, pwd=; không entropy-based | Mở rộng deny-list; cân nhắc entropy heuristics | DEV |
| F-3 | 🔵 Low | backend/src/engine/query/query-layer.ts:298-300 | listClassMethods misalignment tham số SQL sau subScope fix — khi projectId defined, s.project_id bị bind cls → AF-4 enrichment luôn rỗng (silent) | Sửa params thành [...scope.params, cls, cls, ...subScope.params, bounded] | DEV |
| F-4 | 🔵 Low | query-layer.ts:185,194-195 (pre-existing) | findSymbols LIMIT không clamp — limit=-1 → SQLite vô hạn; mới liên quan vì corpus flow 53-bucket | Clamp [1,1000] tại handler/findSymbols | DEV |
| F-5 | 🔵 Low | code-extract.ts:72-80 + backend/tests | SEC-360-04: resolveSymlinkWithin implemented nhưng KHÔNG có test vector symlink-out (BV-03..06 only); TOCTOU missing-file → read follow-symlink | Thêm vector symlink-out vào e2e/unit test | QA/DEV |
| F-6 | 🔵 Low | index-freshness-checker.ts:183-189 | defaultHash readFileSync không size cap — file multi-GB đổi mtime → whole-file vào memory khi hash-confirm | Guard MAX_READ_BYTES / skip hash khi oversize | DEV |
| F-7 | ℹ️ Info | skeleton-fallback.ts:96-110 | Rung REGEX/RAW_HEAD thiếu guard tokens > remaining sau khi cộng header — measuredSoFar có thể vượt cap ≤ ~10 tokens | Thêm check tokens > remaining trước consume | DEV |
| F-8 | ℹ️ Info | skeleton-fallback.ts:92,101 + skeleton-provider.ts:162 | readHead/fingerprint/checkFile dùng path.join trực tiếp, không wrap resolveContainedPath (defense-in-depth; input walk/index-derived) | Wrap resolveContainedPath cho parity | DEV |
| F-9 | ℹ️ Info | skeleton-provider.ts:157-170 + skeleton-renderer.ts:64-73 | Fingerprint mtime-based (touch -t spoof → stale skeleton, self-inflicted); sanitizeRawHead trim loop O(lines^2) bounded 120 dòng | Ghi nhận; cân nhắc size-check | DEV |

---

## Verification Matrix — SEC-360-01..08

| ID | Yêu cầu design | Kết quả | Evidence |
|----|---------------|---------|----------|
| SEC-360-01 | Secret redaction (MANDATORY) | ⚠️ PARTIAL | ✅ Grammar path: sanitizeCandidate (skeleton-renderer.ts:43-50,93) redact trước trimSignature (UT-32 ✓). ✅ RAW_HEAD: sanitizeRawHead (skeleton-renderer.ts:64-73) sanitize TRƯỚC line-trim — không partial secret ở biên trim (UT-33 ✓). ✅ docComment bị drop (vector 3). ✅ Secret-file exclusion: isSecretFileName filter ở corpus walk (skeleton-provider.ts:88 — .env*, *.pem, *.key, id_rsa*, credentials*, *secret*; UT-31 ✓). ❌ REGEX fallback rung KHÔNG redact → F-1. ⚠️ Deny-list còn thiếu họ phổ biến → F-2 |
| SEC-360-02 | Global budget + O(parts) truncator (MANDATORY) | ✅ PASS | renderCorpusWithGlobalBudget: remaining = cap − measuredSoFar, self-skip khi đầy (skeleton-renderer.ts:88-99). Truncator: partTokens đo 1 lần/part, total −= partTokens[victim] — O(parts) (skeleton-truncator.ts:100-109); MAX_TRUNCATION_DROPS=500 → vượt → REJECT (BR-360-02 fail-safe); decide() re-measure authoritative, REJECT nếu vẫn > cap (L127-138) → không thể gian lận ngân sách. Cap = floor(0.70 × staticBudget) resolver-authoritative (skeleton-provider.ts:32-34). Minor: F-7 overshoot nhỏ |
| SEC-360-03 | Reindex cooldown (+ rate limit /mcp long-term) | ✅ PASS (ticket-scope) | REINDEX_COOLDOWN_MS = 30_000 — chỉ 1 delegate/cooldown window (index-freshness-checker.ts:19-20,135-140; UT-10 ✓). Rate limit /mcp: chưa làm — pre-existing surface, design xếp long-term, ngoài scope ticket — giữ khuyến nghị |
| SEC-360-04 | Backend containment twin 4 lớp | ✅ PASS WITH GAP | resolveContainedFile (code-extract.ts:61-69): null-byte → UNC (\\, //) → lexical isWithin sau path.resolve → resolveSymlinkWithin (realpathSync follow-within; missing-file → lexical pass). 1MB stat-first cap + ≤50/batch + fail-soft skipped[]. E2E vectors: absolute-outside, null-byte, UNC, dotdot ✓ (sa4e-360-tools.e2e.test.ts:113-130). ❌ Thiếu test symlink-out → F-5. Parity với extension path-containment.ts: 4/4 lớp tương đương |
| SEC-360-05 | sanitizeLikeQuery cho LIKE paths | ✅ PASS (fixed) | query-layer.ts:190-192 findSymbols dùng sanitizeLikeQuery(name) + ESCAPE; listModulesWithPatterns L228-230 tương tự. locateSymbol dùng equality (s.name = ?) — không vector LIKE. E2E BV-11/12 verified (% literal, không wildcard escalation) |
| SEC-360-06 | MAX_SLICE cap cho read_method | ✅ PASS (fixed) | read-method-tool.ts:27-28 MAX_SLICE_LINES=2000 / MAX_SLICE_BYTES=256KB; readSliceLines stream readline + break khi vượt cap (L188-210) — KHÔNG read-then-slice. Bounds check từ index TRƯỚC khi đọc: hasCorruptBounds (L53-55) → staleRetry recovery — EF-4 ✓. resolveContainedPath trước slice (L156-159) |
| SEC-360-07 | Control-char strip | ✅ PASS (fixed) | stripControlChars (secret-redaction.ts:31,47-50): U+0000-0008, U+000B/C, U+000E-001F, U+007F, U+200B-200F, U+202A-202E, U+2060, U+FEFF. sanitizeCodeText = redact(strip(text)) — strip TRƯỚC redact (L54-56). UT-34 ✓ |
| SEC-360-08 | Positive controls | ✅ PASS | 10/10 controls giữ nguyên — xem Regression Verification |

---

## Bypass Hunt — Kết quả chi tiết

### 1. Redaction bypass hunt (skeleton có leak secret qua đường nào không?)

Có 3 đường payload vào skeleton:
| Đường | Trạng thái redaction | Evidence |
|-------|---------------------|----------|
| ① Grammar (tree-sitter) | ✅ REDACTED | candidates qua sanitizeCandidate (name + signature sanitize, docComment=undefined) trước extractOutline (skeleton-renderer.ts:93) |
| ② RAW_HEAD | ✅ REDACTED | readHead ≤120 dòng → sanitizeRawHead sanitize toàn bộ head TRƯỚC line-trim → không thể tái tạo secret từ đoạn cắt (skeleton-fallback.ts:101-104) |
| ③ REGEX fallback | ❌ KHÔNG redact — F-1 | parseSearchText bắt dòng Sig: → candidate.signature.slice(200) KHÔNG sanitize (search-provider.ts:66-70) → ladderForOne truyền thẳng vào extractOutline (skeleton-fallback.ts:94-95) → extractOutline chỉ trimSignature (whitespace + 120 chars), không redact (symbol-outline-extractor.ts:38-40). Backend cũng không redact (code-extract.ts:126 Sig echo) |

Attack chain F-1: file grammar-less (detectLanguage=null → fallback, vd .svelte/.hbs/.tpl) chứa 'const API_KEY = "sk-live-abcdefgh1234567890"' → backend regex extractor bắt kind=constant với Sig là full dòng → parseSearchText → extractOutline render dòng '[constant] API_KEY export const API_KEY = "sk-live-..."' → skeleton → gate #2 → system context LLM + session file persist. STC SEC-I đã test đúng vector này cho đường GRAMMAR — nhưng không test nào assert redaction trên extractSignatures path (grep toàn bộ skeleton __tests__: không có).

Redact-before-trim order: verified ĐÚNG ở cả 2 nơi có sanitize — sanitizeSignatureLine: trimSignature(sanitizeCodeText(signature)) (renderer L54-58); sanitizeRawHead: sanitize trước pop-loop (renderer L69-71). Trim không thể tái tạo secret từ đoạn đã cắt. ✅

**Deny-list gap analysis (F-2)** — các mẫu vẫn rò rỉ qua cả 3 đường:
| Secret family | Mẫu | Match deny-list? |
|---------------|-----|------------------|
| OpenAI-style sk- | sk-abc... (16+) | ✅ match |
| AWS access key ID | AKIA + 16 | ✅ match |
| GitHub classic | ghp_/gho_ | ✅ match |
| Slack | xoxb-/xoxa-/xoxp- | ✅ match |
| PEM key header | -----BEGIN ... PRIVATE KEY----- | ✅ match header (body base64 theo sau KHÔNG redact — nhưng .pem/.key/id_rsa bị loại ở corpus walk; key nhúng trong .ts chỉ leak body) |
| JWT | eyJhbGciOi....ey... | ❌ LEAK |
| AWS secret key (40 chars) | wJalrXUtnFEMI/... | ❌ LEAK |
| Connection string | DATABASE_URL=postgres://admin:p4ssw0rd@db ('password@' không kèm :/= ngay sau keyword) | ❌ LEAK |
| Stripe | sk_live_/rk_live_ (underscore, không khớp sk-) | ❌ LEAK |
| GitHub fine-grained / GitLab / npm | github_pat_/glpat-/npm_ | ❌ LEAK |
| Google API | AIza (35 chars) | ❌ LEAK |
| Azure storage | AccountKey=... ('key' không khớp api[_-]?key) | ❌ LEAK |
| Generic pwd/passphrase | pwd = hunter2hunter2 | ❌ LEAK |

Entropy-based detection: KHÔNG có (deny-list thuần). Chấp nhận được như Phase 1, nhưng cần mở rộng list + cân nhắc entropy heuristic cho string literal high-entropy. Unicode-escape encoding (\\u0073\\u006b-...) không được decode — obscure, ghi nhận Informational.

### 2. Containment twin bypass hunt (backend code-extract)
| Vector | Kết quả | Ghi chú |
|--------|---------|---------|
| Null byte | ✅ reject (L63) | e2e BV-04 ✓ |
| UNC \\\\server, // | ✅ reject (L64) | e2e BV-05 ✓ |
| Lexical ../ absolute-outside | ✅ reject sau path.resolve (L65-67) | e2e BV-03/06 ✓ |
| Symlink out | ✅ reject (realpathSync follow-within L72-80) | ⚠️ KHÔNG có test → F-5 |
| Drive-relative (C:foo) | ✅ an toàn | path.resolve(base, C:foo) → cwd/drive-root ngoài base → lexical reject |
| Case-insensitivity Windows | ✅ fail-closed | case lệch → startsWith miss → REJECT (false-reject, không bypass) |
| TOCTOU missing-file | ⚠️ chấp nhận được | missing → lexical pass (L77); symlink-out tạo giữa check và readFileSync → bị follow. Cần local write access = cùng trust boundary |
| 1MB cap stat-first race | ⚠️ chấp nhận được | tương tự extension FsContentReader (SEC-325-D3 gốc); local-only, thấp |
| Output echo injection | ⚠️ minor | skipped[] echo path thô — newline trong path có thể forge dòng Skip:; parseSearchText chỉ bắt prefix File:/Sig: — impact rất thấp |

Parity extension ↔ backend: 4/4 lớp tương đương. Backend chấp nhận cả relative + absolute (TDD cho phép); extension chỉ gửi corpus-derived relative paths (không phải LLM-supplied) — luồng chính không có path từ LLM. ✅

### 3. Budget accounting integrity (gian lận được không?)

- Module tự báo nhỏ hơn thực tế: KHÔNG thể. measure() bind tập trung = estimateTokenCount (chars/4); extractOutline bound bằng TokenCounter.estimate luôn ≥ chars/4 (headroom remaining−1, skeleton-renderer.ts:91-95) — file render trong remaining không thể đẩy measuredSoFar vượt cap theo authoritative measure.
- O(parts) đo parts không phải bytes: KHÔNG phải vấn đề. Mỗi part đo estimateTokenCount(content) 1 lần (truncator L100) — theo token của content thật.
- 500-drop cap: KHÔNG bypass được. Production createHost không truyền options.maxDrops; vượt cap mà vẫn > cap → decide() → REJECT (L129-137) → gate #2 (REJECT of record) vẫn đo full assembly → fail-safe BR-09.
- REJECT/DEGRADED escalation: đúng. DEGRADED_NO_SKELETON = content rỗng, gateEntries push NOTHING — zero tokens (injector L27-34); REJECT vẫn kèm content → gate #2 quyết định — đúng P-5.
- Minor: F-7 — fallback ladder không guard cuối tokens > remaining (header ~10 tokens); truncator + gate #2 re-measure absorb. Không exploit được.

### 4. SQL injection hunt (locateSymbol / query param)

- locateSymbol: parameterized hoàn toàn (? placeholders, L269-271); equality s.name = ? — không LIKE, không wildcard injection; LIMIT clamp Math.min(Math.max(1, floor(limit)), 100) (L252) → limit=-1/1e9 từ MCP caller bị chặn. ✅
- listClassMethods: LIMIT clamp [1,50] (L286) ✅ nhưng misalignment tham số (F-3): placeholders = [scope?, parent_symbol, subquery-name, subScope?, LIMIT] trong khi params = [cls, ...scope, cls, ...subScope, bounded] → khi projectId defined, s.project_id = ? bị bind cls → trả rỗng. Khi projectId undefined: scope = '1=0' (0 params) → align đúng → vẫn rỗng (fail-closed). Đã kiểm kịch bản cls = projectId-string → vẫn rỗng (parent_symbol/subquery name không match) → KHÔNG leak, chỉ silent functional bug của AF-4 enrichment.
- findSymbols (pre-existing): LIMIT không clamp → F-4 (SQLite LIMIT -1 = unbounded).
- Không có exec/command/dynamic SQL concat mới trong diff. ✅

### 5. Wire/inject path hunt (3-gate + budget resolver + stale skeleton)

- Inject path: sections build BETWEEN budget resolution và gate #2 (pi-agent-session-host.ts diff); skeleton + map vào gate #2 qua loadFiles entries RAW (gate tự compress khi escalate); agentsFileOverride append virtual files SAU applyCompressedAgentsFiles với CÙNG measured strings — INV-2 measure==inject ✓; sections rỗng → identity passthrough byte-for-byte (injector L49). ✅
- 3-gate SA4E-355: git diff 5225170..1b822b0 KHÔNG chứa session-budget-gate / turn-budget-guard / intra-turn-budget-gate / transcript-compaction / prompt-compressor / token-counter / pi-event-mapper. pi-workflow-gate.ts chỉ thêm 'read_method' vào READ_ONLY_TOOLS + comment (delta ⑥ theo thiết kế). TurnBudgetGuard (4× identical) áp dụng generic cho read_method. ✅
- Budget resolver: skeletonCap = floor(0.70 × staticBudget) — resolver-authoritative, không hardcode. ✅
- contentHash D3 (touch-only): checkFile — mtime đổi → hash-confirm với files.content_hash; hash khớp → refresh baseline, FRESH, không reindex (index-freshness-checker.ts:83-89) → touch-only không gây reindex-burst ✓. Stale skeleton risk: fingerprint cache dùng mtime (skeleton-provider.ts:157-170) — file đổi content giữ mtime (touch -t) → cached skeleton stale; self-inflicted/local-only → Informational (F-9).
- Hardening note: staleRetry gọi locator.reindex() trực tiếp KHÔNG qua cooldown window của checker — TurnBudgetGuard bound identical calls 4× + backend checksum-skip reindex rẻ nếu unchanged → chấp nhận được; cân nhắc route qua cooldown ở hardening sau.

### 6. MAX_SLICE enforcement

- bounds-BEFORE-read ✓ (EF-4 — hasCorruptBounds từ index data trước mọi fs call).
- Streaming cap ✓ — readline break tại MAX_SLICE_LINES/MAX_SLICE_BYTES; không read-then-slice; finally destroy stream.
- Edge startLine NaN/negative: bytes cap vẫn chặn 256KB; envelope sliceTruncated + totalLines. ✅

### 7. read_method read-only verification

- Code path: locate (MCP read) → resolveContainedPath → createReadStream → envelope. KHÔNG có fs.write/unlink/rename trong read-method-tool.ts. READ_ONLY_TOOLS + read_method HỢP LỆ. ✅
- Loadout: 'read_method' thêm vào getSessionToolLoadout + customTools registration — tên khớp READ_METHOD_TOOL_NAME. ✅

### 8. Information disclosure

- ambiguous envelope: candidates {name, kind, filePath, startLine} — index-scoped, tương đương code_symbols tool. ✅
- error envelopes: filePath + IO message ≤120 chars — workspace-scoped. ✅
- Telemetry: PI_READ_METHOD_RESULT {status, durationMs, sliceLines}; PI_SKELETON_* chỉ counts/paths/modes — KHÔNG code bodies (verified read-method-tool.ts:234-245, skeleton-provider.ts:172-185, skeleton-fallback.ts:97/109/119, truncator L146-151). ✅
- PI_GATE_DECISION enriched: decisions/tokens/percentages — no content. ✅

---

## Regression Verification (SA4E-355 / 356 / 358)
| Khu vực | Files governed | Trong diff 5225170..1b822b0? | Kết luận |
|---------|---------------|------------------------------|----------|
| SA4E-355 3-gate | session-budget-gate, turn-budget-guard, intra-turn-budget-gate, transcript-compaction, prompt-compressor | ❌ Không | UNTOUCHED ✅ |
| SA4E-356 PathResolver/containment | path-containment.ts, file-exclusion-filter.ts | ❌ Không | UNTOUCHED ✅ (read-method-tool chỉ CONSUME resolveContainedPath) |
| SA4E-358 OriginGate | backend/src/server/*, origin validation | ❌ Không | UNTOUCHED ✅ |
| pi-workflow-gate.ts | READ_ONLY_TOOLS | ✅ Chỉ +1 entry read_method + comment | Intended delta, gate logic nguyên vẹn ✅ |
| pi-event-mapper.ts | MAX_TOOL_RESULT_CHARS 16k | ❌ Không | read_method result vẫn bị cap hiển thị ✅ |
| Dependencies | extension/package.json | ✅ 1.52.0 → 1.53.0, 0 deps mới | BR-11 ✓ |
| Backend QueryLayer | query-layer.ts | ✅ subScope alias fix ('sub'→'symbols') + listClassMethods params | Fix thực chất; F-3 phát hiện ở listClassMethods |---

## Detailed Findings

### F-1 — REGEX_SIGNATURES fallback rung bypass secret redaction

| Attribute | Value |
|-----------|-------|
| Severity | 🟡 Medium |
| OWASP | A04 Insecure Design (CWE-200 Information Exposure) |
| Location | skeleton-fallback.ts:94-99; symbol-outline-extractor.ts:35-48; backend code-extract.ts:125-128 |
| Status | Open |

Description: SEC-360-01 là remediation MANDATORY. DEV đã redact đường grammar (sanitizeCandidate) và RAW_HEAD (sanitizeRawHead), nhưng rung REGEX_SIGNATURES của fallback ladder truyền candidates trả về từ code_extract_signatures (qua parseSearchText) thẳng vào SymbolOutlineExtractor.extractOutline — hàm này chỉ trimSignature, không redact. Backend cũng không redact (thiết kế: extension là redaction owner). Kết quả: invariant của chính secret-redaction.ts ('Every string that enters system context from code-derived text passes through redactSecretLike BEFORE signature trimming') bị vi phạm trên đường này. Secret trong khai báo constant/variable của file grammar-less (Svelte/template/...) đi vào system context + session file persist.

Evidence:

```typescript
// skeleton-fallback.ts L94-99 — candidates TỪ BACKEND, không qua sanitizeCandidate
if (candidates.length > 0) {
  const outline = deps.extractor.extractOutline(entry.relativePath, candidates, remainingBudget());
  // extractOutline: `${symbol.kind} ${symbol.name} ${trimSignature(symbol.signature)}` — KHÔNG redact
```

So sánh: đường grammar ở skeleton-renderer.ts L93 map qua sanitizeCandidate trước khi renderFile. Không test nào che phủ đường fallback này (UT-13 chỉ assert fallbackMode telemetry).

Impact: sao chép secret từ source vào LLM system context + session transcript + session file trên disk với vòng đời dài hơn source gốc. Scope: chỉ file grammar-less có backend regex patterns match — hẹp hơn SEC-360-01 gốc nhưng thực tế (Svelte constants, config-like template files).

Remediation:

```typescript
// skeleton-fallback.ts — map qua sanitizeCandidate trước extractOutline (fix tối thiểu)
const outline = deps.extractor.extractOutline(
  entry.relativePath,
  candidates.map(sanitizeCandidate), // import từ skeleton-renderer.js
  remainingBudget()
);
// Defense-in-depth tốt hơn: redact tại SINK — SymbolOutlineExtractor.extractOutline
// tự gọi sanitizeCodeText trên name/signature trước trimSignature (bao cả corpus path)
```

+ Thêm STC: extractSignatures trả candidate.signature chứa 'sk-live-...' → skeleton phải chứa [REDACTED].

### F-2 — Deny-list secret redaction thiếu nhiều họ phổ biến

| Attribute | Value |
|-----------|-------|
| Severity | 🟡 Medium |
| OWASP | A04 (CWE-200/CWE-312) |
| Location | secret-redaction.ts:21-28 |
| Status | Open |

Description: Deny-list hiện tại (6 patterns) khớp đúng list tối thiểu mà design review đề xuất, nhưng list đề xuất vốn không đầy đủ. Bypass hunt xác nhận JWT, connection-string credentials (DATABASE_URL=postgres://admin:p4ssw0rd@db), Stripe sk_live_/rk_live_ (underscore), github_pat_, glpat_, npm_, AIza, AWS secret access key (40-char, không có prefix AKIA), Azure AccountKey=, pwd=/passphrase= đều KHÔNG match. Không có entropy-based detection.

Remediation:

```typescript
const SECRET_PATTERNS: readonly RegExp[] = [
  // ... hiện có ...
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,          // JWT (3 segment)
  /[a-z][a-z0-9+.-]*:\/\/[^:\/\s]+:[^@\s\/]{6,}@/g,                        // URL userinfo (postgres://user:pass@)
  /(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g,                                // Stripe
  /github_pat_[A-Za-z0-9_]{20,}/g, /glpat-[A-Za-z0-9_-]{15,}/g, /npm_[A-Za-z0-9]{20,}/g,
  /AIza[0-9A-Za-z_-]{35}/g,                                                   // Google
  /(?:pwd|passphrase|accountkey)\s*[:=]\s*(?:"[^"]{8,}"|'[^']{8,}'|[^"'\s]*\d[^"'\s]{7,})/gi,
];
```

Ghi chú: giữ digit-guard cho unquoted; test không over-redact (SEC-L control vẫn pass).

### F-3 — listClassMethods param misalignment (silent empty AF-4)

| Attribute | Value |
|-----------|-------|
| Severity | 🔵 Low (functional — phát hiện trong security review) |
| OWASP | N/A (quality); kiểm tra kỹ không tạo leak |
| Location | query-layer.ts:298-300 (diff 5225170..1b822b0) |
| Status | Open |

Description: Diff đã đổi subScope alias 'sub'→'symbols' và bỏ 1 tham số cls khỏi listClassMethods. Với projectId defined (production luôn inject), placeholders theo thứ tự SQL là [s.project_id, parent_symbol, subquery-name, symbols.project_id, LIMIT] nhưng params là [cls, projectId, cls, projectId, bounded] → s.project_id bị bind cls → WHERE sai → luôn rỗng. Với projectId undefined: scope là '1=0' (0 params) → align đúng nhưng vẫn rỗng (fail-closed). Đã xác nhận không có kịch bản leak (cả hai nhánh đều fail-closed; cls = projectId-string vẫn trả rỗng). Hệ quả thực tế: envelope not_found của read_method không bao giờ có classMethods — steering degraded, và bug này có thể đã bị test che phủ do test chạy với projectId không inject scope params theo đúng layout này.

Remediation:

```typescript
const rows = await this.adapter.allAsync<{ name: string }>(sql, [
  ...scope.params, cls, cls, ...subScope.params, bounded,
]);
```

### F-4 — findSymbols LIMIT không clamp (pre-existing, mới liên quan)

| Attribute | Value |
|-----------|-------|
| Severity | 🔵 Low |
| OWASP | A05/CWE-770 |
| Location | query-layer.ts:185,194-195; code-symbols.ts:17-26 (pre-existing) |
| Status | Open (pre-existing) |

Description: code_symbols nhận limit dạng z.number() không clamp; findSymbols push limit thẳng vào SQL LIMIT. SQLite LIMIT -1 = không giới hạn. Extension corpus fetch dùng limit=200 cố định (an toàn), nhưng MCP caller loopback trực tiếp có thể gọi code_symbols { name: 'A', limit: -1 } → toàn bộ symbols tenant (response text lớn, CPU/IO). Khác locateSymbol (đã clamp [1,100]).

Remediation: clamp tại findSymbols hoặc handler — Math.min(Math.max(1, Math.floor(limit)), 1000).

### F-5 — Thiếu test vector symlink-out cho containment twin (SEC-360-04)

| Attribute | Value |
|-----------|-------|
| Severity | 🔵 Low |
| OWASP | A01 (CWE-22) |
| Location | code-extract.ts:72-80; backend/tests/e2e/sa4e-360-tools.e2e.test.ts:113-130 |
| Status | Open |

Description: resolveSymlinkWithin đã implement đúng (realpathSync follow-within; missing → lexical pass). E2E chỉ cover BV-03..06 (absolute-outside, null-byte, UNC, dotdot) — KHÔNG có test symlink trỏ ra ngoài workspace. Design review yêu cầu rõ 4 test vectors gồm symlink-out. Ngoài ra ghi nhận TOCTOU: file missing lúc check → lexical pass → symlink-out tạo trước readFileSync sẽ bị follow (cần local write access — cùng trust boundary, chấp nhận được nhưng cần test chốt hành vi).

Remediation: thêm e2e/unit case — tạo symlink trong workspace trỏ ra ngoài → expect skipped[] với reason containment; document TOCTOU trong TSDoc.

### F-6 — defaultHash đọc whole-file không cap

| Attribute | Value |
|-----------|-------|
| Severity | 🔵 Low |
| OWASP | A04 (CWE-400) |
| Location | index-freshness-checker.ts:183-189 |
| Status | Open |

Description: hash-confirm chạy khi mtime đổi — defaultHash dùng fs.readFileSync toàn file không size cap. File multi-GB (hostile/lớn) đổi mtime → whole-file vào memory extension host. MAX_READ_BYTES (1MB, SEC-325-D3) không được áp dụng ở đây.

Remediation:

```typescript
function defaultHash(absolutePath: string): string | undefined {
  try {
    const st = fs.statSync(absolutePath);
    if (st.size > MAX_READ_BYTES) return undefined; // oversized → STALE path, không hash
    return crypto.createHash('sha256').update(fs.readFileSync(absolutePath)).digest('hex');
  } catch { return undefined; }
}
```

### F-7/F-8/F-9 — Informational

- F-7: fallback ladder (skeleton-fallback.ts L96-99, L108-110) thiếu guard cuối tokens > remaining sau khi cộng dòng header (~≤10 tokens overshoot); skeleton-renderer có guard (L95) còn ladder không — truncator + gate #2 re-measure absorb, không exploit được. Fix: 1 check trước consume.
- F-8: readHead (skeleton-fallback.ts L92,101), fingerprint (skeleton-provider.ts L162), checkFile (index-freshness-checker.ts L57,74) dùng path.join trực tiếp — input là walk/index-derived nên KHÔNG phải bypass thực tế; wrap resolveContainedPath để đạt parity defense-in-depth với read-method-tool.
- F-9: fingerprint cache mtime-based — touch -t (giữ mtime, đổi content) → stale skeleton; self-inflicted/local-only. sanitizeRawHead pop-loop O(lines²) bounded 120 dòng — chấp nhận được.

---

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | F-1 redaction trên REGEX fallback rung (+ test) | Low (~1 dòng + 1 STC) | Đóng vector leak cuối của SEC-360-01 (MANDATORY) |
| 2 | F-2 mở rộng deny-list (JWT, URL-credentials, Stripe/GitLab/npm/Google, pwd/accountkey) | Low | Giảm diện tích secret rò rỉ đã biết |
| 3 | F-3 listClassMethods params + test có projectId | Low | AF-4 enrichment hoạt động lại |
| 4 | F-5 test symlink-out containment | Low | Chốt SEC-360-04 theo design |
| 5 | F-6 hash size cap | Low | Tránh memory spike |
| 6 | F-4 clamp findSymbols limit | Low | Hardening /mcp surface |
| 7 | F-7/F-8 guard + containment wrap | Low | Defense-in-depth |

## Recommendations Summary

### Immediate (đầu Phase 6 — trước UAT)
1. F-1: map sanitizeCandidate trong ladderForOne (hoặc redact tại sink extractOutline) + STC secret-qua-fallback.
2. F-3: sửa params listClassMethods + regression test với __projectId defined.

### Short-term (trong Phase 6)
3. F-2: mở rộng SECRET_PATTERNS theo snippet; chạy lại SEC-L (no over-redaction) + PBT-09.
4. F-5: thêm vector symlink-out; F-6: hash size cap.

### Long-term (hardening sau ticket)
5. F-4: clamp findSymbols limit; rate limit /mcp (SEC-360-03) vẫn còn mở từ design review.
6. F-7/F-8: guard tokens>remaining trong ladder; wrap resolveContainedPath cho readHead/fingerprint/checkFile.
7. Route staleRetry reindex qua cooldown window; cân nhắc entropy-based secret heuristic; document prompt-injection risk (SEC-360-07) vào UG.

---

## Appendix

### A. Methodology
- Static code review toàn bộ 10 skeleton modules + 2 backend tools mới + wiring diff.
- Git range analysis 5225170..1b822b0 (30 files) đối chiếu governed-file allowlist.
- Bypass hunt theo 8 trục: redaction completeness, containment twin, budget integrity, SQLi, inject path, MAX_SLICE, read-only verification, info disclosure.
- Đối chiếu testdata (secret-redaction-testdata.csv SEC-A..L) và e2e coverage (BV-03..08, BV-11/12).

### B. Scope Limitations
- Không dynamic testing / penetration test / exploit thực thi (static only).
- Không review runtime行为 của pi-agent-core session persistence (agentsFile override persist vào session file — xác nhận qua code path, không test động).
- Không audit backend HttpServer auth/rate-limit (pre-existing, đã cover ở SA4E-358 assessment).
- TOCTOU/race conditions chỉ phân tích lý thuyết, không đo window thực tế.

### C. Glossary
- **CVSS/CWE/OWASP**: tiêu chuẩn phân loại lỗ hổng (xem SECURITY-REVIEW.md).
- **Rung/REGEX_SIGNATURES/RAW_HEAD**: degradation ladder cho file grammar-less (TDD §6.3).
- **3-gate**: SA4E-355 turn-start gate #2 + intra-turn gate + TurnBudgetGuard claim.

---

*Security Agent — 2026-10-14. Phase 5.7 Security Code Review; static analysis of commits 5225170..1b822b0; no dynamic testing performed. Mọi file:line đã verify trực tiếp trong workspace tại thời điểm review.*