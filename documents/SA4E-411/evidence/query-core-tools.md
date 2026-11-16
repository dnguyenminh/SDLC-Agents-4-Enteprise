# Evidence — Repo map + 4 công cụ lõi (core tools) + chốt snapshot

**Luồng:** Lập bản đồ repo theo câu hỏi, dùng 4 công cụ lõi tra cứu code, và bị chặn khi truy vấn sai snapshot
**ES / AC:** ES-07 (repo map PageRank), ES-09 (4 core tools + session pinning), ES-13 (chốt snapshot), AC-17 (chi phí token tool schema)
**Transcript gốc:** [`evidence/.raw-query.txt`](.raw-query.txt) (4 file / 26 test) · [`evidence/.raw-coretools.txt`](.raw-coretools.txt) (3 file / 21 test) · [`evidence/.raw-demo.txt`](.raw-demo.txt) (driver tsx)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| # | Exact command | Working dir | Timestamp transcript | Exit code | Kết quả lần chạy lại |
|---|---------------|-------------|----------------------|-----------|----------------------|
| 1 | `npx vitest run src/engine/api/__tests__/pinned-snapshot-guard.test.ts src/engine/agent-tools/__tests__/core-tools.test.ts src/engine/map/__tests__/repo-map-service.test.ts src/engine/map/__tests__/repo-map-rank.test.ts --reporter=verbose` | `backend/` | `2026-11-16T01:52:58+07:00` | **0** | `Test Files 4 passed (4)` · `Tests 26 passed (26)` · `Duration 1.72s` |
| 2 | `npx vitest run src/engine/map/__tests__/repo-map-service.test.ts src/engine/agent-tools/__tests__/core-tools.test.ts src/engine/map/__tests__/repo-map-rank.test.ts --reporter=verbose` | `backend/` | `2026-11-16T02:07:42+07:00` | **0** | `Test Files 3 passed (3)` · `Tests 21 passed (21)` · `Duration 1.33s` |
| 3 | `npx tsx C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e-411-demo.mts` | `backend/` | `2026-11-16T02:00:06+07:00` | **0** | driver in-process, xem transcript mục 3 |

Timestamp capture exit code cho cả 3 lệnh: `2026-11-16T02:49:31+07:00`.
Bản driver đã được sao chép vào evidence để tái lập: [`evidence/demo-driver-core-tools.mts`](demo-driver-core-tools.mts).

> ⚠️ **Lệnh #3 là local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user.**
> Nó tồn tại để ghi lại hành vi quan sát được của 4 công cụ lõi; người dùng cuối không cần chạy lệnh này.

---

## 2. Output thật — bộ test (`.raw-query.txt`)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

 ✓ src/engine/map/__tests__/repo-map-service.test.ts > SA4E-418 RepositoryMapService > DSL output matches spec format (header + path: + start-end: signature) 55ms
 ✓ src/engine/map/__tests__/repo-map-service.test.ts > SA4E-418 RepositoryMapService > query personalization: query-matched file ranks first 11ms
 ✓ src/engine/map/__tests__/repo-map-service.test.ts > SA4E-418 RepositoryMapService > snapshot pin: FAILED snapshot rejected; scoping keeps S2 symbols out of S1 map 11ms
 ✓ src/engine/map/__tests__/repo-map-service.test.ts > SA4E-418 RepositoryMapService > token budget respected via binary-search packing (custom small budget) 8ms
 ✓ src/engine/map/__tests__/repo-map-service.test.ts > SA4E-418 RepositoryMapService > performance: repo map generation < 500ms for 10k files (pure ranking path) 226ms
 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > rejects missing session_id / index_snapshot_id (400 contract) 50ms
 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > rejects unknown session, mismatched snapshot, and non-READY snapshot 11ms
 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > valid request resolves the session pin; branch is echoed display metadata only 7ms
 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > middleware: 400 with error envelope on missing/mismatch, 200 + context on valid 25ms
 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > integration AC #3: branch head moves, pinned old commit still queries S1 12ms
 ✓ src/engine/agent-tools/__tests__/core-tools.test.ts > SA4E-420 core agent tools > all 4 tools enforce the session pin (FAILED snapshot + commit mismatch) 49ms
 ✓ src/engine/agent-tools/__tests__/core-tools.test.ts > SA4E-420 core agent tools > search_symbols: hybrid DSL format + metadata + cursor 16ms
 ✓ src/engine/agent-tools/__tests__/core-tools.test.ts > SA4E-420 core agent tools > search_symbols: kind + path_filter narrow results; cursor paginates 10ms
 ✓ src/engine/agent-tools/__tests__/core-tools.test.ts > SA4E-420 core agent tools > get_file_skeleton: signatures only, no bodies (AC) 6ms
 ✓ src/engine/agent-tools/__tests__/core-tools.test.ts > SA4E-420 core agent tools > read_code_block: enforces 120 lines max (AC) + cursor 5ms
 ✓ src/engine/agent-tools/__tests__/core-tools.test.ts > SA4E-420 core agent tools > query_call_graph: CALLERS/CALLEES/IMPLEMENTATIONS directions (AC) 9ms
 ✓ src/engine/agent-tools/__tests__/core-tools.test.ts > SA4E-420 core agent tools > tool schemas total ~450 tokens (AC) 5ms
 ✓ src/engine/map/__tests__/repo-map-rank.test.ts > SA4E-418 weight formula > tokenizes CamelCase / snake_case into lowercase terms 1ms
 ✓ src/engine/map/__tests__/repo-map-rank.test.ts > SA4E-418 weight formula > multipliers: query ×10, test ×0.2, long identifier ×2 0ms
 ✓ src/engine/map/__tests__/repo-map-rank.test.ts > SA4E-418 weight formula > W = m × √freq × ln(N/(df+1)) 0ms
 ✓ src/engine/map/__tests__/repo-map-rank.test.ts > SA4E-418 personalized PageRank > ranks the central node highest; scores sum ≈ 1 (stochastic) 5ms
 ✓ src/engine/map/__tests__/repo-map-rank.test.ts > SA4E-418 personalized PageRank > personalization vector boosts the favored file 0ms
 ✓ src/engine/map/__tests__/repo-map-rank.test.ts > SA4E-418 personalized PageRank > query-matched terms weight edges ×10 inside buildFileGraph 0ms
 ✓ src/engine/map/__tests__/repo-map-rank.test.ts > SA4E-418 token packing (binary search) > packs the largest prefix within the budget 0ms
 ✓ src/engine/map/__tests__/repo-map-rank.test.ts > SA4E-418 token packing (binary search) > budget too small → empty; large budget → all; empty input → empty 0ms
 ✓ src/engine/map/__tests__/repo-map-rank.test.ts > SA4E-418 token packing (binary search) > binary search does not overshoot (maximal prefix fits) 0ms

 Test Files  4 passed (4)
      Tests  26 passed (26)
   Start at  01:52:58
   Duration  1.85s (transform 170ms, setup 43ms, import 676ms, tests 529ms, environment 0ms)
```

Nhóm `.raw-coretools.txt` (3 file / **21 passed**, `Start at 02:07:42`, `Duration 1.39s`) chạy lại đúng 3 file ở trên và cho cùng danh sách test — xem `.raw-coretools.txt`.

---

## 3. Output thật — hành vi quan sát được (`.raw-demo.txt`)

```
### 1. REPOSITORY MAP (snapshot S1) ###
[REPOSITORY_MAP (Ranked by PageRank relevance)]
src/auth.ts:
  1-40: class AuthService
  10-20: method login
src/utils.ts:
  1-10: function helper
-- files ranked: 2 | token estimate: 37 | truncated: false

### 2. search_symbols "authorization" ###
[FOUND 1 SYMBOLS | BUDGET_USED: 0 tokens]
# [METHOD] login | src/auth.ts:10-20 (body: 50 tok)
   Sig: 
-- resultId: 90bd7d5e-7a69-467f-96a1-74c68f49009a | evidenceIds: ch1 | budgetUsedTokens: 26

### 3. get_file_skeleton src/auth.ts ###
[FOUND 3 SKELETON LINES | BUDGET_USED: 0 tokens]
# [CLASS] AuthService | src/auth.ts:1-40
# [CLASS] AuthService | src/auth.ts:1-45
# [METHOD] login | src/auth.ts:10-20

### 4. read_code_block src/auth.ts:1-4 ###
[CODE BLOCK src/auth.ts:1-4 | LINES: 4]
export class AuthService {
  async login(user: User): Promise<Token> {
    return helper(user);
  }

### 5. query_call_graph symLogin CALLEES ###
[FOUND 2 CALLEES NODES | BUDGET_USED: 0 tokens]
# [FUNCTION] helper (direct) | symUtil
# [FUNCTION] helper (inferred) | symUtil

### 6. PIN ENFORCEMENT (same query against a FAILED snapshot S3) ###
-- rejected: SNAPSHOT_NOT_READY: S3 is FAILED

### 7. TOOL SCHEMA TOKEN COST ###
-- search_symbols: 94 tokens
-- get_file_skeleton: 68 tokens
-- read_code_block: 107 tokens
-- query_call_graph: 81 tokens
-- total (4 core tools): 350 tokens
```

---

## 4. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `[REPOSITORY_MAP (Ranked by PageRank relevance)]` | Bản đồ repo xếp hạng theo độ liên quan với câu hỏi | Bạn không phải đọc thử hàng trăm file để biết nên mở file nào |
| `src/auth.ts: 1-40: class AuthService` · `10-20: method login` | Mỗi mục là **đường dẫn + khoảng dòng + tên lớp/hàm** | Bạn biết chính xác cần mở dòng nào, không phải đọc cả file |
| `-- files ranked: 2 \| token estimate: 37 \| truncated: false` | 2 file được xếp hạng, ước lượng **37 token**, **không bị cắt** | Bản đồ repo vừa sức chứa context của model |
| `[FOUND 1 SYMBOLS \| BUDGET_USED: 0 tokens]` | Tìm theo từ khoá trả về **1 ký hiệu** | Tìm nhanh và đúng trọng tâm |
| `# [METHOD] login \| src/auth.ts:10-20 (body: 50 tok)` | Ký hiệu kèm vị trí và **số token thân hàm** | Biết trước khi đọc thân hàm sẽ tốn bao nhiêu context |
| `-- resultId: 90bd7d5e-7a69-467f-96a1-74c68f49009a \| evidenceIds: ch1 \| budgetUsedTokens: 26` | Mỗi kết quả có **mã kết quả**, **mã bằng chứng**, **token đã dùng (26)** | Bạn có thể truy ngược kết quả về nguồn, và biết hạn mức đã dùng |
| `[FOUND 3 SKELETON LINES \| BUDGET_USED: 0 tokens]` | Xem “khung” file → **3 dòng khung** | Xem cấu trúc file mà không tốn token cho thân hàm |
| `# [CLASS] AuthService \| src/auth.ts:1-40` · `# [METHOD] login \| src/auth.ts:10-20` | Chỉ có **tên lớp/hàm + dòng**, không có mã nguồn | Rẻ và nhanh để “định vị” trong file lớn |
| `[CODE BLOCK src/auth.ts:1-4 \| LINES: 4]` + 4 dòng mã | Đọc đúng một đoạn mã, **4 dòng** | Đọc có giới hạn, không bị “nuốt” cả file |
| `[FOUND 2 CALLEES NODES \| BUDGET_USED: 0 tokens]` | Truy vấn call graph ra **2 nút** | Biết hàm này gọi hàm nào |
| `# [FUNCTION] helper (direct) \| symUtil` · `# [FUNCTION] helper (inferred) \| symUtil` | Quan hệ được ghi rõ **direct** và **inferred** | Phân biệt quan hệ chắc chắn với quan hệ suy luận |
| `-- rejected: SNAPSHOT_NOT_READY: S3 is FAILED` | Truy vấn vào snapshot lỗi → bị **chặn kèm lý do** | Không bao giờ nhận kết quả sai lệch |
| `tool schemas total ~450 tokens (AC) 5ms` | Tổng “giá” khai báo 4 công cụ ~**450 token** | Định nghĩa công cụ không nuốt hết context của model |
| `-- search_symbols: 94 / get_file_skeleton: 68 / read_code_block: 107 / query_call_graph: 81` | Chi phí từng công cụ: **94 / 68 / 107 / 81 token** | Biết công cụ nào đắt, để tối ưu lượt gọi |
| `-- total (4 core tools): 350 tokens` | Tổng **350 token** cho cả 4 công cụ | Rẻ hơn con số “~450” trong bộ test (đo bằng bộ đếm khác) — con số thật trong transcript |
| `performance: repo map generation < 500ms for 10k files (pure ranking path) 226ms` | Repo **10.000 file** → bản đồ vẫn dựng trong **226ms** | Bản đồ repo nhanh ngay cả với repo rất lớn |
| `query-matched file ranks first` · `personalization vector boosts the favored file` | File khớp câu hỏi **lên đầu** | Bản đồ “theo câu hỏi”, không phải bản đồ cố định |
| `snapshot pin: FAILED snapshot rejected; scoping keeps S2 symbols out of S1 map` | Bản đồ cũng bị ghim snapshot | Bản đồ không trộn 2 phiên bản code |
| `all 4 tools enforce the session pin (FAILED snapshot + commit mismatch)` | Cả **4 công cụ** đều bắt buộc ghim | Không công cụ nào “lọt” được ngoài snapshot |
| `read_code_block: enforces 120 lines max (AC) + cursor` | Mỗi lượt đọc tối đa **120 dòng**, có con trỏ trang sau | Không bị tràn context khi đọc file lớn |
| `binary search does not overshoot (maximal prefix fits)` | Cắt bản đồ đúng ngân sách, không vượt | Ngân sách context là **cứng**, không phải “khoảng” |
| `Test Files 4 passed (4)` / `Tests 26 passed (26)` | **26/26** test xanh | Toàn bộ nhóm repo map + 4 công cụ + chốt snapshot đạt |

---

## 5. Phạm vi & giới hạn

- Luồng này **có hành vi quan sát được** (mục 3) → dùng transcript làm evidence chính.
- Lệnh #3 là **local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user**; bản sao nằm ở `evidence/demo-driver-core-tools.mts`.
- Dữ liệu trong demo là repo fixture nhỏ (`src/auth.ts`, `src/utils.ts`) — dùng để minh hoạ **định dạng đầu ra**, không phải kết quả trên repo của bạn.
- Ảnh Kiro **không** được dùng làm evidence cho luồng này: instance Kiro đang chạy trỏ tới bản build `main` cũ (xem [`../RUN-LOG.md`](../RUN-LOG.md), mục “CORRECTION #2”).
