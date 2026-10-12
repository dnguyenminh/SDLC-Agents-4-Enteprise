import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../logger', () => ({
  logger: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

import { logger } from '../../logger';
import {
  buildSessionToolLoadout,
  DISCOVERY_TOOLS,
  type LoadoutOptions,
} from '../tool-loadout.js';

// STC: STC-019 — schema cap: total ≤ cap, lowest phase-priority trimmed first
// STC: STC-204 — cap unreachable at min set → core + discovery kept + PI_TOOL_SCHEMA_CAP (EF-1 UC-04)

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

describe('buildSessionToolLoadout — schema cap + trim order (STC-019 / STC-204)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /** STC-019 fixtures: raw total 2,400 > cap 2,000. */
  const stc019Pool = () => [
    tool('jira_get_issue', 600),
    tool('jira_create_issue', 600),
    tool('mem_search', 300),
    tool('mem_ingest', 400),
    tool('drawio_export_png', 500),
  ];

  it('STC-019: drops the lowest-priority tool first and lands within the cap', () => {
    const res = buildSessionToolLoadout(
      options({ role: 'QA', phase: 'test-planning', schemaTokenCap: 2000, mcpTools: stc019Pool() })
    );
    expect(res.loadout).not.toContain('drawio_export_png'); // lowest priority for test-planning — dropped first
    expect(res.loadout).toEqual(
      expect.arrayContaining(['jira_get_issue', 'jira_create_issue', 'mem_search', 'mem_ingest'])
    );
    expect(res.schemaTokens).toBe(1900); // exact accounting (core+discovery cost 0 in this fixture)
    expect(res.schemaTokens).toBeLessThanOrEqual(2000);
    expect(res.capExceeded).toBe(false);
  });

  it('STC-019 order: ties keep trimming by pool order — drawio, then mem_ingest', () => {
    const res = buildSessionToolLoadout(
      options({ role: 'QA', phase: 'test-planning', schemaTokenCap: 1600, mcpTools: stc019Pool() })
    );
    // 2400 > 1600 → drawio (500) → 1900 > 1600 → mem_ingest (400) → 1500 ≤ 1600.
    expect(res.loadout).not.toContain('drawio_export_png');
    expect(res.loadout).not.toContain('mem_ingest');
    expect(res.loadout).toEqual(expect.arrayContaining(['jira_get_issue', 'jira_create_issue', 'mem_search']));
    expect(res.schemaTokens).toBe(1500);
  });

  it('phase preference protects design-phase drawio over non-preferred mem tools', () => {
    const res = buildSessionToolLoadout(
      options({
        role: 'SA',
        phase: 'design',
        schemaTokenCap: 1100,
        mcpTools: [tool('drawio_export_png', 500), tool('mem_search', 300), tool('mem_ingest', 400)],
      })
    );
    // 1200 > 1100 → mem_ingest (not phase-preferred) dropped; drawio (design-preferred) kept.
    expect(res.loadout).toContain('drawio_export_png');
    expect(res.loadout).not.toContain('mem_ingest');
    expect(res.schemaTokens).toBe(800);
  });

  it('STC-204: cap unreachable at min set → core + discovery kept, PI_TOOL_SCHEMA_CAP logged', () => {
    const core = [
      tool('read', 300),
      tool('write', 300),
      tool('edit', 300),
      tool('grep', 300),
      tool('find', 150),
      tool('ls', 150),
    ]; // 1,500 tokens — the fixture's core cost
    const discovery = [tool('find_tools', 250), tool('execute_dynamic_tool', 250)]; // 500
    const res = buildSessionToolLoadout(
      options({
        role: 'QA',
        phase: 'test-planning',
        schemaTokenCap: 500,
        coreTools: core,
        discoveryTools: discovery,
        mcpTools: [tool('jira_get_issue', 600)],
      })
    );
    // BR-06: the min set survives regardless — every droppable tool is removed.
    expect(res.loadout).toEqual([...core, ...discovery].map((t) => t.name));
    expect(res.loadout).not.toContain('jira_get_issue');
    expect(res.schemaTokens).toBe(2000); // still over cap — the gate owns the remainder (EF-1 UC-04)
    expect(res.capExceeded).toBe(true);
    expect(logger.warn).toHaveBeenCalledWith(
      'PI_TOOL_SCHEMA_CAP',
      expect.objectContaining({ cap: 500 })
    );
  });

  it('minimal mode (escalation step 3) keeps core + discovery only', () => {
    const res = buildSessionToolLoadout(
      options({ role: 'DevOps', phase: 'deployment', minimal: true, mcpTools: [tool('deploy_stack', 100)] })
    );
    expect(res.loadout).toEqual(expect.arrayContaining(REQUIRED_9));
    expect(res.loadout).not.toContain('deploy_stack');
    expect(res.minimal).toBe(true);
  });
});
