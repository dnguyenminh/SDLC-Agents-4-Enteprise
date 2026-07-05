/**
 * PlatformStatusBar — VS Code status bar item showing active platform.
 * Updates on swap, shows mismatch warnings. Implements Observer pattern.
 */

import * as vscode from "vscode";
import { PlatformId } from "./types";
import { getPlatformDefinition } from "./platform-config";

export class PlatformStatusBar implements vscode.Disposable {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right, 99,
    );
    this.item.command = "kiroSdlc.swapPlatform";
    this.item.show();
  }

  /** Update display for matched or mismatched state */
  update(activePlatform: PlatformId, detectedPlatform: PlatformId): void {
    const def = getPlatformDefinition(activePlatform);
    const displayName = def?.displayName ?? activePlatform;

    if (activePlatform === detectedPlatform) {
      this.showMatched(displayName);
    } else {
      this.showMismatch(displayName, detectedPlatform);
    }
  }

  /** Show spinning indicator during swap */
  showSwapping(): void {
    this.item.text = "$(sync~spin) Swapping...";
    this.item.tooltip = "Swapping agent config...";
    this.item.backgroundColor = undefined;
  }

  /** Show error state */
  showError(message: string): void {
    this.item.text = "$(error) Config Error";
    this.item.tooltip = message;
    this.item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.errorBackground",
    );
  }

  dispose(): void {
    this.item.dispose();
  }

  private showMatched(displayName: string): void {
    this.item.text = `$(check) ${displayName}`;
    this.item.tooltip = `Agent config: ${displayName} (matched)`;
    this.item.backgroundColor = undefined;
  }

  private showMismatch(
    activeName: string,
    detectedPlatform: PlatformId,
  ): void {
    const detectedDef = getPlatformDefinition(detectedPlatform);
    const detectedName = detectedDef?.displayName ?? detectedPlatform;
    this.item.text = `$(warning) ${activeName} \u2260 ${detectedName}`;
    this.item.tooltip = "Platform mismatch! Click to swap";
    this.item.backgroundColor = new vscode.ThemeColor(
      "statusBarItem.warningBackground",
    );
  }
}
