/**
 * SA4E-157 — Unit tests for EnrichmentStatusService (extension polling).
 * Mocks `vscode` (aliased to test/mocks/vscode.ts) and the dashboard panel.
 * The IndexerHttpClient dependency is passed as a fake (type-only import at runtime).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscodeMock from "vscode";
import { EnrichmentStatusService } from "../EnrichmentStatusService";

// Prevent the dynamically-imported dashboard panel from running real imports.
vi.mock("../panels/enrichment-dashboard-panel", () => ({
  getEnrichmentPanel: () => null,
  updatePanel: vi.fn(),
}));

function makeResponse(overrides: Record<string, unknown> = {}) {
  return {
    state: "running",
    projectId: null,
    totalRules: 100,
    completedRules: 40,
    failedRules: 0,
    pendingRules: 50,
    processingRules: 10,
    percent: 40,
    isRunning: true,
    startedAt: new Date(Date.now() - 60_000).toISOString(),
    estimatedCompletion: null,
    currentFile: "src/a.ts",
    lastPollAt: null,
    activeTasks: [{ source: "src/a.ts" }],
    ...overrides,
  };
}

function makeHttpClient() {
  return { getEnrichmentStatus: vi.fn() };
}

function makeOutputChannel() {
  return {
    appendLine: vi.fn(),
    append: vi.fn(),
    show: vi.fn(),
    dispose: vi.fn(),
  };
}

describe("EnrichmentStatusService", () => {
  let httpClient: ReturnType<typeof makeHttpClient>;
  let output: ReturnType<typeof makeOutputChannel>;
  let svc: EnrichmentStatusService;

  beforeEach(() => {
    vscodeMock.__resetStatusBarItems();
    httpClient = makeHttpClient();
    output = makeOutputChannel();
    svc = new EnrichmentStatusService(httpClient as never, () => "tok", output as never);
  });

  afterEach(() => {
    svc.dispose();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe("pollNow — success path", () => {
    it("returns parsed response and updates the status bar to running", async () => {
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: JSON.stringify(makeResponse()) });
      const result = await svc.pollNow();
      expect(result).not.toBeNull();
      expect(result!.state).toBe("running");
      const item = vscodeMock.__statusBarItems[0];
      expect(item.text).toContain("Enriching");
      expect(output.appendLine).toHaveBeenCalledWith(expect.stringContaining("[Enrichment]"));
    });

    it("does not count a schema-valid poll as a failure (resets counter)", async () => {
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: JSON.stringify(makeResponse()) });
      await svc.pollNow();
      // After a successful poll, following failures start from 0 again.
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: false, body: "x" });
      await svc.pollNow();
      await svc.pollNow();
      const item = vscodeMock.__statusBarItems[0];
      // 2 consecutive failures < 3 threshold → still not offline
      expect(item.text).not.toContain("Offline");
    });
  });

  describe("pollNow — failure handling", () => {
    it("returns null and decrements nothing on non-200, marks offline after 3 attempts", async () => {
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: false, body: "server error" });
      expect(await svc.pollNow()).toBeNull();
      expect(await svc.pollNow()).toBeNull();
      expect(await svc.pollNow()).toBeNull();
      const item = vscodeMock.__statusBarItems[0];
      expect(item.text).toContain("Offline");
    });

    it("returns null on malformed (non-JSON) body without incrementing failures", async () => {
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: "not-json" });
      expect(await svc.pollNow()).toBeNull();
      const item = vscodeMock.__statusBarItems[0];
      // No failure recorded → status bar stays at its idle default, not "Offline"
      expect(item.text).toBe("$(database) KB: Ready");
    });

    it("returns null when body fails Zod schema validation", async () => {
      httpClient.getEnrichmentStatus.mockResolvedValue({
        ok: true,
        body: JSON.stringify(makeResponse({ state: "frobnicated" })),
      });
      expect(await svc.pollNow()).toBeNull();
    });
  });

  describe("state transitions & notifications", () => {
    it("shows a completion notification once when running → complete", async () => {
      const infoSpy = vi.spyOn(vscodeMock.window, "showInformationMessage").mockResolvedValue(undefined as never);
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: JSON.stringify(makeResponse({ state: "running" })) });
      await svc.pollNow();
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: JSON.stringify(makeResponse({ state: "complete", processingRules: 0, pendingRules: 0, percent: 100, isRunning: false })) });
      await svc.pollNow();
      // A third identical poll must NOT re-notify (lastNotifiedState guard)
      await svc.pollNow();
      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("Enrichment complete"));
    });

    it("shows a warning and offers retry when running → error with failures", async () => {
      const warnSpy = vi.spyOn(vscodeMock.window, "showWarningMessage").mockResolvedValue("Retry Failed" as never);
      const execSpy = vi.spyOn(vscodeMock.commands, "executeCommand").mockResolvedValue(undefined as never);
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: JSON.stringify(makeResponse({ state: "running" })) });
      await svc.pollNow();
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: JSON.stringify(makeResponse({ state: "error", failedRules: 3, processingRules: 0, pendingRules: 0, isRunning: false })) });
      await svc.pollNow();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      // The "Retry Failed" action triggers the retry command
      expect(execSpy).toHaveBeenCalledWith("sa4e.retryFailedEnrichment");
    });
  });

  describe("buildDashboardData (sparkline)", () => {
    it("returns empty chart data when no running polls have occurred", () => {
      const data = svc.buildDashboardData(makeResponse() as never);
      expect(data.chartData).toHaveLength(0);
      expect(data.ratePerSec).toBe(0);
      expect(data.etaSeconds).toBeNull();
      expect(data.state).toBe("running");
    });

    it("builds chart data across two running polls", async () => {
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: JSON.stringify(makeResponse({ completedRules: 40 })) });
      await svc.pollNow();
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: JSON.stringify(makeResponse({ completedRules: 45 })) });
      await svc.pollNow();

      const data = svc.buildDashboardData(makeResponse({ completedRules: 45 }) as never);
      expect(data.chartData).toHaveLength(2);
      // 45 completed over 2 x 5s windows = 4.5/s
      expect(data.ratePerSec).toBeCloseTo(4.5, 1);
      // remaining 55 / 4.5 ≈ 12.2s
      expect(data.etaSeconds).toBeCloseTo(12.2, 1);
    });
  });

  describe("lifecycle", () => {
    it("start() schedules a polling timer and dispose() clears it", () => {
      vi.useFakeTimers();
      httpClient.getEnrichmentStatus.mockResolvedValue({ ok: true, body: JSON.stringify(makeResponse()) });
      svc.start();
      // Flush the immediate first poll microtask
      vi.advanceTimersByTime(0);
      expect(vi.getTimerCount()).toBe(1);
      svc.dispose();
      expect(vi.getTimerCount()).toBe(0);
    });

    it("dispose() is safe to call without start()", () => {
      expect(() => svc.dispose()).not.toThrow();
    });
  });
});
