import { describe, it, expect } from 'vitest';
import {
  buildSessionToolLoadout,
  DISCOVERY_TOOLS,
  type LoadoutOptions,
} from '../tool-loadout.js';

// STC: STC-009 — BA loadout: core + discovery present; NO git/build/deploy/pipeline (BR-06)
// STC: STC-010 — DEV has git/build (no deploy); SM has jira + coordination (BR-06)
// STC: STC-017 — SM regression: essential tools never lost
// STC: STC-107 — absent tool reachable via find_tools + execute_dynamic_tool (AF-1 UC-04)
// STC: STC-108 — unknown role loadout: permissive default (BR-07)

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

describe('buildSessionToolLoadout — role mapping (UC-04 / Task 4)', () => {
  it('STC-009: BA keeps core + discovery, never git/build/deploy/pipeline tools', () => {
    const res = buildSessionToolLoadout(
      options({
        role: 'BA',
        phase: 'specification',
        mcpTools: [
          tool('git_diff', 100),
          tool('build_project', 100),
          tool('deploy_stack', 100),
          tool('pipeline_run', 100),
          tool('docs_write_spec', 100),
          tool('mem_search', 100),
          tool('jira_get_issue', 100),
        ],
      })
    );
    expect(res.loadout).toEqual(expect.arrayContaining(REQUIRED_9));
    for (const banned of ['git_diff', 'build_project', 'deploy_stack', 'pipeline_run']) {
      expect(res.loadout).not.toContain(banned);
    }
    expect(res.loadout).toContain('docs_write_spec');
    expect(res.loadout).toContain('mem_search');
  });

  it('STC-010a: DEV keeps git/build, never deploy/pipeline', () => {
    const res = buildSessionToolLoadout(
      options({
        role: 'DEV',
        phase: 'implementation',
        mcpTools: [
          tool('git_diff', 100),
          tool('build_project', 100),
          tool('deploy_stack', 100),
          tool('pipeline_run', 100),
          tool('code_search', 100),
        ],
      })
    );
    expect(res.loadout).toEqual(
      expect.arrayContaining([...REQUIRED_9, 'git_diff', 'build_project', 'code_search'])
    );
    expect(res.loadout).not.toContain('deploy_stack');
    expect(res.loadout).not.toContain('pipeline_run');
  });

  it('STC-010b: SM keeps jira_* + coordination tools (full regression set)', () => {
    const res = buildSessionToolLoadout(
      options({
        role: 'SM',
        phase: 'coordination',
        mcpTools: [
          tool('jira_get_issue', 100),
          tool('jira_create_issue', 100),
          tool('coordination_plan', 100),
          tool('mem_search', 100),
        ],
      })
    );
    expect(res.loadout).toEqual(
      expect.arrayContaining([...REQUIRED_9, 'jira_get_issue', 'jira_create_issue', 'coordination_plan'])
    );
  });

  it('STC-017: SM regression — essential tools present across a broad pool', () => {
    const res = buildSessionToolLoadout(
      options({
        role: 'SM',
        phase: 'requirements',
        mcpTools: [
          tool('git_diff', 100),
          tool('build_project', 100),
          tool('deploy_stack', 100),
          tool('jira_get_issue', 100),
          tool('jira_create_issue', 100),
          tool('mem_search', 100),
          tool('code_search', 100),
        ],
      })
    );
    expect(res.loadout).toEqual(expect.arrayContaining(REQUIRED_9));
    expect(res.loadout).toContain('jira_get_issue');
    expect(res.loadout).toContain('code_search');
  });

  it('STC-107: drawio_export_png absent from the BA loadout; discovery pair kept reachable', () => {
    const res = buildSessionToolLoadout(
      options({ role: 'BA', phase: 'specification', mcpTools: [tool('drawio_export_png', 500)] })
    );
    expect(res.loadout).not.toContain('drawio_export_png'); // not preloaded — by design
    expect(res.loadout).toContain('find_tools'); // runtime discovery is the designed path (AF-1 UC-04)
    expect(res.loadout).toContain('execute_dynamic_tool');
  });

  it('STC-108 / STC-305: unknown role keeps the full pool (BR-07 fail-open)', () => {
    const pool = [
      tool('git_diff', 100),
      tool('deploy_stack', 100),
      tool('drawio_export_png', 100),
      tool('jira_get_issue', 100),
    ];
    const res = buildSessionToolLoadout(options({ role: 'intern-x', phase: 'requirements', mcpTools: pool }));
    for (const t of pool) {
      expect(res.loadout).toContain(t.name); // nothing lost vs permissive default
    }
  });

  it('dedupes names when the MCP pool repeats a core tool (AFT hoist)', () => {
    const res = buildSessionToolLoadout(options({ mcpTools: [tool('read', 50), tool('compress', 50)] }));
    expect(res.loadout.filter((n) => n === 'read')).toHaveLength(1);
    expect(res.loadout).toContain('compress');
  });
});
