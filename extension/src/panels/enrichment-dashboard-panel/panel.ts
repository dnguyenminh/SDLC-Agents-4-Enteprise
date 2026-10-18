/**
 * SA4E-169 — Enrichment Dashboard panel singleton (open/reveal/update).
 * The single source of truth for the currentPanel module state.
 */
import * as vscode from 'vscode';
import type { DashboardData } from './types';
import { buildHtml } from './html';

let currentPanel: vscode.WebviewPanel | undefined;

/** Open or reveal the Enrichment Dashboard panel. Singleton pattern. */
export function openEnrichmentDashboard(
  extensionUri: vscode.Uri,
  initialData: DashboardData,
): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Two);
    updatePanel(currentPanel, initialData);
    return currentPanel;
  }

  currentPanel = createDashboardPanel(initialData);
  return currentPanel;
}

/** Create the panel, wire dispose + retry-message handling (in original order). */
function createDashboardPanel(initialData: DashboardData): vscode.WebviewPanel {
  currentPanel = vscode.window.createWebviewPanel(
    'sa4e.enrichmentDashboard',
    'Enrichment Dashboard',
    vscode.ViewColumn.Two,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  currentPanel.webview.html = buildHtml(initialData);

  currentPanel.onDidDispose(() => { currentPanel = undefined; });
  registerRetryHandler(currentPanel);

  return currentPanel;
}

function registerRetryHandler(panel: vscode.WebviewPanel): void {
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'retryFailed') {
      try {
        await vscode.commands.executeCommand('sa4e.retryFailedEnrichment');
        currentPanel?.webview.postMessage({ type: 'retryResult', success: true, count: -1 });
      } catch (err: any) {
        currentPanel?.webview.postMessage({ type: 'retryResult', success: false, count: 0 });
      }
    }
  });
}

/** Update existing panel with new data (called every poll cycle). */
export function updatePanel(panel: vscode.WebviewPanel, data: DashboardData): void {
  panel.webview.postMessage({ type: 'update', data });
}

/** Get current panel reference (for periodic updates). */
export function getEnrichmentPanel(): vscode.WebviewPanel | undefined {
  return currentPanel;
}
