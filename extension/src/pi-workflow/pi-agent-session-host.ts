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
  const resourceLoader =
    (opts.resourceLoader as never) ??
    new piCoding.DefaultResourceLoader({
      cwd: workspaceRoot,
      agentDir,
      settingsManager,
      additionalExtensionPaths: getPiExtensionEntries(workspaceRoot),
      appendSystemPrompt: [buildWorkspaceSystemPrompt(workspaceRoot)],
    });

  // Tool allowlist: ALWAYS the 7 cwd-bound builtins (grep/find/ls are NOT
  // in pi's defaults — without explicit names the session would lack them)
  // plus orientation plus best-effort extension names. Unconditional: a
  // transient extension-load failure then only drops enhancement tools
  // (search/todo/delegate), never the core file tools. Dedupe keeps AFT's
  // hoisted overrides single-named.
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
  // SA4E-336: OS-aware base loadout (powershell on win32, bash on non-win32)
  // plus best-effort extension names + orientation tool, deduped.
  const allowlist = [
    ...getSessionToolLoadout(workspaceRoot),
    ...extNames,
  ].filter((n, i, all) => typeof n === 'string' && n && all.indexOf(n) === i);
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
      const collector: EventCollector = { chunks: [], toolCalls: [], text: '' };
      const tracker = new ToolEventTracker();
      const unsub = (session as { subscribe: (l: (e: unknown) => void) => () => void }).subscribe(
        (event) => {
          try {
            const live = tracker.observe(event as never);
            if (live && onToolEvent) {
              try {
                onToolEvent(live);
              } catch {
                // Progress display must never break streaming.
              }
            }
            mapAgentEvent(event as never, collector);
          } catch { /* collector must never break streaming */ }
          const last = collector.chunks[collector.chunks.length - 1];
          if (last?.type === 'text' && last.content) onToken?.(last.content);
        }
      );
      try {
        await (session as { prompt: (t: string) => Promise<void> }).prompt(text);
      } finally {
        try {
          unsub();
        } catch { /* ignore */ }
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
