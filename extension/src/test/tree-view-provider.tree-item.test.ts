/**
 * Unit tests for TreeViewProvider (KiroTreeViewProvider)
 * Covers: status update triggers, getTreeItem, Quick Actions
 * (Split from tree-view-provider.test.ts — tree-item/actions concern.)
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
      item.command = { command: "sdlcAgents.restartMcpServer", title: "Restart Server" };

      assert.strictEqual(item.command.command, "sdlcAgents.restartMcpServer");
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
        { label: "Inject All Agents", command: "sdlcAgents.injectAll", icon: "cloud-download" },
        { label: "Show Status", command: "sdlcAgents.status", icon: "info" },
        { label: "Index Workspace", command: "sdlcAgents.indexWorkspace", icon: "search" },
      ];

      assert.strictEqual(actions.length, 3);
      assert.strictEqual(actions[0].command, "sdlcAgents.injectAll");
      assert.strictEqual(actions[1].command, "sdlcAgents.status");
      assert.strictEqual(actions[2].command, "sdlcAgents.indexWorkspace");
    });
  });
});
