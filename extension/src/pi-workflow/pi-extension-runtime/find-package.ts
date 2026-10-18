/**
 * Pi extension package resolution (SA4E-334 Phase 2).
 * Locates pi extension packages across node_modules layouts and
 * resolves their entry files for the pi-coding-agent loader.
 */

import { createRequire } from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { debugLog } from '../../debug-logger';
import { PI_EXTENSION_PACKAGES } from '../pi-extension-loader.js';

/** Fallback entry guesses per package when manifest lacks pi.extensions. */
const FALLBACK_ENTRY: Record<string, string[]> = {
  'pi-web-access': ['./dist/index.js'],
  '@juicesharp/rpiv-todo': ['./index.ts', './dist/index.js'],
  '@juicesharp/rpiv-ask-user-question': ['./index.ts', './dist/index.js'],
  'pi-subagents': ['./index.ts', './dist/index.js'],
};

export function findPackageDir(name: string, require: NodeRequire, workspaceRoot: string): string | undefined {
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

export function resolveExtensionEntries(workspaceRoot: string): Array<{ name: string; entry: string }> {
  const require = createRequire(`${process.cwd()}/package.json`);
  const out: Array<{ name: string; entry: string }> = [];
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
