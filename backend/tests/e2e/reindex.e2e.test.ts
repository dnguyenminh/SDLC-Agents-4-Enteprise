/**
 * SA4E-42 API-01..04 — E2E-API tests over the real MCP protocol.
 *
 * Harness: connectMcp(registry) wires a REAL getMcpServer to an in-process MCP
 * Client. The registry holds a REAL OrchestrationModule (find_tools /
 * execute_dynamic_tool / orchestration_status handlers) + a memory module backed
 * by a REAL temp SQLite DB (makeTempDb). Late-connect / disconnect transitions are
 * driven by a fake event source + fake tool source (the ports the production
 * McpClientManager satisfies), writing to the SAME real DB the handlers read.
 *
 * ⛔ LIMITATION (documented, not faked away): the real OrchestrationModule builds
 * its McpClientManager internally and only registers a child server after a real
 * transport connection. The connectMcp harness cannot spawn a real child process,
 * so `orchestration_status.servers[].toolCount` (sourced from that live manager)
 * stays empty. API-04 therefore verifies the testable essence of BR-08 —
 * convergence of the persisted index (mcp_tools) with the connected tool count —
 * and that orchestration_status responds ready. Full status.toolCount convergence
 * needs the HTTP e2e harness with a real child (out of scope for connectMcp).
 */
import { describe, it, expect } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import pino from 'pino';
import { ModuleRegistry } from '../../src/modules/ModuleRegistry.js';
import { OrchestrationModule } from '../../src/modules/orchestration/OrchestrationModule.js';
import {
  StubModule, def, okHandler, silentLogger, connectMcp,
  makeTempDb, type McpHarness, type TempDb,
} from '../../src/__tests__/sa4e-testkit.js';
import { EmbeddingService } from '../../src/engine/parsers/embedding/EmbeddingService.js';
import { ReindexService } from '../../src/modules/orchestration/reindex/ReindexService.js';
import { ReindexSubscriber } from '../../src/modules/orchestration/reindex/ReindexSubscriber.js';
import { PerServerTaskQueue } from '../../src/modules/orchestration/reindex/PerServerTaskQueue.js';
import { ReindexActionMapper } from '../../src/modules/orchestration/reindex/ReindexActionMapper.js';
import { FakeToolSource, FakeEventSource } from '../../src/modules/orchestration/reindex/__tests__/reindex-fakes.js';
import type { IEmbedder } from '../../src/modules/orchestration/reindex/models/ports.js';

const silent = pino({ level: 'silent' });

/** Embedder that adds latency so a re-index stays in flight (API-03/BR-09). */
class SlowEmbedder implements IEmbedder {
  constructor(private readonly delayMs: number) {}
  async generateEmbedding(text: string): Promise<number[]> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    return [text.length, 0, 0, 0];
  }
}

interface E2EHarness {
  mcp: McpHarness;
  ctx: TempDb;
  orch: OrchestrationModule;
  src: FakeToolSource;
  source: FakeEventSource;
  sub: ReindexSubscriber;
  close(): Promise<void>;
}

function buildReindex(ctx: TempDb, src: FakeToolSource, embedder: IEmbedder) {
  const source = new FakeEventSource();
  const svc = new ReindexService(() => ctx.engine.getDb(), embedder, src, silent);
  const sub = new ReindexSubscriber(source, svc, new PerServerTaskQueue(silent, 0), new ReindexActionMapper(), silent, 0);
  sub.start();
  return { source, sub };
}

async function harness(embedder: IEmbedder): Promise<E2EHarness> {
  // Isolate workspace so OrchestrationModule does not load the real orchestration.json.
  process.env.CODE_INTEL_WORKSPACE = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e42-e2e-'));
  const ctx = makeTempDb();
  const registry = new ModuleRegistry(silentLogger());
  const handlers = new Map([['mem_admin', okHandler]]);
  registry.register(new StubModule('memory', [def('mem_admin', 'memory')], handlers, ctx.engine, 'ready'));
  const orch = new OrchestrationModule(silentLogger(), registry);
  await orch.initialize();
  registry.register(orch);
  const mcp = await connectMcp(registry);
  const src = new FakeToolSource();
  const { source, sub } = buildReindex(ctx, src, embedder);
  return {
    mcp, ctx, orch, src, source, sub,
    async close() { sub.stop(); await mcp.close(); await orch.shutdown(); ctx.close(); },
  };
}

function parse(res: any): any { return JSON.parse((res.content as any[])[0].text); }

async function findToolNames(mcp: McpHarness, query: string): Promise<any[]> {
  const res = await mcp.client.callTool({ name: 'find_tools', arguments: { query, top_k: 10 } });
  return parse(res).tools as any[];
}

describe('SA4E-42 E2E-API re-index (API-01..04)', () => {
  it('API-01: find_tools discovers a late-connected server tools', async () => {
    const h = await harness(EmbeddingService.getInstance());
    try {
      let tools = await findToolNames(h.mcp, 'jira create issue');
      expect(tools.some((t) => t.name === 'jira_create_issue')).toBe(false);
      h.src.setTools('atlassian', ['jira_create_issue', 'jira_search']);
      h.src.setConnected('atlassian', true);
      h.source.emit('atlassian', 'connected');
      await h.sub.settle('atlassian');
      tools = await findToolNames(h.mcp, 'jira create issue');
      const jira = tools.find((t) => t.name === 'jira_create_issue');
      expect(jira).toBeDefined();
      expect(jira.schema.type).toBe('object'); // valid, executable schema
    } finally { await h.close(); }
  });

  it('API-02: find_tools stops returning a disconnected server tools', async () => {
    const h = await harness(EmbeddingService.getInstance());
    try {
      h.src.setTools('atlassian', ['jira_create_issue']);
      h.src.setTools('markdown-exporter', ['export_docx']);
      h.src.setConnected('atlassian', true);
      h.src.setConnected('markdown-exporter', true);
      h.source.emit('atlassian', 'connected'); await h.sub.settle('atlassian');
      h.source.emit('markdown-exporter', 'connected'); await h.sub.settle('markdown-exporter');
      expect((await findToolNames(h.mcp, 'jira create issue')).some((t) => t.name === 'jira_create_issue')).toBe(true);
      h.src.setConnected('atlassian', false);
      h.source.emit('atlassian', 'disconnected'); await h.sub.settle('atlassian');
      const after = await findToolNames(h.mcp, 'export document');
      expect(after.some((t) => t.name === 'jira_create_issue')).toBe(false);
      expect(after.some((t) => t.name === 'export_docx')).toBe(true);
    } finally { await h.close(); }
  });

  it('API-03: execute_dynamic_tool succeeds during in-flight re-index (non-blocking)', async () => {
    const h = await harness(new SlowEmbedder(200));
    try {
      h.src.setTools('atlassian', ['a', 'b', 'c']);
      h.src.setConnected('atlassian', true);
      h.source.emit('atlassian', 'connected'); // slow re-index starts, not awaited
      const t0 = Date.now();
      const res = await h.mcp.client.callTool({
        name: 'execute_dynamic_tool', arguments: { toolName: 'mem_admin', arguments: { action: 'status' } },
      });
      const ms = Date.now() - t0;
      expect(res.isError).toBeFalsy();
      expect(ms).toBeLessThan(300); // returned before the ~600ms re-index finished
      await h.sub.settle('atlassian');
    } finally { await h.close(); }
  });

  it('API-04: index converges with connected tool count after settle (BR-08)', async () => {
    const h = await harness(EmbeddingService.getInstance());
    try {
      const names = ['jira_create_issue', 'jira_search', 'jira_get_issue'];
      h.src.setTools('atlassian', names);
      h.src.setConnected('atlassian', true);
      h.source.emit('atlassian', 'connected');
      await h.sub.settle('atlassian');
      const dbCount = (h.ctx.engine.getDb()
        .prepare("SELECT COUNT(*) AS c FROM mcp_tools WHERE server = 'atlassian'").get() as any).c;
      expect(dbCount).toBe(names.length); // converged: no stale, no missing
      const status = parse(await h.mcp.client.callTool({ name: 'orchestration_status', arguments: {} }));
      expect(status.status).toBe('ready');
    } finally { await h.close(); }
  });
});
