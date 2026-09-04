/**
 * SA4E-158 — PegaIndexer: Phase 1 of separated ingest pipeline.
 * SA4E-171 (cutover): parses rule → stores into symbols table (via PegaSymbolSync).
 * No longer writes PEGA_INDEX into knowledge_entries — rules live in symbols only.
 * Returns symbolId for Phase 2 (syncIndexedRulesToKb / graph projection).
 */
import type { MemoryEngine } from '../memory/engine/core.js';
import type { PegaIngestRuleRequest, UnresolvedDependency } from './models.js';
import { MissingChecksumError } from './PegaSymbolSync.js';
import { PegaParser, type ExtractedPegaSymbol } from './PegaParser.js';
import { PegaRuleAstParser } from './PegaRuleAstParser.js';
import { syncRuleToSymbols } from './PegaSymbolSync.js';
import {
  buildFqn, resolveRuleNameField, resolveSymbolKind, buildVirtualPath,
  resolveRuleSetName, resolveRuleSetVersion,
} from './pega-mapping.js';
import { TaskType, TaskStatus } from '../memory/task-queue/models.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';

const logger = pino({ name: 'pega-indexer' });

/** Result of indexRule — stored raw rule data */
export interface IndexRuleResult {
  status: 'success' | 'skipped';
  ruleId: number;
  fqn: string;
  isRule: boolean;
  reason?: string;
  dependencies: UnresolvedDependency[];
}

/**
 * Phase 1: Parse + checksum dedup + store into symbols table.
 * Does NOT create KB entries, TAG_ENRICHMENT tasks, or legacy pega: graph nodes.
 * CODE_ENRICHMENT task is created by syncRuleToSymbols.
 */
export async function indexRule(
  memoryEngine: MemoryEngine,
  parser: PegaParser,
  astParser: PegaRuleAstParser,
  req: PegaIngestRuleRequest,
): Promise<IndexRuleResult> {
  // Parse symbol from rule JSON
  let symbol: ExtractedPegaSymbol;
  try {
    symbol = parser.parseSymbol(req.ruleJson);
  } catch (err) {
    const ruleClass = (req.ruleJson as any)?.pxObjClass || 'unknown';
    const ruleName = (req.ruleJson as any)?.pyRuleName || 'unknown';
    logger.warn({ ruleClass, ruleName, err: (err as Error).message },
      'Rule type not supported by parser — skipped');
    return { status: 'skipped', ruleId: -1, fqn: '', isRule: false,
      reason: `parser_skip: ${ruleClass}`, dependencies: [] };
  }

  const deps = parser.extractDependencies(req.ruleJson);

  // Checksum dedup — skip if already indexed in symbols with matching content hash
  // FQN uses the canonical rule-name fallback (matches PegaSymbolSync signature).
  const canonicalFqn = buildFqn(
    String((req.ruleJson as any)?.pxObjClass || ''),
    String((req.ruleJson as any)?.pyClassName || ''),
    resolveRuleNameField(req.ruleJson),
    resolveRuleSetName(req.ruleJson),
    resolveRuleSetVersion(req.ruleJson),
  );
  if (req.checksum) {
    const { exists, checksumMatch, needsEnrichment, symbolId } = await checkRuleChecksum(
      memoryEngine, req.projectId, canonicalFqn, req.checksum,
    );
    if (exists && checksumMatch) {
      // SA4E-209: Even if checksum matches, ensure enrichment task exists for unenriched symbols
      if (needsEnrichment && symbolId > 0) {
        const kind = resolveSymbolKind(String((req.ruleJson as any)?.pxObjClass || ''));
        const virtualPath = buildVirtualPath(
          String((req.ruleJson as any)?.pyClassName || ''), kind, resolveRuleNameField(req.ruleJson),
          resolveRuleSetName(req.ruleJson), resolveRuleSetVersion(req.ruleJson),
        );
        await ensureEnrichmentTask(memoryEngine.getAdapter(), symbolId, resolveRuleNameField(req.ruleJson),
          kind, virtualPath, req.projectId);
      }
      return { status: 'skipped', ruleId: -1, fqn: symbol.fqn,
        isRule: symbol.isRule, reason: 'checksum_match', dependencies: deps };
    }
  }

  const ast = astParser.parse(req.ruleJson);
  const promptCtx = astParser.toPromptContext(ast);

  // Store rule into symbols table (virtual file + symbol + body + CODE_ENRICHMENT)
  let result;
  try {
    result = await syncRuleToSymbols(
      // SA4E-241: pass the client checksum so content_hash == bulk-check value (INV-1).
      memoryEngine.getAdapter(), req.ruleJson, req.projectId, promptCtx, req.checksum ?? '',
    );
  } catch (err) {
    // SA4E-241 (NT-4): a missing checksum is a hard, caller-facing failure — do NOT
    // swallow it as a generic "skip". Re-throw so the route returns 400 (upgrade ext).
    if (err instanceof MissingChecksumError) { throw err; }
    logger.warn({ err, fqn: symbol.fqn }, 'Failed to sync rule to symbols — skipped');
    return { status: 'skipped', ruleId: -1, fqn: symbol.fqn,
      isRule: symbol.isRule, reason: 'symbol_sync_error', dependencies: deps };
  }
  if (!result) {
    return { status: 'skipped', ruleId: -1, fqn: symbol.fqn,
      isRule: symbol.isRule, reason: 'symbol_skip', dependencies: deps };
  }

  return { status: 'success', ruleId: result.symbolId, fqn: symbol.fqn,
    isRule: symbol.isRule, dependencies: deps };
}

/** Check if rule exists in symbols with matching content hash + enrichment status. */
async function checkRuleChecksum(
  memoryEngine: MemoryEngine,
  projectId: string,
  fqn: string,
  checksum: string,
): Promise<{ exists: boolean; checksumMatch: boolean; needsEnrichment: boolean; symbolId: number }> {
  const adapter = memoryEngine.getAdapter();
  const row = await adapter.getAsync<{ content_hash: string | null; symbol_id: number; enrichment_status: string | null; summary: string | null }>(
    `SELECT f.content_hash, s.id as symbol_id, s.enrichment_status, s.summary
     FROM symbols s JOIN files f ON f.id = s.file_id
     WHERE s.project_id = $1 AND s.signature = $2 AND s.kind LIKE 'pega_%'
     LIMIT 1`,
    [projectId, fqn],
  );
  if (!row) return { exists: false, checksumMatch: false, needsEnrichment: false, symbolId: 0 };
  const needsEnrichment = !(row.enrichment_status === 'COMPLETED' && row.summary);
  return { exists: true, checksumMatch: row.content_hash === checksum, needsEnrichment, symbolId: row.symbol_id };
}

/** SA4E-209: Create enrichment task for a checksum-deduped symbol that lacks enrichment. */
async function ensureEnrichmentTask(
  adapter: DatabaseAdapter, symbolId: number, symbolName: string,
  kind: string, filePath: string, projectId: string,
): Promise<void> {
  // Check no pending/processing task already exists for this symbol
  const existing = await adapter.getAsync<{ id: number }>(
    `SELECT id FROM pending_tasks WHERE task_type = $1 AND entry_id = $2
     AND status IN ('PENDING', 'PROCESSING') LIMIT 1`,
    [TaskType.CODE_ENRICHMENT, symbolId],
  );
  if (existing) return;

  const payload = JSON.stringify({
    symbolId, symbolName, symbolKind: kind,
    projectId, filePath, workspaceType: 'pega',
  });
  const now = new Date().toISOString();
  await adapter.runAsync(
    `INSERT INTO pending_tasks (task_type, entry_id, status, payload, max_retries, project_id, created_at)
     VALUES ($1, $2, $3, $4, 3, $5, $6)`,
    [TaskType.CODE_ENRICHMENT, symbolId, TaskStatus.PENDING, payload, projectId, now],
  );
  logger.debug({ symbolId, symbolName, kind }, 'Enrichment task created for deduped symbol');
}
