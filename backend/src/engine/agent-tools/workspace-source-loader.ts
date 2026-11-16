/**
 * SA4E-420 — Source loader for read_code_block: reads a workspace-relative
 * file, refusing anything that resolves outside the workspace root.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function createWorkspaceSourceLoader(workspace: string): (relativePath: string) => Promise<string> {
  const root = path.resolve(workspace);
  return async (relativePath) => {
    const abs = path.resolve(root, relativePath);
    // Defence in depth: arg schema already rejects '..' and absolute paths.
    if (abs !== root && !abs.startsWith(root + path.sep)) {
      throw new Error(`PATH_OUTSIDE_WORKSPACE: ${relativePath}`);
    }
    return readFile(abs, 'utf8');
  };
}

/**
 * Query-embedding stub: no synchronous embedder exists in the backend (the
 * embedding service is async). searchSymbols treats a throwing embedFn as
 * "vector path unavailable" and returns lexical (BM25) results only.
 */
export function unavailableQueryEmbedder(): never {
  throw new Error('QUERY_EMBEDDER_UNAVAILABLE: sync query embedding not wired; lexical search only');
}
