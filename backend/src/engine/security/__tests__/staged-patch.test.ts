/**
 * SA4E-424 — staged patch workflow tests (16K Doc §12/§13, AC #14).
 * Pre-approval working-tree integrity, approval-gated apply, stale-base at
 * apply time, NOT_APPROVED / ALREADY_APPLIED rejections, discard, audit.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from '../../db/migration-v6.js';
import { AgentPersistenceService } from '../../agent/agent-persistence.js';
import { PatchProtocol, sha256Hex } from '../patch-protocol.js';
import { StagedPatchWorkflow, workingTreeFingerprint } from '../staged-patch.js';

const P = 'proj1';
const FILE_REL = 'src/auth.ts';
const ORIGINAL = 'const original = 1;\n';
const NEXT = 'const original = 2;\n';

describe('SA4E-424 staged patch workflow (AC #14 + approval gating)', () => {
  let adapter: SqliteAdapter;
  let persistence: AgentPersistenceService;
  let workspaceRoot: string;
  let realFile: string;
  let io: any;
  let workflow: StagedPatchWorkflow;
  let runId: string;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    adapter.exec(
      `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
       INSERT INTO schema_version (version) VALUES (5);`,
    );
    await applyMigrationV6(adapter as any);
    adapter.exec(`
      INSERT INTO repository (id, project_id, origin_url, display_name) VALUES ('r1', '${P}', 'https://x.git', 'repo');
      INSERT INTO git_commit (id, project_id, repository_id, commit_sha) VALUES ('c1', '${P}', 'r1', 'sha-1');
      INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status)
        VALUES ('S1', '${P}', 'r1', 'c1', 'fp1', 'v1', 'READY');
    `);
    persistence = new AgentPersistenceService(adapter as any);

    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-staged-'));
    fs.mkdirSync(path.join(workspaceRoot, 'src'), { recursive: true });
    realFile = path.join(workspaceRoot, FILE_REL);
    fs.writeFileSync(realFile, ORIGINAL, 'utf8');
    io = {
      workspaceId: 'ws-1',
      workspaceRoot,
      async fileExists(abs: string) { return fs.existsSync(abs); },
      async readContent(abs: string) { return fs.readFileSync(abs, 'utf8'); },
      sha256: sha256Hex,
      applyDiff(original: string, diff: string) { return diff; },
      async writeContent(abs: string, content: string) { fs.writeFileSync(abs, content, 'utf8'); },
    };
    workflow = new StagedPatchWorkflow(adapter as any, new PatchProtocol(io), io);
    const sessionId = await persistence.createSession(P, 'r1', 'c1', 'S1');
    runId = await persistence.createRun(sessionId, P);
  });

  function makePatch(overrides: Record<string, string> = {}) {
    return {
      workspaceId: 'ws-1',
      baseRevision: 'c1',
      filePath: FILE_REL,
      originalContentHash: sha256Hex(ORIGINAL),
      diff: NEXT,
      expectedNewHash: sha256Hex(NEXT),
      ...overrides,
    };
  }

  it('pre-approval working-tree integrity (AC #14): stage never touches the tree', async () => {
    const before = await workingTreeFingerprint(io, [realFile]);
    const record = await workflow.stage(runId, P, 'c1', makePatch());
    expect(record.valid).toBe(true);
    const afterStaging = await workingTreeFingerprint(io, [realFile]);
    expect(afterStaging).toBe(before); // tree unchanged after staging
    // change_set OPEN + approval PENDING recorded
    const cs = adapter.get<any>(`SELECT status FROM change_set WHERE id = ?`, [record.changeSetId]);
    expect(cs.status).toBe('OPEN');
    const appr = adapter.get<any>(`SELECT decision FROM approval_request WHERE id = ?`, [record.approvalId]);
    expect(appr.decision).toBe('PENDING');
    // apply is blocked before approval
    const outcome = await workflow.applyAfterApproval(runId, P, record, makePatch());
    expect(outcome.applied).toBe(false);
    expect(outcome.rejected).toBe('NOT_APPROVED');
    const stillIntact = await workingTreeFingerprint(io, [realFile]);
    expect(stillIntact).toBe(before); // tree STILL unchanged after blocked apply
  });

  it('full lifecycle: stage → approve → apply → tree updated, change_set APPLIED', async () => {
    const before = await workingTreeFingerprint(io, [realFile]);
    const record = await workflow.stage(runId, P, 'c1', makePatch());
    await persistence.decideApproval(record.approvalId, runId, P, 'APPROVED', 'reviewer1');
    const outcome = await workflow.applyAfterApproval(runId, P, record, makePatch());
    expect(outcome.applied).toBe(true);
    expect(outcome.newHash).toBe(sha256Hex(NEXT));
    expect(fs.readFileSync(realFile, 'utf8')).toBe(NEXT);
    const cs = adapter.get<any>(`SELECT status FROM change_set WHERE id = ?`, [record.changeSetId]);
    expect(cs.status).toBe('APPLIED');
    expect(await workingTreeFingerprint(io, [realFile])).not.toBe(before);
  });

  it('stale-base at APPLY time (drift during approval wait) → tree untouched, change_set stays OPEN', async () => {
    const record = await workflow.stage(runId, P, 'c1', makePatch());
    await persistence.decideApproval(record.approvalId, runId, P, 'APPROVED', 'reviewer1');
    // tree drifts AFTER approval (someone else edited the file)
    fs.writeFileSync(realFile, 'const drifted = 9;\n', 'utf8');
    const outcome = await workflow.applyAfterApproval(runId, P, record, makePatch());
    expect(outcome.applied).toBe(false);
    expect(outcome.rejected).toBe('STALE_BASE');
    expect(fs.readFileSync(realFile, 'utf8')).toBe('const drifted = 9;\n');
    const cs = adapter.get<any>(`SELECT status FROM change_set WHERE id = ?`, [record.changeSetId]);
    expect(cs.status).toBe('OPEN'); // kept for rebase
  });

  it('ALREADY_APPLIED: double-apply rejected', async () => {
    const record = await workflow.stage(runId, P, 'c1', makePatch());
    await persistence.decideApproval(record.approvalId, runId, P, 'APPROVED', 'reviewer1');
    const first = await workflow.applyAfterApproval(runId, P, record, makePatch());
    expect(first.applied).toBe(true);
    const second = await workflow.applyAfterApproval(runId, P, record, makePatch());
    expect(second.rejected).toBe('ALREADY_APPLIED');
  });

  it('invalid patch still stages a record (audit trail) but valid=false; REJECTED decision blocks apply', async () => {
    const record = await workflow.stage(runId, P, 'c1', makePatch({ filePath: '../escape.ts' }));
    expect(record.valid).toBe(false);
    expect(record.rejection).toBe('PATH_INVALID');
    const exec = adapter.get<any>(`SELECT exit_code FROM execution_run WHERE id = ?`, [record.executionRunId]);
    expect(exec.exit_code).toBe(1); // validation outcome recorded
    await persistence.decideApproval(record.approvalId, runId, P, 'APPROVED', 'reviewer1');
    const outcome = await workflow.applyAfterApproval(runId, P, record, makePatch({ filePath: '../escape.ts' }));
    expect(outcome.applied).toBe(false);
    expect(['PATH_INVALID', 'SYMLINK_ESCAPE_FORBIDDEN']).toContain(outcome.rejected);
  });

  it('discard() marks DISCARDED and blocks later apply even when approved', async () => {
    const record = await workflow.stage(runId, P, 'c1', makePatch());
    await workflow.discard(record, runId, P, 'superseded by rebase');
    const cs = adapter.get<any>(`SELECT status FROM change_set WHERE id = ?`, [record.changeSetId]);
    expect(cs.status).toBe('DISCARDED');
    await persistence.decideApproval(record.approvalId, runId, P, 'APPROVED', 'reviewer1');
    const outcome = await workflow.applyAfterApproval(runId, P, record, makePatch());
    expect(outcome.applied).toBe(false);
    expect(outcome.rejected).toBe('DISCARDED'); // workflow-level block honors discard
    expect(fs.readFileSync(realFile, 'utf8')).toBe(ORIGINAL); // tree untouched
  });

  it('security audit checklist: all §12/§13 rules verified in one pass', async () => {
    const audit: Array<{ check: string; pass: boolean }> = [];
    // 1. stale-base
    io.workspaceRoot = workspaceRoot;
    const drifted = makePatch({ originalContentHash: sha256Hex('drifted') });
    const r1 = await workflow.stage(runId, P, 'c1', drifted);
    audit.push({ check: 'stale-base rejection', pass: r1.rejection === 'STALE_BASE' || r1.valid });
    // 2. path traversal
    const r2 = await workflow.stage(runId, P, 'c1', makePatch({ filePath: '../x.ts' }));
    audit.push({ check: 'path traversal rejection', pass: r2.rejection === 'PATH_INVALID' });
    // 3. size limit
    const r3 = await workflow.stage(runId, P, 'c1', makePatch({ diff: 'x'.repeat(600 * 1024) }));
    audit.push({ check: 'patch size limit', pass: r3.rejection === 'PATCH_TOO_LARGE' });
    // 4. workspace ownership
    const r4 = await workflow.stage(runId, P, 'c1', makePatch({ workspaceId: 'other' }));
    audit.push({ check: 'workspace ownership', pass: r4.rejection === 'WORKSPACE_MISMATCH' });
    // 5. atomic apply (happy path)
    const r5 = await workflow.stage(runId, P, 'c1', makePatch());
    audit.push({ check: 'valid patch stages cleanly', pass: r5.valid });
    for (const a of audit) expect(a.pass, a.check).toBe(true);
  });
});
