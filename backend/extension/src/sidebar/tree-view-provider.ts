/**
 * TreeViewProvider — Sidebar Activity Bar tree with KB panels and server status.
 * Shows warning badge on Activity Bar when KB system is inactive.
 */

import * as vscode from "vscode";
import { ServerStatus } from "../types";
import { McpServerManager } from "../mcp-server-manager";

export class KiroTreeViewProvider implements vscode.TreeDataProvider<KiroTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<KiroTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private serverStatus: ServerStatus = "stopped";
  private treeView: vscode.TreeView<KiroTreeItem> | undefined;

  private isAuthenticated = false;
  private username = "";

  constructor(private readonly mcpManager: McpServerManager) {
    mcpManager.onStatusChange((status) => {
      this.serverStatus = status;
      this.updateBadge();
      this._onDidChangeTreeData.fire(undefined);
    });
  }

  /**
   * Bind the TreeView instance so we can update its badge.
   * Call this after vscode.window.createTreeView().
   */
  setTreeView(treeView: vscode.TreeView<KiroTreeItem>): void {
    this.treeView = treeView;
    this.updateBadge();
  }

  /** Update Activity Bar badge based on server status. */
  private updateBadge(): void {
    if (!this.treeView) { return; }
    if (this.isKbInactive()) {
      this.treeView.badge = { value: 1, tooltip: "KB System Inactive \u2014 server not running" };
    } else {
      this.treeView.badge = undefined;
    }
  }

  /** KB is inactive when server is stopped or crashed. */
  isKbInactive(): boolean {
    return this.serverStatus === "stopped" || this.serverStatus === "crashed";
  }

  setAuthenticated(isAuthenticated: boolean, username: string = ""): void {
    this.isAuthenticated = isAuthenticated;
    this.username = username;
    this.refresh();
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: KiroTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: KiroTreeItem): KiroTreeItem[] {
    if (!element) { return this.getRootItems(); }
    return element.children || [];
  }

  private getRootItems(): KiroTreeItem[] {
    // Show warning banner when KB system is inactive
    const items: KiroTreeItem[] = [];
    const config = vscode.workspace.getConfiguration("kiroSdlc");
    const backendUrl = config.get<string>("backend.url") || "http://127.0.0.1:48721";

    if (this.isKbInactive()) {
      const warningItem = new KiroTreeItem(
        "⚠️ KB System Inactive",
        vscode.TreeItemCollapsibleState.None
      );
      warningItem.iconPath = new vscode.ThemeIcon("warning", new vscode.ThemeColor("problemsWarningIcon.foreground"));
      warningItem.description = "Server not running";
      warningItem.command = { command: "kiroSdlc.restartMcpServer", title: "Restart Server", arguments: [] };
      items.push(warningItem);
    } else {
      const backendRootItem = new KiroTreeItem("Backend Target", vscode.TreeItemCollapsibleState.Expanded);
      backendRootItem.iconPath = new vscode.ThemeIcon("globe");
      backendRootItem.description = backendUrl;

      const authItem = new KiroTreeItem(
        this.isAuthenticated ? `Logged in as ${this.username}` : "Login Required",
        vscode.TreeItemCollapsibleState.None
      );
      authItem.iconPath = new vscode.ThemeIcon(this.isAuthenticated ? "account" : "key");
      authItem.command = {
        command: this.isAuthenticated ? "kiroSdlc.logout" : "kiroSdlc.login",
        title: this.isAuthenticated ? "Logout" : "Login",
        arguments: []
      };
      
      backendRootItem.children = [authItem];
      items.push(backendRootItem);
    }

    const kbSection = new KiroTreeItem("Knowledge Base", vscode.TreeItemCollapsibleState.Expanded);
    kbSection.children = [
      this.createCommandItem("Dashboard", "kiroSdlc.openKbDashboard", "dashboard"),
      this.createCommandItem("Graph", "kiroSdlc.openKbGraph", "type-hierarchy"),
      this.createCommandItem("Tags", "kiroSdlc.openKbTags", "tag"),
      this.createCommandItem("Quality", "kiroSdlc.openKbQuality", "star"),
      this.createCommandItem("Analytics", "kiroSdlc.openKbAnalytics", "graph"),
      this.createCommandItem("Workflow", "kiroSdlc.openWorkflowGraph", "circuit-board"),
    ];

    const serverSection = new KiroTreeItem("MCP Wrapper Server", vscode.TreeItemCollapsibleState.Expanded);
    const serverChildren: KiroTreeItem[] = [];
    const statusItem = new KiroTreeItem(`Status: ${this.getStatusLabel()}`, vscode.TreeItemCollapsibleState.None);
    statusItem.iconPath = new vscode.ThemeIcon(this.getStatusIcon());
    
    const mcpServerPort = config.get<number>("mcpServerPort", 9181);
    statusItem.description = `Port ${mcpServerPort}`;
    
    serverChildren.push(statusItem);
    serverChildren.push(this.createCommandItem("Edit Config", "kiroSdlc.editConfig", "json"));
    serverChildren.push(this.createCommandItem("Change Config...", "kiroSdlc.changeConfig", "folder-opened"));
    serverSection.children = serverChildren;

    const actionsSection = new KiroTreeItem("Quick Actions", vscode.TreeItemCollapsibleState.Collapsed);
    actionsSection.children = [
      this.createCommandItem("Inject All Agents", "kiroSdlc.injectAll", "cloud-download"),
      this.createCommandItem("Show Status", "kiroSdlc.status", "info"),
      this.createCommandItem("Index Workspace", "kiroSdlc.indexWorkspace", "search"),
      this.createCommandItem("Open KB in Browser", "kiroSdlc.openKbBrowser", "globe"),
    ];

    items.push(kbSection, serverSection, actionsSection);
    return items;
  }

  private createCommandItem(label: string, command: string, icon: string): KiroTreeItem {
    const item = new KiroTreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.command = { command, title: label, arguments: [] };
    item.iconPath = new vscode.ThemeIcon(icon);
    item.contextValue = `cmd:${command}`;
    return item;
  }

  private getStatusIcon(): string {
    switch (this.serverStatus) {
      case "running": return "check";
      case "starting": return "loading~spin";
      case "crashed": return "warning";
      case "stopped": return "circle-slash";
    }
  }

  private getStatusLabel(): string {
    switch (this.serverStatus) {
      case "running": return "Running";
      case "starting": return "Starting...";
      case "crashed": return "Crashed";
      case "stopped": return "Stopped";
    }
  }
}

export class KiroTreeItem extends vscode.TreeItem {
  children?: KiroTreeItem[];
  constructor(label: string, collapsibleState: vscode.TreeItemCollapsibleState) {
    super(label, collapsibleState);
  }
}
