import { describe, it, expect } from 'vitest';
import { resolveContextBudget } from '../context-budget-resolver.js';
import {
  buildSessionToolLoadout,
  CORE_FILE_TOOLS,
  DISCOVERY_TOOLS,
  nameTools,
  toolSchemaTokenCap,
  TOOL_SCHEMA_BUDGET_RATIO,
  type LoadoutOptions,
} from '../tool-loadout.js';

// STC: STC-304 — BR-06: core + discovery invariant across all roles + minimal mode
// STC: cap derivation — 25% of staticBudget (FSD §3.4.4)

const budget32k = resolveContextBudget({ modelId: 'qwen', nCtxDetected: 32768 });

/** Core names incl. the OS shell slot + orientation tool (SA4E-336 shape). */
const CORE_WITH_SHELL = ['read', 'write', 'edit', 'grep', 'find', 'ls', 'bash', 'get_workspace_info'];

/** BR-06 non-negotiable set: 7 core (incl. shell) + discovery pair. */
const REQUIRED_9 = [...CORE_WITH_SHELL, ...DISCOVERY_TOOLS];

/** Tool fixture with an exact precomputed schema-token cost (OI-4 test double). */
const tool = (name: string, schemaTokens: number) => ({ name, schemaTokens });

/** Zero-cost name-only tools — keeps token arithmetic exact. */
const zero = (names: readonly string[]) => names.map((name) => ({ name, schemaTokens: 0 }));

/** Standard options with the OS-aware core + discovery defaults. */
function options(o: Partial<LoadoutOptions> & { mcpTools?: Array<{ name: string; schemaTokens?: number }> }): LoadoutOptions {
  return {
    coreTools: zero(CORE_WITH_SHELL),
    discoveryTools: zero(DISCOVERY_TOOLS),
    ...o,
  };
}

describe('STC-304 — BR-06 core + discovery invariant across every role', () => {
  const ROLES = ['SM', 'BA', 'SA', 'DEV', 'QA', 'DevOps', 'UI', 'Security', 'intern-x'];

  it.each(ROLES)('role=%s: loadout always contains the 9 non-negotiable tools', (role) => {
    const res = buildSessionToolLoadout(
      options({ role, phase: 'implementation', mcpTools: [tool('git_diff', 50), tool('deploy_stack', 50)] })
    );
    expect(res.loadout).toEqual(expect.arrayContaining(REQUIRED_9));
  });

  it('minimal mode keeps the same 9 tools for every role', () => {
    for (const role of ROLES) {
      const res = buildSessionToolLoadout(options({ role, minimal: true, mcpTools: [tool('git_diff', 50)] }));
      expect(res.loadout).toEqual(expect.arrayContaining(REQUIRED_9));
    }
  });
});

describe('cap derivation + defaults (FSD §3.4.4)', () => {
  it('toolSchemaTokenCap derives the cap from the session budget (25% share)', () => {
    expect(TOOL_SCHEMA_BUDGET_RATIO).toBe(0.25);
    expect(toolSchemaTokenCap(budget32k)).toBe(4917); // floor(19668 × 0.25)
  });

  it('defaults: core file tools + discovery pair with no pool and no cap', () => {
    const res = buildSessionToolLoadout({});
    expect(res.loadout).toEqual([...CORE_FILE_TOOLS, ...DISCOVERY_TOOLS]);
    expect(res.schemaTokens).toBeGreaterThan(0); // name-only OI-4 estimates
    expect(res.capExceeded).toBe(false);
  });

  it('nameTools wraps bare names as loadout entries', () => {
    expect(nameTools(['read', 'ls']).map((t) => t.name)).toEqual(['read', 'ls']);
  });
});
