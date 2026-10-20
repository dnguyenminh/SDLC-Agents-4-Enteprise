import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryEngine } from '../engine/index.js';
import { handleProcedure, handleSkillExecute } from '../dispatchers/procedure.js';
import { makeTestEngine, disconnectTestEngine } from './helpers.js';

describe('mem_skill_execute', () => {
  let engine: MemoryEngine;
  beforeEach(async () => { engine = await makeTestEngine(); });
  afterEach(async () => { await disconnectTestEngine(engine); });

  const scopeCtx = { userId: 'test-user', projectId: 'test-project' };

  it('returns steps for a procedure by id', async () => {
    const create = JSON.parse(await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'exec-me',
      steps: JSON.stringify([{ tool: 'mem_search', args: { query: 'test' } }]),
    }));
    const res = await handleSkillExecute(engine, scopeCtx, { procedure_id: create.id });
    const data = JSON.parse(res);
    expect(data.status).toBe('dry-run');
    expect(data.totalSteps).toBe(1);
    expect(data.steps[0].tool).toBe('mem_search');
  });

  it('returns steps for a procedure by name', async () => {
    await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'by-name',
      steps: JSON.stringify([{ tool: 'mem_ingest', args: { content: 'x' } }]),
    });
    const res = await handleSkillExecute(engine, scopeCtx, { name: 'by-name' });
    const data = JSON.parse(res);
    expect(data.status).toBe('dry-run');
    expect(data.steps[0].tool).toBe('mem_ingest');
  });

  it('substitutes variables in step args', async () => {
    const create = JSON.parse(await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'vars',
      steps: JSON.stringify([{ tool: 'mem_search', args: { query: '{{q}}' } }]),
    }));
    const res = await handleSkillExecute(engine, scopeCtx, {
      procedure_id: create.id,
      variables: JSON.stringify({ q: 'hello-world' }),
    });
    const data = JSON.parse(res);
    expect(data.steps[0].args.query).toBe('hello-world');
  });

  it('returns error for unknown procedure', async () => {
    const res = await handleSkillExecute(engine, scopeCtx, { procedure_id: 9999 });
    const data = JSON.parse(res);
    expect(data.error).toBe('Procedure not found');
  });

  it('executes steps via dispatch when provided', async () => {
    const create = JSON.parse(await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'execute-test',
      steps: JSON.stringify([
        { tool: 'mem_search', args: { query: 'hello' } },
        { tool: 'mem_search', args: { query: 'world' } },
      ]),
    }));
    const dispatchLog: { tool: string; args: any }[] = [];
    const mockDispatch = async (tool: string, args: any) => {
      dispatchLog.push({ tool, args });
      return JSON.stringify({ result: 'ok' });
    };
    const res = await handleSkillExecute(engine, scopeCtx, { procedure_id: create.id }, mockDispatch);
    const data = JSON.parse(res);
    expect(data.status).toBe('completed');
    expect(data.succeeded).toBe(2);
    expect(data.failed).toBe(0);
    expect(dispatchLog).toHaveLength(2);
    expect(dispatchLog[0].tool).toBe('mem_search');
    expect(dispatchLog[0].args.query).toBe('hello');
    expect(dispatchLog[1].args.query).toBe('world');
  });

  it('reports step failures', async () => {
    const create = JSON.parse(await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'fail-test',
      steps: JSON.stringify([{ tool: 'mem_search', args: {} }]),
    }));
    const failingDispatch = async () => { throw new Error('tool error'); };
    const res = await handleSkillExecute(engine, scopeCtx, { procedure_id: create.id }, failingDispatch);
    const data = JSON.parse(res);
    expect(data.status).toBe('completed');
    expect(data.failed).toBe(1);
    expect(data.results[0].status).toBe('error');
    expect(data.results[0].error).toContain('tool error');
  });
});
