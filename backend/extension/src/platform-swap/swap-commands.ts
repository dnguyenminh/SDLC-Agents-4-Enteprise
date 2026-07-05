/**
 * SwapCommands — registers VS Code commands for platform swap operations.
 * Handles QuickPick UI, confirmation dialogs, and progress notifications.
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { PlatformId } from "./types";
import { PlatformDetector } from "./platform-detector";
import { SwapExecutor } from "./swap-executor";
import { StateManager } from "./state-manager";
import { PlatformStatusBar } from "./platform-status-bar";
import { PLATFORM_DEFINITIONS, getPlatformDefinition } from "./platform-config";

/** Register all platform swap commands */
export function registerSwapCommands(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
  detector: PlatformDetector,
  executor: SwapExecutor,
  stateManager: StateManager,
  statusBar: PlatformStatusBar,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "kiroSdlc.swapPlatform",
      () => handleSwapPlatform(workspaceRoot, detector, executor, stateManager, statusBar),
    ),
    vscode.commands.registerCommand(
      "kiroSdlc.restoreBackup",
      () => handleRestoreBackup(executor, stateManager, statusBar, detector),
    ),
    vscode.commands.registerCommand(
      "kiroSdlc.platformStatus",
      () => handlePlatformStatus(detector, stateManager),
    ),
  );
}

async function handleSwapPlatform(
  workspaceRoot: string,
  detector: PlatformDetector,
  executor: SwapExecutor,
  stateManager: StateManager,
  statusBar: PlatformStatusBar,
): Promise<void> {
  const state = await stateManager.read();
  const available = await getAvailablePlatforms(workspaceRoot);

  if (available.length === 0) {
    vscode.window.showErrorMessage("No platform configs available.");
    return;
  }

  const items = buildQuickPickItems(available, state.activePlatform);
  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select target platform",
  });
  if (!selected) { return; }

  const targetId = selected.platformId;
  if (targetId === state.activePlatform) {
    vscode.window.showInformationMessage(
      `Already using ${selected.label} config.`);
    return;
  }

  statusBar.showSwapping();
  const result = await executor.executeSwap(state.activePlatform, targetId);

  if (result.success) {
    const detected = detector.detect();
    statusBar.update(targetId, detected.platform);
    vscode.window.showInformationMessage(
      `Agent config swapped to ${selected.label}. Backup: ${result.backupPath}`);
  } else {
    statusBar.showError(result.error || "Swap failed");
    vscode.window.showErrorMessage(
      `Swap failed: ${result.error}`);
  }
}

async function handleRestoreBackup(
  executor: SwapExecutor,
  stateManager: StateManager,
  statusBar: PlatformStatusBar,
  detector: PlatformDetector,
): Promise<void> {
  const state = await stateManager.read();
  if (state.backups.length === 0) {
    vscode.window.showInformationMessage("No backups available.");
    return;
  }

  const items = state.backups.map((b) => ({
    label: `${b.platform} — ${b.createdAt}`,
    description: `${b.fileCount} files`,
    backup: b,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select backup to restore",
  });
  if (!selected) { return; }

  statusBar.showSwapping();
  const result = await executor.executeRestore(
    state.activePlatform, selected.backup.platform, selected.backup);

  if (result.success) {
    const detected = detector.detect();
    statusBar.update(result.toPlatform, detected.platform);
    vscode.window.showInformationMessage(
      `Restored ${selected.backup.platform} config from backup.`);
  } else {
    statusBar.showError(result.error || "Restore failed");
  }
}

async function handlePlatformStatus(
  detector: PlatformDetector,
  stateManager: StateManager,
): Promise<void> {
  const state = await stateManager.read();
  const detected = detector.detect();
  const msg = `Active: ${state.activePlatform} | Detected: ${detected.platform} | Backups: ${state.backups.length}`;
  vscode.window.showInformationMessage(msg);
}

async function getAvailablePlatforms(workspaceRoot: string): Promise<PlatformId[]> {
  const available: PlatformId[] = [];
  for (const def of PLATFORM_DEFINITIONS) {
    const convPath = path.join(workspaceRoot, def.conversionPath);
    try {
      await fs.access(convPath);
      available.push(def.id);
    } catch { /* not available */ }
  }
  return available;
}

interface PlatformQuickPickItem extends vscode.QuickPickItem {
  platformId: PlatformId;
}

function buildQuickPickItems(
  available: PlatformId[],
  currentPlatform: PlatformId,
): PlatformQuickPickItem[] {
  return available.map((id) => {
    const def = getPlatformDefinition(id)!;
    const isCurrent = id === currentPlatform;
    return {
      label: def.displayName,
      description: isCurrent ? "$(check) current" : "",
      detail: `conversions/${id}/ ready`,
      platformId: id,
    };
  });
}
