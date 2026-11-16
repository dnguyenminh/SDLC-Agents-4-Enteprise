// freshness-probe.mjs
// SA4E-411 — prove that the isolated backend instance on :48731 is running the
// SA4E-411 build (not the shared repo-main build) and that its data dir contains
// the SA4E-411 16K engine schema.
//
// Usage: node freshness-probe.mjs <dbPath> <httpBaseUrl>

import { DatabaseSync } from 'node:sqlite';

const dbPath = process.argv[2];
const base = process.argv[3];

const V6_TABLES = [
  'repository', 'git_commit', 'git_commit_parent', 'git_ref',
  'source_file_revision', 'code_index_snapshot', 'code_module', 'code_symbol',
  'symbol_occurrence', 'symbol_occurrence_resolution', 'symbol_relationship',
  'relationship_evidence', 'code_chunk', 'code_chunk_fts',
  'dependency_resolution_snapshot', 'embedding_set', 'code_embedding',
  'repository_ref_index_state', 'chat_session', 'agent_run', 'agent_plan',
  'agent_step', 'agent_state_transition', 'agent_tool_execution',
  'retrieval_evidence', 'agent_workspace', 'change_set', 'approval_request',
  'execution_run', 'agent_event',
];

const db = new DatabaseSync(dbPath, { readOnly: true });
const have = new Set(
  db.prepare("select name from sqlite_master where type in ('table','view')").all().map((r) => r.name),
);
const present = V6_TABLES.filter((t) => have.has(t));
const missing = V6_TABLES.filter((t) => !have.has(t));
const idxCount = db
  .prepare("select count(*) c from sqlite_master where type='index' and name like 'idx_16k_%'")
  .get().c;
const schemaVersion = db.prepare('select max(version) v from schema_version').get();
const totalTables = db.prepare("select count(*) c from sqlite_master where type='table'").get().c;
db.close();

const health = await fetch(`${base}/health`).then((r) => r.json());

console.log(JSON.stringify({
  dbPath,
  base,
  health,
  v6TablesPresent: present.length,
  v6TablesMissing: missing,
  v6TableNames: present,
  idx16kIndexes: idxCount,
  schemaVersion: schemaVersion?.v ?? null,
  totalTablesInDb: totalTables,
}, null, 2));
