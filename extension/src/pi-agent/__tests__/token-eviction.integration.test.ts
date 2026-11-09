/**
 * SA4E-428 — Token/eviction integration harness (16K Doc §4, §8 + IMPLEMENTATION-GUIDE Tasks 1-7).
 *
 * Real modules only: budget resolver, runtime tokenizer, session gate, role
 * scope, scoped steering and tool loadout are composed per scenario; nothing
 * is mocked except the logger and the tokenizer HTTP transport.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../logger', () => ({
  logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { BudgetCalculator } from '../../mcp/context-budget';
import { resolveContextBudget } from '../context-budget-resolver';
import { resolveSessionTier } from '../../pi-workflow/session-host/types';
import { measureStaticAssembly, PiContextBudgetExceededError } from '../budget-gate';
import { runSessionBudgetGate } from '../session-budget-gate';
import { tryRuntimeTokenCount } from '../runtime-tokenizer';
import { scopedSteering } from '../scoped-steering';
import { RoleScopeFilter } from '../role-scope';
import {
  buildSessionToolLoadout, toolSchemaTokenCap, CORE_FILE_TOOLS, DISCOVERY_TOOLS,
} from '../tool-loadout';
import { estimateTokenCount } from '../prompt-compressor';

/** Fake llama.cpp /tokenize endpoint returning an exact token count. */
function tokenizerFetch(count: number): typeof fetch {
  return (async () => ({ ok: true, json: async () => ({ tokens: new Array(count).fill(0) }) })) as unknown as typeof fetch;
}

const BASE_PROMPT = measureStaticAssembly({
  contextFiles: [], compress: false, workspacePrompt: '', toolSchemaTokens: 0,
}).staticTokens;

function tokensOf(entries: string[]): number {
  return entries.reduce((sum, e) => sum + estimateTokenCount(e), 0);
}

describe('SA4E-428 token budget across model tiers (real resolver + tokenizer)', () => {
  it.each([
    { nCtx: 8192, tier: 'small' },
    { nCtx: 32768, tier: 'medium' },
    { nCtx: 128000, tier: 'large' },
  ])('$nCtx → $tier: real count fits staticBudget, no overflow', async ({ nCtx, tier }) => {
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: nCtx });
    expect(resolveSessionTier(budget.nCtx)).toBe(tier);
    expect(budget.staticBudget + budget.historyBudget)
      .toBe(budget.nCtx - budget.reserveOutput - budget.safetyMargin);
    const counted = await tryRuntimeTokenCount('real prompt text', {
      baseUrl: 'http://127.0.0.1:8080/v1', fetchFn: tokenizerFetch(700),
    });
    expect(counted).toBe(700);
    const result = runSessionBudgetGate(budget, {
      loadFiles: () => [{ content: 'p'.repeat(2800) }], workspacePrompt: 'w',
      toolSchemaTokens: 200, minToolSchemaTokens: 50, shouldCompress: false,
      runtimeStaticCount: counted!,
    });
    expect(result.outcome.staticTokens).toBe(700 + BASE_PROMPT + 200);
    expect(result.outcome.staticTokens).toBeLessThanOrEqual(budget.staticBudget);
    expect(result.outcome.escalations).toEqual([]);
    expect(result.outcome.decision).toBe('ALLOW');
    const request = BudgetCalculator.calculateBudget(nCtx, {
      toolSchemaTokens: result.outcome.staticTokens, reserveTokens: budget.reserveOutput, historyTokens: 0,
    });
    expect(request.usagePercent).toBeLessThan(100); // never overflow the window
  });
});

describe('SA4E-428 budget gate escalation (real session gate)', () => {
  const budget8k = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 8192 });

  it('escalates compress → drop-steering → min-loadout and lands under budget', () => {
    const result = runSessionBudgetGate(budget8k, {
      loadFiles: () => [{ content: 'x'.repeat(2000) }, { content: 'y'.repeat(2000) }],
      workspacePrompt: 'w', toolSchemaTokens: 3000, minToolSchemaTokens: 100,
      shouldCompress: false,
    });
    expect(result.outcome.escalations).toEqual(['compress', 'drop-steering', 'min-loadout']);
    expect(result.shouldCompress).toBe(true);
    expect(result.minLoadout).toBe(true);
    expect(result.steeringBudget.staticBudget).toBe(Math.floor(budget8k.staticBudget / 2));
    expect(result.outcome.staticTokens).toBeLessThanOrEqual(budget8k.staticBudget);
    expect(['ALLOW', 'WARN']).toContain(result.outcome.decision); // never REJECT here
  });

  it('exhausted ladder → actionable PI_CONTEXT_BUDGET_EXCEEDED (no provider call)', () => {
    let thrown: Error | null = null;
    try {
      runSessionBudgetGate(budget8k, {
        loadFiles: () => [{ content: 'x'.repeat(40000) }], workspacePrompt: 'w',
        toolSchemaTokens: 3000, minToolSchemaTokens: 100, shouldCompress: false,
      });
    } catch (err) {
      thrown = err as Error;
    }
    expect(thrown).toBeInstanceOf(PiContextBudgetExceededError);
    expect(thrown!.message).toMatch(/^PI_CONTEXT_BUDGET_EXCEEDED/);
    expect(thrown!.message).toContain('Giảm steering/tools'); // actionable, replaces the raw 400
  });
});

describe('SA4E-428 role-scope token reduction', () => {
  const skills = [
    { id: 'sm-coordination' }, { id: 'ba-requirement' }, { id: 'dev-code' },
    { id: 'qa-test' }, { id: 'drawio-design' },
  ];
  const base = [
    `## phase-1-requirements.md\n${'a'.repeat(2000)}`,
    `## phase-2-specification.md\n${'b'.repeat(2000)}\n- Never skip the security gate`,
    `## shared-quality-gates.md\n${'c'.repeat(1000)}`,
    `## AGENTS.md\n${'d'.repeat(500)}`,
  ];

  it('role filter drops out-of-role skills; unknown role fails open', () => {
    const filter = new RoleScopeFilter();
    expect(filter.filterSkills('BA', skills).map((s) => s.id)).toEqual(['ba-requirement']);
    expect(filter.filterSkills('SM', skills).map((s) => s.id)).toEqual(['sm-coordination']);
    expect(filter.filterSkills('unknown-role', skills)).toHaveLength(5); // BR-07
  });

  it('scoped steering for a known role measures less static context, security survives', () => {
    const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });
    const scoped = scopedSteering(base, 'BA', 'requirements', budget);
    expect(tokensOf(scoped)).toBeLessThan(tokensOf(base));
    expect(tokensOf(scopedSteering(base, 'unknown-role', 'requirements', budget))).toBe(tokensOf(base));
    expect(scoped.join('\n')).not.toContain('b'.repeat(50)); // out-of-phase body dropped
    expect(scoped.join('\n')).toContain('Never skip the security gate'); // BR-05
    expect(scoped.join('\n')).toContain('shared-quality-gates.md'); // governance kept
  });
});

describe('SA4E-428 tool loadout: role filter + schema token cap', () => {
  const pool = [
    'jira_get_issue', 'mem_search', 'docs_export', 'git_commit', 'build_run',
    'deploy_release', 'pipeline_trigger', 'test_run', 'drawio_export', 'security_scan',
  ].map((name) => ({ name, schemaTokens: 200 }));
  const budget = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });

  it('BA excludes deploy/git/build tools; DEV keeps them; core+discovery always present', () => {
    const ba = buildSessionToolLoadout({ role: 'BA', mcpTools: pool, schemaTokenCap: toolSchemaTokenCap(budget) });
    const dev = buildSessionToolLoadout({ role: 'DEV', mcpTools: pool, schemaTokenCap: toolSchemaTokenCap(budget) });
    expect(ba.loadout).toEqual(expect.arrayContaining([...CORE_FILE_TOOLS, ...DISCOVERY_TOOLS, 'jira_get_issue', 'mem_search']));
    expect(ba.loadout).not.toContain('deploy_release');
    expect(dev.loadout).toEqual(expect.arrayContaining(['git_commit', 'build_run']));
    expect(ba.loadout.length).toBeLessThan(dev.loadout.length); // role filter reduced the pool
    expect(ba.schemaTokens).toBeLessThanOrEqual(toolSchemaTokenCap(budget));
  });

  it('explicit cap trims MCP schemas; an unreachable cap flags capExceeded', () => {
    const capped = buildSessionToolLoadout({ role: 'SM', mcpTools: pool, schemaTokenCap: 1000 });
    expect(capped.schemaTokens).toBeLessThanOrEqual(1000);
    expect(capped.capExceeded).toBe(false);
    const impossible = buildSessionToolLoadout({ role: 'SM', mcpTools: pool, schemaTokenCap: 1 });
    expect(impossible.capExceeded).toBe(true);
    expect(impossible.loadout).toEqual([...CORE_FILE_TOOLS, ...DISCOVERY_TOOLS]); // BR-06 minimum
    const minimal = buildSessionToolLoadout({ role: 'SM', mcpTools: pool, minimal: true });
    expect(minimal.minimal).toBe(true);
    expect(minimal.loadout).toEqual([...CORE_FILE_TOOLS, ...DISCOVERY_TOOLS]);
  });
});
