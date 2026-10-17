/**
 * SA4E-369 — conversation-exporter unit tests.
 * The exporter is a PURE module (no vscode): every render function is
 * pinned here so the export format stays stable for AI analysis.
 */
import { describe, it, expect } from 'vitest';
import {
  buildConversationExport,
  slugify,
  defaultExportFileName,
  type ExportEntry,
} from '../conversation-exporter.js';
import {
  renderConversationMarkdown,
  renderConversationJson,
  renderEntryMarkdown,
  fenceFor,
  clockOf,
} from '../conversation-export-render.js';

const NOW = new Date('2026-10-17T14:03:05');

/** One full tab: user → assistant (thinking) → tool → error → assistant. */
const fullTab = {
  id: 'tab-1',
  name: 'Review t\u1ea5t c\u1ea3 c\u00e1c file',
  messages: [
    { role: 'user', content: 'review t\u1ea5t c\u1ea3 c\u00e1c file', timestamp: '2026-10-17T14:02:11.000Z' },
    {
      role: 'assistant',
      content: 'Tôi sẽ đọc từng folder.',
      nodeId: 'chat',
      thinking: 'nên bắt đầu từ backend/src',
      timestamp: '2026-10-17T14:02:20.000Z',
    },
    {
      role: 'tool',
      content: '',
      toolData: {
        id: 'tc-1',
        name: 'read',
        args: { file_path: 'src/a.ts', offset: 100 },
        status: 'completed',
        result: 'export function a() { return 1; }',
        duration: 182,
        timestamp: '2026-10-17T14:02:25.000Z',
      },
    },
    { role: 'error', content: 'Tool failed:ENOENT', timestamp: '2026-10-17T14:02:30.000Z' },
    { role: 'assistant', content: 'Đã đọc xong.', timestamp: '2026-10-17T14:03:00.000Z' },
  ],
};

describe('buildConversationExport — normalization of the webview tab model', () => {
  it('maps every role to the right entry kind and counts messages/tools separately', () => {
    const cx = buildConversationExport(fullTab, { model: 'ornith-9b', mode: 'autopilot', now: NOW });
    expect(cx.entries.map((e) => e.kind)).toEqual(['user', 'assistant', 'tool', 'error', 'assistant']);
    expect(cx.messageCount).toBe(4);
    expect(cx.toolCallCount).toBe(1);
    expect(cx.model).toBe('ornith-9b');
    expect(cx.mode).toBe('autopilot');
    expect(cx.exportedAt).toBe(NOW.toISOString());
    expect(cx.tab.name).toContain('Review');
  });

  it('keeps tool args/status/result/duration/timestamp and thinking/nodeId losslessly', () => {
    const cx = buildConversationExport(fullTab, {});
    const tool = cx.entries[2] as Extract<ExportEntry, { kind: 'tool' }>;
    expect(tool.name).toBe('read');
    expect(tool.args).toEqual({ file_path: 'src/a.ts', offset: 100 });
    expect(tool.status).toBe('completed');
    expect(tool.result).toContain('export function');
    expect(tool.duration).toBe(182);
    const assistant = cx.entries[1] as Extract<ExportEntry, { kind: 'assistant' }>;
    expect(assistant.thinking).toContain('backend/src');
    expect(assistant.nodeId).toBe('chat');
  });

  it('keeps the tool ERROR text when the call failed', () => {
    const cx = buildConversationExport({
      messages: [{ role: 'tool', toolData: { id: 'x', name: 'bash', args: { command: 'dir /b' }, status: 'failed', error: 'dir: cannot access' } }],
    });
    const tool = cx.entries[0] as Extract<ExportEntry, { kind: 'tool' }>;
    expect(tool.error).toBe('dir: cannot access');
  });

  it('tolerates junk: missing tab, non-object messages, unknown roles', () => {
    const cx = buildConversationExport(
      { messages: [{ role: 'mystery-role', content: 'x' }, null, 42] as never },
      {}
    );
    expect(cx.entries).toHaveLength(1); // only the one real object survives
    expect(cx.entries.every((e) => e.kind === 'assistant')).toBe(true);
    expect(cx.toolCallCount).toBe(0);
    const empty = buildConversationExport({}, {});
    expect(empty.entries).toEqual([]);
    expect(empty.messageCount).toBe(0);
  });
});

describe('renderConversationMarkdown — the AI-readable format', () => {
  const cx = buildConversationExport(fullTab, { model: 'ornith-9b', mode: 'autopilot', now: NOW });

  it('renders a header block with model/mode/counts', () => {
    const md = renderConversationMarkdown(cx);
    expect(md).toContain('# Chat export — Review tất cả các file');
    expect(md).toContain('**Model:** ornith-9b · **Mode:** autopilot');
    expect(md).toContain('**Messages:** 4 (1 tool calls)');
    expect(md).toContain(`**Exported:** ${NOW.toISOString()}`);
  });

  it('renders every entry kind with its content, tool args AND tool result', () => {
    const md = renderConversationMarkdown(cx);
    expect(md).toContain('review tất cả các file');
    expect(md).toContain('Tôi sẽ đọc từng folder.');
    expect(md).toContain('Tool: read — completed (182ms)');
    expect(md).toContain('"file_path": "src/a.ts"');
    expect(md).toContain('export function a() { return 1; }');
    expect(md).toContain('⚠️ Error');
    expect(md).toContain('Tool failed:ENOENT');
  });

  it('includes the thinking block for assistant entries', () => {
    const md = renderConversationMarkdown(cx);
    expect(md).toContain('**Thinking**');
    expect(md).toContain('nên bắt đầu từ backend/src');
  });

  it('separates entries with --- rules and ends with a newline', () => {
    const md = renderConversationMarkdown(cx);
    expect(md).toMatch(/\n\n---\n\n/);
    expect(md.endsWith('\n')).toBe(true);
  });

  it('renders the empty conversation as a header + explicit placeholder', () => {
    const md = renderConversationMarkdown(buildConversationExport({ name: 'empty' }, { now: NOW }));
    expect(md).toContain('# Chat export — empty');
    expect(md).toContain('_(no messages)_');
  });

  it('NEVER lets a tool result containing a code fence break the export structure', () => {
    const tricky = buildConversationExport({
      messages: [
        {
          role: 'tool',
          toolData: {
            name: 'bash',
            args: { command: 'cat x.md' },
            status: 'completed',
            result: 'before\n```\ninner fence\n```\nafter',
          },
        },
      ],
    });
    const md = renderConversationMarkdown(tricky);
    expect(md).toContain('inner fence');
    // The wrapping fence must be LONGER than the ``` inside the result.
    expect(md).toMatch(/````\nbefore\n```\ninner fence\n```\nafter\n````/);
  });
});

describe('renderEntryMarkdown — per-message copy format', () => {
  it('renders a user message with its clock timestamp', () => {
    const md = renderEntryMarkdown({
      kind: 'user',
      content: 'hello',
      timestamp: '2026-10-17T14:02:11.000Z',
    });
    expect(md).toContain('👤 User');
    expect(md).toContain('hello');
  });

  it('renders a failed tool with the Response (error) label', () => {
    const md = renderEntryMarkdown({
      kind: 'tool',
      name: 'bash',
      status: 'failed',
      error: 'dir: cannot access /b',
      args: { command: 'dir /b' },
    });
    expect(md).toContain('Tool: bash — failed');
    expect(md).toContain('**Response (error)**');
    expect(md).toContain('dir: cannot access /b');
  });
});

describe('renderConversationJson — lossless round-trip', () => {
  it('JSON.parse(renderConversationJson(cx)) deep-equals the export object', () => {
    const cx = buildConversationExport(fullTab, { model: 'm', mode: 'autopilot', now: NOW });
    expect(JSON.parse(renderConversationJson(cx))).toEqual(cx);
  });
});

describe('fenceFor / clockOf — helpers', () => {
  it('fenceFor grows past nested fences and defaults to 3 backticks', () => {
    expect(fenceFor('plain')).toBe('```');
    expect(fenceFor('a ``` b')).toBe('````');
    expect(fenceFor('````` deep')).toBe('``````');
  });

  it('clockOf formats local HH:MM:SS and tolerates junk', () => {
    expect(clockOf('2026-10-17T14:03:05.000Z')).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(clockOf('')).toBe('');
    expect(clockOf('not-a-date')).toBe('');
    expect(clockOf(undefined)).toBe('');
  });
});

describe('slugify / defaultExportFileName', () => {
  it('slugify folds Vietnamese diacritics and strips unsafe characters', () => {
    expect(slugify('Review tất cả các file')).toBe('review-tat-ca-cac-file');
    expect(slugify('Đọc//File**')).toBe('doc-file');
    expect(slugify('   ')).toBe('chat');
  });

  it('defaultExportFileName stamps date + format extension', () => {
    expect(defaultExportFileName('Review tất cả', 'markdown', NOW)).toBe('chat-review-tat-ca-20261017-140305.md');
    expect(defaultExportFileName('X', 'json', NOW)).toBe('chat-x-20261017-140305.json');
  });
});
