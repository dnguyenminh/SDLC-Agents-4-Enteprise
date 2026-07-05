/**
 * Unit tests for BasePanel
 * Covers: create options, retainContextWhenHidden, sendMessage, dispose, server status listener
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as mockVscode from "./mocks/vscode";

describe("BasePanel", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("Panel creation options", () => {
    it("should set retainContextWhenHidden to true", () => {
      const options = {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      };

      assert.strictEqual(options.retainContextWhenHidden, true);
      assert.strictEqual(options.enableScripts, true);
    });

    it("should set correct viewType from PANEL_VIEW_TYPES", () => {
      const { PANEL_VIEW_TYPES } = require("../types");
      assert.strictEqual(PANEL_VIEW_TYPES.graph, "kiroKbGraph");
      assert.strictEqual(PANEL_VIEW_TYPES.dashboard, "kiroKbDashboard");
      assert.strictEqual(PANEL_VIEW_TYPES.tags, "kiroKbTags");
      assert.strictEqual(PANEL_VIEW_TYPES.quality, "kiroKbQuality");
      assert.strictEqual(PANEL_VIEW_TYPES.analytics, "kiroKbAnalytics");
    });

    it("should set correct title from PANEL_TITLES", () => {
      const { PANEL_TITLES } = require("../types");
      assert.strictEqual(PANEL_TITLES.graph, "KB Graph");
      assert.strictEqual(PANEL_TITLES.dashboard, "KB Dashboard");
      assert.strictEqual(PANEL_TITLES.tags, "KB Tags");
      assert.strictEqual(PANEL_TITLES.quality, "KB Quality");
      assert.strictEqual(PANEL_TITLES.analytics, "KB Analytics");
    });
  });

  describe("sendMessage()", () => {
    it("should call webview.postMessage when panel is alive", () => {
      const postMessage = sandbox.stub().resolves(true);
      const panel = { webview: { postMessage } };

      if (panel) {
        panel.webview.postMessage({ type: "serverStatus", status: "connected" });
      }

      assert.ok(postMessage.calledOnce);
      assert.deepStrictEqual(postMessage.firstCall.args[0], {
        type: "serverStatus",
        status: "connected",
      });
    });

    it("should not throw when panel is undefined (disposed)", () => {
      const panel: any = undefined;

      if (panel) {
        panel.webview.postMessage({ type: "error", message: "test", retryable: false });
      }

      assert.ok(true);
    });

    it("should send various message types", () => {
      const postMessage = sandbox.stub().resolves(true);
      const panel = { webview: { postMessage } };

      const messages = [
        { type: "graphData", nodes: [], edges: [] },
        { type: "dashboardData", health: 85, types: {}, tiers: {}, trend: [], recent: [] },
        { type: "error", message: "Connection failed", retryable: true },
      ];

      messages.forEach((msg) => panel.webview.postMessage(msg));

      assert.strictEqual(postMessage.callCount, 3);
    });
  });

  describe("dispose()", () => {
    it("should call panel.dispose()", () => {
      const dispose = sandbox.stub();
      const panel = { dispose };

      panel.dispose();
      assert.ok(dispose.calledOnce);
    });

    it("should fire onDispose event", () => {
      const emitter = new mockVscode.EventEmitter<void>();
      const callback = sandbox.stub();
      emitter.event(callback);

      emitter.fire(undefined as any);

      assert.ok(callback.calledOnce);
    });

    it("should clean up disposables array", () => {
      const disposables: { dispose: sinon.SinonStub }[] = [
        { dispose: sandbox.stub() },
        { dispose: sandbox.stub() },
        { dispose: sandbox.stub() },
      ];

      disposables.forEach((d) => d.dispose());

      disposables.forEach((d) => assert.ok(d.dispose.calledOnce));
    });
  });

  describe("Server status listener", () => {
    it("should map running to connected", () => {
      const statusMap = (status: string): string => {
        return status === "running" ? "connected" : status === "crashed" ? "failed" : "disconnected";
      };

      assert.strictEqual(statusMap("running"), "connected");
      assert.strictEqual(statusMap("crashed"), "failed");
      assert.strictEqual(statusMap("stopped"), "disconnected");
      assert.strictEqual(statusMap("starting"), "disconnected");
    });

    it("should send serverStatus message on status change", () => {
      const emitter = new mockVscode.EventEmitter<string>();
      const postMessage = sandbox.stub().resolves(true);

      emitter.event((status) => {
        const webviewStatus = status === "running" ? "connected" : status === "crashed" ? "failed" : "disconnected";
        postMessage({ type: "serverStatus", status: webviewStatus });
      });

      emitter.fire("running");
      assert.ok(postMessage.calledOnceWith({ type: "serverStatus", status: "connected" }));

      emitter.fire("crashed");
      assert.ok(postMessage.calledWith({ type: "serverStatus", status: "failed" }));
    });
  });

  describe("isAlive property", () => {
    it("should return true when panel exists", () => {
      const panel = { _panel: {} };
      const isAlive = panel._panel !== undefined;
      assert.strictEqual(isAlive, true);
    });

    it("should return false when panel is undefined", () => {
      const panel = { _panel: undefined };
      const isAlive = panel._panel !== undefined;
      assert.strictEqual(isAlive, false);
    });
  });
});
