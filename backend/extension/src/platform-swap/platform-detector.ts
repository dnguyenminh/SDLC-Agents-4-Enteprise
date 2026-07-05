/**
 * PlatformDetector — identifies the current IDE environment using
 * VS Code API signals. Implements Strategy pattern for signal checks.
 */

import * as vscode from "vscode";
import { PlatformId, DetectionResult } from "./types";
import { PLATFORM_DEFINITIONS } from "./platform-config";

export class PlatformDetector {
  private cachedResult: DetectionResult | null = null;

  /** Detect current platform from IDE signals */
  detect(): DetectionResult {
    if (this.cachedResult) {
      return this.cachedResult;
    }
    const signals: string[] = [];
    const platform = this.resolvePlatform(signals);

    this.cachedResult = {
      platform,
      detectedAt: Date.now(),
      signals,
    };
    return this.cachedResult;
  }

  /** Clear cached detection — next detect() runs full check */
  invalidateCache(): void {
    this.cachedResult = null;
  }

  private resolvePlatform(signals: string[]): PlatformId {
    if (this.checkKiro(signals)) { return "kiro"; }
    if (this.checkClaudeCode(signals)) { return "claude-code"; }
    if (this.checkGitHubCopilot(signals)) { return "github-copilot"; }
    if (this.checkAntigravity(signals)) { return "antigravity"; }
    signals.push("fallback");
    return "kiro";
  }

  private checkKiro(signals: string[]): boolean {
    const appName = vscode.env.appName || "";
    if (appName.includes("Kiro")) {
      signals.push(`appName:Kiro`);
      return true;
    }
    return false;
  }

  private checkClaudeCode(signals: string[]): boolean {
    const appName = vscode.env.appName || "";
    if (appName.includes("Cursor")) {
      signals.push(`appName:Cursor`);
      return true;
    }
    if (appName.includes("Windsurf")) {
      signals.push(`appName:Windsurf`);
      return true;
    }
    if (this.hasExtension("anthropic.claude")) {
      signals.push(`ext:anthropic.claude`);
      return true;
    }
    return false;
  }

  private checkGitHubCopilot(signals: string[]): boolean {
    if (this.hasExtension("github.copilot")) {
      signals.push(`ext:github.copilot`);
      return true;
    }
    return false;
  }

  private checkAntigravity(signals: string[]): boolean {
    if (process.env.GEMINI_API_KEY) {
      signals.push(`envVar:GEMINI_API_KEY`);
      return true;
    }
    return false;
  }

  private hasExtension(extensionId: string): boolean {
    return vscode.extensions.all.some(
      (ext) => ext.id === extensionId,
    );
  }
}
