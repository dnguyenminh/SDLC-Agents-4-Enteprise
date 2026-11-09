/**
 * SA4E-424 — Staged patch workflow (16K Doc §12 + §13, AC #14).
 *
 * The agent NEVER writes the working tree directly:
 *   1. stage()              — validates the patch (all §12 rules) WITHOUT
 *                             applying; records change_set (OPEN) +
 *                             approval_request (PENDING) + execution_run
 *                             (validation outcome). Working tree untouched
 *                             → pre-approval integrity (AC #14).
 *   2. applyAfterApproval() — ONLY when the approval decision is APPROVED:
 *                             re-validates (stale-base may drift during the
 *                             approval wait) and applies atomically via
 *                             PatchProtocol. Rejected apply keeps the
 *                             change_set OPEN for rebase; DISCARDED explicit.
 */

import { randomUUID } from 'node:crypto';
import pino from 'pino';
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import { PatchProtocol, sha256Hex, type PatchIo, type StructuredPatch } from './patch-protocol.js';

const logger = pino({ name: 'staged-patch' });

export interface StagedPatchRecord {
  changeSetId: string;
  approvalId: string;
  executionRunId: string;
  /** true when the patch passed all §12 validations at stage time. */
  valid: boolean;
  rejection?: string;
  detail?: string;
}

export type ApplyRejection =
  | 'NOT_APPROVED'
  | 'ALREADY_APPLIED'
  | 'DISCARDED'
  | 'PATCH_TOO_LARGE'
  | 'PATH_INVALID'
  | 'SYMLINK_ESCAPE_FORBIDDEN'
  | 'WORKSPACE_MISMATCH'
  | 'STALE_BASE'
  | 'EXPECTED_HASH_MISMATCH'
  | 'FILE_NOT_FOUND';

export interface ApplyOutcome {
  applied: boolean;
  rejected?: ApplyRejection;
  detail?: string;
  newHash?: string;
}

export class StagedPatchWorkflow {
  constructor(
    private readonly db: QueryDatabaseAdapter,
    private readonly patchProtocol: PatchProtocol,
    private readonly io: PatchIo,
  ) {}

  /**
   * Validate + record WITHOUT touching the working tree (AC #14): the §12
   * rules run through PatchProtocol with a discarding IO (never persists).
   */
  async stage(
    runId: string,
    projectId: string,
    baseCommitId: string,
    patch: StructuredPatch,
  ): Promise<StagedPatchRecord> {
    const changeSetId = randomUUID();
    const approvalId = randomUUID();
    const executionRunId = randomUUID();

    const probe = await this.validateOnly(patch);

    await this.db.runAsync(
      `INSERT INTO change_set (id, project_id, agent_run_id, base_commit_id, summary, status)
       VALUES (?, ?, ?, ?, ?, 'OPEN')`,
      [changeSetId, projectId, runId, baseCommitId, `staged: ${patch.filePath}`],
    );
    await this.db.runAsync(
      `INSERT INTO approval_request (id, project_id, agent_run_id, action, scope, proposed_changeset_id, requested_user, decision)
       VALUES (?, ?, ?, 'apply_patch', ?, ?, 'agent', 'PENDING')`,
      [approvalId, projectId, runId, patch.filePath, changeSetId],
    );
    await this.db.runAsync(
      `INSERT INTO execution_run (id, project_id, agent_run_id, change_set_id, command, exit_code, started_at, finished_at)
       VALUES (?, ?, ?, ?, 'validate_patch', ?, datetime('now'), datetime('now'))`,
      [executionRunId, projectId, runId, changeSetId, probe.rejected ? 1 : 0],
    );
    logger.info({ runId, file: patch.filePath, valid: !probe.rejected, rejected: probe.rejected }, '[staged-patch] staged');
    return { changeSetId, approvalId, executionRunId, valid: !probe.rejected, rejection: probe.rejected, detail: probe.detail };
  }

  /**
   * Apply ONLY after an APPROVED decision (AC #14 + approval lifecycle).
   * Re-validates base hash at apply time (stale-base may drift during the
   * approval wait) — a stale patch keeps the change_set OPEN for rebase.
   */
  async applyAfterApproval(
    runId: string,
    projectId: string,
    record: StagedPatchRecord,
    patch: StructuredPatch,
  ): Promise<ApplyOutcome> {
    const approval = await this.db.getAsync<{ decision: string }>(
      `SELECT decision FROM approval_request WHERE id = ?`, [record.approvalId]);
    if (!approval || approval.decision !== 'APPROVED') {
      return { applied: false, rejected: 'NOT_APPROVED', detail: `decision=${approval?.decision ?? 'missing'}` };
    }
    const changeSet = await this.db.getAsync<{ status: string }>(
      `SELECT status FROM change_set WHERE id = ?`, [record.changeSetId]);
    if (changeSet?.status === 'APPLIED') {
      return { applied: false, rejected: 'ALREADY_APPLIED', detail: record.changeSetId };
    }
    if (changeSet?.status === 'DISCARDED') {
      return { applied: false, rejected: 'DISCARDED', detail: record.changeSetId };
    }
    const result = await this.patchProtocol.validateAndApply(patch);
    if (!result.applied) {
      // stale-base etc. — tree untouched, change_set stays OPEN for rebase
      await this.recordExecution(runId, projectId, record.changeSetId, result.rejected ?? 'UNKNOWN');
      logger.warn({ runId, rejected: result.rejected }, '[staged-patch] apply rejected, tree untouched');
      return { applied: false, rejected: result.rejected as ApplyRejection, detail: result.detail };
    }
    await this.db.runAsync(`UPDATE change_set SET status = 'APPLIED' WHERE id = ?`, [record.changeSetId]);
    await this.recordExecution(runId, projectId, record.changeSetId, 'APPLIED');
    return { applied: true, newHash: result.newHash };
  }

  /** Explicit discard (rebase/merge path). */
  async discard(record: StagedPatchRecord, runId: string, projectId: string, reason: string): Promise<void> {
    await this.db.runAsync(
      `UPDATE change_set SET status = 'DISCARDED', summary = COALESCE(summary || ?, ?) WHERE id = ?`,
      [` | discarded: ${reason}`, `discarded: ${reason}`, record.changeSetId],
    );
    await this.recordExecution(runId, projectId, record.changeSetId, 'DISCARDED');
  }

  private async recordExecution(runId: string, projectId: string, changeSetId: string, outcome: string): Promise<void> {
    await this.db.runAsync(
      `INSERT INTO execution_run (id, project_id, agent_run_id, change_set_id, command, exit_code, started_at, finished_at)
       VALUES (?, ?, ?, ?, 'apply_patch', ?, datetime('now'), datetime('now'))`,
      [randomUUID(), projectId, runId, changeSetId, outcome === 'APPLIED' ? 0 : 1],
    );
  }

  /**
   * Validate-only probe: identical §12 rules, but the write step is a no-op —
   * the in-memory result hash is verified, then discarded (AC #14).
   */
  private async validateOnly(patch: StructuredPatch): Promise<{ rejected?: string; detail?: string }> {
    const discardingIo: PatchIo = {
      ...this.io,
      writeContent: async () => { /* staging never writes (AC #14) */ },
    };
    const probe = await new PatchProtocol(discardingIo).validateAndApply(patch);
    return probe.applied ? {} : { rejected: probe.rejected, detail: probe.detail };
  }
}

/**
 * Tree integrity probe (AC #14): deterministic fingerprint of the guarded
 * workspace files — unchanged fingerprint ⇔ unchanged working tree.
 */
export async function workingTreeFingerprint(
  io: Pick<PatchIo, 'readContent'>,
  files: string[],
): Promise<string> {
  const parts: string[] = [];
  for (const f of files.slice().sort()) {
    let hash = 'MISSING';
    try {
      hash = sha256Hex(await io.readContent(f));
    } catch {
      hash = 'MISSING';
    }
    parts.push(`${f}:${hash}`);
  }
  return sha256Hex(parts.join('\n'));
}
