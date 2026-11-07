/**
 * SA4E-394 — BR-20 per-tool matrix, part 2 (STC TC-312 / TC-313 / TC-314).
 * Real execution contexts: the Atlassian tools run against a RECORDING stub
 * HTTP client (no network — QA-prescribed, STC TC-312 "Atlassian stubbed"),
 * and sandbox_run runs against a record-and-return executor stub (STC TC-314
 * "executor stub records resolved host path"). mem_ingest_file (TC-308) runs
 * the real SQLite ingest pipeline in per-tool-base-dir.mem-ingest.test.ts and
 * embed_image (TC-309) in the extension package (TC-702 contract parity).
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { MultiWorktreePathResolver } from '../multi-worktree-path-resolver.js';
import { setSharedPathResolver, resetSharedPathResolver } from '../path-resolver-provider.js';
import { createWorktreeFixture, type MultiWorktreeFixture } from './multi-worktree-fixture.js';
import { WorkspaceAllowlist } from '../workspace-allowlist.js';
import { silentLogger } from '../../__tests__/sa4e-testkit.js';
import { registerJiraAttachmentTools } from '../../servers/atlassian/tools/jira-attachment-tools.js';
import { registerConfluenceContentTools } from '../../servers/atlassian/tools/confluence-content-tools.js';
import { createSandboxHandlers } from '../../modules/sandbox/tools/tool-handlers.js';

const ALLOWLIST_MSG = 'is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS';
const CONTAINMENT_MSG = 'is outside workspace root';

let fx: MultiWorktreeFixture;
let resolver: MultiWorktreePathResolver;

beforeAll(() => {
  fx = createWorktreeFixture();
  fs.mkdirSync(path.join(fx.wtB, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(fx.wtB, 'docs', 'plan.md'), '# plan wt-b\n');
  const allowlist = WorkspaceAllowlist.load(fx.main, fx.logger, {
    MCP_WORKSPACE_ROOTS: fx.allowlistEnv,
  } as NodeJS.ProcessEnv);
  resolver = new MultiWorktreePathResolver(allowlist, fx.main, fx.logger);
  setSharedPathResolver(resolver);
});

afterAll(() => {
  resetSharedPathResolver();
  fx.cleanup();
});

function text(r: any): string { return String(r?.content?.[0]?.text ?? ''); }
function isErrorRes(r: any): boolean { return Boolean(r?.isError); }
function sessId(): string { return `sess_${'a'.repeat(12)}`; }
const uploadNames = (res: string[]): string => res.join('|');

/** STC TC-312 precondition — recording uploader stub (no real HTTP). */
function recordUploader(): { client: recordUploaderClient; calls: string[] } {
  const calls: string[] = [];
  const client = {
    attachFile: vi.fn(async (_k: string, form: FormData) => {
      calls.push((form.get('file') as File).name);
      return { status: 200, data: {} };
    }),
    addAttachment: vi.fn(async (_p: string, form: FormData) => {
      calls.push((form.get('file') as File).name);
      return { status: 200, data: {} };
    }),
  };
  return { client, calls };
}
type recordUploaderClient = Parameters<typeof registerJiraAttachmentTools>[1];

/** Extract the registered handler from a stub McpServer. */
function registered(
  name: string, client: recordUploaderClient,
  register: (server: unknown, client2: recordUploaderClient) => void,
): (args: Record<string, unknown>) => Promise<unknown> {
  const toolHandler = { handler: null as null | ((a: unknown, x: unknown) => unknown) };
  const server = {
    registerTool: (tool: string, _def: unknown, handler: unknown) => {
      if (tool === name) toolHandler.handler = handler as never;
    },
    tool: () => undefined,
  };
  register(server, client);
  if (!toolHandler.handler) throw new Error(`tool ${name} not registered`);
  return async (args) => toolHandler.handler!(args, {});
}

describe('TC-314 — sandbox_run (path argument `file`, pre-mount resolution)', () => {
  it('S1 (AC1): file + base_dir → executor receives the resolved host path', async () => {
    const { run, stubManager } = sandboxHandler();
    await run({ file: 'script.py', runtime: 'python', sessionId: sessId(), base_dir: fx.wtB });
    expect((stubManager.execute as any).mock.calls[0][1]).toContain(path.join(fx.wtB, 'script.py'));
  });
});

describe('TC-314 — full matrix', () => {
  it('S2 (AC2): unregistered root → PATH_REJECTED..., zero execution (BR-23)', async () => {
    const { run, stubManager } = sandboxHandler();
    const r = await run({ file: 'script.py', runtime: 'python', sessionId: sessId(), base_dir: fx.wtUnreg });
    expect(isErrorRes(r)).toBe(true);
    expect(text(r)).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(text(r)).toContain(ALLOWLIST_MSG);
    expect(stubManager.calls()).toHaveLength(0);
  });

  it('S3 (AC3): base_dir omitted → sandbox-internal file semantics unchanged', async () => {
    const { run, stubManager } = sandboxHandler();
    await run({ file: 'script.py', runtime: 'python', sessionId: sessId() });
    expect((stubManager.execute as any).mock.calls[0][1]).toContain('script.py');
  });

  it('S4/S5 (AC4): absolute outside + ../ traversal rejected, no execution', async () => {
    const { run, stubManager } = sandboxHandler();
    const r = await run({ file: path.join(fx.outside, 'evil.py'), runtime: 'python', sessionId: sessId(), base_dir: fx.wtB });
    expect(text(r)).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    const r2 = await run({ file: '../../../outside/evil.py', runtime: 'sh', sessionId: sessId(), base_dir: fx.wtB });
    expect(text(r2)).toContain(CONTAINMENT_MSG);
    expect(stubManager.calls()).toHaveLength(0);
  });
});

describe('TC-312/TC-313 — jira_attach_file + confluence_add_attachment (stubbed client)', () => {
  it('S1 (AC1): base_dir=wt-b → upload content comes from worktree B', async () => {
    const { client, calls } = recordUploader();
    const jira = registered('jira_attach_file', client, registerJiraAttachmentTools);
    const res = await jira({ issue_key: 'SA4E-1', file_path: 'docs/plan.md', base_dir: fx.wtB });
    expect(isErrorRes(res)).toBe(false);
    expect(uploadNames(calls)).toContain('plan.md');
  });

  it('JAF S2/S4/S5 (AC2/AC4): rejections with ZERO Atlassian HTTP calls (BR-23)', async () => {
    const { client, calls } = recordUploader();
    const jira = registered('jira_attach_file', client, registerJiraAttachmentTools);
    const r1 = await jira({ issue_key: 'SA4E-1', file_path: 'docs/plan.md', base_dir: fx.wtUnreg });
    expect(text(r1)).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    const r2 = await jira({ issue_key: 'SA4E-1', file_path: path.join(fx.outside, 'x.md'), base_dir: fx.wtB });
    expect(text(r2)).toContain(CONTAINMENT_MSG);
    const r3 = await jira({ issue_key: 'SA4E-1', file_path: '../../../outside/x.md', base_dir: fx.wtB });
    expect(text(r3)).toContain('PATH_REJECTED_OUTSIDE_ALLOWLIST');
    expect(calls).toHaveLength(0);
  });

  it('CAA S1/S2 (AC1/AC2): upload from wt-b; unregistered root rejected pre-HTTP', async () => {
    const { client, calls } = recordUploader();
    const confluence = registered('confluence_add_attachment', client, registerConfluenceContentTools);
    const res = await confluence({ page_id: '1', file_path: 'docs/plan.md', base_dir: fx.wtB });
    expect(isErrorRes(res)).toBe(false);
    expect(calls).toHaveLength(1);
    const bad = await confluence({ page_id: '1', file_path: 'docs/plan.md', base_dir: fx.wtUnreg });
    expect(text(bad)).toContain(ALLOWLIST_MSG);
    expect(calls).toHaveLength(1);
  });
});

/** Sandbox fixture — executor stub records every executed command. */
function sandboxHandler() {
  const commands: string[] = [];
  const stubManager = {
    execute: vi.fn(async (_s: string, command: string) => {
      commands.push(command);
      return { exitCode: 0, stdout: 'ran', stderr: '', durationMs: 1 };
    }),
  };
  const config = { commandTimeoutDefault: 5 } as never;
  const handlers = createSandboxHandlers(stubManager as unknown as never, config, silentLogger(), resolver);
  return {
    run: handlers.get('sandbox_run')!,
    stubManager: {
      execute: stubManager.execute,
      calls: () => commands,
    },
  };
}
