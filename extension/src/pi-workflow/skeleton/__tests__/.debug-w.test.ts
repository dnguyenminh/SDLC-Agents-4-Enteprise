import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const { mocks } = vi.hoisted(() => {
  const listener = { current: null as null | ((e: unknown) => void) };
  const session = {
    subscribe: (l: (e: unknown) => void) => {
      listener.current = l;
      return () => undefined;
    },
    prompt: async () => {
      listener.current?.({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'ok' } });
    },
    dispose: vi.fn(),
  };
  return {
    listener,
    mocks: {
      session,
      createAgentSession: vi.fn(async (opts: unknown) => ({ session })),
    },
  };
});

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-agent-test',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: vi.fn(),
      registerProvider: () => undefined,
      getModel: () => ({ id: 'qwen', contextWindow: 32768 }),
      getModels: () => [{ id: 'qwen' }],
    }),
  },
  SettingsManager: { create: () => ({}) },
  SessionManager: { create: () => ({ getSessionFile: () => '/tmp/s.jsonl' }) },
  DefaultResourceLoader: class {
    captured: Record<string, unknown>;
    constructor(opts: Record<string, unknown>) {
      this.captured = opts;
    }
  },
  createAgentSession: mocks.createAgentSession,
}));

import { ensureSessionHost, clearSessionHostCache } from '../../pi-agent-session-host.js';

describe('debug loader', () => {
  it('inspects the createAgentSession opts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dbg-w-'));
    const host = await ensureSessionHost({ workspaceRoot: root, providerId: 'anthropic', apiKey: 'k', configuredModelId: 'qwen', nCtxDetected: 32768 });
    const call = mocks.createAgentSession.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    console.log('CALL KEYS:', call ? Object.keys(call) : 'NO CALL');
    const rl = call?.resourceLoader as { captured?: Record<string, unknown> } | undefined;
    console.log('RL keys:', rl ? Object.keys(rl) : 'NO RL');
    console.log('RL captured keys:', rl?.captured ? Object.keys(rl.captured) : 'NO CAPTURED');
    console.log('customTools:', JSON.stringify((call?.customTools as Array<{ name: string }>)?.map((t) => t.name)));
    host.dispose();
    expect(true).toBe(true);
  });
});
