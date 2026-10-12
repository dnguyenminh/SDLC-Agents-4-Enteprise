/**
 * PiAgentSessionHost — SA4E-334 Option A.
 * Real pi-coding-agent AgentSession per workspaceRoot:
 * cwd + SessionManager (workspace-local .jsonl transcripts) +
 * ModelRuntime (in-memory API key, no auth.json writes) +
 * DefaultResourceLoader (additionalExtensionPaths = our 7 pi.dev packages,
 * appendSystemPrompt = workspace root prompt).
 *
 * Session-first with legacy fallback: any failure throws a descriptive
 * Error and the caller (PiWorkflowAdapter) keeps the legacy
 * PiWorkflowEngine path. Never hangs a turn (30s ensure timeout).
 */
import * as path from 'node:path';
import { debugLog } from '../debug-logger';
import { logger } from '../logger';
import { resolveContextBudget } from '../pi-agent/context-budget-resolver.js';
import type { ContextBudget } from '../pi-agent/models/ContextBudget';
import { SMALL_CONTEXT_WINDOW_THRESHOLD } from '../pi-agent/model-router.js';
import { compressPrompt, estimateTokenCount } from '../pi-agent/prompt-compressor.js';
import { RoleScopeFilter, type SkillRef } from '../pi-agent/role-scope.js';
import { scopedSteering } from '../pi-agent/scoped-steering.js';
import { buildSessionToolLoadout, nameTools, toolSchemaTokenCap } from '../pi-agent/tool-loadout.js';
import { estimateToolSchemaTokens } from '../pi-agent/tool-schema-tokens.js';
import { runSessionBudgetGate } from '../pi-agent/session-budget-gate.js';
import { halveSteeringCap } from '../pi-agent/budget-gate.js';
import { DEFAULT_AUTO_CHUNK_CONFIG, chunkPrompt, shouldAutoChunk, synthesizeChunks } from '../pi-agent/context-budget-auto-split.js';
import { buildWorkspaceSystemPrompt } from './pi-coding-tools.js';
import { createWorkspaceInfoTool, toSessionToolDefinition, WORKSPACE_INFO_TOOL_NAME } from './workspace-info-tool.js';
import { getPiExtensionEntries, getPiExtensionAgentTools } from './pi-extension-runtime.js';
import { mapAgentEvent, ToolEventTracker, type EventCollector } from './pi-event-mapper.js';
import type { NormalizedToolCall } from './types/executor.types.js';

export interface SessionHostOptions {
  workspaceRoot: string;
  providerId: string;
  apiKey?: string;
  baseUrl?: string;
  /** Raw configured model ('' / 'auto' allowed — resolved inside). */
  configuredModelId?: string;
  /**
   * SA4E-355 UC-02 (BR-07): pipeline role for scoped skills/steering.
   * Absent/unknown role fails open — nothing is filtered away.
   */
  role?: string;
  /** SA4E-355 UC-02: pipeline phase for steering scoping (unmapped phase → shared-* only). */
  phase?: string;
  /** SA4E-355 UC-01/BR-12: provider-detected context window (meta.n_ctx) when available. */
  nCtxDetected?: number;
  /** DI: prebuilt managers (tests use inMemory variants). */
  sessionManager?: unknown;
  settingsManager?: unknown;
  resourceLoader?: unknown;
}

export interface SessionTurnResult {
  text: string;
  toolCalls: NormalizedToolCall[];
  sessionFile?: string;
}

const hosts = new Map<string, Promise<SessionHost>>();

/**
 * SA4E-336: OS-aware base tool loadout (TDD §3.6).
 * win32 → include `powershell`, exclude `bash`; non-win32 → the reverse.
 * A single shell tool per platform avoids model confusion / dual shell.
 * @param _workspaceRoot workspace root (reserved; loadout is platform-driven)
 * @returns ordered tool-name allowlist including the orientation tool
 */
export function getSessionToolLoadout(_workspaceRoot: string): string[] {
  const shellTool = process.platform === 'win32' ? 'powershell' : 'bash';
  return ['read', 'write', 'edit', shellTool, 'grep', 'find', 'ls', WORKSPACE_INFO_TOOL_NAME];
}

interface SessionHost {
  promptTurn(
    text: string,
    onToken?: (t: string) => void,
    onToolEvent?: (e: import('./pi-event-mapper.js').ToolLiveEvent) => void
  ): Promise<SessionTurnResult>;
  getSessionFile(): string | undefined;
  dispose(): void;
}

function pickDefaultModelId(
  models: Array<{ id: string }>,
  providerId: string
): string | undefined {
  if (!models.length) return undefined;
  const pref = providerId === 'openai' ? /gpt-4o|gpt-4\.1|gpt-5/i : /sonnet|opus/i;
  return (models.find((m) => pref.test(m.id)) ?? models[0]).id;
}

/** SA4E-355 session governance decision (UC-01 + UC-03 + UC-06 Task 6). */
interface SessionGovernance {
  budget: ContextBudget;
  shouldCompress: boolean;
  /** Window-based behavior tier from the resolved nCtx (OI-1). */
  tier: SessionTier;
}

/**
 * SA4E-355 Task 6 (UC-06, OI-1): session behavior tier resolved from the
 * REAL nCtx (window-based primary — deterministic on the actual constraint,
 * not the model name). Applies the binary classifyTier rule
 * (nCtx <= SMALL_CONTEXT_WINDOW_THRESHOLD → small) onto the 3-tier behavior
 * scale from FSD §3.6.4: small ≤ 16,384; medium < 128,000; large ≥ 128,000.
 */
export type SessionTier = 'small' | 'medium' | 'large';

/** Large-tier floor (FSD §3.6.4: large ≥ 128k — no compression, full loadout). */
export const LARGE_CONTEXT_WINDOW_THRESHOLD = 128000;

/**
 * Resolves the behavior tier from the resolved nCtx.
 * Invalid windows fail safe to small (EF-1 UC-06: unknown → safe side).
 */
export function resolveSessionTier(nCtx: number): SessionTier {
  if (!Number.isFinite(nCtx) || nCtx <= 0) return 'small';
  if (nCtx <= SMALL_CONTEXT_WINDOW_THRESHOLD) return 'small';
  if (nCtx >= LARGE_CONTEXT_WINDOW_THRESHOLD) return 'large';
  return 'medium';
}

/**
 * BR-04 compression condition with Task 6 tier wiring: over-budget static OR
 * small tier (forced even on surplus); medium/large on surplus stay
 * byte-identical (Wave 2/3 behavior preserved).
 */
export function resolveShouldCompress(
  measuredStaticTokens: number,
  staticBudget: number,
  tier: SessionTier
): boolean {
  return measuredStaticTokens > staticBudget || tier === 'small';
}

/**
 * SA4E-355 UC-01/UC-03/UC-06: resolves the session ContextBudget via the
 * Task-1 resolver (fallback chain provider → registry → 8192, never 0 —
 * BR-01), the window-based behavior tier from the REAL nCtx (Task 6, OI-1),
 * and the conditional compression flag (measured static > staticBudget OR
 * small tier — BR-04).
 */
function resolveSessionGovernance(
  piCoding: typeof import('@earendil-works/pi-coding-agent'),
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
  piCoding: typeof import('@earendil-works/pi-coding-agent'),
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
function loadSessionContextFiles(
  piCoding: typeof import('@earendil-works/pi-coding-agent'),
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

/** UC-04: estimated schema tokens of bare tool names (OI-4 name estimate). */
function tokensOfNames(names: readonly string[]): number {
  return names.reduce((sum, name) => sum + estimateToolSchemaTokens({ name }), 0);
}

/** UC-02/BR-07: role-scoped skills via the existing RoleScopeFilter (wire-only, BR-11). */
function applyScopedSkills<TSkill extends { name?: string }, TDiag>(
  base: { skills: TSkill[]; diagnostics: TDiag[] },
  role: string | undefined
): { skills: TSkill[]; diagnostics: TDiag[] } {
  const scope = new RoleScopeFilter();
  const refs: SkillRef[] = base.skills.map((s) => ({ id: String(s?.name ?? '') }));
  const allowed = new Set(scope.filterSkills(role ?? '', refs).map((r) => r.id));
  return { ...base, skills: base.skills.filter((s) => allowed.has(String(s?.name ?? ''))) };
}

/** UC-03/BR-04: conditional compression — byte-identical pass-through when not needed. */
function applyCompressedAgentsFiles<TFile extends { path: string; content: string }>(
  base: { agentsFiles: TFile[] },
  shouldCompress: boolean
): { agentsFiles: TFile[] } {
  if (!shouldCompress) return base;
  return {
    agentsFiles: base.agentsFiles.map((f) => ({ ...f, content: compressPrompt(f.content) }) as TFile),
  };
}

/** EF-1 UC-02: any override failure fails open to the base content + error log. */
function failOpenOverride<T>(base: T, apply: (base: T) => T, context: string): T {
  try {
    return apply(base);
  } catch (err) {
    logger.error('PI_OVERRIDE_FAILED', { context, error: (err as Error).message });
    return base;
  }
}

async function createHost(opts: SessionHostOptions): Promise<SessionHost> {
  const { workspaceRoot, providerId } = opts;
  const piCoding = await import('@earendil-works/pi-coding-agent');

  const agentDir = piCoding.getAgentDir();
  const modelRuntime = await piCoding.ModelRuntime.create();
  // NOTE: session-first serves cloud (key-requiring) providers only.
  // Local endpoints go through the legacy gateway path (see trySessionTurn),
  // so only real keys are seeded here — never dummies.
  if (opts.apiKey) {
    await modelRuntime.setRuntimeApiKey(providerId, opts.apiKey);
  }
  if (opts.baseUrl) {
    try {
      modelRuntime.registerProvider(providerId, { baseUrl: opts.baseUrl } as never);
      debugLog(`[PiSessionHost] gateway registered for '${providerId}'`);
    } catch (err) {
      debugLog(`[PiSessionHost] gateway register skipped: ${(err as Error).message}`);
    }
  }

  const raw = (opts.configuredModelId ?? '').trim();
  let model = raw ? modelRuntime.getModel(providerId, raw) : undefined;
  if (!model) {
    const listed = [...(modelRuntime.getModels(providerId) as unknown as Array<{ id: string }>)];
    const pool = listed.length
      ? listed
      : [...(modelRuntime.getModels() as unknown as Array<{ id: string }>)];
    const fallbackId = pickDefaultModelId(pool, providerId);
    if (fallbackId) {
      model =
        modelRuntime.getModel(providerId, fallbackId) ??
        (modelRuntime.getModels() as unknown as Array<{ id: string }>).find(
          (m) => m.id === fallbackId
        ) as never;
    }
  }
  if (!model) {
    throw new Error(
      `PI_MODEL_UNRESOLVED: no model for provider '${providerId}' (session path; legacy fallback applies)`
    );
  }

  const settingsManager =
    (opts.settingsManager as never) ?? piCoding.SettingsManager.create(workspaceRoot, agentDir);
  const sessionDir = path.join(workspaceRoot, '.pi', 'sessions');
  const sessionManager =
    (opts.sessionManager as never) ?? piCoding.SessionManager.create(workspaceRoot, sessionDir);
  // SA4E-355 (TDD §6.1): resolve the session budget + conditional compression
  // decision BEFORE wiring the loader overrides (UC-01 feeds UC-02/UC-03).
  const workspacePrompt = buildWorkspaceSystemPrompt(workspaceRoot);
  const { budget, shouldCompress, tier } = resolveSessionGovernance(
    piCoding,
    opts,
    model,
    workspaceRoot,
    agentDir,
    workspacePrompt
  );
  // SA4E-355 Task 4 (UC-04): role-aware loadout — extension/MCP names are
  // filtered by role + phase under the schema-token cap. Core file tools are
  // NEVER dropped (BR-06); unknown role keeps the full pool (BR-07
  // fail-open); discoveryTools: [] keeps the Wave-2 allowlist composition.
  const baseTools = getSessionToolLoadout(workspaceRoot);
  let extNames: string[] = [];
  try {
    const ext = await getPiExtensionAgentTools(workspaceRoot);
    extNames = ext.tools.map((t) => t.name);
    if (ext.loaded.length > 0 || ext.skipped.length > 0) {
      debugLog(`[PiSessionHost] extensions: loaded=${ext.loaded.length} skipped=${ext.skipped.length}`);
    }
  } catch (err) {
    debugLog(`[PiSessionHost] extension names skipped: ${(err as Error).message}`);
  }
  const loadout = buildSessionToolLoadout({
    role: opts.role,
    phase: opts.phase,
    schemaTokenCap: toolSchemaTokenCap(budget),
    coreTools: nameTools(baseTools),
    discoveryTools: [],
    mcpTools: nameTools(extNames),
  });
  // SA4E-355 Task 5 (UC-05): fail-safe gate BEFORE createAgentSession.
  // REJECT throws PI_CONTEXT_BUDGET_EXCEEDED (provider never called, BR-09);
  // WARN logs and proceeds (AF-1 UC-05). Escalation takes real effect below.
  const gate = runSessionBudgetGate(budget, {
    loadFiles: () => loadSessionContextFiles(piCoding, workspaceRoot, agentDir),
    workspacePrompt,
    toolSchemaTokens: loadout.schemaTokens,
    minToolSchemaTokens: tokensOfNames(baseTools),
    shouldCompress,
  });
  // Escalation takes real effect: forced compression, halved steering share,
  // minimal allowlist (BR-08). Unescalated path keeps Wave-2 composition.
  const finalCompress = gate.shouldCompress;
  let steeringBudget = gate.steeringBudget;
  // SA4E-355 auto-fallback: tier small → incremental steering + lean loadout
  const tierSmall = tier === 'small';
  if (tierSmall && DEFAULT_AUTO_CHUNK_CONFIG.incrementalSteering) {
    steeringBudget = halveSteeringCap(steeringBudget);
  }
  const resourceLoader =
    (opts.resourceLoader as never) ??
    new piCoding.DefaultResourceLoader({
      cwd: workspaceRoot,
      agentDir,
      settingsManager,
      additionalExtensionPaths: getPiExtensionEntries(workspaceRoot),
      appendSystemPrompt: [workspacePrompt],
      // SA4E-355 Task 2 (UC-02): role-scoped skills + phase-scoped, capped steering.
      skillsOverride: (base) =>
        failOpenOverride(base, (b) => applyScopedSkills(b, opts.role), 'skillsOverride'),
      // SA4E-355 Task 3+5 (UC-03/UC-05): conditional compression of AGENTS.md
      // context files — forced when the gate escalated (BR-04/BR-08).
      agentsFilesOverride: (base) =>
        failOpenOverride(base, (b) => applyCompressedAgentsFiles(b, finalCompress), 'agentsFilesOverride'),
      // SA4E-355 Task 2+3+5: scoped steering with the same conditional
      // compression over the gate-halved share when step 2 fired (BR-08).
      appendSystemPromptOverride: (base) =>
        failOpenOverride(
          base,
          (b) => scopedSteering(b, opts.role, opts.phase, steeringBudget, { compress: finalCompress }),
          'appendSystemPromptOverride'
        ),
    });

  // Tool allowlist: escalation step 3 (BR-08) drops back to the core
  // file tools + orientation; otherwise the role-aware loadout above.
  // Dedupe keeps AFT's hoisted overrides single-named.
  // Auto-fallback lean loadout only for very small context (≤4k)
  const verySmallCtx = budget.nCtx <= 4096;
  const autoLean = tierSmall && verySmallCtx && DEFAULT_AUTO_CHUNK_CONFIG.leanLoadout;
  const effectiveMinLoadout = gate.minLoadout || autoLean;
  const allowlist = (effectiveMinLoadout ? [...baseTools] : loadout.loadout).filter(
    (n, i, all) => typeof n === 'string' && n && all.indexOf(n) === i
  );
  debugLog(`[PiSessionHost] tool allowlist: ${allowlist.length} names`);

  const { session } = await piCoding.createAgentSession({
    cwd: workspaceRoot,
    modelRuntime: modelRuntime as never,
    model: model as never,
    resourceLoader: resourceLoader as never,
    sessionManager: sessionManager as never,
    settingsManager: settingsManager as never,
    // Zero-arg orientation tool (same builder as the legacy path).
    customTools: [
      toSessionToolDefinition(createWorkspaceInfoTool(workspaceRoot)),
    ] as never,
    tools: allowlist,
  });

  debugLog(`[PiSessionHost] session ready (cwd=${workspaceRoot})`);
  const getFile = (): string | undefined => {
    try {
      return (sessionManager as { getSessionFile?: () => string })?.getSessionFile?.();
    } catch {
      return undefined;
    }
  };

  return {
    getSessionFile: getFile,
    dispose: () => {
      try {
        (session as { dispose?: () => void }).dispose?.();
      } catch { /* best-effort */ }
    },
    async promptTurn(
      text: string,
      onToken?: (t: string) => void,
      onToolEvent?: (e: import('./pi-event-mapper.js').ToolLiveEvent) => void
    ): Promise<SessionTurnResult> {
      const runOnce = async (promptText: string): Promise<string> => {
        const localCollector: EventCollector = { chunks: [], toolCalls: [], text: '' };
        const localTracker = new ToolEventTracker();
        const unsub = (session as { subscribe: (l: (e: unknown) => void) => () => void }).subscribe(
          (event) => {
            try {
              const live = localTracker.observe(event as never);
              if (live && onToolEvent) {
                try { onToolEvent(live); } catch {}
              }
              mapAgentEvent(event as never, localCollector);
            } catch {}
            const last = localCollector.chunks[localCollector.chunks.length - 1];
            if (last?.type === 'text' && last.content) onToken?.(last.content);
          }
        );
        try {
          await (session as { prompt: (t: string) => Promise<void> }).prompt(promptText);
        } finally {
          try { unsub(); } catch {}
        }
        return localCollector.text;
      };

      const promptTokens = estimateTokenCount(text);
      if (shouldAutoChunk(tier, promptTokens, DEFAULT_AUTO_CHUNK_CONFIG)) {
        const chunks = chunkPrompt(text, DEFAULT_AUTO_CHUNK_CONFIG.maxTokensPerChunk);
        const parts: string[] = [];
        for (const ch of chunks) {
          const part = await runOnce(ch);
          parts.push(part);
        }
        const combined = synthesizeChunks(parts);
        const final = await runOnce(`Synthesize the following parts into a coherent final answer:\n${combined}`);
        return {
          text: final,
          toolCalls: [],
          sessionFile: getFile(),
        };
      }

      const collector: EventCollector = { chunks: [], toolCalls: [], text: '' };
      const tracker = new ToolEventTracker();
      const unsub = (session as { subscribe: (l: (e: unknown) => void) => () => void }).subscribe(
        (event) => {
          try {
            const live = tracker.observe(event as never);
            if (live && onToolEvent) {
              try { onToolEvent(live); } catch {}
            }
            mapAgentEvent(event as never, collector);
          } catch {}
          const last = collector.chunks[collector.chunks.length - 1];
          if (last?.type === 'text' && last.content) onToken?.(last.content);
        }
      );
      try {
        await (session as { prompt: (t: string) => Promise<void> }).prompt(text);
      } finally {
        try { unsub(); } catch {}
      }
      return {
        text: collector.text,
        toolCalls: (collector.toolCalls as NormalizedToolCall[]).map((t) => ({
          id: String(t.id),
          name: String(t.name),
          arguments: (t.arguments ?? {}) as Record<string, unknown>,
        })),
        sessionFile: getFile(),
      };
    },
  };
}

/** Cached per workspaceRoot; 30s ensure timeout so turns never hang. */
export function ensureSessionHost(opts: SessionHostOptions): Promise<SessionHost> {
  const key = opts.workspaceRoot || '(default)';
  const hit = hosts.get(key);
  if (hit) return hit;
  const job = Promise.race([
    createHost(opts),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('PI_SESSION_TIMEOUT: AgentSession ensure >30s')), 30_000)
    ),
  ]);
  hosts.set(key, job);
  job.catch(() => {
    if (hosts.get(key) === job) hosts.delete(key);
  });
  return job;
}

/** Test hook. */
export function clearSessionHostCache(): void {
  hosts.clear();
}
