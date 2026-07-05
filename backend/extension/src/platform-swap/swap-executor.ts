/**
 * SwapExecutor — orchestrates the swap sequence using Template Method pattern.
 * Fixed sequence: validate → backup → clean → copy → update state.
 * Includes rollback on failure.
 */

import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { PlatformId, SwapResult, MergeReport, BackupRecord } from "./types";
import { BackupManager } from "./backup-manager";
import { StateManager } from "./state-manager";
import { getPlatformDefinition, PROTECTED_PATHS } from "./platform-config";

export class SwapExecutor {
  private static readonly DELETE_RETRIES = 3;
  private static readonly RETRY_DELAY_MS = 500;

  constructor(
    private readonly workspaceRoot: string,
    private readonly backupManager: BackupManager,
    private readonly stateManager: StateManager,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  /** Execute a platform swap: backup → delete old → copy new → update state */
  async executeSwap(
    fromPlatform: PlatformId,
    toPlatform: PlatformId,
  ): Promise<SwapResult> {
    if (fromPlatform === toPlatform) {
      return this.buildResult(false, fromPlatform, toPlatform,
        undefined, `Already using ${toPlatform}`);
    }

    const targetDef = getPlatformDefinition(toPlatform);
    if (!targetDef) {
      return this.buildResult(false, fromPlatform, toPlatform,
        undefined, "Platform definition not found");
    }

    const conversionExists = await this.pathExists(
      path.join(this.workspaceRoot, targetDef.conversionPath),
    );
    if (!conversionExists) {
      return this.buildResult(false, fromPlatform, toPlatform,
        undefined, "Platform config not available");
    }

    // Step 1: Backup current
    const fromDef = getPlatformDefinition(fromPlatform);
    let backupRecord: BackupRecord | undefined;
    if (fromDef) {
      try {
        backupRecord = await this.backupManager.createBackup(
          fromPlatform, fromDef.directories);
        this.log(`Backup created: ${backupRecord.path}`);
      } catch (err) {
        return this.buildResult(false, fromPlatform, toPlatform,
          undefined, `Backup failed: ${String(err)}`);
      }
    }

    // Step 2: Delete old platform dirs
    try {
      await this.deletePlatformDirs(fromPlatform);
      this.log(`Deleted ${fromPlatform} directories`);
    } catch (err) {
      this.log(`Delete failed, preserving backup: ${String(err)}`);
      return this.buildResult(false, fromPlatform, toPlatform,
        backupRecord?.path, `Delete failed: ${String(err)}`);
    }

    // Step 3: Copy new platform dirs
    try {
      await this.copyFromConversions(toPlatform);
      this.log(`Copied ${toPlatform} from conversions`);
    } catch (err) {
      // Rollback: restore from backup
      if (backupRecord) {
        await this.rollback(backupRecord);
        this.log("Rolled back to backup after copy failure");
      }
      return this.buildResult(false, fromPlatform, toPlatform,
        backupRecord?.path, `Copy failed: ${String(err)}`);
    }

    // Step 4: Update state
    await this.stateManager.updateActivePlatform(toPlatform);
    if (backupRecord) {
      await this.stateManager.addBackupRecord(backupRecord);
      await this.backupManager.pruneOldBackups(fromPlatform);
    }

    this.log(`Swap complete: ${fromPlatform} → ${toPlatform}`);
    return this.buildResult(true, fromPlatform, toPlatform,
      backupRecord?.path);
  }

  /** Restore from a backup record */
  async executeRestore(
    currentPlatform: PlatformId,
    targetPlatform: PlatformId,
    backup: BackupRecord,
  ): Promise<SwapResult> {
    // Backup current before restore
    const currentDef = getPlatformDefinition(currentPlatform);
    if (currentDef) {
      await this.backupManager.createBackup(
        currentPlatform, currentDef.directories);
    }

    // Delete current dirs
    await this.deletePlatformDirs(currentPlatform);

    // Restore from backup
    await this.backupManager.restoreFromBackup(backup);

    // Update state
    await this.stateManager.updateActivePlatform(targetPlatform);

    this.log(`Restored ${targetPlatform} from backup`);
    return this.buildResult(true, currentPlatform, targetPlatform,
      backup.path);
  }

  /** Delete all directories for a platform with retry logic */
  private async deletePlatformDirs(platform: PlatformId): Promise<void> {
    const def = getPlatformDefinition(platform);
    if (!def) { return; }

    for (const dir of def.directories) {
      if (this.isProtected(dir)) { continue; }
      const fullPath = path.join(this.workspaceRoot, dir);
      await this.deleteWithRetry(fullPath);
    }
  }

  /** Copy platform files from conversions directory */
  private async copyFromConversions(platform: PlatformId): Promise<void> {
    const def = getPlatformDefinition(platform);
    if (!def) {
      throw new Error(`No definition for platform: ${platform}`);
    }
    const srcBase = path.join(this.workspaceRoot, def.conversionPath);
    await this.backupManager.copyDirectory(srcBase, this.workspaceRoot);
  }

  /** Restore workspace from backup after failed swap */
  private async rollback(backup: BackupRecord): Promise<void> {
    await this.backupManager.restoreFromBackup(backup);
  }

  /** Delete path with retry on EBUSY/EPERM */
  private async deleteWithRetry(targetPath: string): Promise<void> {
    for (let attempt = 1; attempt <= SwapExecutor.DELETE_RETRIES; attempt++) {
      try {
        await fs.rm(targetPath, { recursive: true, force: true });
        return;
      } catch (err: any) {
        const isRetriable = err.code === "EBUSY" || err.code === "EPERM";
        if (!isRetriable || attempt === SwapExecutor.DELETE_RETRIES) {
          throw err;
        }
        await this.delay(SwapExecutor.RETRY_DELAY_MS);
      }
    }
  }

  private isProtected(dirPath: string): boolean {
    return PROTECTED_PATHS.some((p) =>
      dirPath.startsWith(p) || dirPath === p);
  }

  private buildResult(
    success: boolean, from: PlatformId, to: PlatformId,
    backupPath?: string, error?: string,
  ): SwapResult {
    return { success, fromPlatform: from, toPlatform: to, backupPath, error };
  }

  private log(message: string): void {
    this.outputChannel.appendLine(`[PlatformSwap] ${message}`);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async pathExists(p: string): Promise<boolean> {
    try { await fs.access(p); return true; } catch { return false; }
  }
}
