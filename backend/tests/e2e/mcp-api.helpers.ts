/**
 * Shared client for MCP E2E API tests (KSA-284).
 * See mcp-api.*.test.ts files in this folder.
 * Run: npx vitest run tests/e2e/mcp-api.*.test.ts
 */
import { BASE_URL, API_URL, E2E_PASSWORD } from './setup/e2e-config.js';

export const ADMIN_USERNAME = 'admin';
export function getAdminPassword(): string {
  return process.env.ADMIN_INITIAL_PASSWORD || E2E_PASSWORD;
}

export interface McpClient {
  init(): Promise<void>;
  authFetch(path: string, init?: RequestInit): Promise<Response>;
  callToolJson(toolName: string, args: Record<string, unknown>): Promise<any>;
}

/** Per-file client instance: authenticates in init(), then serves requests. */
export function makeMcpClient(): McpClient {
  let authToken = '';

  async function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-Project-Id': 'default',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...((init.headers as Record<string, string>) || {}),
      },
    });
  }

  async function callToolJson(toolName: string, args: Record<string, unknown>): Promise<any> {
    const res = await authFetch('/mcp/tools/call', {
      method: 'POST',
      body: JSON.stringify({ tool_name: toolName, arguments: args }),
    });
    const data = await res.json();
    if (data.isError) {
      const errText = Array.isArray(data.content)
        ? data.content.map((c: any) => c?.text).filter(Boolean).join(' | ')
        : '';
      console.error(
        `[E2E ToolError] ${toolName} status=${res.status} args=${JSON.stringify(args)} ` +
          `error=${errText || JSON.stringify(data)}`,
      );
    }
    return data;
  }

  async function init(): Promise<void> {
    try {
      const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok && res.status !== 503) throw new Error(`Health check returned ${res.status}`);
    } catch (err) {
      throw new Error(
        `Server is not running at ${BASE_URL}. Start it with "npm run dev" before running E2E tests.\n` +
          `Original error: ${err}`,
      );
    }
    // Give ensureEngineIndexSchema a moment to finish creating FTS tables
    await new Promise(r => setTimeout(r, 2000));

    // Authenticate to get JWT/session token for protected MCP endpoints
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: ADMIN_USERNAME, password: getAdminPassword() }),
    });
    if (loginRes.ok) {
      const data = await loginRes.json();
      authToken = data.token || '';
    }
  }

  return { init, authFetch, callToolJson };
}
