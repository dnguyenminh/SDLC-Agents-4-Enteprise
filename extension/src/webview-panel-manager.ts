/**
 * WebviewPanelManager — Factory and singleton registry for KB webview panels.
 * Ensures only one instance of each panel type exists at a time.
 * OCP: panel creation uses a Map registry — adding a new panel type does not require editing this file.
 * DIP: depends on IServerManager interface, not concrete McpServerManager.
 */

import * as vscode from "vscode";
import {
  PanelType,
  IPanelManager,
  IKbPanel,
  ExtToWebviewMessage,
  IServerManager,
} from "./types";
import { BasePanel } from "./panels/base-panel";
import { GraphPanel } from "./panels/graph-panel";
import { DashboardPanel } from "./panels/dashboard-panel";
import { TagsPanel } from "./panels/tags-panel";
import { QualityPanel } from "./panels/quality-panel";
import { AnalyticsPanel } from "./panels/analytics-panel";
import { SecurityPanel } from "./panels/security-panel";
import { ImpactPanel } from "./panels/impact-panel";
import { PlanCanvasPanel } from "./panels/plan-canvas";
import { KbEventBus } from "./kb-event-bus";

/** Factory function type for creating a panel. */
type PanelFactory = () => BasePanel;

export class WebviewPanelManager implements IPanelManager, vscode.Disposable {
  private panels = new Map<PanelType, BasePanel>();

  /** Panel registry — OCP: extend here, don't modify createPanel(). */
  private readonly registry: Map<PanelType, PanelFactory>;

  constructor(
    private readonly mcpManager: IServerManager,
    private readonly extensionUri: vscode.Uri,
    private readonly eventBus?: KbEventBus
  ) {
    // Build registry once; each factory captures the constructor args via closure.
    this.registry = new Map<PanelType, PanelFactory>([
      ["graph",     () => new GraphPanel(this.mcpManager, this.extensionUri)],
      ["dashboard", () => new DashboardPanel(this.mcpManager, this.extensionUri)],
      ["tags",      () => new TagsPanel(this.mcpManager, this.extensionUri, this.eventBus)],
      ["quality",   () => new QualityPanel(this.mcpManager, this.extensionUri, this.eventBus)],
      ["analytics", () => new AnalyticsPanel(this.mcpManager, this.extensionUri, this.eventBus)],
      ["security",  () => new SecurityPanel(this.mcpManager, this.extensionUri)],
      ["impact",    () => new ImpactPanel(this.mcpManager, this.extensionUri)],
      ["planCanvas", () => new PlanCanvasPanel(this.mcpManager, this.extensionUri)],
    ]);
  }

  /**
   * Open a panel by type. If already open, reveals it. Otherwise creates new.
   * If not authenticated, prompts login via refreshToken command first.
   */
  openPanel(type: PanelType): void {
    const existing = this.panels.get(type);
    if (existing && existing.isAlive) {
      existing.reveal();
      return;
    }

    const token = BasePanel.authTokenProvider ? BasePanel.authTokenProvider() : "";
    if (!token) {
      vscode.commands.executeCommand('kiroSdlc.refreshToken').then(() => {
        this.createAndTrack(type);
      });
      return;
    }

    this.createAndTrack(type);
  }

  private createAndTrack(type: PanelType): void {
    // Remove stale reference if panel was disposed externally
    const existing = this.panels.get(type);
    if (existing) {
      this.panels.delete(type);
    }

    const panel = this.createPanel(type);
    this.panels.set(type, panel);

    panel.onDispose(() => {
      this.panels.delete(type);
    });

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
   * Registry-based factory — OCP compliant.
   * To add a new panel: add an entry to this.registry in the constructor.
   */
  private createPanel(type: PanelType): BasePanel {
    const factory = this.registry.get(type);
    if (!factory) {
      throw new Error(`No panel factory registered for type '${type}'`);
    }
    return factory();
  }
}
