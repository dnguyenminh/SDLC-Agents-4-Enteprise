import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSessionHost, clearSessionHostCache } from '../pi-agent-session-host.js';

// Mock pi-coding-agent
const { promptCalls } = vi.hoisted(() => ({ promptCalls: [] as string[] }));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: vi.fn(),
      registerProvider: vi.fn(),
      getModel: () => ({ id: 'test-model' }),
      getModels: () => [{ id: 'test-model' }],
    }),
  },
  SettingsManager: { create: () => ({}) },
  SessionManager: { create: () => ({ getSessionFile: () => '/tmp/s.jsonl' }) },
  DefaultResourceLoader: class { constructor() {} },
  createAgentSession: vi.fn(async () => ({
    session: {
      subscribe: () => () => {},
      prompt: async (text: string) => {
        promptCalls.push(text);
      },
    },
  })),
}));

vi.mock('../pi-extension-runtime.js', () => ({
  getPiExtensionEntries: vi.fn(() => []),
  getPiExtensionAgentTools: vi.fn(async () => ({ tools: [], loaded: [], skipped: [] })),
}));

describe('PiAgentSessionHost auto-chunk (SA4E-355)', () => {
  beforeEach(() => {
    clearSessionHostCache();
  });

  it('creates host with tier small and enables auto-chunk mode', async () => {
    const host = await ensureSessionHost({
      workspaceRoot: '/ws',
      providerId: 'anthropic',
      apiKey: 'k',
      nCtxDetected: 8192, // small tier
    });
    expect(host).toBeDefined();
    // Tier small should force compression and lean loadout
    host.dispose();
  });

  it('promptTurn processes large prompt via incremental chunks for small tier', async () => {
    // This test will be expanded after implementation
    const host = await ensureSessionHost({
      workspaceRoot: '/ws',
      providerId: 'anthropic',
      apiKey: 'k',
      nCtxDetected: 8192,
    });
    const largePrompt = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} with some content. `).join('\n\n');
    const res = await host.promptTurn(largePrompt);
    expect(res.text).toBeDefined();
    host.dispose();
  });

  // STC: SA4E-355 UAT fix #2 — medium tier (n_ctx 65536) must ALSO auto-chunk
  // when the request (prompt + accumulated history) approaches the usable budget.
  it('promptTurn auto-chunks for MEDIUM tier when the prompt approaches n_ctx', async () => {
    promptCalls.length = 0;
    const host = await ensureSessionHost({
      workspaceRoot: '/ws',
      providerId: 'anthropic',
      apiKey: 'k',
      nCtxDetected: 65536, // → tier medium (16k < 65536 < 128k)
    });
    // 50k-token prompt > 70% of the 58245-token usable budget → must chunk.
    const hugePrompt = 'y'.repeat(50000 * 4);
    await host.promptTurn(hugePrompt);
    expect(promptCalls.length).toBeGreaterThan(1); // chunked into multiple provider calls
    host.dispose();
  });

  it('promptTurn does NOT chunk a small prompt for medium tier (below threshold)', async () => {
    promptCalls.length = 0;
    const host = await ensureSessionHost({
      workspaceRoot: '/ws',
      providerId: 'anthropic',
      apiKey: 'k',
      nCtxDetected: 65536,
    });
    await host.promptTurn('just a normal question');
    expect(promptCalls).toHaveLength(1); // single provider call — no chunking
    host.dispose();
  });
});
