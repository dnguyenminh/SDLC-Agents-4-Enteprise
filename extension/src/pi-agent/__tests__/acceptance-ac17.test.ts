/**
 * SA4E-427 — AC-17: real tokenizer prompt/tool counting under the runtime
 * budget (16K Doc §19 + §4). Wires the llama.cpp /tokenize endpoint into the
 * session budget gate and asserts the decision uses the REAL count.
 */

import { describe, it, expect } from 'vitest';
import { measureStaticAssembly } from '../budget-gate';
import { runSessionBudgetGate } from '../session-budget-gate';
import { resolveContextBudget } from '../context-budget-resolver';
import { tryRuntimeTokenCount } from '../runtime-tokenizer';

const basePromptTokens = measureStaticAssembly({
  contextFiles: [],
  compress: false,
  workspacePrompt: '',
  toolSchemaTokens: 0,
}).staticTokens;

describe('SA4E-427 AC-17 runtime tokenizer budget', () => {
  it('AC-17: real prompt + tool tokens drive the runtime budget decision', async () => {
    const promptText = 'workspace prompt + context files';
    const realTokens = 4200;
    const fetchFn = (async () => ({
      ok: true,
      json: async () => ({ tokens: new Array(realTokens).fill(0) }),
    })) as unknown as typeof fetch;

    const counted = await tryRuntimeTokenCount(promptText, { baseUrl: 'http://127.0.0.1:8080/v1', fetchFn });
    expect(counted).toBe(realTokens); // exact model tokenizer count

    const toolSchemaTokens = 300;
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });
    const result = runSessionBudgetGate(budget, {
      loadFiles: () => [{ content: promptText }],
      workspacePrompt: 'p',
      toolSchemaTokens,
      minToolSchemaTokens: 10,
      shouldCompress: false,
      runtimeStaticCount: counted!,
    });

    expect(result.outcome.staticTokens).toBe(counted! + basePromptTokens + toolSchemaTokens);
    expect(result.outcome.staticTokens).toBeLessThanOrEqual(budget.staticBudget);
    expect(result.outcome.escalations).toHaveLength(0);
    expect(['ALLOW', 'WARN']).toContain(result.outcome.decision);
  });
});
