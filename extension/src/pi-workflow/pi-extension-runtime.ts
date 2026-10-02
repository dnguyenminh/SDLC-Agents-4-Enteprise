/**
 * PiExtensionRuntime — SA4E-334 Phase 2.
 * Loads pi.dev ESM extensions via pi-coding-agent's loader and adapts
 * their RegisteredTool definitions to pi-agent-core AgentTools.
 *
 * Design notes:
 * - Extensions are cached per workspaceRoot (AFT spawns one Rust process
 *   per session — must NOT reload every turn).
 * - ctx.ui is stubbed to the Chat webview (notify/setStatus fire-and-forget;
 *   select/confirm/input explain the webview path instead of hanging).
 * - Never throws — returns { tools, loaded, skipped } for diagnostics.
 */
import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLog } from '../debug-logger';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { ChatExtToWebviewMessage } from '../chat-panel/message-protocol';
import { PI_EXTENSION_PACKAGES } from './pi-extension-loader.js';

interface CachedRuntime {
  tools: AgentTool[];
  loaded: string[];
  skipped: Array<{ name: string; reason: string }>;
}

const cache = new Map<string, Promise<CachedRuntime>>();

function findPackageDir(name: string, require: NodeRequire, workspaceRoot: string): string | undefined {
  // 1. Normal subpath (works when exports map allows ./package.json).
  try {
    return path.dirname(require.resolve(`${name}/package.json`));
  } catch { /* exports-restricted — fall through */ }
  // 2. Resolve the package entry, then walk up to the dir containing package.json.
  try {
    let entry = require.resolve(name);
    let dir = path.dirname(entry);
    for (let i = 0; i < 6; i++) {
      if (fs.existsSync(path.join(dir, 'package.json'))) {
        const base = path.basename(dir);
        // Accept exact match or scoped tail (e.g. aft-pi for @cortexkit/aft-pi).
        if (dir.endsWith(name) || base === name.split('/').pop()) return dir;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  } catch { /* fall through */ }
  // 3. Well-known locations: workspace/node_modules first (extension host
  // cwd is the VS Code binary dir, NOT the workspace), then monorepo hoists.
  const tails = [name, ...(name.includes('/') ? [name.split('/').pop() as string] : [])];
  const roots = [
    workspaceRoot ? path.join(workspaceRoot, 'node_modules') : '',
    path.resolve(process.cwd(), 'node_modules'),
    path.resolve(process.cwd(), '..', 'node_modules'),
    path.resolve(__dirname, '..', '..', 'node_modules'),
  ].filter(Boolean);
  for (const root of roots) {
    for (const tail of tails) {
      const cand = path.join(root, name);
      if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
      if (tail !== name) {
        const cand2 = path.join(root, tail);
        if (fs.existsSync(path.join(cand2, 'package.json'))) return cand2;
      }
    }
  }
  return undefined;
}

/** Resolved extension entry paths (for DefaultResourceLoader.additionalExtensionPaths). */
export function getPiExtensionEntries(workspaceRoot: string): string[] {
  return resolveExtensionEntries(workspaceRoot).map((e) => e.entry);
}

function resolveExtensionEntries(workspaceRoot: string): Array<{ name: string; entry: string }> {
  const require = createRequire(`${process.cwd()}/package.json`);
  const out: Array<{ name: string; entry: string }> = [];
  // Fallback entry guesses per package when manifest lacks pi.extensions.
  const FALLBACK_ENTRY: Record<string, string[]> = {
    'pi-web-access': ['./dist/index.js'],
    '@juicesharp/rpiv-todo': ['./index.ts', './dist/index.js'],
    '@juicesharp/rpiv-ask-user-question': ['./index.ts', './dist/index.js'],
    'pi-subagents': ['./index.ts', './dist/index.js'],
  };
  for (const name of PI_EXTENSION_PACKAGES) {
    try {
      const dir = findPackageDir(name, require, workspaceRoot);
      if (!dir) throw new Error('package dir not found');
      const pkg = require(path.join(dir, 'package.json')) as { pi?: { extensions?: string[] } };
      const entries = pkg.pi?.extensions?.length ? pkg.pi.extensions : (FALLBACK_ENTRY[name] ?? ['./dist/index.js']);
      let pushed = false;
      for (const e of entries) {
        const abs = path.resolve(dir, e);
        // Entry may be a directory (pi-web-access ./dist) — loader handles dirs.
        if (fs.existsSync(abs)) {
          out.push({ name, entry: abs });
          pushed = true;
        }
      }
      if (!pushed) throw new Error(`no existing entry among: ${entries.join(',')}`);
    } catch (err) {
      debugLog(`[PiExtensionRuntime] resolve ${name} failed: ${(err as Error).message}`);
    }
  }
  return out;
}

function stubUi(onEvent?: (msg: ChatExtToWebviewMessage) => void) {
  const notify = (message: string, type: 'info' | 'warning' | 'error' = 'info') => {
    try {
      onEvent?.({ type: 'chat:notify', message, level: type } as unknown as ChatExtToWebviewMessage);
    } catch { /* webview may be detached */ }
    debugLog(`[PiExtensionRuntime][ui.notify:${type}] ${message.slice(0, 200)}`);
  };
  const unsupported = async (kind: string) => {
    notify(`Extension asked '${kind}' — please answer directly in the Chat Panel.`, 'warning');
    throw new Error(
      `${kind} needs interactive TUI; in the VS Code Chat Panel answer directly instead.`
    );
  };
  return {
    select: (title: string) => unsupported(`select:${title}`),
    confirm: () => unsupported('confirm'),
    input: () => unsupported('input'),
    notify,
    onTerminalInput: () => () => undefined,
    setStatus: (key: string, text: string | undefined) => debugLog(`[PiExtensionRuntime][status:${key}] ${text ?? ''}`),
    setWorkingMessage: () => undefined,
    setWorkingVisible: () => undefined,
    setWorkingIndicator: () => undefined,
    setHiddenThinkingLabel: () => undefined,
    setWidget: () => undefined,
    setFooter: () => undefined,
    setHeader: () => undefined,
    setTitle: () => undefined,
    custom: () => unsupported('custom'),
    pasteToEditor: () => undefined,
    setEditorText: () => undefined,
    getEditorText: () => '',
    editor: () => unsupported('editor'),
    addAutocompleteProvider: () => undefined,
    setEditorComponent: () => undefined,
    getEditorComponent: () => undefined,
    theme: undefined,
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false as const, error: 'themes unsupported in webview' }),
    getToolsExpanded: () => false,
    setToolsExpanded: () => undefined,
  };
}

function stubCtxFactory(workspaceRoot: string, onEvent?: (msg: ChatExtToWebviewMessage) => void) {
  return () => ({
    cwd: workspaceRoot,
    ui: stubUi(onEvent),
    // Session/model registries are AgentSession-scoped (full migration later).
    // Extensions needing them fail per-execute with a clear error, not a crash.
    sessionManager: undefined,
    modelRegistry: undefined,
  });
}

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
    try {
      const fns: Array<(...args: unknown[]) => Promise<unknown>> = [];
      for (const ext of result.extensions ?? []) {
        const list = ext.handlers?.get?.('context') as unknown;
        if (Array.isArray(list)) {
          for (const fn of list as Array<(...args: unknown[]) => Promise<unknown>>) {
            if (typeof fn === 'function') fns.push(fn);
          }
        }
      }
      if (fns.length > 0) {
        const { setContextHandlers } = await import('./pi-context-pipeline.js');
        setContextHandlers(workspaceRoot, fns);
        debugLog(`[PiExtensionRuntime] context handlers: ${fns.length}`);
      }
    } catch (err) {
      debugLog(`[PiExtensionRuntime] context handler capture failed: ${(err as Error).message}`);
    }
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

/** Test/dispose hook — clears the per-workspace cache. */
export function clearPiExtensionRuntimeCache(): void {
  cache.clear();
}
