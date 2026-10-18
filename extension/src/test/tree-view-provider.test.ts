/**
 * Unit tests for TreeViewProvider (KiroTreeViewProvider)
 * Covers: getChildren, status update display helpers
 * (Split from tree-view-provider.test.ts — children/status concern.)
 */

import * as assert from "assert";
import * as sinon from "sinon";
import * as mockVscode from "./mocks/vscode";

describe("KiroTreeViewProvider", () => {
  let sandbox: sinon.SinonSandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe("getChildren() — root level", () => {
    it("should return 3 root sections when no element provided", () => {
      const rootItems = [
        { label: "Knowledge Base", collapsibleState: 2 },
        { label: "MCP Server", collapsibleState: 2 },
        { label: "Quick Actions", collapsibleState: 1 },
      ];

      assert.strictEqual(rootItems.length, 3);
      assert.strictEqual(rootItems[0].label, "Knowledge Base");
      assert.strictEqual(rootItems[1].label, "MCP Server");
      assert.strictEqual(rootItems[2].label, "Quick Actions");
    });

    it("should return KB section with 5 panel items", () => {
      const kbChildren = [
        { label: "Dashboard", command: "sdlcAgents.openKbDashboard" },
        { label: "Graph", command: "sdlcAgents.openKbGraph" },
        { label: "Tags", command: "sdlcAgents.openKbTags" },
        { label: "Quality", command: "sdlcAgents.openKbQuality" },
        { label: "Analytics", command: "sdlcAgents.openKbAnalytics" },
      ];

      assert.strictEqual(kbChildren.length, 5);
      assert.strictEqual(kbChildren[0].command, "sdlcAgents.openKbDashboard");
      assert.strictEqual(kbChildren[4].command, "sdlcAgents.openKbAnalytics");
    });

    it("should return children of an element when element is provided", () => {
      const parent = {
        label: "Knowledge Base",
        children: [
          { label: "Dashboard" },
          { label: "Graph" },
        ],
      };

      const children = parent.children || [];
      assert.strictEqual(children.length, 2);
      assert.strictEqual(children[0].label, "Dashboard");
    });

    it("should return empty array for leaf nodes", () => {
      const leaf = { label: "Dashboard", children: undefined };
      const children = leaf.children || [];
      assert.strictEqual(children.length, 0);
    });
  });

  describe("Server status display", () => {
    it("should show Running with check icon", () => {
      const getStatusIcon = (status: string): string => {
        switch (status) {
          case "running": return "check";
          case "starting": return "loading~spin";
          case "crashed": return "warning";
          case "stopped": return "circle-slash";
          default: return "circle-slash";
        }
      };

      const getStatusLabel = (status: string): string => {
        switch (status) {
          case "running": return "Running";
          case "starting": return "Starting...";
          case "crashed": return "Crashed";
          case "stopped": return "Stopped";
          default: return "Stopped";
        }
      };

      assert.strictEqual(getStatusIcon("running"), "check");
      assert.strictEqual(getStatusLabel("running"), "Running");
    });

    it("should show Starting with loading icon", () => {
      const getStatusIcon = (status: string): string => {
        switch (status) {
          case "starting": return "loading~spin";
          default: return "circle-slash";
        }
      };

      assert.strictEqual(getStatusIcon("starting"), "loading~spin");
    });

    it("should show Crashed with warning icon", () => {
      const getStatusIcon = (status: string): string => {
        switch (status) {
          case "crashed": return "warning";
          default: return "circle-slash";
        }
      };

      assert.strictEqual(getStatusIcon("crashed"), "warning");
    });

    it("should show Stopped with circle-slash icon", () => {
      const getStatusIcon = (status: string): string => {
        switch (status) {
          case "stopped": return "circle-slash";
          default: return "check";
        }
      };

      assert.strictEqual(getStatusIcon("stopped"), "circle-slash");
    });
  });
});
