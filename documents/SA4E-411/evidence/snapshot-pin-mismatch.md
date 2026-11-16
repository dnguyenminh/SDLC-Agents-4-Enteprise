# Evidence — Snapshot không khớp / phiên bản bị ghim sai

**Luồng:** Gửi yêu cầu tra cứu mà thiếu hoặc sai mã snapshot → bị từ chối rõ ràng, không trả kết quả sai
**ES / AC:** ES-13 (API pinned `index_snapshot_id` enforcement), AC-03
**Transcript gốc:** [`evidence/.raw-pinned.txt`](.raw-pinned.txt) (1 file / 5 test) · [`evidence/.raw-demo2.txt`](.raw-demo2.txt) (mục D)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| # | Exact command | Working dir | Timestamp transcript | Exit code | Kết quả lần chạy lại |
|---|---------------|-------------|----------------------|-----------|----------------------|
| 1 | `npx vitest run src/engine/api/__tests__/pinned-snapshot-guard.test.ts --reporter=verbose` | `backend/` | `2026-11-16T02:07:40+07:00` | **0** | `Test Files 1 passed (1)` · `Tests 5 passed (5)` · `Duration 597ms` |
| 2 | `npx tsx C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e-411-demo2.mts` | `backend/` | `2026-11-16T02:05:26+07:00` | **0** | driver in-process, xem transcript mục 3 |

Timestamp capture exit code cho cả 2 lệnh: `2026-11-16T02:49:31+07:00`.
Bản driver đã sao chép vào evidence: [`evidence/demo-driver-patch-sse-resume.mts`](demo-driver-patch-sse-resume.mts).

> ⚠️ **Lệnh #2 là local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user.**

---

## 2. Output thật — bộ test (`.raw-pinned.txt`)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > rejects missing session_id / index_snapshot_id (400 contract) 47ms
 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > rejects unknown session, mismatched snapshot, and non-READY snapshot 9ms
 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > valid request resolves the session pin; branch is echoed display metadata only 11ms
 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > middleware: 400 with error envelope on missing/mismatch, 200 + context on valid 23ms
 ✓ src/engine/api/__tests__/pinned-snapshot-guard.test.ts > SA4E-426 API pinned snapshot enforcement > integration AC #3: branch head moves, pinned old commit still queries S1 9ms

 Test Files  1 passed (1)
      Tests  5 passed (5)
   Start at  02:07:40
   Duration  621ms (transform 103ms, setup 23ms, import 357ms, tests 100ms, environment 0ms)
```

---

## 3. Output thật — hành vi quan sát được (`.raw-demo2.txt`, mục D)

```
### D. PINNED SNAPSHOT ENFORCEMENT (chat pinned to a commit) ###
-- branch head now points at: S2 (generation 2)
-- missing index_snapshot_id: rejected with SNAPSHOT_ID_REQUIRED (HTTP 400)
-- mismatched snapshot: rejected with SNAPSHOT_MISMATCH (HTTP 400)
-- unknown session: rejected with SESSION_NOT_FOUND (HTTP 400)
-- valid request → pinned snapshot S1, commit c1
-- query against pinned S1 still returns: [AuthService]
```

---

## 4. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `-- branch head now points at: S2 (generation 2)` | Nhánh đã chuyển sang **S2 (thế hệ 2)** | Nền tảng đã thay đổi so với lúc bạn bắt đầu |
| `-- missing index_snapshot_id: rejected with SNAPSHOT_ID_REQUIRED (HTTP 400)` | Thiếu mã snapshot → **HTTP 400** kèm mã `SNAPSHOT_ID_REQUIRED` | Bắt buộc chỉ định phiên bản — không đoán mò |
| `-- mismatched snapshot: rejected with SNAPSHOT_MISMATCH (HTTP 400)` | Mã snapshot không khớp phiên → **HTTP 400** kèm `SNAPSHOT_MISMATCH` | Không thể dùng nhầm phiên bản |
| `-- unknown session: rejected with SESSION_NOT_FOUND (HTTP 400)` | Phiên không tồn tại → **HTTP 400** kèm `SESSION_NOT_FOUND` | Lỗi rõ ràng, dễ xử lý |
| `-- valid request → pinned snapshot S1, commit c1` | Yêu cầu hợp lệ → dùng **S1 / commit c1** đúng như đã ghim | Kết quả bám đúng phiên bản đã chọn |
| `-- query against pinned S1 still returns: [AuthService]` | Truy vấn theo S1 **vẫn ra `[AuthService]`** dù nhánh đã đi xa | Kết quả cũ vẫn truy vấn được — AC-03 đạt |
| `rejects missing session_id / index_snapshot_id (400 contract) 47ms` | Hợp đồng **400** khi thiếu định danh | Rõ ràng, dễ xử lý ở phía client |
| `rejects unknown session, mismatched snapshot, and non-READY snapshot 9ms` | Từ chối cả 3 trường hợp: phiên lạ, snapshot lệch, snapshot chưa READY | Không có đường vòng nào |
| `valid request resolves the session pin; branch is echoed display metadata only 7ms` | Tên nhánh chỉ hiện để **đọc**, **không** quyết định dữ liệu | Nhánh đổi không làm đổi kết quả |
| `middleware: 400 with error envelope on missing/mismatch, 200 + context on valid 25ms` | Hợp đồng HTTP: **400 + nội dung lỗi** hoặc **200 + ngữ cảnh** | Client luôn biết mình đang ở trạng thái nào |
| `integration AC #3: branch head moves, pinned old commit still queries S1 9ms` | AC-03 đạt | Nhánh đi xa, phiên cũ vẫn trả kết quả đúng |
| `Test Files 1 passed (1)` / `Tests 5 passed (5)` | **5/5** test xanh | Toàn bộ nhóm chốt snapshot đạt |

---

## 5. Phạm vi & giới hạn

- Luồng này **có hành vi quan sát được** (mục 3) → dùng transcript làm evidence chính.
- Lệnh #2 là **local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user**.
- Ba mã lỗi `SNAPSHOT_ID_REQUIRED` / `SNAPSHOT_MISMATCH` / `SESSION_NOT_FOUND` là **thông báo hiển thị cho người dùng**; mã `SNAPSHOT_NOT_READY` trong [`query-core-tools.md`](query-core-tools.md) là trường hợp tương tự ở tầng công cụ.
