/**
 * SFDX Helper — Standalone functions for Salesforce DX project detection and stats.
 */

import * as fs from 'fs';
import * as path from 'path';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../config.js';
import type { Logger } from 'pino';

/** Detect whether the workspace is an SFDX project. */
export function detectSfdxProject(workspace: string): boolean {
  return fs.existsSync(path.join(workspace, 'sfdx-project.json'))
    || fs.existsSync(path.join(workspace, 'force-app'));
}

function readPackageDirectories(workspace: string): string[] {
  const sfdxConfigPath = path.join(workspace, 'sfdx-project.json');
  if (!fs.existsSync(sfdxConfigPath)) return ['force-app'];
  try {
    const config = JSON.parse(fs.readFileSync(sfdxConfigPath, 'utf-8'));
    if (Array.isArray(config.packageDirectories)) {
      return config.packageDirectories
        .map((pd: any) => pd.path ?? pd)
        .filter(Boolean);
    }
  } catch { /* ignore parse errors */ }
  return ['force-app'];
}

function queryModuleStats(db: Database.Database): { apex_classes: number; apex_triggers: number; flows: number; objects: number; lwc_components: number; } {
  const moduleCounts = db.prepare(`
    SELECT module, COUNT(*) as count FROM files
    WHERE module IN ('apex-classes', 'apex-triggers', 'sf-flows', 'sf-objects', 'lwc-components')
    GROUP BY module
  `).all() as { module: string; count: number }[];

  const stats = { apex_classes: 0, apex_triggers: 0, flows: 0, objects: 0, lwc_components: 0 };
  for (const row of moduleCounts) {
    switch (row.module) {
      case 'apex-classes': stats.apex_classes = row.count; break;
      case 'apex-triggers': stats.apex_triggers = row.count; break;
      case 'sf-flows': stats.flows = row.count; break;
      case 'sf-objects': stats.objects = row.count; break;
      case 'lwc-components': stats.lwc_components = row.count; break;
    }
  }
  return stats;
}

function querySfRelationships(db: Database.Database): Record<string, number> {
  const sfKinds = ['trigger-on', 'soql', 'dml', 'wire', 'flow-action', 'flow-object', 'apex-import', 'inherits', 'implements'];
  const relCounts = db.prepare(`
    SELECT kind, COUNT(*) as count FROM relationships
    WHERE kind IN (${sfKinds.map(() => '?').join(',')})
    GROUP BY kind
  `).all(...sfKinds) as { kind: string; count: number }[];

  const relationships: Record<string, number> = {};
  for (const row of relCounts) relationships[row.kind] = row.count;
  return relationships;
}

function queryLastIndexed(db: Database.Database): string | null {
  const lastRow = db.prepare(
    `SELECT MAX(last_indexed) as t FROM files WHERE language IN ('apex', 'salesforce-meta')`
  ).get() as { t: string | null };
  return lastRow?.t ?? null;
}

/** Get SFDX project stats from database. */
export function getSfdxStats(
  db: Database.Database, config: AppConfig
): {
  detected: boolean;
  projectRoot: string | null;
  packageDirectories: string[];
  stats: { apex_classes: number; apex_triggers: number; flows: number; objects: number; lwc_components: number };
  lastIndexed: string | null;
  relationships: Record<string, number>;
} | null {
  if (!detectSfdxProject(config.workspace)) return null;
  return {
    detected: true,
    projectRoot: config.workspace,
    packageDirectories: readPackageDirectories(config.workspace),
    stats: queryModuleStats(db),
    lastIndexed: queryLastIndexed(db),
    relationships: querySfRelationships(db),
  };
}

/** Log SFDX-specific stats after indexing. */
export function logSfdxStats(db: Database.Database, config: AppConfig, logger: Logger): void {
  const sfdxStats = getSfdxStats(db, config);
  if (!sfdxStats) return;

  const { stats, relationships } = sfdxStats;
  const totalSf = stats.apex_classes + stats.apex_triggers + stats.flows + stats.objects + stats.lwc_components;
  if (totalSf === 0) return;

  const relCount = Object.values(relationships).reduce((a, b) => a + b, 0);
  logger.error(
    `[indexer] SF stats: ${stats.apex_classes} apex classes, ${stats.apex_triggers} triggers, ` +
    `${stats.flows} flows, ${stats.objects} objects, ${stats.lwc_components} LWC — ${relCount} relationships`
  );
}
