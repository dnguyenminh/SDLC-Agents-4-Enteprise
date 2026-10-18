/**
 * SA4E-362 — PegaStreamIngester error-envelope hardening: SEC-02 401-body cap
 * + PBT-01 fetch/refresh invariants (UT-01..UT-14 live in auth-retry).
 * Conventions: vi.stubGlobal('fetch'), jsonResponse helper, (ing as any) private access,
 * fake timers for pollUntilComplete (POLL_INTERVAL_MS = 3000). STC v1.1 §3.
 * (Split from PegaStreamIngester.auth-retry.test.ts — error-envelope concern.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PegaStreamIngester, IngestAuthError } from "../PegaStreamIngester";
import type { IngestAuthProvider } from "../../utils/backend-auth-headers";

vi.mock("../../extension", () => ({
  getProjectId: () => "test-project-123",
  setProjectId: vi.fn(),
}));

const URL_BASE = "http://localhost:48721";

/** Response helper (STC §1): ok = 2xx, supports json() + text(). */
function jsonResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body),
  } as unknown as Response;
}

const RULE_ENVELOPE_OK = '{"data":{"status":"success","ruleId":42,"unresolvedDependencies":[]}}';
const RULE_ENVELOPE_401 = '{"error":{"code":"TOKEN_INVALID","message":"Invalid or expired token"}}';

function makeProvider(overrides: Partial<IngestAuthProvider> = {}): IngestAuthProvider & { refreshToken: ReturnType<typeof vi.fn> } {
  return {
    getTokenSync: () => "stale-token",
    refreshToken: vi.fn(async () => "fresh-token"),
    ...overrides,
  } as IngestAuthProvider & { refreshToken: ReturnType<typeof vi.fn> };
}
describe("PegaStreamIngester refresh-on-401 — SA4E-362", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  // SEC-02 (3.7) + SECA-01: 401 body/message embedded trong IngestAuthError bị strip CR/LF
  // (chống log injection) rồi cap ở 200 ký tự — message cuối luôn single-line.
  it("SEC-02: IngestAuthError caps the embedded 401 body at 200 chars on a single line", async () => {
    const longMessage = "x".repeat(500);
    fetchMock
      .mockResolvedValueOnce(jsonResponse(longMessage, 401))
      .mockResolvedValueOnce(jsonResponse(longMessage, 401));
    // submitJob path: text() body 500 chars → error message phải ≤ prefix + 200.
    const ing = new PegaStreamIngester(URL_BASE, makeProvider());
    const err = await (ing as any).submitJob(
      [{ pzInsKey: "R1" }], "proj-1", {}, {}, [], `${URL_BASE}/api/v1/pega/ingest-stream`, () => {},
    ).catch((e: unknown) => e as IngestAuthError);

    expect(err).toBeInstanceOf(IngestAuthError);
    expect((err as IngestAuthError).message.length).toBeLessThanOrEqual("Ingest submit failed: HTTP 401 — ".length + 200);
    expect((err as IngestAuthError).message).toContain("x".repeat(200));
    expect((err as IngestAuthError).message).not.toContain("x".repeat(201));
    // SECA-01: multi-line 401 body → single-line message (không log injection)
    const multilineBody = "line1\r\nEVIL-LOG-LINE\r\nline3";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(multilineBody, 401))
      .mockResolvedValueOnce(jsonResponse(multilineBody, 401));
    const err2 = await (ing as any).submitJob(
      [{ pzInsKey: "R2" }], "proj-1", {}, {}, [], `${URL_BASE}/api/v1/pega/ingest-stream`, () => {},
    ).catch((e: unknown) => e as IngestAuthError);

    expect(err2).toBeInstanceOf(IngestAuthError);
    expect((err2 as IngestAuthError).message).not.toMatch(/[\r\n]/); // không còn newline
    expect((err2 as IngestAuthError).message).toContain("line1 EVIL-LOG-LINE line3"); // newlines → space
  });

  // STC: PBT-01 — property: mọi chuỗi status → fetch ≤ 2, refreshToken ≤ 1, refresh chỉ khi 401 đầu
  it("PBT-01: property — any status sequence yields ≤2 fetches and ≤1 refresh", async () => {
    const fc = await import("fast-check");
    await fc.assert(
      // Async predicate → fc.asyncProperty (fc.property is sync — would not await the Promise)
      fc.asyncProperty(
        fc.array(fc.constantFrom(200, 202, 400, 401, 403, 500, 503), { minLength: 1, maxLength: 8 }),
        fc.boolean(),
        async (statuses, refreshOk) => {
          let fetchCalls = 0;
          let refreshCalls = 0;
          const makeRes = (status: number): Response =>
            ({
              ok: status >= 200 && status < 300,
              status,
              text: async () => "",
              json: async () => ({}),
            }) as unknown as Response;
          vi.stubGlobal("fetch", vi.fn(async () => {
            const status = fetchCalls < statuses.length ? statuses[fetchCalls] : 200;
            fetchCalls++;
            return makeRes(status);
          }));
          const auth: IngestAuthProvider = {
            getTokenSync: () => "stale",
            refreshToken: async () => { refreshCalls++; return refreshOk ? "fresh" : undefined; },
          };
          const ing = new PegaStreamIngester(URL_BASE, auth);
          await (ing as any).fetchWithAuthRetry(
            async (token: string | undefined) =>
              fetch(`${URL_BASE}/api/v1/pega/ingest-rule`, {
                method: "POST",
                headers: token ? { Authorization: `Bearer ${token}` } : {},
                body: "{}",
              }),
            "rule",
          );
          // Invariants (BR-1/BR-2):
          if (fetchCalls > 2) { throw new Error(`BR-2 violated: fetchCalls=${fetchCalls} statuses=${JSON.stringify(statuses)}`); }
          if (refreshCalls > 1) { throw new Error(`BR-2 violated: refreshCalls=${refreshCalls} statuses=${JSON.stringify(statuses)}`); }
          if (statuses[0] !== 401 && refreshCalls !== 0) { throw new Error(`BR-1 violated: refresh on non-401 first response (${statuses[0]})`); }
          if (refreshCalls === 1 && refreshOk && fetchCalls !== 2) { throw new Error(`BR-2 violated: refresh OK but fetchCalls=${fetchCalls}`); }
          if (refreshCalls === 1 && !refreshOk && fetchCalls !== 1) { throw new Error(`BR-2 violated: refresh undefined but fetchCalls=${fetchCalls}`); }
          return true; // fc v4: async predicate phải trả boolean tường minh
        },
      ),
      { numRuns: 100 },
    );
  });
});
