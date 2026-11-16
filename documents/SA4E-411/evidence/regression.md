# Evidence — Hồi quy (regression): không phá chức năng SDLC đang chạy

**Luồng:** Sau khi thêm lớp Code Agent 16K, toàn bộ chức năng SDLC cũ vẫn phải xanh
**ES / AC:** ES-16 (regression gate), AC-18
**Transcript gốc:** [`evidence/.raw-regression.txt`](.raw-regression.txt) (backend 1 file / 3 test) · [`evidence/.raw-ext-regression.txt`](.raw-ext-regression.txt) (extension 1 file / 9 test)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend` và `…\SA4E-411\extension`

---

## 1. Lệnh đã chạy

| # | Exact command | Working dir | Timestamp transcript | Exit code | Kết quả lần chạy lại |
|---|---------------|-------------|----------------------|-----------|----------------------|
| 1 | `npx vitest run src/engine/regression/__tests__/sa4e-regression.test.ts --reporter=verbose` | `backend/` | `2026-11-16T01:53:50+07:00` | **0** | `Test Files 1 passed (1)` · `Tests 3 passed (3)` · `Duration 834ms` |
| 2 | `npx vitest run src/__tests__/sa4e-regression.test.ts --reporter=verbose` | `extension/` | `2026-11-16T01:54:41+07:00` | **0** | `Test Files 1 passed (1)` · `Tests 9 passed (9)` · `Duration 364ms` |

Timestamp capture exit code cho cả 2 lệnh: `2026-11-16T02:49:31+07:00`.

---

## 2. Output thật — backend (`.raw-regression.txt`, trích các dòng kết quả)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

{"level":50,"time":1794768831495,"pid":10392,"hostname":"WIN-LK2TQOOAELR","name":"migrations","msg":"[migrations] Applying v1: Initial schema with FTS5"}
{"level":50,"time":1794768831502,"pid":10392,"hostname":"WIN-LK2TQOOAELR","name":"migrations","msg":"[migrations] v1 applied"}
{"level":30,"time":1794768831523,"pid":10392,"hostname":"WIN-LK2TQOOAELR","name":"migration-v5","msg":"[migrations] V5: multi-tenant project_id applied (legacy=default)"}
{"level":30,"time":1794768831531,"pid":10392,"hostname":"WIN-LK2TQOOAELR","name":"migration-v6","msg":"[migrations] V6: 16K data model applied (28 tables + FTS5 + ownership triggers)"}
 ✓ src/engine/regression/__tests__/sa4e-regression.test.ts > SA4E-429 F2 indexer regression on the V6 schema > migration V6 is additive: legacy tables, FTS5, graph and pragmas stay intact 90ms
 ✓ src/engine/regression/__tests__/sa4e-regression.test.ts > SA4E-429 F4 context assembly with the new retrieval model > assembles legacy symbol context (source + doc comment) on a V6 database 28ms
 ✓ src/engine/regression/__tests__/sa4e-regression.test.ts > SA4E-429 F4 context assembly with the new retrieval model > legacy symbols and snapshot symbols stay isolated on the same database 28ms

 Test Files  1 passed (1)
      Tests  3 passed (3)
   Start at  01:53:50
   Duration  985ms (transform 246ms, setup 24ms, import 654ms, tests 146ms, environment 0ms)
```

---

## 3. Output thật — extension (`.raw-ext-regression.txt`)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/extension

 ✓ src/__tests__/sa4e-regression.test.ts > SA4E-429 SM pipeline phase contract > exposes the 7 SDLC phases plus completed in canonical order 1ms
 ✓ src/__tests__/sa4e-regression.test.ts > SA4E-429 SM pipeline phase contract > PhaseRouter advances requirements → … → deployment → completed 0ms
 ✓ src/__tests__/sa4e-regression.test.ts > SA4E-429 SM pipeline phase contract > abort keeps the current phase and marks the pipeline HALTED 0ms
 ✓ src/__tests__/sa4e-regression.test.ts > SA4E-429 agent role boundaries > the responsibility matrix covers every agent with allowed + forbidden scopes 0ms
 ✓ src/__tests__/sa4e-regression.test.ts > SA4E-429 agent role boundaries > every matrix role maps to a real agent prompt with a description 110ms
 ✓ src/__tests__/sa4e-regression.test.ts > SA4E-429 agent role boundaries > SM prompt enforces coordinator-only role separation 0ms
 ✓ src/__tests__/sa4e-regression.test.ts > SA4E-429 agent role boundaries > each role never both creates and forbids the same artifact 0ms
 ✓ src/__tests__/sa4e-regression.test.ts > SA4E-429 agent role boundaries > keeps the critical cross-agent guards from AGENTS.md 0ms
 ✓ src/__tests__/sa4e-regression.test.ts > SA4E-429 agent role boundaries > role-scope filtering covers the operating roles and fails open for unknown ones 0ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  01:54:41
   Duration  2.05s (transform 73ms, setup 0ms, import 1.76s, tests 117ms, environment 0ms)
```

---

## 4. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `[migrations] Applying v1: Initial schema with FTS5` → `v1 applied` | Lớp dữ liệu gốc được dựng lại đúng | Nền tảng cũ vẫn dựng được |
| `V5: multi-tenant project_id applied (legacy=default)` | Bước V5 vẫn chạy | Không bỏ sót bước nào của lịch sử schema |
| `V6: 16K data model applied (28 tables + FTS5 + ownership triggers)` | Lớp 16K được thêm **cạnh** lớp cũ | Thêm tính năng mà không phá tính năng cũ |
| `migration V6 is additive: legacy tables, FTS5, graph and pragmas stay intact 90ms` | Bảng cũ, FTS5, đồ thị và **pragma** đều còn nguyên | Dữ liệu và tốc độ truy vấn của hệ thống cũ không bị ảnh hưởng |
| `assembles legacy symbol context (source + doc comment) on a V6 database 28ms` | Tính năng ghép ngữ cảnh cũ vẫn chạy trên lớp dữ liệu mới | Tính năng cũ không cần sửa gì để dùng được |
| `legacy symbols and snapshot symbols stay isolated on the same database 28ms` | Ký hiệu cũ và ký hiệu theo snapshot **không lẫn** | Hai thế giới dữ liệu cùng tồn tại an toàn |
| `exposes the 7 SDLC phases plus completed in canonical order 1ms` | Pipeline SDLC vẫn đủ **7 giai đoạn** đúng thứ tự | Quy trình bạn đang chạy không đổi |
| `PhaseRouter advances requirements → … → deployment → completed 0ms` | Chuyển giai đoạn vẫn đúng | Lệnh của bạn vẫn chạy đúng |
| `abort keeps the current phase and marks the pipeline HALTED 0ms` | Dừng giữa chừng → giữ nguyên giai đoạn, đánh dấu **HALTED** | Dừng an toàn, không mất trạng thái |
| `the responsibility matrix covers every agent with allowed + forbidden scopes 0ms` | Ma trận trách nhiệm đầy đủ cho mọi vai trò | Ranh giới vai trò không bị nới lỏng |
| `every matrix role maps to a real agent prompt with a description 110ms` | Mỗi vai trò có **prompt thật** | Không có vai trò “ảo” |
| `SM prompt enforces coordinator-only role separation 0ms` | SM chỉ điều phối, không làm thay vai trò khác | Không ai tự viết tài liệu của vai trò khác |
| `each role never both creates and forbids the same artifact 0ms` | Không vai trò nào vừa tạo vừa cấm cùng một loại đầu ra | Ma trận nhất quán |
| `keeps the critical cross-agent guards from AGENTS.md 0ms` | Các luật bắt buộc giữa các vai trò còn nguyên | An toàn quy trình không bị mất |
| `role-scope filtering covers the operating roles and fails open for unknown ones 0ms` | Bộ lọc vai trò phủ hết vai trò vận hành; vai trò lạ → **fail open** | Không vô tình chặn nhầm |
| `Test Files 1 passed (1)` / `Tests 3 passed (3)` (backend) | **3/3** test hồi quy backend xanh | Lớp dữ liệu cũ còn nguyên |
| `Test Files 1 passed (1)` / `Tests 9 passed (9)` (extension) | **9/9** test hồi quy extension xanh | Pipeline + vai trò agent còn nguyên |

---

## 5. Phạm vi & giới hạn

- Luồng này không có màn hình UI; evidence là transcript thật của engine trong worktree.
- **AC-18 trong BRD** còn gộp thêm `npm run build` exit 0 + `npm test` exit 0 (backend 500 file / 3825 pass / 19 skip; extension 443 file / 3469 pass / 6 skip). Lần chạy đó **đã diễn ra ở Phase 4** và được ghi trong `documents/SA4E-411/RUN-LOG.md` (mục “Build & Test Evidence (Final)”) — **không** được chạy lại trong phiên UG này, nên transcript tương ứng không nằm trong bộ evidence này. Không tự bịa số liệu cho phần đó.
- Hai lệnh trên chỉ là **nhóm hồi quy trọng tâm** của SA4E-429 (F2/F4 ở backend; pipeline + vai trò ở extension), không phải toàn bộ cổng hồi quy gồm 11 file / 63 test backend + 20 file / 155 test extension.
