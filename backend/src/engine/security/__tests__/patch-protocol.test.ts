/**
 * SA4E-417 — Patch Protocol tests (16K Doc §12).
 * AC: stale-base rejection, path traversal rejection, symlink escape,
 * size limit, workspace ownership, atomic apply with expected-hash verification.
 * Disk is the single source of truth (the real runner's tmp-write+rename).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { PatchProtocol, sha256Hex } from '../patch-protocol.js';
import { SandboxViolationError, resolveWorkspacePath } from '../sandbox.js';

const WORKSPACE_ID = 'ws-1';
const FILE_REL = 'src/auth.ts';
const ORIGINAL = 'const original = 1;\n';
const NEXT = 'const original = 2;\n';

describe('SA4E-417 Patch Protocol', () => {
  let workspaceRoot: string;
  let protocol: PatchProtocol;
  let realFile: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-patch-'));
    // create the file on disk FIRST — the guard canonicalizes via realpath and
    // fails closed on missing paths (by design)
    fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, FILE_REL), ORIGINAL, 'utf8');
    realFile = resolveWorkspacePath(workspaceRoot, FILE_REL);
    const io = {
      workspaceId: WORKSPACE_ID,
      workspaceRoot,
      async fileExists(abs: string) {
        return fs.existsSync(abs);
      },
      async readContent(abs: string) {
        return fs.readFileSync(abs, 'utf8');
      },
      sha256: sha256Hex,
      // trivial applier for tests: the "diff" is the full new content
      async applyDiffProxyPlaceholder(): Promise<void> {},
      applyDiff(original: string, diff: string) {
        return diff;
      },
      async writeContent(abs: string, content: string) {
        // real runner: tmp file + rename; here direct write keeps the test focused
        fs.writeFileSync(abs, content, 'utf8');
      },
    } as unknown as PatchIo;
    protocol = new PatchProtocol(io);
  });

  function makePatch(overrides: Partial<Parameters<PatchProtocol['validateAndApply']>[0]> = {}) {
    return {
      workspaceId: WORKSPACE_ID,
      baseRevision: 'c1',
      filePath: FILE_REL,
      originalContentHash: sha256Hex(ORIGINAL),
      diff: NEXT,
      expectedNewHash: sha256Hex(NEXT),
      ...overrides,
    };
  }

  it('applies a valid patch atomically (hash chain verified)', async () => {
    const result = await protocol.validateAndApply(makePatch());
    expect(result.applied).toBe(true);
    expect(result.newHash).toBe(sha256Hex(NEXT));
    expect(fs.readFileSync(realFile, 'utf8')).toBe(NEXT);
  });

  it('rejects STALE_BASE when the file drifted after base hash (AC)', async () => {
    fs.writeFileSync(realFile, 'const drifted = 9;\n', 'utf8');
    const result = await protocol.validateAndApply(makePatch());
    expect(result.applied).toBe(false);
    expect(result.rejected).toBe('STALE_BASE');
    expect(fs.readFileSync(realFile, 'utf8')).toBe('const drifted = 9;\n'); // untouched
  });

  it('rejects path traversal attempts (AC)', async () => {
    for (const bad of ['../outside.ts', 'src/../../../etc/passwd', 'C:\\Windows\\system32\\x.ts', '/etc/passwd']) {
      const result = await protocol.validateAndApply(makePatch({ filePath: bad }));
      expect(result.applied, bad).toBe(false);
      expect(['PATH_INVALID', 'SYMLINK_ESCAPE_FORBIDDEN'], bad).toContain(result.rejected);
    }
  });

  it('rejects symlink/second-path escape outside the workspace', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-outside-'));
    fs.writeFileSync(path.join(outsideDir, 'leak.ts'), 'secret', 'utf8');
    // junction works without admin on Windows; file symlink used when allowed
    const linkDir = path.join(workspaceRoot, 'link-dir');
    let linked = false;
    try {
      fs.symlinkSync(outsideDir, linkDir, 'junction');
      linked = true;
    } catch {
      try {
        fs.symlinkSync(path.join(outsideDir, 'leak.ts'), path.join(workspaceRoot, 'leak-file.ts'), 'file');
        linked = true;
      } catch {
        expect(true).toBe(true); // environment cannot create links — skip
        return;
      }
    }
    expect(linked).toBe(true);
    const target = fs.existsSync(path.join(linkDir, 'leak.ts')) ? 'link-dir/leak.ts' : 'leak-file.ts';
    const result = await protocol.validateAndApply(
      makePatch({ filePath: target, originalContentHash: sha256Hex('secret'), diff: 'hacked', expectedNewHash: sha256Hex('hacked') }),
    );
    expect(result.rejected).toBe('SYMLINK_ESCAPE_FORBIDDEN');
    expect(fs.readFileSync(path.join(outsideDir, 'leak.ts'), 'utf8')).toBe('secret'); // untouched
  });

  it('rejects oversized patches (PATCH_TOO_LARGE)', async () => {
    const result = await protocol.validateAndApply(makePatch({ diff: 'x'.repeat(600 * 1024) }));
    expect(result.rejected).toBe('PATCH_TOO_LARGE');
  });

  it('rejects workspace mismatch', async () => {
    const result = await protocol.validateAndApply(makePatch({ workspaceId: 'ws-other' }));
    expect(result.rejected).toBe('WORKSPACE_MISMATCH');
  });

  it('rejects EXPECTED_HASH_MISMATCH without writing (atomicity)', async () => {
    const result = await protocol.validateAndApply(makePatch({ expectedNewHash: sha256Hex('wrong') }));
    expect(result.applied).toBe(false);
    expect(result.rejected).toBe('EXPECTED_HASH_MISMATCH');
    expect(fs.readFileSync(realFile, 'utf8')).toBe(ORIGINAL);
  });

  it('rejects patches claiming a non-empty base on a missing file (FILE_NOT_FOUND)', async () => {
    const result = await protocol.validateAndApply(
      makePatch({ filePath: 'src/ghost.ts', originalContentHash: sha256Hex('claimed'), diff: NEXT, expectedNewHash: sha256Hex(NEXT) }),
    );
    expect(result.rejected).toBe('FILE_NOT_FOUND');
  });

  it('supports CREATION patches: empty base hash + contained parent', async () => {
    const next = 'brand new module\n';
    const result = await protocol.validateAndApply(
      makePatch({ filePath: 'src/new-file.ts', originalContentHash: sha256Hex(''), diff: next, expectedNewHash: sha256Hex(next) }),
    );
    expect(result.applied).toBe(true);
    expect(result.newHash).toBe(sha256Hex(next));
    expect(fs.readFileSync(path.join(workspaceRoot, 'src', 'new-file.ts'), 'utf8')).toBe(next);
    // creation outside any existing dir chain is still containment-checked
    const result2 = await protocol.validateAndApply(
      makePatch({ filePath: 'newdir/deep/x.ts', originalContentHash: sha256Hex(''), diff: next, expectedNewHash: sha256Hex(next) }),
    );
    expect(result2.applied).toBe(false);
    expect(result2.rejected).toBe('SYMLINK_ESCAPE_FORBIDDEN'); // parent 'newdir/deep' does not exist
  });
});

describe('SA4E-417 sandbox path guard', () => {
  const workspaceRoot = path.join(os.tmpdir(), 'sa4e-guard-root');
  it('rejects traversal/absolute at the guard level', () => {
    expect(() => resolveWorkspacePath(workspaceRoot, '../x')).toThrow(SandboxViolationError);
    expect(() => resolveWorkspacePath(workspaceRoot, 'C:/abs/x')).toThrow(SandboxViolationError);
    expect(() => resolveWorkspacePath(workspaceRoot, '/abs/x')).toThrow(SandboxViolationError);
    expect(() => resolveWorkspacePath(workspaceRoot, 'src/ok.ts')).toThrow(SandboxViolationError); // missing on disk → guard fails closed
  });
});
