/**
 * McpClientManager × content proxy — end-to-end adaptation through the
 * child-server execution path (wrapper mode only).
 */

import { describe, it, expect, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { McpClientManager } from '../McpClientManager.js';
import { silentLogger } from '../../../__tests__/sa4e-testkit.js';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'content-proxy-mgr-'));
afterAll(() => fs.rmSync(TMP, { recursive: true, force: true }));

const EXPORT_DOCX_TOOL = {
  name: 'export_docx',
  description: 'Export a Markdown file to DOCX.',
  inputSchema: {
    type: 'object',
    properties: { markdown: { type: 'string' }, file_name: { type: 'string' } },
    required: ['markdown'],
  },
};

function fakeClient(tools: any[], callTool: (req: any) => Promise<any>): Client {
  return { listTools: async () => ({ tools }), callTool } as unknown as Client;
}

async function connectedManager(client: Client): Promise<McpClientManager> {
  const mgr = new McpClientManager(silentLogger());
  mgr.setReservedToolNames(new Set());
  await (mgr as any).registerServerTools('markdown-exporter', client);
  (mgr as any).clients.set('markdown-exporter', client);
  (mgr as any).stateTracker.register('markdown-exporter');
  (mgr as any).stateTracker.transition('markdown-exporter', 'connected');
  return mgr;
}

describe('content proxy through McpClientManager', () => {
  it('maps content_base64 → markdown and inlines the DOCX artifact', async () => {
    const artifact = path.join(TMP, 'UG.docx');
    fs.writeFileSync(artifact, Buffer.from('DOCX'));

    let received: any;
    const client = fakeClient([EXPORT_DOCX_TOOL], async (req) => {
      received = req.arguments;
      return {
        content: [{ type: 'text', text: JSON.stringify({ success: true, summary: 'ok', artifacts: [{ path: artifact, name: 'UG.docx', size: 4 }] }) }],
        isError: false,
      };
    });
    const mgr = await connectedManager(client);

    const result = await mgr.executeTool('export_docx', {
      file_path: '/repo/UG.md',
      output_path: '/repo/UG.docx',
      content_base64: Buffer.from('# UG').toString('base64'),
    });

    expect(received).toEqual({ markdown: '# UG' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.output_base64).toBe(Buffer.from('DOCX').toString('base64'));
    expect(parsed.file_name).toBe('UG.docx');
  });

  it('returns a tool error when wrapper mode has no content', async () => {
    const client = fakeClient([EXPORT_DOCX_TOOL], async () => ({ content: [], isError: false }));
    const mgr = await connectedManager(client);

    const result = await mgr.executeTool('export_docx', { output_path: '/repo/UG.docx' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Missing content/);
  });

  it('does not adapt direct calls (no wrapper args)', async () => {
    let received: any;
    const client = fakeClient([EXPORT_DOCX_TOOL], async (req) => {
      received = req.arguments;
      return { content: [{ type: 'text', text: JSON.stringify({ success: true }) }], isError: false };
    });
    const mgr = await connectedManager(client);

    const result = await mgr.executeTool('export_docx', { markdown: '# Direct' });

    expect(received).toEqual({ markdown: '# Direct' });
    expect(JSON.parse(result.content[0].text).output_base64).toBeUndefined();
  });

  it('fetches artifacts from a remote child through resources/read', async () => {
    const client = {
      listTools: async () => ({ tools: [EXPORT_DOCX_TOOL] }),
      callTool: async () => ({
        content: [{ type: 'text', text: JSON.stringify({ success: true, artifacts: [{ uri: 'artifact://job-9/UG.docx', name: 'UG.docx' }] }) }],
        isError: false,
      }),
      readResource: async ({ uri }: any) =>
        uri === 'artifact://job-9/UG.docx'
          ? { contents: [{ uri, blob: Buffer.from('REMOTE-DOCX').toString('base64') }] }
          : { contents: [] },
    } as unknown as Client;
    const mgr = await connectedManager(client);

    const result = await mgr.executeTool('export_docx', {
      output_path: '/repo/UG.docx',
      content_base64: Buffer.from('# UG').toString('base64'),
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.output_base64).toBe(Buffer.from('REMOTE-DOCX').toString('base64'));
    expect(result.content[0].text).not.toContain('artifact://');
  });

  it('errors instead of leaking a path when a remote artifact is unreachable', async () => {
    const client = fakeClient([EXPORT_DOCX_TOOL], async () => ({
      content: [{ type: 'text', text: JSON.stringify({ success: true, artifacts: [{ path: '/srv/artifacts/UG.docx', name: 'UG.docx' }] }) }],
      isError: false,
    }));
    const mgr = await connectedManager(client);

    const result = await mgr.executeTool('export_docx', {
      output_path: '/repo/UG.docx',
      content_base64: Buffer.from('# UG').toString('base64'),
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/ARTIFACT_FETCH_FAILED/);
    expect(result.content[0].text).not.toContain('/srv/artifacts');
  });
});
