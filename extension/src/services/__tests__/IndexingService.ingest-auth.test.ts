/**
 * SA4E-362 — IndexingService.ingestAuthProvider() wiring (UT-11, FR-5 + GAP 4 SA4E-300).
 * Provider phải có CẢ getTokenSync + refreshToken; refresh thành công cập nhật this.token
 * để getTokenSync() các request sau trả token mới (GAP 4); chưa wired → resolves undefined.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { IndexingService } from "../IndexingService";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";

vi.mock("vscode", () => ({
  window: {
    createStatusBarItem: vi.fn(() => ({ show: vi.fn(), dispose: vi.fn() })),
    showWarningMessage: vi.fn(),
    withProgress: vi.fn(),
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), show: vi.fn() })),
  },
  workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn() })) },
  ProgressLocation: { Notification: 15 },
  StatusBarAlignment: { Left: 1 },
}));

const httpClientStub = { setOnTokenRefreshed: vi.fn() } as any;

function makeService(): IndexingService {
  return new IndexingService(httpClientStub, undefined);
}

describe("IndexingService ingestAuthProvider — SA4E-362 UT-11", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { __authTokenProvider?: () => string }).__authTokenProvider;
  });

  // STC: UT-11 — provider có cả 2 method; refresh → 'fresh-2'; getTokenSync sau refresh = 'fresh-2' (GAP 4)
  it("provider exposes getTokenSync + refreshToken; refresh updates this.token (GAP 4)", async () => {
    const svc = makeService();
    (svc as unknown as { token: string }).token = "stale-1";
    const refreshTokenFn = vi.fn(async () => "fresh-2");
    svc.setRefreshTokenFn(refreshTokenFn);

    const provider = (svc as unknown as { ingestAuthProvider(): IngestAuthProvider }).ingestAuthProvider();

    expect(typeof provider.getTokenSync).toBe("function");
    expect(typeof provider.refreshToken).toBe("function"); // không còn { getTokenSync } đơn lẻ
    expect(provider.getTokenSync()).toBe("stale-1");

    const fresh = await provider.refreshToken();
    expect(fresh).toBe("fresh-2");
    expect(refreshTokenFn).toHaveBeenCalledTimes(1);
    expect(provider.getTokenSync()).toBe("fresh-2"); // GAP 4: this.token được cập nhật
  });

  // STC: UT-11 — refreshTokenFn undefined → resolves undefined (không crash — nhánh graceful AF-1)
  it("refreshToken resolves undefined when refreshTokenFn is not wired", async () => {
    const svc = makeService();
    const provider = (svc as unknown as { ingestAuthProvider(): IngestAuthProvider }).ingestAuthProvider();
    await expect(provider.refreshToken()).resolves.toBeUndefined();
  });

  // STC: UT-11 — refreshFn throw → undefined (EF-1: refresh throw = refresh thất bại)
  it("refreshToken resolves undefined when refreshTokenFn throws", async () => {
    const svc = makeService();
    svc.setRefreshTokenFn(vi.fn(async () => { throw new Error("network down"); }));
    const provider = (svc as unknown as { ingestAuthProvider(): IngestAuthProvider }).ingestAuthProvider();
    await expect(provider.refreshToken()).resolves.toBeUndefined();
  });
});
