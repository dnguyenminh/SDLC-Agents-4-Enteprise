/**
 * Shared Svelte compile helper for webview layout tests.
 *
 * The webview runs Svelte 4 (extension/src/webview/node_modules/svelte@4),
 * whose compiler does NOT parse TypeScript. Production builds strip TS via
 * the vite-plugin-svelte pipeline first — this helper replicates that:
 *   1. Strip `<script lang="ts">` types with the `typescript` package.
 *   2. Compile the resulting markup/script with svelte/compiler.
 *
 * Not a *.test.ts file — vitest's include pattern does not collect it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { preprocess, compile } from '../../test/svelte-shim/compiler/index.js';
import ts from 'typescript';

export const COMPONENTS_DIR = path.resolve(__dirname, '../components');

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

/**
 * Compile one .svelte file the way the webview build does.
 * Resolves on success; rejects with the compiler error on failure.
 */
export async function compileSvelteFile(absPath: string): Promise<void> {
  const source = fs.readFileSync(absPath, 'utf-8');
  const filename = path.basename(absPath);
  const processed = await preprocess(source, tsScriptPreprocessor, { filename });
  compile(processed.code, { filename });
}
