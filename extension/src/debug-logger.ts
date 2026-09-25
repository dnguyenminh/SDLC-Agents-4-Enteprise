/**
 * Debug Logger — KSA-240 / SEC-289-10
 * Singleton OutputChannel logger visible in Output → "SDLC Agents Debug"
 * With automatic redaction for tokens, passwords, and sensitive chat contents.
 */
import * as vscode from "vscode";

let channel: vscode.OutputChannel | undefined;

const SENSITIVE_PATTERNS = [
  /(Bearer\s+)[A-Za-z0-9-_.]+/gi,
  /("?(?:token|password|secret|apiKey|access_token|client_secret)"?\s*[:=]\s*)"[^"]+"/gi,
  /("?(?:chatHistory|messages|prompt)"?\s*:\s*)(\[[^\]]*\]|"[^"]*")/gi,
];

export function redactSensitive(text: string): string {
  if (!text || typeof text !== "string") return text;
  let redacted = text;
  for (const pattern of SENSITIVE_PATTERNS) {
    redacted = redacted.replace(pattern, '$1"***REDACTED***"');
  }
  return redacted;
}

export function debugLog(message: string): void {
  if (!channel && vscode?.window?.createOutputChannel) {
    channel = vscode.window.createOutputChannel("SDLC Agents Debug");
  }
  const ts = new Date().toISOString().slice(11, 23);
  const safeMsg = redactSensitive(message);
  if (channel) {
    channel.appendLine(`[${ts}] ${safeMsg}`);
  }
}

export function debugError(message: string, error?: Error): void {
  if (!channel && vscode?.window?.createOutputChannel) {
    channel = vscode.window.createOutputChannel("SDLC Agents Debug");
  }
  const ts = new Date().toISOString().slice(11, 23);
  const safeMsg = redactSensitive(message);
  const safeErr = error ? ` — ${redactSensitive(error.message)}` : "";
  if (channel) {
    channel.appendLine(`[${ts}] ERROR: ${safeMsg}${safeErr}`);
  }
}
