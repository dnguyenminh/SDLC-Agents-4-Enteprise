/**
 * SA4E-171 — PegaSymbolSync: Sync Pega rules into symbols table.
 * Creates: virtual file → symbol → body_embeddings → CODE_ENRICHMENT task.
 * Feature flag: PEGA_DUAL_WRITE (default true) controls dual-write.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import {
  resolveSymbolKind, buildVirtualPath, buildFqn, resolveRuleNameField,
  resolveRuleSetName, resolveRuleSetVersion,
} from './pega-mapping.js';
import { extractRuleContent } from './PegaContentExtractor.js';
import { SchemaStorageService, type IDatabaseAdapter } from './schema/SchemaStorageService.js';
import { TaskType, TaskStatus } from '../memory/task-queue/models.js';
import pino from 'pino';

const logger = pino({ name: 'pega-symbol-sync' });

/** Max rule JSON size in bytes (SEC-06: skip oversized rules). */
const MAX_RULE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/** Feature flag: write to symbols table (default true, SEC-03: case-insensitive). */
export const PEGA_DUAL_WRITE = parseDualWriteFlag(process.env.PEGA_DUAL_WRITE);

/** Parse PEGA_DUAL_WRITE env var with case-insensitive boolean handling. */
function parseDualWriteFlag(value: string | undefined): boolean {
  if (!value) return true; // Default true when not set
  return value.toLowerCase() !== 'false';
}

/** Result of syncing a rule to the symbols table. */
export interface SymbolSyncResult {
  symbolId: number;
  fileId: number;
}

/**
 * SA4E-241 (NT-4) — thrown when a rule ingest arrives without a client-computed
 * checksum. The backend never computes checksums, so this is a hard failure that
 * signals the caller (extension) must be upgraded to send one.
 */
export class MissingChecksumError extends Error {
  readonly code = 'MISSING_CHECKSUM';
  constructor() {
    super('checksum is required — the extension must send a client-computed checksum (NT-4). Upgrade the extension.');
    this.name = 'MissingChecksumError';
  }
}

/**
 * Sync a Pega rule into the symbols table (new path).
 * Creates: virtual file → symbol → body_embeddings → CODE_ENRICHMENT task.
 * @param adapter - Database adapter for SQL operations
 * @param ruleJson - Raw Pega rule JSON content
 * @param projectId - Tenant project identifier (SEC-04)
 * @param promptContext - Prompt context for doc_comment
 * @param checksum - SA4E-241: client-computed checksum (computePegaChecksum, 3
 *   save-time fields). Stored AS-IS as content_hash so the write-path value equals
 *   what bulk-check compares against (INV-1). ⛔ REQUIRED — the backend NEVER
 *   computes a checksum (NT-4); the extension is the single computation authority.
 *   Missing/empty → throws MissingChecksumError (fail-closed; upgrade the extension).
 * @returns symbolId and fileId, or null if validation fails
 * @throws MissingChecksumError when `checksum` is absent/empty
 */
export async function syncRuleToSymbols(
  adapter: DatabaseAdapter,
  ruleJson: Record<string, unknown>,
  projectId: string,
  promptContext: string,
  checksum: string,
): Promise<SymbolSyncResult | null> {
  const fields = extractRequiredFields(ruleJson);
  if (!fields) return null;

  // SA4E-241 (NT-4): fail-closed if the extension did not send a checksum. The
  // backend must NEVER compute one (no full-JSON fallback) — an old extension that
  // omits it must be upgraded rather than silently poisoning content_hash.
  if (!checksum || !checksum.trim()) {
    throw new MissingChecksumError();
  }

  const { pxObjClass, pyClassName, pyRuleName } = fields;
  const kind = resolveSymbolKind(pxObjClass);
  const ruleSet = resolveRuleSetName(ruleJson);
  const version = resolveRuleSetVersion(ruleJson);
  const fqn = buildFqn(pxObjClass, pyClassName, pyRuleName, ruleSet, version);
  const virtualPath = buildVirtualPath(pyClassName, kind, pyRuleName, ruleSet, version);
  const ruleJsonStr = JSON.stringify(ruleJson);

  // SEC-06: skip oversized rules
  if (ruleJsonStr.length > MAX_RULE_SIZE_BYTES) {
    logger.warn({ fqn, size: ruleJsonStr.length }, 'Rule exceeds 5MB limit — skipped');
    return null;
  }

  // SA4E-241 (NT-4/INV-1): store the client checksum AS-IS. This is the SAME value
  // bulk-check compares against, so an unchanged rule is skipped next run. Backend
  // does not (and must not) compute it.
  const contentHash = checksum;
  const docComment = (promptContext || `${kind}: ${fqn}`).slice(0, 500);

  const fileId = await upsertVirtualFile(adapter, projectId, virtualPath, pyClassName, contentHash, ruleJsonStr.length);
  const symbolId = await upsertSymbol(adapter, projectId, fileId, pyRuleName, kind, fqn, pyClassName, docComment);
  // SA4E-222: resolve learned schema paths (if any) and pass to extraction (no LLM at index time)
  const nestedLogicPaths = await resolveNestedLogicPaths(adapter, pxObjClass);
  // SA4E-106: store extracted readable content (steps/params/Java) for LLM enrichment
  await storeBodyEmbedding(adapter, projectId, symbolId, extractRuleContent(ruleJson, { nestedLogicPaths }));
  await createEnrichmentTaskIfNeeded(
    adapter, symbolId, pyRuleName, kind, virtualPath, projectId, pyClassName, resolveRuleSet(ruleJson),
  );

  logger.debug({ fqn, symbolId, fileId, kind }, 'Rule synced to symbols');
  return { symbolId, fileId };
}

/** Re-store body + re-queue enrichment for an existing symbol (SA4E-106 backfill). */
export async function refreshRuleSymbolBody(
  adapter: DatabaseAdapter,
  ruleJson: Record<string, unknown>,
  symbolId: number,
  projectId: string,
): Promise<void> {
  const fields = extractRequiredFields(ruleJson);
  if (!fields) return;
  const nestedLogicPaths = await resolveNestedLogicPaths(adapter, fields.pxObjClass);
  await storeBodyEmbedding(adapter, projectId, symbolId, extractRuleContent(ruleJson, { nestedLogicPaths }));

  const kind = resolveSymbolKind(fields.pxObjClass);
  const virtualPath = buildVirtualPath(
    fields.pyClassName, kind, fields.pyRuleName,
    resolveRuleSetName(ruleJson), resolveRuleSetVersion(ruleJson),
  );

  // Clear ALL prior CODE_ENRICHMENT tasks for this symbol before requeuing.
  // A fresh task fully supersedes historical ones; deleting only PENDING/PROCESSING
  // left COMPLETED/FAILED rows to accumulate unbounded across re-index runs.
  await adapter.runAsync(
    `DELETE FROM pending_tasks WHERE task_type = 'CODE_ENRICHMENT' AND entry_id = ?`,
    [symbolId],
  );
  await adapter.runAsync(
    `UPDATE symbols SET enrichment_status = NULL, summary = NULL, pseudo_code = NULL,
     llm_tags = NULL, enriched_at = NULL WHERE id = ? AND project_id = ?`,
    [symbolId, projectId],
  );
  await createEnrichmentTaskIfNeeded(
    adapter, symbolId, fields.pyRuleName, kind, virtualPath,
    projectId, fields.pyClassName, resolveRuleSet(ruleJson),
  );
}

/** Resolve "RuleSet Version" display string from rule JSON (both export casings). */
function resolveRuleSet(ruleJson: Record<string, unknown>): string {
  const rs = resolveRuleSetName(ruleJson);
  const version = resolveRuleSetVersion(ruleJson);
  return rs ? (version ? `${rs} ${version}` : rs) : '';
}

/**
 * SA4E-222 — Resolve learned nested logic paths for a rule type from the KB.
 * Reads the canonical EnrichedSchema (if it exists from a prior enrichment) so
 * extraction can render structured logic without new TypeScript. Returns undefined
 * when no schema/paths exist, letting the generic extractor take over. Non-fatal.
 */
async function resolveNestedLogicPaths(
  adapter: DatabaseAdapter, ruleType: string,
): Promise<string[] | undefined> {
  try {
    const storage = new SchemaStorageService(adapter as unknown as IDatabaseAdapter, logger);
    const schema = await storage.find(ruleType);
    const paths = schema?.extraction_hints?.nested_logic_paths;
    return paths && paths.length > 0 ? paths : undefined;
  } catch (err) {
    logger.warn({ err, ruleType }, '[pega-sync] Schema path lookup failed; using generic extractor');
    return undefined;
  }
}

/** Extract and validate required fields from rule JSON. */
function extractRequiredFields(ruleJson: Record<string, unknown>) {
  const pxObjClass = String((ruleJson as any)?.pxObjClass || '');
  const pyClassName = String((ruleJson as any)?.pyClassName || '');
  // Name via canonical fallback (pyRuleName → pyActivityName → pyModelName → pyFlowName → pyLabel)
  const pyRuleName = resolveRuleNameField(ruleJson);

  if (!pxObjClass || !pyClassName || !pyRuleName) {
    logger.warn({ pxObjClass, pyClassName, pyRuleName }, 'Missing required Pega fields');
    return null;
  }
  return { pxObjClass, pyClassName, pyRuleName };
}

/** UPSERT virtual file entry (BR-02, BR-05). */
async function upsertVirtualFile(
  adapter: DatabaseAdapter, projectId: string, virtualPath: string,
  module: string, contentHash: string, sizeBytes: number,
): Promise<number> {
  const engine = adapter.getEngine();
  if (engine === 'postgresql') {
    const row = await adapter.getAsync<{ id: number }>(
      `INSERT INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count)
       VALUES ($1, $2, $3, 'pega', $4, $5, $6, 1)
       ON CONFLICT(project_id, path) DO UPDATE SET
         content_hash = EXCLUDED.content_hash, size_bytes = EXCLUDED.size_bytes
       RETURNING id`,
      [projectId, virtualPath, virtualPath, module, contentHash, sizeBytes],
    );
    return row!.id;
  }
  // SQLite path
  await adapter.runAsync(
    `INSERT INTO files (project_id, path, relative_path, language, module, content_hash, size_bytes, line_count)
     VALUES (?, ?, ?, 'pega', ?, ?, ?, 1)
     ON CONFLICT(project_id, path) DO UPDATE SET
       content_hash = excluded.content_hash, size_bytes = excluded.size_bytes`,
    [projectId, virtualPath, virtualPath, module, contentHash, sizeBytes],
  );
  const row = await adapter.getAsync<{ id: number }>(
    'SELECT id FROM files WHERE project_id = ? AND path = ?',
    [projectId, virtualPath],
  );
  return row!.id;
}

/** UPSERT symbol entry (BR-01, BR-03, BR-04). */
async function upsertSymbol(
  adapter: DatabaseAdapter, projectId: string, fileId: number,
  name: string, kind: string, signature: string,
  parentSymbol: string, docComment: string,
): Promise<number> {
  const engine = adapter.getEngine();
  // Delete existing symbol for this file (1:1 virtual file → symbol)
  await adapter.runAsync(
    'DELETE FROM symbols WHERE file_id = ? AND project_id = ?',
    [fileId, projectId],
  );
  if (engine === 'postgresql') {
    const row = await adapter.getAsync<{ id: number }>(
      `INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment)
       VALUES ($1, $2, $3, $4, $5, 1, 1, $6, 'public', $7)
       RETURNING id`,
      [projectId, fileId, name, kind, signature, parentSymbol, docComment],
    );
    return row!.id;
  }
  const result = await adapter.runAsync(
    `INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment)
     VALUES (?, ?, ?, ?, ?, 1, 1, ?, 'public', ?)`,
    [projectId, fileId, name, kind, signature, parentSymbol, docComment],
  );
  return result.lastInsertRowid as number;
}

/** Store rule JSON body in body_embeddings for loadBodyText() (OI-04). */
async function storeBodyEmbedding(
  adapter: DatabaseAdapter, projectId: string, symbolId: number, body: string,
): Promise<void> {
  const buf = Buffer.from(body, 'utf-8');
  const tokenCount = Math.ceil(body.length / 4); // Rough token estimate
  const engine = adapter.getEngine();
  if (engine === 'postgresql') {
    await adapter.runAsync(
      `INSERT INTO body_embeddings (project_id, symbol_id, chunk_index, embedding, token_count)
       VALUES ($1, $2, 0, $3, $4)
       ON CONFLICT(project_id, symbol_id, chunk_index) DO UPDATE SET
         embedding = EXCLUDED.embedding, token_count = EXCLUDED.token_count`,
      [projectId, symbolId, buf, tokenCount],
    );
  } else {
    await adapter.runAsync(
      `INSERT INTO body_embeddings (project_id, symbol_id, chunk_index, embedding, token_count)
       VALUES (?, ?, 0, ?, ?)
       ON CONFLICT(project_id, symbol_id, chunk_index) DO UPDATE SET
         embedding = excluded.embedding, token_count = excluded.token_count`,
      [projectId, symbolId, buf, tokenCount],
    );
  }
}

/** Create CODE_ENRICHMENT task if symbol not already fully enriched (BR-07 amended). */
async function createEnrichmentTaskIfNeeded(
  adapter: DatabaseAdapter, symbolId: number, symbolName: string,
  kind: string, filePath: string, projectId: string,
  pegaClass?: string, pegaRuleset?: string,
): Promise<void> {
  // Skip only if CODE_ENRICHMENT already produced summary (not just TAG_ENRICHMENT tags)
  const sym = await adapter.getAsync<{ enrichment_status: string | null; summary: string | null }>(
    'SELECT enrichment_status, summary FROM symbols WHERE id = ? AND project_id = ?',
    [symbolId, projectId],
  );
  if (sym?.enrichment_status === 'COMPLETED' && sym.summary) return;

  const payload = JSON.stringify({
    symbolId, symbolName, symbolKind: kind,
    projectId, filePath, workspaceType: 'pega',
    pegaClass, pegaRuleset,
  });

  const now = new Date().toISOString();
  await adapter.runAsync(
    `INSERT INTO pending_tasks (task_type, entry_id, status, payload, max_retries, project_id, created_at)
     VALUES (?, ?, ?, ?, 3, ?, ?)`,
    [TaskType.CODE_ENRICHMENT, symbolId, TaskStatus.PENDING, payload, projectId, now],
  );
}
