# Evidence — Thứ tự dependency-before-semantic khi lập chỉ mục

**Luồng:** Lập chỉ mục theo đúng thứ tự: phụ thuộc trước, ngữ nghĩa sau (A→J), cách ly lỗi theo từng ngôn ngữ
**ES / AC:** ES-03 (dependency-before-semantic ordering), AC-10, AC-11 (xem thêm [`acceptance-ac09-16.md`](acceptance-ac09-16.md))
**Transcript gốc:** [`evidence/.raw-pipeline.txt`](.raw-pipeline.txt)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| Trường | Giá trị |
|--------|---------|
| Exact command | `npx vitest run src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts src/engine/pipeline/__tests__/index-pipeline.order.test.ts src/engine/chunking/__tests__/ast-chunker.test.ts --reporter=verbose` |
| Working directory | `backend/` (worktree SA4E-411) |
| Test runner | Vitest `v4.1.12` |
| Timestamp transcript gốc | `2026-11-16T02:07:46+07:00` (`Start at 02:07:46`) |
| Timestamp capture exit code | `2026-11-16T02:49:31+07:00` |
| Exit code | **0** (`EXIT=0` — chạy lại đúng lệnh trên với wrapper bắt exit code) |
| Kết quả lần chạy lại | `Test Files 3 passed (3)` · `Tests 16 passed (16)` · `Duration 1000ms (transform 100ms, setup 34ms, import 365ms, tests 160ms, environment 0ms)` |

---

## 2. Output thật

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

{"level":40,"time":1794769666739,"pid":23296,"hostname":"WIN-LK2TQOOAELR","name":"index-pipeline","err":{"type":"Error","message":"no JDK toolchain","stack":"Error: no JDK toolchain\n    at java (…/backend/src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts:33:19)\n    at SnapshotIndexPipeline.runPerLanguage (…/backend/src/engine/pipeline/index-pipeline.ts:122:27)"},"stage":"E_DEPENDENCY_RESOLUTION","language":"java","msg":"[pipeline] language-scoped failure"}
{"level":40,"time":1794769666759,"pid":23296,"hostname":"WIN-LK2TQOOAELR","name":"index-pipeline","err":{"type":"Error","message":"LSP unavailable","stack":"Error: LSP unavailable\n    at typescript (…/backend/src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts:92:19)"},"stage":"F_SEMANTIC_INDEX","language":"typescript","msg":"[pipeline] language-scoped failure"}
{"level":40,"time":1794769666766,"pid":23296,"hostname":"WIN-LK2TQOOAELR","name":"index-pipeline","err":{"type":"Error","message":"invariant check failed","stack":"Error: invariant check failed\n    at handler (…/backend/src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts:107:17)"},"stage":"I_VALIDATION","msg":"[pipeline] single-stage failure"}
 ✓ src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts > SA4E-414 pipeline isolation, coverage & atomic publication > E failure for java does not block E/F for typescript (non-blocking rule) 47ms
 ✓ src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts > SA4E-414 pipeline isolation, coverage & atomic publication > publishes capability/coverage metadata per language onto the snapshot 9ms
 ✓ src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts > SA4E-414 pipeline isolation, coverage & atomic publication > marks partial when semantic binding fails after dependency resolution 6ms
 ✓ src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts > SA4E-414 pipeline isolation, coverage & atomic publication > atomic publication: hard failure at validation leaves snapshot FAILED, never READY 8ms
 ✓ src/engine/pipeline/__tests__/index-pipeline.isolation.test.ts > SA4E-414 pipeline isolation, coverage & atomic publication > happy path publishes READY with stage outcomes + coverage in diagnostics 6ms
 ✓ src/engine/pipeline/__tests__/index-pipeline.order.test.ts > SA4E-414 pipeline order & gating > executes all stages in canonical order A→J 46ms
 ✓ src/engine/pipeline/__tests__/index-pipeline.order.test.ts > SA4E-414 pipeline order & gating > stage D produces symbols without stage E; F gated off when E absent 9ms
 ✓ src/engine/pipeline/__tests__/index-pipeline.order.test.ts > SA4E-414 pipeline order & gating > stage F waits for stage E: sees E outcome via languageOutcomes 6ms
 ✓ src/engine/pipeline/__tests__/index-pipeline.order.test.ts > SA4E-414 pipeline order & gating > hard failure at a single stage aborts remaining stages (recorded as skipped-abort) 7ms
 ✓ src/engine/chunking/__tests__/ast-chunker.test.ts > SA4E-419 AST chunker — skeleton/body separation > produces 1 skeleton (class) + 2 body (methods) chunks 2ms
 ✓ src/engine/chunking/__tests__/ast-chunker.test.ts > SA4E-419 AST chunker — skeleton/body separation > body chunk carries the full method source slice + rng 1ms
 ✓ src/engine/chunking/__tests__/ast-chunker.test.ts > SA4E-419 AST chunker — skeleton/body separation > dependency subgraph attached per chunk (imports/calls/refs_types) 0ms
 ✓ src/engine/chunking/__tests__/ast-chunker.test.ts > SA4E-419 AST chunker — skeleton/body separation > token counts tracked per chunk (sig/skeleton/body) 0ms
 ✓ src/engine/chunking/__tests__/ast-chunker.test.ts > SA4E-419 AST chunker — skeleton/body separation > external symbols: signature-only chunk, no body (AC) 0ms
 ✓ src/engine/chunking/__tests__/ast-chunker.test.ts > SA4E-419 AST chunker — skeleton/body separation > embeddingText = [fp]+[sig]+[doc]+[deps.calls] — body NEVER included (AC) 0ms
 ✓ src/engine/chunking/__tests__/ast-chunker.test.ts > SA4E-419 retrieved-context budget (~8,000 tokens, §4) > assembles skeleton + bodies within budget; overflow truncated 1ms

 Test Files  3 passed (3)
      Tests  16 passed (16)
   Start at  02:07:46
   Duration  1.01s (transform 99ms, setup 35ms, import 356ms, tests 150ms, environment 0ms)
```

---

## 3. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `stage":"E_DEPENDENCY_RESOLUTION","language":"java" … "no JDK toolchain"` | Máy **không có JDK** → phần phụ thuộc Java báo lỗi | Một ngôn ngữ thiếu công cụ không được làm hỏng cả lần lập chỉ mục |
| `stage":"F_SEMANTIC_INDEX","language":"typescript" … "LSP unavailable"` | TypeScript cũng thiếu LSP | Mỗi ngôn ngữ được báo cáo riêng, không gộp lỗi chung |
| `E failure for java does not block E/F for typescript (non-blocking rule) 47ms` | Lỗi Java **không chặn** TypeScript | Repo đa ngôn ngữ vẫn lập chỉ mục được phần còn lại |
| `publishes capability/coverage metadata per language onto the snapshot 9ms` | Bạn thấy trạng thái hỗ trợ của từng ngôn ngữ ngay trên snapshot | Biết chính xác phần nào của repo đã được phân tích sâu, phần nào chỉ mới “cú pháp” |
| `marks partial when semantic binding fails after dependency resolution 6ms` | Snapshot được đánh dấu **PARTIAL** thay vì báo “xong” | Không bao giờ bị hiểu nhầm là đã phân tích đầy đủ |
| `atomic publication: hard failure at validation leaves snapshot FAILED, never READY 8ms` | Lỗi ở bước kiểm tra → snapshot **FAILED**, không bao giờ thành READY | Chỉ snapshot đạt mới được dùng để trả lời truy vấn |
| `executes all stages in canonical order A→J 46ms` | 10 giai đoạn A→J chạy đúng thứ tự | Không có bước nào chạy trước bước nó phụ thuộc |
| `stage D produces symbols without stage E; F gated off when E absent 9ms` | Ký hiệu (symbol) lấy được từ cú pháp; phần ngữ nghĩa **bị tắt** khi chưa giải được phụ thuộc | Không sinh ra kết quả ngữ nghĩa “bịa” khi môi trường chưa sẵn sàng |
| `stage F waits for stage E: sees E outcome via languageOutcomes 6ms` | Bước ngữ nghĩa **chờ** bước phụ thuộc xong | Đây chính là quy tắc “phụ thuộc trước, ngữ nghĩa sau” |
| `hard failure at a single stage aborts remaining stages (recorded as skipped-abort) 7ms` | Lỗi nặng ở 1 giai đoạn → các giai đoạn sau được ghi là **skipped-abort** | Bạn biết chính xác lần lập chỉ mục dừng ở đâu |
| `produces 1 skeleton (class) + 2 body (methods) chunks 2ms` | 1 khung lớp + 2 khối thân hàm được tách riêng | “Khung” (tên, chữ ký) luôn sẵn sàng; “thân” chỉ lấy khi thật cần |
| `embeddingText = [fp]+[sig]+[doc]+[deps.calls] — body NEVER included (AC) 0ms` | Phần thân hàm **không bao giờ** được nhúng vào vector | Vector tìm kiếm gọn, phần thân lấy riêng khi cần đọc |
| `external symbols: signature-only chunk, no body (AC) 0ms` | Thư viện ngoài chỉ lấy chữ ký | Không kéo cả mã nguồn thư viện về |
| `token counts tracked per chunk (sig/skeleton/body) 0ms` | Từng mảnh đều có số token riêng | Đếm ngân sách context chính xác, không ước lượng |
| `assembles skeleton + bodies within budget; overflow truncated 1ms` | Ghép khung + thân vừa ngân sách, phần dư bị cắt | Context luôn vừa hạn mức của model |
| `Test Files 3 passed (3)` / `Tests 16 passed (16)` | **16/16** test xanh | Toàn bộ nhóm thứ tự lập chỉ mục + tách khung/thân đạt |
| `Duration 1.01s` | Nhóm này chạy mất **1.01 giây** | Nhanh |

---

## 4. Phạm vi & giới hạn

- Hai dòng `level:40` (`no JDK toolchain`, `LSP unavailable`) là **tình huống lỗi được cố ý mô phỏng** trong test cách ly lỗi — không phải lỗi môi trường của máy bạn.
- Luồng này không có màn hình UI; evidence là transcript thật của engine trong worktree.
