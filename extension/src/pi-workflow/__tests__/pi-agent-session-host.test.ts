import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mocks } = vi.hoisted(() => {
  const promptCalls: string[] = [];
  const setRuntimeApiKey = vi.fn(async (_p: string, _k: string) => undefined);
  let subscribed = 0;
  const mocks = {
    promptCalls,
    setRuntimeApiKey,
    sessionOpts: undefined as unknown,
    get subscribed() {
      return subscribed;
    },
    session: {
      subscribe: (listener: (e: unknown) => void) => {
        subscribed++;
        mocks.listener = listener;
        return () => undefined;
      },
      prompt: async (text: string) => {
        promptCalls.push(text);
        mocks.listener?.({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'session says hi' },
        });
      },
      dispose: vi.fn(),
    },
    listener: null as null | ((e: unknown) => void),
  };
  return { mocks };
});

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-agent-test',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: mocks.setRuntimeApiKey,
      registerProvider: () => undefined,
      getModel: (_p: string, _m: string) => ({ id: 'test-model' }),
      getModels: () => [{ id: 'test-model' }],
    }),
  },
  SettingsManager: { create: () => ({}) },
  SessionManager: {
    create: () => ({ getSessionFile: () => '/tmp/pi-agent-test/sessions/s1.jsonl' }),
  },
  DefaultResourceLoader: class {
    constructor(_opts: unknown) {
      void _opts;
    }
  },
  createAgentSession: async (opts: unknown) => {
    mocks.sessionOpts = opts;
    return { session: mocks.session };
  },
  createEventBus: () => ({}),
}));

vi.mock('../pi-extension-runtime.js', () => ({
  getPiExtensionEntries: vi.fn(() => []),
  getPiExtensionAgentTools: vi.fn(async () => ({
    tools: [{ name: 'compress' }, { name: 'read' }],
    loaded: ['x'],
    skipped: [],
  })),
}));

import { ensureSessionHost, clearSessionHostCache } from '../pi-agent-session-host.js';
import { getPiExtensionAgentTools } from '../pi-extension-runtime.js';

describe('PiAgentSessionHost (SA4E-334 Option A)', () => {
  beforeEach(() => {
    clearSessionHostCache();
    mocks.promptCalls.length = 0;
    mocks.setRuntimeApiKey.mockClear();
    mocks.session.dispose.mockClear();
  });

  it('promptTurn streams tokens and reports the session transcript file', async () => {
    const host = await ensureSessionHost({
      workspaceRoot: 'C:/ws/test',
      providerId: 'anthropic',
      apiKey: 'k',
      configuredModelId: 'm',
    });
    const tokens: string[] = [];
    const res = await host.promptTurn('hello', (t) => tokens.push(t));
    expect(mocks.promptCalls).toEqual(['hello']);
    expect(tokens.join('')).toContain('session says hi');
    expect(res.text).toContain('session says hi');
    expect(res.sessionFile).toContain('s1.jsonl');
    host.dispose();
    expect(mocks.session.dispose).toHaveBeenCalled();
  });

  it('caches the host per workspaceRoot', async () => {
    const a = await ensureSessionHost({ workspaceRoot: 'C:/ws/a', providerId: 'p', apiKey: 'k' });
    const b = await ensureSessionHost({ workspaceRoot: 'C:/ws/a', providerId: 'p', apiKey: 'k' });
    expect(a).toBe(b);
    a.dispose();
  });

  it('seeds a real key into the runtime store', async () => {
    const host = await ensureSessionHost({ workspaceRoot: 'C:/ws/keyed', providerId: 'anthropic', apiKey: 'sk-x' });
    expect(mocks.setRuntimeApiKey).toHaveBeenCalledWith('anthropic', 'sk-x');
    host.dispose();
  });

  it('registers get_workspace_info as a session custom tool', async () => {
    const host = await ensureSessionHost({ workspaceRoot: 'C:/ws/custom', providerId: 'p', apiKey: 'k' });
    const opts = mocks.sessionOpts as { customTools?: Array<{ name?: string }> };
    expect(opts.customTools?.map((t) => t.name)).toContain('get_workspace_info');
    host.dispose();
  });

  it('allowlist covers 7 builtins + discovered extensions + orientation (deduped)', async () => {
    const host = await ensureSessionHost({ workspaceRoot: 'C:/ws/allow', providerId: 'p', apiKey: 'k' });
    const opts = mocks.sessionOpts as { tools?: string[] };
    // SA4E-336: shell tool is OS-aware (powershell on win32, bash elsewhere).
    const shell = process.platform === 'win32' ? 'powershell' : 'bash';
    expect(opts.tools).toEqual(
      expect.arrayContaining(['read', 'write', 'edit', shell, 'grep', 'find', 'ls', 'get_workspace_info', 'compress'])
    );
    expect(opts.tools?.filter((n) => n === 'read')).toHaveLength(1);
    host.dispose();
  });

  it('omits allowlist when extensions fail to resolve (defaults preserved)', async () => {
    vi.mocked(getPiExtensionAgentTools).mockResolvedValueOnce({ tools: [], loaded: [], skipped: [] });
    const host = await ensureSessionHost({ workspaceRoot: 'C:/ws/noallow', providerId: 'p', apiKey: 'k' });
    const opts = mocks.sessionOpts as { tools?: string[] };
    const shell = process.platform === 'win32' ? 'powershell' : 'bash';
    expect(opts.tools).toEqual(
      expect.arrayContaining(['read', 'write', 'edit', shell, 'grep', 'find', 'ls', 'get_workspace_info'])
    );
    host.dispose();
  });

  it('forwards live tool events from the session subscription', async () => {
    const host = await ensureSessionHost({ workspaceRoot: 'C:/ws/tools', providerId: 'p', apiKey: 'k' });
    const onToolEvent = vi.fn();
    const done = host.promptTurn('hi', undefined, onToolEvent);
    mocks.listener?.({ type: 'tool_execution_start', toolCallId: 't1', toolName: 'read', args: {} });
    mocks.listener?.({ type: 'tool_execution_end', toolCallId: 't1', toolName: 'read', isError: false });
    await done;
    expect(onToolEvent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'start', id: 't1', name: 'read' })
    );
    expect(onToolEvent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'end', id: 't1', isError: false })
    );
    host.dispose();
  });
});

import { getSessionToolLoadout } from '../pi-agent-session-host.js';
import { mockPlatform } from './helpers/platform-mock';

describe('getSessionToolLoadout — OS-aware shell (SA4E-336 TC-09 / TC-10)', () => {
  it('TC-09: win32 includes powershell, excludes bash', () => {
    const restore = mockPlatform('win32');
    try {
      const loadout = getSessionToolLoadout('C:/ws');
      expect(loadout).toContain('powershell');
      expect(loadout).not.toContain('bash');
      expect(loadout).toEqual(
        expect.arrayContaining(['read', 'write', 'edit', 'powershell', 'grep', 'find', 'ls'])
      );
    } finally { restore(); }
  });

  it('TC-10: non-win32 includes bash, excludes powershell', () => {
    const restore = mockPlatform('linux');
    try {
      const loadout = getSessionToolLoadout('/home/user/project');
      expect(loadout).toContain('bash');
      expect(loadout).not.toContain('powershell');
    } finally { restore(); }
  });
});
