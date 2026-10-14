# User Guide (UG)

## SA4E-360 — Multi-Resolution Context Supply: Code Skeletonization + Agentic Context Loading

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-360 |
| Title | Multi-Resolution Context Supply for Pi Harness — P1: Code Skeletonization + Agentic Context Loading |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-14 |
| Status | Draft |
| Related BRD | documents/SA4E-360/BRD.md (v1.1) |
| Related FSD | documents/SA4E-360/FSD.md (v1.2 — TA-enriched, DISC-1..7) |
| Related TDD | documents/SA4E-360/TDD.md (v1.1) |
| Related STC | documents/SA4E-360/STC.md (v1.0 — 65/78 executed PASS) |
| Related Security | documents/SA4E-360/SECURITY-REVIEW.md (v1.0 — SEC-360-01..07) |
| Format reference | documents/SA4E-356/UG.md (v1.1) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-14 | DEV Agent | Initial document — Context Supply Rules (§2), config + hardcoded limits (§3), usage examples (§4), limits & errors (§5), troubleshooting (§6), FAQ (§7), behavior changes (§8); mọi claim verified từ source code Wave 1-3 + STC executed behaviors |

---

## 1. Introduction

### 1.1 Purpose

Guide này mô tả **cách hoạt động và cách dùng đúng** cơ chế multi-resolution context supply của Pi harness sau SA4E-360. Trước ticket này, agent review workspace phải đọc code theo **toàn file** (`read` cả file) — tốn token, dễ vỡ context budget, và không có cái nhìn tổng quan toàn workspace khi budget thấp.

Sau SA4E-360, chat path được cung cấp context theo **nhiều mức độ chi tiết (multi-resolution)**:

1. **Skeleton** — outline toàn workspace (chỉ `kind/name/signature`, không có body) được build một lần khi session assembly và inject vào system context trong giới hạn `floor(0.70 × staticBudget)` tokens.
2. **Functional map** — bản đồ module (SummaryTree, ≤ 1,500 tokens) đi kèm `get_workspace_info`.
3. **read_method** — khi cần code thật, agent đọc **đúng theo symbol** (class + method → line-range slice) thay vì cả file.

Nhờ vậy agent "đọc code theo symbol thay vì cả file": skeleton cho biết *cái gì tồn tại ở đâu*, `read_method` lấy *đúng phần body cần xem* — context luôn vừa budget (agentic context loading).

**Kế thừa governance SA4E-355:** SA4E-360 là **wire-only** — 3-point budget gate (gate #2 static assembly, gate #3 intra-turn, compaction) **KHÔNG bị đụng đến**. Skeleton/map được đo bằng chính `estimateTokenCount` + `measureStaticAssembly` của shipped gate, inject nội dung byte-identical với phần đo (measure == inject, INV-2). REJECT của record vẫn là gate #2 — SA4E-360 không tự throw budget error (P-3/P-5).

**Phạm vi P1:** skeleton injection (UC-360-01), read_method (UC-360-02), functional map (UC-360-03), regex fallback (UC-360-04), governance regression (UC-360-05). P2/P3 (hybrid engines, map-reduce escape hatch) out of scope.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| AI Agent (chạy trên Pi harness — reviewer LLM trong chat) | Quy tắc context supply (§2), cách gọi `read_method` / `get_workspace_info` (§4), error envelopes + self-heal (§5), behavior changes (§8) |
| Developer maintain context pipeline | Module map `extension/src/pi-workflow/skeleton/*` (§2.2-2.7), hardcoded limits (§3.2), stale-index ladder (§5.4), troubleshooting (§6) |
| System Administrator | Configuration (§3) — gần như N/A: không có config mới, limits hardcode trong code |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| Kiro/VS Code + SA4E extension | **≥ 1.53.0** (UAT VSIX chứa skeleton supply — commit `1b822b0`) | Yes |
| code-intel backend (MCP loopback) | đang chạy, workspace đã index (`sdlcAgents.enableMcpServer` = true, mặc định) | Yes cho skeleton + read_method |
| LLM provider | llama-server qwen 32k (hoặc provider n_ctx hợp lệ) | Yes — budget resolve theo `meta.n_ctx` |

> **Không có dependency, config hay cài đặt mới.** Không thêm package nào (P-1/INV-4 verified); mọi limits hardcode trong code (§3.2). Backend index trước đó (SA4E-325/356) dùng nguyên trạng.

---

## 2. Context Supply Rules (TRỌNG TÂM — đọc trước khi dùng)

Đây là phần quan trọng nhất. SA4E-360 áp **6 quy tắc supply** dưới đây cho mọi code-derived context vào system prompt / tool results của chat path.

### 2.1 Bảng tổng quan 6 quy tắc

| # | Quy tắc | Cơ chế | Giới hạn |
|---|---------|--------|----------|
| 1 | **Đọc theo symbol, không đọc cả file** | `read_method(class, method)` → locate exact-match → bounds check từ index → slice đọc line-range | MAX_SLICE_LINES 2,000 / MAX_SLICE_BYTES 256 KB |
| 2 | **Tìm symbol qua query-layer** | Backend tool `code_symbol_locate` — equality-based (`s.name = @method`), KHÔNG LIKE wildcard | LIMIT mặc định 25; tenant scope `__projectId` |
| 3 | **Skeleton signatures qua backend** | `code_extract_signatures` cho file không có grammar — regex extractor | ≤ 50 file/batch; 1 MB read cap; containment twin 4 lớp; fail-soft |
| 4 | **Functional map tóm tắt module** | `get_workspace_info` trả `layout + map section` (SummaryTreeBuilder) | Map ≤ 1,500 tokens; toàn result ≤ 16,000 chars; cache TTL 60s |
| 5 | **Skeleton corpus + global incremental budget** | Render theo module priority với `remaining-global-budget`; fallback ladder; truncator | Cap = `floor(0.70 × staticBudget)`; ≤ 2,000 file; hard cap 500 drops |
| 6 | **Secret redaction MANDATORY** | `redactSecretLike` + `stripControlChars` trên MỌI skeleton content; `isSecretFileName` loại file nhạy cảm | KHÔNG TẮT ĐƯỢC — không có config để bypass |

### 2.2 Rule 1 — `read_method`: đọc theo symbol (C-360-R1/R2)

**Cú pháp:** `read_method({ class: '<EnclosingType>', method: '<methodName>' })` — cả hai tham số là chuỗi non-empty sau trim (bỏ trống/sai kiểu → envelope `INVALID_ARGS` kèm usage hint, turn KHÔNG crash).

**Pipeline (FSD §6.2, implement `read-method-tool.ts`):**

1. **Locate exact-match** — backend `code_symbol_locate` (Rule 2): `name = method` nằm trong enclosing type `class` (match `parent_symbol` khi có, fallback cùng `file_id` với row class).
2. **Bounds check từ index** (EF-4) — `endLine < startLine || endLine > lineCount` → bounds hỏng → chạy freshness ladder (§5.4) rồi re-locate **một lần duy nhất**; không bao giờ trả slice sai một cách âm thầm.
3. **Contained slice read** — mọi path index-derived đi qua `resolveContainedPath` (SEC-325-D1: reject `\0`, reject UNC, lexical isWithin, realpath symlink-follow-within); sau đó đọc **line-range** `[startLine..endLine]` bằng stream, KHÔNG đọc cả file.
4. **Trả JSON envelope** vào `content[0].text` + `details` — 4 dạng: `ok` / `ambiguous` / `not_found` / `error` (chi tiết §5.2).

**Ví dụ envelope `ok`:**

```json
{
  "status": "ok",
  "filePath": "extension/src/pi-workflow/skeleton/skeleton-truncator.ts",
  "symbolKind": "method",
  "name": "truncate",
  "signature": "truncate(parts, cap, modulePriorityOrder, staticBudget, options?)",
  "startLine": 76,
  "endLine": 89,
  "sourceSlice": "truncate(parts: readonly SkeletonPart[], ...) { ... }"
}
```

**Approval:** `read_method` nằm trong `READ_ONLY_TOOLS` (pi-workflow-gate.ts) → tự động approved như `read`/`grep`/`get_workspace_info`, không có confirm prompt.

**Loop bound:** dùng shipped `TurnBudgetGuard` (4× identical (tool, args) → steer → abort) — không có cơ chế loop mới (BR-11).

### 2.3 Rule 2 — `code_symbol_locate`: tìm symbol qua query-layer (DISC-1)

Backend tool MỚI (`backend/src/engine/tools/code-locate.ts`, mỏng theo BR-11 — chỉ serialize; logic nằm trong `QueryLayer.locateSymbol`):

- **Input:** `{ class, method, limit? (=25), __projectId? (injected) }`.
- **Matching là EQUALITY** (`s.name = @method`, `kind IN ('method','function')`) — **không có vector LIKE wildcard** (khác `code_search` fuzzy / `code_symbols` prefix). Caller không thể truyền `%` để quét bảng.
- **Output:** compact JSON `{ rows: [...], classMethods? }` — mỗi row có `name, kind, signature, filePath, startLine, endLine, lineCount, parentSymbol` — đây là lý do tool này tồn tại: `code_symbols` cũ chỉ in `startLine`, không đủ cho read_method.
- **AF-4 enrichment 1 lần gọi:** nếu class match nhưng method không có → response thêm `classMethods` (top 10 method đã index của class đó) → agent biết ngay method nào tồn tại.
- **Tenant scope:** `__projectId` injected fail-closed (SA4E-41) — không cross-tenant.

### 2.4 Rule 3 — `code_extract_signatures`: skeleton cho file grammar-less (OI-1, SEC-360-04)

Backend tool MỚI (`code-extract.ts`) bọc regex extractor thuần `extractSymbols(content, language)` (guard ReDoS C2 built-in: blank dòng > 8,192 chars trước `matchAll`):

| Thuộc tính | Giá trị (verified trong code) |
|-----------|------------------------------|
| Batch | ≤ 50 file/call (`MAX_BATCH_FILES`); thừa → ghi vào phần Skipped, không fail |
| Read cap | `MAX_EXTRACT_BYTES` = 1 MB, stat-first (SEC-325-D3 server-side twin) |
| Containment twin | Đủ 4 lớp của path-containment.ts: null-byte → UNC → lexical isAfter resolve → realpathSync follow-within (SEC-360-04) |
| Fail-soft | Mọi lỗi per-file → mục `Skipped N files` với reason; batch KHÔNG BAO GIỜ fail (BR-360-03) |
| Output | Text parseSearchText-compatible (`Found N files` + `[kind] name` / `File:` / `Sig:` lines) — extension parse bằng parser CŨ, zero new parser |
| Empty match | Trả text không candidate → extension chuyển rung RAW_HEAD |

### 2.5 Rule 4 — Functional map trong `get_workspace_info` (C-360-M1/M2)

`get_workspace_info` giữ **signature zero-arg KHÔNG ĐỔI**; kết quả text được mở rộng: `text = layoutText + '\n\n' + functionalMapSection` (layout cũ byte-identical).

- Map build bởi `FunctionalMapProvider` bọc `SummaryTreeBuilder.build(root, { maxDepth: 3, maxTokens: 1500 })` **consumed as-is** (BR-360-05).
- **keySymbols** lấy từ symbol corpus THẬT của skeleton build, nhóm theo module (≤ 5 symbols/module) — không bịa module.
- **Caps:** map ≤ 1,500 tokens; toàn bộ result text ≤ 16,000 chars (`MAX_RESULT_CHARS`) — áp lực cap → trim entry theo module priority, re-measure `mapTokens`.
- **Cache (C-360-M2):** `layoutCache` mở rộng `{ at, text, map? }` — TTL 60,000 ms giữ nguyên, key = workspaceRoot (multi-root safe); MỘT lần build per TTL window phục vụ cả tool result lẫn static injection (AF-3).
- **`details`** mới: `{ functionalMap: [{module, summary, keySymbols}], mapTokens, cacheTtlSeconds: 60 }`.
- **Lỗi:** per-module fail → bỏ entry đó (EF-1, debug only); build toàn phần fail → layout-only + event `PI_FUNCTIONAL_MAP_UNAVAILABLE` (EF-2, warn) — behavior cũ giữ nguyên.

### 2.6 Rule 5 — Skeleton corpus với global incremental budget (UC-360-01/04, BR-360-01)

**Khi nào build:** tự động trong session assembly (createHost) — GIỮA `resolveSessionGovernance` và TRƯỚC `runSessionBudgetGate` (gate #2). Agent không cần gọi gì; skeleton xuất hiện trong system context dưới dạng 2 virtual files: `.pi/workspace-skeleton.md` và `.pi/workspace-map.md`.

**Pipeline (`SkeletonProvider.getSections` — verified `skeleton-provider.ts`):**

1. **Walk corpus** ≤ 2,000 file (`SKELETON_MAX_FILES`), loại secret-file (Rule 6) + `EXCLUDED_DIRS` (.git/node_modules/out/dist).
2. **Freshness sweep** — stat → hash → reindex ladder (§5.4). DEGRADED ⇒ KHÔNG có skeleton (EF-3), session vẫn chạy.
3. **MỘT batched corpus query** — `fetchSymbolCorpus` qua 53 bucket tên (`_`, `a-z`, `A-Z`) chạy concurrent trên `code_symbols`.
4. **Render global-budget** (`renderCorpusWithGlobalBudget` — SEC-360-02 #1): file ưu tiên cao render trước với `maxTokens = cap − measuredSoFar` → khi cap đầy, file sau tự rỗng.
5. **Fallback ladder** cho file không có grammar (UC-360-04): `REGEX_SIGNATURES` (backend tool, Rule 3) → `RAW_HEAD` (readHead extension-local ≤ 1 MB, render ≤ 120 dòng, có sanitize Rule 6) → `SKIPPED` (warn `PI_SKELETON_FILE_SKIPPED`, KHÔNG BAO GIỜ block session — BR-360-03).
6. **Truncation** (`SkeletonTruncator`): vẫn vượt cap → drop theo module priority (module thấp nhất trước, file trước header, insert sau trước) với **token accounting tăng dần O(parts)**; **hard cap 500 drops** (`MAX_TRUNCATION_DROPS`) — vượt → REJECT.
7. **Gate decisions** (4 giá trị, carried trong `PI_SKELETON_BUILT.gateDecision`):

| Decision | Ý nghĩa |
|----------|---------|
| `PASS` | skeletonTokens ≤ cap ngay từ đầu |
| `TRUNCATED_PASS` | đã drop part, sau re-measure ≤ cap |
| `REJECT` | vẫn > cap sau khi hết victim / hết 500 drops — chỉ xảy ra khi defect/forced-harness (module ngoài priority order là KHÔNG droppable) → gate #2 throw `PiContextBudgetExceededError`, provider KHÔNG BAO GIỜ được gọi (BR-360-02/BR-09) |
| `DEGRADED_NO_SKELETON` | index rỗng / bridge vắng / build fail → skeleton rỗng đóng góp 0 token, identity passthrough (KHÔNG phải REJECT) |

**Cache (OI-2):** artifact cache freshness-keyed — fingerprint = sorted `[relativePath, mtimeMs]` pairs; fingerprint không đổi → build bị bỏ qua; `invalidate(root)` ép rebuild. Không TTL.

### 2.7 Rule 6 — Secret redaction MANDATORY (SEC-360-01/07 — KHÔNG TẮT ĐƯỢC)

Mọi code-derived text vào system context (signature lines + RAW_HEAD) đi qua hygiene pass TRƯỚC khi trim (`secret-redaction.ts`):

1. **`stripControlChars`** (SEC-360-07, chạy TRƯỚC): strip C0 controls (`\x00-\x08`, `\x0B`, `\x0C`, `\x0E-\x1F`, `\x7F`), zero-width (`U+200B-200F`), RTL override (`U+202A-202E`), `U+2060`, `U+FEFF`.
2. **`redactSecretLike`** (SEC-360-01): deny-list thay literal bằng marker `[REDACTED]`:
   - `sk-…` (≥16 chars), `AKIA` + 16 alnum hoa, `ghp_`/`gho_` (≥16), `xox[bap]-…`, `-----BEGIN … PRIVATE KEY-----`.
   - Assignment: `password|passwd|secret|token|api[_-]?key` `[:=]` giá trị **quoted ≥ 8 chars** HOẶC **unquoted có digit, ≥ 8 chars** (digit guard giữ `token: string)` parse được).
3. **`isSecretFileName`** (SEC-360-01 #2): file KHÔNG BAO GIỜ vào corpus — `.env*`, `*.pem`, `*.key`, `id_rsa*`, `id_ed25519*`, `credentials*`, tên chứa `secret` (case-insensitive, tách khỏi `EXCLUDED_DIRS`).
4. **Không render** doc comments và method bodies trong skeleton (chỉ kind/name/signature, trim 120 chars).
5. `.env`-style không vào index (detectLanguage null → file-watcher skip).

Cả hai hàm **idempotent và never throw**; KHÔNG có config để tắt — đây là remediation MANDATORY của security review, đã verify bằng PBT-09, UT-30/31/34 (STC executed PASS).

---

## 3. Configuration Reference

### 3.1 Extension settings (đã có sẵn — SA4E-360 KHÔNG thêm setting mới)

| Setting | Type / Default | Mô tả | Liên quan SA4E-360 |
|---------|----------------|-------|--------------------|
| `sdlcAgents.enableMcpServer` | boolean / `true` | Bật MCP wrapper server lúc startup | TẮT ⇒ skeleton DEGRADED, read_method trả `INDEX_UNAVAILABLE` |
| `sdlcAgents.mcpServerPort` | number / `9181` | Port local MCP wrapper server | Chain locate/extract/corpus chạy qua wrapper này |
| `sdlcAgents.mcpServerUrl` | string / `""` | Override URL wrapper (rỗng = dùng port) | Chỉ chấp nhận loopback HTTP(S) — remote bị reject fail-closed |
| `sdlcAgents.configPath` | string / `.code-intel/orchestration.json` | Orchestration config | Backend index/reindex delegate |

### 3.2 Hardcoded limits (KHÔNG có config — đổi phải sửa code)

| Limit | Giá trị | Nơi định nghĩa | Ý nghĩa |
|-------|---------|----------------|---------|
| Skeleton cap | `floor(0.70 × staticBudget)` | `skeletonCap()` — skeleton-provider.ts | 13,767 @32k / 28,539 @65k |
| `SKELETON_MAX_FILES` | 2,000 | skeleton-provider.ts | Số file walk tối đa mỗi build |
| `MAX_TRUNCATION_DROPS` | 500 | skeleton-truncator.ts | Hard cap số lần drop — vượt → REJECT |
| `MAX_SLICE_LINES` / `MAX_SLICE_BYTES` | 2,000 / 256 KB | read-method-tool.ts (SEC-360-06) | Cap slice read_method |
| `MAX_READ_BYTES` | 1 MB | symbol-outline-extractor.ts (FsContentReader) | RAW_HEAD read cap, stat-first |
| `MAX_EXTRACT_BYTES` / `MAX_BATCH_FILES` | 1 MB / 50 | code-extract.ts | Backend extraction cap/batch |
| `MAP_TOKEN_CAP` / `MAX_RESULT_CHARS` | 1,500 / 16,000 | functional-map-provider.ts | Map token cap / whole-result char cap |
| `MAP_MAX_DEPTH` / keySymbols per module | 3 / 5 | functional-map-provider.ts | Depth walk / số key symbols |
| `RAW_HEAD_MAX_LINES` | 120 | skeleton-fallback.ts | Số dòng head render cho RAW_HEAD |
| `REINDEX_COOLDOWN_MS` | 30,000 | index-freshness-checker.ts (SEC-360-03 #2) | Cooldown giữa các lần gọi reindex delegate |
| `searchTimeoutMs` / retry | 2,000 ms / 1 retry sau 200 ms backoff | DEFAULT_RETRIEVAL_CONFIG | Locate/extract/corpus call |
| `MCP_WRAPPER_FETCH_TIMEOUT_MS` | 5,000 ms | search-provider.ts | Wrapper fetch timeout (loopback-only + X-Session-Nonce) |
| `DEFAULT_TOOL_TIMEOUT_MS` | 60,000 ms | mcp-bridge.ts | Outer cap mỗi tool call |
| `MAX_QUERY_CHARS` | 4,096 | search-provider.ts | Query cap fail-closed |
| `DEFAULT_MAX_SAME_TOOL_REPEATS` | 4 | TurnBudgetGuard (shipped) | Loop bound per (tool, args) |

### 3.3 Budget arithmetic (resolver-authoritative — DISC-7 corrected)

`resolveContextBudget`: `safetyMargin = ceil(nCtx × 0.08)` → `usable = nCtx − reserveOutput − safetyMargin` → `staticBudget = floor(usable × 0.70)` → skeleton cap = `floor(0.70 × staticBudget)`.

| n_ctx | reserveOutput | margin | usable | staticBudget (70%) | historyBudget (30%) | Skeleton cap |
|-------|---------------|--------|--------|--------------------|--------------------|--------------|
| 32,768 (qwen) | 2,048 | 2,622 | 28,098 | 19,668 | 8,430 | **13,767** |
| 65,536 | 2,048 | 5,243 | 58,245 | 40,771 | 17,474 | **28,539** |

---

## 4. Usage

### 4.1 Đọc một method cụ thể — `read_method`

```text
# Agent cần xem logic truncate của SkeletonTruncator — KHÔNG read cả file:
read_method({ "class": "SkeletonTruncator", "method": "truncate" })

# → ok envelope: filePath, startLine/endLine, sourceSlice (body thật của method,
#   bounds-checked trước khi đọc). Chỉ slice này vào context — gate #3 đo
#   như một tool result bình thường (drop atomically khi cần compact).
```

Quy tắc chọn tool: cần **nhìn tổng quan** → skeleton đã có sẵn trong system context (không cần gọi gì); cần **body của 1 method** → `read_method`; cần **duyệt/viết code cả file** → các read tool cũ vẫn hoạt động như trước.

### 4.2 Tìm vị trí symbol khi skeleton chưa đủ

```text
# Không chắc method nằm class nào / muốn bounds chính xác:
code_symbol_locate({ "class": "SkeletonProvider", "method": "getSections" })
# → {"rows":[{ "name":"getSections","kind":"method","filePath":"extension/src/...",
#     "startLine":59,"endLine":70,"lineCount":229,"parentSymbol":"SkeletonProvider" }]}
```

### 4.3 Functional map — `get_workspace_info`

```text
get_workspace_info()      # zero-arg — signature KHÔNG đổi
# → text = layout (như cũ) + section functional map:
#   backend/src/… — summary line (từ SummaryTree)
#     Key: locateSymbol, listClassMethods, …   (≤5 key symbols/module, từ corpus thật)
# → details.functionalMap + details.mapTokens + details.cacheTtlSeconds: 60
```

### 4.4 Agentic loading khi context budget thấp

Kịch bản tự nhiên (không cần thao tác người dùng): skeleton + map đã inject tĩnh → agent đọc outline trong context → chỉ gọi `read_method` cho vài symbol thật sự cần → kết quả read là tool result **droppable**: khi gate #3 thấy vượt budget, compaction drop tool-unit nguyên vẹn (pinned user query giữ lại) — phiên KHÔNG BAO GIỜ vượt n_ctx (BR-09). Với workspace lớn: skeleton bị truncate theo module priority (`PI_SKELETON_TRUNCATED` — xem `modulesDropped`) → các module bị drop chỉ còn lộ diện qua `get_workspace_info` + `read_method`.

### 4.5 workspace-info-tool + index ops

- `code_index_status { reindex: true }` — delegate reindex (backend checksum-skip: chỉ index file thay đổi). Được gọi gián tiếp bởi freshness ladder; cũng dùng thủ công khi nghi index cũ.
- Session log: lọc tiền tố `PI_` để xem telemetry (bảng §5.5).

---

## 5. Limits & Errors

### 5.1 Caps tổng hợp

| Cap | Giá trị | Hành vi khi chạm |
|-----|---------|------------------|
| read_method slice | 2,000 dòng / 256 KB (SEC-360-06) | Ngưng đọc ngay khi cap tới → envelope `ok` kèm `sliceTruncated: true, totalLines: N` — không bao giờ đọc cả file |
| Functional map | 1,500 tokens; result ≤ 16,000 chars | Trim entry theo module priority → re-measure; hết entry → layout-only |
| Skeleton | `floor(0.70 × staticBudget)`; ≤ 2,000 file; 500 drops | Truncate → `TRUNCATED_PASS`; vẫn vượt → `REJECT` (provider never called); rỗng → `DEGRADED_NO_SKELETON` |
| Fallback batch | 50 file × 1 MB | Thừa file → Skipped; file > 1 MB → Skipped |

### 5.2 read_method error envelopes (turn KHÔNG crash — mọi error nằm trong envelope)

| status / code | Khi nào | Nội dung + self-heal |
|---------------|---------|----------------------|
| `ok` | Exactly-one match, bounds hợp lệ | `sourceSlice` (có thể `sliceTruncated:true`) |
| `ambiguous` | > 1 match (overload / trùng tên) | `candidates: [{name, kind, filePath, startLine}]` — KHÔNG pick hộ; agent tự chọn bằng cách đọc theo candidate phù hợp |
| `not_found` | 0 match | `suggestions: [get_workspace_info, find_tools, code_search]` + `classMethods` (top 10 method của class nếu class match) |
| `error / INVALID_ARGS` | class/method rỗng hoặc sai kiểu | `usageHint` — gọi lại đúng cú pháp |
| `error / FILE_UNREADABLE` | path nằm ngoài workspace root hoặc fs read fail | Thông báo actionable; dùng tool khác |
| `error / INDEX_UNAVAILABLE` | Backend/bridge không kết nối | Steering: dùng `get_workspace_info` + `find_tools`/`code_search`; kiểm tra backend đang chạy |

### 5.3 Budget semantics — REJECT vs DEGRADED (TRC-04/TRC-05)

- **REJECT (TRC-04):** chỉ khi skeleton non-empty VẪN > cap sau truncation (defect/forced-harness) → gate #2 throw `PiContextBudgetExceededError` → user thấy `chat:error PI_CONTEXT_BUDGET_EXCEEDED`; **provider không bao giờ được gọi oversized**. Lưu ý: drop hết mọi part droppable cho `DEGRADED_NO_SKELETON`, KHÔNG REJECT (UT-05) — REJECT chỉ đến từ module không nằm trong priority order (không droppable) hoặc 500-drop cap.
- **DEGRADED (TRC-05):** index rỗng / bridge vắng / sweep degrade / build fail → skeleton rỗng 0 token + map layout-only + `read_method` steering — session chạy bình thường, agent tự khai thác bằng tool truy vấn.

### 5.4 Stale-index ladder (AF-2 / §5.4 FSD — retry-once, cooldown 30s)

```text
checkFile(file):                        # hot path read_method: đúng 1 stat
1. stat mtime == lastKnownGood → FRESH  # 1 stat, 0 hash
2. mtime đổi → hash nội dung vs index content_hash
3. hash bằng (touch-only) → refresh mtime → FRESH, KHÔNG reindex
4. hash khác → STALE → reindex delegate (chỉ file changed, checksum-skip)
   → retry resolution ĐÚNG MỘT lần → FRESH hoặc not_found steering
5. reindex fail / trong cooldown 30s (SEC-360-03 #2) → DEGRADED, không loop
```

Skeleton build dùng biến thể batched: MỘT sweep cho cả workspace trước khi build; `PI_SKELETON_INDEX_STALE` {staleFiles, action: 'reindex'|'degrade'} emit MỘT lần mỗi sweep.

### 5.5 Telemetry events (counts/decisions only — không bao giờ có code bodies)

| Event | Level | Emitter | Payload chính |
|-------|-------|---------|---------------|
| `PI_SKELETON_BUILT` | info | SkeletonProvider | files, symbols, skeletonTokens, staticBudget, fallbackFiles, skippedFiles, gateDecision, durationMs |
| `PI_SKELETON_TRUNCATED` | info | SkeletonTruncator | skeletonTokensBefore/After, modulesDropped[], staticBudget |
| `PI_SKELETON_FALLBACK` | info | per fallback file | filePath, language, fallbackMode (REGEX_SIGNATURES / RAW_HEAD) |
| `PI_SKELETON_FILE_SKIPPED` | warn | per skip | filePath, reason — never fatal |
| `PI_SKELETON_INDEX_STALE` | warn | IndexFreshnessChecker | staleFiles, action |
| `PI_FUNCTIONAL_MAP_UNAVAILABLE` | warn | FunctionalMapProvider | workspaceRoot, reason (EF-2) |
| `PI_READ_METHOD_RESULT` | info | ReadMethodTool | status, durationMs, sliceLines |
| `PI_GATE_DECISION` (enriched OI-5) | info | shipped budget-gate | decision (ALLOW/WARN/REJECT) + skeletonTokens, truncationApplied, measurementPoint |
| `PI_CONTEXT_BUDGET_EXCEEDED` | error | shipped | staticTokens, staticBudget, nCtx — shape unchanged |

---

## 6. Troubleshooting

| Triệu chứng | Nguyên nhân có thể | Cách xử lý |
|-------------|--------------------|------------|
| `read_method` trả `not_found` cho symbol chắc chắn tồn tại | (1) Index cũ — file thêm mới chưa index; (2) symbol nằm trong file grammar-less (regex-fallback symbols là TRANSIENT, không persist vào index — OI-4); (3) method không thuộc class đó | Đọc `classMethods` trong envelope; gọi `code_index_status {reindex:true}` rồi thử lại MỘT lần (ladder tự làm nếu bounds stale); nếu file grammar-less → dùng `code_search`/`grep` |
| `read_method` trả `ambiguous` | Overload hoặc nhiều symbol trùng tên trong enclosing type | Đọc `candidates` — chọn row khớp intent theo `filePath`/`startLine`; đọc slice bằng `read` nếu cần phương án khác (envelope không pick hộ theo thiết kế AF-1) |
| Skeleton bị `SKIPPED` nhiều file (`PI_SKELETON_FILE_SKIPPED`) | (1) Global budget đã đầy — file vào sau tự rỗng (SEC-360-02 #1, đúng thiết kế); (2) fallback cạn: regex không match + RAW_HEAD rỗng sau hygiene/trim; (3) file secret-name bị loại | Xem `reason` trong log; nếu do budget — hạ kỳ vọng (module ưu tiên cao giữ chỗ trước); file nhạy cảm bị loại là hành vi MANDATORY (Rule 6) |
| Skeleton toàn workspace nhỏ hơn kỳ vọng / trống | Index rỗng hoặc bridge vắng → `DEGRADED_NO_SKELETON` | Kiểm tra `sdlcAgents.enableMcpServer`, backend đang chạy, index đã build; `read_method` sẽ steering `INDEX_UNAVAILABLE` |
| `INDEX_UNAVAILABLE` mặc dù backend chạy | Wrapper URL sai / không loopback (fail-closed) | Kiểm tra `sdlcAgents.mcpServerPort`/`mcpServerUrl` — chỉ chấp nhận loopback HTTP(S) |
| Skeleton không rebuild sau khi sửa file | OI-2 cache theo fingerprint mtime | Bình thường fingerprint đổi là rebuild; fingerprint lệch (mtime giữ nguyên nhưng nội dung đổi) → `invalidate()` hoặc reindex |
| Secret vẫn lộ `[REDACTED]` ở chỗ không mong đợi / hoặc signature bị redact nhầm | Deny-list match giá trị unquoted có digit ≥ 8 chars (vd hằng số dài) | Đây là false-positive chấp nhận của digit-guard (giữ `token: string)` parse được); literal thật luôn được redact — KHÔNG tắt được (Rule 6) |
| Reindex liên tục không hiệu quả | Cooldown 30s chặn burst (SEC-360-03 #2) | Chờ hết cooldown; backend checksum-skip chỉ index file changed — kiểm tra `code_index_status` |

---

## 7. FAQ

**Q1 — Tại sao không đọc cả file nữa?**
Whole-file reads là nguồn tiêu token lớn nhất và dễ vỡ static budget. Skeleton cho map "cái gì ở đâu" với chi phí ~kind/name/signature per symbol; khi cần chi tiết, `read_method` đọc đúng line-range của symbol đó (≤ 2,000 dòng / 256 KB). Gate #2 đo tổng static, gate #3 đo mọi tool result — không đường nào làm vỡ n_ctx (BR-09).

**Q2 — Skeleton có đủ chính xác không? Redaction có làm hỏng code không?**
Skeleton không nhằm thay thế code thật — nó là chỉ mục: chỉ `kind name signature`, trim 120 chars, không body, không doc comment. Redaction KHÔNG sửa file trên disk và KHÔNG sửa code agent đọc qua `read_method`/`read` — nó chỉ thay secret-like literal trong **bản sao text vào system context** bằng `[REDACTED]`. Cả hai hàm idempotent, never throw; cấu trúc dòng signature được giữ nguyên nên skeleton vẫn parse/nhận diện được.

**Q3 — Gate order / escalation hoạt động thế nào với skeleton?**
Thứ tự shipped giữ nguyên: (1) resolve budget → (2) build skeleton + map → (3) đo bằng `measureStaticAssembly` như context-file entries → (4) nếu > staticBudget: escalation ladder nén (compressPrompt) như mọi static input khác → (5) vẫn vượt → gate #2 REJECT (`PiContextBudgetExceededError`), provider never called. Intra-turn: gate #3 REJECT → COMPACT drop tool-unit (read_method/map results droppable, pinned user giữ lại) → REJECT chỉ khi pinned query không vừa. 3-gate SA4E-355 untouched — skeleton chỉ supply measured content.

**Q4 — Con số 2,622 (margin) tính thế nào?**
`safetyMargin = ceil(nCtx × 0.08)`. Với qwen n_ctx 32,768: `ceil(2,621.44) = 2,622`. Chuỗi đầy đủ: usable = 32,768 − 2,048 (reserveOutput) − 2,622 = 28,098; staticBudget = floor(28,098 × 0.70) = 19,668; skeleton cap = floor(19,668 × 0.70) = 13,767. Resolver (`context-budget-resolver.ts`) là single source of truth (DISC-7).

**Q5 — Skeleton build lại khi nào? Có tốn thời gian mỗi turn?**
Không mỗi turn — OI-2 cache freshness-keyed theo fingerprint `[relativePath, mtimeMs]`; index không đổi → dùng lại artifact (build ~0). Fingerprint đổi (thêm/sửa/xóa file) → rebuild toàn bộ (freshness sweep + 1 batched corpus query + render + truncate), mục tiêu ≤ 2 s p95 @2,000 file. Map riêng ride layoutCache TTL 60s — một build phục vụ cả static injection lẫn `get_workspace_info`.

**Q6 — `read_method` có cần duyệt approve không?**
Không — `read_method` nằm trong `READ_ONLY_TOOLS` (cùng `read`, `grep`, `find`, `ls`, `get_workspace_info`) → auto-approved ở cả hai mode, vì nó chỉ đọc slice. Lưu ý nó vẫn bị `TurnBudgetGuard` bound (4× identical args → steer) và kết quả vẫn chịu gate #3 như tool result thường (BR-360-04).

**Q7 — File Svelte/template (không có tree-sitter grammar) vào skeleton thế nào?**
Fallback ladder: `REGEX_SIGNATURES` — backend `code_extract_signatures` trích signature bằng regex multi-language (output parseSearchText-compatible) → nếu không có match: `RAW_HEAD` — đọc ≤ 120 dòng đầu file (≤ 1 MB cap), sanitize Rule 6, render với header `// basename` → vẫn không được: `SKIPPED` (warn, không block). Symbols từ regex fallback là TRANSIENT — không persist vào index, nên `read_method` không resolve được chúng (OI-4) — đọc bằng `read`/`grep` cho những file đó.

**Q8 — Skeleton/map có được persist ra disk hay gửi đi đâu không?**
Artifact build (cache OI-2) là session-scoped in-memory — KHÔNG persist vào index hay file riêng. Skeleton text tồn tại ở 2 nơi: system context (virtual agentsFile `.pi/workspace-skeleton.md` / `.pi/workspace-map.md`) và session transcript/file của agent session. Source code không rời máy: inference là local provider (llama-server), backend là loopback; telemetry chỉ counts/decisions. Vì skeleton text có thể nằm trong session file persist trên disk (nơi có vòng đời dài hơn source gốc), Rule 6 redaction là MANDATORY — đây chính là lý do của SEC-360-01.

---

## 8. Behavior Changes

| # | Trước SA4E-360 | Sau SA4E-360 |
|---|----------------|--------------|
| 1 | Chat path chỉ có full-file reads làm nguồn code context | Session assembly tự động inject **skeleton corpus** + **functional map** (multi-resolution); agent đọc chi tiết theo symbol qua `read_method` |
| 2 | `READ_ONLY_TOOLS` = read, grep, find, ls, get_workspace_info | **+ `read_method`** (auto-approved, gate #3 vẫn đo) |
| 3 | Backend surface: không có tool locate/extract | **2 backend tool mới:** `code_symbol_locate` (equality + bounds JSON), `code_extract_signatures` (regex fallback, fail-soft) — tool cũ nguyên trạng |
| 4 | `get_workspace_info` trả layout | Trả layout **byte-identical + map section** (≤1,500 tokens; details có `functionalMap`); schema zero-arg unchanged |
| 5 | Governance: 3-gate SA4E-355 | **3-gate UNTOUCHED** — skeleton/map supply content được đo bằng chính shipped gates; `PI_GATE_DECISION` enrich thêm skeleton fields (OI-5), event cũ unchanged |
| 6 | Không có hygiene pass cho code-derived text | **Rule 6 MANDATORY:** redaction + control-char strip + secret-file exclusion trên mọi skeleton content (không config để tắt) |
| 7 | Không telemetry skeleton | Family `PI_SKELETON_*` + `PI_READ_METHOD_RESULT` (counts only) |

Không thay đổi: UI (ChatPanel + usage indicators SA4E-355 nguyên trạng), pi-coding-tools legacy path (P1 chỉ wire session path), tool cũ, dependency, auth/authz surface.

---

## 9. Appendix

### 9.1 Related documents

| Doc | Vị trí |
|-----|--------|
| BRD v1.1 / FSD v1.2 / TDD v1.1 | documents/SA4E-360/{BRD,FSD,TDD}.md |
| STP v1.1 / STC v1.0 | documents/SA4E-360/{STP,STC}.md |
| SECURITY-REVIEW v1.0 (SEC-360-01..07) | documents/SA4E-360/SECURITY-REVIEW.md |
| TEST-REPORT (65/78 executed) | documents/SA4E-360/TEST-REPORT-SA4E-360.md (+.csv) |
| Progress theo wave | documents/SA4E-360/PROGRESS-Wave1.md, PROGRESS-Wave3.md |
| Governance baseline | documents/SA4E-355/TDD.md v1.3 §13 |
| UG format reference | documents/SA4E-356/UG.md |
| Related tickets | SA4E-355 (3-gate governance), SA4E-356 (path containment reuse), SA4E-325 (D1-D4 security), SA4E-41 (tenant scope) |

### 9.2 Version compatibility

| Thành phần | Yêu cầu | Ghi chú |
|-----------|---------|---------|
| SA4E extension | **≥ 1.53.0** | Skeleton supply features ship trong VSIX UAT 1.53.0 (commit `1b822b0` — "bump 1.53.0 - VSIX with skeleton supply features for UAT"); SA4E-356/358 fold vào release 1.52.0 |
| code-intel backend | cùng repo (backend/src) | 2 tool mới đăng ký qua `register-tools.ts` — backend cũ hơn sẽ thiếu `code_symbol_locate`/`code_extract_signatures` ⇒ skeleton DEGRADED |
| LLM | provider có `meta.n_ctx` | Budget resolve theo n_ctx (default 8192 khi không có) |

### 9.3 STC verification status (minh bạch — KHÔNG claim phần chưa chạy)

| Trạng thái | Số lượng | Chi tiết |
|-----------|----------|----------|
| Executed PASS | **65/78** (100% pass rate trên executed) | Full extension suite (298 files / 2,896 tests) + backend unit (330 files / 3,461 tests) + E2E-API trên real server (8-file / 180-test suite; 9 E2E-API case IDs executed trong 7 test blocks: E2E-API-01..03, 05..07, 09, 11, 12) — Phase 6 fresh run |
| NOT RUN — manual | 10 | **SIT-01..08** (cần llama-server qwen 32k + live VS Code host — QA handoff) và **E2E-UI-01/02** (extension webview cần live VS Code host; repo chưa có Playwright harness cho webview) |
| NOT RUN — deferred automated | 3 | **E2E-API-04** (PostgreSQL parity — chưa nằm trong E2E suite, follow-up), **E2E-API-08** (wrapper timeout/retry — deferred, thiết kế retry đã unit-proven UT-23), **E2E-API-10** (rate limit /mcp — scope decision, security backlog SEC-360-03 #1) |

> **Lưu ý trung thực:** các hành vi mô tả trong guide này (§2, §5) tương ứng các case ĐÃ executed PASS trong STC. Hành vi chỉ cover bởi SIT/E2E-UI (vd: hiển thị skeleton trong system context trên qwen thật, webview usage indicators) được ghi nhận theo thiết kế + bằng chứng gián tiếp (unit/IT) — **chưa được verify end-to-end với LLM thật**, chờ SIT manual window. Verdict Phase 6: **CONDITIONAL PASS**.

### 9.4 Nguồn verify chính

- `extension/src/pi-workflow/skeleton/` (12 modules) — read-method-tool.ts (MAX_SLICE 2,000/256KB), skeleton-truncator.ts (500 drops), index-freshness-checker.ts (cooldown 30s), functional-map-provider.ts (1,500/16,000), secret-redaction.ts, skeleton-fallback.ts (RAW_HEAD 120), skeleton-provider.ts (2,000 files, cap 70%), symbol-locator.ts (53 buckets), skeleton-injector.ts (virtual files `.pi/workspace-skeleton.md` / `.pi/workspace-map.md`), skeleton-wiring.ts (DegradedSymbolLocator), skeleton-renderer.ts, skeleton-types.ts
- `extension/src/pi-workflow/` — pi-agent-session-host.ts (wire deltas ①-⑦), pi-workflow-gate.ts (READ_ONLY_TOOLS += read_method), pi-workflow-adapter.ts (bridge DI), workspace-info-tool.ts (cache {at,text,map?}, TTL 60s)
- `backend/src/engine/tools/` — code-locate.ts, code-extract.ts (containment twin 4 lớp, 1 MB / 50 file), register-tools.ts
- Config: extension/package.json — `sdlcAgents.mcpServerPort` (9181), `sdlcAgents.enableMcpServer` (true), `sdlcAgents.mcpServerUrl` (""), version 1.53.0

---

*User Guide — DEV Agent, 2026-10-14. Mọi claim đối chiếu source code (Wave 1-3, commits 5d92322 → 5225170 → 9b44169 → f60999e → 1b822b0) và STC v1.0 executed behaviors; không claim SIT/E2E-UI đã chạy.*
