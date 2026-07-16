/**
 * CoreTools — CORE allowlist + resolver for Tool Visibility Tiers (SA4E-18).
 * Single source of truth for which tools appear in tools/list (BR-06).
 */

import type { Logger } from 'pino';

/** Meta-tools that MUST always be visible regardless of config (BR-03). */
export const META_TOOLS: readonly string[] = [
  'find_tools', 'execute_dynamic_tool', 'orchestration_status',
] as const;

/** Central CORE allowlist — edit ONLY here to change ListTools visibility (BR-06). */
export const CORE_TOOLS: readonly string[] = [
  'mem_search', 'mem_ingest', 'mem_ingest_file',
  'code_search', 'get_curated_context',
  'find_tools', 'execute_dynamic_tool', 'orchestration_status',
  'drawio_export_png', 'drawio_auto_layout',
] as const;

/**
 * Normalize allowlist: drop invalid (BR-05), de-dup (BR-08),
 * always include META_TOOLS (BR-03). Never throws (BR-04).
 */
export function resolveCoreToolNames(logger?: Logger): Set<string> {
  const src = Array.isArray(CORE_TOOLS) ? CORE_TOOLS : [];
  const valid = src.filter(n => {
    const ok = typeof n === 'string' && n.trim().length > 0;
    if (!ok) logger?.warn({ entry: n }, 'CORE_TOOLS: ignoring invalid entry (BR-05)');
    return ok;
  });
  return new Set<string>([...valid, ...META_TOOLS]);
}
