import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  getWorkspaceLayoutText,
  clearLayoutCache,
  createWorkspaceInfoTool,
  toSessionToolDefinition,
  withNotFoundHint,
  WORKSPACE_INFO_TOOL_NAME,
} from '../workspace-info-tool.js';
import type { AgentTool } from '@earendil-works/pi-agent-core';

function fakeTool(behavior: () => Promise<never> | unknown): AgentTool {
  return {
    name: 'read',
    label: 'Read',
    description: 'fake',
    parameters: {} as never,
    execute: behavior as never,
  } as unknown as AgentTool;
}

describe('workspace-info-tool (no intent guessing)', () => {
  beforeEach(() => {
    clearLayoutCache();
  });

  it('lists top-level entries with dirs suffixed', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-info-'));
    fs.writeFileSync(path.join(dir, 'a.ts'), 'x');
    fs.mkdirSync(path.join(dir, 'sub'));
    const text = getWorkspaceLayoutText(dir);
    expect(text).toContain(`Workspace root: ${dir}`);
    expect(text).toContain('a.ts');
    expect(text).toContain('sub/');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('degrades to root-only on missing dirs without throwing', () => {
    const text = getWorkspaceLayoutText('C:/definitely/not/here-12345');
    expect(text).toContain('Workspace root: C:/definitely/not/here-12345');
  });

  it('tool executes with root + listing content', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-tool-'));
    fs.writeFileSync(path.join(dir, 'f.txt'), 'x');
    const tool = createWorkspaceInfoTool(dir);
    expect(tool.name).toBe(WORKSPACE_INFO_TOOL_NAME);
    const res = await tool.execute('t1', {} as never, undefined, undefined);
    const text = (res.content[0] as { text: string }).text;
    expect(text).toContain(dir);
    expect(text).toContain('f.txt');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('wrapper enriches not-found errors with the real layout', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-hint-'));
    fs.writeFileSync(path.join(dir, 'real.txt'), 'x');
    const wrapped = withNotFoundHint(
      fakeTool(async () => {
        throw new Error('ENOENT: no such file or directory');
      }),
      dir
    );
    await expect(wrapped.execute('t1', {} as never, undefined, undefined)).rejects.toThrow(
      /\[HINT\][\s\S]*real\.txt/
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('wrapper passes successes through and rethrows foreign errors as-is', async () => {
    const ok = { content: [], details: {} };
    const pass = withNotFoundHint(fakeTool(async () => ok), 'C:/ws');
    await expect(pass.execute('t1', {} as never, undefined, undefined)).resolves.toBe(ok);
    const foreign = withNotFoundHint(
      fakeTool(async () => {
        throw new Error('boom');
      }),
      'C:/ws'
    );
    await expect(foreign.execute('t1', {} as never, undefined, undefined)).rejects.toThrow('boom');
  });

  it('session definition preserves identity and delegates execution', async () => {
    const tool = createWorkspaceInfoTool('C:/ws');
    const def = toSessionToolDefinition(tool);
    expect(def.name).toBe(WORKSPACE_INFO_TOOL_NAME);
    const res = await def.execute('t1', {}, undefined, undefined, {} as never);
    const text = ((res as { content: Array<{ text: string }> }).content[0]).text;
    expect(text).toContain('Workspace root: C:/ws');
  });
});
