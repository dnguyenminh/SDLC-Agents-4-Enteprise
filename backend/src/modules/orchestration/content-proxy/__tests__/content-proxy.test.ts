/**
 * Content proxy — unit tests for capability detection, schema augmentation,
 * invocation mapping and artifact inlining.
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectCapability } from '../detect.js';
import { adaptToolDefinition } from '../schema-adapter.js';
import { adaptInvocation } from '../invocation-adapter.js';
import { adaptResult } from '../result-adapter.js';
import type { ToolDefinition } from '../../../../types/tool.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'content-proxy-'));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const EXPORT_DOCX: ToolDefinition = {
  name: 'export_docx',
  description: 'Export a Markdown file to DOCX.',
  category: 'orchestration',
  inputSchema: {
    type: 'object',
    properties: {
      markdown: { type: 'string', title: 'Markdown' },
      file_name: { anyOf: [{ type: 'string' }, { type: 'null' }], title: 'File Name' },
      options: { anyOf: [{ type: 'object' }, { type: 'null' }], title: 'Options' },
    },
    required: ['markdown'],
  },
};

function exportDefinition(cap: ReturnType<typeof detectCapability>): ToolDefinition {
  expect(cap).not.toBeNull();
  return adaptToolDefinition(EXPORT_DOCX, cap!);
}

describe('content proxy — detection', () => {
  it('detects export_docx as a content-in / artifacts-out tool', () => {
    const cap = detectCapability(EXPORT_DOCX);
    expect(cap).toMatchObject({ contentParam: 'markdown', fileOutput: true });
  });

  it('ignores ordinary tools that merely have a body/content argument', () => {
    expect(detectCapability({
      name: 'confluence_create_page',
      description: 'Create a new Confluence page',
      inputSchema: { type: 'object', properties: { space_key: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' } }, required: ['space_key', 'title', 'body'] },
    })).toBeNull();
  });

  it('leaves wrapper-native tools untouched (they declare content_base64 themselves)', () => {
    expect(detectCapability({
      name: 'drawio_export_png',
      description: 'Export .drawio XML content (base64) to PNG. Returns output_base64 (PNG bytes).',
      inputSchema: { type: 'object', properties: { content_base64: { type: 'string' }, file_path: { type: 'string' } }, required: ['content_base64'] },
    })).toBeNull();
  });

  it('ignores text converters (no file artifact)', () => {
    expect(detectCapability({
      name: 'convert_to_markdown',
      description: 'Convert a resource described by an http:, https:, file: or data: URI to markdown',
      inputSchema: { type: 'object', properties: { uri: { type: 'string' } }, required: ['uri'] },
    })).toBeNull();
  });
});

describe('content proxy — schema adaptation', () => {
  it('adds content_base64/x-content-param and removes the raw content arg from required', () => {
    const adapted = exportDefinition(detectCapability(EXPORT_DOCX));
    const schema = adapted.inputSchema as any;
    expect(schema.properties.content_base64).toBeDefined();
    expect(schema['x-content-param']).toBe('markdown');
    expect(schema['x-output-base64']).toBe(true);
    expect(schema.required).not.toContain('markdown');
    expect(adapted.description).toContain('output_base64');
  });
});

describe('content proxy — invocation', () => {
  it('maps content_base64 to the child content arg and strips wrapper-only args', () => {
    const cap = detectCapability(EXPORT_DOCX)!;
    const invocation = adaptInvocation(cap, {
      file_path: '/repo/documents/UG.md',
      output_path: '/repo/documents/UG.docx',
      content_base64: Buffer.from('# Hello').toString('base64'),
      file_name: 'UG',
    });
    expect(invocation.error).toBeUndefined();
    expect(invocation.wrapperMode).toBe(true);
    expect(invocation.args).toEqual({ markdown: '# Hello', file_name: 'UG' });
  });

  it('returns a clear error when wrapper mode carries no content', () => {
    const cap = detectCapability(EXPORT_DOCX)!;
    const invocation = adaptInvocation(cap, { file_path: '/repo/UG.md', output_path: '/repo/UG.docx' });
    expect(invocation.error).toMatch(/Missing content/);
  });

  it('rejects invalid base64 instead of silently corrupting the document', () => {
    const cap = detectCapability(EXPORT_DOCX)!;
    expect(adaptInvocation(cap, { content_base64: '!!!not-base64!!!' }).error).toMatch(/Invalid content_base64/);
  });

  it('leaves direct (non-wrapper) calls untouched', () => {
    const cap = detectCapability(EXPORT_DOCX)!;
    const invocation = adaptInvocation(cap, { markdown: '# Direct' });
    expect(invocation.wrapperMode).toBe(false);
    expect(invocation.args).toEqual({ markdown: '# Direct' });
  });
});

describe('content proxy — result inlining', () => {
  const wrapperInvocation = () => adaptInvocation(detectCapability(EXPORT_DOCX)!, {
    content_base64: Buffer.from('# x').toString('base64'),
  });

  it('inlines artifacts as output_base64 and strips host paths', async () => {
    const file = path.join(TMP, 'out.docx');
    fs.writeFileSync(file, Buffer.from('DOCX-BYTES'));
    const result = {
      content: [{ type: 'text', text: JSON.stringify({ success: true, summary: 'ok', artifacts: [{ path: file, name: 'out.docx', mime_type: 'application/docx', size: 10 }] }) }],
      isError: false,
    };

    const adapted = await adaptResult(wrapperInvocation(), result);
    const parsed = JSON.parse(adapted.content[0].text);

    expect(parsed.output_base64).toBe(Buffer.from('DOCX-BYTES').toString('base64'));
    expect(parsed.file_name).toBe('out.docx');
    expect(parsed.artifacts[0].path).toBeUndefined();
  });

  it('returns every artifact for multi-file tools', async () => {
    const a = path.join(TMP, 'a.json');
    const b = path.join(TMP, 'b.json');
    fs.writeFileSync(a, '{"a":1}');
    fs.writeFileSync(b, '{"b":2}');
    const result = {
      content: [{ type: 'text', text: JSON.stringify({ success: true, artifacts: [{ path: a, name: 'a.json' }, { path: b, name: 'b.json' }] }) }],
      isError: false,
    };

    const parsed = JSON.parse((await adaptResult(wrapperInvocation(), result)).content[0].text);
    expect(parsed.outputs).toHaveLength(2);
    expect(parsed.outputs.map((o: any) => o.file_name)).toEqual(['a.json', 'b.json']);
    expect(parsed.output_base64).toBeUndefined();
  });

  it('does not inline base64 for direct calls', async () => {
    const cap = detectCapability(EXPORT_DOCX)!;
    const result = { content: [{ type: 'text', text: '{"success":true,"artifacts":[]}' }], isError: false };
    expect(await adaptResult(adaptInvocation(cap, { markdown: '# x' }), result)).toBe(result);
  });
});
