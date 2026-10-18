/**
 * Runtime smoke test — SA4E-289 FIX 5 (part 2: loop guards over the real SDK).
 * Runs the REAL PiProvider + REAL pi-agent-core Agent with the pi-ai faux
 * provider: failure-streak guard (Bug I) and the SA4E-368 review-loop guard.
 * Core runtime + concurrency suites live in pi-provider-runtime-smoke.test.ts.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createModels } from '@earendil-works/pi-ai';
import type { MutableModels } from '@earendil-works/pi-ai';
import { fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai/providers/faux';
import { Type } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { PiProvider } from '../pi-provider.js';

describe('PiProvider failure-streak guard — Bug I (real SDK + faux model)', () => {
  let provider: PiProvider;
  let models: MutableModels;
  let faux: ReturnType<typeof fauxProvider>;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    provider = new PiProvider();
    models = createModels();
    faux = fauxProvider();
    models.setProvider(faux.provider);
    await provider.initialize({ transportType: 'HTTP', models });
    await provider.setModel('faux', 'faux-1');
  });

  afterEach(() => {
    models.deleteProvider('faux');
    provider.dispose();
    delete process.env.NODE_ENV;
  });

  it('steers/aborts on repeated identical tool FAILURES even when the args vary', async () => {
    // A tool that always fails the same way (the UAT `dir /b` in Git Bash).
    const failTool = {
      name: 'failtool',
      label: 'Fail tool',
      description: 'Always throws the same error',
      parameters: Type.Object({ command: Type.String() }),
      execute: async () => {
        throw new Error("dir: cannot access '/b': No such file or directory");
      },
    } as unknown as AgentTool;

    // Args differ per call → identical-args signature never trips; only the
    // new failure signature (tool + first error line) can stop the loop.
    faux.setResponses([
      fauxAssistantMessage([fauxToolCall('failtool', { command: 'dir /b a' }, { id: 'tc-1' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage([fauxToolCall('failtool', { command: 'dir /b b' }, { id: 'tc-2' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage([fauxToolCall('failtool', { command: 'dir /b c' }, { id: 'tc-3' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage([fauxToolCall('failtool', { command: 'dir /b d' }, { id: 'tc-4' })], { stopReason: 'toolUse' }),
      fauxAssistantMessage('buffered final text in case the loop continues'),
    ]);

    const result = await provider.run({
      prompt: 'run the loop',
      provider: 'faux',
      model: 'faux-1',
      tools: [failTool],
      turnBudget: { maxSameToolRepeats: 2, timeoutMs: 30_000 },
    });

    // Guard tripped on failure repetition (steer then abort), NOT on the
    // 120s timeout: the partial-result stop note is appended to the text.
    expect(result.text).toContain('Stopped early');
    expect(result.text).toContain('loop guard');
    // The turn was stopped early — well before any 35-call budget.
    expect(result.toolCalls.length).toBeLessThan(10);
  });
});

describe('PiProvider review-loop guard — SA4E-368 (real SDK + faux model)', () => {
  let provider: PiProvider;
  let models: MutableModels;
  let faux: ReturnType<typeof fauxProvider>;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    provider = new PiProvider();
    models = createModels();
    faux = fauxProvider();
    models.setProvider(faux.provider);
    await provider.initialize({ transportType: 'HTTP', models });
    await provider.setModel('faux', 'faux-1');
  });

  afterEach(() => {
    models.deleteProvider('faux');
    provider.dispose();
    delete process.env.NODE_ENV;
  });

  it('stops the re-read amnesia loop with a stop note and NO turn error (K2)', async () => {
    // The UAT "review all files" shape: the model keeps RE-READING the same
    // file with slightly different args (offset/limit vary), so the old
    // identical-args ladder never tripped and the turn burned 162 calls.
    const readTool = {
      name: 'read',
      label: 'Read',
      description: 'Reads a file',
      parameters: Type.Object({ file_path: Type.String(), offset: Type.Optional(Type.Number()) }),
      execute: async () => ({ content: [{ type: 'text', text: 'file body' }] }),
    } as unknown as AgentTool;

    // 12 identical-target re-reads (faux never steers itself out of the loop)
    // + a final text in case the turn outlives the responses.
    faux.setResponses([
      ...Array.from({ length: 12 }, (_, i) =>
        fauxAssistantMessage(
          [fauxToolCall('read', { file_path: 'src/a.ts', offset: i * 100 }, { id: `tc-${i + 1}` })],
          { stopReason: 'toolUse' }
        )
      ),
      fauxAssistantMessage('final partial review text'),
    ]);

    const result = await provider.run({
      prompt: 'review all files',
      provider: 'faux',
      model: 'faux-1',
      tools: [readTool],
      turnBudget: { maxSameToolRepeats: 2, timeoutMs: 30_000 },
    });

    // The read-target ladder caught the loop early (steer at the 2nd re-read,
    // abort on persistence) — far below the UAT's 162 burned calls.
    expect(result.toolCalls.length).toBeLessThan(10);
    expect(result.text).toContain('Stopped early');
    expect(result.text).toContain('loop guard');
    // K2: a guard-stopped turn is intentional — the abort must NOT surface
    // as a turn error (no second red "Request was aborted" bubble).
    expect(result.errorMessage).toBeUndefined();
  });
});
