/**
 * SA4E-369 UAT root-cause fix — ACCEPTANCE: a keyless LOCAL provider tab
 * (lmstudio) now gets a real session host, which is what registers
 * peer_list/peer_send/peer_status in EVERY tab (UG §4). Before the fix the
 * stale "local → legacy ALWAYS" gate meant createHost never ran for local
 * providers and the peer tools did not exist (user-reported UAT bug:
 * §2.1 Quick Start Step 3 failed on lmstudio).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSessionHost, clearSessionHostCache } from '../pi-agent-session-host.js';
import { mocks, sessionOpts } from './bridge-wiring-session-mocks.js';

// SA4E-369: intercept the gateway chain — model-resolution fetches /v1/models
// and registers the shared gateway provider natively for keyless providers.
vi.mock('../../chat-panel/chat-models.js', () => ({
  fetchGatewayModels: (...args: unknown[]) => mocks.fetchGatewayModels(...args),
}));
vi.mock('../pi-gateway-provider.js', () => ({
  createGatewayProvider: (...args: unknown[]) => mocks.createGatewayProvider(...args),
}));

const GATEWAY_MODELS = [
  { id: 'qwen2.5-coder-7b-instruct', name: 'Qwen2.5 Coder 7B', contextWindow: 65536 },
];

const PEER_TOOLS = ['peer_list', 'peer_send', 'peer_status'] as const;

describe('PiAgentSessionHost — SA4E-369 peer tools for keyless LOCAL providers', () => {
  beforeEach(() => {
    clearSessionHostCache();
    mocks.promptCalls.length = 0;
    mocks.sessionOpts = undefined;
    mocks.fetchGatewayModels.mockResolvedValue(GATEWAY_MODELS);
  });

  it('LMSTUDIO-01: lmstudio host registers the 3 peer tools + orientation tools (AC7/D4 in EVERY tab)', async () => {
    const host = await ensureSessionHost({
      tabId: 'tab-lm-1',
      workspaceRoot: 'C:/ws/sa4e369-lm1',
      providerId: 'lmstudio',
      baseUrl: 'http://localhost:1234/v1',
      configuredModelId: '',
    });
    const names = (sessionOpts().customTools ?? []).map((t) => t.name);
    for (const name of PEER_TOOLS) expect(names).toContain(name);
    expect(names).toEqual(expect.arrayContaining(['get_workspace_info', 'read_method']));
    // UAT layer-2 fix: the SDK (AgentSession.isAllowedTool) filters customTools
    // THROUGH the `tools` allowlist — the peer names MUST be in the allowlist
    // or they never reach the model's tool pool (the 103-test suite missed
    // this because it asserted pre-filter customTools only).
    const allowlist = sessionOpts().tools ?? [];
    for (const name of PEER_TOOLS) expect(allowlist).toContain(name);
    host.dispose();
  });

  it('LMSTUDIO-02: keyless auth seeded (LOCAL_KEYLESS_PLACEHOLDER) — no API key demanded', async () => {
    const host = await ensureSessionHost({
      tabId: 'tab-lm-2',
      workspaceRoot: 'C:/ws/sa4e369-lm2',
      providerId: 'lmstudio',
      baseUrl: 'http://localhost:1234/v1',
      configuredModelId: '',
    });
    expect(mocks.setRuntimeApiKey).toHaveBeenCalledWith('lmstudio', 'keyless-local');
    host.dispose();
  });

  it('LMSTUDIO-03: session host registry identity carries the lmstudio provider (PeerRegistry source)', async () => {
    const host = await ensureSessionHost({
      tabId: 'tab-lm-3',
      workspaceRoot: 'C:/ws/sa4e369-lm3',
      providerId: 'lmstudio',
      baseUrl: 'http://localhost:1234/v1',
      configuredModelId: '',
    });
    // A turn through the host proves the session is live end-to-end.
    await host.promptTurn('ping');
    expect(mocks.promptCalls).toContain('ping');
    host.dispose();
  });
});
