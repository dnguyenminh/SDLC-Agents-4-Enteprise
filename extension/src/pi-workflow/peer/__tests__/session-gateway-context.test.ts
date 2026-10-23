/**
 * SA4E-369 UAT layer-3 fix — the gateway seam injects the captured provider
 * context (baseUrl/apiKey/mcpBridge — captured from the FIRST host creation)
 * into every PeerSessionRequest. Without it, a peer turn dispatching to a tab
 * with NO cached host could not create one: keyless → no gateway baseUrl →
 * PI_MODEL_UNRESOLVED; cloud → no key → "Provider is not configured". The
 * task died as PEER_003 in the receiving tab (UAT 2026-10-23 23:08).
 * Identity fields (tab/role/workspaceRoot) always stay registry-sourced (SEC-08).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mocks } = vi.hoisted(() => ({
  mocks: { ensureSessionHost: vi.fn(async () => ({ promptTurn: vi.fn(async () => ({ text: 'ok' })) })) },
}));

vi.mock('../../session-host/registry.js', () => ({
  ensureSessionHost: (...args: unknown[]) => mocks.ensureSessionHost(...args),
  evictSessionHost: vi.fn(),
}));

import {
  sessionHostGateway,
  setSessionHostGatewayContext,
  resetSessionHostGatewayContext,
} from '../session-gateway.js';
import type { PeerSessionRequest } from '../types.js';

const IDENTITY: PeerSessionRequest = {
  workspaceRoot: '/ws',
  providerId: 'lmstudio',
  configuredModelId: '',
  role: '',
  activeAgentId: '',
  tabId: 'tab-b',
};

describe('sessionHostGateway — provider context injection (UAT layer-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetSessionHostGatewayContext();
  });

  it('GATEWAY-01: no context captured → request passes through unchanged (identity only)', async () => {
    await sessionHostGateway.ensureSessionHost(IDENTITY);
    expect(mocks.ensureSessionHost).toHaveBeenCalledWith(IDENTITY);
  });

  it('GATEWAY-02: context injected — baseUrl/apiKey/mcpBridge/nCtxDetected ride along; identity stays registry-sourced', async () => {
    setSessionHostGatewayContext({
      providerId: 'lmstudio',
      baseUrl: 'http://localhost:1234/v1',
      apiKey: 'keyless-local',
      configuredModelId: '',
      mcpBridge: { bridge: true },
      nCtxDetected: 65536,
    });

    await sessionHostGateway.ensureSessionHost(IDENTITY);

    expect(mocks.ensureSessionHost).toHaveBeenCalledWith(
      expect.objectContaining({
        // identity (SEC-08) — untouched
        workspaceRoot: '/ws',
        tabId: 'tab-b',
        role: '',
        activeAgentId: '',
        // provider context — merged
        baseUrl: 'http://localhost:1234/v1',
        apiKey: 'keyless-local',
        mcpBridge: { bridge: true },
        nCtxDetected: 65536,
      })
    );
  });

  it('GATEWAY-03: empty registry configuredModelId does NOT override the working context value', async () => {
    setSessionHostGatewayContext({ providerId: 'lmstudio', configuredModelId: 'qwen-text', baseUrl: 'http://localhost:1234/v1' });

    await sessionHostGateway.ensureSessionHost(IDENTITY);

    expect(mocks.ensureSessionHost).toHaveBeenCalledWith(
      expect.objectContaining({ configuredModelId: 'qwen-text' })
    );
  });

  it('GATEWAY-04: explicit request fields win over the context (no stomp)', async () => {
    setSessionHostGatewayContext({ providerId: 'lmstudio', baseUrl: 'http://context-url/v1', configuredModelId: 'ctx-model' });

    await sessionHostGateway.ensureSessionHost({ ...IDENTITY, configuredModelId: 'req-model' });

    expect(mocks.ensureSessionHost).toHaveBeenCalledWith(
      expect.objectContaining({ configuredModelId: 'req-model', baseUrl: 'http://context-url/v1' })
    );
  });
});
