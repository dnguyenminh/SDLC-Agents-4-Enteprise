/**
 * E2E Integration Test Suite cho Pega Rule & Data Indexing Pipeline —
 * rule cache / ingest lifecycle (TC-01..TC-05).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Hono } from 'hono';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { setupPegaIndexingE2e } from './pega-indexing.e2e.helpers.js';
import {
  MOCK_ACTIVITY_JSON,
  MOCK_VALIDATE_DATA_ACTIVITY_JSON,
  MOCK_DATA_TRANSFORM_JSON,
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
});
