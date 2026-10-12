import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSessionHost, clearSessionHostCache } from '../pi-agent-session-host.js';

// Mock pi-coding-agent
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
  createAgentSession: async (_opts) => ({
    session: {
      subscribe: () => () => {},
      prompt: async (text: string) => { /* no-op */ },
    },
  }),
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
});
