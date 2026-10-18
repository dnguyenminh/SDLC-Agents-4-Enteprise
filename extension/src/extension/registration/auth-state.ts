/**
 * Auth state → UI reaction wiring (status bar, tree, panels, session expiry).
 * Extracted from extension.ts (BR-18 file-size limit).
 */
import * as vscode from "vscode";
import { runtime } from "./state";

export function setupAuthStateHandlers(): void {
  let wasAuthenticated = runtime.authManager?.isAuthenticated ?? false;
  runtime.authManager?.onStateChange((state) => {
    runtime.statusBarManager?.setAuthState(state);
    if (state === "AUTHENTICATED") {
      wasAuthenticated = true;
      // Resolve the REAL signed-in user (password or SSO) from the backend
      // instead of hardcoding "admin". Set a neutral label first, then refine.
      runtime.treeProvider?.setAuthenticated(true, "");
      runtime.authManager?.fetchCurrentUsername().then((name) => {
        if (runtime.authManager?.isAuthenticated) { runtime.treeProvider?.setAuthenticated(true, name); }
      });
      runtime.panelManager?.notifyAllPanels({ type: "serverStatus", status: "connected" });
    } else if (state === "UNAUTHENTICATED") {
      runtime.treeProvider?.setAuthenticated(false);
      runtime.panelManager?.notifyAllPanels({ type: "serverStatus", status: "disconnected" });
      // SA4E-39: Warn user when session expires (only if was previously authenticated)
      if (wasAuthenticated) {
        wasAuthenticated = false;
        vscode.window.showWarningMessage(
          "Session expired. Knowledge base sync is paused. Please login to resume.",
          "Login"
        ).then((action) => {
          if (action === "Login") { vscode.commands.executeCommand("sdlcAgents.login"); }
        });
      }
    }
  });
}
