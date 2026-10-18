/**
 * AC10e (SA4E-372): ChatStateManager persist/restore contract.
 * (1) saveChatState writes the FULL payload under workspaceState(STATE_KEY)
 *     — Memento.update is spied, nothing may be filtered or sliced.
 * (2) restoreChatState re-emits the ENTIRE active-tab messages via
 *     `tab:updated` — tool entries ride along untouched (only the engine
 *     history mirror slices its own last-20 user/assistant view).
 * (3) Tool toolData {id,name,args,status,result} and assistant {thinking}
 *     shapes pass through a save→restore round-trip intact.
 *
 * Memento + sendToWebview mocked; watcher/RelativePattern mocking pattern
 * mirrors chat-panel/__tests__/chat-state-manager-skills.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('vscode', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, any>;
  class RelativePattern {
    constructor(public base: string, public pattern: string) {}
  }
  const fakeWatcher = {
    onDidCreate: () => ({ dispose: () => {} }),
    onDidChange: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  };
  return {
    ...actual,
    RelativePattern,
    workspace: {
      ...(actual.workspace ?? {}),
      createFileSystemWatcher: () => fakeWatcher,
    },
  };
});

import { ChatStateManager } from '../../chat-panel/ChatStateManager';

const STATE_KEY = 'chatPanel.state'; // must match ChatStateManager's private const
const TAB_ID = 'tab-1';

function makeToolMessage(i: number) {
  return {
    role: 'tool',
    content: '',
    toolData: { id: 'tc-' + i, name: 'control_pwsh', args: { action: 'start' }, status: 'completed', result: 'r' + i },
  };
}

/** 22 entries: 1 user + 20 tools + 1 assistant — MORE than the engine
 *  mirror's last-20 slice, so a restore-side slice/filter is detectable. */
function makeFullMessages() {
  const messages: any[] = [{ role: 'user', content: 'hello' }];
  for (let i = 0; i < 20; i++) messages.push(makeToolMessage(i));
  messages.push({
    role: 'assistant',
    content: '## answer',
    nodeId: 'pi:c1',
    thinking: 'line one\nline two',
    thinkingUser: true,
    timestamp: '2026-01-01T00:00:00.000Z',
  });
  return messages;
}

/** Memento mock — update stores a JSON round-trip copy, mirroring the real
 *  serialization-backed workspaceState (mutations after update() are lost). */
function makeMemento(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(initial));
  return {
    keys: () => [...store.keys()],
    get: vi.fn((key: string) => store.get(key)),
    update: vi.fn((key: string, value: unknown) => {
      store.set(key, JSON.parse(JSON.stringify(value)));
    }),
  };
}

function createManager(root: string, memento: any) {
  const sent: any[] = [];
  const engine = { setChatHistory: vi.fn() };
  const manager = new ChatStateManager(root, memento, (msg: any) => sent.push(msg), () => engine as any);
  return { manager, sent, engine };
}

describe('ChatStateManager persist/restore contract (AC10e, SA4E-372)', () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ac10e-persist-'));
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('saveChatState writes the FULL payload under the workspaceState STATE_KEY (spy update)', () => {
    const memento = makeMemento();
    const { manager } = createManager(tmpRoot, memento);
    const state = {
      tabs: [{ id: TAB_ID, name: 'T1', messages: makeFullMessages(), tokenCount: 3, maxTokens: 128000 }],
      activeTabId: TAB_ID,
      messageHistory: ['1', '2'],
    };

    manager.saveChatState(state as any);

    expect(memento.update).toHaveBeenCalledTimes(1);
    const [key, stored] = memento.update.mock.calls[0];
    expect(key).toBe(STATE_KEY);
    expect(stored).toEqual(state); // FULL payload — no filtering, no slicing
  });

  it('restoreChatState re-emits ALL active-tab messages via tab:updated (tools never filtered/sliced)', () => {
    const fullMessages = makeFullMessages();
    const state = {
      tabs: [{ id: TAB_ID, name: 'T1', messages: fullMessages, tokenCount: 22, maxTokens: 128000 }],
      activeTabId: TAB_ID,
    };
    const memento = makeMemento({ [STATE_KEY]: state });
    const { manager, sent, engine } = createManager(tmpRoot, memento);

    manager.restoreChatState();

    const tabMsg = sent.find((m) => m.type === 'tab:updated');
    expect(tabMsg).toBeDefined();
    expect(tabMsg.payload.activeTabId).toBe(TAB_ID);
    const active = tabMsg.payload.tabs.find((t: any) => t.id === TAB_ID);
    expect(active).toBeDefined();
    expect(active.messages).toHaveLength(22); // full array — engine's last-20 does NOT apply here
    expect(active.messages).toEqual(fullMessages);

    // The engine mirror IS the only last-20 slice, and only user/assistant.
    expect(engine.setChatHistory).toHaveBeenCalledTimes(1);
    const mirrored = engine.setChatHistory.mock.calls[0][0];
    expect(mirrored).toHaveLength(2); // 1 user + 1 assistant; 20 tools filtered
    expect(mirrored.map((m: any) => m.role)).toEqual(['user', 'assistant']);
  });

  it('tool toolData and assistant thinking shapes survive save→restore intact', () => {
    const fullMessages = makeFullMessages();
    const state = {
      tabs: [{ id: TAB_ID, name: 'T1', messages: fullMessages, tokenCount: 22, maxTokens: 128000 }],
      activeTabId: TAB_ID,
    };
    // Round-trip: save picks the stored copy up by key, restore reads it back.
    const memento = makeMemento();
    const { manager, sent } = createManager(tmpRoot, memento);
    manager.saveChatState(state as any);
    manager.restoreChatState();

    const tabMsg = sent.find((m) => m.type === 'tab:updated');
    const active = tabMsg.payload.tabs.find((t: any) => t.id === TAB_ID);

    // Deep-tail look-up: a NON-first entry must survive the round-trip intact.
    const tool = active.messages.find((m: any) => m.toolData && m.toolData.id === 'tc-7');
    expect(tool).toBeDefined();
    expect(tool.toolData).toEqual({
      id: 'tc-7', name: 'control_pwsh', args: { action: 'start' }, status: 'completed', result: 'r7',
    });

    const assistant = active.messages.find((m: any) => m.role === 'assistant');
    expect(assistant.nodeId).toBe('pi:c1');
    expect(assistant.thinking).toBe('line one\nline two');
    expect(assistant.thinkingUser).toBe(true);
  });
});
