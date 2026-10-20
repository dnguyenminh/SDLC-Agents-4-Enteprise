/**
 * SA4E-369 — shared peer test harness. Mock session gateway (TDD §11.3: no
 * network, no model calls); every suite builds fresh singletons (I-9).
 */
import { vi } from 'vitest';
import { PeerBus } from '../../pi-workflow/peer/bus.js';
import { dispatchPeerTurn } from '../../pi-workflow/peer/dispatch.js';
import { AntiLoopGuards } from '../../pi-workflow/peer/guards.js';
import { PeerRegistry } from '../../pi-workflow/peer/registry.js';
import { PeerTaskManager } from '../../pi-workflow/peer/task-manager.js';
import { PeerThreadStore } from '../../pi-workflow/peer/threads.js';
import type {
  PeerRegistryRegistration,
  PeerSessionGateway,
  PeerSessionRequest,
  PeerToolApprovalHandler,
} from '../../pi-workflow/peer/types.js';

export const TAB_A = 'tab-a';
export const TAB_B = 'tab-b';
export const TAB_C = 'tab-c';

export type PromptTurnMock = ReturnType<typeof vi.fn>;

export interface PeerHarness {
  bus: PeerBus;
  registry: PeerRegistry;
  guards: AntiLoopGuards;
  threads: PeerThreadStore;
  tasks: PeerTaskManager;
  promptTurn: PromptTurnMock;
  ensureCalls: PeerSessionRequest[];
  evictCalls: Array<[string, string]>;
  wrappedPrompts: string[];
  /** S-01/S-02 acceptance: the SessionTurnOptions each turn received. */
  turnOriginOpts: Array<{ turnOrigin?: string } | undefined>;
}

/** Registration meta with all SEC-08 session-creation inputs. */
export function metaFor(tabId: string, overrides?: Partial<PeerRegistryRegistration>): PeerRegistryRegistration & { tabId: string } {
  return {
    tabId,
    workspaceRoot: '/ws',
    providerId: 'test-provider',
    configuredModelId: 'test-model',
    activeAgentId: `agent-${tabId}`,
    agentName: `Agent ${tabId.toUpperCase()}`,
    role: 'coder',
    capabilities: ['implement'],
    model: 'test-model',
    status: 'idle',
    ...overrides,
  };
}

export function makeHarness(opts?: {
  promptTurn?: PromptTurnMock;
  approval?: PeerToolApprovalHandler;
}): PeerHarness {
  const registry = new PeerRegistry();
  const guards = new AntiLoopGuards();
  const threads = new PeerThreadStore();
  const tasks = new PeerTaskManager();
  const promptTurn =
    opts?.promptTurn ?? vi.fn(async () => ({ text: 'mock reply' }));
  const ensureCalls: PeerSessionRequest[] = [];
  const evictCalls: Array<[string, string]> = [];
  const wrappedPrompts: string[] = [];
  const turnOriginOpts: Array<{ turnOrigin?: string } | undefined> = [];
  const capturingTurn = async (text: string, opts2?: { turnOrigin?: string }) => {
    wrappedPrompts.push(text);
    turnOriginOpts.push(opts2);
    return (promptTurn as (t: string, o?: unknown) => Promise<{ text: string }>)(text, opts2);
  };
  const gateway: PeerSessionGateway = {
    ensureSessionHost: async (req) => {
      ensureCalls.push(req);
      return { promptTurn: capturingTurn };
    },
    evictSessionHost: (root, tabId) => void evictCalls.push([root, tabId]),
  };
  const busRef: { current?: PeerBus } = {};
  const bus = new PeerBus({
    registry,
    guards,
    tasks,
    threads,
    gateway,
    dispatch: (tabId) => dispatchPeerTurn(busRef.current as PeerBus, tabId),
    approval: opts?.approval,
  });
  busRef.current = bus;
  return { bus, registry, guards, threads, tasks, promptTurn, ensureCalls, evictCalls, wrappedPrompts, turnOriginOpts };
}

/** Drains the setImmediate dispatch chain so async turn work settles. */
export async function flushTurn(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
