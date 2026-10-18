/**
 * SA4E-360 — createHost wiring integration tests (TDD task T8; STC IT-01..03,
 * IT-07). REAL components: createHost + shipped gates (session-budget-gate
 * → budget-gate ladder) + real workspace fixtures. The pi-coding-agent SDK and
 * the MCP transport are scripted fakes (CI has no llama-server / backend).
 * Multi-root isolation / bridge-absent / shared-map suites (IT-08..10, TA
 * Finding A) live in skeleton-wiring-runtime.test.ts
 * (shared fixture: skeleton-wiring.fixture.ts).
 * Fixture data: budget-scenarios-testdata.csv BUD-07/BUD-08; TRC-11.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  callOrder,
  gateCapture,
  loaderOf,
  logs,
  mocks,
  fakeBridge,
  optsFor,
  sessionCalls,
  setupSkeletonWiringFixture,
  ROOT_A,
} from './skeleton-wiring.fixture.js';
import { ensureSessionHost } from '../../pi-agent-session-host.js';
import { SkeletonProvider } from '../skeleton-provider.js';

setupSkeletonWiringFixture();

// STC IT-01 — gate #2 measure == inject (byte-identical, INV-2)
describe('IT-01: gate #2 measure == inject', () => {
  it('measures the same strings it injects as virtual context files', async () => {
    const host = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    expect(host).toBeDefined();
    const entries = gateCapture.loadFilesResult ?? [];
    const skeletonEntry = entries.find((e) => e.content.includes('// ServiceA.ts'));
    expect(skeletonEntry).toBeDefined(); // skeleton entered gate #2 as a context file
    // The DefaultResourceLoader received an agentsFilesOverride — run it to
    // capture the injected virtual file and compare byte-for-byte.
    expect(mocks.createAgentSession.mock.calls).toHaveLength(1);
    const loaderArg = loaderOf(0);
    const base = { agentsFiles: [{ path: 'AGENTS.md', content: 'base' }] };
    const composed = loaderArg.agentsFilesOverride(base);
    const injected = composed.agentsFiles.find((f) => f.path === '.pi/workspace-skeleton.md');
    expect(injected?.content).toBe(skeletonEntry?.content); // BYTE-IDENTICAL (INV-2)
    host.dispose();
  });
});

// STC IT-02 — gate order: skeleton measured BEFORE createAgentSession (BUD-08/GO-01..03)
describe('IT-02: gate order + OI-5 telemetry', () => {
  it('resolves budget → builds sections → measures → creates session (in order)', async () => {
    const realGetSections = SkeletonProvider.prototype.getSections;
    vi.spyOn(SkeletonProvider.prototype, 'getSections').mockImplementation(async function (this: SkeletonProvider, ...args) {
      callOrder.push('getSections');
      return realGetSections.apply(this, args) as never;
    });
    logs.length = 0;
    const host = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    expect(callOrder.indexOf('gate')).toBeGreaterThan(-1);
    expect(callOrder.indexOf('gate')).toBeLessThan(callOrder.indexOf('createAgentSession')); // GO-02
    // GO-03: PI_GATE_DECISION enriched payload (OI-5).
    const decision = logs.filter((l) => l.event === 'PI_GATE_DECISION');
    const enriched = decision.find((l) => (l.payload as { measurementPoint?: string }).measurementPoint === 'turn-start gate #2, before createAgentSession');
    expect(enriched).toBeDefined();
    expect((enriched!.payload as { skeletonTokens: number }).skeletonTokens).toBeGreaterThan(0);
    expect((enriched!.payload as { truncationApplied: boolean }).truncationApplied).toBe(false);
    host.dispose();
    vi.restoreAllMocks();
  });
});

// STC IT-03 — forced oversized skeleton → REJECT; provider NEVER called (TRC-11)
describe('IT-03: forced oversized skeleton → REJECT', () => {
  it('throws PiContextBudgetExceededError after the full ladder; no session, no provider call', async () => {
    const oversized = 'x'.repeat(30_000 * 4); // TRC-11: 30,000 tokens vs cap 13,767
    vi.spyOn(SkeletonProvider.prototype, 'getSections').mockResolvedValue({
      skeleton: {
        skeletonContent: oversized,
        skeletonTokens: 30_000,
        truncationApplied: true,
        fallbackFiles: 0,
        skippedFiles: 0,
        gateDecision: 'REJECT',
      },
    });
    logs.length = 0;
    await expect(ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')))).rejects.toThrow(/PI_CONTEXT_BUDGET_EXCEEDED/);
    expect(sessionCalls.createAgentSession).toBe(0); // provider NEVER called (BR-09)
    // BR-08 ladder attempts logged BEFORE the REJECT.
    const escalations = logs.filter((l) => l.event === 'PI_GATE_ESCALATION').map((l) => (l.payload as { step: string }).step);
    expect(escalations).toEqual(['compress', 'drop-steering', 'min-loadout']);
    const reject = logs.find((l) => l.event === 'PI_CONTEXT_BUDGET_EXCEEDED');
    expect(reject?.payload).toMatchObject({ staticBudget: 19_668, nCtx: 32_768 });
    vi.restoreAllMocks();
  });
});

// STC IT-07 — BR-08 escalation ladder over skeleton content (ESC-01..04)
describe('IT-07: escalation ladder order over skeleton content', () => {
  it('within-share sessions run NO escalation (ladder order proven in IT-03)', async () => {
    logs.length = 0;
    const host = await ensureSessionHost(optsFor(ROOT_A, fakeBridge(ROOT_A, 'ServiceA')));
    expect(logs.filter((l) => l.event === 'PI_GATE_ESCALATION')).toHaveLength(0); // within share
    host.dispose();
  });
});
