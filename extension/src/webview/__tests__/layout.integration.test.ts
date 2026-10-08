/**
 * Integration tests for 3-pane layout
 * STC IT cases
 *
 * IT-01 walks the real transitive .svelte import tree from Layout.svelte and
 * compiles every component through the shared helper (TS-stripped script →
 * svelte/compiler — same pipeline as the webview build).
 * IT-02 exercises the real Svelte store layer (barrel export) with
 * write → read roundtrips across chat / agent / connection stores.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { get } from 'svelte/store';
import { compile, preprocess } from '../../test/svelte-shim/compiler/index.js';
import {
  addUserMessage,
  clearChat,
  messages,
  syncAgents,
  selectAgent,
  selectedAgent,
  resetAgents,
  updateServiceStatus,
  hasActiveConnection,
  resetConnections,
} from '../stores';
import { compileSvelteFile, COMPONENTS_DIR } from './svelte-compile-helper';
import ts from 'typescript';

/** Strip TypeScript from `<script lang="ts">` blocks (syntactic transpile). */
const tsScriptPreprocessor = {
  script: ({ content, attributes }: { content: string; attributes: Record<string, string | boolean> }) => {
    if (attributes.lang !== 'ts') {
      return { code: content };
    }
    const out = ts.transpileModule(content, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    });
    return { code: out.outputText };
  },
};

/** Collect the transitive .svelte import tree reachable from `entry`. */
function collectSvelteTree(entry: string): { files: string[]; missing: string[] } {
  const seen = new Set<string>();
  const missing: string[] = [];
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const abs = path.join(COMPONENTS_DIR, file);
    if (!fs.existsSync(abs)) {
      missing.push(file);
      continue;
    }
    const src = fs.readFileSync(abs, 'utf-8');
    for (const m of src.matchAll(/from\s+['"]\.(\/[^'"]+\.svelte)['"]/g)) {
      const child = path.basename(m[1]);
      if (!seen.has(child)) stack.push(child);
    }
  }
  return { files: [...seen], missing };
}

describe('Layout Integration', () => {
  // STC: IT-01 — Layout mounts without error
  it('IT-01: Layout mounts without error', async () => {
    const { files, missing } = collectSvelteTree('Layout.svelte');

    // Every import in the tree must resolve to a real file.
    expect(missing).toEqual([]);

    // All 3 panes + chrome reachable from the Layout root.
    for (const part of ['Toolbar.svelte', 'LeftPane.svelte', 'CenterPane.svelte', 'RightPane.svelte', 'StatusBar.svelte']) {
      expect(files).toContain(part);
    }
    expect(files.length).toBeGreaterThanOrEqual(6);

    // Every component in the tree must compile without errors — a compile
    // failure here would break mounting at runtime.
    const compileErrors: string[] = [];
    for (const file of files) {
      try {
        const source = fs.readFileSync(path.join(COMPONENTS_DIR, file), 'utf-8');
        const processed = await preprocess(source, tsScriptPreprocessor, { filename: file });
        compile(processed.code, { filename: file });
      } catch (err) {
        compileErrors.push(`${file}: ${(err as Error).message}`);
      }
    }
    expect(compileErrors).toEqual([]);
  });

  // STC: IT-02 — Stores integration works
  it('IT-02: Stores integration works', () => {
    // chat store: add → read → clear
    clearChat();
    expect(get(messages)).toHaveLength(0);
    addUserMessage('m1', 'hello layout');
    const chat = get(messages);
    expect(chat).toHaveLength(1);
    expect(chat[0].role).toBe('user');
    expect(chat[0].content).toBe('hello layout');
    clearChat();
    expect(get(messages)).toHaveLength(0);

    // agent store: sync → auto-select first → manual select
    resetAgents();
    syncAgents([
      { id: 'a1', name: 'Agent 1', description: '' },
      { id: 'a2', name: 'Agent 2', description: '' },
    ] as any[]);
    expect(get(selectedAgent)?.id).toBe('a1'); // auto-select first on sync
    selectAgent('a2');
    expect(get(selectedAgent)?.id).toBe('a2');

    // connection store: service status roundtrip drives derived state
    resetConnections();
    expect(get(hasActiveConnection)).toBe(false);
    updateServiceStatus('Kiro', 'connected');
    expect(get(hasActiveConnection)).toBe(true);
    updateServiceStatus('Kiro', 'disconnected');
    expect(get(hasActiveConnection)).toBe(false);
  });
});
