import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    loaderOpts: undefined as Record<string, unknown> | undefined,
    contextFiles: [] as Array<{ path: string; content: string }>,
  },
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-tier-test',
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
import { SMALL_CONTEXT_WINDOW_THRESHOLD } from '../model-router.js';
import {
  ensureSessionHost,
  clearSessionHostCache,
  resolveSessionTier,
  resolveShouldCompress,
  LARGE_CONTEXT_WINDOW_THRESHOLD,
} from '../../pi-workflow/pi-agent-session-host.js';

// STC: STC-013 — qwen 32768 NOT small → medium behaviors (OI-1 window-based primary)
// STC: STC-014 — 8192 → small (forced compression + max scoping + minimal loadout)
// STC: STC-015 — 128000 → large (no compression + full loadout)
// STC: STC-105 — surplus + medium/large → compressPrompt NOT called (Wave 2/3 preserved)
// STC: STC-106 — small tier forces compression even with surplus
// STC: STC-109 — window decides when name hint is null (qwen → medium)
// STC: STC-313 — boundary matrix 16384→small / 16385→large(not small) / 127999→medium / 128000→large

/** Compressible AGENTS.md sample (HTML comment + boilerplate + prose). */
const COMPRESSIBLE_AGENTS = [
  '# Workspace guide',
  '<!-- internal-only commentary -->',
  'Tip: boilerplate hint line',
  'Regular prose that stays after compression.',
].join('\n');

function loaderOptsOf(): Record<string, unknown> {
  expect(mocks.loaderOpts).toBeTruthy();
  return mocks.loaderOpts!;
}

async function hostWith(nCtxDetected: number) {
  mocks.contextFiles.length = 0;
  mocks.contextFiles.push({ path: '/ws/AGENTS.md', content: 'small guide' }); // ~3 tokens: surplus everywhere
  return ensureSessionHost({
    workspaceRoot: 'C:/ws/tier-' + Math.random().toString(36).slice(2, 8),
    providerId: 'p',
    configuredModelId: 'qwen',
    nCtxDetected,
  });
}

describe('SessionTier resolution from real nCtx (SA4E-355 Task 6, OI-1)', () => {
  it('uses SMALL_CONTEXT_WINDOW_THRESHOLD=16384 as the small/not-small cut', () => {
    expect(SMALL_CONTEXT_WINDOW_THRESHOLD).toBe(16384);
    expect(LARGE_CONTEXT_WINDOW_THRESHOLD).toBe(128000);
  });

  it('STC-313 boundary matrix on the resolved window', () => {
    expect(resolveSessionTier(16383)).toBe('small');
    expect(resolveSessionTier(16384)).toBe('small'); // <= threshold → small (classifyTier rule)
    expect(resolveSessionTier(16385)).toBe('medium'); // not small, below large floor
    expect(resolveSessionTier(32768)).toBe('medium'); // STC-013: qwen → medium
    expect(resolveSessionTier(127999)).toBe('medium');
    expect(resolveSessionTier(128000)).toBe('large'); // STC-015
    expect(resolveSessionTier(200000)).toBe('large');
  });

  it('fails safe to small on invalid windows (EF-1 UC-06)', () => {
    expect(resolveSessionTier(0)).toBe('small');
    expect(resolveSessionTier(-100)).toBe('small');
    expect(resolveSessionTier(NaN)).toBe('small');
    expect(resolveSessionTier(Infinity)).toBe('small');
  });

  it('BR-04 matrix: small forces compression on surplus; medium/large do not', () => {
    expect(resolveShouldCompress(100, 3841, 'small')).toBe(true); // STC-106: surplus + small → compress
    expect(resolveShouldCompress(100, 19668, 'medium')).toBe(false); // STC-105: surplus → byte-identical
    expect(resolveShouldCompress(100, 70963, 'large')).toBe(false);
    expect(resolveShouldCompress(9000, 3841, 'small')).toBe(true);
    expect(resolveShouldCompress(20000, 19668, 'medium')).toBe(true); // over-budget → compress any tier
    expect(resolveShouldCompress(80000, 70963, 'large')).toBe(true);
  });
});

describe('Tier wiring in session governance (SA4E-355 Task 6)', () => {
  beforeEach(() => {
    clearSessionHostCache();
    mocks.loaderOpts = undefined;
    mocks.contextFiles.length = 0;
    vi.clearAllMocks();
  });

  it('STC-106 wiring: 8k small tier compresses even though the workspace fits the budget', async () => {
    const host = await hostWith(8192); // staticBudget 3841 vs ~3 measured tokens → surplus
    expect(logger.info).toHaveBeenCalledWith('PI_COMPRESSION_ENABLED', expect.objectContaining({ tier: 'small' }));
    const base = { agentsFiles: [{ path: '/ws/AGENTS.md', content: COMPRESSIBLE_AGENTS }] };
    const out = (loaderOptsOf().agentsFilesOverride as (b: typeof base) => typeof base)(base);
    expect(out.agentsFiles[0].content.length).toBeLessThan(COMPRESSIBLE_AGENTS.length);
    expect(out.agentsFiles[0].content).not.toContain('<!-- internal-only commentary -->');
    host.dispose();
  });

  it('STC-313 wiring: 16384 → small (forced), 16385 → medium (passthrough on surplus)', async () => {
    const smallHost = await hostWith(16384);
    const base = { agentsFiles: [{ path: '/ws/AGENTS.md', content: COMPRESSIBLE_AGENTS }] };
    const smallOut = (loaderOptsOf().agentsFilesOverride as (b: typeof base) => typeof base)(base);
    expect(smallOut.agentsFiles[0].content.length).toBeLessThan(COMPRESSIBLE_AGENTS.length);
    smallHost.dispose();

    clearSessionHostCache();
    mocks.loaderOpts = undefined;
    const medHost = await hostWith(16385);
    const medOut = (loaderOptsOf().agentsFilesOverride as (b: typeof base) => typeof base)(base);
    expect(medOut).toBe(base); // surplus + medium → byte-identical
    medHost.dispose();
  });

  it('STC-013/STC-105 wiring: qwen 32768 → medium, surplus workspace stays byte-identical', async () => {
    const host = await hostWith(32768);
    expect(logger.info).not.toHaveBeenCalledWith('PI_COMPRESSION_ENABLED', expect.anything());
    const base = { agentsFiles: [{ path: '/ws/AGENTS.md', content: COMPRESSIBLE_AGENTS }] };
    const out = (loaderOptsOf().agentsFilesOverride as (b: typeof base) => typeof base)(base);
    expect(out).toBe(base);
    host.dispose();
  });

  it('STC-015 wiring: 128k large tier keeps full fidelity on surplus', async () => {
    const host = await hostWith(128000);
    expect(logger.info).not.toHaveBeenCalledWith('PI_COMPRESSION_ENABLED', expect.anything());
    const base = { agentsFiles: [{ path: '/ws/AGENTS.md', content: COMPRESSIBLE_AGENTS }] };
    const out = (loaderOptsOf().agentsFilesOverride as (b: typeof base) => typeof base)(base);
    expect(out).toBe(base);
    host.dispose();
  });
});
