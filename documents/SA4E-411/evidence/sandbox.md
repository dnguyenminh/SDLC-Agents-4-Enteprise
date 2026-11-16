# Evidence — Sandbox: công cụ an toàn, không thoát workspace, mạng chặn mặc định

**Luồng:** Kiểm soát đầu vào của công cụ, chặn lệnh shell, giới hạn container, chặn mạng
**ES / AC:** ES-06 (security sandbox), AC-15
**Transcript gốc:** [`evidence/.raw-sandbox.txt`](.raw-sandbox.txt) (1 file / 10 test)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| Trường | Giá trị |
|--------|---------|
| Exact command | `npx vitest run src/engine/security/__tests__/sandbox.test.ts --reporter=verbose` |
| Working directory | `backend/` (worktree SA4E-411) |
| Test runner | Vitest `v4.1.12` |
| Timestamp transcript gốc | `2026-11-16T02:07:36+07:00` (`Start at 02:07:36`) |
| Timestamp capture exit code | `2026-11-16T02:49:31+07:00` |
| Exit code | **0** (`EXIT=0` — chạy lại đúng lệnh trên với wrapper bắt exit code) |
| Kết quả lần chạy lại | `Test Files 1 passed (1)` · `Tests 10 passed (10)` · `Duration 271ms (transform 43ms, setup 25ms, import 96ms, tests 4ms, environment 0ms)` |

---

## 2. Output thật

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 tool arg schemas (4 core tools) > search_symbols: valid args pass; shell metachars rejected 1ms
 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 tool arg schemas (4 core tools) > get_file_skeleton: relative path required, absolute + traversal rejected 0ms
 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 tool arg schemas (4 core tools) > read_code_block: line ranges bounded, types enforced 0ms
 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 tool arg schemas (4 core tools) > query_call_graph: identifier + bounded depth/cap 0ms
 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 tool arg schemas (4 core tools) > unknown tool rejected 0ms
 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 tool arg schemas (4 core tools) > shell metachar set covers the dangerous characters 0ms
 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 sandbox — no shell concat, container limits, network > buildArgVector returns structured argv with -- separator (never a shell string) 0ms
 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 sandbox — no shell concat, container limits, network > rejects metacharacters in executable or args 0ms
 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 sandbox — no shell concat, container limits, network > container limits: defaults bounded, violations listed (AC) 0ms
 ✓ src/engine/security/__tests__/sandbox.test.ts > SA4E-417 sandbox — no shell concat, container limits, network > network denied by default; only allowlisted registries when enabled 0ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  02:07:36
   Duration  282ms (transform 44ms, setup 24ms, import 97ms, tests 4ms, environment 0ms)
```

---

## 3. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `search_symbols: valid args pass; shell metachars rejected 1ms` | Từ khoá bình thường → chạy; từ khoá chứa ký tự shell → **từ chối** | Không thể dùng công cụ tìm kiếm để chèn lệnh hệ thống |
| `get_file_skeleton: relative path required, absolute + traversal rejected 0ms` | Đường dẫn tuyệt đối (`C:\...`) hoặc `..` → **từ chối** | Công cụ chỉ đọc được trong workspace |
| `read_code_block: line ranges bounded, types enforced 0ms` | Khoảng dòng bị **giới hạn**, kiểu dữ liệu bị **kiểm tra** | Không đọc tràn file, không nhận sai kiểu dữ liệu |
| `query_call_graph: identifier + bounded depth/cap 0ms` | Đệ quy call graph có **trần độ sâu và số node** | Truy vấn đồ thị không thể treo máy |
| `unknown tool rejected 0ms` | Gọi công cụ lạ → **từ chối** | Chỉ công cụ đã khai báo mới chạy được |
| `shell metachar set covers the dangerous characters 0ms` | Danh sách ký tự nguy hiểm được **phủ đầy đủ** | Bộ chặn không bỏ sót ký tự |
| `buildArgVector returns structured argv with -- separator (never a shell string) 0ms` | Lệnh được dựng thành **danh sách tham số có `--`**, không nối thành chuỗi shell | Không bao giờ diễn giải lại chuỗi lệnh |
| `rejects metacharacters in executable or args 0ms` | Ký tự nguy hiểm trong **tên chương trình** lẫn **tham số** → từ chối | Chặn ở cả hai đầu |
| `container limits: defaults bounded, violations listed (AC) 0ms` | Container có **giới hạn mặc định có sẵn**, vi phạm được **liệt kê ra** | Bạn thấy rõ giới hạn nào bị vượt |
| `network denied by default; only allowlisted registries when enabled 0ms` | **Mạng bị chặn mặc định**; chỉ mở khi có danh sách cho phép | Không có chuyện agent tự do gọi ra ngoài |
| `Test Files 1 passed (1)` / `Tests 10 passed (10)` | **10/10** test xanh | Toàn bộ nhóm sandbox đạt |
| `Duration 282ms` | Nhóm này chạy mất **0.28 giây** | Kiểm tra an toàn không làm chậm quy trình |

---

## 4. Phạm vi & giới hạn

- Luồng này không có màn hình UI; evidence là transcript thật của engine trong worktree.
- AC-15 (không thoát workspace, không mạng tự do) được kiểm chứng ở [`acceptance-ac09-16.md`](acceptance-ac09-16.md).
- Các giới hạn container và danh sách registry cho phép nằm trong TDD, không lặp lại ở đây (UG không mang cấu hình).
