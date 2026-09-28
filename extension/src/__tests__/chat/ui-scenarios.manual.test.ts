/**
 * SA4E-85 — E2E-UI + SIT scenarios (logic-level).
 * Converted from manual test.todo placeholders to automated tests.
 * Each test validates the underlying logic that the browser/webview layer
 * renders. Full DOM rendering remains covered by webview integration tests.
 */

import { describe, test, expect, vi } from 'vitest';
import { StreamHandler } from '../../mcp/stream-handler';
import { ContextUsageTracker } from '../../chat-panel/context-usage-tracker';
import { requiresApproval, getDangerousTools, getSafeTools } from '../../chat/engine/ToolApprovalClassifier';
import { computeUnifiedDiff, countDiffLines } from '../../chat/diff/diff-utils';
import { validateAgentRole, buildResourceLoaderOptions, AGENT_PROMPTS, ALLOWED_ROLES } from '../../pi-agent/agent-configurator';
import { SessionManager } from '../../chat/engine/SessionManager';
import type { KnowledgeClient } from '../../knowledge-client';
import { JsonRpcClient } from '../../chat/ipc/jsonRpcClient';

describe('E2E-UI: Chat Panel Interaction (Logic)', () => {
  // STC Reference: E2E-UI-01 — User sends message and sees streamed response
  test('streamed response: StreamHandler emits buffered tokens then complete', () => {
    const emitted: Array<{ type: string; eventType?: string; content?: string }> = [];
    const emit = vi.fn((msg: any) => { emitted.push(msg); });

    const handler = new StreamHandler(emit);
    const streamId = 'test-stream-1';

    handler.emitToken('chat', 'Hello', streamId);
    handler.emitToken('chat', ' World', streamId);
    // Tokens are debounced (50ms) — nothing flushed yet
    expect(emitted.filter(e => e.type === 'chat:streamChunk')).toHaveLength(0);

    // emitComplete flushes pending tokens first, then the complete event
    handler.emitComplete('chat', 100, streamId);

    const chunks = emitted.filter(e => e.type === 'chat:streamChunk');
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).toBe('Hello');
    expect(chunks[1].content).toBe(' World');
    expect(emitted.some(e => e.type === 'chat:streamComplete')).toBe(true);
    handler.dispose();
  });

  // STC Reference: E2E-UI-02 — Permission guard appears for dangerous tool
  test('permission guard: write/exec tools require approval, read tools do not', () => {
    for (const dangerous of ['write_file', 'delete_file', 'execute_shell', 'stream_write_file']) {
      expect(requiresApproval(dangerous)).toBe(true);
    }
    for (const safe of ['read_file', 'list_directory', 'search_text', 'get_diagnostics', 'get_open_files']) {
      expect(requiresApproval(safe)).toBe(false);
    }
    expect(getDangerousTools().size).toBeGreaterThan(0);
    expect(getSafeTools().size).toBeGreaterThan(0);
  });

  // STC Reference: E2E-UI-03 — Context badge shows token usage
  test('context badge: tracker computes token percentage with threshold state', () => {
    const tracker = new ContextUsageTracker(100000);
    tracker.updateFromMessages('tab1', [{ content: 'x'.repeat(100000) }]); // ~25k tokens
    tracker.addToolTokens('tab1', 'tool output '.repeat(50)); // ~150 tokens

    const payload = tracker.getUsagePayload('tab1');
    expect(payload.maxTokens).toBe(100000);
    expect(payload.total.tokens).toBeGreaterThan(25000);
    expect(payload.total.percentage).toBeGreaterThanOrEqual(25);
    expect(payload.total.percentage).toBeLessThanOrEqual(100);
    expect(['safe', 'warning', 'critical', 'full']).toContain(payload.total.threshold);
  });

  // STC Reference: E2E-UI-04 — Agent selector switches agent
  test('agent selector: role validation + prompt switching per agent', () => {
    expect(() => validateAgentRole('DEV')).not.toThrow();
    expect(() => validateAgentRole('NOT_A_ROLE')).toThrow(/Invalid agentRole/);

    const replace = buildResourceLoaderOptions({ cwd: '/ws', agentDir: '/agent' }, 'DEV', 'replace');
    expect(replace.systemPromptOverride).toBe(AGENT_PROMPTS.DEV);
    expect(replace.appendSystemPromptOverride).toEqual([]);

    const append = buildResourceLoaderOptions({ cwd: '/ws', agentDir: '/agent' }, 'QA', 'append');
    expect(append.systemPromptOverride).toBeUndefined();
    expect(append.appendSystemPromptOverride).toEqual([AGENT_PROMPTS.QA]);

    // Every allowed role maps to a distinct non-empty prompt
    expect(ALLOWED_ROLES.length).toBe(Object.keys(AGENT_PROMPTS).length);
    for (const role of ALLOWED_ROLES) {
      expect(AGENT_PROMPTS[role].length).toBeGreaterThan(0);
    }
  });

  // STC Reference: E2E-UI-05 — Diff block accept/reject buttons work
  test('diff block: unified diff computes added/removed line counts', () => {
    const original = 'line 1\nline 2\nline 3';
    const modified = 'line 1\nline 2 modified\nline 3\nline 4';

    const diff = computeUnifiedDiff('test.txt', original, modified);
    const { linesAdded, linesRemoved } = countDiffLines(diff);

    expect(linesAdded).toBe(3); // "+line 2 modified", "+line 3", "+line 4"
    expect(linesRemoved).toBe(2); // "-line 2", "-line 3" (no-newline-at-EOF re-adds line 3)
    expect(diff).toContain('-line 2');
    expect(diff).toContain('+line 2 modified');
    expect(diff).toContain('+line 4');

    // Identical content produces an empty change set (accept = no-op)
    const noDiff = countDiffLines(computeUnifiedDiff('t.txt', 'same', 'same'));
    expect(noDiff.linesAdded).toBe(0);
    expect(noDiff.linesRemoved).toBe(0);
  });
});

describe('SIT: System Integration (Logic)', () => {
  function mockKbClient(threads: any[] = [], messages: any[] = [], created: any = { thread_id: 't-new', created_at: '2026-01-01T00:00:00Z' }) {
    return {
      listThreads: vi.fn().mockResolvedValue(threads),
      createThread: vi.fn().mockResolvedValue(created),
      getMessages: vi.fn().mockResolvedValue(messages),
    } as unknown as KnowledgeClient;
  }

  // STC Reference: SIT-01 — Full pipeline: prompt -> session -> hydrated messages
  test('full pipeline: session resolves thread and hydrates messages from KB', async () => {
    const kb = mockKbClient(
      [],
      [{ id: 'm-1', role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00Z', agent_id: 'DEV' }]
    );
    const sm = new SessionManager('/ws', kb);

    const session = await sm.ensureSession();
    expect(session.thread_id).toBe('t-new');
    expect(kb.createThread).toHaveBeenCalledTimes(1);

    // ensureSession is idempotent — cached, no second create
    await sm.ensureSession();
    expect(kb.createThread).toHaveBeenCalledTimes(1);

    const hydrated = await sm.getSessionMessages();
    expect(hydrated?.threadId).toBe('t-new');
    expect(hydrated?.messages).toHaveLength(1);
    expect(hydrated?.messages[0]).toMatchObject({ role: 'user', content: 'hello', agentId: 'DEV' });
  });

  // STC Reference: SIT-02 — IPC reconnect after service restart
  test('IPC: JSON-RPC matches responses by id, times out, and rejects all on disconnect', async () => {
    const client = new JsonRpcClient(50);

    // Matched response resolves the promise
    const { message, promise } = client.createRequest('tools/list', {});
    expect(client.pendingCount).toBe(1);
    const parsed = JSON.parse(message);
    expect(parsed.method).toBe('tools/list');

    const handled = client.handleResponse(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { tools: [] } }));
    expect(handled).toBe(true);
    await expect(promise).resolves.toEqual({ tools: [] });
    expect(client.pendingCount).toBe(0);

    // Unmatched/garbage responses are ignored without throwing
    expect(client.handleResponse('not-json')).toBe(false);
    expect(client.handleResponse(JSON.stringify({ jsonrpc: '2.0', id: 999, result: null }))).toBe(false);

    // Timeout: pending request rejects after timeoutMs
    const slow = new JsonRpcClient(20);
    const t = slow.createRequest('slow/method', {});
    await expect(t.promise).rejects.toThrow(/timeout/);
    expect(slow.pendingCount).toBe(0);

    // Disconnect: rejectAll fails every pending request (reconnect path clears state)
    const dropped = new JsonRpcClient(10_000);
    const p1 = dropped.createRequest('a', {});
    const p2 = dropped.createRequest('b', {});
    dropped.rejectAll('connection lost');
    await expect(p1.promise).rejects.toThrow('connection lost');
    await expect(p2.promise).rejects.toThrow('connection lost');
    expect(dropped.pendingCount).toBe(0);
  });

  // STC Reference: SIT-03 — Concurrent users on same workspace
  test('concurrent sessions: two SessionManagers stay isolated', async () => {
    const kbA = mockKbClient(
      [{ thread_id: 't-A', status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:01:00Z' }],
      [{ id: 'm-A', role: 'user', content: 'from A', timestamp: '2026-01-01T00:00:00Z' }]
    );
    const kbB = mockKbClient(
      [{ thread_id: 't-B', status: 'active', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:02:00Z' }],
      [{ id: 'm-B', role: 'assistant', content: 'from B', timestamp: '2026-01-01T00:00:00Z' }]
    );

    const smA = new SessionManager('/ws', kbA);
    const smB = new SessionManager('/ws', kbB);

    const [sA, sB] = await Promise.all([smA.ensureSession(), smB.ensureSession()]);
    expect(sA.thread_id).toBe('t-A');
    expect(sB.thread_id).toBe('t-B');

    const [msgsA, msgsB] = await Promise.all([smA.getSessionMessages(), smB.getSessionMessages()]);
    expect(msgsA?.messages[0].content).toBe('from A');
    expect(msgsB?.messages[0].content).toBe('from B');

    // A's cache is untouched by B's activity
    expect(smA.getSession()?.thread_id).toBe('t-A');
  });

  // STC Reference: SIT-04 — Extension activation with no backend
  test('no backend: tracker falls back to default 128k window and stays usable', () => {
    // When engine/provider is offline, detected context window is 0 and the
    // tracker keeps the safe default instead of crashing or zeroing out.
    const tracker = new ContextUsageTracker(); // default 128000
    tracker.updateFromMessages('default', [{ content: 'x'.repeat(4000) }]); // ~1k tokens

    const payload = tracker.getUsagePayload('default');
    expect(payload.maxTokens).toBe(128000);
    expect(payload.total.percentage).toBe(1); // 1000/128000 rounds to 1
    expect(['safe', 'warning', 'critical', 'full']).toContain(payload.total.threshold);
  });

  // STC Reference: SIT-05 — Large context window handling
  test('large context: 100+ tool results tracked without degradation, capped at 100%', () => {
    const tracker = new ContextUsageTracker(200000);
    const started = Date.now();

    for (let i = 0; i < 120; i++) {
      tracker.addToolTokens(`tab-${i % 3}`, 'x'.repeat(500)); // ~125 tokens each
    }

    const elapsed = Date.now() - started;
    expect(elapsed).toBeLessThan(2000); // must not freeze the host

    const payload = tracker.getUsagePayload('tab-0');
    expect(payload.total.tokens).toBeGreaterThan(0);
    expect(payload.total.percentage).toBeLessThanOrEqual(100);

    // Overflow is clamped, never above 100%
    const overflow = new ContextUsageTracker(1000);
    overflow.updateFromMessages('big', [{ content: 'x'.repeat(100000) }]); // ~25k tokens on 1k window
    expect(overflow.getUsagePayload('big').total.percentage).toBe(100);
  });
});
