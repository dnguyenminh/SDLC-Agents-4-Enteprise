/**
 * Module Helper — Module detection and pattern analysis.
 * SA4E-53: Async-only API for PostgreSQL compatibility.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { Logger } from 'pino';
import type { ExtractedSymbol } from '../parsers/signature-extractor.js';
import { detectPatterns, inferModulePurpose } from '../parsers/pattern-detector.js';

/** Detect module from relative file path. */
export function detectModule(relativePath: string): string {
  const p = relativePath.replace(/\\/g, '/');

  // ---- SA4E-223: Salesforce UI / metadata segment checks (placed BEFORE default) ----
  if (p.includes('/pages/')) return 'visualforce-pages';
  if (p.includes('/components/')) return 'visualforce-components'; // .component (VF) — BR-3
  if (p.includes('/layouts/')) return 'sf-layouts';
  if (p.includes('/permissionsets/')) return 'sf-permissionsets';
  if (p.includes('/profiles/')) return 'sf-profiles';
  if (p.includes('/tabs/')) return 'sf-tabs';
  if (p.includes('/flexipages/')) return 'sf-flexipages';
  if (p.includes('/labels/')) return 'sf-labels';
  if (p.includes('/reports/')) return 'sf-reports';
  if (p.includes('/dashboards/')) return 'sf-dashboards';
  if (p.includes('/sites/')) return 'sf-sites';
  if (p.includes('/staticresources/')) return 'sf-staticresources';
  if (p.includes('/email/')) return 'sf-email';
  if (p.includes('/testSuites/')) return 'sf-testsuites';
  if (p.includes('/aura/')) return 'aura-components'; // .cmp/.app/.evt/.intf/.tokens

  if (p.includes('force-app/')) {
    if (p.includes('/classes/')) return 'apex-classes';
    if (p.includes('/triggers/')) return 'apex-triggers';
    if (p.includes('/flows/')) return 'sf-flows';
    if (p.includes('/objects/')) return 'sf-objects';
    if (p.includes('/lwc/')) return 'lwc-components';
    if (p.includes('/aura/')) return 'aura-components';
    return 'salesforce';
  }

  const parts = p.split('/');
  if (parts.length >= 2 && parts[0] === 'src') return parts[1];
  if (parts.length >= 1) return parts[0];
  return 'root';
}

interface ModuleAggregate {
  name: string;
  language: string;
  file_count: number;
  symbol_count: number;
}

/**
 * Collapse (module, language) rows to one row per module name.
 * file_count sums; symbol_count is already per-module (the subquery ignores
 * language) so take MAX to avoid double-counting; language = the variant
 * owning the most files. Without this merge, a bilingual module violates
 * UNIQUE(project_id, name) on INSERT.
 */
function mergeModuleLanguages(
  rows: { module: string; language: string; file_count: number; symbol_count: number }[],
): ModuleAggregate[] {
  const merged = new Map<string, ModuleAggregate & { top: number }>();
  for (const row of rows) {
    const cur = merged.get(row.module);
    if (!cur) {
      merged.set(row.module, { name: row.module, language: row.language, file_count: row.file_count, symbol_count: row.symbol_count, top: row.file_count });
    } else {
      cur.file_count += row.file_count;
      cur.symbol_count = Math.max(cur.symbol_count, row.symbol_count);
      if (row.file_count > cur.top) { cur.language = row.language; cur.top = row.file_count; }
    }
  }
  return [...merged.values()].map(({ top, ...m }) => m);
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

  for (const m of mergeModuleLanguages(rows)) {
    await adapter.runAsync(
      'INSERT INTO modules (project_id, name, root_path, language, file_count, symbol_count) VALUES (?, ?, ?, ?, ?, ?)',
      [projectId, m.name, m.name, m.language, m.file_count, m.symbol_count],
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
