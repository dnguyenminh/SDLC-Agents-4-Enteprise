/**
 * SA4E-360 — code_extract_signatures tests (TDD task T5; STC T5 test list +
 * E2E-API-05/06/07 vectors + SEC-360-04 backend containment twin BV-03..BV-07).
 * Fixture data: backend-security-testdata.csv, skeleton-fallback-testdata.csv.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleCodeExtract, resolveContainedFile, MAX_EXTRACT_BYTES } from '../code-extract.js';

/**
 * Mirrors the extension `parseSearchText` contract (search-provider.ts L27-77)
 * for the 3 line shapes this tool emits — the backend package cannot import
 * the extension, so the boundary contract is asserted against a test-local
 * parser implementing the same line grammar ([kind] name / File: p:line / Sig:).
 */
function parseSearchTextCompatible(text: string): Array<{ name: string; kind: string; filePath: string; startLine?: number; signature?: string }> {
  const out: Array<{ name: string; kind: string; filePath: string; startLine?: number; signature?: string }> = [];
  let current: { name: string; kind: string; filePath: string; startLine?: number; signature?: string } | undefined;
  for (const rawLine of (text ?? '').split('\n')) {
    const line = rawLine.trim();
    const head = /^\[([\w-]+)\]\s+(.+)$/.exec(line);
    if (head) {
      if (current) out.push(current);
      current = { kind: head[1], name: head[2], filePath: head[2] };
      continue;
    }
    if (!current) continue;
    const file = /^File:\s*(.+?):(\d+)$/.exec(line);
    if (file) {
      current.filePath = file[1];
      current.startLine = Number(file[2]);
      continue;
    }
    const sig = /^Sig:\s*(.*)$/.exec(line);
    if (sig) current.signature = sig[1].slice(0, 200);
  }
  if (current) out.push(current);
  return out;
}

let root = '';
const SVELTE = `<script lang="ts">
  export function load(input: string): string {
    return input;
  }
  export const VERSION = 2;
</script>
<div>hi</div>
`;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-extract-'));
  fs.writeFileSync(path.join(root, 'Component.svelte'), SVELTE);
  fs.mkdirSync(path.join(root, 'sub'));
  fs.writeFileSync(path.join(root, 'sub', 'Helper.svelte'), 'export function help(x: number): number { return x; }');
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('code_extract_signatures — happy path + parseSearchText compatibility (E2E-API-05)', () => {
  it('emits code_search-style text with REAL line numbers', async () => {
    const text = await handleCodeExtract({ files: [{ path: 'Component.svelte', language: 'svelte' }] }, root);
    expect(text).toContain('Found 1 files');
    expect(text).toContain('[function] load');
    expect(text).toContain('File: Component.svelte:2');
    expect(text).toContain('Sig: export function load(input: string): string');
  });

  it('output parses through the EXISTING parseSearchText into SearchCandidate[]', async () => {
    const text = await handleCodeExtract({ files: [{ path: 'sub/Helper.svelte', language: 'svelte' }] }, root);
    const candidates = parseSearchTextCompatible(text);
    expect(candidates.length).toBeGreaterThan(0);
    const help = candidates.find((c) => c.name === 'help');
    expect(help).toMatchObject({ filePath: 'sub/Helper.svelte' });
    expect(help?.startLine).toBeGreaterThanOrEqual(1);
  });

  it('returns no candidate lines for a language with no matches (→ RAW_HEAD rung)', async () => {
    fs.writeFileSync(path.join(root, 'Empty.template'), '<div>nothing</div>');
    const text = await handleCodeExtract({ files: [{ path: 'Empty.template', language: 'unknown-lang' }] }, root);
    expect(text).toContain('Found 0 files');
    expect(parseSearchTextCompatible(text)).toEqual([]);
  });
});

describe('code_extract_signatures — fail-soft batch + caps (E2E-API-06)', () => {
  it('skips unreadable/oversized files, extracts the healthy one, never fails the batch', async () => {
    const big = path.join(root, 'Huge.svelte');
    fs.writeFileSync(big, 'export function huge(): void {}\n'.repeat(1) + 'x'.repeat(MAX_EXTRACT_BYTES));
    const text = await handleCodeExtract(
      {
        files: [
          { path: 'sub/Helper.svelte', language: 'svelte' },
          { path: 'Missing.svelte', language: 'svelte' },
          { path: 'Huge.svelte', language: 'svelte' },
        ],
      },
      root
    );
    expect(text).toContain('Found 1 files');
    expect(text).toContain('[function] help');
    expect(text).toContain('Skip: Missing.svelte (unreadable');
    expect(text).toContain(`Skip: Huge.svelte (file exceeds ${MAX_EXTRACT_BYTES} byte read cap)`);
    fs.rmSync(big, { force: true });
  });
});

// STC E2E-API-07 — backend containment twin, 4 attack vectors (SEC-360-04)
// NOTE (platform): `C:\...` absolute and `..\..` backslash-traversal vectors
// only carry attack semantics on a win32 host — on posix, backslashes are
// literal filename characters, so those inputs resolve STRICTLY INSIDE the
// root (path.resolve posix semantics) and rejecting them would be wrong.
// Cross-platform vectors (`/etc/passwd`, `//server/share`, `sub/../../x`)
// stay unguarded and run on every platform.
const IS_WIN = process.platform === 'win32';
describe('SEC-360-04 — resolveContainedFile rejects all 4 attack layers', () => {
  it('BV-03: absolute path outside the workspace root is rejected', () => {
    if (IS_WIN) expect(resolveContainedFile(root, 'C:\\projects\\secrets.txt')).toBeNull();
    expect(resolveContainedFile(root, '/etc/passwd')).toBeNull();
  });

  it('BV-04: null-byte injection is rejected (layer 1)', () => {
    expect(resolveContainedFile(root, 'fixture\0.txt')).toBeNull();
  });

  it('BV-05: UNC path is rejected (layer 2)', () => {
    expect(resolveContainedFile(root, '\\\\server\\share\\file.ts')).toBeNull();
    expect(resolveContainedFile(root, '//server/share/file.ts')).toBeNull();
  });

  it('BV-06: dotdot traversal is rejected (lexical isWithin, layer 3)', () => {
    if (IS_WIN) expect(resolveContainedFile(root, '..\\..\\secrets.txt')).toBeNull();
    expect(resolveContainedFile(root, 'sub/../../secrets.txt')).toBeNull();
  });

  it('BV-07: junction inside root pointing outside is rejected (realpath, layer 4)', () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-out-'));
    fs.mkdirSync(path.join(outside, 'dir'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'dir', 'secret.ts'), 'export const SECRET = 1;');
    const link = path.join(root, 'link-out');
    try {
      // Windows: directory junctions need no admin rights (file symlinks do).
      fs.symlinkSync(path.join(outside, 'dir'), link, 'junction');
      expect(resolveContainedFile(root, path.join('link-out', 'secret.ts'))).toBeNull();
    } finally {
      fs.rmSync(link, { force: true, recursive: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('control: legitimate contained file resolves (no false positive)', () => {
    expect(resolveContainedFile(root, 'Component.svelte')).not.toBeNull();
    expect(resolveContainedFile(root, 'sub/../Component.svelte')).not.toBeNull();
  });

  it('end-to-end: hostile paths land in skipped[] with ZERO signature lines', async () => {
    const text = await handleCodeExtract(
      { files: [{ path: 'C:\\projects\\secrets.txt', language: 'ts' }, { path: '..\\..\\secrets.txt', language: 'ts' }] },
      root
    );
    expect(text).toContain('Found 0 files');
    expect(text).toContain('Skip: C:\\projects\\secrets.txt');
    expect(text).not.toMatch(/\[function\]|\[class\]/);
  });
});
