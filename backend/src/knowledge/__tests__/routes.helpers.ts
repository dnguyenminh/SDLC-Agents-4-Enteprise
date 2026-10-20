/**
 * Shared helpers for Knowledge REST API route tests.
 * Split from routes.test.ts to keep each file under the CI line-count gate
 * (<=200 lines). No logic changed — helpers relocated.
 */
import pino from 'pino';
import { Hono } from 'hono';
import { KnowledgeDb } from '../KnowledgeDb.js';
import { KnowledgeService } from '../KnowledgeService.js';
import { createKnowledgeApiRoutes } from '../routes.js';

export const logger = pino({ level: 'silent' });

export async function makeApp(checkpointLimit = 10 * 1024 * 1024) {
  const db = await KnowledgeDb.createInMemory();
  const service = new KnowledgeService(db, logger);
  const app = new Hono();
  app.route('/api/v1', createKnowledgeApiRoutes(service, logger, { checkpointBodyLimitBytes: checkpointLimit }));
  return { app, db, service };
}

export function wsHeaders(projectId: string): Record<string, string> {
  return { 'Content-Type': 'application/json', 'X-Project-Id': projectId };
}

export async function createThread(app: Hono, projectId = 'ws-A') {
  const res = await app.request('/api/v1/threads', {
    method: 'POST',
    headers: wsHeaders(projectId),
    body: JSON.stringify({ title: 'route-test' }),
  });
  const body = (await res.json()) as any;
  return { status: res.status, thread_id: body.data?.thread_id };
}
