/**
 * index.ts — Public API for the platform-swap module.
 * Facade pattern: single initialization entry point for extension.ts.
 */

import * as vscode from "vscode";
import { PlatformDetector } from "./platform-detector";
import { BackupManager } from "./backup-manager";
import { SwapExecutor } from "./swap-executor";
import { StateManager } from "./state-manager";
import { PlatformStatusBar } from "./platform-status-bar";
import { registerSwapCommands } from "./swap-commands";

export interface PlatformSwapContext {
  detector: PlatformDetector;
  backupManager: BackupManager;
  swapExecutor: SwapExecutor;
  stateManager: StateManager;
  statusBar: PlatformStatusBar;
}

/** Initialize platform swap feature and wire into extension */
export async function initPlatformSwap(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  outputChannel: vscode.OutputChannel,
): Promise<PlatformSwapContext> {
  const detector = new PlatformDetector();
  const backupManager = new BackupManager(workspaceRoot);
  const stateManager = new StateManager(workspaceRoot);
  const swapExecutor = new SwapExecutor(
    workspaceRoot, backupManager, stateManager, outputChannel,
  );
  const statusBar = new PlatformStatusBar();

  // Register commands
  registerSwapCommands(
    context, workspaceRoot, detector,
    swapExecutor, stateManager, statusBar,
  );

  // Initial detection and status bar update
  const state = await stateManager.read();
  const detected = detector.detect();
  statusBar.update(state.activePlatform, detected.platform);

  context.subscriptions.push(statusBar);

  outputChannel.appendLine(
    `[PlatformSwap] Initialized. Active: ${state.activePlatform}, Detected: ${detected.platform}`,
  );

  return { detector, backupManager, swapExecutor, stateManager, statusBar };
}

// Re-export types for external consumers
export type { PlatformId, DetectionResult, SwapResult } from "./types";
export { PlatformDetector } from "./platform-detector";
export { BackupManager } from "./backup-manager";
export { SwapExecutor } from "./swap-executor";
export { StateManager } from "./state-manager";
export { PlatformStatusBar } from "./platform-status-bar";
