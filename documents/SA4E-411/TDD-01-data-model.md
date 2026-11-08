# TDD-01: Data Model nền — Snapshot/Revision (CR-01..CR-06, 16K Doc §10)

- **Epic:** SA4E-411 | **Story chính:** SA4E-413 (thiết kế) — 414/415/416/417/419/423-426 (sử dụng)
- **Status:** Draft v1 (2026-11-08)
- **ADR ràng buộc:** ADR-001 — engine store = SQLite embedded per-workspace; PostgreSQL platform DB không đổi; migration phải dual-dialect (SQLite + PG)
- **Nền hiện tại:** engine/db migration framework (schema_version + migration-steps.ts + migration-v5.ts); F2 tables: files, modules, symbols, relationships, file_index, body_embeddings, memory tables (V4), project_id multi-tenant (V5)

## 1. Nguyên tắc thiết kế

1. **Additive-only migration (V6)**: mọi bảng mới được CREATE; **không sửa/xoá bảng F2 hiện có** (AC: no regression). Legacy `files/modules/symbols` tiếp tục phục vụ indexer hiện hành cho đến khi cutover (ngoài scope Epic này).
2. **Snapshot là ranh giới bất biến**: mọi artifact của 16K thuộc về đúng 1 `code_index_snapshot`. Không có cột mutable ngoài snapshot.
3. **Composite FK cho ownership**: các bảng con tham chiếu snapshot bằng composite FK `(snapshot_id, ...)` để bất khả thi việc ghép artifact của snapshot A với snapshot B.
4. **Dual-dialect**: DDL viết theo SQLite; đường PostgresAdapter dùng `database/migration/ddl-translator.ts` (infra có sẵn). Mapping: `INTEGER PRIMARY KEY AUTOINCREMENT → BIGINT IDENTITY`, `TEXT → TEXT`, bỏ `PRAGMA`, `UNIQUE`/`CHECK` giữ nguyên.
5. **Idempotent**: mọi migration step check `pragma_table_info`/information_schema trước khi tác động (theo pattern migration-v5.ts).

## 2. Sơ đồ phân cấp (text ER)

```
repository 1──n git_commit 1──n git_commit_parent (n-n parent, parent_order)
repository 1──n git_ref (BRANCH|TAG → target_commit_id, mutable)
repository 1──n source_file_revision (UNIQUE commit_id+relative_path)
repository 1──n code_index_snapshot (UNIQUE repository_id+commit_id+config_fingerprint+code_model_version)
repository 1──n repository_ref_index_state (UNIQUE repository_id+ref_name → active snapshot)
code_index_snapshot 1──n [artifacts]: code_symbol, symbol_occurrence,
    symbol_occurrence_resolution, symbol_relationship, relationship_evidence,
    code_chunk, dependency_resolution_snapshot
code_index_snapshot 1──n embedding_set 1──n code_embedding (n-1 code_chunk)
repository 1──n chat_session (pin commit + snapshot) 1──n agent_run
agent_run 1──n {agent_plan, agent_step, agent_state_transition,
    agent_tool_execution, retrieval_evidence, agent_workspace,
    change_set, approval_request, execution_run}
```

## 3. DDL — nền tảng (§10.1–10.3, 10.5)

### 3.1 Repository / Commit (§10.1)

```sql
CREATE TABLE repository (
  id            TEXT PRIMARY KEY,              -- uuid
  origin_url    TEXT,
  display_name  TEXT NOT NULL,
  created_at    TEXT NOT NULL                  -- ISO-8601
);

CREATE TABLE git_commit (
  id            TEXT PRIMARY KEY,              -- uuid (không dùng sha làm PK: 1 sha có thể index nhiều lần)
  repository_id TEXT NOT NULL REFERENCES repository(id),
  commit_sha    TEXT NOT NULL,
  author        TEXT, committer TEXT,
  committed_at  TEXT,
  UNIQUE (repository_id, commit_sha)
);

CREATE TABLE git_commit_parent (
  commit_id        TEXT NOT NULL REFERENCES git_commit(id),
  parent_commit_id TEXT NOT NULL REFERENCES git_commit(id),
  parent_order     INTEGER NOT NULL CHECK (parent_order >= 0),
  PRIMARY KEY (commit_id, parent_commit_id)
);

CREATE TABLE git_ref (
  repository_id    TEXT NOT NULL REFERENCES repository(id),
  ref_name         TEXT NOT NULL,              -- refs/heads/main, refs/tags/v1
  ref_type         TEXT NOT NULL CHECK (ref_type IN ('BRANCH','TAG')),
  target_commit_id TEXT NOT NULL REFERENCES git_commit(id),
  updated_at       TEXT NOT NULL,
  PRIMARY KEY (repository_id, ref_name)
);
```

### 3.2 Source Revisions (§10.2)

```sql
CREATE TABLE source_file_revision (
  id            TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repository(id),
  commit_id     TEXT NOT NULL REFERENCES git_commit(id),
  relative_path TEXT NOT NULL,
  content_hash  TEXT NOT NULL,                 -- sha256
  object_path   TEXT,                          -- blob storage key (nếu lưu nội dung)
  language      TEXT, file_type TEXT,
  is_generated  INTEGER NOT NULL DEFAULT 0 CHECK (is_generated IN (0,1)),
  is_binary     INTEGER NOT NULL DEFAULT 0 CHECK (is_binary IN (0,1)),
  line_count    INTEGER CHECK (line_count >= 0),
  UNIQUE (commit_id, relative_path)
);
CREATE INDEX idx_sfr_repo ON source_file_revision(repository_id, relative_path);
```
- Không có `repository_file` mutable — path thuộc về đúng 1 revision.
- Rename = heuristic (không giả định identity) — xử lý ở indexer (SA4E-414), không ở schema.

### 3.3 Code Index Snapshot (§10.3)

```sql
CREATE TABLE code_index_snapshot (
  id                 TEXT PRIMARY KEY,
  repository_id      TEXT NOT NULL REFERENCES repository(id),
  commit_id          TEXT NOT NULL REFERENCES git_commit(id),
  config_fingerprint TEXT NOT NULL,            -- hash của indexer config
  code_model_version TEXT NOT NULL,            -- version grammar/analyzer
  toolchain_manifest TEXT,                     -- json: tree-sitter/adapter versions
  status             TEXT NOT NULL
                     CHECK (status IN ('PENDING','BUILDING','READY','FAILED','SUPERSEDED')),
  diagnostics        TEXT,                     -- json: warnings/errors tóm tắt
  created_at         TEXT NOT NULL,
  UNIQUE (repository_id, commit_id, config_fingerprint, code_model_version)
);
```

**Artifact tables — snapshot-scoped** (khổ chung: `id TEXT PK, snapshot_id TEXT NOT NULL`):

| Bảng | Cột chính | Ghi chú |
|---|---|---|
| `code_symbol` | snapshot_id, sfr_id→source_file_revision, parent_id→code_symbol, module_id→code_module, name, kind, signature, start_line/end_line, start_col/end_col, doc_comment, complexity | `code_module` = module snapshot-scoped (khác legacy `modules`) |
| `symbol_occurrence` | snapshot_id, symbol_id, sfr_id, line, col, kind(DEF/REF/IMPORT), confidence REAL CHECK 0..1 | |
| `symbol_occurrence_resolution` | occurrence_id, resolved_symbol_id, resolution_kind(EXACT/HEURISTIC/EXTERNAL), confidence | |
| `symbol_relationship` | snapshot_id, from_symbol_id, to_symbol_id, kind(CALLS/IMPORTS/INHERITS/USES), confidence | |
| `relationship_evidence` | relationship_id, occurrence_id, evidence_kind, excerpt | composite FK về cùng snapshot |
| `code_chunk` | snapshot_id, symbol_id (nullable), sfr_id, chunk_index, start_line/end_line, content_ref, token_count | FTS5 shadow table `code_chunk_fts` |
| `dependency_resolution_snapshot` | snapshot_id, module_id, repository_id, dep_name, dep_version, resolved_ref | |

### 3.4 Embedding Set (§10.4) — tách khỏi snapshot

```sql
CREATE TABLE embedding_set (
  id                     TEXT PRIMARY KEY,
  code_index_snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  model_key TEXT NOT NULL, model_version TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK (dimensions > 0),
  preprocessing_version TEXT NOT NULL, tokenizer_version TEXT NOT NULL,
  chunker_version TEXT NOT NULL,
  UNIQUE (code_index_snapshot_id, model_key, model_version, preprocessing_version)
);
CREATE TABLE code_embedding (
  embedding_set_id TEXT NOT NULL REFERENCES embedding_set(id),
  chunk_id TEXT NOT NULL REFERENCES code_chunk(id),
  embedding BLOB NOT NULL,                     -- float32[] packed; pg: vector khi nâng cấp
  PRIMARY KEY (embedding_set_id, chunk_id)
);
```
- Đổi embedding model **không phải reparse**: tạo `embedding_set` mới cùng snapshot.

### 3.5 Active Pointer (§10.5)

```sql
CREATE TABLE repository_ref_index_state (
  repository_id TEXT NOT NULL REFERENCES repository(id),
  ref_name      TEXT NOT NULL,
  active_code_index_snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  generation    INTEGER NOT NULL CHECK (generation >= 0),
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (repository_id, ref_name)
);
```

## 4. Chat Session & Agent Run (§10.6)

```sql
CREATE TABLE chat_session (
  id TEXT PRIMARY KEY,
  repository_id TEXT NOT NULL REFERENCES repository(id),
  commit_id TEXT NOT NULL REFERENCES git_commit(id),
  pinned_code_index_snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  model_config_snapshot TEXT,                  -- json
  created_at TEXT NOT NULL,
  -- invariant: snapshot phải thuộc (repository_id, commit_id) — enforced bằng trigger + app-level check
);

CREATE TABLE agent_run (
  id TEXT PRIMARY KEY, chat_session_id TEXT NOT NULL REFERENCES chat_session(id),
  started_at TEXT, finished_at TEXT, status TEXT CHECK (status IN ('RUNNING','COMPLETED','FAILED','CANCELLED'))
);
CREATE TABLE agent_plan (
  id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  version INTEGER NOT NULL, objective TEXT NOT NULL,
  acceptance_criteria TEXT, status TEXT CHECK (status IN ('DRAFT','APPROVED','EXECUTING','DONE','REJECTED'))
);
CREATE TABLE agent_step (
  id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  plan_id TEXT REFERENCES agent_plan(id),
  step_index INTEGER NOT NULL, dependency_ids TEXT,   -- json array step ids
  input_ref TEXT, output_ref TEXT, attempts INTEGER DEFAULT 0,
  status TEXT CHECK (status IN ('PENDING','RUNNING','DONE','FAILED','SKIPPED')),
  started_at TEXT, finished_at TEXT
);
CREATE TABLE agent_state_transition (
  id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  old_state TEXT, new_state TEXT, reason TEXT, at TEXT NOT NULL
);
CREATE TABLE agent_tool_execution (
  id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  step_id TEXT REFERENCES agent_step(id), tool_name TEXT NOT NULL,
  args_json TEXT, result_ref TEXT, status TEXT, started_at TEXT, finished_at TEXT
);
CREATE TABLE retrieval_evidence (
  id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  query TEXT, result_refs TEXT, score REAL CHECK (score >= 0), at TEXT NOT NULL
);
CREATE TABLE agent_workspace (
  id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  path TEXT NOT NULL, purpose TEXT, created_at TEXT,
  UNIQUE (agent_run_id, path)
);
CREATE TABLE change_set (
  id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  base_commit_id TEXT NOT NULL REFERENCES git_commit(id),
  summary TEXT, status TEXT CHECK (status IN ('OPEN','APPLIED','DISCARDED')), created_at TEXT
);
CREATE TABLE approval_request (
  id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  action TEXT NOT NULL, scope TEXT NOT NULL,
  proposed_changeset_id TEXT REFERENCES change_set(id),
  requested_user TEXT, decision TEXT CHECK (decision IN ('PENDING','APPROVED','REJECTED')),
  decision_time TEXT, decided_by TEXT
);
CREATE TABLE execution_run (
  id TEXT PRIMARY KEY, agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  change_set_id TEXT REFERENCES change_set(id),
  command TEXT, exit_code INTEGER, log_ref TEXT, started_at TEXT, finished_at TEXT
);
```
- SSE durable event log (SA4E-425) = bảng `agent_event` bổ sung khi implement 425 (extension của §10.6, cùng pattern).

## 5. Invariants (§10.7) — hiện thực hoá

1. **Same-snapshot ownership**: `code_symbol.parent_id`, `module_id`, `code_chunk.symbol_id`, `relationship_evidence` dùng **composite FK** về (id, snapshot_id) của bảng cha (yêu cầu UNIQUE(id, snapshot_id) trên bảng cha). Với SQLite (không enforce deferred composite FK nhiều cấp), composite FK được khai báo + **validate bằng trigger `ai/au_*`** — pattern dùng chung cho mọi artifact table.
2. **chat_session pin consistency**: trigger CHECK khi INSERT/UPDATE: `pinned_code_index_snapshot_id` phải có `(repository_id, commit_id)` khớp session.
3. **CHECK**: `start_line <= end_line`; offsets ≥ 0; `confidence ∈ [0,1]`; status/enum như khai báo.
4. **Multi-tenant (V5)**: mọi bảng 16K thêm `project_id TEXT NOT NULL` (khớp files/symbols hiện có); UNIQUE constraints đều gồm project_id khi cần.

## 6. Migration V6 — kế hoạch

- File: `backend/src/engine/db/migration-v6.ts` (pattern migration-v5.ts) + đăng ký vào migration-steps.ts.
- **Additive-only**: 25 bảng mới + index + trigger; chạm 0 bảng legacy (files/modules/symbols/relationships/file_index/body_embeddings/memory).
- Version: schema_version 6; idempotent per-table (check pragma_table_info).
- Dual-dialect: DDL SQLite gốc; PG qua `database/migration/ddl-translator.ts`; smoke test cả 2 adapter (SqliteAdapter.test + PostgresAdapter.test pattern).
- FTS5: `code_chunk_fts` (content-less shadow, external content = code_chunk) — chỉ SQLite; PG dùng GIN tsvector khi nâng cấp.

## 7. Traceability — story → entities

| Story | Dùng entities của | Ghi chú |
|---|---|---|
| SA4E-413 | 10.1, 10.2, 10.3, 10.5 (+10.7 invariants) | migration V6 + CRUD/invariant tests |
| SA4E-414 | 10.2, 10.3 | thứ tự index dependency-before-semantic trên source_file_revision → snapshot |
| SA4E-415 | 10.3, 10.5 | mọi query nhận `index_snapshot_id` bắt buộc |
| SA4E-416 / 423 | 10.6 | agent_run/plan/step/transition/approval persistence |
| SA4E-417 / 424 | change_set, approval_request, agent_workspace | patch protocol + sandbox |
| SA4E-419 | 10.4 | embedding_set/code_embedding trên code_chunk |
| SA4E-425 | agent_event (extension) | SSE durable log & replay |
| SA4E-426 | chat_session pin + repository_ref_index_state | API từ chối snapshot không khớp pin |

## 8. Test plan (map AC của SA4E-413)

| AC | Test |
|---|---|
| 6 entities + FK/CHECK | `migration-v6.test.ts` — unit per-table: create/CRUD/violation → must throw |
| Migration SQLite + PG | `migration-v6.test.ts` (SqliteAdapter) + `PostgresAdapter.test.ts` smoke DDL translated |
| Integration snapshot flow | `snapshot-flow.it.test.ts`: create repo/commit/snapshot → gắn artifact → query by snapshot_id → composite-FK violation bị chặn |
| No regression | toàn bộ suite hiện có pass (3532 tests) + schema.it.test.ts |

## 9. Open questions (chốt trước khi implement)

1. `object_path` blob storage: lưu nội dung file revision ở đâu (file system `.code-intel/blobs/` vs chỉ hash + re-read từ git)? → đề xuất: re-read từ git, không lưu blob trong MVP.
2. `embedding` BLOB float32 vs JSON: đề xuất float32 packed (nhỏ hơn 4×), đọc qua DataView.
3. ID strategy: uuid v7 (sortable) cho mọi PK TEXT.
