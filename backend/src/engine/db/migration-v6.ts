/**
 * SA4E-413 Migration V6 — 16K Code Agent data model (CR-01..06, 16K Doc §10.1–10.7).
 *
 * Additive-only: creates the snapshot/revision model alongside the legacy F2
 * tables (files/modules/symbols/... are NOT touched — AC: no regression).
 *
 * Entities: repository, git_commit(+parents, refs), source_file_revision,
 * code_index_snapshot (+7 snapshot-scoped artifact tables), embedding_set /
 * code_embedding (decoupled from snapshot), repository_ref_index_state,
 * chat_session + agent run/plan/step/state/tool/evidence/workspace/change_set/
 * approval/execution.
 *
 * Invariants (ADR-001 + TDD-01 §5):
 *  - Same-snapshot ownership enforced by BEFORE triggers (work regardless of
 *    PRAGMA foreign_keys, which V5 toggles OFF during migrations).
 *  - chat_session.pin consistency: pinned snapshot must match (repository_id, commit_id).
 *  - CHECK constraints for ranges/enums (start_line <= end_line, confidence ∈ [0,1]).
 *  - Multi-tenant: project_id NOT NULL everywhere (V5 convention).
 *
 * PostgreSQL counterpart lives in ./migration-v6-pg.ts (composite FKs instead of
 * triggers — PG enforces them natively).
 *
 * Idempotent: every statement uses IF NOT EXISTS; safe to re-run after partial failure.
 */

import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'migration-v6' });

const V6_DDL = `
CREATE TABLE IF NOT EXISTS repository (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  origin_url   TEXT,
  display_name TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (project_id, display_name)
);

CREATE TABLE IF NOT EXISTS git_commit (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  repository_id TEXT NOT NULL REFERENCES repository(id),
  commit_sha    TEXT NOT NULL,
  author        TEXT,
  committer     TEXT,
  committed_at  TEXT,
  UNIQUE (repository_id, commit_sha)
);

CREATE TABLE IF NOT EXISTS git_commit_parent (
  project_id      TEXT NOT NULL,
  commit_id       TEXT NOT NULL REFERENCES git_commit(id),
  parent_commit_id TEXT NOT NULL REFERENCES git_commit(id),
  parent_order    INTEGER NOT NULL CHECK (parent_order >= 0),
  PRIMARY KEY (commit_id, parent_commit_id)
);

CREATE TABLE IF NOT EXISTS git_ref (
  project_id       TEXT NOT NULL,
  repository_id    TEXT NOT NULL REFERENCES repository(id),
  ref_name         TEXT NOT NULL,
  ref_type         TEXT NOT NULL CHECK (ref_type IN ('BRANCH','TAG')),
  target_commit_id TEXT NOT NULL REFERENCES git_commit(id),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (repository_id, ref_name)
);

CREATE TABLE IF NOT EXISTS source_file_revision (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  repository_id TEXT NOT NULL REFERENCES repository(id),
  commit_id     TEXT NOT NULL REFERENCES git_commit(id),
  relative_path TEXT NOT NULL,
  content_hash  TEXT NOT NULL,
  object_path   TEXT,
  language      TEXT,
  file_type     TEXT,
  is_generated  INTEGER NOT NULL DEFAULT 0 CHECK (is_generated IN (0,1)),
  is_binary     INTEGER NOT NULL DEFAULT 0 CHECK (is_binary IN (0,1)),
  line_count    INTEGER CHECK (line_count >= 0),
  UNIQUE (commit_id, relative_path)
);

CREATE TABLE IF NOT EXISTS code_index_snapshot (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  repository_id      TEXT NOT NULL REFERENCES repository(id),
  commit_id          TEXT NOT NULL REFERENCES git_commit(id),
  config_fingerprint TEXT NOT NULL,
  code_model_version TEXT NOT NULL,
  toolchain_manifest TEXT,
  status             TEXT NOT NULL CHECK (status IN ('PENDING','BUILDING','READY','FAILED','SUPERSEDED')),
  diagnostics        TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (repository_id, commit_id, config_fingerprint, code_model_version)
);

CREATE TABLE IF NOT EXISTS code_module (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  name        TEXT NOT NULL,
  root_path   TEXT NOT NULL,
  language    TEXT,
  description TEXT,
  UNIQUE (snapshot_id, name)
);

CREATE TABLE IF NOT EXISTS code_symbol (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  sfr_id      TEXT REFERENCES source_file_revision(id),
  parent_id   TEXT REFERENCES code_symbol(id),
  module_id   TEXT REFERENCES code_module(id),
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL,
  signature   TEXT,
  start_line  INTEGER NOT NULL CHECK (start_line >= 0),
  end_line    INTEGER NOT NULL CHECK (end_line >= start_line),
  start_col   INTEGER CHECK (start_col >= 0),
  end_col     INTEGER CHECK (end_col >= 0),
  doc_comment TEXT,
  complexity  INTEGER CHECK (complexity IS NULL OR complexity >= 0)
);

CREATE TABLE IF NOT EXISTS symbol_occurrence (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  symbol_id   TEXT NOT NULL REFERENCES code_symbol(id),
  sfr_id      TEXT NOT NULL REFERENCES source_file_revision(id),
  kind        TEXT NOT NULL CHECK (kind IN ('DEF','REF','IMPORT')),
  line        INTEGER NOT NULL CHECK (line >= 0),
  col         INTEGER CHECK (col >= 0),
  confidence  REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE TABLE IF NOT EXISTS symbol_occurrence_resolution (
  id                 TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  snapshot_id        TEXT NOT NULL REFERENCES code_index_snapshot(id),
  occurrence_id      TEXT NOT NULL REFERENCES symbol_occurrence(id),
  resolved_symbol_id TEXT REFERENCES code_symbol(id),
  resolution_kind    TEXT NOT NULL CHECK (resolution_kind IN ('EXACT','HEURISTIC','EXTERNAL')),
  confidence         REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE TABLE IF NOT EXISTS symbol_relationship (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  snapshot_id    TEXT NOT NULL REFERENCES code_index_snapshot(id),
  from_symbol_id TEXT NOT NULL REFERENCES code_symbol(id),
  to_symbol_id   TEXT REFERENCES code_symbol(id),
  kind           TEXT NOT NULL CHECK (kind IN ('CALLS','IMPORTS','INHERITS','USES')),
  confidence     REAL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1))
);

CREATE TABLE IF NOT EXISTS relationship_evidence (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  snapshot_id    TEXT NOT NULL REFERENCES code_index_snapshot(id),
  relationship_id TEXT NOT NULL REFERENCES symbol_relationship(id),
  occurrence_id  TEXT REFERENCES symbol_occurrence(id),
  evidence_kind  TEXT NOT NULL,
  excerpt        TEXT
);

CREATE TABLE IF NOT EXISTS code_chunk (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  symbol_id   TEXT REFERENCES code_symbol(id),
  sfr_id      TEXT NOT NULL REFERENCES source_file_revision(id),
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  start_line  INTEGER NOT NULL CHECK (start_line >= 0),
  end_line    INTEGER NOT NULL CHECK (end_line >= start_line),
  content_ref TEXT,
  token_count INTEGER CHECK (token_count IS NULL OR token_count >= 0),
  UNIQUE (snapshot_id, sfr_id, chunk_index)
);

CREATE VIRTUAL TABLE IF NOT EXISTS code_chunk_fts USING fts5(
  chunk_id UNINDEXED, content, tokenize='unicode61'
);

CREATE TABLE IF NOT EXISTS dependency_resolution_snapshot (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  module_id   TEXT NOT NULL REFERENCES code_module(id),
  repository_id TEXT NOT NULL REFERENCES repository(id),
  dep_name    TEXT NOT NULL,
  dep_version TEXT,
  resolved_ref TEXT,
  UNIQUE (snapshot_id, module_id, dep_name)
);

CREATE TABLE IF NOT EXISTS embedding_set (
  id                     TEXT PRIMARY KEY,
  project_id             TEXT NOT NULL,
  code_index_snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  model_key              TEXT NOT NULL,
  model_version          TEXT NOT NULL,
  dimensions             INTEGER NOT NULL CHECK (dimensions > 0),
  preprocessing_version  TEXT NOT NULL,
  tokenizer_version      TEXT NOT NULL,
  chunker_version        TEXT NOT NULL,
  UNIQUE (code_index_snapshot_id, model_key, model_version, preprocessing_version)
);

CREATE TABLE IF NOT EXISTS code_embedding (
  project_id      TEXT NOT NULL,
  embedding_set_id TEXT NOT NULL REFERENCES embedding_set(id),
  chunk_id        TEXT NOT NULL REFERENCES code_chunk(id),
  embedding       BLOB NOT NULL,
  PRIMARY KEY (embedding_set_id, chunk_id)
);

CREATE TABLE IF NOT EXISTS repository_ref_index_state (
  project_id                    TEXT NOT NULL,
  repository_id                 TEXT NOT NULL REFERENCES repository(id),
  ref_name                      TEXT NOT NULL,
  active_code_index_snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  generation                    INTEGER NOT NULL CHECK (generation >= 0),
  updated_at                    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (repository_id, ref_name)
);

CREATE TABLE IF NOT EXISTS chat_session (
  id                            TEXT PRIMARY KEY,
  project_id                    TEXT NOT NULL,
  repository_id                 TEXT NOT NULL REFERENCES repository(id),
  commit_id                     TEXT NOT NULL REFERENCES git_commit(id),
  pinned_code_index_snapshot_id TEXT NOT NULL REFERENCES code_index_snapshot(id),
  model_config_snapshot         TEXT,
  created_at                    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_run (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL,
  chat_session_id TEXT NOT NULL REFERENCES chat_session(id),
  started_at      TEXT,
  finished_at     TEXT,
  status          TEXT NOT NULL DEFAULT 'RUNNING'
                  CHECK (status IN ('RUNNING','COMPLETED','FAILED','CANCELLED'))
);

CREATE TABLE IF NOT EXISTS agent_plan (
  id                  TEXT PRIMARY KEY,
  project_id          TEXT NOT NULL,
  agent_run_id        TEXT NOT NULL REFERENCES agent_run(id),
  version             INTEGER NOT NULL CHECK (version >= 0),
  objective           TEXT NOT NULL,
  acceptance_criteria TEXT,
  status              TEXT NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','APPROVED','EXECUTING','DONE','REJECTED'))
);

CREATE TABLE IF NOT EXISTS agent_step (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  agent_run_id   TEXT NOT NULL REFERENCES agent_run(id),
  plan_id        TEXT REFERENCES agent_plan(id),
  step_index     INTEGER NOT NULL CHECK (step_index >= 0),
  dependency_ids TEXT,
  input_ref      TEXT,
  output_ref     TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  status         TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING','RUNNING','DONE','FAILED','SKIPPED')),
  started_at     TEXT,
  finished_at    TEXT
);

CREATE TABLE IF NOT EXISTS agent_state_transition (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  old_state    TEXT,
  new_state    TEXT NOT NULL,
  reason       TEXT,
  at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_tool_execution (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  step_id      TEXT REFERENCES agent_step(id),
  tool_name    TEXT NOT NULL,
  args_json    TEXT,
  result_ref   TEXT,
  status       TEXT,
  started_at   TEXT,
  finished_at  TEXT
);

CREATE TABLE IF NOT EXISTS retrieval_evidence (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  snapshot_id  TEXT NOT NULL REFERENCES code_index_snapshot(id),
  query        TEXT NOT NULL,
  result_refs  TEXT,
  score        REAL CHECK (score IS NULL OR score >= 0),
  at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS agent_workspace (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL,
  agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  path         TEXT NOT NULL,
  purpose      TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (agent_run_id, path)
);

CREATE TABLE IF NOT EXISTS change_set (
  id             TEXT PRIMARY KEY,
  project_id     TEXT NOT NULL,
  agent_run_id   TEXT NOT NULL REFERENCES agent_run(id),
  base_commit_id TEXT NOT NULL REFERENCES git_commit(id),
  summary        TEXT,
  status         TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','APPLIED','DISCARDED')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS approval_request (
  id                    TEXT PRIMARY KEY,
  project_id            TEXT NOT NULL,
  agent_run_id          TEXT NOT NULL REFERENCES agent_run(id),
  action                TEXT NOT NULL,
  scope                 TEXT NOT NULL,
  proposed_changeset_id TEXT REFERENCES change_set(id),
  requested_user        TEXT,
  decision              TEXT NOT NULL DEFAULT 'PENDING' CHECK (decision IN ('PENDING','APPROVED','REJECTED')),
  decision_time         TEXT,
  decided_by            TEXT
);

CREATE TABLE IF NOT EXISTS execution_run (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  agent_run_id  TEXT NOT NULL REFERENCES agent_run(id),
  change_set_id TEXT REFERENCES change_set(id),
  command       TEXT NOT NULL,
  exit_code     INTEGER,
  log_ref       TEXT,
  started_at    TEXT,
  finished_at   TEXT
);

CREATE TABLE IF NOT EXISTS agent_event (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,   -- monotonic = SSE Last-Event-ID
  project_id   TEXT NOT NULL,
  agent_run_id TEXT NOT NULL REFERENCES agent_run(id),
  type         TEXT NOT NULL,
  payload_json TEXT,                                -- reference-only (§15: no large payloads)
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/** Same-snapshot ownership + session-pin invariants (TDD-01 §5). */
const V6_TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS trg_16k_sym_parent_i
BEFORE INSERT ON code_symbol WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: code_symbol.parent_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol p WHERE p.id = NEW.parent_id AND p.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_sym_parent_u
BEFORE UPDATE OF parent_id ON code_symbol WHEN NEW.parent_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: code_symbol.parent_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol p WHERE p.id = NEW.parent_id AND p.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_sym_module_i
BEFORE INSERT ON code_symbol WHEN NEW.module_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: code_symbol.module_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_module m WHERE m.id = NEW.module_id AND m.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_sym_module_u
BEFORE UPDATE OF module_id ON code_symbol WHEN NEW.module_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: code_symbol.module_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_module m WHERE m.id = NEW.module_id AND m.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_occ_symbol_i
BEFORE INSERT ON symbol_occurrence
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: symbol_occurrence.symbol_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol s WHERE s.id = NEW.symbol_id AND s.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_occ_symbol_u
BEFORE UPDATE OF symbol_id ON symbol_occurrence
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: symbol_occurrence.symbol_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol s WHERE s.id = NEW.symbol_id AND s.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_rel_from_i
BEFORE INSERT ON symbol_relationship
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: symbol_relationship.from_symbol_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol s WHERE s.id = NEW.from_symbol_id AND s.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_rel_from_u
BEFORE UPDATE OF from_symbol_id ON symbol_relationship
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: symbol_relationship.from_symbol_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol s WHERE s.id = NEW.from_symbol_id AND s.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_rel_to_i
BEFORE INSERT ON symbol_relationship WHEN NEW.to_symbol_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: symbol_relationship.to_symbol_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol s WHERE s.id = NEW.to_symbol_id AND s.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_rel_to_u
BEFORE UPDATE OF to_symbol_id ON symbol_relationship WHEN NEW.to_symbol_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: symbol_relationship.to_symbol_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol s WHERE s.id = NEW.to_symbol_id AND s.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_chunk_symbol_i
BEFORE INSERT ON code_chunk WHEN NEW.symbol_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: code_chunk.symbol_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol s WHERE s.id = NEW.symbol_id AND s.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_chunk_symbol_u
BEFORE UPDATE OF symbol_id ON code_chunk WHEN NEW.symbol_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: code_chunk.symbol_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM code_symbol s WHERE s.id = NEW.symbol_id AND s.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_evidence_rel_i
BEFORE INSERT ON relationship_evidence
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: relationship_evidence.relationship_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM symbol_relationship r WHERE r.id = NEW.relationship_id AND r.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_evidence_rel_u
BEFORE UPDATE OF relationship_id ON relationship_evidence
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: relationship_evidence.relationship_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM symbol_relationship r WHERE r.id = NEW.relationship_id AND r.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_evidence_occ_i
BEFORE INSERT ON relationship_evidence WHEN NEW.occurrence_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: relationship_evidence.occurrence_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM symbol_occurrence o WHERE o.id = NEW.occurrence_id AND o.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_evidence_occ_u
BEFORE UPDATE OF occurrence_id ON relationship_evidence WHEN NEW.occurrence_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: relationship_evidence.occurrence_id must belong to the same snapshot')
  WHERE NOT EXISTS (SELECT 1 FROM symbol_occurrence o WHERE o.id = NEW.occurrence_id AND o.snapshot_id = NEW.snapshot_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_chat_pin_i
BEFORE INSERT ON chat_session
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: chat_session pinned snapshot must match (repository_id, commit_id)')
  WHERE NOT EXISTS (
    SELECT 1 FROM code_index_snapshot s
    WHERE s.id = NEW.pinned_code_index_snapshot_id
      AND s.repository_id = NEW.repository_id AND s.commit_id = NEW.commit_id);
END;

CREATE TRIGGER IF NOT EXISTS trg_16k_chat_pin_u
BEFORE UPDATE OF pinned_code_index_snapshot_id, repository_id, commit_id ON chat_session
BEGIN
  SELECT RAISE(ABORT, 'SA4E-413: chat_session pinned snapshot must match (repository_id, commit_id)')
  WHERE NOT EXISTS (
    SELECT 1 FROM code_index_snapshot s
    WHERE s.id = NEW.pinned_code_index_snapshot_id
      AND s.repository_id = NEW.repository_id AND s.commit_id = NEW.commit_id);
END;
`;

const V6_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_16k_commit_repo      ON git_commit(repository_id);
CREATE INDEX IF NOT EXISTS idx_16k_sfr_repo         ON source_file_revision(repository_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_16k_sfr_commit       ON source_file_revision(commit_id);
CREATE INDEX IF NOT EXISTS idx_16k_snapshot_repo    ON code_index_snapshot(repository_id);
CREATE INDEX IF NOT EXISTS idx_16k_cmod_snapshot    ON code_module(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_16k_csym_snapshot    ON code_symbol(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_16k_csym_snap_kind   ON code_symbol(snapshot_id, kind);
CREATE INDEX IF NOT EXISTS idx_16k_csym_snap_name   ON code_symbol(snapshot_id, name);
CREATE INDEX IF NOT EXISTS idx_16k_csym_sfr         ON code_symbol(sfr_id);
CREATE INDEX IF NOT EXISTS idx_16k_csym_parent      ON code_symbol(parent_id);
CREATE INDEX IF NOT EXISTS idx_16k_occ_snapshot     ON symbol_occurrence(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_16k_occ_symbol       ON symbol_occurrence(symbol_id);
CREATE INDEX IF NOT EXISTS idx_16k_occr_occ         ON symbol_occurrence_resolution(occurrence_id);
CREATE INDEX IF NOT EXISTS idx_16k_rel_snapshot     ON symbol_relationship(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_16k_rel_from         ON symbol_relationship(from_symbol_id);
CREATE INDEX IF NOT EXISTS idx_16k_rel_to           ON symbol_relationship(to_symbol_id);
CREATE INDEX IF NOT EXISTS idx_16k_evid_rel         ON relationship_evidence(relationship_id);
CREATE INDEX IF NOT EXISTS idx_16k_chunk_snapshot   ON code_chunk(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_16k_chunk_symbol     ON code_chunk(symbol_id);
CREATE INDEX IF NOT EXISTS idx_16k_chunk_sfr        ON code_chunk(sfr_id);
CREATE INDEX IF NOT EXISTS idx_16k_drs_snapshot     ON dependency_resolution_snapshot(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_16k_embset_snapshot  ON embedding_set(code_index_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_16k_refstate_snap    ON repository_ref_index_state(active_code_index_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_16k_chat_repo        ON chat_session(repository_id);
CREATE INDEX IF NOT EXISTS idx_16k_arun_session     ON agent_run(chat_session_id);
CREATE INDEX IF NOT EXISTS idx_16k_aplan_run        ON agent_plan(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_16k_astep_run        ON agent_step(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_16k_astep_plan       ON agent_step(plan_id);
CREATE INDEX IF NOT EXISTS idx_16k_atrans_run       ON agent_state_transition(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_16k_atool_run        ON agent_tool_execution(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_16k_atool_step       ON agent_tool_execution(step_id);
CREATE INDEX IF NOT EXISTS idx_16k_revrun_run       ON retrieval_evidence(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_16k_aws_run          ON agent_workspace(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_16k_cset_run         ON change_set(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_16k_appr_run         ON approval_request(agent_run_id);
CREATE INDEX IF NOT EXISTS idx_16k_exerun_run       ON execution_run(agent_run_id);
`;

/** All tables created by V6 (used by tests + health checks). */
export const V6_TABLES = [
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

/**
 * Apply V6 — 16K data model. Additive-only; idempotent (IF NOT EXISTS everywhere);
 * safe to re-run after partial failure. Legacy F2 tables are untouched.
 */
export async function applyMigrationV6(db: QueryDatabaseAdapter): Promise<void> {
  try {
    await db.execAsync(V6_DDL);
    await db.execAsync(V6_TRIGGERS);
    await db.execAsync(V6_INDEXES);
    await db.runAsync('INSERT OR REPLACE INTO schema_version (version) VALUES (?)', [6]);
    logger.info('[migrations] V6: 16K data model applied (28 tables + FTS5 + ownership triggers)');
  } catch (err) {
    logger.error({ err }, '[migrations] V6 error:');
    throw err;
  }
}
