# Evidence — SSE reconnect & replay (không trùng, không thiếu)

**Luồng:** Luồng sự kiện bền vững — mất kết nối rồi kết nối lại vẫn nhận đủ sự kiện, không trùng không thiếu
**ES / AC:** ES-12 (SSE durable event log + `Last-Event-ID` replay), AC-16
**Transcript gốc:** [`evidence/.raw-sse.txt`](.raw-sse.txt) (1 file / 7 test) · [`evidence/.raw-agent.txt`](.raw-agent.txt) (mục SSE) · [`evidence/.raw-demo2.txt`](.raw-demo2.txt) (mục B)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| # | Exact command | Working dir | Timestamp transcript | Exit code | Kết quả lần chạy lại |
|---|---------------|-------------|----------------------|-----------|----------------------|
| 1 | `npx vitest run src/engine/agent/__tests__/sse-stream.test.ts --reporter=verbose` | `backend/` | `2026-11-16T02:07:37+07:00` | **0** | `Test Files 1 passed (1)` · `Tests 7 passed (7)` · `Duration 519ms` |
| 2 | `npx tsx C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e-411-demo2.mts` | `backend/` | `2026-11-16T02:05:26+07:00` | **0** | driver in-process, xem transcript mục 3 |

Timestamp capture exit code cho cả 2 lệnh: `2026-11-16T02:49:31+07:00`.
Bản driver đã sao chép vào evidence: [`evidence/demo-driver-patch-sse-resume.mts`](demo-driver-patch-sse-resume.mts).

> ⚠️ **Lệnh #2 là local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user.**

---

## 2. Output thật — bộ test (`.raw-sse.txt`)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

{"level":30,"time":1794769658203,"pid":40000,"hostname":"WIN-LK2TQOOAELR","name":"sse-stream","deleted":6,"msg":"[sse] retention pruned oldest prefix"}
{"level":30,"time":1794769658204,"pid":40000,"hostname":"WIN-LK2TQOOAELR","name":"sse-stream","deleted":2,"msg":"[sse] retention pruned oldest prefix"}
 ✓ src/engine/agent/__tests__/sse-stream.test.ts > SA4E-425 SSE durable event log & replay > durable BEFORE emission: frame returned only after the row exists 46ms
 ✓ src/engine/agent/__tests__/sse-stream.test.ts > SA4E-425 SSE durable event log & replay > frame format + Last-Event-ID parsing 6ms
 ✓ src/engine/agent/__tests__/sse-stream.test.ts > SA4E-425 SSE durable event log & replay > Last-Event-ID replay returns exactly the later sequence (AC) 8ms
 ✓ src/engine/agent/__tests__/sse-stream.test.ts > SA4E-425 SSE durable event log & replay > reconnect: 0 duplicates, 0 missing across a disconnect 9ms
 ✓ src/engine/agent/__tests__/sse-stream.test.ts > SA4E-425 SSE durable event log & replay > gap in the durable log → SseGapError (fail loud, never silent loss) 9ms
 ✓ src/engine/agent/__tests__/sse-stream.test.ts > SA4E-425 SSE durable event log & replay > retention policy: env-configurable, prunes oldest prefix, replay stays gapless 9ms
 ✓ src/engine/agent/__tests__/sse-stream.test.ts > SA4E-425 SSE durable event log & replay > integration: transitions/tools/evidence/approvals all replay in durable order 7ms

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  02:07:37
   Duration  533ms (transform 88ms, setup 24ms, import 262ms, tests 95ms, environment 0ms)
```

---

## 3. Output thật — hành vi quan sát được (`.raw-demo2.txt`, mục B)

```
### B. SSE DURABLE LOG + RECONNECT REPLAY ###
-- runId: 453800e4-9c2d-4bbe-9c1c-5a609ec0c863
-- event ids in log: [1, 2, 3, 4, 5, 6, 7]
-- reconnect with Last-Event-ID: 3 → received [4, 5, 6, 7]
-- duplicates: 0 | missing: 0
-- sample frame:
id: 4
event: STEP_STATUS
data: {"step":1}
```

---

## 4. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `-- event ids in log: [1, 2, 3, 4, 5, 6, 7]` | Nhật ký sự kiện có **mã tăng dần 1→7** | Mỗi sự kiện có định danh riêng, không mơ hồ |
| `-- reconnect with Last-Event-ID: 3 → received [4, 5, 6, 7]` | Kết nối lại với mã cuối đã thấy là **3** → nhận đúng **4, 5, 6, 7** | Chỉ nhận phần **còn thiếu**, không nhận lại phần cũ |
| `-- duplicates: 0 \| missing: 0` | **0 trùng · 0 thiếu** | AC-16 đạt — không mất và không lặp sự kiện |
| `-- sample frame: id: 4 / event: STEP_STATUS / data: {"step":1}` | Khung sự kiện có `id`, `event`, `data` | Bạn đọc được trạng thái từng bước theo thời gian thực |
| `durable BEFORE emission: frame returned only after the row exists 46ms` | Sự kiện chỉ được phát **sau khi** đã ghi xuống đĩa | Mất mạng là không mất sự kiện |
| `frame format + Last-Event-ID parsing 6ms` | Định dạng khung và cách đọc `Last-Event-ID` đúng chuẩn | Tương thích với client SSE tiêu chuẩn |
| `Last-Event-ID replay returns exactly the later sequence (AC) 8ms` | Replay trả về **đúng** dãy phía sau | Tính năng chính của AC-16 được xác nhận |
| `reconnect: 0 duplicates, 0 missing across a disconnect 9ms` | Ngắt kết nối rồi nối lại: **0 trùng, 0 thiếu** | Kịch bản mất kết nối giữa chừng an toàn |
| `gap in the durable log → SseGapError (fail loud, never silent loss) 9ms` | Phát hiện **khoảng trống** trong nhật ký → báo lỗi rõ ràng, **không im lặng bỏ sót** | Bạn được biết dữ liệu có vấn đề thay vì nhận kết quả sai |
| `retention policy: env-configurable, prunes oldest prefix, replay stays gapless 9ms` | Có chính sách **dọn bản ghi cũ** nhưng replay vẫn **không hở** | Nhật ký không phình vô hạn mà không mất tính đúng đắn |
| `[sse] retention pruned oldest prefix` (deleted: 6 / deleted: 2) | Hệ thống **tự dọn** phần cũ nhất theo chính sách | Bạn thấy việc dọn diễn ra rõ ràng trong log |
| `integration: transitions/tools/evidence/approvals all replay in durable order 7ms` | Chuyển trạng thái, lượt gọi công cụ, bằng chứng, yêu cầu duyệt — replay **đúng thứ tự** | Toàn bộ loại sự kiện đều replay được, không chỉ một loại |
| `Test Files 1 passed (1)` / `Tests 7 passed (7)` | **7/7** test xanh | Toàn bộ nhóm SSE đạt |

---

## 5. Phạm vi & giới hạn

- Luồng này **có hành vi quan sát được** (mục 3) → dùng transcript làm evidence chính.
- Lệnh #2 là **local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user**.
- `deleted: 6` / `deleted: 2` là số bản ghi cũ bị dọn trong test — **không phải** sự kiện bị mất (replay vẫn `0 missing`).
