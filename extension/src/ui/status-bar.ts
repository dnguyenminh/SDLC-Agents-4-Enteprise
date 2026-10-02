/**
 * StatusBarManager — Connection status indicator in VS Code status bar.
 * Shows backend connection state and auth state.
 */

import * as vscode from "vscode";
import { ConnectionState } from "../connection/ConnectionManager";
import { AuthState } from "../auth/AuthManager";

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private connectionState: ConnectionState = "DISCONNECTED";
  private authState: AuthState = "UNAUTHENTICATED";

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = "sdlcAgents.status";
    this.item.show();
    this.update();
  }

  setConnectionState(state: ConnectionState): void {
    this.connectionState = state;
    this.update();
  }

  setAuthState(state: AuthState): void {
    this.authState = state;
    this.update();
  }

  private update(): void {
    if (this.connectionState === "CONNECTED" && this.authState === "AUTHENTICATED") {
      this.item.text = "$(check) SDLC Agents";
      this.item.tooltip = "SDLC Agents: Connected & Authenticated";
      this.item.backgroundColor = undefined;
    } else if (this.connectionState === "CONNECTED") {
      this.item.text = "$(check) SDLC Agents";
      this.item.tooltip = "SDLC Agents: Connected (Local / Standby)";
      this.item.backgroundColor = undefined;
    } else if (this.connectionState === "CONNECTING") {
      this.item.text = "$(sync~spin) SDLC Agents";
      this.item.tooltip = "SDLC Agents: Connecting...";
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = "$(zap) SDLC Agents";
      this.item.tooltip = "SDLC Agents: Local Standalone Mode";
      this.item.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
