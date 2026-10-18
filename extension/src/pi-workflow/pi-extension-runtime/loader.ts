/**
 * Pi extension tool loading + adaptation (SA4E-334 Phase 2).
 * Loads pi.dev ESM extensions via pi-coding-agent's loader and adapts
 * their RegisteredTool definitions to pi-agent-core AgentTools.
 *
 * Extensions are cached per workspaceRoot (AFT spawns one Rust process
 * per session — must NOT reload every turn). Never throws — returns
 * { tools, loaded, skipped } for diagnostics.
 */

import { debugLog } from '../../debug-logger';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ChatExtToWebviewMessage } from '../../chat-panel/message-protocol';
import { resolveExtensionEntries } from './find-package';
import { stubCtxFactory } from './stub-ui';

export interface CachedRuntime {
  tools: AgentTool[];
  loaded: string[];
  skipped: Array<{ name: string; reason: string }>;
}

const cache = new Map<string, Promise<CachedRuntime>>();

/** Load + adapt extension tools once per workspaceRoot (cached). */
export function getPiExtensionAgentTools(
  workspaceRoot: string,
  onEvent?: (msg: ChatExtToWebviewMessage) => void
): Promise<CachedRuntime> {
  const key = workspaceRoot || '(default)';
  const hit = cache.get(key);
  if (hit) return hit;
  // SA4E-334: first load may download AFT binary / init Rust process —
  // never block a chat turn more than 30s; built-ins still answer.
  const job = Promise.race([
    loadOnce(workspaceRoot, onEvent),
    new Promise<CachedRuntime>((resolve) =>
      setTimeout(
        () =>
          resolve({
            tools: [],
            loaded: [],
            skipped: [{ name: '(timeout)', reason: 'extension load >30s (likely AFT binary download); retry in background' }],
          }),
        30_000
      )
    ),
  ]).then((res) => {
    // If we won via timeout but the real load later succeeds, refresh cache.
    if (res.loaded.length === 0) {
      loadOnce(workspaceRoot, onEvent)
        .then((full) => {
          if (full.tools.length > 0) cache.set(key, Promise.resolve(full));
        })
        .catch(() => undefined);
    }
    return res;
  });
  cache.set(key, job);
  return job;
}

async function loadOnce(
  workspaceRoot: string,
  onEvent?: (msg: ChatExtToWebviewMessage) => void
): Promise<CachedRuntime> {
  const tools: AgentTool[] = [];
  const loaded: string[] = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  try {
    const piCoding = await import('@earendil-works/pi-coding-agent');
    const entries = resolveExtensionEntries(workspaceRoot);
    if (entries.length === 0) {
      return { tools, loaded, skipped: [{ name: '(all)', reason: 'no extension entries resolved' }] };
    }
    const ctxFactory = stubCtxFactory(workspaceRoot, onEvent);
    const eventBus = piCoding.createEventBus ? piCoding.createEventBus() : undefined;
    const result = await piCoding.discoverAndLoadExtensions(
      entries.map((e) => e.entry),
      workspaceRoot || process.cwd(),
      undefined,
      eventBus
    );
    const fakeRunner = {
      createContext: () => ctxFactory() as unknown as Record<string, unknown>,
      getActiveTools: () => [] as string[],
    };
    for (const ext of result.extensions ?? []) {
      const regs = [...(ext.tools?.values?.() ?? [])];
      try {
        const wrapped = piCoding.wrapRegisteredTools(regs, fakeRunner as never) as unknown as AgentTool[];
        for (const w of wrapped) {
          if (w && typeof (w as { name?: unknown }).name === 'string') tools.push(w);
        }
      } catch (err) {
        skipped.push({ name: ext.path, reason: `wrap failed: ${(err as Error).message.slice(0, 120)}` });
        continue;
      }
      loaded.push(ext.path);
    }
    // SA4E-334 auto-compression: capture `context` handlers for the pipeline.
    await captureContextHandlers(workspaceRoot, result.extensions ?? []);
    for (const e of result.errors ?? []) {
      skipped.push({ name: e.path, reason: e.error.slice(0, 200) });
    }
    debugLog(`[PiExtensionRuntime] tools=${tools.length} loaded=${loaded.length} skipped=${skipped.length}`);
  } catch (err) {
    debugLog(`[PiExtensionRuntime] load failed (non-fatal): ${(err as Error).message}`);
    skipped.push({ name: '(runtime)', reason: (err as Error).message.slice(0, 200) });
  }
  return { tools, loaded, skipped };
}

/** SA4E-334 auto-compression: capture `context` handlers for the pipeline. */
async function captureContextHandlers(
  workspaceRoot: string,
  extensions: Array<{ handlers?: unknown }>,
): Promise<void> {
  try {
    const fns: Array<(...args: unknown[]) => Promise<unknown>> = [];
    for (const ext of extensions) {
      const list = (ext as { handlers?: Map<string, unknown> }).handlers?.get?.('context') as unknown;
      if (Array.isArray(list)) {
        for (const fn of list as Array<(...args: unknown[]) => Promise<unknown>>) {
          if (typeof fn === 'function') fns.push(fn);
        }
      }
    }
    if (fns.length > 0) {
      const { setContextHandlers } = await import('../pi-context-pipeline.js');
      setContextHandlers(workspaceRoot, fns);
      debugLog(`[PiExtensionRuntime] context handlers: ${fns.length}`);
    }
  } catch (err) {
    debugLog(`[PiExtensionRuntime] context handler capture failed: ${(err as Error).message}`);
  }
}

/** Test/dispose hook — clears the per-workspace cache. */
export function clearPiExtensionRuntimeCache(): void {
  cache.clear();
}
