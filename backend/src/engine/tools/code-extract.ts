/**
 * code_extract_signatures — SA4E-360 NEW thin MCP tool (TDD §4.3, C-360-F1, OI-1).
 *
 * THIN by design (BR-11): wraps the existing pure regex extractor
 * `extractSymbols(content, language)` (ReDoS C2 guard built-in) for
 * grammar-less languages. Fail-soft batch: ANY per-file error lands in the
 * skipped section — the batch never fails (BR-360-03: session never blocked).
 *
 * SEC-360-04 containment twin: the extension package is unreachable from the
 * backend, so this module ports ALL FOUR layers of path-containment.ts
 * (null-byte, UNC, lexical isWithin after resolve, realpath symlink-follow-
 * within) plus the 1 MB stat-first read cap (SEC-325-D3 server-side twin).
 * Output is parseSearchText-compatible — zero new parsing on the extension.
 */
import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { extractSymbols } from '../parsers/signature-extractor.js';

export const CODE_EXTRACT_TOOL_DEFINITION = {
  name: 'code_extract_signatures',
  description:
    'Extract symbol signatures with the multi-language regex extractor for files without a bundled tree-sitter ' +
    'grammar (≤ 50 files/batch, fail-soft). Output is code_search-style text (parseSearchText-compatible).',
  inputSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        maxItems: 50,
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Workspace-relative OR absolute path' },
            language: { type: 'string', description: 'Detected language id' },
          },
          required: ['path', 'language'],
        },
      },
      __projectId: { type: 'string', description: 'SA4E-41 tenant scope (injected)' },
    },
    required: ['files'],
  },
} as const;

/** SEC-325-D3 server twin — same cap as the extension FsContentReader. */
export const MAX_EXTRACT_BYTES = 1_048_576;
export const MAX_BATCH_FILES = 50;

interface SkippedFile {
  path: string;
  reason: string;
}

/**
 * SEC-360-04: resolve a candidate to a contained absolute path or null.
 * Layers: null-byte → UNC → lexical isWithin(path.resolve) → realpathSync
 * follow-within. Mirrors extension path-containment.ts exactly.
 */
export function resolveContainedFile(workspaceRoot: string, candidate: string): string | null {
  if (typeof candidate !== 'string' || candidate.length === 0) return null;
  if (candidate.includes('\0')) return null; // layer 1
  if (candidate.startsWith('\\\\') || candidate.startsWith('//')) return null; // layer 2: UNC
  const base = path.resolve(workspaceRoot);
  const joined = path.resolve(base, candidate);
  if (joined !== base && !joined.startsWith(base + path.sep)) return null; // layer 3: lexical
  return resolveSymlinkWithin(joined, base); // layer 4
}

/** Follows symlinks when the target exists; rejects escapes, keeps missing. */
function resolveSymlinkWithin(joined: string, base: string): string | null {
  let real: string;
  try {
    real = fs.realpathSync(joined);
  } catch {
    return joined; // missing file: lexical containment already verified
  }
  return real === base || real.startsWith(base + path.sep) ? real : null;
}

/** Thin handler — parseSearchText-compatible text + fail-soft skip section. */
export async function handleCodeExtract(
  args: Record<string, unknown>,
  workspaceRoot: string
): Promise<string> {
  const files = Array.isArray(args.files) ? (args.files as Array<{ path?: unknown; language?: unknown }>) : [];
  const batch = files.slice(0, MAX_BATCH_FILES);
  const skipped: SkippedFile[] = [];
  if (files.length > MAX_BATCH_FILES) {
    skipped.push({ path: `(+${files.length - MAX_BATCH_FILES} more)`, reason: 'batch limit 50 files' });
  }
  const lines: string[] = [];
  let found = 0;
  for (const entry of batch) {
    const result = extractOne(workspaceRoot, entry);
    if (result.skipReason) {
      skipped.push({ path: String(entry?.path ?? ''), reason: result.skipReason });
      continue;
    }
    if (result.block) {
      found++;
      lines.push(result.block);
    }
  }
  return renderText(found, lines, skipped);
}

/** Extracts one file → a text block, a skip reason, or neither (no matches). */
function extractOne(
  workspaceRoot: string,
  entry: { path?: unknown; language?: unknown }
): { block?: string; skipReason?: string } {
  const candidate = typeof entry?.path === 'string' ? entry.path : '';
  const language = typeof entry?.language === 'string' ? entry.language : '';
  const absolute = resolveContainedFile(workspaceRoot, candidate);
  if (!absolute) return { skipReason: 'path outside workspace root (containment rejected)' };
  try {
    const stat = fs.statSync(absolute);
    if (!stat.isFile()) return { skipReason: 'not a regular file' };
    if (stat.size > MAX_EXTRACT_BYTES) return { skipReason: `file exceeds ${MAX_EXTRACT_BYTES} byte read cap` };
    const content = fs.readFileSync(absolute, 'utf-8');
    const symbols = extractSymbols(content, language);
    if (symbols.length === 0) return {}; // empty pattern/match set → extension goes to RAW_HEAD
    const block = symbols
      .map((s) => [`[${s.kind}] ${s.name}`, `  File: ${candidate.replace(/\\/g, '/')}:${s.startLine}`, `  Sig: ${s.signature.slice(0, 200)}`])
      .map((l) => l.join('\n'))
      .join('\n');
    return { block };
  } catch (err) {
    return { skipReason: `unreadable: ${(err as Error).message.slice(0, 120)}` };
  }
}

/** Renders the code_search-style text (candidate lines + non-candidate skips). */
function renderText(found: number, blocks: string[], skipped: SkippedFile[]): string {
  const lines: string[] = [`Found ${found} files`];
  if (blocks.length > 0) lines.push('', blocks.join('\n'));
  if (skipped.length > 0) {
    lines.push('', `Skipped ${skipped.length} files`);
    for (const s of skipped) lines.push(`  Skip: ${s.path} (${s.reason})`);
  }
  return lines.join('\n');
}

/** MCP-SDK registration twin (same shape as code-symbols.ts registerCodeSymbols). */
export function registerCodeExtract(server: McpServer, workspaceRoot: string): void {
  server.tool(
    'code_extract_signatures',
    'Extract symbol signatures for grammar-less files (≤ 50 files/batch, fail-soft, 1MB read cap).',
    {
      files: z
        .array(z.object({ path: z.string().min(1), language: z.string().min(1) }))
        .max(MAX_BATCH_FILES)
        .describe('Files to extract'),
      __projectId: z.string().optional().describe('SA4E-41 tenant scope (injected)'),
    },
    async ({ files }) => ({
      content: [{ type: 'text', text: await handleCodeExtract({ files }, workspaceRoot) }],
    })
  );
}
