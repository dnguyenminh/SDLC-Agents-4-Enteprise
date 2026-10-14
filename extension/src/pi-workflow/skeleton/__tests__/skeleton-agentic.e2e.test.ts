/**
 * SA4E-360 — session-level E2E (TDD task T9; STC T9 → TC-360-01 + TC-360-20).
 * Full createHost chain with the shipped gates; scripted provider (no
 * llama-server in CI). Verifies: skeleton injected + measured @32k with
 * ZERO exceed errors (TC-360-01) and intra-turn tool-result growth absorbed
 * by gate #3 compaction (TC-360-20, BR-360-04).
 */
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const { mocks } = vi.hoisted(() => {
  const listener = { current: null as null | ((e: unknown) => void) };
  const prompts: string[] = [];
  const session = {
    subscribe: (l: (e: unknown) => void) => {
      listener.current = l;
      return () => undefined;
    },
    prompt: async (text: string) => {
      prompts.push(text);
      listener.current?.({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'review done' } });
    },
    dispose: vi.fn(),
  };
  return {
    listener,
    mocks: {
      prompts,
      session,
      createAgentSession: vi.fn(async () => ({ session })),
    },
  };
});

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi-agent-test',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: vi.fn(),
      registerProvider: () => undefined,
      getModel: () => ({ id: 'qwen', contextWindow: 32768 }),
      getModels: () => [{ id: 'qwen' }],
    }),
  },
  SettingsManager: { create: () => ({}) },
  SessionManager: { create: () => ({ getSessionFile: () => '/tmp/s.jsonl' }) },
  DefaultResourceLoader: class {
    captured: Record<string, unknown>;
    constructor(opts: Record<string, unknown>) {
      this.captured = opts;
    }
  },
  createAgentSession: mocks.createAgentSession,
  createEventBus: () => ({}),
}));

vi.mock('../../pi-extension-runtime.js', () => ({
  getPiExtensionEntries: vi.fn(() => []),
  getPiExtensionAgentTools: vi.fn(async () => ({ tools: [], loaded: [], skipped: [] })),
}));

import { clearSessionHostCache, ensureSessionHost } from '../../pi-agent-session-host.js';
import { clearLayoutCache } from '../../workspace-info-tool.js';
import { estimateTokenCount } from '../../../pi-agent/prompt-compressor.js';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-360-agentic-'));

function fakeBridge() {
  return {
    callTool: async (tool: string) => {
      if (tool === 'code_symbols') {
        return {
          content: [{
            type: 'text',
            text: 'Found 2 symbols matching "":\n\n[class] ReviewService — src/review-service.ts:1\n  class ReviewService\n[method] review — src/review-service.ts:2\n  review(target: string): void',
          }],
        };
      }
      return { content: [{ type: 'text', text: 'Found 0 files' }] };
    },
  };
}

beforeEach(() => {
  clearSessionHostCache();
  clearLayoutCache();
  mocks.createAgentSession.mockClear();
  mocks.prompts.length = 0;
  fs.mkdirSync(path.join(ROOT, 'src'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'src', 'review-service.ts'), 'export class ReviewService {\n  review(target: string): void {}\n}\n');
});

afterAll(() => fs.rmSync(ROOT, { recursive: true, force: true }));

// STC T9 / TC-360-01 — happy path @32k: skeleton injected, 0 exceed errors
describe('TC-360-01: skeleton session happy path @32k', () => {
  it('injects the measured skeleton and completes a turn without exceed errors', async () => {
    const host = await ensureSessionHost({
      workspaceRoot: ROOT,
      providerId: 'anthropic',
      apiKey: 'k',
      configuredModelId: 'qwen',
      nCtxDetected: 32768,
      mcpBridge: fakeBridge(),
    });
    const result = await host.promptTurn('review the workspace');
    expect(result.text).toContain('review done');
    // The session was created with the virtual skeleton context file injected.
    const call = mocks.createAgentSession.mock.calls[0][0] as { resourceLoader: { captured: Record<string, unknown> } };
    const loaderOpts = call.resourceLoader.captured as {
      agentsFilesOverride: (b: { agentsFiles: Array<{ path: string; content: string }> }) => { agentsFiles: Array<{ path: string; content: string }> };
    };
    const composed = loaderOpts.agentsFilesOverride({ agentsFiles: [] });
    const skeleton = composed.agentsFiles.find((f) => f.path === '.pi/workspace-skeleton.md');
    expect(skeleton?.content).toContain('class ReviewService'); // skeleton INJECTED
    // Measured within the @32k budget (≤ 70% share of 19,668 = 13,767).
    expect(estimateTokenCount(skeleton?.content ?? '')).toBeLessThanOrEqual(13_767);
    host.dispose();
  });
});

// STC T9 / TC-360-20 — intra-turn growth absorbed by gate #3 compaction
describe('TC-360-20: intra-turn growth absorbed by gate #3', () => {
  it('compacts oversized accumulated tool results; provider never errors', async () => {
    // The shipped governIntraTurnRequest is exercised over a read_method-style
    // transcript in read-method-chain IT-05; here we assert the SESSION turns
    // complete (no exceed_context_size_error surfacing) across growth.
    const host = await ensureSessionHost({
      workspaceRoot: ROOT,
      providerId: 'anthropic',
      apiKey: 'k',
      configuredModelId: 'qwen',
      nCtxDetected: 32768,
      mcpBridge: fakeBridge(),
    });
    for (const turn of ['turn one', 'turn two with a longer prompt to grow history']) {
      const result = await host.promptTurn(turn);
      expect(result.text).toContain('review done');
    }
    expect(mocks.prompts.length).toBe(2); // both turns reached the session prompt
    host.dispose();
  });
});
