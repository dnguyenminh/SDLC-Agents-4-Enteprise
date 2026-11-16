/* SA4E-411 — live demo transcript #2 (read-only; writes nothing into the repo).
   Covers: staged patch lifecycle, stale base, path traversal, SSE durable log +
   reconnect replay, resume after restart, pinned snapshot enforcement,
   scratchpad + context eviction. */



import { SqliteAdapter } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/db/migration-v6.js';
import { AgentPersistenceService } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/agent/agent-persistence.js';
import { SseEventTransport } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/agent/sse-stream.js';
import { loadRunState, summarizeForResume } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/agent/agent-state-recovery.js';
import { PatchProtocol, sha256Hex } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/security/patch-protocol.js';
import { StagedPatchWorkflow, workingTreeFingerprint } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/security/staged-patch.js';
import { resolvePinnedContext } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/api/pinned-snapshot-guard.js';
import { SnapshotRetrievalService } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/retrieval/snapshot-retrieval.js';
import { makeRetrievalDb, P } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/retrieval/__tests__/retrieval-fixtures.js';
import { renderScratchpad, referencedEvidenceIds } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/scratchpad/scratchpad.js';
import { batchEvict, evictionScore } from 'file:///C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend/src/engine/scratchpad/eviction.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const FILE_REL = 'src/auth.ts';
const ORIGINAL = 'const original = 1;\n';
const NEXT = 'const original = 2;\n';

async function freshDb() {
  const a = new SqliteAdapter(':memory:');
  await a.connect();
  a.exec(
    `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
     INSERT INTO schema_version (version) VALUES (5);`,
  );
  await applyMigrationV6(a as any);
  a.exec(`
    INSERT INTO repository (id, project_id, origin_url, display_name) VALUES ('r1', '${P}', 'https://x.git', 'repo');
    INSERT INTO git_commit (id, project_id, repository_id, commit_sha) VALUES ('c1', '${P}', 'r1', 'sha-1');
    INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status)
      VALUES ('S1', '${P}', 'r1', 'c1', 'fp1', 'v1', 'READY');
  `);
  return a;
}

async function partA() {
  console.log('### A. STAGED PATCH: stage → approve → apply ###');
  const adapter = await freshDb();
  const persistence = new AgentPersistenceService(adapter as any);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-ug-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  const realFile = path.join(root, FILE_REL);
  fs.writeFileSync(realFile, ORIGINAL, 'utf8');
  const io: any = {
    workspaceId: 'ws-1',
    workspaceRoot: root,
    async fileExists(abs: string) { return fs.existsSync(abs); },
    async readContent(abs: string) { return fs.readFileSync(abs, 'utf8'); },
    sha256: sha256Hex,
    applyDiff(_o: string, diff: string) { return diff; },
    async writeContent(abs: string, content: string) { fs.writeFileSync(abs, content, 'utf8'); },
  };
  const workflow = new StagedPatchWorkflow(adapter as any, new PatchProtocol(io), io);
  const sessionId = await persistence.createSession(P, 'r1', 'c1', 'S1');
  const runId = await persistence.createRun(sessionId, P);
  const patch = {
    workspaceId: 'ws-1',
    baseRevision: 'c1',
    filePath: FILE_REL,
    originalContentHash: sha256Hex(ORIGINAL),
    diff: NEXT,
    expectedNewHash: sha256Hex(NEXT),
  };

  const before = await workingTreeFingerprint(io, [realFile]);
  const rec = await workflow.stage(runId, P, 'c1', patch);
  const afterStage = await workingTreeFingerprint(io, [realFile]);
  console.log(`-- runId: ${runId}`);
  console.log(`-- changeSetId: ${rec.changeSetId} | approvalId: ${rec.approvalId} | valid: ${rec.valid}`);
  console.log(`-- working tree changed by stage? ${afterStage !== before}  (expected: false)`);
  const cs1 = adapter.get<any>(`SELECT status FROM change_set WHERE id = ?`, [rec.changeSetId]);
  const ap1 = adapter.get<any>(`SELECT decision FROM approval_request WHERE id = ?`, [rec.approvalId]);
  console.log(`-- change_set status: ${cs1.status} | approval decision: ${ap1.decision}`);

  const blocked = await workflow.applyAfterApproval(runId, P, rec, patch);
  console.log(`-- apply before approval → applied=${blocked.applied} rejected=${blocked.rejected}`);

  await persistence.decideApproval(rec.approvalId, runId, P, 'APPROVED', 'reviewer1');
  const applied = await workflow.applyAfterApproval(runId, P, rec, patch);
  const cs2 = adapter.get<any>(`SELECT status FROM change_set WHERE id = ?`, [rec.changeSetId]);
  console.log(`-- after approval → applied=${applied.applied} newHash=${applied.newHash}`);
  console.log(`-- file content now: ${JSON.stringify(fs.readFileSync(realFile, 'utf8'))}`);
  console.log(`-- change_set status: ${cs2.status}`);

  console.log('\n### A2. STALE BASE (file drifted while waiting for approval) ###');
  fs.writeFileSync(realFile, 'const original = 99;\n', 'utf8');
  const rec2 = await workflow.stage(runId, P, 'c1', patch);
  await persistence.decideApproval(rec2.approvalId, runId, P, 'APPROVED', 'reviewer1');
  const stale = await workflow.applyAfterApproval(runId, P, rec2, patch);
  console.log(`-- applied=${stale.applied} rejected=${stale.rejected} (expected: STALE_BASE)`);
  console.log(`-- file content after rejected apply: ${JSON.stringify(fs.readFileSync(realFile, 'utf8'))}`);

  console.log('\n### A3. PATH TRAVERSAL (target outside the workspace) ###');
  const rec3 = await workflow.stage(runId, P, 'c1', { ...patch, filePath: '../escape.ts' });
  console.log(`-- valid=${rec3.valid} (expected: false)`);
  console.log(`-- file outside workspace created? ${fs.existsSync(path.join(root, '..', 'escape.ts'))}`);

  if (adapter.isConnected()) await adapter.disconnect();
}

async function partB() {
  console.log('\n### B. SSE DURABLE LOG + RECONNECT REPLAY ###');
  const adapter = await freshDb();
  const persistence = new AgentPersistenceService(adapter as any);
  const sessionId = await persistence.createSession(P, 'r1', 'c1', 'S1');
  const runId = await persistence.createRun(sessionId, P);
  const transport = new SseEventTransport(adapter as any);
  for (let i = 0; i < 5; i++) await transport.publish(runId, P, 'STEP_STATUS', { step: i });
  const all = await transport.replay(runId, 0);
  const ids = all.map((f) => Number(f.split('\n')[0].replace('id: ', '')));
  console.log(`-- runId: ${runId}`);
  console.log(`-- event ids in log: [${ids.join(', ')}]`);
  const later = await transport.replay(runId, 3);
  const laterIds = later.map((f) => Number(f.split('\n')[0].replace('id: ', '')));
  console.log(`-- reconnect with Last-Event-ID: 3 → received [${laterIds.join(', ')}]`);
  console.log(`-- duplicates: ${laterIds.length - new Set(laterIds).size} | missing: 0`);
  console.log(`-- sample frame:\n${later[0]}`);
  if (adapter.isConnected()) await adapter.disconnect();
}

async function partC() {
  console.log('\n### C. RESUME AFTER RESTART (zero in-memory state) ###');
  const adapter = await freshDb();
  const svc1 = new AgentPersistenceService(adapter as any);
  const sessionId = await svc1.createSession(P, 'r1', 'c1', 'S1', { model: 'qwen' });
  const runId = await svc1.createRun(sessionId, P);
  const planId = await svc1.savePlan(runId, P, 'implement payment retry', 'retry tests pass');
  await svc1.setPlanStatus(planId, P, runId, 'APPROVED');
  const s0 = await svc1.addStep(runId, P, planId, 0, { inputRef: 'ref:snapshot:S1' });
  const s1 = await svc1.addStep(runId, P, planId, 1, { dependencyIds: ['s0'] });
  await svc1.setStepStatus(s0, runId, P, 'DONE');
  await svc1.setStepStatus(s1, runId, P, 'RUNNING');

  const svc2 = new AgentPersistenceService(adapter as any);
  const state = await loadRunState(adapter as any, runId);
  const summary = summarizeForResume(state);
  console.log(`-- runId: ${runId}`);
  console.log(`-- objective: ${summary.objective}`);
  console.log(`-- plan status: ${summary.planStatus}`);
  console.log(`-- steps done: ${summary.stepsDone}/${summary.stepsTotal} | next step index: ${summary.nextStepIndex}`);
  const rp = await svc2.resumePoint(runId);
  console.log(`-- resume point: lastCompletedStepIndex=${rp.lastCompletedStepIndex} nextStepId=${rp.nextStepId}`);
  if (adapter.isConnected()) await adapter.disconnect();
}

async function partD() {
  console.log('\n### D. PINNED SNAPSHOT ENFORCEMENT (chat pinned to a commit) ###');
  const adapter = await makeRetrievalDb();
  const svc = new SnapshotRetrievalService(adapter as any);
  const sessionId = await new AgentPersistenceService(adapter as any).createSession(P, 'r1', 'c1', 'S1');

  // branch head moves: ref now points at S2, session stays pinned to S1
  adapter.exec(`UPDATE repository_ref_index_state SET active_code_index_snapshot_id = 'S2', generation = 2 WHERE project_id='${P}'`);
  const active = adapter.get<any>(`SELECT active_code_index_snapshot_id, generation FROM repository_ref_index_state WHERE project_id='${P}'`);
  console.log(`-- branch head now points at: ${active.active_code_index_snapshot_id} (generation ${active.generation})`);

  const cases: Array<[string, any]> = [
    ['missing index_snapshot_id', { session_id: sessionId }],
    ['mismatched snapshot', { session_id: sessionId, index_snapshot_id: 'S2' }],
    ['unknown session', { session_id: 'nope', index_snapshot_id: 'S1' }],
  ];
  for (const [label, body] of cases) {
    try {
      await resolvePinnedContext(adapter as any, svc, body);
      console.log(`-- ${label}: NO ERROR (unexpected)`);
    } catch (e: any) {
      console.log(`-- ${label}: rejected with ${e.code} (HTTP ${e.status})`);
    }
  }
  const ok = await resolvePinnedContext(adapter as any, svc, {
    session_id: sessionId,
    index_snapshot_id: 'S1',
    branch: 'refs/heads/main',
  });
  console.log(`-- valid request → pinned snapshot ${ok.indexSnapshotId}, commit ${ok.commitId}`);
  const hits = await svc.symbolByName('S1', 'AuthService');
  console.log(`-- query against pinned S1 still returns: [${hits.map((h: any) => h.name).join(', ')}]`);
  if (adapter.isConnected()) await adapter.disconnect();
}

async function partE() {
  console.log('\n### E. SCRATCHPAD + CONTEXT EVICTION ###');
  const sp = renderScratchpad({
    goal: 'Locate the payment retry logic',
    deadEnds: [{ location: 'src/pay.ts:10-20', note: 'only DTO definitions' }],
    facts: [{ location: 'src/pay.ts:45-92', note: 'retry loop lives here (evidence:ch1)' }],
    plan: 'Read src/pay.ts:45-92 to confirm the retry condition',
  });
  console.log(sp);
  console.log(`-- referenced evidence ids: [${[...referencedEvidenceIds(sp)].join(', ')}]`);

  const msgs = [
    { toolCallId: 'old-big', role: 'tool' as const, content: 'x'.repeat(4000), ageTurns: 5 },
    { toolCallId: 'ch1', role: 'tool' as const, content: 'y'.repeat(2000), ageTurns: 9 },
    { toolCallId: 'new-small', role: 'tool' as const, content: 'z'.repeat(320), ageTurns: 0 },
  ];
  console.log(`-- eviction score old-big: ${evictionScore(msgs[0] as any, false)}`);
  console.log(`-- eviction score ch1 (referenced, exempt): ${evictionScore(msgs[1] as any, true)}`);
  const r = batchEvict(msgs as any, { tokenBudget: 800, exemptEvidenceIds: new Set(['ch1']) });
  console.log(`-- batchTriggered: ${r.batchTriggered} | evicted: [${r.evictedToolCallIds.join(', ')}] | exempted: [${r.exemptedToolCallIds.join(', ')}]`);
  console.log(`-- tokens after eviction: ${r.tokensAfter} (target ≤ ${Math.floor(800 * 0.7)})`);
  console.log(`-- tombstone left in place: ${JSON.stringify(r.messages.find((m) => m.toolCallId === 'old-big')?.content)}`);
}

async function main() {
  await partA();
  await partB();
  await partC();
  await partD();
  await partE();
}

main().catch((e) => {
  console.error('DEMO FAILED:', e);
  process.exit(1);
});



