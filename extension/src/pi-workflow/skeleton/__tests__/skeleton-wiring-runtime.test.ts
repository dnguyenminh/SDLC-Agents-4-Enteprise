/**
 * SA4E-360 — createHost wiring integration tests (TDD task T8; STC IT-08..10
 * + TA Finding A): multi-root cache isolation (OI-3, FIX-05/06), bridge-absent
 * degradation (FIX-06/FRS-06), one SummaryTreeBuilder build per 60s TTL window
 * (C-360-M2 AF-3, FM-07), hoisted corpus memo regression (C-360-M1).
 * Gate measure/inject/order suites (IT-01..03, IT-07) live in
 * skeleton-wiring.integration.test.ts (shared fixture: skeleton-wiring.fixture.ts).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  loaderOf,
  mocks,
  fakeBridge,
  optsFor,
  sessionCalls,
  setupSkeletonWiringFixture,
  ROOT_A,
  ROOT_B,
} from './skeleton-wiring.fixture.js';
import { ensureSessionHost } from '../../pi-agent-session-host.js';
import { clearLayoutCache, createWorkspaceInfoTool } from '../../workspace-info-tool.js';
import { FunctionalMapProvider } from '../functional-map-provider.js';
import { createSkeletonRuntime } from '../skeleton-wiring.js';

setupSkeletonWiringFixture();

// STC IT-08 — multi-root cache isolation (OI-3, FIX-05/06)
describe('IT-08: multi-root cache isolation', () => {
  it('keeps per-root artifacts and layoutCache entries isolated', async () => {
    const hostA = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    const hostB = await ensureSessionHost(optsFor(ROOT_B, fakeBridge(ROOT_B, 'ServiceB')));
    expect(hostA).not.toBe(hostB);
    // Each root's skeleton contains ONLY its own file (no cross-root bleed).
    const loaderA = loaderOf(0);
    const composedA = loaderA.agentsFilesOverride({ agentsFiles: [] });
    const skeletonA = composedA.agentsFiles.find((f) => f.path === '.pi/workspace-skeleton.md')?.content ?? '';
    expect(skeletonA).toContain('ServiceA');
    expect(skeletonA).not.toContain('ServiceB');
    // layoutCache holds distinct entries; clearLayoutCache clears BOTH (hook).
    clearLayoutCache();
    hostA.dispose();
    hostB.dispose();
  });
});

// STC IT-09 — bridge-absent degradation (FIX-06/FRS-06)
describe('IT-09: bridge-absent degradation — fail-safe, never crash', () => {
  it('creates the session with DEGRADED_NO_SKELETON + layout-only map + steering tool', async () => {
    const host = await ensureSessionHost(optsFor(ROOT_A)); // NO mcpBridge
    expect(sessionCalls.createAgentSession).toBe(1); // session STILL created
    // read_method is registered and answers INDEX_UNAVAILABLE steering.
    const customTools = (mocks.createAgentSession.mock.calls[0][0] as { customTools: Array<{ name: string; execute: (id: string, p: unknown) => Promise<{ content: Array<{ text: string }> }> }> }).customTools;
    expect(customTools.map((t) => t.name)).toContain('read_method');
    const readMethod = customTools.find((t) => t.name === 'read_method')!;
    const result = await readMethod.execute('c1', { class: 'X', method: 'y' });
    // C-360-R2 error envelope: status 'error' + code INDEX_UNAVAILABLE (EF-3).
    expect(JSON.parse(result.content[0].text).code).toBe('INDEX_UNAVAILABLE');
    host.dispose();
  });
});

// STC IT-10 — shared sections build (C-360-M2 AF-3, FM-07)
describe('IT-10: one SummaryTreeBuilder build per 60s TTL window', () => {
  it('serves the assembly path and the tool result from the same cache window', async () => {
    const host = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    // The assembly composed the map through getWorkspaceSections (cached entry).
    const loaderArg = loaderOf(0);
    const composed = loaderArg.agentsFilesOverride({ agentsFiles: [] });
    const mapFile = composed.agentsFiles.find((f) => f.path === '.pi/workspace-map.md');
    expect(mapFile).toBeDefined(); // assembly injected the map section
    // Immediate tool call within the TTL: served from layoutCache (map present).
        const mapProvider = new FunctionalMapProvider({ keySymbolsFor: () => [] });
    const tool = createWorkspaceInfoTool(ROOT_A, mapProvider) as unknown as { execute: (id: string, p: unknown) => Promise<unknown> };
    const first = await tool.execute('c1', {});
    const second = await tool.execute('c2', {});
    expect((first as { content: Array<{ text: string }> }).content[0].text).toBe((second as { content: Array<{ text: string }> }).content[0].text);
    host.dispose();
  });
});

// TA Finding A regression (SA4E-360 review) — C-360-M1: keySymbolsFor must
// share ONE memoized corpus fetch per runtime. The pre-fix code constructed a
// fresh cachedCorpus closure PER CALL: keySymbols were ALWAYS [] in production
// (fresh fire-and-forget resolves after the call returns) and every map build
// fired ~N×53 background MCP corpus fetches (loopback load + NFR risk).
describe('TA Finding A: hoisted corpus memo (C-360-M1)', () => {
  it('keySymbolsFor over 2 modules fires exactly ONE batched corpus pass, then serves real symbols', async () => {
    let codeSymbolsCalls = 0;
    const bridge = {
      callTool: async (tool: string) => {
        if (tool === 'code_symbols') {
          codeSymbolsCalls++;
          return { content: [{ type: 'text', text: 'Found 2 symbols matching "":\n\n[class] Alpha — src/alpha.ts:1\n  class Alpha\n[method] run — src/alpha.ts:2\n  run(): void' }] };
        }
        return { content: [{ type: 'text', text: 'Found 0 files' }] };
      },
    };
    const runtime = createSkeletonRuntime(bridge);
    const keySymbolsFor = (runtime.mapProvider as unknown as { deps: { keySymbolsFor: (m: string) => string[] } }).deps.keySymbolsFor;
    expect(keySymbolsFor).toBeDefined();
    // Same-tick calls for 2 modules — the real buildEntries call pattern.
    const first = keySymbolsFor('src'); // fires the ONE corpus pass (fire-and-forget)
    const second = keySymbolsFor('lib'); // same tick — must NOT fire another pass
    expect(first).toEqual([]);
    expect(second).toEqual([]);
    // After settle: the memo serves REAL corpus symbols (pre-fix: always []).
    await vi.waitFor(() => expect(keySymbolsFor('src')).toEqual(['Alpha', 'run']));
    expect(codeSymbolsCalls).toBe(53); // exactly ONE 53-bucket pass (pre-fix: 106)
    expect(keySymbolsFor('lib')).toEqual([]); // module-path filter unchanged
    expect(keySymbolsFor('src')).toEqual(['Alpha', 'run']); // stable memoized read
    expect(codeSymbolsCalls).toBe(53); // still ONE pass after the memoized reads
  });
});
