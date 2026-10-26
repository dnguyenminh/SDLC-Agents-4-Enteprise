/**
 * CleanupSweep — OI-15 unit tests (STC §2.9 addendum, TDD §9.2).
 * Real temp scan roots; injected removeFile for bound/failure cases.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import type { Logger } from 'pino';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CleanupSweep, type SweepResult } from '../CleanupSweep.js';
import { ARTIFACT_CLEANUP_DEFAULTS, loadArtifactCleanupConfig } from '../cleanup-config.js';
import { artifactOutputRoots } from '../../../../config/ContentProxy.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-sweep-'));
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

function fakeLogger() {
  const calls = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const logger: any = { ...calls, child: () => logger };
  return { logger: logger as unknown as Logger, calls };
}

function freshRoot(name: string): string {
  const root = path.join(TMP, name);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function seedOld(root: string, name: string, ageMs: number): string {
  const file = path.join(root, name);
  fs.writeFileSync(file, Buffer.from(`orphan:${name}`));
  const past = new Date(Date.now() - ageMs);
  fs.utimesSync(file, past, past);
  return file;
}

const TINY = { ttlMs: 60_000, intervalMs: 300_000, maxRunMs: 30_000, enabled: true };

// STC: UT-47 — sweep removes orphans older than TTL (any name, incl. nested
// job dirs); keeps young files, symlinks and everything outside the roots
describe('CleanupSweep — TTL and pattern (UT-47)', () => {
  it('removes old artifact files (any name, incl. nested job dirs) and keeps young and symlinked files', () => {
    const root = freshRoot('ttl');
    const removed = seedOld(root, 'export_r1.docx', 120_000);
    const young = seedOld(root, 'export_r2.docx', 1_000);
    // Real-world garbage: arbitrary names inside the dedicated root ARE orphans
    const legacyDoc = seedOld(root, 'STP-v1-SA4E-380.docx', 120_000);
    // Child job-dir nesting: <root>/<job>/<artifact>. Job dir holding a young
    // file stays; a job dir emptied by the sweep is removed too.
    const jobDir = path.join(root, 'a1b2c3d4e5f6');
    fs.mkdirSync(jobDir, { recursive: true });
    const nested = seedOld(jobDir, 'SECURITY-REVIEW-v1-SA4E-380.docx', 120_000);
    const nestedYoung = seedOld(jobDir, 'fresh.docx', 1_000);
    const jobDir2 = path.join(root, 'b2c3d4e5f6a1');
    fs.mkdirSync(jobDir2, { recursive: true });
    const nestedOnlyOld = seedOld(jobDir2, 'export_json-output.json', 120_000);
    const symlink = path.join(root, 'export_l.docx');
    let hasSymlink = true;
    try {
      fs.symlinkSync(young, symlink, 'file'); // target stays — dangling links would fake ENOENT
    } catch {
      hasSymlink = false; // Windows without symlink privilege — guard covered by isFile() filter
    }

    const { logger, calls } = fakeLogger();
    const result = new CleanupSweep(logger, { roots: [root], config: TINY }).runOnce();

    expect(fs.existsSync(removed)).toBe(false);
    expect(fs.existsSync(legacyDoc)).toBe(false);
    expect(fs.existsSync(nested)).toBe(false);
    expect(fs.existsSync(nestedOnlyOld)).toBe(false);
    expect(fs.existsSync(jobDir2)).toBe(false); // emptied by the sweep → dir removed
    expect(fs.existsSync(jobDir)).toBe(true); // still holds the young file
    expect(fs.existsSync(young)).toBe(true);
    expect(fs.existsSync(nestedYoung)).toBe(true);
    if (hasSymlink) expect(fs.existsSync(symlink)).toBe(true);
    // removed: export_r1 + STP + nested SECURITY-REVIEW + nested json + emptied job dir = 5
    expect(result.removed).toBe(5);
    expect(result.failed).toBe(0);

    const summary = calls.info.mock.calls.find(([, msg]) => msg === 'Artifact cleanup sweep tick completed');
    expect(summary).toBeDefined();
    expect(summary![0]).toMatchObject({ removed: 5, failed: 0, skipped: result.skipped });
    expect(JSON.stringify(summary![0])).not.toContain(root); // I-3: no host paths in logs
  });

  it('never scans outside the configured roots (agent workspace untouched)', () => {
    const root = freshRoot('confined');
    const workspace = freshRoot('workspace');
    const workspaceArtifact = seedOld(workspace, 'export_w.docx', 120_000);
    seedOld(root, 'export_root.docx', 120_000);

    const result = new CleanupSweep(fakeLogger().logger, { roots: [root], config: TINY }).runOnce();

    expect(fs.existsSync(workspaceArtifact)).toBe(true);
    expect(result.removed).toBe(1);
  });
});

// STC: UT-48 — sweep bounds and configuration
describe('CleanupSweep — bounds and configuration (UT-48)', () => {
  it('stops the tick at maxRunMs and reports partial deletions honestly', () => {
    const root = freshRoot('bound');
    const total = 12;
    for (let i = 0; i < total; i += 1) seedOld(root, `export_b${i}.docx`, 120_000);
    const slowRemove = (filePath: string) => {
      const until = Date.now() + 8; // simulate slow unlink without async
      while (Date.now() < until) { /* busy */ }
      fs.unlinkSync(filePath);
    };

    const { logger, calls } = fakeLogger();
    const result = new CleanupSweep(logger, { roots: [root], config: { ...TINY, maxRunMs: 20 }, removeFile: slowRemove }).runOnce();

    expect(result.bounded).toBe(true);
    expect(result.removed).toBeGreaterThan(0);
    expect(result.removed).toBeLessThan(total);
    expect(calls.warn).toHaveBeenCalledWith({ maxRunMs: 20 }, 'Artifact cleanup sweep stopped at maxRunMs bound');
    expect(result.durationMs).toBeLessThan(10_000);
  });

  it('continues after a failure and lists it with the basename only', () => {
    const root = freshRoot('failure');
    const locked = seedOld(root, 'export_locked.docx', 120_000);
    seedOld(root, 'export_ok.docx', 120_000);
    const removeFile = (filePath: string) => {
      if (filePath === locked) throw Object.assign(new Error('EPERM'), { code: 'EPERM' });
      fs.unlinkSync(filePath);
    };

    const { logger, calls } = fakeLogger();
    const result = new CleanupSweep(logger, { roots: [root], config: TINY, removeFile }).runOnce();

    expect(result).toMatchObject({ removed: 1, failed: 1, bounded: false });
    expect(calls.warn).toHaveBeenCalledWith(
      expect.objectContaining({ artifact: 'export_locked.docx' }),
      'Artifact cleanup sweep failed to remove file',
    );
    expect(JSON.stringify(calls.warn.mock.calls.at(-1)?.[0])).not.toContain(root);
  });

  it('does not start a timer when enabled=false', () => {
    const sweep = new CleanupSweep(fakeLogger().logger, { config: { enabled: false } });
    sweep.start();
    expect((sweep as any).timer).toBeUndefined();
    sweep.stop();
  });

  it('runs on the configured interval once started and stops cleanly', () => {
    vi.useFakeTimers();
    const sweep = new CleanupSweep(fakeLogger().logger, { config: { ...TINY, intervalMs: 10 } });
    const runOnce = vi.spyOn(sweep, 'runOnce').mockReturnValue({ removed: 0, failed: 0, skipped: 0, durationMs: 0, bounded: false } as SweepResult);

    sweep.start();
    vi.advanceTimersByTime(35);
    expect(runOnce.mock.calls.length).toBeGreaterThanOrEqual(3);

    sweep.stop();
    vi.advanceTimersByTime(50);
    expect(runOnce.mock.calls.length).toBe(3);
  });
});

describe('cleanup configuration — env mapping (UT-48 step 3)', () => {
  it('ships the documented defaults', () => {
    expect(ARTIFACT_CLEANUP_DEFAULTS).toEqual({ enabled: true, intervalMs: 300_000, ttlMs: 600_000, maxRunMs: 30_000 });
    expect(loadArtifactCleanupConfig({})).toEqual(ARTIFACT_CLEANUP_DEFAULTS);
  });

  it('applies env overrides for enabled/interval/ttl/maxRun', () => {
    expect(loadArtifactCleanupConfig({
      ARTIFACT_CLEANUP_ENABLED: 'false',
      ARTIFACT_CLEANUP_INTERVAL_MS: '1000',
      ARTIFACT_CLEANUP_TTL_MS: '50',
      ARTIFACT_CLEANUP_MAX_RUN_MS: '10',
    })).toEqual({ enabled: false, intervalMs: 1000, ttlMs: 50, maxRunMs: 10 });
  });

  it('defaults the roots to the dedicated artifact directories plus the child artifact home', () => {
    const workspace = path.resolve(process.cwd());
    const roots = artifactOutputRoots({});
    expect(roots).toContain(path.join(os.tmpdir(), 'sa4e-artifacts'));
    expect(roots).toContain(path.join(workspace, 'tmp', 'artifacts'));
    // SA4E-380 F-01: the markdown-exporter child's own artifact home must be
    // in the defaults, otherwise every local-path read fails confinement.
    const childHome = process.platform === 'win32'
      ? path.join(process.env.LOCALAPPDATA ?? '', 'markdown-exporter-mcp', 'artifacts')
      : path.join(process.env.HOME ?? os.homedir(), '.cache', 'markdown-exporter-mcp', 'artifacts');
    expect(roots).toContain(path.resolve(childHome));
  });

  it('honours the ARTIFACT_OUTPUT_ROOTS env override (path.delimiter separated)', () => {
    const a = path.join(TMP, 'override-a');
    const b = path.join(TMP, 'override-b');
    expect(artifactOutputRoots({ ARTIFACT_OUTPUT_ROOTS: [a, b].join(path.delimiter) })).toEqual([a, b]);
  });
});
