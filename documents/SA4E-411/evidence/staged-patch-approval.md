# Evidence — Staged patch: stage → approve → apply

**Luồng:** Đề xuất thay đổi → chờ phê duyệt → mới áp dụng; nếu file đã thay đổi trong lúc chờ thì huỷ an toàn
**ES / AC:** ES-06 (staged patch workflow), AC-13, AC-14
**Transcript gốc:** [`evidence/.raw-security.txt`](.raw-security.txt) (3 file / 27 test) · [`evidence/.raw-stagedpatch.txt`](.raw-stagedpatch.txt) (2 file / 17 test) · [`evidence/.raw-demo2.txt`](.raw-demo2.txt) (mục A, A2, A3)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| # | Exact command | Working dir | Timestamp transcript | Exit code | Kết quả lần chạy lại |
|---|---------------|-------------|----------------------|-----------|----------------------|
| 1 | `npx vitest run src/engine/security/__tests__/staged-patch.test.ts src/engine/security/__tests__/patch-protocol.test.ts src/engine/security/__tests__/sandbox.test.ts --reporter=verbose` | `backend/` | `2026-11-16T01:52:23+07:00` | **0** | `Test Files 3 passed (3)` · `Tests 27 passed (27)` · `Duration 1.05s` |
| 2 | `npx vitest run src/engine/security/__tests__/staged-patch.test.ts src/engine/security/__tests__/patch-protocol.test.ts --reporter=verbose` | `backend/` | `2026-11-16T02:07:34+07:00` | **0** | `Test Files 2 passed (2)` · `Tests 17 passed (17)` · `Duration 836ms` |
| 3 | `npx tsx C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e-411-demo2.mts` | `backend/` | `2026-11-16T02:05:26+07:00` | **0** | driver in-process, xem transcript mục 3 |

Timestamp capture exit code cho cả 3 lệnh: `2026-11-16T02:49:31+07:00`.
Bản driver đã sao chép vào evidence: [`evidence/demo-driver-patch-sse-resume.mts`](demo-driver-patch-sse-resume.mts).

> ⚠️ **Lệnh #3 là local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user.**

---

## 2. Output thật — bộ test (`.raw-security.txt`, trích các dòng quyết định)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

{"level":30,"time":1794768744084,"pid":39172,"hostname":"WIN-LK2TQOOAELR","name":"staged-patch","runId":"ab6bbf65-edac-438c-8bf4-70c0b9e001b7","file":"src/auth.ts","valid":true,"msg":"[staged-patch] staged"}
 ✓ src/engine/security/__tests__/staged-patch.test.ts > SA4E-424 staged patch workflow (AC #14 + approval gating) > pre-approval working-tree integrity (AC #14): stage never touches the tree 61ms
 ✓ src/engine/security/__tests__/staged-patch.test.ts > SA4E-424 staged patch workflow (AC #14 + approval gating) > full lifecycle: stage → approve → apply → tree updated, change_set APPLIED 19ms
 ✓ src/engine/security/__tests__/staged-patch.test.ts > SA4E-424 staged patch workflow (AC #14 + approval gating) > stale-base at APPLY time (drift during approval wait) → tree untouched, change_set stays OPEN 24ms
 ✓ src/engine/security/__tests__/staged-patch.test.ts > SA4E-424 staged patch workflow (AC #14 + approval gating) > ALREADY_APPLIED: double-apply rejected 12ms
 ✓ src/engine/security/__tests__/staged-patch.test.ts > SA4E-424 staged patch workflow (AC #14 + approval gating) > invalid patch still stages a record (audit trail) but valid=false; REJECTED decision blocks apply 8ms
 ✓ src/engine/security/__tests__/staged-patch.test.ts > SA4E-424 staged patch workflow (AC #14 + approval gating) > discard() marks DISCARDED and blocks later apply even when approved 8ms
 ✓ src/engine/security/__tests__/staged-patch.test.ts > SA4E-424 staged patch workflow (AC #14 + approval gating) > security audit checklist: all §12/§13 rules verified in one pass 10ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 Patch Protocol > applies a valid patch atomically (hash chain verified) 6ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 Patch Protocol > rejects STALE_BASE when the file drifted after base hash (AC) 5ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 Patch Protocol > rejects path traversal attempts (AC) 2ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 Patch Protocol > rejects symlink/second-path escape outside the workspace 10ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 Patch Protocol > rejects oversized patches (PATCH_TOO_LARGE) 3ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 Patch Protocol > rejects workspace mismatch 2ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 Patch Protocol > rejects EXPECTED_HASH_MISMATCH without writing (atomicity) 3ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 Patch Protocol > rejects patches claiming a non-empty base on a missing file (FILE_NOT_FOUND) 2ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 Patch Protocol > supports CREATION patches: empty base hash + contained parent 9ms
 ✓ src/engine/security/__tests__/patch-protocol.test.ts > SA4E-417 sandbox path guard > rejects traversal/absolute at the guard level 1ms

 Test Files  3 passed (3)
      Tests  27 passed (27)
   Start at  01:52:23
   Duration  1.08s (transform 122ms, setup 37ms, import 436ms, tests 190ms, environment 0ms)
```

Nhóm `.raw-stagedpatch.txt` (2 file / **17 passed**, `Start at 02:07:34`, `Duration 882ms`) chạy lại đúng 2 file ở trên — xem `.raw-stagedpatch.txt`.

---

## 3. Output thật — hành vi quan sát được (`.raw-demo2.txt`, mục A / A2 / A3)

```
### A. STAGED PATCH: stage → approve → apply ###
{"level":30,"time":1794769526212,"pid":51728,"hostname":"WIN-LK2TQOOAELR","name":"patch-protocol","file":"src/auth.ts","newHash":"a9de69a78c1f","msg":"[patch-protocol] applied atomically"}
{"level":30,"time":1794769526212,"pid":51728,"hostname":"WIN-LK2TQOOAELR","name":"staged-patch","runId":"a924dc6d-1d1f-4a65-af3d-c7532975ce59","file":"src/auth.ts","valid":true,"msg":"[staged-patch] staged"}
-- runId: a924dc6d-1d1f-4a65-af3d-c7532975ce59
-- changeSetId: 8f41ce97-2d8b-4e79-9141-469c3342d69f | approvalId: 01c6b82f-f855-40b4-b24a-e7916c35e3e5 | valid: true
-- working tree changed by stage? false  (expected: false)
-- change_set status: OPEN | approval decision: PENDING
-- apply before approval → applied=false rejected=NOT_APPROVED
-- after approval → applied=true newHash=a9de69a78c1f421e1f811e7a31fd12be7e6c6dcc5a9682fab9a8a2e247a896e1
-- file content now: "const original = 2;\n"
-- change_set status: APPLIED

### A2. STALE BASE (file drifted while waiting for approval) ###
-- applied=false rejected=STALE_BASE (expected: STALE_BASE)
-- file content after rejected apply: "const original = 99;\n"

### A3. PATH TRAVERSAL (target outside the workspace) ###
-- valid=false (expected: false)
-- file outside workspace created? false
```

---

## 4. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `-- working tree changed by stage? false  (expected: false)` | Đề xuất thay đổi **không** đụng vào code của bạn | Chỉ đề xuất, chưa áp dụng — an toàn tuyệt đối ở bước này |
| `-- change_set status: OPEN \| approval decision: PENDING` | Bộ thay đổi ở trạng thái **OPEN**, yêu cầu phê duyệt **PENDING** | Bạn thấy rõ “đang chờ ai duyệt” |
| `-- apply before approval → applied=false rejected=NOT_APPROVED` | Thử áp dụng khi **chưa** duyệt → **từ chối** | Không có đường vòng nào bỏ qua bước duyệt |
| `-- after approval → applied=true newHash=a9de69a78c1f421e1f811e7a31fd12be7e6c6dcc5a9682fab9a8a2e247a896e1` | Sau khi duyệt → **áp dụng thành công**, có **hash mới** đầy đủ | Bạn đối chiếu được file đã đổi |
| `-- file content now: "const original = 2;\n"` | Nội dung file mới đúng như đề xuất | Thay đổi đúng ý |
| `-- change_set status: APPLIED` | Bộ thay đổi chuyển sang **APPLIED** | Vòng đời đóng lại |
| `-- applied=false rejected=STALE_BASE` | File bị sửa trong lúc bạn chờ duyệt → áp dụng **bị từ chối** | Không ghi đè thay đổi của người khác |
| `-- file content after rejected apply: "const original = 99;\n"` | File giữ nguyên **nội dung người khác vừa sửa** | Bạn không mất việc của ai |
| `-- valid=false` + `-- file outside workspace created? false` | Đường dẫn ngoài workspace → **từ chối**, **không tạo file nào** | Không thể ghi ra ngoài thư mục dự án |
| `stage → approve → apply → tree updated, change_set APPLIED 19ms` | Vòng đời đầy đủ được kiểm chứng | Luồng chuẩn hoạt động |
| `pre-approval working-tree integrity (AC #14): stage never touches the tree 61ms` | AC-14 đạt | Working tree của bạn **không đổi** trước khi duyệt |
| `stale-base at APPLY time (drift during approval wait) → tree untouched, change_set stays OPEN 24ms` | AC-13 đạt: base lệch → cây mã **không đổi**, bộ thay đổi vẫn **OPEN** | Bạn có thể sửa lại rồi duyệt lại |
| `ALREADY_APPLIED: double-apply rejected 12ms` | Áp dụng 2 lần → **từ chối** | Không áp dụng trùng |
| `invalid patch still stages a record (audit trail) but valid=false; REJECTED decision blocks apply 8ms` | Bản sửa lỗi **vẫn được ghi nhận** (có vết) nhưng `valid=false`; quyết định **REJECTED** chặn áp dụng | Bạn luôn có dấu vết để tra lại |
| `discard() marks DISCARDED and blocks later apply even when approved 8ms` | Bỏ bỏ → **DISCARDED**, kể cả sau đó được duyệt cũng không áp dụng | Bỏ bỏ là bỏ bỏ thật |
| `security audit checklist: all §12/§13 rules verified in one pass 10ms` | Toàn bộ quy tắc an toàn §12/§13 kiểm tra trong 1 lần | Không sót quy tắc nào |
| `applies a valid patch atomically (hash chain verified) 6ms` | Áp dụng **nguyên tử**, có xác minh chuỗi hash | File không bị ghi nửa chừng |
| `rejects EXPECTED_HASH_MISMATCH without writing (atomicity) 3ms` | Sai hash → **không ghi gì** | Không để lại file hỏng |
| `rejects patches claiming a non-empty base on a missing file (FILE_NOT_FOUND) 2ms` | Báo **FILE_NOT_FOUND** khi file nền không tồn tại | Lỗi rõ ràng |
| `supports CREATION patches: empty base hash + contained parent 9ms` | Tạo file mới vẫn được (base rỗng, thư mục cha hợp lệ) | Tạo file mới an toàn |
| `Test Files 3 passed (3)` / `Tests 27 passed (27)` | **27/27** test xanh | Toàn bộ nhóm staged patch + protocol + sandbox đạt |

---

## 5. Phạm vi & giới hạn

- Luồng này **có hành vi quan sát được** (mục 3) → dùng transcript làm evidence chính.
- Lệnh #3 là **local driver harness gọi trực tiếp engine thật — KHÔNG phải lệnh end-user**.
- File bị sửa trong demo là file tạm của fixture (`src/auth.ts`), không phải file trong repo của bạn.
