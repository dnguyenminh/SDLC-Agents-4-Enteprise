import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { SqliteDbAdapter } from '../task-queue/SqliteDbAdapter.js';
import { MemoryEngine } from '../engine/index.js';
import { handleProcedure, handleSkillCapture, handleSkillExecute } from '../dispatchers/procedure.js';

const MEMORY_SCHEMA = `
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL, summary TEXT NOT NULL, type TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'WORKING', scope TEXT NOT NULL DEFAULT 'USER',
  user_id TEXT DEFAULT NULL, project_id TEXT DEFAULT NULL,
  source TEXT, source_ref TEXT, tags TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 1.0, access_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_accessed_at TEXT, expires_at TEXT,
  pinned INTEGER NOT NULL DEFAULT 0, pin_order INTEGER NOT NULL DEFAULT 0,
  structured_map TEXT NOT NULL DEFAULT '{}', quality_score INTEGER DEFAULT NULL,
  archived INTEGER NOT NULL DEFAULT 0, agent_name TEXT DEFAULT NULL,
  owner TEXT DEFAULT NULL, epoch_id TEXT DEFAULT NULL, superseded_by INTEGER DEFAULT NULL
);
CREATE TABLE IF NOT EXISTS memory_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE, agent_name TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT, observation_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS conversation_turns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL, turn_number INTEGER NOT NULL,
  role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
  tool_calls TEXT, metadata TEXT, summarized INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS memory_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation TEXT NOT NULL, entry_id INTEGER,
  session_id TEXT, agent_name TEXT, details TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  summary, content, tags, type,
  content=knowledge_entries, content_rowid=id,
  tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS knowledge_fts_ai AFTER INSERT ON knowledge_entries BEGIN
  INSERT INTO knowledge_fts(rowid, summary, content, tags, type)
  VALUES (new.id, new.summary, new.content, new.tags, new.type);
END;
CREATE TABLE IF NOT EXISTS kb_shared_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL, granted_project_id TEXT NOT NULL,
  granted_by TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

async function makeTestEngine(): Promise<MemoryEngine> {
  const db = new SqliteAdapter(':memory:');
  await db.connect();
  await db.exec(MEMORY_SCHEMA);
  const adapter = new SqliteDbAdapter(db);
  const engine = new MemoryEngine(adapter as any);
  return engine;
}

describe('mem_procedure', () => {
  let engine: MemoryEngine;
  beforeEach(async () => { engine = await makeTestEngine(); });
  afterEach(async () => { const adapter = engine.getAdapter() as any; if (adapter?.db?.disconnect) { await adapter.db.disconnect(); } });

  const scopeCtx = { userId: 'test-user', projectId: 'test-project' };

  it('create a procedure and returns id + stepCount', async () => {
    const res = await handleProcedure(engine, scopeCtx, {
      action: 'create',
      name: 'test-proc',
      description: 'A test procedure',
      steps: JSON.stringify([
        { tool: 'mem_search', args: { query: 'hello' } },
        { tool: 'mem_ingest', args: { content: 'world' } },
      ]),
    });
    const data = JSON.parse(res);
    expect(data.status).toBe('created');
    expect(data.id).toBeGreaterThan(0);
    expect(data.stepCount).toBe(2);
    expect(data.name).toBe('test-proc');
  });

  it('create requires name', async () => {
    const res = await handleProcedure(engine, scopeCtx, { action: 'create' });
    const data = JSON.parse(res);
    expect(data.error).toBe('name is required');
  });

  it('create validates steps format', async () => {
    const res = await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'bad', steps: 'not-json',
    });
    const data = JSON.parse(res);
    expect(data.error).toContain('valid JSON array');
  });

  it('list returns created procedures', async () => {
    await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'proc-a', steps: '[]',
    });
    await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'proc-b', steps: '[]',
    });
    const res = await handleProcedure(engine, scopeCtx, { action: 'list' });
    const data = JSON.parse(res);
    expect(data.count).toBe(2);
    expect(data.procedures.map((p: any) => p.name)).toEqual(['proc-b', 'proc-a']);
  });

  it('get by id returns procedure with steps', async () => {
    const create = JSON.parse(await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'get-test',
      steps: JSON.stringify([{ tool: 'mem_search', args: { query: 'x' } }]),
    }));
    const res = await handleProcedure(engine, scopeCtx, {
      action: 'get', id: create.id,
    });
    const data = JSON.parse(res);
    expect(data.name).toBe('get-test');
    expect(data.steps).toHaveLength(1);
    expect(data.steps[0].tool).toBe('mem_search');
  });

  it('get by name finds procedure', async () => {
    await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'find-me', steps: '[]',
    });
    const res = await handleProcedure(engine, scopeCtx, {
      action: 'get', name: 'find-me',
    });
    const data = JSON.parse(res);
    expect(data.name).toBe('find-me');
  });

  it('get returns error for unknown procedure', async () => {
    const res = await handleProcedure(engine, scopeCtx, {
      action: 'get', id: 9999,
    });
    const data = JSON.parse(res);
    expect(data.error).toBe('Procedure not found');
  });

  it('delete by id removes procedure', async () => {
    const create = JSON.parse(await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'to-delete', steps: '[]',
    }));
    const del = await handleProcedure(engine, scopeCtx, {
      action: 'delete', id: create.id,
    });
    expect(JSON.parse(del).status).toBe('deleted');
    const list = JSON.parse(await handleProcedure(engine, scopeCtx, { action: 'list' }));
    expect(list.count).toBe(0);
  });

  it('search finds procedures by query', async () => {
    await handleProcedure(engine, scopeCtx, {
      action: 'create', name: 'search-me', steps: '[]',
    });
    const res = await handleProcedure(engine, scopeCtx, {
      action: 'search', query: 'search',
    });
    const data = JSON.parse(res);
    expect(data.count).toBeGreaterThanOrEqual(1);
  });
});

describe('mem_procedure share/list_shared', () => {
  let engine: MemoryEngine;
  beforeEach(async () => { engine = await makeTestEngine(); });
  afterEach(async () => { const adapter = engine.getAdapter() as any; if (adapter?.db?.disconnect) { await adapter.db.disconnect(); } });

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

describe('mem_skill_capture', () => {
  let engine: MemoryEngine;
  beforeEach(async () => {
    engine = await makeTestEngine();
    await engine.startSession('test-session');
  });
  afterEach(async () => { const adapter = engine.getAdapter() as any; if (adapter?.db?.disconnect) { await adapter.db.disconnect(); } });

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

describe('mem_skill_execute', () => {
  let engine: MemoryEngine;
  beforeEach(async () => { engine = await makeTestEngine(); });
  afterEach(async () => { const adapter = engine.getAdapter() as any; if (adapter?.db?.disconnect) { await adapter.db.disconnect(); } });

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
