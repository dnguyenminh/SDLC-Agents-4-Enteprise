/**
 * E2E Integration Test Suite cho Pega Rule & Data Indexing Pipeline —
 * data instances, dynamic schema, browser plan, resolver & declarative
 * engine (TC-06..TC-10).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Hono } from 'hono';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { PegaRuleResolver } from '../PegaRuleResolver.js';
import { PegaDeclarativeEngine } from '../PegaDeclarativeEngine.js';
import { setupPegaIndexingE2e } from './pega-indexing.e2e.helpers.js';
import {
  MOCK_ACTIVITY_JSON,
  MOCK_OPERATOR_DATA_JSON,
  MOCK_DECISION_TABLE_JSON,
} from './fixtures/pega-samples.js';

describe('Pega Indexing E2E Integration Suite', () => {
  let app: Hono;
  let adapter: SqliteAdapter;

  beforeAll(async () => {
    ({ app, adapter } = await setupPegaIndexingE2e());
  });

  afterAll(async () => {
    await adapter.disconnect();
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
