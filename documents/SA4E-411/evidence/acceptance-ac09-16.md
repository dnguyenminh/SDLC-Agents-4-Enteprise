# Evidence — Bộ tiêu chí nghiệm thu AC-09 … AC-16

**Luồng:** Kiểm chứng các tiêu chí nghiệm thu còn lại (độ chính xác truy vấn, chạy lại ngữ nghĩa, cách ly lỗi phụ thuộc, resume, patch, sandbox, SSE)
**ES / AC:** ES-14 (bộ 17 tiêu chí nghiệm thu), AC-09, AC-10, AC-11, AC-12, AC-13, AC-14, AC-15, AC-16
**Transcript gốc:** [`evidence/.raw-ac09-12.txt`](.raw-ac09-12.txt) (1 file / 4 test) · [`evidence/.raw-ac13-16.txt`](.raw-ac13-16.txt) (1 file / 4 test)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| # | Exact command | Working dir | Timestamp transcript | Exit code | Kết quả lần chạy lại |
|---|---------------|-------------|----------------------|-----------|----------------------|
| 1 | `npx vitest run src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts --reporter=verbose` | `backend/` | `2026-11-16T01:50:09+07:00` | **0** | `Test Files 1 passed (1)` · `Tests 4 passed (4)` · `Duration 598ms` |
| 2 | `npx vitest run src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts --reporter=verbose` | `backend/` | `2026-11-16T01:51:00+07:00` | **0** | `Test Files 1 passed (1)` · `Tests 4 passed (4)` · `Duration 652ms` |

Timestamp capture exit code cho cả 2 lệnh: `2026-11-16T02:49:31+07:00`.

---

## 2. Output thật — AC-09 … AC-12 (`.raw-ac09-12.txt`)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

{"level":40,"time":1794768610322,"pid":15480,"hostname":"WIN-LK2TQOOAELR","name":"index-pipeline","err":{"type":"Error","message":"no JDK toolchain","stack":"Error: no JDK toolchain\n    at java (…/backend/src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts:71:37)"},"stage":"E_DEPENDENCY_RESOLUTION","language":"java","msg":"[pipeline] language-scoped failure"}
 ✓ src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts > SA4E-427 acceptance criteria 09–12 > AC-09 filtered recall + result-count on the multi-snapshot dataset 51ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts > SA4E-427 acceptance criteria 09–12 > AC-10 semantic re-run after dependency/classpath change (source unchanged) 10ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts > SA4E-427 acceptance criteria 09–12 > AC-11 dependency failure → no fake semantic coverage cascade 10ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac09-12.test.ts > SA4E-427 acceptance criteria 09–12 > AC-12 agent restart → resume from persisted plan/step/approval 11ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  01:50:09
   Duration  660ms (transform 132ms, setup 25ms, import 400ms, tests 83ms, environment 0ms)
```

---

## 3. Output thật — AC-13 … AC-16 (`.raw-ac13-16.txt`)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

{"level":30,"time":1794768660993,"pid":2916,"hostname":"WIN-LK2TQOOAELR","name":"patch-protocol","file":"src/auth.ts","newHash":"e901f9967ee7","msg":"[patch-protocol] applied atomically"}
{"level":30,"time":1794768660994,"pid":2916,"hostname":"WIN-LK2TQOOAELR","name":"staged-patch","runId":"89615dff-54eb-493f-93f6-f0f76fbf1f05","file":"src/auth.ts","valid":true,"msg":"[staged-patch] staged"}
 ✓ src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts > SA4E-427 acceptance criteria 13–16 > AC-13 patch rejects stale base hash and path traversal 74ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts > SA4E-427 acceptance criteria 13–16 > AC-14 original working tree unchanged before approval (AC #14) 41ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts > SA4E-427 acceptance criteria 13–16 > AC-15 sandbox: no workspace escape, no unrestricted network 7ms
 ✓ src/engine/acceptance/__tests__/acceptance-ac13-16.test.ts > SA4E-427 acceptance criteria 13–16 > AC-16 SSE reconnect + replay → no duplicate, no missing 12ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  01:51:00
   Duration  756ms (transform 145ms, setup 29ms, import 429ms, tests 135ms, environment 0ms)
```

---

## 4. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `AC-09 filtered recall + result-count on the multi-snapshot dataset 51ms` | Tìm kiếm trên nhiều snapshot → **đúng số kết quả** và **đúng tập kết quả** | Không trả thừa kết quả của snapshot khác |
| `AC-10 semantic re-run after dependency/classpath change (source unchanged) 10ms` | Đổi classpath (mã không đổi) → phần ngữ nghĩa **chạy lại** | Sửa dependency mà mã không sửa vẫn được phân tích lại đúng |
| `AC-11 dependency failure → no fake semantic coverage cascade 10ms` | Hỏng phụ thuộc → **không** sinh ra phủ ngữ nghĩa giả | Agent không “tưởng” đã hiểu code khi thực ra chưa hiểu |
| `no JDK toolchain` … `stage":"E_DEPENDENCY_RESOLUTION","language":"java"` | Kịch bản thiếu JDK được mô phỏng để kiểm tra cách ly lỗi | Lỗi phụ thuộc được ghi nhận đúng ngôn ngữ, không lan sang nơi khác |
| `AC-12 agent restart → resume from persisted plan/step/approval 11ms` | Khởi động lại → nối tiếp từ plan/step/approval đã lưu | Không mất tiến độ |
| `AC-13 patch rejects stale base hash and path traversal 74ms` | Base lệch **hoặc** đường dẫn độc hại → **từ chối** | Không ghi đè code người khác, không thoát workspace |
| `AC-14 original working tree unchanged before approval (AC #14) 41ms` | Working tree **không đổi** trước khi duyệt | Đề xuất thay đổi không đụng vào code bạn |
| `AC-15 sandbox: no workspace escape, no unrestricted network 7ms` | Không thoát workspace, không mạng tự do | Chạy công cụ an toàn |
| `AC-16 SSE reconnect + replay → no duplicate, no missing 12ms` | Kết nối lại → **không trùng, không thiếu** | Luồng sự kiện đáng tin cậy |
| `runId":"89615dff-54eb-493f-93f6-f0f76fbf1f05"` · `newHash":"e901f9967ee7"` | Mỗi lần chạy đều có **mã lần chạy** và **hash file** riêng | Bạn có thể dán mã lần chạy vào ticket làm bằng chứng |
| `Test Files 1 passed (1)` / `Tests 4 passed (4)` (mỗi nhóm) | **4/4** + **4/4** test xanh | 8 tiêu chí nghiệm thu AC-09…AC-16 đều đạt |

---

## 5. Phạm vi & giới hạn

- Luồng này không có màn hình UI; evidence là transcript thật của engine trong worktree.
- AC-01…AC-08 nằm ở [`index-snapshot.md`](index-snapshot.md); AC-17 nằm ở [`scratchpad-context-budget.md`](scratchpad-context-budget.md); AC-18 nằm ở [`regression.md`](regression.md).
