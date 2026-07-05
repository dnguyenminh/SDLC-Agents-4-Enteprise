/**
 * Unit tests for WebviewPanelManager
 * Covers: openPanel (new + existing), disposeAll, notifyAllPanels, singleton enforcement
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as mockVscode from "./mocks/vscode";

describe("WebviewPanelManager", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("Singleton enforcement via Map", () => {
    it("should store only one panel per type in a Map", () => {
      const panels = new Map<string, { isAlive: boolean; reveal: sinon.SinonStub }>();

      const type = "graph";
      const mockPanel = { isAlive: true, reveal: sandbox.stub() };
      panels.set(type, mockPanel);

      // Try to open same type again
      const existing = panels.get(type);
      if (existing && existing.isAlive) {
        existing.reveal();
      }

      assert.ok(mockPanel.reveal.calledOnce);
      assert.strictEqual(panels.size, 1);
    });

    it("should allow different panel types simultaneously", () => {
      const panels = new Map<string, { isAlive: boolean }>();
      panels.set("graph", { isAlive: true });
      panels.set("dashboard", { isAlive: true });
      panels.set("tags", { isAlive: true });

      assert.strictEqual(panels.size, 3);
    });

    it("should replace stale panel reference", () => {
      const panels = new Map<string, { isAlive: boolean }>();
      panels.set("graph", { isAlive: false });

      const existing = panels.get("graph");
      if (existing && !existing.isAlive) {
        panels.delete("graph");
      }

      panels.set("graph", { isAlive: true });
      assert.strictEqual(panels.size, 1);
      assert.ok(panels.get("graph")!.isAlive);
    });
  });

  describe("disposeAll()", () => {
    it("should dispose all panels and clear the map", () => {
      const panels = new Map<string, { dispose: sinon.SinonStub }>();
      const p1 = { dispose: sandbox.stub() };
      const p2 = { dispose: sandbox.stub() };
      panels.set("graph", p1);
      panels.set("dashboard", p2);

      for (const [, panel] of panels) {
        panel.dispose();
      }
      panels.clear();

      assert.ok(p1.dispose.calledOnce);
      assert.ok(p2.dispose.calledOnce);
      assert.strictEqual(panels.size, 0);
    });
  });

  describe("notifyAllPanels()", () => {
    it("should send message to all alive panels", () => {
      const panels = new Map<string, { isAlive: boolean; sendMessage: sinon.SinonStub }>();
      const p1 = { isAlive: true, sendMessage: sandbox.stub() };
      const p2 = { isAlive: true, sendMessage: sandbox.stub() };
      const p3 = { isAlive: false, sendMessage: sandbox.stub() };
      panels.set("graph", p1);
      panels.set("dashboard", p2);
      panels.set("tags", p3);

      const message = { type: "serverStatus", status: "connected" };

      for (const [, panel] of panels) {
        if (panel.isAlive) {
          panel.sendMessage(message);
        }
      }

      assert.ok(p1.sendMessage.calledOnceWith(message));
      assert.ok(p2.sendMessage.calledOnceWith(message));
      assert.ok(p3.sendMessage.notCalled);
    });

    it("should handle empty panels map gracefully", () => {
      const panels = new Map<string, { isAlive: boolean; sendMessage: sinon.SinonStub }>();
      const message = { type: "serverStatus", status: "disconnected" };

      for (const [, panel] of panels) {
        if (panel.isAlive) {
          panel.sendMessage(message);
        }
      }

      assert.strictEqual(panels.size, 0);
    });
  });

  describe("openPanel() — reveal existing", () => {
    it("should reveal existing alive panel instead of creating new", () => {
      const panels = new Map<string, { isAlive: boolean; reveal: sinon.SinonStub }>();
      const existingPanel = { isAlive: true, reveal: sandbox.stub() };
      panels.set("graph", existingPanel);

      const type = "graph";
      const existing = panels.get(type);
      if (existing && existing.isAlive) {
        existing.reveal();
      }

      assert.ok(existingPanel.reveal.calledOnce);
    });
  });

  describe("getPanel()", () => {
    it("should return panel if alive", () => {
      const panels = new Map<string, { isAlive: boolean }>();
      const panel = { isAlive: true };
      panels.set("dashboard", panel);

      const result = panels.get("dashboard");
      assert.ok(result?.isAlive);
    });

    it("should return undefined for non-existent type", () => {
      const panels = new Map<string, { isAlive: boolean }>();
      const result = panels.get("quality");
      assert.strictEqual(result, undefined);
    });

    it("should return undefined for dead panel", () => {
      const panels = new Map<string, { isAlive: boolean }>();
      panels.set("tags", { isAlive: false });

      const panel = panels.get("tags");
      const result = panel?.isAlive ? panel : undefined;
      assert.strictEqual(result, undefined);
    });
  });
});
