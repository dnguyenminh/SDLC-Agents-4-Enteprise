/** Pega symbol sync field/display resolvers (BR-18 extraction from PegaSymbolSync). */
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import {
  resolveRuleNameField, resolveClassNameField,
  resolveRuleSetName, resolveRuleSetVersion,
} from './pega-mapping.js';
import { SchemaStorageService, type IDatabaseAdapter } from './schema/SchemaStorageService.js';
import pino from 'pino';

const logger = pino({ name: 'pega-symbol-sync' });

/**
 * Resolve a stable project display name for project_registry.
 * Priority (SA4E-338 B1):
 *   1. explicit `appName` — the extension reads it from the project's
 *      `pega-project.json` (`applicationName`), the authoritative source.
 *   2. rule `pyApplication` / `pyApplicationName` — best-effort when the client
 *      did not send an app name (older extension).
 *   3. projectId — last-resort label.
 * This keeps the display name consistent across ALL rules of the app, instead of
 * the previous behaviour where it became whichever rule's class was processed last.
 */
export function resolvePegaDisplayName(ruleJson: Record<string, unknown>, projectId: string, appName?: string): string {
  const explicit = (appName ?? '').trim();
  if (explicit) return `Pega: ${explicit}`;
  const r = ruleJson as Record<string, unknown>;
  const fromRule = String(r.pyApplication ?? r.pyApplicationName ?? '').trim();
  return `Pega: ${fromRule || projectId}`;
}

/** Resolve "RuleSet Version" display string from rule JSON (both export casings). */
export function resolveRuleSet(ruleJson: Record<string, unknown>): string {
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
export async function resolveNestedLogicPaths(
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
export function extractRequiredFields(ruleJson: Record<string, unknown>) {
  const pxObjClass = String((ruleJson as any)?.pxObjClass || '');
  // Class via shared fallback (pyClassName → pxObjClass) so instance-level Data-Admin
  // rules with no pyClassName still index. MUST match the FQN built in PegaIndexer's
  // checksum dedup so a rule resolves to the SAME identity at write and at dedup.
  const pyClassName = resolveClassNameField(ruleJson);
  // Name via canonical fallback (pyRuleName → pyActivityName → pyModelName → pyFlowName → pyLabel)
  const pyRuleName = resolveRuleNameField(ruleJson);

  if (!pxObjClass || !pyClassName || !pyRuleName) {
    logger.warn({ pxObjClass, pyClassName, pyRuleName }, 'Missing required Pega fields');
    return null;
  }
  return { pxObjClass, pyClassName, pyRuleName };
}
