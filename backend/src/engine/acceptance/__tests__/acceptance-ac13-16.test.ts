/**
 * SA4E-427 — Acceptance criteria 13–16: patch safety, pre-approval tree
 * integrity, sandbox and SSE replay (16K Doc §19). AC-17 lives in extension.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { AgentPersistenceService } from '../../agent/agent-persistence.js';
import { SseEventTransport, parseLastEventId } from '../../agent/sse-stream.js';
import { PatchProtocol, sha256Hex } from '../../security/patch-protocol.js';
import { StagedPatchWorkflow, workingTreeFingerprint } from '../../security/staged-patch.js';
import {
  buildArgVector, DEFAULT_CONTAINER_LIMITS, DEFAULT_NETWORK_POLICY,
  isRegistryAllowed, resolveWorkspacePath, validateContainerLimits, SandboxViolationError,
} from '../../security/sandbox.js';
import { makeAcceptanceDb, P } from './ac-fixtures.js';

function makeIo(root: string) {
  return {
    workspaceId: 'ws-1',
    workspaceRoot: root,
    async fileExists(p: string) { return fs.existsSync(p); },
    async readContent(p: string) { return fs.readFileSync(p, 'utf8'); },
    sha256: sha256Hex,
    applyDiff(_o: string, d: string) { return d; },
    async writeContent(p: string, c: string) { fs.writeFileSync(p, c); },
  };
}

describe('SA4E-427 acceptance criteria 13–16', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = await makeAcceptanceDb();
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('AC-13 patch rejects stale base hash and path traversal', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-ac13-'));
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(path.join(root, 'src/auth.ts'), 'const v = 1;\n');
    const protocol = new PatchProtocol(makeIo(root));
    const base = { workspaceId: 'ws-1', baseRevision: 'c1', filePath: 'src/auth.ts', diff: 'const v = 2;\n', expectedNewHash: sha256Hex('const v = 2;\n') };
    await expect(protocol.validateAndApply({ ...base, originalContentHash: sha256Hex('drifted') }))
      .resolves.toMatchObject({ applied: false, rejected: 'STALE_BASE' });
    await expect(protocol.validateAndApply({ ...base, filePath: '../escape.ts' }))
      .resolves.toMatchObject({ applied: false, rejected: 'PATH_INVALID' });
    expect(fs.readFileSync(path.join(root, 'src/auth.ts'), 'utf8')).toBe('const v = 1;\n');
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('AC-14 original working tree unchanged before approval (AC #14)', async () => {
    const svc = new AgentPersistenceService(adapter as any);
    const sessionId = await svc.createSession(P, 'r1', 'c1', 'S1');
    const runId = await svc.createRun(sessionId, P);
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-ac14-'));
    fs.mkdirSync(path.join(root, 'src'));
    const file = path.join(root, 'src/auth.ts');
    fs.writeFileSync(file, 'const before = 1;\n');
    const io = makeIo(root);
    const patch = {
      workspaceId: 'ws-1', baseRevision: 'c1', filePath: 'src/auth.ts',
      originalContentHash: sha256Hex('const before = 1;\n'), diff: 'const after = 2;\n',
      expectedNewHash: sha256Hex('const after = 2;\n'),
    };
    const workflow = new StagedPatchWorkflow(adapter as any, new PatchProtocol(io), io);
    const fingerprint = () => workingTreeFingerprint(io, [file]);
    const before = await fingerprint();
    const record = await workflow.stage(runId, P, 'c1', patch);
    expect(record.valid).toBe(true);
    expect(await fingerprint()).toBe(before); // staging does not touch the tree
    await expect(workflow.applyAfterApproval(runId, P, record, patch)).resolves.toMatchObject({ rejected: 'NOT_APPROVED' });
    expect(await fingerprint()).toBe(before); // blocked apply leaves the tree intact
    await svc.decideApproval(record.approvalId, runId, P, 'APPROVED', 'reviewer1');
    await expect(workflow.applyAfterApproval(runId, P, record, patch)).resolves.toMatchObject({ applied: true });
    expect(await fingerprint()).not.toBe(before); // only the approved apply changes it
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('AC-15 sandbox: no workspace escape, no unrestricted network', () => {
    expect(() => resolveWorkspacePath('C:\\ws', 'C:\\outside\\x.ts')).toThrow(SandboxViolationError);
    expect(() => resolveWorkspacePath('C:\\ws', '../escape.ts')).toThrow(SandboxViolationError);
    expect(() => resolveWorkspacePath('C:\\ws', 'a\0b.ts')).toThrow(SandboxViolationError);
    expect(() => buildArgVector('git', ['checkout', '$(rm -rf /)'])).toThrow(/SHELL_METACHARS/);
    const vector = buildArgVector('git', ['checkout', 'src/auth.ts'], 1);
    expect(vector.args).toEqual(['checkout', '--', 'src/auth.ts']);
    expect(isRegistryAllowed(DEFAULT_NETWORK_POLICY, 'registry.npmjs.org')).toBe(false); // network denied by default
    const open = { allowNetwork: true, registryAllowlist: ['registry.npmjs.org'] };
    expect(isRegistryAllowed(open, 'registry.npmjs.org')).toBe(true);
    expect(isRegistryAllowed(open, 'registry.npmjs.org.evil.com')).toBe(false);
    expect(validateContainerLimits(DEFAULT_CONTAINER_LIMITS)).toEqual([]);
    expect(validateContainerLimits({ ...DEFAULT_CONTAINER_LIMITS, rootless: false, memoryMB: 99_999 })).toHaveLength(2);
  });

  it('AC-16 SSE reconnect + replay → no duplicate, no missing', async () => {
    const svc = new AgentPersistenceService(adapter as any);
    const sessionId = await svc.createSession(P, 'r1', 'c1', 'S1');
    const runId = await svc.createRun(sessionId, P);
    const transport = new SseEventTransport(adapter as any);
    for (let i = 0; i < 5; i++) await transport.publish(runId, P, 'TOOL_EXECUTED', { executionId: `x${i}` });
    const delivered = await transport.replay(runId, 0);
    const ids = delivered.map((f) => Number.parseInt(f.split('\n')[0].replace('id: ', ''), 10));
    expect(ids).toEqual([1, 2, 3, 4, 5, 6, 7]); // 2 seed events + 5 published
    const firstConnection = delivered.slice(0, 3);
    const lastSeen = Number.parseInt(firstConnection[2].split('\n')[0].replace('id: ', ''), 10);
    const reconnected = await transport.replay(runId, parseLastEventId(String(lastSeen)));
    const combined = [...firstConnection, ...reconnected];
    const combinedIds = combined.map((f) => Number.parseInt(f.split('\n')[0].replace('id: ', ''), 10));
    expect(new Set(combinedIds).size).toBe(combinedIds.length); // 0 duplicates
    expect(combinedIds).toEqual(ids); // 0 missing
  });
});
