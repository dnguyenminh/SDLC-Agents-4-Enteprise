/**
 * SA4E-355 Task 7 (UC-07) — full-flow matrix via REAL modules.
 * STC-111 (65,536: resolver + gate + tier in one flow), STC-016 (3 sizes),
 * STC-017 (SM regression), tier spot-check, STC-600 (perf), STC-603 (hygiene).
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
  getAgentDir: () => '/tmp/pi-gov-matrix',
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
import { BudgetCalculator, ThresholdGate } from '../../mcp/context-budget';
import { resolveContextBudget } from '../context-budget-resolver.js';
import { RoleScopeFilter } from '../role-scope.js';
import { buildSessionToolLoadout, nameTools } from '../tool-loadout.js';
import { runSessionBudgetGate } from '../session-budget-gate.js';
import {
  ensureSessionHost, clearSessionHostCache,
  resolveSessionTier,
} from '../../pi-workflow/pi-agent-session-host.js';

// STC: STC-111 — 65536 budget scales: exact math + gate + tier(medium) in one flow
// STC: STC-016 — 8k/32k/128k: total prompt <= usable, never REJECT after governance
// STC: STC-017 — SM full pipeline keeps essential tools (BR-06)
// STC: STC-600 — resolution + gate < 50 ms avg and p95 (in-process, no I/O)
// STC: STC-603 — error/log surface carries counts only — no paths, contents, secrets

let id = 0;

/** Latest PI_GATE_DECISION payload from the mocked logger. */
function gateDecision(): Record<string, unknown> | undefined {
  const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'PI_GATE_DECISION');
  return calls.at(-1)?.[1] as Record<string, unknown> | undefined;
}

describe('Governance matrix + full flow (SA4E-355 Task 7)', () => {
  beforeEach(() => {
    clearSessionHostCache();
    mocks.contextFiles.length = 0;
    vi.clearAllMocks();
  });

  it('STC-111: 65,536 scales automatically — resolver + gate + tier in one flow', async () => {
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 65536 });
    expect(budget).toMatchObject({
      nCtx: 65536, reserveOutput: 2048, safetyMargin: 5243,
      staticBudget: 40771, historyBudget: 17474,
    });
    expect(budget.staticBudget + budget.historyBudget).toBe(58245);
    expect(resolveSessionTier(budget.nCtx)).toBe('medium');
    const host = await ensureSessionHost({
      workspaceRoot: `C:/ws/gov-111-${++id}`, providerId: 'p',
      configuredModelId: 'qwen', nCtxDetected: 65536,
    });
    expect(gateDecision()).toMatchObject({ decision: 'ALLOW' });
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it.each([
    { nCtx: 8192, usable: 5488 },
    { nCtx: 32768, usable: 28098 },
    { nCtx: 128000, usable: 101376 },
  ])('STC-016: nCtx=$nCtx — total prompt <= usable $usable, never REJECT', async ({ nCtx, usable }) => {
    const modelId = nCtx === 128000 ? 'gpt-4o-mini' : 'qwen';
    const host = await ensureSessionHost({
      workspaceRoot: `C:/ws/gov-016-${nCtx}-${++id}`, providerId: 'p',
      configuredModelId: modelId, role: 'DEV', phase: 'implementation', nCtxDetected: nCtx,
    });
    const decision = gateDecision();
    expect(decision?.decision).not.toBe('REJECT');
    expect(decision?.staticTokens as number).toBeLessThanOrEqual(usable);
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it('STC-017: SM regression — essential skills kept, core tools in allowlist', async () => {
    const skills = [
      { id: 'sm-orchestrator' }, { id: 'brd-writer' }, { id: 'sprint-planner' },
      { id: 'backlog-groomer' }, { id: 'coordination-hub' }, { id: 'dev-code-generator' },
    ];
    const kept = new RoleScopeFilter().filterSkills('SM', skills);
    expect(kept.map((s) => s.id)).toEqual(expect.arrayContaining([
      'sm-orchestrator', 'brd-writer', 'sprint-planner', 'backlog-groomer', 'coordination-hub',
    ]));
    const loadout = buildSessionToolLoadout({ role: 'SM', mcpTools: nameTools(['jira_get_issue']) });
    expect(loadout.loadout).toEqual(expect.arrayContaining(['read', 'find_tools', 'jira_get_issue']));
    const host = await ensureSessionHost({
      workspaceRoot: `C:/ws/gov-017-${++id}`, providerId: 'p',
      configuredModelId: 'qwen', role: 'SM', nCtxDetected: 32768,
    });
    const tools = (mocks.createSession.mock.calls[0][0] as { tools: string[] }).tools;
    expect(tools).toEqual(expect.arrayContaining(['read', 'write', 'edit']));
    host.dispose();
  });

  it('tier spot-check: small forces compression, medium surplus passes through', async () => {
    const small = await ensureSessionHost({
      workspaceRoot: `C:/ws/gov-small-${++id}`, providerId: 'p',
      configuredModelId: 'qwen', nCtxDetected: 8192,
    });
    expect(logger.info).toHaveBeenCalledWith('PI_COMPRESSION_ENABLED', expect.objectContaining({ tier: 'small' }));
    small.dispose();
    vi.clearAllMocks();
    const medium = await ensureSessionHost({
      workspaceRoot: `C:/ws/gov-medium-${++id}`, providerId: 'p',
      configuredModelId: 'qwen', nCtxDetected: 32768,
    });
    expect(logger.info).not.toHaveBeenCalledWith('PI_COMPRESSION_ENABLED', expect.anything());
    medium.dispose();
  });

  it('STC-600: budget resolution + gate average and p95 stay under 50 ms', () => {
    const inputs = ['qwen', 'llama3.1', 'gpt-4o-mini', 'llama-unknown', ''];
    const windows: Array<number | undefined> = [8192, 32768, 128000, 65536, 0, NaN, undefined];
    const samples: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const start = performance.now();
      const budget = resolveContextBudget({
        modelId: inputs[i % inputs.length], nCtxDetected: windows[i % windows.length],
      });
      const measured = BudgetCalculator.calculateBudget(budget.nCtx, { toolSchemaTokens: 7000 });
      ThresholdGate.evaluate(measured.usagePercent);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const avg = samples.reduce((s, v) => s + v, 0) / samples.length;
    expect(avg).toBeLessThan(50);
    expect(samples[Math.floor(samples.length * 0.95)]).toBeLessThan(50);
  });

  it('STC-603: error/log surface carries counts only — no paths, contents, secrets', () => {
    const huge = 'w'.repeat(4 * 60000);
    const budget = resolveContextBudget({ modelId: 'llama3.1', nCtxDetected: 8192 });
    expect(() => runSessionBudgetGate(budget, {
      loadFiles: () => [{ content: huge }], workspacePrompt: 'p',
      toolSchemaTokens: 10, minToolSchemaTokens: 5, shouldCompress: false,
    })).toThrow(/^PI_CONTEXT_BUDGET_EXCEEDED/);
    const corpus = JSON.stringify([
      (logger.error as ReturnType<typeof vi.fn>).mock.calls,
      (logger.warn as ReturnType<typeof vi.fn>).mock.calls,
      (logger.info as ReturnType<typeof vi.fn>).mock.calls,
    ]);
    expect(corpus).not.toMatch(/[A-Za-z]:\\|\/home\/|\/Users\/|sk-[A-Za-z0-9]|secret|password|api[_-]?key/i);
    expect(corpus).toMatch(/PI_CONTEXT_BUDGET_EXCEEDED/);
  });
});
