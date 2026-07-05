/**
 * WebviewPanelManager — Factory and singleton registry for KB webview panels.
 * Ensures only one instance of each panel type exists at a time.
 */

import * as vscode from "vscode";
import {
  PanelType,
  IPanelManager,
  IKbPanel,
  ExtToWebviewMessage,
} from "./types";
import { McpServerManager } from "./mcp-server-manager";
import { BasePanel } from "./panels/base-panel";
import { GraphPanel } from "./panels/graph-panel";
import { DashboardPanel } from "./panels/dashboard-panel";
import { TagsPanel } from "./panels/tags-panel";
import { QualityPanel } from "./panels/quality-panel";
import { AnalyticsPanel } from "./panels/analytics-panel";
import { WorkflowPanel } from "./panels/workflow-panel";
import { KbEventBus } from "./kb-event-bus";

export class WebviewPanelManager implements IPanelManager, vscode.Disposable {
  private panels = new Map<PanelType, BasePanel>();

  constructor(
    private readonly mcpManager: McpServerManager,
    private readonly extensionUri: vscode.Uri,
    private readonly eventBus?: KbEventBus
  ) {}

  /**
   * Open a panel by type. If already open, reveals it. Otherwise creates new.
   */
  openPanel(type: PanelType): void {
    const existing = this.panels.get(type);
    if (existing && existing.isAlive) {
      existing.reveal();
      return;
    }

    // Remove stale reference if panel was disposed externally
    if (existing) {
      this.panels.delete(type);
    }

    const panel = this.createPanel(type);
    this.panels.set(type, panel);

    // Auto-remove from map when panel is disposed
    panel.onDispose(() => {
      this.panels.delete(type);
    });

    // Load initial data
    panel.loadData().catch((err) => {
      panel.sendMessage({
        type: "error",
        message: `Failed to load data: ${(err as Error).message}`,
        retryable: true,
      });
    });
  }

  /**
   * Get an existing panel instance (or undefined if not open).
   */
  getPanel(type: PanelType): IKbPanel | undefined {
    const panel = this.panels.get(type);
    return panel?.isAlive ? panel : undefined;
  }

  /**
   * Dispose all open panels.
   */
  disposeAll(): void {
    for (const [, panel] of this.panels) {
      panel.dispose();
    }
    this.panels.clear();
  }

  /**
   * Send a message to all open panels (e.g., server status change).
   */
  notifyAllPanels(message: ExtToWebviewMessage): void {
    for (const [, panel] of this.panels) {
      if (panel.isAlive) {
        panel.sendMessage(message);
      }
    }
  }

  dispose(): void {
    this.disposeAll();
  }

  /**
   * Factory method — creates the appropriate panel subclass.
   */
  private createPanel(type: PanelType): BasePanel {
    switch (type) {
      case "graph":
        return new GraphPanel(this.mcpManager, this.extensionUri);
      case "dashboard":
        return new DashboardPanel(this.mcpManager, this.extensionUri);
      case "tags":
        return new TagsPanel(this.mcpManager, this.extensionUri, this.eventBus);
      case "quality":
        return new QualityPanel(this.mcpManager, this.extensionUri, this.eventBus);
      case "analytics":
        return new AnalyticsPanel(this.mcpManager, this.extensionUri, this.eventBus);
      case "workflow":
        return new WorkflowPanel(this.mcpManager, this.extensionUri);
    }
  }
}
