/**
 * Type definitions for the Platform Swap feature.
 * All interfaces, enums, and type aliases used across platform-swap modules.
 */

/** Supported platform identifiers */
export type PlatformId = "kiro" | "claude-code" | "github-copilot" | "antigravity";

/** Detection signal types */
export type SignalType = "appName" | "extension" | "envVar";

/** Result of IDE platform detection */
export interface DetectionResult {
  platform: PlatformId;
  detectedAt: number;
  signals: string[];
}

/** Signal used to identify a platform */
export interface DetectionSignal {
  type: SignalType;
  pattern: string;
  priority: number;
}

/** Static definition of a platform's config structure */
export interface PlatformDefinition {
  id: PlatformId;
  displayName: string;
  directories: string[];
  conversionPath: string;
  detectionSignals: DetectionSignal[];
}

/** Persistent state stored in .agent-config.json */
export interface AgentConfigState {
  activePlatform: PlatformId;
  lastSwapAt?: string;
  autoSwap: boolean;
  platformOverride: PlatformId | null;
  backups: BackupRecord[];
}

/** Record of a single backup operation */
export interface BackupRecord {
  platform: PlatformId;
  path: string;
  createdAt: string;
  complete: boolean;
  fileCount: number;
}

/** Result returned after a swap or restore operation */
export interface SwapResult {
  success: boolean;
  fromPlatform: PlatformId;
  toPlatform: PlatformId;
  backupPath?: string;
  error?: string;
}

/** Summary of merge-on-restore operations */
export interface MergeReport {
  restored: number;
  updated: number;
  preserved: number;
  added: number;
}
