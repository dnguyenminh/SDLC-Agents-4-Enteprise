/**
 * SA4E-414 — language isolation, coverage metadata, atomic publication tests.
 * AC: E failure for X doesn't block D/F for Y; coverage per language;
 * atomic publication (all-or-nothing per snapshot).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SnapshotIndexPipeline } from '../index-pipeline.js';
import { makeSnapshotDb, makeTarget, snapshotStatus, snapshotDiagnostics, P } from './pipeline-fixtures.js';

describe('SA4E-414 pipeline isolation, coverage & atomic publication', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => {
    adapter = await makeSnapshotDb();
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('E failure for java does not block E/F for typescript (non-blocking rule)', async () => {
    const calls: string[] = [];
    const handlers: any = {
      E_DEPENDENCY_RESOLUTION: {
        kind: 'per-language',
        handlers: {
          typescript: async () => {
            calls.push('E:typescript');
            return { status: 'OK' };
          },
          java: async () => {
            calls.push('E:java');
            throw new Error('no JDK toolchain');
          },
        },
      },
      F_SEMANTIC_INDEX: {
        kind: 'per-language',
        handlers: {
          typescript: async () => {
            calls.push('F:typescript');
            return { status: 'OK' };
          },
          java: async () => {
            calls.push('F:java');
            return { status: 'OK' };
          },
        },
      },
    };
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, makeTarget(), ['typescript', 'java']).run();
    // java's E failed but typescript's E/F still ran; F:java gated off
    expect(calls).toEqual(['E:typescript', 'E:java', 'F:typescript']);
    const byLang = Object.fromEntries(result.coverage.map((c) => [c.language, c.capability]));
    expect(byLang.typescript).toBe('supported');
    expect(byLang.java).toBe('failed');
    expect(result.snapshotStatus).toBe('READY'); // language failures are soft
  });

  it('publishes capability/coverage metadata per language onto the snapshot', async () => {
    const handlers: any = {
      E_DEPENDENCY_RESOLUTION: {
        kind: 'per-language',
        handlers: { typescript: async () => ({ status: 'OK' }) },
      },
      F_SEMANTIC_INDEX: {
        kind: 'per-language',
        handlers: { typescript: async () => ({ status: 'OK' }) },
      },
    };
    await new SnapshotIndexPipeline(adapter as any, handlers, makeTarget(), ['typescript', 'cobol']).run();
    const snap = adapter.get<{ status: string; toolchain_manifest: string }>(
      `SELECT status, toolchain_manifest FROM code_index_snapshot WHERE id = 'S1'`,
    );
    expect(snap?.status).toBe('READY');
    const coverage = JSON.parse(snap?.toolchain_manifest ?? '{}').coverage;
    const byLang = Object.fromEntries(coverage.map((c: any) => [c.language, c.capability]));
    expect(byLang.typescript).toBe('supported');
    expect(byLang.cobol).toBe('unsupported'); // no handlers registered
  });

  it('marks partial when semantic binding fails after dependency resolution', async () => {
    const handlers: any = {
      E_DEPENDENCY_RESOLUTION: {
        kind: 'per-language',
        handlers: { typescript: async () => ({ status: 'OK' }) },
      },
      F_SEMANTIC_INDEX: {
        kind: 'per-language',
        handlers: {
          typescript: async () => {
            throw new Error('LSP unavailable');
          },
        },
      },
    };
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, makeTarget(), ['typescript']).run();
    expect(result.coverage[0].capability).toBe('partial');
    expect(result.snapshotStatus).toBe('READY');
  });

  it('atomic publication: hard failure at validation leaves snapshot FAILED, never READY', async () => {
    const handlers: any = {
      I_VALIDATION: {
        kind: 'single',
        handler: async () => {
          throw new Error('invariant check failed');
        },
      },
    };
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, makeTarget(), []).run();
    expect(result.snapshotStatus).toBe('FAILED');
    expect(snapshotStatus(adapter)).toBe('FAILED');
    const diag = snapshotDiagnostics(adapter);
    expect(diag.stages.I_VALIDATION.status).toBe('FAILED');
  });

  it('happy path publishes READY with stage outcomes + coverage in diagnostics', async () => {
    const handlers: any = {
      E_DEPENDENCY_RESOLUTION: {
        kind: 'per-language',
        handlers: { typescript: async () => ({ status: 'OK' }) },
      },
      F_SEMANTIC_INDEX: {
        kind: 'per-language',
        handlers: { typescript: async () => ({ status: 'OK' }) },
      },
    };
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, makeTarget(), ['typescript']).run();
    expect(result.snapshotStatus).toBe('READY');
    expect(snapshotStatus(adapter)).toBe('READY');
    const diag = snapshotDiagnostics(adapter);
    expect(diag.stages.J_ATOMIC_PUBLISH.status).toBe('OK');
    expect(diag.coverage).toEqual([{ language: 'typescript', capability: 'supported' }]);
  });
});
