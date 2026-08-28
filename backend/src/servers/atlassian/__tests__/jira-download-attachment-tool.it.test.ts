/**
 * SA4E-229 — Handler-level integration tests for `jira_download_attachment`.
 *
 * These tests exercise the REAL registered MCP tool (`registerJiraAttachmentTools`)
 * over a linked in-memory transport (server <-> client) with a fake `JiraApiClient`.
 * This covers the tool wiring that the client-only integration tests do not:
 * ID-to-URL resolution, URL pass-through, metadata assembly, 403-fix (auth session),
 * and error mapping.
 *
 * STC traceability:
 *  - IT-DL-01  -> TC-001 (download by ID), TC-100 (ID->URL), TC-300 (auth used), TC-003 (metadata), TC-202 (no 403)
 *  - IT-DL-02  -> TC-002 (download by URL)
 *  - IT-DL-03  -> TC-203 (invalid URL format)
 *  - IT-DL-04  -> TC-200 (invalid/non-existent ID -> clear error, not 403)
 *  - IT-DL-05  -> TC-201 (404 not found)
 *  - IT-DL-06  -> TC-400 (empty attachment_id)
 *  - IT-DL-07  -> TC-400 (neither param provided -> validation error)
 *  - IT-DL-08  -> TC-800 (regression: jira_get_attachments still works)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { registerJiraAttachmentTools } from '../tools/jira-attachment-tools.js';
import { AtlassianApiError } from '../clients/base-client.js';
import { AtlassianErrorCode } from '../models/types.js';
import type { JiraApiClient } from '../clients/jira-client.js';

const SAMPLE_CONTENT = 'hello attachment content';
const SAMPLE_BASE64 = Buffer.from(SAMPLE_CONTENT).toString('base64');

function makeFakeClient() {
  const getAttachment = vi.fn(async (id: string) => ({
    status: 200,
    data: {
      id,
      content: 'https://test.atlassian.net/secure/attachment/123/file.txt',
      filename: 'file.txt',
    },
  }));
  const downloadAttachment = vi.fn(async (_url: string) => ({
    buffer: Buffer.from(SAMPLE_CONTENT),
    mimeType: 'text/plain',
    size: SAMPLE_CONTENT.length,
    filename: 'file.txt',
  }));
  const getIssue = vi.fn(async () => ({ status: 200, data: { attachments: [] } }));
  const deleteAttachment = vi.fn(async () => ({ status: 204, data: {} }));
  const attachFile = vi.fn(async () => ({ status: 201, data: {} }));
  const getAttachmentMeta = vi.fn(async () => ({ status: 200, data: {} }));

  const client = {
    getAttachment,
    downloadAttachment,
    getIssue,
    deleteAttachment,
    attachFile,
    getAttachmentMeta,
  } as unknown as JiraApiClient;

  return { client, getAttachment, downloadAttachment, getIssue };
}

async function setupToolServer(fakeClient: JiraApiClient) {
  const server = new McpServer({ name: 'atlassian-test', version: '1.0.0' });
  registerJiraAttachmentTools(server, fakeClient);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function parse(result: { content: Array<{ text?: string }> }): any {
  return JSON.parse(result.content[0].text ?? '{}');
}

describe('IT-DL-01: jira_download_attachment by attachment_id (TC-001, TC-100, TC-300, TC-003, TC-202)', () => {
  let ctx: Awaited<ReturnType<typeof setupToolServer>>;
  const fake = makeFakeClient();

  it('resolves ID to URL via authenticated session and returns metadata + base64', async () => {
    ctx = await setupToolServer(fake.client);
    const res = await ctx.client.callTool({
      name: 'jira_download_attachment',
      arguments: { attachment_id: '123' },
    });

    // No 403 — success path
    expect(res.isError).toBeFalsy();

    // Authenticated session used: getAttachment (which applies authHeaders) was called
    expect(fake.getAttachment).toHaveBeenCalledWith('123');
    expect(fake.downloadAttachment).toHaveBeenCalledTimes(1);

    const data = parse(res as any);
    expect(data.content_base64).toBe(SAMPLE_BASE64);
    expect(data.mime_type).toBe('text/plain');
    expect(data.size_bytes).toBe(SAMPLE_CONTENT.length);
    expect(data.filename).toBe('file.txt');
  });

  afterEach(async () => { if (ctx) await ctx.close(); });
});

describe('IT-DL-02: jira_download_attachment by attachment_url (TC-002)', () => {
  let ctx: Awaited<ReturnType<typeof setupToolServer>>;
  const fake = makeFakeClient();

  it('downloads directly from URL without ID resolution', async () => {
    ctx = await setupToolServer(fake.client);
    const url = 'https://test.atlassian.net/secure/attachment/777/report.pdf';
    const res = await ctx.client.callTool({
      name: 'jira_download_attachment',
      arguments: { attachment_url: url },
    });

    expect(res.isError).toBeFalsy();
    // ID resolution must NOT be performed when URL is supplied
    expect(fake.getAttachment).not.toHaveBeenCalled();
    expect(fake.downloadAttachment).toHaveBeenCalledWith(url);

    const data = parse(res as any);
    expect(data.content_base64).toBe(SAMPLE_BASE64);
    expect(data.filename).toBe('file.txt');
  });

  afterEach(async () => { if (ctx) await ctx.close(); });
});

describe('IT-DL-03: jira_download_attachment with invalid URL format (TC-203)', () => {
  let ctx: Awaited<ReturnType<typeof setupToolServer>>;
  const fake = makeFakeClient();

  it('rejects malformed URL with an error (not a 403)', async () => {
    ctx = await setupToolServer(fake.client);
    const res = await ctx.client.callTool({
      name: 'jira_download_attachment',
      arguments: { attachment_url: 'not-a-url' },
    });

    expect(res.isError).toBe(true);
    expect(fake.downloadAttachment).not.toHaveBeenCalled();
  });

  afterEach(async () => { if (ctx) await ctx.close(); });
});

describe('IT-DL-04: jira_download_attachment with invalid/non-existent ID (TC-200)', () => {
  let ctx: Awaited<ReturnType<typeof setupToolServer>>;
  const fake = makeFakeClient();

  it('returns a clear NOT_FOUND error, never a 403', async () => {
    fake.getAttachment.mockRejectedValue(
      new AtlassianApiError(AtlassianErrorCode.NOT_FOUND, 'Attachment not found'),
    );
    ctx = await setupToolServer(fake.client);
    const res = await ctx.client.callTool({
      name: 'jira_download_attachment',
      arguments: { attachment_id: 'does-not-exist' },
    });

    expect(res.isError).toBe(true);
    const data = parse(res as any);
    expect(data.error).toBe('NOT_FOUND');
    expect(data.message.toLowerCase()).toContain('not found');
    expect(data.error).not.toBe('FORBIDDEN');
  });

  afterEach(async () => { if (ctx) await ctx.close(); });
});

describe('IT-DL-05: jira_download_attachment returns 404 when attachment missing (TC-201)', () => {
  let ctx: Awaited<ReturnType<typeof setupToolServer>>;
  const fake = makeFakeClient();

  it('maps a 404 from the API to a NOT_FOUND error result', async () => {
    fake.getAttachment.mockRejectedValue(
      new AtlassianApiError(AtlassianErrorCode.NOT_FOUND, 'HTTP 404 Attachment missing', 404),
    );
    ctx = await setupToolServer(fake.client);
    const res = await ctx.client.callTool({
      name: 'jira_download_attachment',
      arguments: { attachment_id: '999' },
    });

    expect(res.isError).toBe(true);
    const data = parse(res as any);
    expect(data.error).toBe('NOT_FOUND');
  });

  afterEach(async () => { if (ctx) await ctx.close(); });
});

describe('IT-DL-06: jira_download_attachment with empty attachment_id (TC-400)', () => {
  let ctx: Awaited<ReturnType<typeof setupToolServer>>;
  const fake = makeFakeClient();

  it('rejects empty attachment_id via validation', async () => {
    ctx = await setupToolServer(fake.client);
    const res = await ctx.client.callTool({
      name: 'jira_download_attachment',
      arguments: { attachment_id: '' },
    });

    expect(res.isError).toBe(true);
    expect(fake.getAttachment).not.toHaveBeenCalled();
  });

  afterEach(async () => { if (ctx) await ctx.close(); });
});

describe('IT-DL-07: jira_download_attachment with neither parameter (TC-400)', () => {
  let ctx: Awaited<ReturnType<typeof setupToolServer>>;
  const fake = makeFakeClient();

  it('returns VALIDATION_ERROR when both id and url are missing', async () => {
    ctx = await setupToolServer(fake.client);
    const res = await ctx.client.callTool({
      name: 'jira_download_attachment',
      arguments: {},
    });

    expect(res.isError).toBe(true);
    // When neither param is provided the SDK's own input validation rejects the
    // call (forwarding our refine message) before our handler runs. Either way
    // the result is an error and must surface the validation requirement.
    const text = (res.content[0] as { text?: string }).text ?? '';
    expect(text.toLowerCase()).toContain('either');
  });

  afterEach(async () => { if (ctx) await ctx.close(); });
});

describe('IT-DL-08: jira_get_attachments regression (TC-800)', () => {
  let ctx: Awaited<ReturnType<typeof setupToolServer>>;
  const fake = makeFakeClient();

  it('still works after adding jira_download_attachment', async () => {
    ctx = await setupToolServer(fake.client);
    const res = await ctx.client.callTool({
      name: 'jira_get_attachments',
      arguments: { issue_key: 'PROJ-1' },
    });

    expect(res.isError).toBeFalsy();
    expect(fake.getIssue).toHaveBeenCalledWith('PROJ-1', 'attachment');
  });

  afterEach(async () => { if (ctx) await ctx.close(); });
});
