/**
 * SA4E-355 Task 7 (UC-07) — escalation ladder via the REAL session host.
 * Moderate over-budget fits after compression (no over-escalation); dense
 * over-budget fires all three steps in fixed order with re-measure logs.
 * STC-110 (success stops the ladder), STC-205 (fixed order), STC-306 (minimal ladder).
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
  getAgentDir: () => '/tmp/pi-gov-escalation',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: async () => undefined,
      registerProvider: () => undefined,
      getModel: (_p: string, m: string) => ({ id: m, contextWindow: 16384 }),
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

import { logger } from '../../logger';
import { ensureSessionHost, clearSessionHostCache } from '../../pi-workflow/pi-agent-session-host.js';

// STC: STC-110 — compression alone suffices → ALLOW, steps 2-3 never fired
// STC: STC-205 — dense fixture → compress → drop-steering → min-loadout, in order
// STC: STC-306 — ladder is minimal: re-measure logged after EACH fired step only

let id = 0;

/** Just-over-budget static at nCtx 16385 (medium tier, staticBudget 9118).
 * Pre-measure (~8.4k) stays under the share so the provisional flag is false;
 * the gate's SDK-base share then pushes over and ladder step 1 (compress)
 * alone brings it back — steps 2-3 never fire. */
function compressibleStatic(): void {
  const prose = 'Governance prose line that survives compression.\n'.repeat(500);
  const strippable = [
    `<!--${' note'.repeat(1000)} -->`,
    'Tip: boilerplate line to strip\n'.repeat(65),
  ].join('\n');
  mocks.contextFiles.length = 0;
  mocks.contextFiles.push({ path: '/ws/guide.md', content: `${prose}\n${strippable}` });
}

/** Ordered escalation step codes from the PI_GATE_ESCALATION info logs. */
function escalationSteps(): string[] {
  return (logger.info as ReturnType<typeof vi.fn>).mock.calls
    .filter((c) => c[0] === 'PI_GATE_ESCALATION')
    .map((c) => (c[1] as { step: string }).step);
}

describe('Escalation ladder integration (SA4E-355 Task 7)', () => {
  beforeEach(() => {
    clearSessionHostCache();
    vi.clearAllMocks();
  });

  it('STC-110/306: compression suffices → ALLOW, later steps never fired', async () => {
    compressibleStatic();
    const host = await ensureSessionHost({
      tabId: 'tab-1', workspaceRoot: `C:/ws/gov-esc-ok-${++id}`, providerId: 'p',
      configuredModelId: 'qwen', role: 'DEV', phase: 'implementation', nCtxDetected: 16385,
    });
    expect(escalationSteps()).toEqual(['compress']);
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it('STC-205: dense over-budget fires all three steps in fixed order', async () => {
    mocks.contextFiles.length = 0;
    mocks.contextFiles.push({ path: '/ws/dense.md', content: 'z'.repeat(60000) });
    await expect(
      ensureSessionHost({
        tabId: 'tab-1', workspaceRoot: `C:/ws/gov-esc-full-${++id}`, providerId: 'p',
        configuredModelId: 'qwen', nCtxDetected: 16384,
      })
    ).rejects.toThrow(/^PI_CONTEXT_BUDGET_EXCEEDED/);
    expect(escalationSteps()).toEqual(['compress', 'drop-steering', 'min-loadout']);
  });
});
