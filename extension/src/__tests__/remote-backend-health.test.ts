/**
 * Unit tests for RemoteBackendClient.checkHealth() — verifies it uses fetch() (proxy-patched).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "C:\\ws\\test" } }],
    getConfiguration: () => ({ get: (_k: string, def?: unknown) => def }),
  },
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn() }),
  },
  EventEmitter: class {
    private listeners: Array<(e: any) => void> = [];
    event = (listener: (e: any) => void) => { this.listeners.push(listener); return { dispose: () => {} }; };
    fire(data: any): void { this.listeners.forEach(l => l(data)); }
    dispose(): void { this.listeners = []; }
  },
}));

vi.mock("../auth/AuthManager", () => ({ AuthManager: class {} }));
vi.mock("../services/Base64ProxyService", () => ({ Base64ProxyService: class {} }));
vi.mock("../services/WrapperServer", () => ({ WrapperServer: class { async stop() {} } }));
vi.mock("../backend-local-tools", () => ({ getVisibleLocalToolDefinitions: () => [] }));
vi.mock("../utils/http-client-utils", () => ({
  httpGetJson: vi.fn(),
  httpPostJson: vi.fn(),
}));
vi.mock("../utils/backend-auth-headers", () => ({
  buildBackendAuthHeaders: () => ({}),
}));
vi.mock("../mcp/PegaMcpTools", () => ({ PegaMcpTools: class {} }));
vi.mock("../mcp/pega-local-tools", () => ({ registerPegaLocalTools: vi.fn() }));
vi.mock("../services/AtlassianCredentialService", () => ({ AtlassianCredentialService: class {} }));
vi.mock("../mcp/atlassian/index", () => ({ registerAtlassianLocalTools: vi.fn() }));
vi.mock("../mcp/devtools-bridge", () => ({ registerDevtoolsTools: () => Promise.resolve() }));

import { RemoteBackendClient } from "../remote-backend-client";
import * as vscode from "vscode";

describe("RemoteBackendClient.checkHealth() — proxy-compliant fetch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let outputChannel: vscode.OutputChannel;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    outputChannel = vscode.window.createOutputChannel("test") as any;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls fetch with backend /health URL", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    const client = new RemoteBackendClient("C:\\ws", outputChannel, undefined, "http://localhost:48721");
    // connect() calls checkHealth() internally
    // We need to mock WrapperServer start — use prototype access
    await (client as any).checkHealth();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:48721/health");
  });

  it("passes AbortSignal.timeout for 5s timeout", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    const client = new RemoteBackendClient("C:\\ws", outputChannel, undefined, "http://localhost:48721");
    await (client as any).checkHealth();

    const [, init] = fetchMock.mock.calls[0];
    expect(init.signal).toBeDefined();
  });

  it("resolves successfully on HTTP 200", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    const client = new RemoteBackendClient("C:\\ws", outputChannel, undefined, "http://localhost:48721");

    await expect((client as any).checkHealth()).resolves.toBeUndefined();
  });

  it("throws on non-200 status", async () => {
    fetchMock.mockResolvedValue({ status: 503 });

    const client = new RemoteBackendClient("C:\\ws", outputChannel, undefined, "http://localhost:48721");

    await expect((client as any).checkHealth()).rejects.toThrow("Health check failed: 503");
  });

  it("throws on network error (fetch rejects)", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    const client = new RemoteBackendClient("C:\\ws", outputChannel, undefined, "http://localhost:48721");

    await expect((client as any).checkHealth()).rejects.toThrow("ECONNREFUSED");
  });

  it("uses the correct backend URL from constructor", async () => {
    fetchMock.mockResolvedValue({ status: 200 });

    const client = new RemoteBackendClient("C:\\ws", outputChannel, undefined, "https://remote.server:9000");
    await (client as any).checkHealth();

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://remote.server:9000/health");
  });
});

// SA4E-320 — updateBackendUrl re-points the client at a new URL without reload.
describe("RemoteBackendClient.updateBackendUrl() — no-reload URL switch", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let outputChannel: vscode.OutputChannel;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    outputChannel = vscode.window.createOutputChannel("test") as any;
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("switches health probe to the new URL after updateBackendUrl", async () => {
    const client = new RemoteBackendClient("C:\\ws", outputChannel, undefined, "http://127.0.0.1:48721");
    // Avoid real wrapper start during the reconnect triggered by updateBackendUrl.
    vi.spyOn(client as any, "startWrapper").mockResolvedValue(undefined);

    await client.updateBackendUrl("http://sdlc.detalvn.vn:48721");

    await (client as any).checkHealth();
    const lastUrl = fetchMock.mock.calls.at(-1)?.[0];
    expect(lastUrl).toBe("http://sdlc.detalvn.vn:48721/health");
    expect(client.port).toBe(48721);
  });

  it("is a no-op when the URL is unchanged (no reconnect)", async () => {
    const client = new RemoteBackendClient("C:\\ws", outputChannel, undefined, "http://127.0.0.1:48721");
    const reconnectSpy = vi.spyOn(client, "reconnect");
    await client.updateBackendUrl("http://127.0.0.1:48721");
    expect(reconnectSpy).not.toHaveBeenCalled();
  });
});
