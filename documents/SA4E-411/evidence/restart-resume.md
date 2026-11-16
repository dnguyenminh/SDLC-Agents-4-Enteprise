# Evidence — Khởi động lại & tiếp tục công việc (restart / resume)

**Luồng:** Agent bị khởi động lại giữa chừng vẫn tiếp tục đúng bước đang dở
**ES / AC:** ES-05 (agent persistence + recovery), AC-12
**Transcript gốc:** [`evidence/.raw-agent.txt`](.raw-agent.txt) (3 file / 17 test) · [`evidence/.raw-resume.txt`](.raw-resume.txt) (2 file / 10 test) · [`evidence/.raw-demo2.txt`](.raw-demo2.txt) (mục C)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| # | Exact command | Working dir | Timestamp transcript | Exit code | Kết quả lần chạy lại |
|---|---------------|-------------|----------------------|-----------|----------------------|
| 1 | `npx vitest run src/engine/agent/__tests__/sse-stream.test.ts src/engine/agent/__tests__/agent-state-recovery.test.ts src/engine/agent/__tests__/agent-persistence.test.ts --reporter=verbose` | `backend/` | `2026-11-16T01:52:40+07:00` | **0** | `Test Files 3 passed (3)` · `Tests 17 passed (17)` · `Duration 1.15s` |
| 2 | `npx vitest run src/engine/agent/__tests__/agent-persistence.test.ts src/engine/agent/__tests__/agent-state-recovery.test.ts --reporter=verbose` | `backend/` | `2026-11-16T02:07:39+07:00` | **0** | `Test Files 2 passed (2)` · `Tests 10 passed (10)` · `Duration 819ms` |
| 3 | `npx tsx C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e-411-demo2.mts` | `backend/` | `2026-11-16T02:05:26+07:00` | **0** | driver in-process, xem transcript mục 3 |

Timestamp capture exit code cho cả 3 lệnh: `2026-11-16T02:49:31+07:00`.
Bản driver đã sao chép vào evidence: [`evidence/demo-driver-patch-sse-resume.mts`](demo-driver-patch-sse-resume.mts).

> ⚠️ **Lệnh #3 là local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user.**

---

## 2. Output thật — bộ test (`.raw-agent.txt`, trích các dòng quyết định)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

stderr | src/engine/agent/__tests__/agent-persistence.test.ts > SA4E-416 agent persistence > FK ownership: every entity references agent_run (bad run id rejected)
sqlite3_step() rc= 787 SQLITE_CONSTRAINT_FOREIGNKEY SQL = INSERT INTO agent_step (id, project_id, agent_run_id, step_index, status) VALUES ('x', ?, 'nope', 9, 'PENDING')

 ✓ src/engine/agent/__tests__/agent-persistence.test.ts > SA4E-416 agent persistence > FK ownership: every entity references agent_run (bad run id rejected) 49ms
 ✓ src/engine/agent/__tests__/agent-persistence.test.ts > SA4E-416 agent persistence > restart resume: agent resumes from last completed step (AC #12) 11ms
 ✓ src/engine/agent/__tests__/agent-persistence.test.ts > SA4E-416 agent persistence > approval workflow: create → user decision → decision_time persisted 9ms
 ✓ src/engine/agent/__tests__/agent-persistence.test.ts > SA4E-416 agent persistence > durable event log BEFORE SSE: append → row committed, replay by Last-Event-ID 11ms
 ✓ src/engine/agent/__tests__/agent-persistence.test.ts > SA4E-416 agent persistence > reference-only payloads: large content rejected with PAYLOAD_TOO_LARGE (§15) 6ms
 ✓ src/engine/agent/__tests__/agent-persistence.test.ts > SA4E-416 agent persistence > state transitions recorded for the run 6ms
 ✓ src/engine/agent/__tests__/agent-state-recovery.test.ts > SA4E-423 agent state recovery > restart simulation: FULL resume from persisted state, zero in-memory state (AC #12 hard) 58ms
 ✓ src/engine/agent/__tests__/agent-state-recovery.test.ts > SA4E-423 agent state recovery > SSE replay (AC #16): no duplicate, no missing across reconnects 14ms
 ✓ src/engine/agent/__tests__/agent-state-recovery.test.ts > SA4E-423 agent state recovery > approval lifecycle: create → notify (event) → decide → persist + contiguity holds 9ms
 ✓ src/engine/agent/__tests__/agent-state-recovery.test.ts > SA4E-423 agent state recovery > unknown run → empty snapshot (no crash) 4ms

 Test Files  3 passed (3)
      Tests  17 passed (17)
   Start at  01:52:40
   Duration  1.21s (transform 118ms, setup 36ms, import 456ms, tests 298ms, environment 0ms)
```

Nhóm `.raw-resume.txt` (2 file / **10 passed**, `Start at 02:07:39`, `Duration 821ms`) chạy lại đúng 2 file ở trên — xem `.raw-resume.txt`.

---

## 3. Output thật — hành vi quan sát được (`.raw-demo2.txt`, mục C)

```
### C. RESUME AFTER RESTART (zero in-memory state) ###
-- runId: 725aca02-0c8a-4e43-adbc-bb77ae5c64ba
-- objective: implement payment retry
-- plan status: APPROVED
-- steps done: 1/2 | next step index: 1
-- resume point: lastCompletedStepIndex=0 nextStepId=3d5dfb83-6877-41d5-9675-502af20a7f74
```

---

## 4. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `-- objective: implement payment retry` | Sau khi khởi động lại, agent vẫn nhớ **mục tiêu** | Không phải làm lại từ đầu |
| `-- plan status: APPROVED` | Kế hoạch vẫn ở trạng thái **APPROVED** | Trạng thái phê duyệt được giữ nguyên |
| `-- steps done: 1/2 \| next step index: 1` | Đã xong **1/2** bước, bước kế tiếp là **index 1** | Tiếp tục đúng chỗ dừng |
| `-- resume point: lastCompletedStepIndex=0 nextStepId=3d5dfb83-6877-41d5-9675-502af20a7f74` | Có **mã bước kế tiếp** cụ thể | Bạn biết chính xác agent sẽ làm gì tiếp |
| `restart simulation: FULL resume from persisted state, zero in-memory state (AC #12 hard) 58ms` | AC-12 đạt: khôi phục **hoàn toàn** khi bộ nhớ trong RAM trống | Kể cả khởi động lại máy / extension host, vẫn nối tiếp được |
| `restart resume: agent resumes from last completed step (AC #12) 11ms` | Nối tiếp từ bước **đã hoàn thành gần nhất** | Không chạy lại bước đã xong |
| `approval workflow: create → user decision → decision_time persisted 9ms` | Quyết định duyệt và **thời điểm** duyệt được lưu | Biết ai duyệt lúc nào |
| `state transitions recorded for the run 6ms` | Mọi lần chuyển trạng thái đều được **ghi lại** | Có dấu vết để tra lại |
| `FK ownership: every entity references agent_run (bad run id rejected) 49ms` + `SQLITE_CONSTRAINT_FOREIGNKEY … agent_run_id … 'nope'` | Dữ liệu gắn với một lần chạy sai → **database từ chối** | Không có dữ liệu “mồ côi” |
| `reference-only payloads: large content rejected with PAYLOAD_TOO_LARGE (§15) 6ms` | Nội dung quá lớn → **từ chối**, chỉ lưu tham chiếu | Cơ sở dữ liệu không bị phình vô tội |
| `durable event log BEFORE SSE: append → row committed, replay by Last-Event-ID 11ms` | Sự kiện được ghi **trước** khi đẩy qua SSE | Không mất sự kiện khi kết nối đứt |
| `unknown run → empty snapshot (no crash) 4ms` | Mã lần chạy không tồn tại → trả về rỗng, **không crash** | Lỗi không làm sập phiên làm việc |
| `approval lifecycle: create → notify (event) → decide → persist + contiguity holds 9ms` | Vòng đời phê duyệt đầy đủ, thứ tự được giữ | Không có bước nào bị bỏ sót |
| `Test Files 3 passed (3)` / `Tests 17 passed (17)` | **17/17** test xanh | Toàn bộ nhóm lưu trữ + khôi phục đạt |
| `Test Files 2 passed (2)` / `Tests 10 passed (10)` | **10/10** test xanh (nhóm resume riêng) | Nhóm resume riêng cũng xanh |

---

## 5. Phạm vi & giới hạn

- Luồng này **có hành vi quan sát được** (mục 3) → dùng transcript làm evidence chính.
- Lệnh #3 là **local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user**.
- Dòng `stderr … SQLITE_CONSTRAINT_FOREIGNKEY` là **thông báo lỗi được cố ý kích hoạt** trong test ràng buộc — không phải lỗi môi trường.
- Phần SSE (replay) của cùng lần chạy nằm ở [`sse-replay.md`](sse-replay.md).
