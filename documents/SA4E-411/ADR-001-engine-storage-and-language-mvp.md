# ADR-001: Engine Storage & Language MVP cho Code Agent 16K

- **Ticket:** SA4E-412 (Phase 0 — Scope Decision) | **Epic:** SA4E-411
- **Status:** Accepted
- **Date:** 2026-11-08
- **Deciders:** Stakeholder (PG owner) + Dev Agent
- **References:** `documents/architecture/16K_CODE_AGENT_ARCHITECTURE.md` (§Storage, §F2 indexer), Epic SA4E-411 description

## 1. Context

Code Agent 16K cần một engine store cho: index symbols, FTS5, embeddings, immutable snapshots, agent state.

Trạng thái hiện tại có **hai lớp lưu trữ tách biệt**, không thay thế nhau:

| Lớp | Công nghệ hiện tại | Vai trò |
|---|---|---|
| **Platform DB** | PostgreSQL (`sa4e-postgres`, cả DEV và Prod, pg_dump backup 02:00 hàng ngày) | Orchestration, tickets, team KB, jobs |
| **Engine store (F2)** | SQLite file per-workspace (`.code-intel/index.db`) | Index symbols, FTS5, embeddings, snapshots |

Arch doc đề xuất *"SQLite primary (local-first, reuse F2), chỉ nâng PostgreSQL khi cần scaling multi-repo"* — điều này gây nhầm lẫn ban đầu ("chúng ta dùng PostgreSQL cho cả DEV và Prod"), vì hai vai trò trên chưa được tách bạch. Qua ADR này đã làm rõ: **ADR không thay đổi platform DB — PostgreSQL giữ nguyên.** Quyết định chỉ áp dụng cho engine store.

## 2. Decision

### D1 — Engine store: SQLite embedded, per-workspace (Option A — Hybrid)

- `index.db` (SQLite, WAL) nằm trong workspace (`.code-intel/`), do backend code-intel process mở trực tiếp (embedded library, không qua network).
- **Snapshot = file**: mỗi index generation là một file boundary bất biến — copy/pin/archive tức thì, đúng nguyên tắc Immutable Snapshot.
- PostgreSQL platform DB **không thay đổi** — tiếp tục là system-of-record cho platform.
- Mỗi worktree/máy có engine riêng: local-first, offline-capable, re-index hỏng chỉ ảnh hưởng cục bộ.

### D2 — Language MVP: toàn bộ grammar set hiện có (mở rộng so với arch doc)

- **17 ngôn ngữ Tier A** (extract symbol đầy đủ): typescript, javascript, kotlin, python, java, go, rust, apex, scala, c, cpp, csharp, ruby, php, swift, bash, powershell
- **Tier B** (độ sâu nhẹ hơn): xml, sql, properties, yml, yaml, html, css
- Đây là **quyết định mở rộng scope của stakeholder** so với đề xuất ban đầu "Java + TS end-to-end, ngôn ngữ khác chỉ syntax fallback". Điều chỉnh: các ngôn ngữ trên 16K đều là ngôn ngữ *đã được engine hỗ trợ sẵn* — không phải công việc mới; ngược lại việc *thêm ngôn ngữ mới* nằm ngoài MVP.

## 3. Alternatives Considered

**Option B — PostgreSQL cho cả engine** (engine tables + pgvector trong sa4e-postgres):
- Ưu: một công nghệ infra duy nhất; sẵn sàng multi-repo tập trung.
- Bị loại vì: snapshot phải mô hình hoá bằng bảng + versioning + dump/restore (phức tạp hoá nguyên tắc Immutable Snapshot); engine phụ thuộc server PG (mất local-first/offline); phải migration cho toàn bộ Phase 1 trong khi nhu cầu multi-repo tập trung chưa phát sinh ở MVP.

## 4. Consequences

- ✅ Giữ nguyên 100% deployment shape hiện tại; Phase 1 (SA4E-413 CR-01..06 data model) thiết kế trên SQLite schema v4/v5 hiện có.
- ✅ Embeddings tiếp tục dùng bảng SQLite hiện có (FTS5 + embeddings); **không đưa pgvector vào trong MVP**.
- ⚠️ Giới hạn chấp nhận: không có truy vấn tập trung chéo-workspace; mỗi workspace tự quản index của mình.
- 📌 **Trigger nâng cấp engine lên PostgreSQL** (ghi lại để có điều kiện rõ ràng):
  1. Cần 1 service tập trung phục vụ nhiều user/nhiều repo đồng thời (multi-team);
  2. Yêu cầu sản phẩm: tìm kiếm chéo repo toàn công ty;
  3. Đồng thời write từ nhiều process trên cùng một index.
- Language: thêm ngôn ngữ mới = out of MVP scope; mở rộng grammar chỉ khi có ticket riêng.

## 5. Unblocks

- SA4E-413 (CR-01..06 Snapshot/Revision Data Model) — thiết kế ngay trên nền SQLite này.
- SA4E-419 (chunking/embedding) — áp cho toàn bộ 17 ngôn ngữ Tier A.
