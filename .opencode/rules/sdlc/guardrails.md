# SDLC Guardrails (agent-enforced)

Các kiểm tra sau được AGENT (LLM) thực hiện — không qua code cứng — nên dễ chỉnh sửa và portable trên mọi máy. Agent áp dụng chúng theo ngữ cảnh, không bắt buộc máy móc.

## 1. Drawio XML validation
Trước khi export hoặc commit một file `.drawio`, tự kiểm tra XML hợp lệ:
- Phải có thẻ gốc `<mxGraphModel>` và `</mxGraphModel>` tương ứng.
- Mọi thẻ phải cân bằng (mỗi `<tag>` có `</tag>`, hoặc tự đóng `<tag/>`).
- Nếu không hợp lệ → sửa trước khi export; không commit drawio lỗi.

## 2. Code-index freshness
Trước các phase SA (Design) và DEV (Implementation), đảm bảo code-intel index đang mới. Nếu codebase thay đổi nhiều, chạy lại indexer. Dùng code-intel dynamic tools (`find_tools` → `execute_dynamic_tool`) để query/refresh.

## 3. KB-first
Trước khi viết hoặc cập nhật bất kỳ document nào (BRD/FSD/TDD/STP/STC/UG/DPG/RLN), tìm kiếm knowledge base trước (`mem_search`) để tái dùng context và tránh trùng lặp.

## 4. Version-sync check
Khi bump version / tạo git tag, đảm bảo tag, package version, và README changelog nhất quán. Không tag nếu mismatch.

## 5. Memory sync
Sau khi sửa source code, ingest/cập nhật memory liên quan (`mem_ingest` / `mem_ingest_file`) để các agent khác cùng hưởng lợi.

## 6. Docker volume protection (SA4E-335)
Incident: `backend_postgres_data` bị xóa bằng `docker compose down -v` + `docker volume rm` → mất toàn bộ Postgres (ghi nhận tại `documents/SA4E-335/RUN-LOG.md`). Không lặp lại.

- ⛔ **Cấm tuyệt đối** trên stack prod (`sa4e-postgres`, `sa4e-backend`):
  `docker compose down -v`, `docker compose down --volumes`, `docker volume rm …`, `docker volume prune`, `docker system prune`, `docker rm -f sa4e-postgres`.
- ✅ `docker compose down` **không kèm `-v`** là an toàn (giữ volume).
- ✅ Test stack luôn qua script, project tách riêng: `npm run db:test:up` / `npm run db:test:down` (compose file `backend/docker-compose.test.yml`, project `sa4e-test`, volume `*_test_data`).
- ✅ Trước mọi thao tác có thể đụng tới DB: `npm run db:backup` (pg_dump + sqlite, retention 7 bản trong `backend/backups/`). Task Scheduler `SA4E-PG-Backup` chạy tự động 02:00 hàng ngày.
- 🚨 Nếu lỡ tay chạy lệnh bị cấm → báo ngay người dùng + ghi RUN-LOG, KHÔNG giấu/IMPROVISE data lại.
