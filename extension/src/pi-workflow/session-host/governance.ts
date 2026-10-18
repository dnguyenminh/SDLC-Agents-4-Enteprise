/**
 * SA4E-355 session governance: ContextBudget resolution, static-token
 * measurement, and the conditional compression decision (UC-01/UC-03/UC-06).
 */
import { resolveContextBudget } from '../../pi-agent/context-budget-resolver.js';
import type { ContextBudget } from '../../pi-agent/models/ContextBudget';
import { estimateTokenCount } from '../../pi-agent/prompt-compressor.js';
import { logger } from '../../logger';
import { resolveSessionTier, resolveShouldCompress, type SessionHostOptions, type SessionTier } from './types.js';

type PiCoding = typeof import('@earendil-works/pi-coding-agent');

/** SA4E-355 session governance decision (UC-01 + UC-03 + UC-06 Task 6). */
interface SessionGovernance {
  budget: ContextBudget;
  shouldCompress: boolean;
  /** Window-based behavior tier from the resolved nCtx (OI-1). */
  tier: SessionTier;
}

/**
 * SA4E-355 UC-01/UC-03/UC-06: resolves the session ContextBudget via the
 * Task-1 resolver (fallback chain provider → registry → 8192, never 0 —
 * BR-01), the window-based behavior tier from the REAL nCtx (Task 6, OI-1),
 * and the conditional compression flag (measured static > staticBudget OR
 * small tier — BR-04).
 */
export function resolveSessionGovernance(
  piCoding: PiCoding,
  opts: SessionHostOptions,
  model: unknown,
  workspaceRoot: string,
  agentDir: string,
  workspacePrompt: string
): SessionGovernance {
  const resolvedModel = (model ?? {}) as { id?: string; contextWindow?: number };
  const budget = resolveContextBudget({
    modelId: resolvedModel.id ?? (opts.configuredModelId ?? ''),
    nCtxDetected: opts.nCtxDetected ?? resolvedModel.contextWindow,
  });
  const tier = resolveSessionTier(budget.nCtx);
  const measuredStaticTokens = measureStaticTokens(piCoding, workspaceRoot, agentDir, workspacePrompt);
  const shouldCompress = resolveShouldCompress(measuredStaticTokens, budget.staticBudget, tier);
  if (shouldCompress) {
    logger.info('PI_COMPRESSION_ENABLED', { measuredStaticTokens, staticBudget: budget.staticBudget, tier });
  }
  return { budget, shouldCompress, tier };
}

/** UC-03: measured static = context-file tokens + workspace prompt tokens (chars/4). */
function measureStaticTokens(
  piCoding: PiCoding,
  workspaceRoot: string,
  agentDir: string,
  workspacePrompt: string
): number {
  const files = loadSessionContextFiles(piCoding, workspaceRoot, agentDir);
  const contextFileTokens = files.reduce((sum, f) => sum + estimateTokenCount(f.content), 0);
  return contextFileTokens + estimateTokenCount(workspacePrompt);
}

/**
 * SA4E-355 Task 5 (UC-05): loads context-file contents for gate measurement.
 * Never throws — an unloadable workspace measures as empty (fail-open).
 */
export function loadSessionContextFiles(
  piCoding: PiCoding,
  workspaceRoot: string,
  agentDir: string
): Array<{ content: string }> {
  try {
    const load = (piCoding as { loadProjectContextFiles?: unknown }).loadProjectContextFiles;
    if (typeof load !== 'function') return [];
    const files = (load as (args: { cwd: string; agentDir: string }) => Array<{ content: string }>)({
      cwd: workspaceRoot,
      agentDir,
    });
    return Array.isArray(files) ? files : [];
  } catch (err) {
    logger.warn('PI_CONTEXT_FILES_MEASURE_FAILED', { error: (err as Error).message }); // fail-open
    return [];
  }
}
