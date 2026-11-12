/**
 * SA4E-406 — tool description quality + anti-drift:
 * local definitions win over stale backend ones, descriptions document the
 * real behaviour, and the proxy rewrite exposes the file-based contract.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { mergeLocalToolDefinitions, getLocalToolDefinitions } from '../backend-local-tools/registry';
import { rewriteSingleSchema } from '../services/Base64ProxyService/schema-rewrite';
import { DRAWIO_AUTO_LAYOUT_DEFINITION } from '../tools/drawio/drawio-tool';

describe('mergeLocalToolDefinitions', () => {
  it('replaces a same-name backend entry with the local definition', () => {
    const stale = { name: 'drawio_auto_layout', description: 'OLD' };
    const merged = mergeLocalToolDefinitions([stale, { name: 'other' }], getLocalToolDefinitions());
    const hits = merged.filter((t) => t.name === 'drawio_auto_layout');
    expect(hits).toHaveLength(1);
    expect(hits[0]).not.toBe(stale);
    expect((hits[0] as any).description).not.toBe('OLD');
  });

  it('appends local tools the backend does not list', () => {
    const merged = mergeLocalToolDefinitions([{ name: 'other' }], getLocalToolDefinitions());
    expect(merged.map((t) => t.name)).toContain('stream_write_file');
  });
});

describe('drawio_auto_layout definition', () => {
  const props = Object.keys(DRAWIO_AUTO_LAYOUT_DEFINITION.inputSchema.properties);
  const source = fs.readFileSync(path.join(__dirname, '../tools/drawio/drawio-tool.ts'), 'utf-8');

  it('documents the behaviours AIs must know', () => {
    const d = DRAWIO_AUTO_LAYOUT_DEFINITION.description;
    for (const word of ['OVERWRITES', 'already_good', 'fixed', 'remaining_issues', 'Sequence', 'use-case', 'idempotent']) {
      expect(d).toContain(word);
    }
  });

  it('every argument read by the handler sources is in the schema', () => {
    for (const arg of ['algorithm', 'spacing', 'direction', 'relayout']) {
      expect(props).toContain(arg);
    }
    expect(props).toEqual(expect.arrayContaining(['file_path', 'base_dir', 'workspace_root']));
    expect(source).toContain('extractBaseDirArg');
  });

  it('base_dir description states the real allowlist sources', () => {
    const desc = (DRAWIO_AUTO_LAYOUT_DEFINITION.inputSchema.properties as any).base_dir.description;
    expect(desc).toContain('sdlcAgents.workspace.workspaceRoots');
    expect(desc).toContain('MCP_WORKSPACE_ROOTS');
    expect(desc).toContain('Example:');
    // SA4E-406 A7 — trust by parents (anti-hardcode) + session root default:
    expect(desc).toContain('sdlcAgents.workspace.workspaceRootParents');
    expect(desc).toContain('MCP_WORKSPACE_ROOT_PARENTS');
    expect(desc).toContain('MCP initialize');
  });
});

describe('proxy schema rewrite', () => {
  const tool = {
    name: 'x',
    description: 'Export thing. Returns output_base64 (PNG bytes).',
    inputSchema: { type: 'object', properties: { content_base64: { type: 'string' } }, required: ['content_base64'] },
  } as any;

  it('rewrites description to the file-based contract and adds base_dir', () => {
    const out = rewriteSingleSchema(tool, true, true) as any;
    // The `output_base64` token is deliberately kept in REWRITTEN descriptions —
    // it names the SA4E-380 content-proxy contract and the tracked
    // base64-proxy.dynamic-catalog test locks it in (line 64).
    expect(out.description).toContain('output_base64');
    expect(out.description).toContain('file_path');
    expect(out.description).toContain('output_path');
    expect(out.inputSchema.properties.base_dir.description).toContain('Example:');
    expect(out.inputSchema.properties.content_base64).toBeUndefined();
  });
});
