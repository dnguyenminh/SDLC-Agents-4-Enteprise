/**
 * Content proxy — remote artifact retrieval. The backend must return bytes even
 * when the child server lives on another host: MCP resources, http(s) URLs and
 * inline blobs are supported; an unreadable path is a hard error, never a path.
 */

import { describe, it, expect } from 'vitest';
import { detectCapability } from '../detect.js';
import { adaptInvocation } from '../invocation-adapter.js';
import { adaptResult } from '../result-adapter.js';
import type { ToolDefinition } from '../../../../types/tool.js';

const EXPORT_DOCX: ToolDefinition = {
  name: 'export_docx',
  description: 'Export a Markdown file to DOCX.',
  category: 'orchestration',
  inputSchema: { type: 'object', properties: { markdown: { type: 'string' } }, required: ['markdown'] },
};

const wrapperInvocation = () => adaptInvocation(detectCapability(EXPORT_DOCX)!, {
  content_base64: Buffer.from('# x').toString('base64'),
});

const textResult = (payload: unknown) => ({
  content: [{ type: 'text', text: JSON.stringify(payload) }],
  isError: false,
});

describe('content proxy — remote artifacts', () => {
  it('reads remote artifacts through MCP resources when the path is not local', async () => {
    const result = textResult({ success: true, artifacts: [{ uri: 'artifact://job-7/UG.docx', name: 'UG.docx' }] });
    const readResource = async (uri: string) =>
      uri === 'artifact://job-7/UG.docx' ? Buffer.from('REMOTE-DOCX') : null;

    const parsed = JSON.parse((await adaptResult(wrapperInvocation(), result, { readResource })).content[0].text);
    expect(parsed.output_base64).toBe(Buffer.from('REMOTE-DOCX').toString('base64'));
    expect(parsed.file_name).toBe('UG.docx');
  });

  it('reads artifacts exposed as http(s) URLs', async () => {
    const result = textResult({ success: true, artifacts: [{ url: 'https://files.example/UG.docx', name: 'UG.docx' }] });
    const fetchUrl = async (url: string) => (url === 'https://files.example/UG.docx' ? Buffer.from('HTTP-DOCX') : null);

    const parsed = JSON.parse((await adaptResult(wrapperInvocation(), result, { fetchUrl })).content[0].text);
    expect(parsed.output_base64).toBe(Buffer.from('HTTP-DOCX').toString('base64'));
  });

  it('inlines MCP resource blobs returned directly in the tool result', async () => {
    const result = {
      content: [{
        type: 'resource',
        resource: {
          uri: 'file:///remote/UG.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          blob: Buffer.from('INLINE-DOCX').toString('base64'),
        },
      }],
      isError: false,
    };

    const parsed = JSON.parse((await adaptResult(wrapperInvocation(), result)).content[0].text);
    expect(parsed.output_base64).toBe(Buffer.from('INLINE-DOCX').toString('base64'));
    expect(parsed.file_name).toBe('UG.docx');
  });

  it('fails loudly (never returns a path) when the artifact cannot be read', async () => {
    const result = textResult({ success: true, artifacts: [{ path: '/remote/secret/UG.docx', name: 'UG.docx' }] });

    const adapted = await adaptResult(wrapperInvocation(), result, { serverName: 'remote-exporter' });
    expect(adapted.isError).toBe(true);
    expect(adapted.content[0].text).toMatch(/ARTIFACT_FETCH_FAILED/);
    expect(adapted.content[0].text).toContain('remote-exporter');
    expect(adapted.content[0].text).not.toContain('/remote/secret');
  });
});
