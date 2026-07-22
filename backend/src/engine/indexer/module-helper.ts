/**
 * Module Helper — Module detection and pattern analysis.
 * SA4E-53: Async-only API for PostgreSQL compatibility.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { Logger } from 'pino';
import type { ExtractedSymbol } from '../scanner/signature-extractor.js';
import { detectPatterns, inferModulePurpose } from '../scanner/pattern-detector.js';

/** Detect module from relative file path. */
export function detectModule(relativePath: string): string {
  if (relativePath.includes('force-app/')) {
    if (relativePath.includes('/classes/')) return 'apex-classes';
    if (relativePath.includes('/triggers/')) return 'apex-triggers';
    if (relativePath.includes('/flows/')) return 'sf-flows';
    if (relativePath.includes('/objects/')) return 'sf-objects';
    if (relativePath.includes('/lwc/')) return 'lwc-components';
    if (relativePath.includes('/aura/')) return 'aura-components';
    return 'salesforce';
  }

  const parts = relativePath.split('/');
  if (parts.length >= 2 && parts[0] === 'src') return parts[1];
  if (parts.length >= 1) return parts[0];
  return 'root';
}

/** Rebuild the modules table for a single tenant from its files (SA4E-41). */
export async function updateModules(adapter: DatabaseAdapter, projectId: string): Promise<void> {
  await adapter.runAsync('DELETE FROM modules WHERE project_id = ?', [projectId]);
  const rows = await adapter.allAsync<{ module: string; language: string; file_count: number; symbol_count: number }>(
    `SELECT module, language, COUNT(*) as file_count,
            (SELECT COUNT(*) FROM symbols WHERE project_id = ? AND file_id IN (SELECT id FROM files WHERE module = f.module AND project_id = ?)) as symbol_count
     FROM files f
     WHERE module IS NOT NULL AND project_id = ?
     GROUP BY module, language`,
    [projectId, projectId, projectId],
  );

  for (const row of rows) {
    await adapter.runAsync(
      'INSERT INTO modules (project_id, name, root_path, language, file_count, symbol_count) VALUES (?, ?, ?, ?, ?, ?)',
      [projectId, row.module, row.module, row.language, row.file_count, row.symbol_count],
    );
  }
}

/** Process pattern detection for a single module (async). */
async function processModulePatternAsync(
  adapter: DatabaseAdapter, name: string, projectId: string, moduleImports: Map<string, string[]>, logger: Logger
): Promise<void> {
  try {
    const symbols = await adapter.allAsync<ExtractedSymbol>(
      'SELECT name, kind, signature, visibility FROM symbols WHERE project_id = ? AND file_id IN (SELECT id FROM files WHERE module = ? AND project_id = ?)',
      [projectId, name, projectId],
    );
    const classes = symbols.filter(s => s.kind === 'class' || s.kind === 'interface');
    const functions = symbols.filter(s => s.kind === 'function' || s.kind === 'method');
    const imports = moduleImports.get(name) ?? [];
    const patterns = detectPatterns(classes, functions, imports);
    const purpose = inferModulePurpose(name, classes, []);
    await adapter.runAsync(
      'UPDATE modules SET di_style = ?, error_handling = ?, naming_convention = ?, logging_framework = ?, testing_framework = ?, purpose = ? WHERE name = ? AND project_id = ?',
      [patterns.diStyle, patterns.errorHandling, patterns.naming, patterns.logging, patterns.testing, purpose, name, projectId],
    );
  } catch (err) {
    logger.error({ err }, `[indexer] Pattern detection failed for ${name}:`);
  }
}

/** Detect and store coding patterns for one tenant's modules (SA4E-41). */
export async function detectAndStorePatterns(
  adapter: DatabaseAdapter, moduleImports: Map<string, string[]>, logger: Logger, projectId: string
): Promise<void> {
  const startMs = Date.now();
  const modules = await adapter.allAsync<{ name: string }>('SELECT name FROM modules WHERE project_id = ?', [projectId]);

  for (const { name } of modules) {
    await processModulePatternAsync(adapter, name, projectId, moduleImports, logger);
  }
  logger.error(`[indexer] Pattern detection: ${Date.now() - startMs}ms`);
}
