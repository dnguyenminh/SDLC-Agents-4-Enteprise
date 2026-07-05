/**
 * Debug Logger — KSA-240
 * Singleton OutputChannel logger visible in Output → "Kiro SDLC Debug"
 */
import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

export function debugLog(message: string): void {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Kiro SDLC Debug");
  }
  const ts = new Date().toISOString().slice(11, 23);
  channel.appendLine(`[${ts}] ${message}`);
}

export function debugError(message: string, error?: Error): void {
  if (!channel) {
    channel = vscode.window.createOutputChannel("Kiro SDLC Debug");
  }
  const ts = new Date().toISOString().slice(11, 23);
  channel.appendLine(`[${ts}] ERROR: ${message}${error ? ` — ${error.message}` : ""}`);
}
