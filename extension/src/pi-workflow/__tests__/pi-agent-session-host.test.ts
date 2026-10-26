import { describe, it, expect, beforeEach, vi } from 'vitest';

const { mocks } = vi.hoisted(() => {
  const promptCalls: string[] = [];
  const setRuntimeApiKey = vi.fn(async (_p: string, _k: string) => undefined);
  let subscribed = 0;
  const mocks = {
    promptCalls,
    setRuntimeApiKey,
    sessionOpts: undefined as unknown,
    // SA4E-370: promptTurn subscribes per-turn (async FIFO chain), so live
    // events must be scripted through the mock's prompt() — drained through
    // the captured listener while the turn is live.
    scriptedEvents: [] as unknown[],
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
        for (const evt of mocks.scriptedEvents.splice(0)) {
          mocks.listener?.(evt);
        }
        mocks.listener?.({
          type: 'message_update',
          assistantMessageEvent: { type: 'text_delta', delta: 'session says hi' },
        });
      },
      abort: vi.fn(async () => undefined),
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
    mocks.scriptedEvents.length = 0;
    mocks.setRuntimeApiKey.mockClear();
    mocks.session.dispose.mockClear();
    mocks.session.abort.mockClear();
  });

  it('promptTurn streams tokens and reports the session transcript file', async () => {
    const host = await ensureSessionHost({
      tabId: 'tab-1',
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
    const a = await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/a', providerId: 'p', apiKey: 'k' });
    const b = await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/a', providerId: 'p', apiKey: 'k' });
    expect(a).toBe(b);
    a.dispose();
  });

  it('seeds a real key into the runtime store', async () => {
    const host = await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/keyed', providerId: 'anthropic', apiKey: 'sk-x' });
    expect(mocks.setRuntimeApiKey).toHaveBeenCalledWith('anthropic', 'sk-x');
    host.dispose();
  });

  it('registers get_workspace_info as a session custom tool', async () => {
    const host = await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/custom', providerId: 'p', apiKey: 'k' });
    const opts = mocks.sessionOpts as { customTools?: Array<{ name?: string }> };
    expect(opts.customTools?.map((t) => t.name)).toContain('get_workspace_info');
    host.dispose();
  });

  it('allowlist covers 7 builtins + discovered extensions + orientation (deduped)', async () => {
    const host = await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/allow', providerId: 'p', apiKey: 'k' });
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
    const host = await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/noallow', providerId: 'p', apiKey: 'k' });
    const opts = mocks.sessionOpts as { tools?: string[] };
    const shell = process.platform === 'win32' ? 'powershell' : 'bash';
    expect(opts.tools).toEqual(
      expect.arrayContaining(['read', 'write', 'edit', shell, 'grep', 'find', 'ls', 'get_workspace_info'])
    );
    host.dispose();
  });

  it('forwards live tool events from the session subscription', async () => {
    const host = await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/tools', providerId: 'p', apiKey: 'k' });
    const onToolEvent = vi.fn();
    // SA4E-370: the turn executor subscribes per-turn inside an async FIFO
    // chain — sync listener emission would race ahead of subscribe. Script
    // the tool events so they flow through the live listener during prompt().
    mocks.scriptedEvents.push(
      { type: 'tool_execution_start', toolCallId: 't1', toolName: 'read', args: {} },
      { type: 'tool_execution_end', toolCallId: 't1', toolName: 'read', isError: false }
    );
    await host.promptTurn('hi', undefined, onToolEvent);
    expect(onToolEvent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'start', id: 't1', name: 'read' })
    );
    expect(onToolEvent).toHaveBeenCalledWith(
      expect.objectContaining({ phase: 'end', id: 't1', isError: false })
    );
    host.dispose();
  });

  it('host.abort() forwards to the SDK AgentSession.abort (cancel root-cause fix)', async () => {
    const host = await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/abort', providerId: 'p', apiKey: 'k' });
    await host.abort();
    expect(mocks.session.abort).toHaveBeenCalledTimes(1);
    host.dispose();
  });

  it('abortSessionHost aborts the cached host of the tab; unknown tab is a no-op', async () => {
    await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/abort2', providerId: 'p', apiKey: 'k' });
    const { abortSessionHost } = await import('../session-host/registry.js');
    expect(await abortSessionHost('C:/ws/abort2', 'tab-1')).toBe(true);
    expect(mocks.session.abort).toHaveBeenCalledTimes(1);
    expect(await abortSessionHost('C:/ws/abort2', 'tab-none')).toBe(false);
    expect(mocks.session.abort).toHaveBeenCalledTimes(1);
  });

  it('circuit breaker aborts the session after repeated truncated tool calls (chat-loop fix)', async () => {
    const host = await ensureSessionHost({ tabId: 'tab-1', workspaceRoot: 'C:/ws/loop', providerId: 'p', apiKey: 'k' });
    const onToolEvent = vi.fn();
    const sdkError =
      'Tool call "write" was not executed: the response hit the output token limit, so its arguments may be truncated. Re-issue the tool call with complete arguments.';
    for (let i = 0; i < 3; i++) {
      mocks.scriptedEvents.push(
        { type: 'tool_execution_start', toolCallId: `t${i}`, toolName: 'write', args: {} },
        {
          type: 'tool_execution_end',
          toolCallId: `t${i}`,
          toolName: 'write',
          isError: true,
          result: { content: [{ type: 'text', text: sdkError }] },
        }
      );
    }
    await host.promptTurn('fix the file', undefined, onToolEvent);
    expect(mocks.session.abort).toHaveBeenCalledTimes(1);
    const names = onToolEvent.mock.calls.map((c) => (c[0] as { name?: string }).name);
    expect(names).toContain('circuit-breaker');
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
