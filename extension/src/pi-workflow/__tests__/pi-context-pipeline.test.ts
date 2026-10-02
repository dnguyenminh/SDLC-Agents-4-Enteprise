import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  runContextPipeline,
  setContextHandlers,
  clearContextPipelineCache,
} from '../pi-context-pipeline.js';
import { PiWorkflowEngine } from '../pi-workflow.js';
import { PiProvider } from '../pi-provider.js';

describe('PiContextPipeline (SA4E-334 auto-compression)', () => {
  beforeEach(() => {
    clearContextPipelineCache();
  });

  it('passes messages through unchanged when no handlers registered', async () => {
    const input = [
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ];
    await expect(runContextPipeline('/ws', input)).resolves.toEqual(input);
  });

  it('applies the last handler wins pipeline and converts blocks back', async () => {
    setContextHandlers('/ws', [
      async (event) => {
        const e = event as { messages: Array<Record<string, unknown>> };
        return { messages: [...e.messages, { role: 'user', content: [{ type: 'text', text: 'injected' }] }] };
      },
    ]);
    const out = await runContextPipeline('/ws', [{ role: 'user', content: 'hi' }]);
    expect(out).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'user', content: 'injected' },
    ]);
  });

  it('survives a throwing handler and keeps original messages', async () => {
    setContextHandlers('/ws', [
      async () => {
        throw new Error('boom');
      },
    ]);
    const input = [{ role: 'user', content: 'keep me' }];
    await expect(runContextPipeline('/ws', input)).resolves.toEqual(input);
  });

  it('engine runs contextRunner before the provider call', async () => {
    const provider = new PiProvider();
    const seen: string[][] = [];
    vi.spyOn(provider, 'run').mockImplementation(async (input) => ({
      text: 'ok',
      toolCalls: [],
      chunks: [{ type: 'done' }],
      messages: [{ role: 'user', content: input.prompt }],
    }));
    const engine = new PiWorkflowEngine({ provider });
    await engine.initialize('HTTP');
    const state = {
      ticketKey: 'SA4E-1',
      piSessionId: 's1',
      chatHistory: [{ role: 'user', content: 'old' }],
    } as never;
    const runner = async (msgs: Array<{ role: string; content: string }>) => {
      seen.push(msgs.map((m) => m.content));
      return [...msgs, { role: 'user', content: 'nudge' }];
    };
    await engine.executeTurn(state, 'new', 'sm-agent', { contextRunner: runner });
    expect(seen[0]).toEqual(['old', 'new']);
    expect(provider.run).toHaveBeenCalled();
  });
});
