/**
 * SA4E-355 Task 7 (UC-07) — turn-1 integration via the REAL session host.
 * Full chain: resolveContextBudget → tier → overrides → gate → createAgentSession.
 * STC-011 (qwen 32k ALLOW), STC-012 (WARN proceeds), STC-309 (detect→assembly order).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    loaderOpts: undefined as Record<string, unknown> | undefined,
    contextFiles: [] as Array<{ path: string; content: string }>,
    createSession: vi.fn(async () => ({
      session: { subscribe: () => () => undefined, prompt: async () => undefined, dispose: () => undefined },
    })),
  },
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-gov-turn1',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: async () => undefined,
      registerProvider: () => undefined,
      getModel: (_p: string, m: string) => ({ id: m, contextWindow: 32768 }),
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

// STC: STC-011 — qwen 32k turn 1 ALLOW: exact budget, session created, prompt delivered
// STC: STC-012 — WARN (85-95%): session proceeds with warning (AF-1 UC-05)
// STC: STC-309 — detected n_ctx flows into assembly (source=provider at createHost)

let id = 0;

/** Creates a host with the given detected window and seeded context files. */
async function turn1Host(
  nCtxDetected?: number,
  files: Array<{ path: string; content: string }> = []
) {
  mocks.contextFiles.length = 0;
  mocks.contextFiles.push(...files);
  return ensureSessionHost({
    tabId: 'tab-1',
    workspaceRoot: `C:/ws/gov-turn1-${++id}`,
    providerId: 'p',
    configuredModelId: 'qwen',
    role: 'DEV',
    phase: 'implementation',
    nCtxDetected,
  });
}

/** Finds a logger.info call payload by event code. */
function loggedInfo(code: string): Record<string, unknown> | undefined {
  const call = (logger.info as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === code);
  return call?.[1] as Record<string, unknown> | undefined;
}

describe('Context governance turn-1 integration (SA4E-355 Task 7)', () => {
  beforeEach(() => {
    clearSessionHostCache();
    mocks.loaderOpts = undefined;
    vi.clearAllMocks();
  });

  it('STC-011: qwen 32k turn 1 ALLOW — exact budget, session created once', async () => {
    const host = await turn1Host(32768);
    expect(loggedInfo('Context budget resolved')).toMatchObject({
      modelId: 'qwen', nCtx: 32768, reserveOutput: 2048,
      safetyMargin: 2622, staticBudget: 19668, historyBudget: 8430,
    });
    const decision = loggedInfo('PI_GATE_DECISION');
    expect(decision).toMatchObject({ decision: 'ALLOW', escalations: [] });
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it('STC-011: promptTurn delivers the user message to the session', async () => {
    const host = await turn1Host(32768);
    const result = await host.promptTurn('Hãy review source code');
    expect(result).toMatchObject({ text: expect.any(String), toolCalls: expect.any(Array) });
    host.dispose();
  });

  it('STC-012: WARN proceeds — session created and PI_GATE_WARN logged', async () => {
    const host = await turn1Host(10000, [{ path: '/ws/big.md', content: 'x'.repeat(20000) }]);
    const decision = loggedInfo('PI_GATE_DECISION');
    expect(decision?.decision).toBe('WARN');
    expect((logger.warn as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toContain('PI_GATE_WARN');
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it('STC-309: detected n_ctx reaches assembly (source=provider in budget log)', async () => {
    const host = await turn1Host(32768);
    expect(loggedInfo('Context budget resolved')).toMatchObject({ nCtx: 32768, source: 'provider' });
    host.dispose();
  });
});
