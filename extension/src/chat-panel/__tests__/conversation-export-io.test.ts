/**
 * SA4E-369 — conversation-export-io tests (vscode mocked).
 * Pins the IO contract: rendered content reaches the chosen file, per-message
 * copy reaches the clipboard, cancellation writes nothing.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { writeFile, showSaveDialog, setStatusBarMessage, clipboardWriteText } = vi.hoisted(() => ({
  writeFile: vi.fn(async () => undefined),
  showSaveDialog: vi.fn(),
  setStatusBarMessage: vi.fn(),
  clipboardWriteText: vi.fn(async () => undefined),
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: 'C:/ws', scheme: 'file' } }],
    fs: { writeFile },
  },
  Uri: {
    joinPath: (base: { fsPath: string }, name: string) => ({ fsPath: `${base.fsPath}/${name}` }),
    file: (p: string) => ({ fsPath: p }),
  },
  window: { showSaveDialog, setStatusBarMessage },
  env: { clipboard: { writeText: clipboardWriteText } },
}));

import { exportConversationToFile, copyMessageEntryToClipboard } from '../conversation-export-io.js';

const TAB = {
  id: 't1',
  name: 'Review',
  messages: [
    { role: 'user', content: 'review hết đi', timestamp: '2026-10-17T14:02:11.000Z' },
    { role: 'tool', toolData: { id: 'tc-1', name: 'read', args: { file_path: 'a.ts' }, status: 'completed', result: 'const a = 1;', duration: 182 } },
  ],
};

beforeEach(() => {
  writeFile.mockClear();
  showSaveDialog.mockReset();
  setStatusBarMessage.mockClear();
  clipboardWriteText.mockClear();
});

describe('exportConversationToFile', () => {
  it('writes the RENDERED markdown to the chosen file and confirms in the status bar', async () => {
    showSaveDialog.mockResolvedValue({ fsPath: 'C:/ws/out.md' });
    await exportConversationToFile({ format: 'markdown', tab: TAB, model: 'ornith-9b', mode: 'autopilot' });

    expect(showSaveDialog).toHaveBeenCalledTimes(1);
    const opts = showSaveDialog.mock.calls[0][0] as { defaultUri: { fsPath: string }; filters: Record<string, string[]> };
    expect(opts.defaultUri.fsPath).toMatch(/chat-review-\d{8}-\d{6}\.md$/);
    expect(opts.filters).toEqual({ Markdown: ['md'] });

    expect(writeFile).toHaveBeenCalledTimes(1);
    const written = Buffer.from((writeFile.mock.calls[0] as unknown as [unknown, Uint8Array])[1]).toString('utf8');
    expect(written).toContain('# Chat export — Review');
    expect(written).toContain('review hết đi');
    expect(written).toContain('Tool: read — completed (182ms)');
    expect(written).toContain('const a = 1;');
    expect(setStatusBarMessage).toHaveBeenCalled();
  });

  it('json format produces the lossless JSON document', async () => {
    showSaveDialog.mockResolvedValue({ fsPath: 'C:/ws/out.json' });
    await exportConversationToFile({ format: 'json', tab: TAB, model: 'm', mode: 'supervised' });
    const written = Buffer.from((writeFile.mock.calls[0] as unknown as [unknown, Uint8Array])[1]).toString('utf8');
    const parsed = JSON.parse(written);
    expect(parsed.model).toBe('m');
    expect(parsed.entries[0].content).toBe('review hết đi');
  });

  it('user cancellation writes NOTHING and is not an error', async () => {
    showSaveDialog.mockResolvedValue(undefined);
    await exportConversationToFile({ format: 'markdown', tab: TAB });
    expect(writeFile).not.toHaveBeenCalled();
    expect(setStatusBarMessage).not.toHaveBeenCalled();
  });
});

describe('copyMessageEntryToClipboard', () => {
  it('copies a single tool entry as Markdown — identical to its full-export section', async () => {
    const entry = TAB.messages[1];
    await copyMessageEntryToClipboard({ entry });
    expect(clipboardWriteText).toHaveBeenCalledTimes(1);
    const text = (clipboardWriteText.mock.calls[0] as unknown as [string])[0];
    expect(text).toContain('Tool: read — completed (182ms)');
    expect(text).toContain('const a = 1;');
  });

  it('does nothing for a junk entry (never throws, never clears the clipboard)', async () => {
    await copyMessageEntryToClipboard({ entry: 42 as never });
    expect(clipboardWriteText).not.toHaveBeenCalled();
  });
});
