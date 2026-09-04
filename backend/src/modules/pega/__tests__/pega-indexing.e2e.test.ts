/**
 * E2E Integration Test Suite cho Pega Rule & Data Indexing Pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { createPegaApiRoutes } from '../../../server/routes/pega-api.js';
import { PegaRuleResolver } from '../PegaRuleResolver.js';
import { PegaDeclarativeEngine } from '../PegaDeclarativeEngine.js';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { MemoryEngine } from '../../memory/engine/core.js';
import {
  MOCK_ACTIVITY_JSON,
  MOCK_VALIDATE_DATA_ACTIVITY_JSON,
  MOCK_DATA_TRANSFORM_JSON,
  MOCK_OPERATOR_DATA_JSON,
  MOCK_DECISION_TABLE_JSON,
} from './fixtures/pega-samples.js';

/** Minimal SQLite schema covering the tables the Pega pipeline touches. */
const E2E_SCHEMA = `
CREATE TABLE IF NOT EXISTS knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT, summary TEXT, type TEXT, tier TEXT, scope TEXT,
  user_id TEXT, project_id TEXT, source TEXT, source_ref TEXT,
  tags TEXT, confidence REAL DEFAULT 1.0, agent_name TEXT, owner TEXT,
  enrichment_status TEXT, structured_map TEXT, archived INTEGER DEFAULT 0,
  expires_at TEXT, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ke_source_project_unique
  ON knowledge_entries(source, project_id) WHERE source IS NOT NULL;
CREATE TABLE IF NOT EXISTS pending_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_type TEXT, entry_id INTEGER, status TEXT, payload TEXT,
  max_retries INTEGER DEFAULT 3, project_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  started_at TEXT, completed_at TEXT, error TEXT, retry_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT, path TEXT, relative_path TEXT, language TEXT, module TEXT,
  content_hash TEXT, size_bytes INTEGER, line_count INTEGER,
  UNIQUE(project_id, path)
);
CREATE TABLE IF NOT EXISTS symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT, file_id INTEGER, name TEXT, kind TEXT, signature TEXT,
  start_line INTEGER, end_line INTEGER, parent_symbol TEXT, visibility TEXT, doc_comment TEXT,
  enrichment_status TEXT, summary TEXT, pseudo_code TEXT, llm_tags TEXT,
  complexity INTEGER DEFAULT 0, is_exported INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS body_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT, symbol_id INTEGER, chunk_index INTEGER,
  embedding BLOB, token_count INTEGER,
  UNIQUE(project_id, symbol_id, chunk_index)
);
CREATE TABLE IF NOT EXISTS graph_nodes (
  entry_id TEXT PRIMARY KEY,
  label TEXT, type TEXT, tier TEXT,
  project_id TEXT, x REAL, y REAL, z REAL, level TEXT, cluster_id TEXT
);
`;

describe('Pega Indexing E2E Integration Suite', () => {
  let app: Hono;
  let adapter: SqliteAdapter;
  let engine: MemoryEngine;

  beforeAll(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    await adapter.execAsync(E2E_SCHEMA);
    engine = new MemoryEngine(adapter);
    const mockRegistry = {
      getModule: (name: string) => {
        if (name === 'memory') {
          return { status: 'ready', getEngine: () => engine };
        }
        return null;
      },
    } as any;

    const mockLogger = { error: () => {}, info: () => {}, warn: () => {}, debug: () => {} } as any;
    app = new Hono();
    // SA4E-241: mimic jwtAuth (anonymous mode) — inject projectContext from the
    // X-Project-Id header so identity-bound routes work under test.
    app.use('/api/v1/pega/*', async (c, next) => {
      const projectId = c.req.header('X-Project-Id') || '';
      c.set('projectContext' as never, { projectId, userId: 'anonymous' } as never);
      return next();
    });
    app.route('/api/v1', createPegaApiRoutes(mockRegistry, mockLogger));
  });

  afterAll(async () => {
    await adapter.disconnect();
  });

  it('TC-01: Check-rule returns cache miss for un-indexed activity', async () => {
    const res = await app.request('/api/v1/pega/check-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'PEGA_APP_01',
        ruleType: 'Rule-Obj-Activity',
        className: 'Work-Cover-Jira',
        ruleName: 'ResolveTicket',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.cached).toBe(false);
  });

  it('TC-02: Ingest activity extracts symbol & unresolved dependencies', async () => {
    const res = await app.request('/api/v1/pega/ingest-rule', {
      method: 'POST',
      // SA4E-241: identity via X-Project-Id + required client checksum (NT-4).
      headers: { 'Content-Type': 'application/json', 'X-Project-Id': 'PEGA_APP_01' },
      body: JSON.stringify({
        ruleJson: MOCK_ACTIVITY_JSON,
        checksum: 'a'.repeat(64),
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.status).toBe('success');
    expect(body.data.unresolvedDependencies.length).toBe(2);
    expect(body.data.unresolvedDependencies[0].ruleName).toBe('ValidateData');
  });

  it('TC-03: Check-rule returns cache hit after ingesting activity', async () => {
    const res = await app.request('/api/v1/pega/check-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: 'PEGA_APP_01',
        ruleType: 'Rule-Obj-Activity',
        className: 'Work-Cover-Jira',
        ruleName: 'ResolveTicket',
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.cached).toBe(true);
    expect(body.data.content.pyActivityName).toBe('ResolveTicket');
  });

  it('TC-04: Ingest dependency activity resolves background queue', async () => {
    const res = await app.request('/api/v1/pega/ingest-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Id': 'PEGA_APP_01' },
      body: JSON.stringify({
        ruleJson: MOCK_VALIDATE_DATA_ACTIVITY_JSON,
        checksum: 'c'.repeat(64),
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.status).toBe('success');
  });

  it('TC-05: Ingest Data Transform (Rule-Obj-Model)', async () => {
    const res = await app.request('/api/v1/pega/ingest-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Id': 'PEGA_APP_01' },
      body: JSON.stringify({
        ruleJson: MOCK_DATA_TRANSFORM_JSON,
        checksum: 'd'.repeat(64),
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.status).toBe('success');
    expect(body.data.unresolvedDependencies[0].ruleName).toBe('SetDefaultStatus');
  });

  it('TC-06: Ingest Data instance (Data-Admin-Operator-ID)', async () => {
    const res = await app.request('/api/v1/pega/ingest-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Id': 'PEGA_APP_01' },
      body: JSON.stringify({
        ruleJson: MOCK_OPERATOR_DATA_JSON,
        checksum: 'f'.repeat(64),
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.data.status).toBe('success');
  });

  it('TC-07: Upsert dynamic schema via REST API & ingest Decision Table', async () => {
    const schemaRes = await app.request('/api/v1/pega/schemas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetClass: 'Rule-Declare-DecisionTable',
        nameProperty: 'pyLabel',
        dependencyPaths: ['pyPropertyEvaluated', 'pyReturnActions[].pyTransformName'],
      }),
    });
    expect(schemaRes.status).toBe(201);

    const ingestRes = await app.request('/api/v1/pega/ingest-rule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Id': 'PEGA_APP_01' },
      body: JSON.stringify({
        ruleJson: MOCK_DECISION_TABLE_JSON,
        checksum: 'e'.repeat(64),
      }),
    });
    expect(ingestRes.status).toBe(201);
    const body = (await ingestRes.json()) as any;
    expect(body.data.status).toBe('success');
  });

  it('TC-08: Generate Browser UI Automation Plan via POST /api/v1/pega/browser-plan', async () => {
    const planRes = await app.request('/api/v1/pega/browser-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ruleJson: MOCK_ACTIVITY_JSON }),
    });
    expect(planRes.status).toBe(200);
    const body = (await planRes.json()) as any;
    expect(body.data.ruleFqn).toBe('Rule-Obj-Activity:Work-Cover-Jira:ResolveTicket');
    expect(body.data.uiSteps.length).toBeGreaterThan(0);
    expect(body.data.uiSteps[0].action).toBe('CLICK_ADD_STEP');
  });

  it('TC-09: Verify PegaRuleResolver Pattern Inheritance & Ruleset Stack filtering', () => {
    const candidates = [
      { fqn: 'Rule-Obj-Activity:Work-Cover:ResolveTicket', ruleType: 'Rule-Obj-Activity', className: 'Work-Cover', ruleName: 'ResolveTicket', ruleset: 'JiraIntegration' },
      { fqn: 'Rule-Obj-Activity:Work-Cover-Jira:ResolveTicket', ruleType: 'Rule-Obj-Activity', className: 'Work-Cover-Jira', ruleName: 'ResolveTicket', ruleset: 'JiraIntegration' },
    ];
    const resolved = PegaRuleResolver.resolveRule('Work-Cover-Jira-Ticket', 'ResolveTicket', 'Rule-Obj-Activity', ['JiraIntegration'], candidates);
    expect(resolved).not.toBeNull();
    expect(resolved?.className).toBe('Work-Cover-Jira');
  });

  it('TC-10: Verify PegaDeclarativeEngine Forward and Backward Chaining', () => {
    const engine = new PegaDeclarativeEngine();
    engine.registerExpression('.TaxAmount', '.SubTotal * 0.1', ['.SubTotal']);
    engine.registerExpression('.GrandTotal', '.SubTotal + .TaxAmount', ['.SubTotal', '.TaxAmount']);

    const forwardImpact = engine.findForwardImpact('.SubTotal');
    expect(forwardImpact).toContain('.TaxAmount');
    expect(forwardImpact).toContain('.GrandTotal');

    const backwardDeps = engine.findBackwardDependencies('.GrandTotal');
    expect(backwardDeps).toContain('.TaxAmount');
    expect(backwardDeps).toContain('.SubTotal');
  });
});
