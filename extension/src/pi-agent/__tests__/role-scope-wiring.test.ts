import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    loaderOpts: undefined as Record<string, unknown> | undefined,
    contextFiles: [] as Array<{ path: string; content: string }>,
  },
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-wiring-test',
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
  createAgentSession: async () => ({
    session: { subscribe: () => () => undefined, prompt: async () => undefined, dispose: () => undefined },
  }),
  loadProjectContextFiles: () => mocks.contextFiles,
}));

vi.mock('../../pi-workflow/pi-extension-runtime.js', () => ({
  getPiExtensionEntries: vi.fn(() => []),
  getPiExtensionAgentTools: vi.fn(async () => ({ tools: [], loaded: [], skipped: [] })),
}));

vi.mock('../../logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../logger';
import { ensureSessionHost, clearSessionHostCache } from '../../pi-workflow/pi-agent-session-host.js';

// STC: STC-006 (wiring) — skillsOverride applies RoleScopeFilter by role
// STC: STC-305 (wiring) — unknown/absent role fail-open keeps all skills
// STC: STC-202/EF-1 UC-02 (wiring) — override throws → fail-open to base + error log
// STC: UC-02 §6.1 — role/phase flow from SessionHostOptions into scopedSteering
// STC: UC-01 wiring — resolveContextBudget (Task 1) feeds staticBudget into the host

const EIGHT_SKILLS = [
  { name: 'ba-core-analysis' }, { name: 'brd-writer' }, { name: 'fsd-builder' },
  { name: 'requirement-tracer' }, { name: 'specification-checklist' }, { name: 'dev-code-generator' },
  { name: 'qa-stc-suite' }, { name: 'deploy-pipeline' },
];

const NINE_STEERING_FILES = [
  'phase-1-requirements.md', 'phase-2-specification.md', 'phase-3-design.md',
  'phase-4-test-planning.md', 'phase-5-implementation.md', 'phase-6-testing.md',
  'phase-7-deployment.md', 'shared-jira.md', 'shared-quality-gates.md',
];

function loaderOptsOf(): Record<string, unknown> {
  expect(mocks.loaderOpts).toBeTruthy();
  return mocks.loaderOpts!;
}

/** Creates a host for the given workspace id and returns the captured loader options. */
async function wiredHost(id: string, opts: { role?: string; phase?: string; nCtxDetected?: number } = {}) {
  const host = await ensureSessionHost({
    tabId: 'tab-' + id, workspaceRoot: 'C:/ws/' + id, providerId: 'p', configuredModelId: 'qwen', ...opts,
  });
  return { host, opts: loaderOptsOf() };
}

describe('PiAgentSessionHost role-scope wiring (SA4E-355 Task 2)', () => {
  beforeEach(() => {
    clearSessionHostCache();
    mocks.loaderOpts = undefined;
    mocks.contextFiles.length = 0;
    vi.clearAllMocks();
  });

  it('wires skillsOverride + appendSystemPromptOverride into DefaultResourceLoader', async () => {
    const { host, opts } = await wiredHost('wiring-presence');
    expect(typeof opts.skillsOverride).toBe('function');
    expect(typeof opts.appendSystemPromptOverride).toBe('function');
    expect(Array.isArray(opts.appendSystemPrompt)).toBe(true);
    host.dispose();
  });

  it('resolves the session budget in-host (Task 1 resolver wiring, UC-01)', async () => {
    const { host } = await wiredHost('wiring-budget');
    expect(logger.info).toHaveBeenCalledWith(
      'Context budget resolved',
      expect.objectContaining({ modelId: 'qwen', nCtx: 32768, staticBudget: 19668 })
    );
    host.dispose();
  });

  it('nCtxDetected option (adapter meta.n_ctx, BR-12) wins over the model catalog', async () => {
    const { host } = await wiredHost('wiring-ncx', { nCtxDetected: 65536 });
    expect(logger.info).toHaveBeenCalledWith(
      'Context budget resolved',
      expect.objectContaining({ nCtx: 65536, staticBudget: 40771 })
    );
    host.dispose();
  });

  it('STC-006 wiring: skillsOverride keeps only BA-token skills, order preserved', async () => {
    const { host, opts } = await wiredHost('wiring-ba', { role: 'BA' });
    const base = { skills: EIGHT_SKILLS.map((s) => ({ ...s })), diagnostics: [] };
    const out = (opts.skillsOverride as (b: typeof base) => typeof base)(base);
    expect(out.skills.map((s) => s.name)).toEqual([
      'ba-core-analysis',
      'brd-writer',
      'fsd-builder',
      'requirement-tracer',
      'specification-checklist',
    ]);
    expect(out.diagnostics).toBe(base.diagnostics);
    host.dispose();
  });

  it('STC-305 wiring: unknown role and absent role keep ALL skills (BR-07 fail-open)', async () => {
    const scoped = async (id: string, role?: string) => {
      const { host, opts } = await wiredHost(id, { role });
      const base = { skills: EIGHT_SKILLS.map((s) => ({ ...s })), diagnostics: [] };
      const out = (opts.skillsOverride as (b: typeof base) => typeof base)(base);
      host.dispose();
      return out.skills;
    };
    expect((await scoped('wiring-unknown-role', 'intern-x'))).toHaveLength(8);
    expect((await scoped('wiring-absent-role'))).toHaveLength(8); // adapter passes no role — no regression
  });

  it('UC-02 §6.1: role/phase flow into scopedSteering via appendSystemPromptOverride', async () => {
    const { host, opts } = await wiredHost('wiring-phase', { role: 'BA', phase: 'requirements' });
    const override = opts.appendSystemPromptOverride as (b: string[]) => string[];
    expect(override(NINE_STEERING_FILES)).toEqual([
      'phase-1-requirements.md',
      'shared-jira.md',
      'shared-quality-gates.md',
    ]);
    host.dispose();
  });

  it('STC-202/EF-1 wiring: a throwing override input fails open to base + error log', async () => {
    const { host, opts } = await wiredHost('wiring-failopen', { role: 'BA' });
    const poison = {
      get name(): string {
        throw new Error('poison skill');
      },
    };
    const base = { skills: [poison, { name: 'ba-core' }], diagnostics: [] };
    const out = (opts.skillsOverride as (b: typeof base) => typeof base)(base);
    expect(out).toBe(base); // fail-open: base returned unchanged
    expect(logger.error).toHaveBeenCalledWith(
      'PI_OVERRIDE_FAILED',
      expect.objectContaining({ context: 'skillsOverride' })
    );
    host.dispose();
  });
});
