/**
 * SA4E-414 — pipeline ordering + gating tests (16K Doc §9).
 * AC: stages execute in order; D produces symbols without E; F waits for E.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SnapshotIndexPipeline } from '../index-pipeline.js';
import { PIPELINE_STAGES } from '../pipeline-types.js';
import { makeSnapshotDb, makeTarget, snapshotStatus, P } from './pipeline-fixtures.js';

describe('SA4E-414 pipeline order & gating', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => {
    adapter = await makeSnapshotDb();
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('executes all stages in canonical order A→J', async () => {
    const calls: string[] = [];
    const handlers: any = {};
    for (const stage of PIPELINE_STAGES) {
      handlers[stage] = {
        kind: 'single',
        handler: async () => {
          calls.push(stage);
          return { status: 'OK' };
        },
      };
    }
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, makeTarget(), []).run();
    expect(calls).toEqual([...PIPELINE_STAGES]);
    expect(result.snapshotStatus).toBe('READY');
  });

  it('stage D produces symbols without stage E; F gated off when E absent', async () => {
    let fInvoked = false;
    const handlers: any = {
      D_SYNTAX_INDEX: {
        kind: 'single',
        handler: async (ctx) => {
          // Stage D writes a snapshot-scoped symbol row (E has NOT run).
          expect(ctx.completed).not.toContain('E_DEPENDENCY_RESOLUTION');
          adapter.run(
            `INSERT INTO code_symbol (id, project_id, snapshot_id, name, kind, start_line, end_line)
             VALUES ('sym-d', ?, 'S1', 'AuthSvc', 'class', 1, 10)`,
            [P],
          );
          return { status: 'OK' };
        },
      },
      F_SEMANTIC_INDEX: {
        kind: 'per-language',
        handlers: {
          typescript: async () => {
            fInvoked = true;
            return { status: 'OK' };
          },
        },
      },
      // E deliberately NOT registered → capability absent (soft-skip), F gated off.
    };
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, makeTarget(), ['typescript']).run();
    expect(result.stageOutcomes.D_SYNTAX_INDEX?.status).toBe('OK');
    expect(result.stageOutcomes.E_DEPENDENCY_RESOLUTION?.status).toBe('SKIPPED');
    // F handler must never run when E is absent (gate)
    expect(fInvoked).toBe(false);
    expect(result.stageOutcomes.F_SEMANTIC_INDEX?.status).toBe('OK');
    expect(result.coverage[0].capability).toBe('unsupported');
    // D's artifact persisted even though E was absent
    const sym = adapter.get<{ name: string }>(`SELECT name FROM code_symbol WHERE id = 'sym-d'`);
    expect(sym?.name).toBe('AuthSvc');
    // graceful degradation: snapshot still publishes with coverage metadata
    expect(result.snapshotStatus).toBe('READY');
    expect(snapshotStatus(adapter)).toBe('READY');
  });

  it('stage F waits for stage E: sees E outcome via languageOutcomes', async () => {
    let fContext: any = null;
    const handlers: any = {
      E_DEPENDENCY_RESOLUTION: {
        kind: 'per-language',
        handlers: {
          typescript: async () => ({ status: 'OK' }),
        },
      },
      F_SEMANTIC_INDEX: {
        kind: 'per-language',
        handlers: {
          typescript: async (ctx) => {
            fContext = ctx;
            return { status: 'OK' };
          },
        },
      },
    };
    await new SnapshotIndexPipeline(adapter as any, handlers, makeTarget(), ['typescript']).run();
    expect(fContext).not.toBeNull();
    expect(fContext.completed).toContain('E_DEPENDENCY_RESOLUTION');
    expect(fContext.languageOutcomes.get('typescript')?.E?.status).toBe('OK');
  });

  it('hard failure at a single stage aborts remaining stages (recorded as skipped-abort)', async () => {
    const calls: string[] = [];
    const handlers: any = {
      B_FILE_INVENTORY: {
        kind: 'single',
        handler: async () => {
          calls.push('B');
          return { status: 'FAILED', detail: 'scanner exploded' };
        },
      },
      D_SYNTAX_INDEX: {
        kind: 'single',
        handler: async () => {
          calls.push('D');
          return { status: 'OK' };
        },
      },
    };
    const result = await new SnapshotIndexPipeline(adapter as any, handlers, makeTarget(), []).run();
    expect(calls).toEqual(['B']); // D never ran after hard failure
    expect(result.snapshotStatus).toBe('FAILED');
  });
});
