/**
 * SA4E-331 — Security bug fix: Memory Engine project isolation bypass
 * Tests mem_get and mem_search enforce project isolation for PROJECT scoped entries.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeTempDb, type TempDb } from '../../../__tests__/sa4e-testkit.js';
import { MemoryEngine } from '../engine/index.js';
import { handleCrud } from '../dispatchers/crud.js';
import { handleSearch } from '../dispatchers/search.js';

describe('SA4E-331 UT — mem_get cross-project access control', () => {
  let ctx: TempDb;
  let engine: MemoryEngine;

  beforeEach(async () => {
    ctx = await makeTempDb();
    engine = ctx.engine;
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('mem_get returns PROJECT entry for same project', async () => {
    const id = await engine.insert({
      content: 'secret project data',
      summary: 'proj secret',
      type: 'CONTEXT',
      scope: 'PROJECT',
      project_id: '22b039993db3',
      user_id: 'user-1',
    });
    const result = await handleCrud(engine, { userId: 'user-1', projectId: '22b039993db3' }, { action: 'get', id });
    expect(result).toContain('proj secret');
    expect(result).toContain(`#${id}`);
  });

  it('mem_get denies PROJECT entry for different project', async () => {
    const id = await engine.insert({
      content: 'secret project data',
      summary: 'proj secret',
      type: 'CONTEXT',
      scope: 'PROJECT',
      project_id: '22b039993db3',
      user_id: 'user-1',
    });
    const result = await handleCrud(engine, { userId: 'user-1', projectId: 'different-project' }, { action: 'get', id });
    expect(result).toBe(`Not found: ${id}`);
  });

  it('mem_get denies PROJECT entry when no scope context (fail closed)', async () => {
    const id = await engine.insert({
      content: 'secret project data',
      summary: 'proj secret',
      type: 'CONTEXT',
      scope: 'PROJECT',
      project_id: '22b039993db3',
      user_id: 'user-1',
    });
    const result = await handleCrud(engine, undefined, { action: 'get', id });
    expect(result).toBe(`Not found: ${id}`);
  });
});

describe('SA4E-331 UT — mem_search cross-project access control', () => {
  let ctx: TempDb;
  let engine: MemoryEngine;

  beforeEach(async () => {
    ctx = await makeTempDb();
    engine = ctx.engine;
    await engine.insert({
      content: 'project A data',
      summary: 'proj A entry',
      type: 'CONTEXT',
      scope: 'PROJECT',
      project_id: '22b039993db3',
      user_id: 'user-1',
    });
    await engine.insert({
      content: 'project B data',
      summary: 'proj B entry',
      type: 'CONTEXT',
      scope: 'PROJECT',
      project_id: 'other-project',
      user_id: 'user-1',
    });
  });
  afterEach(async () => {
    await ctx.close();
  });

  it('mem_search finds PROJECT entries for same project', async () => {
    const result = await handleSearch(engine, { userId: 'user-1', projectId: '22b039993db3' }, { query: 'project A', limit: 10 });
    expect(result).toContain('proj A entry');
    expect(result).not.toContain('proj B entry');
  });

  it('mem_search does not find PROJECT entries for different project', async () => {
    const result = await handleSearch(engine, { userId: 'user-1', projectId: 'other-project' }, { query: 'project', limit: 10 });
    expect(result).not.toContain('proj A entry');
    expect(result).toContain('proj B entry');
  });

  it('mem_search returns empty for PROJECT entries when no project context', async () => {
    const result = await handleSearch(engine, undefined, { query: 'project A', limit: 10 });
    expect(result).toContain('No knowledge found');
  });
});
