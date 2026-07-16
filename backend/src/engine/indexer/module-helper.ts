/**
 * Module Helper — Module detection and pattern analysis.
 */

import type Database from 'better-sqlite3';
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
export function updateModules(db: Database.Database, projectId: string): void {
  db.prepare('DELETE FROM modules WHERE project_id = ?').run(projectId);
  const rows = db.prepare(`
    SELECT module, language, COUNT(*) as file_count,
           (SELECT COUNT(*) FROM symbols WHERE project_id = ? AND file_id IN (SELECT id FROM files WHERE module = f.module AND project_id = ?)) as symbol_count
    FROM files f
    WHERE module IS NOT NULL AND project_id = ?
    GROUP BY module
  `).all(projectId, projectId, projectId) as { module: string; language: string; file_count: number; symbol_count: number }[];

  const insert = db.prepare(`
    INSERT INTO modules (project_id, name, root_path, language, file_count, symbol_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const row of rows) {
    insert.run(projectId, row.module, row.module, row.language, row.file_count, row.symbol_count);
  }
}

function processModulePattern(
  db: Database.Database, name: string, projectId: string, moduleImports: Map<string, string[]>,
  updateStmt: Database.Statement, logger: Logger
): void {
  try {
    const symbols = db.prepare(
      'SELECT name, kind, signature, visibility FROM symbols WHERE project_id = ? AND file_id IN (SELECT id FROM files WHERE module = ? AND project_id = ?)'
    ).all(projectId, name, projectId) as ExtractedSymbol[];
    const classes = symbols.filter(s => s.kind === 'class' || s.kind === 'interface');
    const functions = symbols.filter(s => s.kind === 'function' || s.kind === 'method');
    const imports = moduleImports.get(name) ?? [];
    const patterns = detectPatterns(classes, functions, imports);
    const purpose = inferModulePurpose(name, classes, []);
    updateStmt.run(patterns.diStyle, patterns.errorHandling, patterns.naming, patterns.logging, patterns.testing, purpose, name, projectId);
  } catch (err) {
    logger.error({ err }, `[indexer] Pattern detection failed for ${name}:`);
  }
}

/** Detect and store coding patterns for one tenant's modules (SA4E-41). */
export function detectAndStorePatterns(
  db: Database.Database, moduleImports: Map<string, string[]>, logger: Logger, projectId: string
): void {
  const startMs = Date.now();
  const modules = db.prepare('SELECT name FROM modules WHERE project_id = ?').all(projectId) as { name: string }[];
  const updateStmt = db.prepare(`
    UPDATE modules SET di_style = ?, error_handling = ?, naming_convention = ?,
    logging_framework = ?, testing_framework = ?, purpose = ? WHERE name = ? AND project_id = ?
  `);

  db.transaction(() => {
    for (const { name } of modules) {
      processModulePattern(db, name, projectId, moduleImports, updateStmt, logger);
    }
  })();
  logger.error(`[indexer] Pattern detection: ${Date.now() - startMs}ms`);
}
