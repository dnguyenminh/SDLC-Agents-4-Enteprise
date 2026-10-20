import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryEngine } from '../engine/index.js';
import { handleProcedure } from '../dispatchers/procedure.js';
import { makeTestEngine, disconnectTestEngine } from './helpers.js';

describe('mem_procedure share/list_shared', () => {
  let engine: MemoryEngine;
  beforeEach(async () => { engine = await makeTestEngine(); });
  afterEach(async () => { await disconnectTestEngine(engine); });

  const scopeCtx = { userId: 'test-user', projectId: 'test-project' };

  it('share promotes procedure scope to SHARED', async () => {
    const created = JSON.parse(await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'to-share', steps: '[]',
    }));
    const res = await handleProcedure(engine, scopeCtx, {
      action: 'share', id: created.id,
    });
    const data = JSON.parse(res);
    expect(data.status).toBe('shared');
  });

  it('share by name works', async () => {
    await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'share-by-name', steps: '[]',
    });
    const res = await handleProcedure(engine, scopeCtx, {
      action: 'share', name: 'share-by-name',
    });
    expect(JSON.parse(res).status).toBe('shared');
  });

  it('share returns already_shared for already shared procedure', async () => {
    const created = JSON.parse(await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'already-shared', steps: '[]',
    }));
    await handleProcedure(engine, scopeCtx, { action: 'share', id: created.id });
    const res = await handleProcedure(engine, scopeCtx, { action: 'share', id: created.id });
    expect(JSON.parse(res).status).toBe('already_shared');
  });

  it('share requires id or name', async () => {
    const res = await handleProcedure(engine, scopeCtx, { action: 'share' });
    expect(JSON.parse(res).error).toBe('id or name required');
  });

  it('list_shared returns only SHARED procedures', async () => {
    await handleProcedure(engine, scopeCtx, { action: 'create', name: 'private', steps: '[]' });
    const pub = JSON.parse(await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'public', steps: '[]',
    }));
    await handleProcedure(engine, scopeCtx, { action: 'share', id: pub.id });
    const res = await handleProcedure(engine, scopeCtx, { action: 'list_shared' });
    const data = JSON.parse(res);
    expect(data.count).toBe(1);
    expect(data.procedures[0].name).toBe('public');
  });

  it('list_shared returns empty when no shared procedures', async () => {
    const res = await handleProcedure(engine, scopeCtx, { action: 'list_shared' });
    expect(JSON.parse(res).count).toBe(0);
  });
});
