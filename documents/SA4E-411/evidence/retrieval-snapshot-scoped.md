# Evidence — Truy vấn theo snapshot (snapshot-scoped retrieval)

**Luồng:** Mọi truy vấn chỉ trả kết quả của đúng một snapshot đã ghim
**ES / AC:** ES-04 (snapshot-scoped retrieval), AC-07, AC-08, AC-09
**Transcript gốc:** [`evidence/.raw-retrieval.txt`](.raw-retrieval.txt)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend`

---

## 1. Lệnh đã chạy

| Trường | Giá trị |
|--------|---------|
| Exact command | `npx vitest run src/engine/retrieval/__tests__/snapshot-retrieval.test.ts --reporter=verbose` |
| Working directory | `backend/` (worktree SA4E-411) |
| Test runner | Vitest `v4.1.12` |
| Timestamp transcript gốc | `2026-11-16T02:07:44+07:00` (`Start at 02:07:44`) |
| Timestamp capture exit code | `2026-11-16T02:49:31+07:00` |
| Exit code | **0** (`EXIT=0` — chạy lại đúng lệnh trên với wrapper bắt exit code) |
| Kết quả lần chạy lại | `Test Files 1 passed (1)` · `Tests 10 passed (10)` · `Duration 549ms (transform 81ms, setup 23ms, import 268ms, tests 113ms, environment 0ms)` |

---

## 2. Output thật

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

{"level":30,"time":1794769665201,"pid":29392,"hostname":"WIN-LK2TQOOAELR","name":"migration-v6","msg":"[migrations] V6: 16K data model applied (28 tables + FTS5 + ownership triggers)"}
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > pinOrThrow: FAILED/unknown snapshot rejected; READY accepted 58ms
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > resolveActiveSnapshot: ref → active snapshot; re-point switches; FAILED active rejected 15ms
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > symbolByName: pinned to S1 returns ONLY S1 rows (same name exists in S2) 13ms
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > symbolByName ranks exact-definition > proven-reference > text-similarity 8ms
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > lexicalSearch: MATCH hits both snapshots physically, pin returns only S1 chunk 10ms
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > vectorSearch: only embeddings of the pinned snapshot participate 6ms
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > relationshipsOf separates direct (PROVEN) from inferred (heuristic) 7ms
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > discoverCategory: build/config/test are first-class, snapshot-scoped 7ms
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > hybridSearch fuses lexical + vector (+ graph chunks) under the pin 7ms
 ✓ src/engine/retrieval/__tests__/snapshot-retrieval.test.ts > SA4E-415 SnapshotRetrievalService — pin enforcement per path > all paths reject non-READY snapshots (unit per path) 6ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  02:07:44
   Duration  573ms (transform 83ms, setup 24ms, import 268ms, tests 138ms, environment 0ms)
```

---

## 3. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `pinOrThrow: FAILED/unknown snapshot rejected; READY accepted 58ms` | Truy vấn vào snapshot lỗi hoặc không tồn tại bị **từ chối ngay** | Bạn không bao giờ nhận kết quả từ một lần lập chỉ mục hỏng |
| `resolveActiveSnapshot: ref → active snapshot; re-point switches; FAILED active rejected 15ms` | Nhánh được trỏ sang commit mới → snapshot hoạt động đổi theo; nhưng nếu snapshot mới lỗi thì **không dùng** | “Đầu nhánh” luôn trỏ tới một snapshot sẵn sàng |
| `symbolByName: pinned to S1 returns ONLY S1 rows (same name exists in S2) 13ms` | Cùng một tên hàm tồn tại ở cả S1 và S2 → khi ghim S1, **chỉ S1** trả về | Không trộn kết quả giữa hai phiên bản code |
| `symbolByName ranks exact-definition > proven-reference > text-similarity 8ms` | Thứ tự ưu tiên: **định nghĩa đúng** → **tham chiếu đã chứng minh** → **giống văn bản** | Kết quả đúng định nghĩa luôn lên đầu, không phải kết quả “giống chữ” |
| `lexicalSearch: MATCH hits both snapshots physically, pin returns only S1 chunk 10ms` | Dữ liệu thực tế **có mặt** ở cả hai snapshot, nhưng kết quả trả về chỉ thuộc S1 | Bộ lọc snapshot hoạt động ở tầng truy vấn, không phải ở tầng lưu trữ |
| `vectorSearch: only embeddings of the pinned snapshot participate 6ms` | Tìm kiếm vector chỉ dùng vector của snapshot đã ghim | Không lẫn vector giữa các snapshot/model |
| `relationshipsOf separates direct (PROVEN) from inferred (heuristic) 7ms` | Quan hệ được chia làm **đã chứng minh** và **suy luận** | Bạn biết mối liên hệ nào chắc chắn, mối liên hệ nào chỉ là phỏng đoán |
| `discoverCategory: build/config/test are first-class, snapshot-scoped 7ms` | Tìm kiếm cấu hình build và file test cũng nằm trong phạm vi snapshot | Không bỏ sót loại thông tin hay tìm kiếm |
| `hybridSearch fuses lexical + vector (+ graph chunks) under the pin 7ms` | Tìm kiếm kết hợp từ khoá + vector + đồ thị, tất cả dưới cùng một ghim | Kết quả đầy đủ hơn, vẫn không vượt ranh giới snapshot |
| `all paths reject non-READY snapshots (unit per path) 6ms` | **Mọi** đường truy vấn đều từ chối snapshot chưa sẵn sàng | Ràng buộc áp dụng đồng đều, không có “lỗ hổng” ở đường nào |
| `Test Files 1 passed (1)` / `Tests 10 passed (10)` | **10/10** test xanh | Toàn bộ nhóm truy vấn theo snapshot đạt |
| `Duration 573ms` | Nhóm này chạy mất **0.57 giây** | Truy vấn không bị kéo dài |

---

## 4. Phạm vi & giới hạn

- Luồng này không có màn hình UI; evidence là transcript thật của engine trong worktree.
- AC-09 (độ chính xác cosine có bộ lọc) được kiểm chứng ở [`acceptance-ac09-16.md`](acceptance-ac09-16.md).
