/**
 * SA4E-42 UT-20..27 — ReindexSubscriber: lifecycle, routing, guards, memory-not-ready,
 * slow-warn, and F-03 bounded error logging (IR-1/2/7/8, BR-06/10, UC-04 EF-1).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import type Database from 'better-sqlite3';
import { makeTempDb, type TempDb } from '../../../../__tests__/sa4e-testkit.js';
import { ReindexActionMapper } from '../ReindexActionMapper.js';
import { PerServerTaskQueue } from '../PerServerTaskQueue.js';
import { ReindexService } from '../ReindexService.js';
import { ReindexSubscriber } from '../ReindexSubscriber.js';
import { SqliteDbAdapter } from '../../../memory/task-queue/SqliteDbAdapter.js';
import { FakeEmbedder, FakeEventSource, FakeToolSource } from './reindex-fakes.js';

const silent = pino({ level: 'silent' });

function subscriberWith(service: any, logger: any = silent) {
  const source = new FakeEventSource();
  const queue = new PerServerTaskQueue(logger, 0);
  const sub = new ReindexSubscriber(source, service, queue, new ReindexActionMapper(), logger, 0);
  return { source, sub };
}

describe('ReindexSubscriber', () => {
  it('UT-20: start subscribes and retains Unsubscribe; stop releases it', () => {
    const { source, sub } = subscriberWith({});
    sub.start();
    expect(source.listenerCount).toBe(1);
    sub.stop();
    expect(source.listenerCount).toBe(0);
    expect(source.unsubscribeCount).toBe(1);
  });

  it('UT-21: connected enqueues an ingest task', async () => {
    const service = { reindexConnected: vi.fn(async () => {}), reindexRemoved: vi.fn(async () => {}) };
    const { source, sub } = subscriberWith(service);
    sub.start();
    source.emit('S', 'connected');
    await sub.settle('S');
    expect(service.reindexConnected).toHaveBeenCalledWith('S');
    expect(service.reindexRemoved).not.toHaveBeenCalled();
  });

  it('UT-22: disconnected enqueues a remove task', async () => {
    const service = { reindexConnected: vi.fn(async () => {}), reindexRemoved: vi.fn(async () => {}) };
    const { source, sub } = subscriberWith(service);
    sub.start();
    source.emit('S', 'disconnected');
    await sub.settle('S');
    expect(service.reindexRemoved).toHaveBeenCalledWith('S');
  });

  it('UT-23: unhealthy/reconnecting enqueue nothing', async () => {
    const service = { reindexConnected: vi.fn(async () => {}), reindexRemoved: vi.fn(async () => {}) };
    const { source, sub } = subscriberWith(service);
    sub.start();
    source.emit('S', 'unhealthy');
    source.emit('S', 'reconnecting');
    await sub.settle('S');
    expect(service.reindexConnected).not.toHaveBeenCalled();
    expect(service.reindexRemoved).not.toHaveBeenCalled();
  });

  it('UT-27: handler error is logged bounded (≤500 chars, message-only, allowlisted)', async () => {
    const warn = vi.fn();
    const longErr = 'x'.repeat(900) + '\n/secret/path/stack';
    const service = { reindexConnected: async () => { throw new Error(longErr); } };
    const { source, sub } = subscriberWith(service, { warn, info: vi.fn() });
    sub.start();
    source.emit('S', 'connected');
    await sub.settle('S');
    expect(warn).toHaveBeenCalledTimes(1);
    const [fields] = warn.mock.calls[0];
    expect(fields.err.length).toBeLessThanOrEqual(500);
    expect(fields.err).not.toContain('\n');
    expect(Object.keys(fields).sort()).toEqual(['err', 'phase', 'server']);
  });
});

describe('ReindexSubscriber — service-integrated (UT-24/25/26)', () => {
  let tmp: TempDb;
  let db: Database.Database;
  beforeEach(() => { tmp = makeTempDb(); db = tmp.dbManager.getDb(); });
  afterEach(() => tmp.close());

  it('UT-24: memory not ready → skip + warn, no throw', async () => {
    const warn = vi.fn();
    const src = new FakeToolSource();
    src.setTools('S', ['t1']);
    src.setConnected('S', true);
    const service = new ReindexService(() => null, new FakeEmbedder(), src, { info: vi.fn(), warn } as any);
    const source = new FakeEventSource();
    const sub = new ReindexSubscriber(source, service, new PerServerTaskQueue(silent, 0), new ReindexActionMapper(), silent, 0);
    sub.start();
    source.emit('S', 'connected');
    await sub.settle('S');
    expect(warn).toHaveBeenCalled();
  });

  it('UT-25: stale connected for a not-connected server writes nothing', async () => {
    const src = new FakeToolSource();
    src.setTools('S', ['t1']);
    src.setConnected('S', false); // client manager says NOT connected
    const service = new ReindexService(() => new SqliteDbAdapter(db), new FakeEmbedder(), src, silent);
    const source = new FakeEventSource();
    const sub = new ReindexSubscriber(source, service, new PerServerTaskQueue(silent, 0), new ReindexActionMapper(), silent, 0);
    sub.start();
    source.emit('S', 'connected');
    await sub.settle('S');
    const count = (db.prepare('SELECT COUNT(*) c FROM mcp_tools WHERE server = ?').get('S') as any).c;
    expect(count).toBe(0);
  });

  it('UT-26: elapsed > target logs "exceeded target" but still indexes', async () => {
    const warn = vi.fn();
    const src = new FakeToolSource();
    src.setTools('S', ['t1']);
    src.setConnected('S', true);
    const now = vi.spyOn(Date, 'now');
    now.mockReturnValueOnce(0).mockReturnValue(6000); // start=0, end=6000ms
    const service = new ReindexService(() => new SqliteDbAdapter(db), new FakeEmbedder(), src, { info: vi.fn(), warn } as any);
    await service.reindexConnected('S');
    now.mockRestore();
    const count = (db.prepare('SELECT COUNT(*) c FROM mcp_tools WHERE server = ?').get('S') as any).c;
    expect(count).toBe(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ server: 'S' }),
      expect.stringContaining('exceeded target'),
    );
  });
});
