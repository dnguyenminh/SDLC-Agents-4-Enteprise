import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryEngine } from '../engine/index.js';
import { handleSkillCapture } from '../dispatchers/procedure.js';
import { makeTestEngine, disconnectTestEngine } from './helpers.js';

describe('mem_skill_capture', () => {
  let engine: MemoryEngine;
  beforeEach(async () => {
    engine = await makeTestEngine();
    await engine.startSession('test-session');
  });
  afterEach(async () => { await disconnectTestEngine(engine); });

  const scopeCtx = { userId: 'test-user', projectId: 'test-project' };

  it('captures tool calls from conversation turns', async () => {
    const adapter = engine.getAdapter();
    await adapter.runAsync(
      `INSERT INTO conversation_turns (session_id, turn_number, role, tool_calls)
       VALUES (?, 1, 'assistant', ?)`,
      [engine.getSessionId(), JSON.stringify([
        { name: 'mem_search', arguments: { query: 'hello' } },
      ])],
    );

    const res = await handleSkillCapture(engine, scopeCtx, {
      name: 'captured-skill',
    });
    const data = JSON.parse(res);
    expect(data.status).toBe('captured');
    expect(data.stepCount).toBe(1);
    expect(data.steps).toEqual(['mem_search']);
  });

  it('deduplicates identical tool calls', async () => {
    const adapter = engine.getAdapter();
    const sid = engine.getSessionId();
    const calls = JSON.stringify([{ name: 'mem_search', arguments: { query: 'hello' } }]);
    await adapter.runAsync(
      `INSERT INTO conversation_turns (session_id, turn_number, role, tool_calls) VALUES (?, 1, 'assistant', ?)`,
      [sid, calls],
    );
    await adapter.runAsync(
      `INSERT INTO conversation_turns (session_id, turn_number, role, tool_calls) VALUES (?, 2, 'assistant', ?)`,
      [sid, calls],
    );

    const res = await handleSkillCapture(engine, scopeCtx, { name: 'dedup-skill' });
    const data = JSON.parse(res);
    expect(data.stepCount).toBe(1);
  });

  it('filters by tool name', async () => {
    const adapter = engine.getAdapter();
    const sid = engine.getSessionId();
    await adapter.runAsync(
      `INSERT INTO conversation_turns (session_id, turn_number, role, tool_calls) VALUES (?, 1, 'assistant', ?)`,
      [sid, JSON.stringify([
        { name: 'mem_search', arguments: { query: 'a' } },
        { name: 'mem_ingest', arguments: { content: 'b' } },
      ])],
    );

    const res = await handleSkillCapture(engine, scopeCtx, {
      name: 'filtered', filter_tools: 'mem_search',
    });
    const data = JSON.parse(res);
    expect(data.stepCount).toBe(1);
    expect(data.steps).toEqual(['mem_search']);
  });

  it('returns error when no tool calls in session', async () => {
    await handleSkillCapture(engine, scopeCtx, { name: 'empty' });
    const res = await handleSkillCapture(engine, scopeCtx, { name: 'empty' });
    const data = JSON.parse(res);
    expect(data.error).toBe('No tool calls found in session');
  });

  it('requires name', async () => {
    const res = await handleSkillCapture(engine, scopeCtx, {});
    const data = JSON.parse(res);
    expect(data.error).toBe('name is required');
  });
});
