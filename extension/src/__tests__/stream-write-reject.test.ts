import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-root-'));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: tmpDir } }]
  }
}));

// Import after mock
import { executeLocalTool } from '../backend-local-tools';

beforeAll(() => {
  // ensure tmp dir exists
});

afterAll(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
});

describe('stream_write_file path reject (SA4E-356 envelopes)', () => {
  // Format 2 rejection is covered at unit level (path-resolver.test.ts T3/T3b)
  // and at handler level via an injected-workspace equivalent is impossible
  // under vitest: require("vscode") cannot see the alias mock, so handlers
  // always run with rootSource=cwd_fallback here (see backend-local-tools
  // TC-05 note). This file pins the fallback-truth behaviors instead.
  it('rejects empty file_path with PATH_EMPTY (single validation point)', async () => {
    const result = await executeLocalTool('stream_write_file', {
      file_path: '   ',
      content: 'x',
      mode: 'write'
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('PATH_EMPTY:');
  });

  // BR-06b: relative with no visible workspace fails loud (never lands in the
  // extension host cwd / Kiro install dir).
  it('rejects relative path with PATH_NO_WORKSPACE on fallback', async () => {
    const result = await executeLocalTool('stream_write_file', {
      file_path: 'mock-reject-test.txt',
      content: 'ok',
      mode: 'write'
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('PATH_NO_WORKSPACE:');
    expect(fs.existsSync(path.join(process.cwd(), 'mock-reject-test.txt'))).toBe(false);
  });

  // DISC-1 (BA-acked): absolute paths pass through on fallback.
  it('passes absolute paths through on fallback', async () => {
    const abs = path.join(tmpDir, 'fallback-abs.txt');
    const result = await executeLocalTool('stream_write_file', {
      file_path: abs,
      content: 'ok',
      mode: 'write'
    });
    expect(result.isError).toBe(false);
    expect(fs.readFileSync(abs, 'utf-8')).toBe('ok');
  });
});
