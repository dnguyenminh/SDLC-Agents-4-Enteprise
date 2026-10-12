/**
 * SA4E-355 Task 7 (UC-07) — E2E-API via a REAL in-test HTTP provider server.
 * Simulated OpenAI-compatible server (meta.n_ctx) + real fetch detection +
 * the REAL session host (SDK mocked at the boundary; session.prompt performs a
 * real HTTP round-trip). STC-700 (turn-1 32k), STC-701 (no meta → fallback),
 * STC-702 (three sizes through the provider layer).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { createServer, type Server } from 'node:http';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    loaderOpts: undefined as Record<string, unknown> | undefined,
    contextFiles: [] as Array<{ path: string; content: string }>,
    createSession: vi.fn(),
    listeners: [] as Array<(e: unknown) => void>,
  },
}));

const sim = { nCtx: 32768 as number | undefined, chatCalls: [] as Array<{ promptChars: number; raw: string }> };
let server: Server;
let baseUrl = '';

/** Reads one JSON body from the incoming request. */
function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => resolve(body));
  });
}

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-gov-e2e',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: async () => undefined,
      registerProvider: () => undefined,
      getModel: (_p: string, m: string) => ({ id: m }),
      getModels: () => [],
    }),
  },
  SettingsManager: { create: () => ({}) },
  SessionManager: { create: () => ({ getSessionFile: () => undefined }) },
  DefaultResourceLoader: class {
    constructor(opts: Record<string, unknown>) {
      mocks.loaderOpts = opts;
    }
  },
  createAgentSession: (...a: unknown[]) => mocks.createSession(...a),
  loadProjectContextFiles: () => mocks.contextFiles,
}));

vi.mock('../../pi-workflow/pi-extension-runtime.js', () => ({
  getPiExtensionEntries: vi.fn(() => []),
  getPiExtensionAgentTools: vi.fn(async () => ({ tools: [], loaded: [], skipped: [] })),
}));

vi.mock('../../logger', () => ({
  logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { logger } from '../../logger';
import { ensureSessionHost, clearSessionHostCache } from '../../pi-workflow/pi-agent-session-host.js';

// STC: STC-700 — oversized static on 32k: NO exceed_context_size_error, turn + tool call complete
// STC: STC-701 — provider without meta.n_ctx: registry fallback, transparent turn
// STC: STC-702 — 8k/32k/128k through the provider layer: fits budget, tier behaviors hold

let id = 0;

/** Real HTTP detection of meta.n_ctx (unmocked fetch against the simulated server). */
async function detectNctx(): Promise<number | undefined> {
  const res = await fetch(`${baseUrl}/v1/models`);
  const json = (await res.json()) as { data?: Array<{ meta?: { n_ctx?: unknown } }> };
  const nCtx = json.data?.[0]?.meta?.n_ctx;
  return typeof nCtx === 'number' && Number.isFinite(nCtx) && nCtx > 0 ? Math.floor(nCtx) : undefined;
}

/** Oversized-but-governable static: ~19.6k raw tokens vs 32k staticBudget 19,668. */
function oversizedStatic(): void {
  const prose = 'Governance prose line that survives compression.\n'.repeat(170);
  const comment = `<!--${' internal note'.repeat(1800)} -->`;
  const fenced = `\`\`\`example\n${'sample code line\n'.repeat(1400)}\`\`\``;
  const tips = 'Tip: boilerplate line\n'.repeat(900);
  mocks.contextFiles.length = 0;
  mocks.contextFiles.push({ path: '/ws/guide.md', content: [prose, comment, fenced, tips].join('\n') });
}

describe('Context governance E2E-API (SA4E-355 Task 7)', () => {
  beforeAll(async () => {
    server = createServer(async (req, res) => {
      if (req.url === '/v1/models') {
        const meta = sim.nCtx === undefined ? {} : { meta: { n_ctx: sim.nCtx } };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ id: 'qwen', ...meta }] }));
        return;
      }
      if (req.url === '/v1/chat/completions' && req.method === 'POST') {
        const raw = await readBody(req);
        sim.chatCalls.push({ promptChars: raw.length, raw });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content: 'review ok' } }] }));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
    mocks.createSession.mockImplementation(async () => ({
      session: {
        subscribe: (listener: (e: unknown) => void) => {
          mocks.listeners.push(listener);
          return () => undefined;
        },
        prompt: async (text: string) => {
          await fetch(`${baseUrl}/v1/chat/completions`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ model: 'qwen', prompt: text }),
          });
          for (const emit of mocks.listeners.splice(0)) {
            emit({ type: 'tool_execution_start', toolCallId: 'call_1', toolName: 'read', args: {} });
            emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'review ok' } });
          }
        },
        dispose: () => undefined,
      },
    }));
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())));
  });

  beforeEach(() => {
    clearSessionHostCache();
    mocks.contextFiles.length = 0;
    mocks.listeners.length = 0;
    sim.chatCalls.length = 0;
    sim.nCtx = 32768;
    vi.clearAllMocks();
  });

  it('STC-700: turn-1 on 32k — no exceed_context_size_error, tool call completes', async () => {
    oversizedStatic();
    const host = await ensureSessionHost({
      workspaceRoot: `C:/ws/gov-e2e-700-${++id}`, providerId: 'p',
      configuredModelId: 'qwen', role: 'DEV', phase: 'implementation', nCtxDetected: await detectNctx(),
    });
    expect(logger.info).toHaveBeenCalledWith('Context budget resolved', expect.objectContaining({
      nCtx: 32768, reserveOutput: 2048, safetyMargin: 2622, staticBudget: 19668, historyBudget: 8430,
    }));
    const result = await host.promptTurn('Hãy review source code');
    expect(result.text).toBe('review ok');
    expect(result.toolCalls).toEqual([{ id: 'call_1', name: 'read', arguments: {} }]);
    expect(sim.chatCalls.length).toBeGreaterThanOrEqual(1);
    for (const call of sim.chatCalls) expect(Math.ceil(call.promptChars / 4)).toBeLessThanOrEqual(32768);
    expect(sim.chatCalls.map((c) => c.raw).join(' ')).not.toContain('exceed_context_size_error');
    host.dispose();
  });

  it('STC-701: no meta.n_ctx — registry fallback, turn transparently completes', async () => {
    sim.nCtx = undefined;
    expect(await detectNctx()).toBeUndefined();
    const host = await ensureSessionHost({
      workspaceRoot: `C:/ws/gov-e2e-701-${++id}`, providerId: 'p',
      configuredModelId: 'qwen', role: 'DEV', nCtxDetected: await detectNctx(),
    });
    expect(logger.warn).toHaveBeenCalledWith('PI_CONTEXT_DETECT_FALLBACK', expect.anything());
    expect(logger.info).toHaveBeenCalledWith('Context budget resolved', expect.objectContaining({ nCtx: 32768 }));
    const result = await host.promptTurn('Hãy review source code');
    expect(result.text).toBe('review ok');
    host.dispose();
  });

  it.each([8192, 32768, 128000])('STC-702: n_ctx=%i through the provider layer fits budget', async (nCtx) => {
    sim.nCtx = nCtx;
    const modelId = nCtx === 128000 ? 'gpt-4o-mini' : 'qwen';
    const host = await ensureSessionHost({
      workspaceRoot: `C:/ws/gov-e2e-702-${nCtx}-${++id}`, providerId: 'p',
      configuredModelId: modelId, role: 'DEV', nCtxDetected: await detectNctx(),
    });
    const result = await host.promptTurn('Hãy review source code');
    expect(result.text).toBe('review ok');
    expect(sim.chatCalls.length).toBeGreaterThanOrEqual(1);
    const infos = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
    const decision = infos.filter((c) => c[0] === 'PI_GATE_DECISION').at(-1)?.[1] as { decision: string };
    expect(decision.decision).not.toBe('REJECT');
    if (nCtx === 8192) {
      expect(logger.info).toHaveBeenCalledWith('PI_COMPRESSION_ENABLED', expect.objectContaining({ tier: 'small' }));
    }
    host.dispose();
  });
});
