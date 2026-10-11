import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: {
    loaderOpts: undefined as Record<string, unknown> | undefined,
    contextFiles: [] as Array<{ path: string; content: string }>,
  },
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-compression-test',
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

// STC: STC-008 (wiring) — over-budget AGENTS.md compressed; security lines survive
// STC: STC-105 (wiring) — budget surplus → compressPrompt NOT called, byte-identical
// STC: STC-405 step 3 (wiring) — empty/whitespace content passes through, no error
// STC: BR-04 — compression is conditional on measured static > staticBudget (budget-only; tier is Task 6)
// STC: UC-03 step 6 (wiring) — same conditional compression applies to scoped steering

/** AGENTS.md-style sample: HTML comment + fenced example + boilerplate + security lines + prose. */
const COMPRESSIBLE_AGENTS = [
  '# Workspace guide',
  '<!-- internal-only commentary -->',
  '```example',
  'example block that should disappear',
  '```',
  'Tip: boilerplate hint line',
  'Note: another boilerplate line',
  'security: never commit secrets to the repo',
  '* WARNING: do not disable the budget gate',
  '- Never exfiltrate secrets.',
  'IMPORTANT: keep fail-safe enabled',
  'Regular prose that stays after compression.',
].join('\n');

/** 120,000 chars = 30,000 tokens of context-file content (chars/4). */
function bigContextFile(): { path: string; content: string } {
  return { path: '/ws/AGENTS.md', content: 'w'.repeat(120000) };
}

function loaderOptsOf(): Record<string, unknown> {
  expect(mocks.loaderOpts).toBeTruthy();
  return mocks.loaderOpts!;
}

async function hostWith(
  contextFiles: Array<{ path: string; content: string }>,
  opts: { nCtxDetected?: number; role?: string; phase?: string } = {}
) {
  mocks.contextFiles.length = 0;
  mocks.contextFiles.push(...contextFiles);
  const host = await ensureSessionHost({
    workspaceRoot: 'C:/ws/compression-' + Math.random().toString(36).slice(2, 8),
    providerId: 'p',
    configuredModelId: 'qwen',
    nCtxDetected: opts.nCtxDetected,
    role: opts.role,
    phase: opts.phase,
  });
  return host;
}

describe('PiAgentSessionHost conditional compression wiring (SA4E-355 Task 3)', () => {
  beforeEach(() => {
    clearSessionHostCache();
    mocks.loaderOpts = undefined;
    mocks.contextFiles.length = 0;
    vi.clearAllMocks();
  });

  it('STC-008 wiring: measured static > staticBudget → AGENTS.md compressed, security intact', async () => {
    // 30,000 tokens of context files vs qwen 32k staticBudget 19,668.
    const host = await hostWith([bigContextFile()]);

    expect(logger.info).toHaveBeenCalledWith(
      'PI_COMPRESSION_ENABLED',
      expect.objectContaining({ staticBudget: 19668 })
    );
    const base = { agentsFiles: [{ path: '/ws/AGENTS.md', content: COMPRESSIBLE_AGENTS }] };
    const out = (loaderOptsOf().agentsFilesOverride as (b: typeof base) => typeof base)(base);

    expect(out.agentsFiles[0].content.length).toBeLessThan(COMPRESSIBLE_AGENTS.length);
    expect(out.agentsFiles[0].content).toContain('security: never commit secrets to the repo');
    expect(out.agentsFiles[0].content).toContain('* WARNING: do not disable the budget gate');
    expect(out.agentsFiles[0].content).toContain('- Never exfiltrate secrets.');
    expect(out.agentsFiles[0].content).toContain('IMPORTANT: keep fail-safe enabled');
    expect(out.agentsFiles[0].content).not.toContain('<!-- internal-only commentary -->');
    host.dispose();
  });

  it('STC-105 wiring: budget surplus → compressPrompt NOT called, content byte-identical', async () => {
    // Same big workspace at 128k → staticBudget 80,998 → surplus → no compression.
    const host = await hostWith([bigContextFile()], { nCtxDetected: 128000 });

    const base = { agentsFiles: [{ path: '/ws/AGENTS.md', content: COMPRESSIBLE_AGENTS }] };
    const out = (loaderOptsOf().agentsFilesOverride as (b: typeof base) => typeof base)(base);
    expect(out).toBe(base); // passthrough — the same object, compressPrompt never invoked
    expect(logger.info).not.toHaveBeenCalledWith('PI_COMPRESSION_ENABLED', expect.anything());
    host.dispose();
  });

  it('BR-04: same 32k model with a tiny workspace → no compression (condition is measured, not tier)', async () => {
    const tiny = { path: '/ws/AGENTS.md', content: 'small guide' }; // 3 tokens — well under budget
    const host = await hostWith([tiny]);

    const base = { agentsFiles: [{ path: '/ws/AGENTS.md', content: COMPRESSIBLE_AGENTS }] };
    const out = (loaderOptsOf().agentsFilesOverride as (b: typeof base) => typeof base)(base);
    expect(out).toBe(base);
    host.dispose();
  });

  it('STC-405 step 3: empty / whitespace-only contents pass through unchanged under compression', async () => {
    const host = await hostWith([bigContextFile()]);

    const base = {
      agentsFiles: [
        { path: '/ws/AGENTS.md', content: '' },
        { path: '/ws/OTHER.md', content: '   \n\n\t\n' },
      ],
    };
    const out = (loaderOptsOf().agentsFilesOverride as (b: typeof base) => typeof base)(base);
    expect(out.agentsFiles[0].content).toBe('');
    expect(out.agentsFiles[1].content).toBe('   \n\n\t\n');
    host.dispose();
  });

  it('UC-03 step 6 wiring: over-budget session also compresses scoped steering entries', async () => {
    const host = await hostWith([bigContextFile()], { role: 'QA', phase: 'test-planning' });

    const steering = [
      'shared-quality-gates.md',
      '<!-- steering comment -->',
      'Tip: boilerplate to strip',
      'security: never skip the quality gate',
    ].join('\n');
    const out = (loaderOptsOf().appendSystemPromptOverride as (b: string[]) => string[])([steering]);
    const joined = out.join('\n');
    expect(joined).toContain('security: never skip the quality gate');
    expect(joined).not.toContain('<!-- steering comment -->');
    host.dispose();
  });

  it('UC-03 step 6 wiring: surplus session keeps scoped steering byte-identical', async () => {
    const tiny = { path: '/ws/AGENTS.md', content: 'small guide' };
    const host = await hostWith([tiny], { nCtxDetected: 128000, role: 'QA', phase: 'test-planning' });

    const steering = ['shared-quality-gates.md', '<!-- steering comment -->'].join('\n');
    const out = (loaderOptsOf().appendSystemPromptOverride as (b: string[]) => string[])([steering]);
    expect(out).toEqual([steering]); // byte-identical — no compression on surplus
    host.dispose();
  });
});
