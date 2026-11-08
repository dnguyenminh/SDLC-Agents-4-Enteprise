/**
 * SA4E-413 Migration V6 — PostgreSQL dialect for the 16K data model (CR-01..06).
 *
 * ADR-001: the engine runs on SQLite in MVP; this script is the maintained PG
 * counterpart so the documented upgrade trigger (ADR-001 §4) can be executed
 * without a redesign. Applied by the PG bootstrap path (pg-schema-ensure family),
 * NOT by runMigrations() (SQLite-only runner).
 *
 * Dialect differences vs SQLite (migration-v6.ts):
 *  - Same-snapshot ownership uses REAL composite FKs (PG enforces natively):
 *    every parent table carries UNIQUE (id, snapshot_id); children reference
 *    (id, snapshot_id) — no triggers needed.
 *  - TEXT uuid PKs, TIMESTAMPTZ for time columns, JSONB for manifests.
 *  - FTS5 shadow table is SQLite-only; PG retrieval uses tsvector/GIN added at
 *    the retrieval layer (SA4E-415), not in the base DDL.
 *
 * Idempotent: guarded by to_regclass probes before each CREATE.
 */

export const V6_TABLES_PG = [
  'repository', 'git_commit', 'git_commit_parent', 'git_ref',
  'source_file_revision', 'code_index_snapshot', 'code_module', 'code_symbol',
  'symbol_occurrence', 'symbol_occurrence_resolution', 'symbol_relationship',
  'relationship_evidence', 'code_chunk', 'dependency_resolution_snapshot',
  'embedding_set', 'code_embedding', 'repository_ref_index_state',
  'chat_session', 'agent_run', 'agent_plan', 'agent_step',
  'agent_state_transition', 'agent_tool_execution', 'retrieval_evidence',
  'agent_workspace', 'change_set', 'approval_request', 'execution_run',
  'agent_event',
] as const;

export const V6_PG_DDL: string[] = [
  `CREATE TABLE IF NOT EXISTS repository (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     origin_url TEXT,
     display_name TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (project_id, display_name)
   )`,

  `CREATE TABLE IF NOT EXISTS git_commit (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     repository_id TEXT NOT NULL REFERENCES repository(id),
     commit_sha TEXT NOT NULL,
     author TEXT, committer TEXT,
     committed_at TIMESTAMPTZ,
     UNIQUE (repository_id, commit_sha)
   )`,

  `CREATE TABLE IF NOT EXISTS git_commit_parent (
     project_id TEXT NOT NULL,
     commit_id TEXT NOT NULL REFERENCES git_commit(id),
     parent_commit_id TEXT NOT NULL REFERENCES git_commit(id),
     parent_order INTEGER NOT NULL CHECK (parent_order >= 0),
     PRIMARY KEY (commit_id, parent_commit_id)
   )`,

  `CREATE TABLE IF NOT EXISTS git_ref (
     project_id TEXT NOT NULL,
     repository_id TEXT NOT NULL REFERENCES repository(id),
     ref_name TEXT NOT NULL,
     ref_type TEXT NOT NULL CHECK (ref_type IN ('BRANCH','TAG')),
     target_commit_id TEXT NOT NULL REFERENCES git_commit(id),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (repository_id, ref_name)
   )`,

  `CREATE TABLE IF NOT EXISTS source_file_revision (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     repository_id TEXT NOT NULL REFERENCES repository(id),
     commit_id TEXT NOT NULL REFERENCES git_commit(id),
     relative_path TEXT NOT NULL,
     content_hash TEXT NOT NULL,
     object_path TEXT,
     language TEXT, file_type TEXT,
     is_generated BOOLEAN NOT NULL DEFAULT FALSE,
     is_binary BOOLEAN NOT NULL DEFAULT FALSE,
     line_count INTEGER CHECK (line_count >= 0),
     UNIQUE (commit_id, relative_path)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_16k_sfr_repo ON source_file_revision(repository_id, relative_path)`,

  `CREATE TABLE IF NOT EXISTS code_index_snapshot (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     repository_id TEXT NOT NULL REFERENCES repository(id),
     commit_id TEXT NOT NULL REFERENCES git_commit(id),
     config_fingerprint TEXT NOT NULL,
     code_model_version TEXT NOT NULL,
     toolchain_manifest JSONB,
     status TEXT NOT NULL CHECK (status IN ('PENDING','BUILDING','READY','FAILED','SUPERSEDED')),
     diagnostics JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (repository_id, commit_id, config_fingerprint, code_model_version),
     UNIQUE (id, repository_id, commit_id)
   )`,

  `CREATE TABLE IF NOT EXISTS code_module (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     snapshot_id TEXT NOT NULL,
     name TEXT NOT NULL,
     root_path TEXT NOT NULL,
     language TEXT, description TEXT,
     UNIQUE (snapshot_id, name),
     UNIQUE (id, snapshot_id),
     FOREIGN KEY (snapshot_id) REFERENCES code_index_snapshot(id)
   )`,

  `CREATE TABLE IF NOT EXISTS code_symbol (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     snapshot_id TEXT NOT NULL,
     sfr_id TEXT REFERENCES source_file_revision(id),
     parent_id TEXT,
     module_id TEXT,
     name TEXT NOT NULL,
     kind TEXT NOT NULL,
     signature TEXT,
     start_line INTEGER NOT NULL CHECK (start_line >= 0),
     end_line INTEGER NOT NULL CHECK (end_line >= start_line),
     start_col INTEGER CHECK (start_col >= 0),
     end_col INTEGER CHECK (end_col >= 0),
     doc_comment TEXT,
     complexity INTEGER CHECK (complexity IS NULL OR complexity >= 0),
     UNIQUE (id, snapshot_id),
     FOREIGN KEY (snapshot_id) REFERENCES code_index_snapshot(id),
     FOREIGN KEY (parent_id, snapshot_id) REFERENCES code_symbol(id, snapshot_id),
     FOREIGN KEY (module_id, snapshot_id) REFERENCES code_module(id, snapshot_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_16k_csym_snapshot ON code_symbol(snapshot_id)`,
  `CREATE INDEX IF NOT EXISTS idx_16k_csym_snap_kind ON code_symbol(snapshot_id, kind)`,

  `CREATE TABLE IF NOT EXISTS symbol_occurrence (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     snapshot_id TEXT NOT NULL,
     symbol_id TEXT NOT NULL,
     sfr_id TEXT NOT NULL REFERENCES source_file_revision(id),
     kind TEXT NOT NULL CHECK (kind IN ('DEF','REF','IMPORT')),
     line INTEGER NOT NULL CHECK (line >= 0),
     col INTEGER CHECK (col >= 0),
     confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
     UNIQUE (id, snapshot_id),
     FOREIGN KEY (snapshot_id) REFERENCES code_index_snapshot(id),
     FOREIGN KEY (symbol_id, snapshot_id) REFERENCES code_symbol(id, snapshot_id)
   )`,

  `CREATE TABLE IF NOT EXISTS symbol_occurrence_resolution (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     snapshot_id TEXT NOT NULL,
     occurrence_id TEXT NOT NULL,
     resolved_symbol_id TEXT,
     resolution_kind TEXT NOT NULL CHECK (resolution_kind IN ('EXACT','HEURISTIC','EXTERNAL')),
     confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
     UNIQUE (id, snapshot_id),
     FOREIGN KEY (occurrence_id, snapshot_id) REFERENCES symbol_occurrence(id, snapshot_id),
     FOREIGN KEY (resolved_symbol_id, snapshot_id) REFERENCES code_symbol(id, snapshot_id)
   )`,

  `CREATE TABLE IF NOT EXISTS symbol_relationship (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     snapshot_id TEXT NOT NULL,
     from_symbol_id TEXT NOT NULL,
     to_symbol_id TEXT,
     kind TEXT NOT NULL CHECK (kind IN ('CALLS','IMPORTS','INHERITS','USES')),
     confidence REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
     UNIQUE (id, snapshot_id),
     FOREIGN KEY (snapshot_id) REFERENCES code_index_snapshot(id),
     FOREIGN KEY (from_symbol_id, snapshot_id) REFERENCES code_symbol(id, snapshot_id),
     FOREIGN KEY (to_symbol_id, snapshot_id) REFERENCES code_symbol(id, snapshot_id)
   )`,

  `CREATE TABLE IF NOT EXISTS relationship_evidence (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     snapshot_id TEXT NOT NULL,
     relationship_id TEXT NOT NULL,
     occurrence_id TEXT,
     evidence_kind TEXT NOT NULL,
     excerpt TEXT,
     UNIQUE (id, snapshot_id),
     FOREIGN KEY (relationship_id, snapshot_id) REFERENCES symbol_relationship(id, snapshot_id),
     FOREIGN KEY (occurrence_id, snapshot_id) REFERENCES symbol_occurrence(id, snapshot_id)
   )`,

  `CREATE TABLE IF NOT EXISTS code_chunk (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     snapshot_id TEXT NOT NULL,
     symbol_id TEXT,
     sfr_id TEXT NOT NULL REFERENCES source_file_revision(id),
     chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
     start_line INTEGER NOT NULL CHECK (start_line >= 0),
     end_line INTEGER NOT NULL CHECK (end_line >= start_line),
     content_ref TEXT,
     token_count INTEGER CHECK (token_count IS NULL OR token_count >= 0),
     UNIQUE (snapshot_id, sfr_id, chunk_index),
     UNIQUE (id, snapshot_id),
     FOREIGN KEY (snapshot_id) REFERENCES code_index_snapshot(id),
     FOREIGN KEY (symbol_id, snapshot_id) REFERENCES code_symbol(id, snapshot_id)
   )`,

  `CREATE TABLE IF NOT EXISTS dependency_resolution_snapshot (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     snapshot_id TEXT NOT NULL,
     module_id TEXT NOT NULL,
     repository_id TEXT NOT NULL REFERENCES repository(id),
     dep_name TEXT NOT NULL,
     dep_version TEXT,
     resolved_ref TEXT,
     UNIQUE (snapshot_id, module_id, dep_name),
     UNIQUE (id, snapshot_id),
     FOREIGN KEY (snapshot_id) REFERENCES code_index_snapshot(id),
     FOREIGN KEY (module_id, snapshot_id) REFERENCES code_module(id, snapshot_id)
   )`,

  `CREATE TABLE IF NOT EXISTS embedding_set (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     code_index_snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
     model_key TEXT NOT NULL,
     model_version TEXT NOT NULL,
     dimensions INTEGER NOT NULL CHECK (dimensions > 0),
     preprocessing_version TEXT NOT NULL,
     tokenizer_version TEXT NOT NULL,
     chunker_version TEXT NOT NULL,
     UNIQUE (code_index_snapshot_id, model_key, model_version, preprocessing_version)
   )`,

  `CREATE TABLE IF NOT EXISTS code_embedding (
     project_id TEXT NOT NULL,
     embedding_set_id TEXT NOT NULL REFERENCES embedding_set(id),
     chunk_id TEXT NOT NULL REFERENCES code_chunk(id),
     embedding BYTEA NOT NULL,
     PRIMARY KEY (embedding_set_id, chunk_id)
   )`,

  `CREATE TABLE IF NOT EXISTS repository_ref_index_state (
     project_id TEXT NOT NULL,
     repository_id TEXT NOT NULL REFERENCES repository(id),
     ref_name TEXT NOT NULL,
     active_code_index_snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
     generation INTEGER NOT NULL CHECK (generation >= 0),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (repository_id, ref_name)
   )`,

  `CREATE TABLE IF NOT EXISTS chat_session (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     repository_id TEXT NOT NULL REFERENCES repository(id),
     commit_id TEXT NOT NULL REFERENCES git_commit(id),
     pinned_code_index_snapshot_id TEXT NOT NULL,
     model_config_snapshot JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     FOREIGN KEY (pinned_code_index_snapshot_id, repository_id, commit_id)
       REFERENCES code_index_snapshot(id, repository_id, commit_id)
   )`,

  `CREATE TABLE IF NOT EXISTS agent_run (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     chat_session_id TEXT NOT NULL REFERENCES chat_session(id),
     started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ,
     status TEXT NOT NULL DEFAULT 'RUNNING'
       CHECK (status IN ('RUNNING','COMPLETED','FAILED','CANCELLED'))
   )`,

  `CREATE TABLE IF NOT EXISTS agent_plan (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     version INTEGER NOT NULL CHECK (version >= 0),
     objective TEXT NOT NULL,
     acceptance_criteria TEXT,
     status TEXT NOT NULL DEFAULT 'DRAFT'
       CHECK (status IN ('DRAFT','APPROVED','EXECUTING','DONE','REJECTED'))
   )`,

  `CREATE TABLE IF NOT EXISTS agent_step (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     plan_id TEXT REFERENCES agent_plan(id),
     step_index INTEGER NOT NULL CHECK (step_index >= 0),
     dependency_ids JSONB,
     input_ref TEXT, output_ref TEXT,
     attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
     status TEXT NOT NULL DEFAULT 'PENDING'
       CHECK (status IN ('PENDING','RUNNING','DONE','FAILED','SKIPPED')),
     started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
   )`,

  `CREATE TABLE IF NOT EXISTS agent_state_transition (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     old_state TEXT, new_state TEXT NOT NULL, reason TEXT,
     at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS agent_tool_execution (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     step_id TEXT REFERENCES agent_step(id),
     tool_name TEXT NOT NULL,
     args_json JSONB, result_ref TEXT, status TEXT,
     started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
   )`,

  `CREATE TABLE IF NOT EXISTS retrieval_evidence (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
     query TEXT NOT NULL,
     result_refs JSONB,
     score REAL CHECK (score IS NULL OR score >= 0),
     at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS agent_workspace (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     path TEXT NOT NULL,
     purpose TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     UNIQUE (agent_run_id, path)
   )`,

  `CREATE TABLE IF NOT EXISTS change_set (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     base_commit_id TEXT NOT NULL REFERENCES git_commit(id),
     summary TEXT,
     status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','APPLIED','DISCARDED')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,

  `CREATE TABLE IF NOT EXISTS approval_request (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     action TEXT NOT NULL,
     scope TEXT NOT NULL,
     proposed_changeset_id TEXT REFERENCES change_set(id),
     requested_user TEXT,
     decision TEXT NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING','APPROVED','REJECTED')),
     decision_time TIMESTAMPTZ, decided_by TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS execution_run (
     id TEXT PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     change_set_id TEXT REFERENCES change_set(id),
     command TEXT NOT NULL,
     exit_code INTEGER, log_ref TEXT,
     started_at TIMESTAMPTZ, finished_at TIMESTAMPTZ
   )`,

  `CREATE TABLE IF NOT EXISTS agent_event (
     id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
     project_id TEXT NOT NULL,
     agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
     type TEXT NOT NULL,
     payload_json JSONB,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_16k_aevent_run ON agent_event(agent_run_id, id)`,
];

/**
 * Apply V6 on a PostgreSQL connection. `exec` runs a single statement —
 * caller supplies a callback matching its client (pg Pool/Client query).
 * Idempotent: every statement is IF NOT EXISTS.
 */
export async function applyMigrationV6Pg(exec: (sql: string) => Promise<unknown>): Promise<void> {
  for (const ddl of V6_PG_DDL) {
    await exec(ddl);
  }
}
