/**
 * SA4E-171 — PegaSymbolSync: Sync Pega rules into symbols table.
 * Creates: virtual file → symbol → body_embeddings → CODE_ENRICHMENT task.
 * Feature flag: PEGA_DUAL_WRITE (default true) controls dual-write.
 * Facade (BR-18): DB upserts in symbol-sync-db.ts, resolvers in
 * symbol-sync-helpers.ts.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { GraphRepository } from '../../database/repositories/GraphRepository.js';
import {
  resolveSymbolKind, buildVirtualPath, buildFqn,
  resolveRuleSetName, resolveRuleSetVersion,
} from './pega-mapping.js';
import { extractRuleContentWithFlags } from './PegaContentExtractor.js';
import pino from 'pino';
import {
  upsertVirtualFile, upsertSymbol, storeBodyEmbedding, createEnrichmentTaskIfNeeded,
} from './symbol-sync-db.js';
import {
  resolvePegaDisplayName, resolveRuleSet, resolveNestedLogicPaths, extractRequiredFields,
} from './symbol-sync-helpers.js';

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
 * ⛔ REQUIRED checksum — the backend NEVER computes one (NT-4); the extension
 * is the single computation authority. Missing/empty → MissingChecksumError.
 * @returns symbolId and fileId, or null if validation fails
 */
export async function syncRuleToSymbols(
  adapter: DatabaseAdapter,
  ruleJson: Record<string, unknown>,
  projectId: string,
  promptContext: string,
  checksum: string,
  appName?: string,
): Promise<SymbolSyncResult | null> {
  const fields = extractRequiredFields(ruleJson);
  if (!fields) {
    logger.warn({ pxObjClass: ruleJson?.pxObjClass, pyClassName: ruleJson?.pyClassName, pyRuleName: ruleJson?.pyRuleName }, 'extractRequiredFields returned null');
    return null;
  }
  logger.info({ pxObjClass: fields.pxObjClass, pyClassName: fields.pyClassName, pyRuleName: fields.pyRuleName, projectId }, 'syncRuleToSymbols start');

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
  logger.info({ fqn, virtualPath, kind, pyClassName, pyRuleName }, 'syncRuleToSymbols built identity');
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
  await registerPegaProject(adapter, ruleJson, projectId, appName);
  await extractAndStoreBody(adapter, ruleJson, pxObjClass, projectId, symbolId, pyRuleName, kind, virtualPath, pyClassName, fqn);

  logger.debug({ fqn, symbolId, fileId, kind }, 'Rule synced to symbols');
  return { symbolId, fileId };
}

/** Register the PROJECT (not the rule) in project_registry (SA4E-338 B1 display name). */
async function registerPegaProject(adapter: DatabaseAdapter, ruleJson: Record<string, unknown>, projectId: string, appName?: string): Promise<void> {
  try {
    await new GraphRepository(adapter).registerProject(projectId, resolvePegaDisplayName(ruleJson, projectId, appName), '');
  } catch (err) { logger.warn({ err, projectId }, '[pega] project_registry register skipped (non-fatal)'); }
}

/** SA4E-222/SA4E-106/SA4E-338 B2: extract content, store body, queue enrichment. */
async function extractAndStoreBody(
  adapter: DatabaseAdapter, ruleJson: Record<string, unknown>, pxObjClass: string,
  projectId: string, symbolId: number, pyRuleName: string, kind: string,
  virtualPath: string, pyClassName: string,
  fqn: string,
): Promise<void> {
  // SA4E-222: resolve learned schema paths (if any) and pass to extraction (no LLM at index time)
  const nestedLogicPaths = await resolveNestedLogicPaths(adapter, pxObjClass);
  // SA4E-106: store extracted readable content (steps/params/Java) for LLM enrichment.
  // SA4E-338 B2: rules whose content is a binary/base64 asset (e.g.
  // Data-Mobile-Application-Branding-Asset holding a ZIP) are still INDEXED (file +
  // symbol + metadata body), but we DO NOT queue LLM enrichment — there is no logic to
  // summarize and the raw blob overflowed the model context (exceed_context_size_error).
  const extracted = extractRuleContentWithFlags(ruleJson, { nestedLogicPaths });
  await storeBodyEmbedding(adapter, projectId, symbolId, extracted.content);
  if (!extracted.binaryStripped) {
    await createEnrichmentTaskIfNeeded(
      adapter, symbolId, pyRuleName, kind, virtualPath, projectId, pyClassName, resolveRuleSet(ruleJson),
    );
  } else {
    logger.info({ fqn, symbolId, kind }, 'Binary/asset rule indexed metadata-only — enrichment skipped');
  }
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
  const extracted = extractRuleContentWithFlags(ruleJson, { nestedLogicPaths });
  await storeBodyEmbedding(adapter, projectId, symbolId, extracted.content);

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
  // SA4E-338 B2: binary/asset rules are re-indexed metadata-only — do not re-queue enrichment.
  if (extracted.binaryStripped) {
    logger.info({ symbolId, kind }, 'Binary/asset rule refreshed metadata-only — enrichment skipped');
    return;
  }
  await createEnrichmentTaskIfNeeded(
    adapter, symbolId, fields.pyRuleName, kind, virtualPath,
    projectId, fields.pyClassName, resolveRuleSet(ruleJson),
  );
}
