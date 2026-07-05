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
    this.item.command = "kiroSdlc.status";
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
      this.item.tooltip = "Connected to backend (authenticated)";
      this.item.backgroundColor = undefined;
    } else if (this.connectionState === "CONNECTED") {
      this.item.text = "$(key) SDLC Agents";
      this.item.tooltip = "Connected — login required";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else if (this.connectionState === "CONNECTING") {
      this.item.text = "$(sync~spin) SDLC Agents";
      this.item.tooltip = "Connecting to backend...";
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = "$(circle-slash) SDLC Agents";
      this.item.tooltip = "Disconnected from backend";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
