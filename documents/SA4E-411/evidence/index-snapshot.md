# Evidence — Lập chỉ mục & mô hình Snapshot/Revision

**Luồng:** Lập chỉ mục code theo commit và tạo snapshot bất biến (immutable snapshot)
**ES / AC:** ES-02 (snapshot/revision data model), ES-03 (dependency-before-semantic), AC-01 … AC-08
**Transcript gốc:** [`evidence/.raw-ac01-08.txt`](.raw-ac01-08.txt) · **Exit code:** xem bảng bên dưới
**Nơi chạy:** worktree `SA4E-411` — `C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| Trường | Giá trị |
|--------|---------|
| Exact command | `npx vitest run src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts --reporter=verbose` |
| Working directory | `backend/` (worktree SA4E-411) |
| Test runner | Vitest `v4.1.12` |
| Timestamp transcript gốc | `2026-11-16T02:07:32+07:00` (`Start at 02:07:32`) |
| Timestamp capture exit code | `2026-11-16T02:49:31+07:00` |
| Exit code | **0** (`EXIT=0` — chạy lại đúng lệnh trên với wrapper bắt exit code) |
| Kết quả lần chạy lại | `Test Files 1 passed (1)` · `Tests 8 passed (8)` · `Duration 642ms (transform 116ms, setup 38ms, import 357ms, tests 104ms, environment 0ms)` |

> Lệnh chạy lại chỉ dùng để **bắt exit code**; nội dung transcript trên là bản ghi lần chạy đầu tiên (02:07:32) đã được SM xác minh.

---

## 2. Output thật

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

{"level":30,"time":1794769653596,"pid":30000,"hostname":"WIN-LK2TQOOAELR","name":"migration-v6","msg":"[migrations] V6: 16K data model applied (28 tables + FTS5 + ownership triggers)"}
 ✓ src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts > SA4E-427 acceptance criteria 01–08 > AC-01 re-index same commit with a new adapter → old snapshot intact 56ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts > SA4E-427 acceptance criteria 01–08 > AC-02 two embedding models on the same snapshot → no vector mixing 11ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts > SA4E-427 acceptance criteria 01–08 > AC-03 chat pinned to old commit keeps querying it after branch head moves 12ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts > SA4E-427 acceptance criteria 01–08 > AC-04 rename: old path correct at old commit, new path at new commit 6ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts > SA4E-427 acceptance criteria 01–08 > AC-05 delete: queryable at the old commit, absent at the delete commit 8ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts > SA4E-427 acceptance criteria 01–08 > AC-06 merge commit with two parents is indexed correctly 8ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts > SA4E-427 acceptance criteria 01–08 > AC-07 every artifact belongs to its required snapshot (DB-enforced) 10ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac01-08.test.ts > SA4E-427 acceptance criteria 01–08 > AC-08 vector/lexical queries never leak across snapshot or repository 13ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  02:07:32
   Duration  867ms (transform 162ms, setup 38ms, import 441ms, tests 127ms, environment 0ms)
```

---

## 3. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `RUN v4.1.12 …/SA4E-411/backend` | Bản chạy nằm trong **worktree SA4E-411**, không phải repo `main` | Evidence thuộc đúng nhánh/ticket đang nghiệm thu |
| `[migrations] V6: 16K data model applied (28 tables + FTS5 + ownership triggers)` | Mỗi lần chạy đều tạo lại lớp dữ liệu 16K cạnh dữ liệu cũ, **không xoá bảng cũ** | Migration là bổ sung (additive) — không phá dữ liệu F2 đang dùng |
| `AC-01 re-index same commit with a new adapter → old snapshot intact 56ms` | Lập chỉ mục lại cùng một commit không làm hỏng snapshot cũ | Bạn có thể đổi cấu hình lập chỉ mục mà vẫn truy vấn được kết quả cũ |
| `AC-02 two embedding models on the same snapshot → no vector mixing 11ms` | Dùng 2 model embedding khác nhau trên cùng 1 snapshot, vector không lẫn vào nhau | Đổi model embedding không cần lập chỉ mục lại và không làm hỏng kết quả tìm kiếm |
| `AC-03 chat pinned to old commit keeps querying it after branch head moves 12ms` | Nhánh code đã đi xa tiếp nhưng phiên chat vẫn trả lời theo commit cũ | Kết quả trả về luôn bám đúng phiên bản code bạn đã ghim |
| `AC-04 rename: old path correct at old commit, new path at new commit 6ms` | Đổi tên file: commit cũ trả về đường dẫn cũ, commit mới trả về đường dẫn mới | Không bị “mất file” khi ai đó đổi tên |
| `AC-05 delete: queryable at the old commit, absent at the delete commit 8ms` | Xoá file: vẫn tra cứu được ở commit cũ, không còn ở commit đã xoá | Lịch sử truy vấn không bị “xóa sạch” theo thời gian |
| `AC-06 merge commit with two parents is indexed correctly 8ms` | Commit merge (2 parent) vẫn được lập chỉ mục đúng | Hợp nhất nhánh không làm sai dữ liệu |
| `AC-07 every artifact belongs to its required snapshot (DB-enforced) 10ms` | Mọi món dữ liệu (symbol, chunk, embedding) đều bị ràng buộc thuộc đúng 1 snapshot | Ràng buộc do chính database ép buộc, không phải do ứng dụng tự kiểm tra |
| `AC-08 vector/lexical queries never leak across snapshot or repository 13ms` | Tìm kiếm vector/từ khoá không bao giờ trả kết quả của snapshot hay repo khác | Không rò rỉ dữ liệu giữa các kho mã nguồn |
| `Test Files 1 passed (1)` / `Tests 8 passed (8)` | **8/8** tiêu chí AC-01…AC-08 đạt | Toàn bộ tiêu chí nghiệm thu của nhóm này đều xanh |
| `Duration 867ms (transform 162ms, setup 38ms, import 441ms, tests 127ms, environment 0ms)` | Cả nhóm kiểm tra chạy mất **0.87 giây** | Nhanh — không làm chậm quy trình lập chỉ mục hằng ngày |

---

## 4. Phạm vi & giới hạn

- Transcript chứng minh **hành vi của engine lập chỉ mục** trên cơ sở dữ liệu SQLite trong bộ test — không phải ảnh chụp màn hình Kiro.
- Không có màn hình UI mới cho luồng này (SA4E-411 không thêm UI), nên **không có ảnh Kiro** cho flow này. Xem [`evidence/query-core-tools.md`](query-core-tools.md) cho phần có hành vi quan sát được.
- Số liệu `Time 1794769653596` trong log là timestamp epoch (ms) của logger `pino`, giữ nguyên từ transcript gốc.
