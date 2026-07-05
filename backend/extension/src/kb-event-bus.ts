import * as vscode from "vscode";
import { RemoteBackendClient } from "./remote-backend-client";

export type KbEventType =
  | "kb_entry_added"
  | "kb_entry_updated"
  | "kb_entry_deleted"
  | "tag_created"
  | "tag_deleted"
  | "tag_updated"
  | "quality_scored"
  | "bulk_operation"
  | "consolidation_complete";

export interface KbChangeEvent {
  type: KbEventType;
  timestamp: number;
  data: Record<string, unknown>;
}

const EVENT_PANEL_MAP: Record<KbEventType, ("tags" | "quality" | "analytics")[]> = {
  kb_entry_added: ["tags", "quality", "analytics"],
  kb_entry_updated: ["quality", "analytics"],
  kb_entry_deleted: ["tags", "quality", "analytics"],
  tag_created: ["tags"],
  tag_deleted: ["tags"],
  tag_updated: ["tags"],
  quality_scored: ["quality"],
  bulk_operation: ["tags", "quality", "analytics"],
  consolidation_complete: ["tags", "quality", "analytics"],
};

export class KbEventBus implements vscode.Disposable {
  private disposed = false;
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private notificationSub?: vscode.Disposable;

  private static readonly DEBOUNCE_MS = 500;

  private readonly _onTagsChange = new vscode.EventEmitter<KbChangeEvent>();
  private readonly _onQualityChange = new vscode.EventEmitter<KbChangeEvent>();
  private readonly _onAnalyticsChange = new vscode.EventEmitter<KbChangeEvent>();

  readonly onTagsChange = this._onTagsChange.event;
  readonly onQualityChange = this._onQualityChange.event;
  readonly onAnalyticsChange = this._onAnalyticsChange.event;

  constructor(
    private readonly outputChannel: vscode.OutputChannel,
    private readonly remoteClient: RemoteBackendClient
  ) {}

  connect(): void {
    if (this.disposed) return;
    this.disconnect();
    
    this.outputChannel.appendLine(`[KbEventBus] Subscribing to MCP notifications`);
    this.notificationSub = this.remoteClient.onNotification((notification) => {
      this.handleNotification(notification);
    });
  }

  disconnect(): void {
    if (this.notificationSub) {
      this.notificationSub.dispose();
      this.notificationSub = undefined;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this._onTagsChange.dispose();
    this._onQualityChange.dispose();
    this._onAnalyticsChange.dispose();
  }

  private handleNotification(notification: { method: string; params?: any }): void {
    const method = notification.method;
    const prefix = "notifications/";
    const eventType = method.startsWith(prefix) ? method.slice(prefix.length) : method;

    if (!EVENT_PANEL_MAP[eventType as KbEventType]) return;

    try {
      const event: KbChangeEvent = {
        type: eventType as KbEventType,
        timestamp: Date.now(),
        data: notification.params || {}
      };
      this.dispatchEvent(event);
    } catch {
      // Ignore
    }
  }

  private dispatchEvent(event: KbChangeEvent): void {
    const panels = EVENT_PANEL_MAP[event.type];
    if (!panels) return;

    for (const panel of panels) {
      this.debouncedEmit(panel, event);
    }
  }

  private debouncedEmit(panel: "tags" | "quality" | "analytics", event: KbChangeEvent): void {
    const existing = this.debounceTimers.get(panel);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(panel);
      switch (panel) {
        case "tags": this._onTagsChange.fire(event); break;
        case "quality": this._onQualityChange.fire(event); break;
        case "analytics": this._onAnalyticsChange.fire(event); break;
      }
    }, KbEventBus.DEBOUNCE_MS);

    this.debounceTimers.set(panel, timer);
  }
}
