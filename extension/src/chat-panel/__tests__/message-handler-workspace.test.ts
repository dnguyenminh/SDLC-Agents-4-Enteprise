import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MessageHandler } from '../message-handler.js';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: 'C:/ws' }, name: 'ws' }],
    fs: {
      readDirectory: async () => [
        ['src', 2],
        ['package.json', 1],
      ],
    },
    getConfiguration: () => ({ get: (_k: string, d: unknown) => d }),
  },
  FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
  window: { createOutputChannel: () => ({ appendLine: () => undefined, dispose: () => undefined }) },
}));

describe('MessageHandler workspace safety net (UAT)', () => {
  let invokeChat: ReturnType<typeof vi.fn>;
  let sendToWebview: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    invokeChat = vi.fn(async () => undefined);
    sendToWebview = vi.fn();
  });

  function makeHandler() {
    const engine = {
      hookEngine: {
        firePromptSubmit: async () => undefined,
        fireAgentStop: async () => undefined,
      },
      invokeChat,
      switchActiveTab: () => undefined,
    };
    return new MessageHandler(
      () => engine as never,
      sendToWebview,
      'C:/ws'
    );
  }

  it('attaches workspace root + listing for "Review toan bo project"', async () => {
    const handler = makeHandler();
    await (handler as unknown as { handle: (m: unknown) => Promise<void> }).handle({
      type: 'chat:userMessage',
      text: 'Review toàn bộ project nhé',
    });
    expect(invokeChat).toHaveBeenCalledTimes(1);
    const enriched = String(invokeChat.mock.calls[0][0]);
    expect(enriched).toContain('Workspace root: C:/ws');
    expect(enriched).toContain('src/');
  });

  it('does not attach when no workspace intent', async () => {
    const handler = makeHandler();
    await (handler as unknown as { handle: (m: unknown) => Promise<void> }).handle({
      type: 'chat:userMessage',
      text: 'Xin chào bạn',
    });
    expect(invokeChat).toHaveBeenCalledTimes(1);
    expect(String(invokeChat.mock.calls[0][0])).toBe('Xin chào bạn');
  });
});
