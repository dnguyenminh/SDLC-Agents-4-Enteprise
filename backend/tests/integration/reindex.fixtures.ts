/**
 * Shared harness for the SA4E-42 re-index integration suites
 * (split from reindex.it.test.ts — BR-18 ≤200 lines/file).
 *
 * IT-01 is the BUG REPRODUCTION: before the ReindexSubscriber existed, a late
 * `connected` event never refreshed `mcp_tools`, so find_tools could not discover
 * the server's tools. It now asserts the fixed behaviour (tools become discoverable).
 */
import pino from 'pino';
import { makeTempDb, type TempDb } from '../../src/__tests__/sa4e-testkit.js';
import { PerServerTaskQueue } from '../../src/modules/orchestration/reindex/PerServerTaskQueue.js';
import { ReindexActionMapper } from '../../src/modules/orchestration/reindex/ReindexActionMapper.js';
import { ReindexService } from '../../src/modules/orchestration/reindex/ReindexService.js';
import { ReindexSubscriber } from '../../src/modules/orchestration/reindex/ReindexSubscriber.js';
import {
  FakeEmbedder,
  FakeEventSource,
  FakeToolSource,
} from '../../src/modules/orchestration/reindex/__tests__/reindex-fakes.js';
import type { IEmbedder } from '../../src/modules/orchestration/reindex/models/ports.js';

export const silent = pino({ level: 'silent' });

/** Embedder that adds latency so a re-index stays in flight (IT-07/BR-09). */
export class SlowEmbedder implements IEmbedder {
  constructor(private readonly delayMs: number) {}
  async generateEmbedding(text: string): Promise<number[]> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    const v = [0, 0, 0, 0];
    for (let i = 0; i < text.length; i++) v[i % 4] += text.charCodeAt(i) / 255;
    return v;
  }
}

export interface Harness {
  tmp: TempDb;
  adapter: any;
  src: FakeToolSource;
  source: FakeEventSource;
  sub: ReindexSubscriber;
}

export async function harness(): Promise<Harness> {
  const tmp = await makeTempDb();
  const adapter = tmp.dbManager.getAdapter();
  const src = new FakeToolSource();
  const source = new FakeEventSource();
  const service = new ReindexService(() => adapter, new FakeEmbedder(), src, silent);
  const sub = new ReindexSubscriber(source, service, new PerServerTaskQueue(silent, 0), new ReindexActionMapper(), silent, 0);
  sub.start();
  return { tmp, adapter, src, source, sub };
}

export async function names(adapter: any, server: string): Promise<string[]> {
  const rows = await adapter.allAsync<{ name: string }>('SELECT name FROM mcp_tools WHERE server = ? ORDER BY name', [server]);
  return rows.map(r => r.name);
}

export async function seed(adapter: any, server: string | null, name: string): Promise<void> {
  await adapter.runAsync('INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)', [name, `${name} d`, '{}', server ?? 'memory', server, null]);
}

export async function waitForName(adapter: any, server: string, name: string, timeoutMs = 5000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const rows = await adapter.allAsync<{ name: string }>('SELECT name FROM mcp_tools WHERE server = ?', [server]);
    if (rows.some(r => r.name === name)) return true;
    await new Promise(r => setTimeout(r, 25));
  }
  return false;
}
