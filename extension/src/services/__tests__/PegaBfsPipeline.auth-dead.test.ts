/**
 * SA4E-362 — BFS auth-dead graceful stop (UT-08, UT-09). STC v1.1 §3 + TDD §5 sync note:
 * UT-08's original "aborted" assertion is SUPERSEDED by stopReason='auth' semantics —
 * aborted stays null and run() RETURNS { stopReason: 'auth' } (FSD Supersession #1).
 * Flow under test (real components): PegaBfsIndexer → PegaBfsPipeline → PegaStreamIngester
 * (fetch stubbed) — ingester throws IngestAuthError → indexer sets authDead → shouldStop.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { PegaBfsIndexer } from "../PegaBfsIndexer";
import { PegaStreamIngester, IngestAuthError } from "../PegaStreamIngester";
import type { MembershipSet } from "../DiskBackedSet";

/** In-memory MembershipSet — avoids DiskBackedSet's runtime require('vscode'). */
function fakeDedup(): MembershipSet {
  const seen = new Set<string>();
  return {
    has: (key: string) => seen.has(key),
    add: (key: string) => { seen.add(key); return true; },
    dispose: () => {},
  } as unknown as MembershipSet;
}

const { showWarningMessage } = vi.hoisted(() => ({ showWarningMessage: vi.fn(async () => undefined) }));
vi.mock("vscode", () => ({
  window: { showWarningMessage },
  workspace: {
    getConfiguration: () => ({
      get: (_key: string, def: number) => {
        const tuned: Record<string, number> = {
          "pega.fetchBatchSize": 2,
          "pega.ingestConcurrency": 1,
          "pega.ingestChannelCapacity": 2,
        };
        return tuned[_key] ?? def;
      },
    }),
  },
}));

vi.mock("../../extension", () => ({
  getProjectId: () => "test-project-123",
  setProjectId: vi.fn(),
}));

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

/** Build a BFS indexer wired to a stubbed Pega client + full ingest auth provider. */
function makeFixture(opts: { refreshToken: () => Promise<string | undefined>; fetchStatus: number }) {
  const fetchMock = vi.fn(async () => jsonResponse(
    opts.fetchStatus === 401 ? RULE_ENVELOPE_401 : '{"error":{"code":"E","message":"boom"}}',
    opts.fetchStatus,
  ));
  vi.stubGlobal("fetch", fetchMock);

  const items = ["A", "B", "C", "D"].map((k) => ({
    insKey: `RULE-OBJ-ACTIVITY ${k}`,
    pxObjClass: "Rule-Obj-Activity",
    pyClassName: "Test-App-Work",
    pyRuleName: "", // empty → fetchRulesInParallel uses getRuleByInsKey
    pyRuleSet: "App",
    pyRuleSetVersion: "01-01-01",
    checksum: "chk-" + k,
  }));

  const pegaClient = {
    getConfiguredUsername: () => "", // skip latency probe
    getRuleByInsKey: vi.fn(async (insKey: string) => ({ pzInsKey: insKey, pyRuleName: insKey, pxObjClass: "Rule-Obj-Activity" })),
  } as any;

  const auth = { getTokenSync: () => "stale-token", refreshToken: vi.fn(opts.refreshToken) };
  const log = vi.fn();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sa4e-362-bfs-"));
  const indexer = new PegaBfsIndexer(pegaClient, "http://localhost:48721", undefined, log, undefined, true, auth);
  return { indexer, log, root, items, auth, fetchMock };
}

describe("SA4E-362 — BFS auth-dead graceful stop", () => {
  let root: string | undefined;

  beforeEach(() => {
    showWarningMessage.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (root) { fs.rmSync(root, { recursive: true, force: true }); root = undefined; }
  });

  // STC: UT-08 — ingestFn throw IngestAuthError → authDead → shouldStop → graceful stop,
  // remaining KHÔNG skip silently, đúng 1 log ⛔ + 1 notification, A giữ eligible, KHÔNG auto-login.
  it("UT-08: auth-dead stops the pipeline early; remaining items are NOT counted as skipped", async () => {
    const fx = makeFixture({ refreshToken: async () => undefined, fetchStatus: 401 });
    root = fx.root;
    const dedupSet = fakeDedup();
    const report = { report: vi.fn() };

    const result = await fx.indexer.run("proj-1", fx.items, dedupSet, report as any, fx.root);

    // Superseded assertion (TDD §5): stopReason='auth', aborted giữ null → run() RETURN bình thường
    expect(result.stopReason).toBe("auth");
    expect(result.totalIngested).toBe(0);
    expect(result.skippedCount).toBe(1); // chỉ rule A (đã xử lý, {ingested:false}) — B/C/D discarded, KHÔNG đếm skipped
    // Rule A giữ eligible: KHÔNG vào local index (chỉ ingested:true mới record) → rerun incremental.
    // Đúng 1 log ⛔ + 1 notification (BR-6)
    const logs = fx.log.mock.calls.map((c: unknown[]) => String(c[0]));
    const deadLogs = logs.filter((l) => l.includes("⛔ Auth hết hạn và refresh thất bại"));
    expect(deadLogs.length).toBe(1);
    expect(showWarningMessage).toHaveBeenCalledTimes(1);
    expect(showWarningMessage).toHaveBeenCalledWith(expect.stringContaining("login lại rồi chạy lại (state đã preserve)"));
    // BR-3: KHÔNG auto-login — không có lời gọi login nào trong flow
    expect(logs.some((l) => l.toLowerCase().includes("auto-login"))).toBe(false);
    expect(fx.auth.refreshToken).toHaveBeenCalledTimes(1); // refresh attempt (failed) đúng 1 lần
    // Producer ngừng phát: chỉ 1 ingest HTTP call thực hiện (A) — B/C/D không bị POST
    expect(fx.fetchMock).toHaveBeenCalledTimes(1);
    // Pipeline log "paused due to auth"
    expect(logs.some((l) => l.includes("paused due to auth"))).toBe(true);
  });

  // STC: UT-09 — non-auth error (500) → authDead false, pipeline resilient như cũ
  it("UT-09: non-auth 500 errors keep the pipeline resilient (no authDead, no pause)", async () => {
    const fx = makeFixture({ refreshToken: async () => "fresh", fetchStatus: 500 });
    root = fx.root;
    const dedupSet = fakeDedup();
    const report = { report: vi.fn() };

    const result = await fx.indexer.run("proj-1", fx.items, dedupSet, report as any, fx.root);

    expect(result.stopReason).toBeNull(); // chạy hết bình thường (không dừng sớm)
    expect(result.skippedCount).toBe(4); // A, B, C, D VẪN được xử lý (resilient) — đều fail 500
    expect(fx.auth.refreshToken).toHaveBeenCalledTimes(0); // BR-1: 500 KHÔNG trigger refresh
    const logs = fx.log.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(logs.some((l) => l.includes("paused due to auth"))).toBe(false); // KHÔNG log pause
    expect(logs.some((l) => l.includes("⛔"))).toBe(false);
    expect(showWarningMessage).not.toHaveBeenCalled();
  });
});
