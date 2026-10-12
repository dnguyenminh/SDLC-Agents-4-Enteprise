/**
 * SA4E-355 Task 7 (UC-07) — original-incident replay via the REAL session host.
 * Static context at the incident scale (67,468 tokens vs n_ctx 65,536) must be
 * REJECTed by the gate: actionable error, provider NEVER called (BR-09).
 * STC-206 (exact message), STC-207 (incident impossibility), STC-307 (spy control).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    contextFiles: [] as Array<{ path: string; content: string }>,
    createSession: vi.fn(async () => ({
      session: { subscribe: () => () => undefined, prompt: async () => undefined, dispose: () => undefined },
    })),
  },
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-gov-incident',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: async () => undefined,
      registerProvider: () => undefined,
      getModel: (_p: string, m: string) => ({ id: m, contextWindow: 65536 }),
      getModels: () => [],
    }),
  },
  SettingsManager: { create: () => ({}) },
  SessionManager: { create: () => ({ getSessionFile: () => undefined }) },
  DefaultResourceLoader: class {},
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

import { BudgetCalculator, ThresholdGate } from '../../mcp/context-budget';
import { ensureSessionHost, clearSessionHostCache } from '../../pi-workflow/pi-agent-session-host.js';

// STC: STC-207 — incident numbers intercepted: 67468 vs 65536 → 106.1% → REJECT
// STC: STC-206 — exact PI_CONTEXT_BUDGET_EXCEEDED message with N/M/K (BR-09)
// STC: STC-307 — provider call count zero after REJECT (ALLOW control proves the spy)

let id = 0;

/** Dense (poorly compressible) static at the incident scale — single file survives step 2. */
function incidentStatic(): void {
  mocks.contextFiles.length = 0;
  mocks.contextFiles.push({ path: '/ws/steering.md', content: 'x'.repeat(260000) });
}

describe('Original-incident replay (SA4E-355 Task 7)', () => {
  beforeEach(() => {
    clearSessionHostCache();
    vi.clearAllMocks();
  });

  it('STC-207: incident math — 67,468 vs 65,536 is 106.1% → REJECT, no 400 possible', () => {
    const measured = BudgetCalculator.calculateBudget(65536, { toolSchemaTokens: 67468, reserveTokens: 2048 });
    expect(measured.estimatedTokens).toBe(69516);
    expect(measured.usagePercent).toBeCloseTo(106.07, 1);
    expect(ThresholdGate.evaluate(measured.usagePercent).decision).toBe('REJECT');
  });

  it('STC-206/207: oversized static → REJECT with exact N/M/K message (BR-09)', async () => {
    incidentStatic();
    let thrown: unknown;
    try {
      await ensureSessionHost({
        workspaceRoot: `C:/ws/gov-incident-${++id}`, providerId: 'p',
        configuredModelId: 'qwen', role: 'DEV', phase: 'implementation', nCtxDetected: 65536,
      });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toMatch(
      /^PI_CONTEXT_BUDGET_EXCEEDED: static context \d+ tokens vượt budget 40771 cho model n_ctx=65536\./
    );
  });

  it('STC-307: provider NEVER called after REJECT; ALLOW control proves the spy', async () => {
    incidentStatic();
    await expect(
      ensureSessionHost({
        workspaceRoot: `C:/ws/gov-reject-${++id}`, providerId: 'p',
        configuredModelId: 'qwen', nCtxDetected: 65536,
      })
    ).rejects.toThrow(/^PI_CONTEXT_BUDGET_EXCEEDED/);
    expect(mocks.createSession).not.toHaveBeenCalled();
    mocks.contextFiles.length = 0; // small static → ALLOW control
    const host = await ensureSessionHost({
      workspaceRoot: `C:/ws/gov-allow-${++id}`, providerId: 'p',
      configuredModelId: 'qwen', nCtxDetected: 65536,
    });
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    host.dispose();
  });
});
