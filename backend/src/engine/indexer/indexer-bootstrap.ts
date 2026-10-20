/**
 * Indexer bootstrap — tree-sitter init + graph schema (BR-18 extraction).
 * Returns the initialized collaborators for the IndexingEngine fields.
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { AppConfig } from '../config.js';
import { GraphRepository } from '../graph/graph-repository.js';
import { runGraphMigrations, isGraphSchemaReady, ensurePostgresSymbolFts } from '../graph/migrator.js';
import { detectSfdxProject } from './sfdx-helper.js';
import { GrammarRegistry, loadGrammarConfig } from '../parsers/grammar-registry.js';
import { TreeSitterIndexer } from '../parsers/tree-sitter-indexer.js';
import type pino from 'pino';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface TreeSitterInit {
  graphRepo: GraphRepository | null;
  treeSitterIndexer: TreeSitterIndexer | null;
  grammarRegistry: GrammarRegistry | null;
  treeSitterReady: boolean;
}

/** SA4E-53: Ensure graph schema is ready (async migration). */
export async function ensureGraphSchema(adapter: DatabaseAdapter): Promise<void> {
  const ready = await isGraphSchemaReady(adapter);
  if (!ready) await runGraphMigrations(adapter);
  // Ensure PostgreSQL symbol FTS infrastructure exists even when the graph
  // schema was already provisioned (idempotent; no-op on SQLite).
  await ensurePostgresSymbolFts(adapter);
}

/** Initialize tree-sitter indexer (regex fallback when grammar config is missing). */
export function initTreeSitter(adapter: DatabaseAdapter, config: AppConfig, logger: pino.Logger): TreeSitterInit {
  // SA4E-53: schema check is async — run migrations lazily, non-blocking
  ensureGraphSchema(adapter).catch(err => {
    logger.error({ err }, '[indexer] Graph schema init failed');
  });
  try {
    const graphRepo = new GraphRepository(adapter);
    const configPath = [path.resolve(__dirname, '../parsers/grammar-config.json'), path.resolve(__dirname, '../../src/parsers/grammar-config.json')].find(fs.existsSync);
    if (configPath) {
      const grammarConfig = loadGrammarConfig(configPath);
      const grammarRegistry = new GrammarRegistry(grammarConfig);
      const treeSitterIndexer = new TreeSitterIndexer(grammarRegistry, adapter, config.maxFileSize, config.workspace);
      logger.error(`[indexer] Tree-sitter initialized (${grammarConfig.languages.length} langs)` + (detectSfdxProject(config.workspace) ? ' [SFDX]' : ''));
      return { graphRepo, treeSitterIndexer, grammarRegistry, treeSitterReady: true };
    }
    logger.error(`[indexer] Grammar config not found, using regex fallback`);
    return { graphRepo, treeSitterIndexer: null, grammarRegistry: null, treeSitterReady: false };
  } catch (err) {
    logger.error({ err }, '[indexer] Tree-sitter init failed, using regex fallback:');
    return { graphRepo: null, treeSitterIndexer: null, grammarRegistry: null, treeSitterReady: false };
  }
}

export function getTreeSitterStats(grammarRegistry: GrammarRegistry | null, treeSitterReady: boolean) {
  if (!treeSitterReady || !grammarRegistry) return { ready: false, languages: [], unavailableGrammars: [] };
  const allLangs = grammarRegistry.listLanguages();
  return { ready: true, languages: allLangs.filter(l => l.available).map(l => l.id), unavailableGrammars: allLangs.filter(l => !l.available).map(l => l.id) };
}
