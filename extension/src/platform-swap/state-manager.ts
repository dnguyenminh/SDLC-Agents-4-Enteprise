/**
 * StateManager — atomic read/write of .agent-config.json state file.
 * Uses temp-file + rename pattern to prevent corruption.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { AgentConfigState, PlatformId, BackupRecord } from "./types";

export class StateManager {
  private static readonly STATE_FILE = ".agent-config.json";
  private static readonly MAX_BACKUPS = 5;

  constructor(private readonly workspaceRoot: string) {}

  /** Read state file; returns defaults if missing or corrupted */
  async read(): Promise<AgentConfigState> {
    const filePath = this.getFilePath();
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content) as AgentConfigState;
    } catch (err) {
      // File missing → normal first-run (no log needed)
      // File corrupt / parse error → log warning so data loss is visible
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        console.warn(`[StateManager] Could not read ${StateManager.STATE_FILE} (${(err as Error).message}) — using defaults`);
      }
      return this.getDefaultState();
    }
  }

  /** Atomic write: temp file then rename */
  async write(state: AgentConfigState): Promise<void> {
    const filePath = this.getFilePath();
    const tmpPath = `${filePath}.tmp`;
    const content = JSON.stringify(state, null, 2);

    await fs.writeFile(tmpPath, content, "utf-8");
    await fs.rename(tmpPath, filePath);
  }

  /** Update only the active platform field */
  async updateActivePlatform(platform: PlatformId): Promise<void> {
    const state = await this.read();
    state.activePlatform = platform;
    state.lastSwapAt = new Date().toISOString();
    await this.write(state);
  }

  /** Append a backup record, enforcing max retention */
  async addBackupRecord(record: BackupRecord): Promise<void> {
    const state = await this.read();
    state.backups.push(record);
    this.enforceRetention(state, record.platform);
    await this.write(state);
  }

  /** Remove the oldest backup record for a platform */
  async removeOldestBackup(platform: PlatformId): Promise<void> {
    const state = await this.read();
    const idx = state.backups.findIndex(
      (b) => b.platform === platform,
    );
    if (idx >= 0) {
      state.backups.splice(idx, 1);
      await this.write(state);
    }
  }

  /** Find latest complete backup for a platform */
  async findLatestBackup(
    platform: PlatformId,
  ): Promise<BackupRecord | undefined> {
    const state = await this.read();
    return [...state.backups]
      .filter((b) => b.platform === platform && b.complete)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  private enforceRetention(
    state: AgentConfigState,
    platform: PlatformId,
  ): void {
    const platformBackups = state.backups.filter(
      (b) => b.platform === platform,
    );
    while (platformBackups.length > StateManager.MAX_BACKUPS) {
      const oldest = platformBackups.shift()!;
      const idx = state.backups.indexOf(oldest);
      if (idx >= 0) { state.backups.splice(idx, 1); }
    }
  }

  private getDefaultState(): AgentConfigState {
    return {
      activePlatform: "kiro",
      autoSwap: false,
      platformOverride: null,
      backups: [],
    };
  }

  private getFilePath(): string {
    return path.join(this.workspaceRoot, StateManager.STATE_FILE);
  }
}
