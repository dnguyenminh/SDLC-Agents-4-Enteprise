/**
 * BackupManager — handles backup creation, verification, restoration,
 * and retention pruning for platform config directories.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { PlatformId, BackupRecord } from "./types";
import { getPlatformDefinition } from "./platform-config";

export class BackupManager {
  private static readonly MAX_RETENTION = 5;
  private static readonly BACKUP_DIR = ".agent-config-backup";

  constructor(private readonly workspaceRoot: string) {}

  /** Create a complete backup of platform directories */
  async createBackup(
    platform: PlatformId,
    directories: string[],
  ): Promise<BackupRecord> {
    const backupPath = this.generateBackupPath(platform);
    const fullBackupPath = path.join(this.workspaceRoot, backupPath);

    await fs.mkdir(fullBackupPath, { recursive: true });
    let fileCount = 0;

    for (const dir of directories) {
      const srcPath = path.join(this.workspaceRoot, dir);
      const exists = await this.pathExists(srcPath);
      if (exists) {
        const destPath = path.join(fullBackupPath, dir);
        await this.copyDirectory(srcPath, destPath);
        fileCount += await this.countFiles(destPath);
      }
    }

    const record: BackupRecord = {
      platform,
      path: backupPath,
      createdAt: new Date().toISOString(),
      complete: true,
      fileCount,
    };
    return record;
  }

  /** Verify backup completeness by checking file count */
  async verifyBackup(record: BackupRecord): Promise<boolean> {
    const fullPath = path.join(this.workspaceRoot, record.path);
    const exists = await this.pathExists(fullPath);
    if (!exists) { return false; }

    const actualCount = await this.countFiles(fullPath);
    return actualCount === record.fileCount;
  }

  /** Restore files from a backup to workspace root */
  async restoreFromBackup(record: BackupRecord): Promise<void> {
    const fullPath = path.join(this.workspaceRoot, record.path);
    const exists = await this.pathExists(fullPath);
    if (!exists) {
      throw new Error(`Backup not found: ${record.path}`);
    }
    await this.copyDirectory(fullPath, this.workspaceRoot);
  }

  /** Remove oldest backups beyond retention limit */
  async pruneOldBackups(
    platform: PlatformId,
    maxRetention = BackupManager.MAX_RETENTION,
  ): Promise<number> {
    const backupBase = path.join(
      this.workspaceRoot,
      BackupManager.BACKUP_DIR,
    );
    const exists = await this.pathExists(backupBase);
    if (!exists) { return 0; }

    const entries = await fs.readdir(backupBase);
    const platformBackups = entries
      .filter((e) => e.startsWith(`${platform}-`))
      .sort();

    const toRemove = platformBackups.slice(
      0,
      Math.max(0, platformBackups.length - maxRetention),
    );

    for (const dir of toRemove) {
      const fullPath = path.join(backupBase, dir);
      await fs.rm(fullPath, { recursive: true, force: true });
    }
    return toRemove.length;
  }

  private generateBackupPath(platform: PlatformId): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "")
      .replace("T", "T")
      .slice(0, 15);
    return path.join(
      BackupManager.BACKUP_DIR,
      `${platform}-${timestamp}`,
    );
  }

  /** Recursively count files in a directory */
  async countFiles(dir: string): Promise<number> {
    let count = 0;
    const stat = await fs.stat(dir);
    if (!stat.isDirectory()) { return 1; }

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        count += await this.countFiles(fullPath);
      } else {
        count++;
      }
    }
    return count;
  }

  /** Recursively copy directory/file to destination */
  async copyDirectory(src: string, dest: string): Promise<void> {
    const stat = await fs.stat(src);
    if (!stat.isDirectory()) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
      return;
    }
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  private async pathExists(p: string): Promise<boolean> {
    try {
      await fs.access(p);
      return true;
    } catch {
      // fs.access failure = file does not exist — intentional silent return false
      return false;
    }
  }
}

