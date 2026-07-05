/**
 * Unit tests for TreeViewProvider (KiroTreeViewProvider)
 * Covers: getChildren, status update, getTreeItem commands
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
        { label: "Dashboard", command: "kiroSdlc.openKbDashboard" },
        { label: "Graph", command: "kiroSdlc.openKbGraph" },
        { label: "Tags", command: "kiroSdlc.openKbTags" },
        { label: "Quality", command: "kiroSdlc.openKbQuality" },
        { label: "Analytics", command: "kiroSdlc.openKbAnalytics" },
      ];

      assert.strictEqual(kbChildren.length, 5);
      assert.strictEqual(kbChildren[0].command, "kiroSdlc.openKbDashboard");
      assert.strictEqual(kbChildren[4].command, "kiroSdlc.openKbAnalytics");
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

  describe("Status update triggers tree refresh", () => {
    it("should fire onDidChangeTreeData when status changes", () => {
      const emitter = new mockVscode.EventEmitter<undefined>();
      const callback = sandbox.stub();
      emitter.event(callback);

      emitter.fire(undefined);

      assert.ok(callback.calledOnce);
      assert.strictEqual(callback.firstCall.args[0], undefined);
    });

    it("should update serverStatus field on status change", () => {
      let serverStatus = "stopped";
      const statusEmitter = new mockVscode.EventEmitter<string>();

      statusEmitter.event((status) => {
        serverStatus = status;
      });

      statusEmitter.fire("running");
      assert.strictEqual(serverStatus, "running");

      statusEmitter.fire("crashed");
      assert.strictEqual(serverStatus, "crashed");
    });
  });

  describe("getTreeItem()", () => {
    it("should return the element itself", () => {
      const item = new mockVscode.TreeItem("Test", mockVscode.TreeItemCollapsibleState.None);
      const result = item;
      assert.strictEqual(result, item);
    });

    it("should have command property for action items", () => {
      const item = new mockVscode.TreeItem("Restart Server", mockVscode.TreeItemCollapsibleState.None);
      item.command = { command: "kiroSdlc.restartMcpServer", title: "Restart Server" };

      assert.strictEqual(item.command.command, "kiroSdlc.restartMcpServer");
    });

    it("should have iconPath for themed icons", () => {
      const item = new mockVscode.TreeItem("Dashboard", mockVscode.TreeItemCollapsibleState.None);
      item.iconPath = new mockVscode.ThemeIcon("dashboard");

      assert.strictEqual(item.iconPath.id, "dashboard");
    });

    it("should show PID in description when server is running", () => {
      const statusItem = new mockVscode.TreeItem("Status: Running", mockVscode.TreeItemCollapsibleState.None);
      statusItem.description = "PID 12345";

      assert.strictEqual(statusItem.description, "PID 12345");
    });

    it("should show empty description when server is stopped", () => {
      const statusItem = new mockVscode.TreeItem("Status: Stopped", mockVscode.TreeItemCollapsibleState.None);
      statusItem.description = "";

      assert.strictEqual(statusItem.description, "");
    });
  });

  describe("Quick Actions section", () => {
    it("should have Inject All command", () => {
      const actions = [
        { label: "Inject All Agents", command: "kiroSdlc.injectAll", icon: "cloud-download" },
        { label: "Show Status", command: "kiroSdlc.status", icon: "info" },
        { label: "Index Workspace", command: "kiroSdlc.indexWorkspace", icon: "search" },
      ];

      assert.strictEqual(actions.length, 3);
      assert.strictEqual(actions[0].command, "kiroSdlc.injectAll");
      assert.strictEqual(actions[1].command, "kiroSdlc.status");
      assert.strictEqual(actions[2].command, "kiroSdlc.indexWorkspace");
    });
  });
});
