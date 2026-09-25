# Reference Analysis — SA4E-241

**Feature:** Incremental indexing cho Pega Rule Catalog — skip rule không đổi bằng checksum (save-time based)
**Pattern:** Checksum-based incremental indexing / cache invalidation (content-addressable + change detection)
**Ngày phân tích:** 2026-04-30
**Người thực hiện:** SM (Reference Analysis phase 2.5)

---

## 1. Bối cảnh & lý do cần Reference Analysis

Tính năng liên quan các pattern non-trivial:
- **Change detection** trên tập lớn (~17,978 rule) — cần chiến lược so sánh rẻ, tránh fetch toàn bộ.
- **Checksum/digest** làm khóa nhận diện thay đổi (giống git blob hash, content-addressable store).
- **State management** — lưu trạng thái "đã index" ở đâu (backend DB vs client-side cache).
- **Incremental invalidation** — chỉ xử lý delta (mới/đổi/xóa), giữ nguyên phần không đổi.

Các hệ thống dưới đây đã giải quyết đúng lớp bài toán này và cung cấp pattern kiểm chứng để đưa vào BRD/TDD.

---

## 2. Reference 1 — Git (object store + index/stat cache)

**Nguồn:** https://github.com/git/git — `read-cache.c`, `Documentation/technical/index-format.txt`, `Documentation/gitformat-index.txt`

### Kiến trúc
- **Object store content-addressable**: mỗi blob định danh bằng `sha1/sha256(header + content)`. Nội dung giống hệt → cùng hash → dedup tự nhiên, không lưu lại.
- **Index (staging) + stat cache**: file `.git/index` lưu cho mỗi path: `mtime`, `ctime`, `size`, `inode`, cùng object id (hash). Khi `git status`, Git **so `stat` trước** (rẻ) — nếu `mtime`+`size` khớp entry đã cache → coi như không đổi, **skip tính hash lại**. Chỉ khi stat khác mới đọc content + hash để xác nhận.

### Key patterns
- **Two-tier change detection**: tầng rẻ (metadata: mtime/size) trước, tầng đắt (content hash) chỉ khi cần. → chính là mô hình "save-time trước, checksum sau" của SA4E-241.
- **Content-addressable**: hash = danh tính. Cùng hash ⇒ skip.
- **Persistent index file**: trạng thái đã-biết được lưu bền vững giữa các lần chạy → tương đương "state đã index" của ta.
- **racy-git handling**: khi mtime của file == thời điểm ghi index (không phân biệt được thay đổi trong cùng giây) → Git đánh dấu "racily clean" và ép so content. → bài học về độ phân giải timestamp.

### Strengths
- Cực nhanh cho "no change" run (chỉ đọc stat, không đọc nội dung).
- Xử lý an toàn trường hợp timestamp không đủ phân giải.

---

## 3. Reference 2 — Bazel (action cache + digest, remote cache)

**Nguồn:** https://github.com/bazelbuild/bazel — docs `remote-caching`, `remote/` package; Remote Execution API (https://github.com/bazelbuild/remote-apis)

### Kiến trúc
- Mỗi input file được nhận diện bằng **digest = `{sha256, size_bytes}`** (Content Addressable Storage — CAS).
- Bazel dùng **fast digest**: nếu filesystem hỗ trợ, dùng mtime/size để bỏ qua việc tính lại digest cho file chưa đổi; chỉ tính sha256 khi metadata thay đổi.
- **Action cache**: key = hash(command + input digests + env). Nếu key đã có kết quả → skip thực thi, tái dùng output.

### Key patterns
- **Digest = hash + size**: dùng cả kích thước để giảm rủi ro va chạm và tăng tốc so sánh.
- **Bulk lookup (FindMissingBlobs)**: client hỏi server "trong tập digest này, cái nào server CHƯA có?" → server trả danh sách thiếu → client chỉ upload/fetch phần thiếu. → **đây chính xác là "Phương án 1 — Backend bulk-check" trong SA4E-241**: client gửi tập checksum, backend trả cái nào đổi/mới.
- **Skip-before-work**: quyết định skip trước khi làm việc nặng (giống "skip trước fetch").

### Strengths
- Bulk-check một vòng round-trip cho toàn tập → tối ưu cho 17,978 rule.
- Tách biệt "danh tính nội dung" khỏi "cách lưu" → dễ đổi backend store.

---

## 4. Reference 3 — Language Server / IDE index invalidation (rust-analyzer salsa, gopls)

**Nguồn:** https://github.com/rust-lang/rust-analyzer (crate `salsa`), https://github.com/golang/tools (gopls `snapshot`/file hashing)

### Kiến trúc
- **salsa (incremental computation)**: mỗi input có "durability" + revision. Khi input đổi, chỉ các truy vấn phụ thuộc mới bị invalidate; kết quả không phụ thuộc được tái dùng.
- **gopls**: mỗi file trong snapshot được gắn **content hash (FileID/hash)**. Khi file thay đổi trên đĩa, gopls so hash — nếu hash không đổi (dù mtime đổi) → **không invalidate downstream**, tránh reparse.

### Key patterns
- **Hash-based invalidation thay vì timestamp-only**: bảo vệ trước "touch file nhưng nội dung không đổi" (mtime đổi, content giữ nguyên).
- **Delta propagation**: chỉ phần phụ thuộc thay đổi mới được tính lại.
- **Idempotency**: chạy lại trên input không đổi ⇒ không phát sinh công việc.

### Strengths
- Tránh false-positive khi metadata đổi mà nội dung không đổi.
- Mô hình rõ ràng cho "phát hiện đổi ở nhiều nguồn" (data rule không có timestamp cũng bắt được qua save-time/hash).

---

## 5. Đối chiếu với thiết kế SA4E-241

| Khía cạnh | Prior-art | Áp dụng cho SA4E-241 |
|-----------|-----------|----------------------|
| Danh tính thay đổi | Git blob hash, Bazel digest, gopls file hash | `checksum = sha256(trim(pzInsKey)\|trim(pxUpdateDateTime)\|trim(pxSaveDateTime))` — hash các trường định danh + save-time |
| Two-tier detection | Git stat-cache → content hash | Save-time (pxSaveDateTime/pxUpdateDateTime) là tầng rẻ; checksum tổng hợp là khóa so sánh |
| Bulk change lookup | Bazel FindMissingBlobs | **Phương án 1**: endpoint bulk-check theo `pega_ins_key` → backend trả rule đổi/mới |
| Persistent state | Git `.git/index` | **Phương án 2**: `.pega-cache/rulecatalog-checksums.json` (client-side) |
| Hash-not-timestamp | gopls, salsa | Data rule không có timestamp → vẫn phát hiện đổi vì checksum gộp save-time; tránh false "changed" khi chỉ re-export |
| Content-addressable reuse | Git object store, Bazel CAS | Tái dùng cột `content_hash` ở backend chứa checksum mới (bỏ ngữ nghĩa hash full-JSON cũ) |
| Idempotency | salsa, Bazel action cache | AC: lần index thứ 2 (no change) skip ~100% |

---

## 6. Patterns nên đưa vào BRD/TDD

- [ ] **Two-tier / skip-before-fetch**: quyết định skip dựa trên checksum TRƯỚC khi fetch rule (giống Git stat-cache, Bazel skip-before-work).
- [ ] **Checksum = digest gộp định danh + save-time**, hex lowercase, separator `|`, null→`""` — công thức deterministic, client và Pega tính cùng cách (verify Cách A + Cách B).
- [ ] **Bulk-check một round-trip** (Phương án 1) theo mô hình Bazel FindMissingBlobs — tối ưu cho ~18k rule.
- [ ] **Client-side persistent cache** (Phương án 2) theo mô hình Git index — trạng thái đã-index bền vững giữa các lần chạy.
- [ ] **Hash-based invalidation** (không chỉ timestamp) — data rule/no-timestamp vẫn bắt được thay đổi; tránh false-positive khi metadata đổi mà nội dung không đổi.
- [ ] **Idempotency & no-op run**: chạy lại trên tập không đổi ⇒ gần như tức thì (đo bằng % skip).
- [ ] **Không phá luồng code git-based**: giữ nguyên checksum non-Pega = git blob hash, fallback `sha256(relativePath + NUL + content)`.
- [ ] **Xử lý timestamp resolution** (bài học racy-git): nếu chỉ dựa save-time có rủi ro độ phân giải, checksum gộp giảm thiểu; cần lưu ý trong NFR về độ tin cậy phát hiện đổi.

---

## 7. Ghi chú cho SA (2 Open Decisions)

Reference cho thấy CẢ HAI phương án đều có prior-art vững:
- **Phương án 1 (Backend bulk-check)** ↔ Bazel FindMissingBlobs — tốt khi cần nguồn sự thật tập trung, nhiều client, chống drift cache.
- **Phương án 2 (Client-side cache đĩa)** ↔ Git `.git/index` — tốt khi ưu tiên đơn giản, offline, giảm tải backend.

SA nên cân nhắc: multi-machine/multi-user drift (nghiêng P1), vs đơn giản/độ trễ thấp/không đổi schema backend (nghiêng P2). Có thể hybrid: cache client + xác nhận bulk-check định kỳ.
