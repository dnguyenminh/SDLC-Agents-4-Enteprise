-- =============================================================================
-- SA4E-241 — content_hash index migration (TDD §5.3)
-- -----------------------------------------------------------------------------
-- Speeds up the bulk-check query `content_hash = ANY($2)` scoped by project_id.
-- The `files.content_hash` column already exists (NOT NULL) — this migration
-- ONLY adds the supporting composite index. Idempotent (IF NOT EXISTS).
--
-- NOTE on the content_hash SEMANTIC change (TDD §5.5): SA4E-241 changes the
-- MEANING of content_hash (save-time checksum / git-blob), NOT the column.
-- There is NO data backfill and NO hash conversion (No-Workaround rule) — the
-- first indexing run after deploy naturally re-indexes once (all new checksums
-- ∉ existing), then incremental is stable. This SQL is the only DDL required.
--
-- Works on BOTH engines:
--   PostgreSQL (monolith prod)  — run via psql or the migration runner
--   SQLite     (local dev/test) — same statement (SQLite supports IF NOT EXISTS)
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_files_project_content_hash
  ON files (project_id, content_hash);
