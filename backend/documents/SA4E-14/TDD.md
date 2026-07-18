# Technical Design Document (TDD)

## SDLC Agents 4 Enterprise --- SA4E-14: IDE-Aware Agent Config Swap

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-14 |
| Title | IDE-Aware Agent Config Swap |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-14 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-14.docx |
| Related FSD | FSD-v1-SA4E-14.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-14 | SA Agent | Initial TDD from FSD |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies HOW to implement the IDE-Aware Agent Config Swap feature within the existing VS Code extension. It defines the architecture, module design, file operations, and integration patterns needed to add platform detection and config swap capabilities.

### 1.2 Scope

- New TypeScript modules in `backend/extension/src/platform-swap/`
- Integration with existing extension activation flow
- New VS Code commands and status bar item
- File system operations for backup/restore/swap
- State management via .agent-config.json

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | >= 18.14 |
| Framework | VS Code Extension API | 1.85+ |
| Build | esbuild | (existing) |
| Test | Mocha | (existing for extension) |
| File I/O | Node.js fs/promises | Built-in |

### 1.4 Design Principles

- SOLID: Single responsibility per module (Detector, Backup, Swap, State, UI)
- Strategy Pattern: Platform detection uses pluggable signal checkers
- Template Method: Swap operation follows fixed sequence with hooks
- Existing patterns: Align with injector.ts and config-watcher.ts conventions
- Defensive: All file ops wrapped in try/catch with rollback capability

### 1.5 Constraints

- Must not increase extension activation time by more than 100ms
- Must work on Windows, macOS, Linux (cross-platform paths)
- Must not conflict with existing injector or MCP server features
- File operations limited to workspace scope
- No network calls (fully offline feature)

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-14.docx |
| FSD | FSD-v1-SA4E-14.docx |
| Extension Source | backend/extension/src/ |
| Checksum Module | backend/extension/src/checksum.ts |
| Injector Module | backend/extension/src/injector.ts |


---

## 2. System Architecture

### 2.1 Architecture Overview

The Config Swap feature is implemented as a new subsystem within the existing VS Code extension. It follows the Plugin pattern, integrating with the extension's activation lifecycle and command registration.

![Architecture Diagram](diagrams/architecture.png)

The architecture introduces a `platform-swap/` module directory containing 5 classes with clear separation of concerns:
- **PlatformDetector** (Strategy pattern) - determines IDE platform
- **BackupManager** - handles backup creation, verification, retention
- **SwapExecutor** - orchestrates the swap sequence (Template Method)
- **StateManager** - atomic read/write of .agent-config.json
- **PlatformStatusBar** - VS Code status bar integration

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| PlatformDetector | IDE identification via signals | VS Code API |
| BackupManager | File copy, verify, prune | Node.js fs/promises |
| SwapExecutor | Orchestrate backup-clean-copy-update | Composition |
| StateManager | Atomic JSON state persistence | Node.js fs + rename |
| PlatformStatusBar | Status bar rendering | VS Code StatusBarItem |
| PlatformConfig (data) | Platform directory mappings | Static config |

### 2.3 Deployment Architecture

No separate deployment. Feature ships as part of the existing VS Code extension bundle. The esbuild configuration already bundles all `src/` files.

### 2.4 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| Extension activate | PlatformDetector | Function call | Sync | Detect on startup |
| SwapExecutor | BackupManager | Function call | Async | Backup before swap |
| SwapExecutor | StateManager | Function call | Async | Persist state |
| PlatformStatusBar | SwapExecutor | Event | Async | Click triggers swap |
| ConfigSwap commands | SwapExecutor | Command handler | Async | User-initiated swap |

---

## 3. API Design

### 3.1 API Overview (VS Code Commands)

| # | Command ID | Method | Description | Source |
|---|----------|--------|-------------|--------|
| 1 | kiroSdlc.swapPlatform | Command | Manual platform swap | UC-03 |
| 2 | kiroSdlc.restoreBackup | Command | Restore from specific backup | UC-04 |
| 3 | kiroSdlc.platformStatus | Command | Show current platform info | UC-07 |

### 3.2 Command: kiroSdlc.swapPlatform

**Implements:** UC-03, BR-11, BR-12, BR-13, BR-14

| Attribute | Value |
|-----------|-------|
| Command ID | kiroSdlc.swapPlatform |
| Handler | SwapCommandHandler.execute() |
| Auth | None (local operation) |

**Flow:**
1. Get available platforms (scan conversions/ directory)
2. Show QuickPick with platforms (current marked)
3. On selection: validate -> backup -> clean -> copy -> update state
4. Show result notification

**Error Responses:**

| Condition | Code | Message | Action |
|-----------|------|---------|--------|
| No conversions dir | SWAP_NO_CONFIGS | "No platform configs available" | Show error toast |
| Already active | SWAP_SAME_PLATFORM | "Already using {platform}" | Show info toast |
| Backup failed | SWAP_BACKUP_FAILED | "Backup failed: {reason}" | Abort, no changes |
| Copy failed | SWAP_COPY_FAILED | "Copy failed: {reason}" | Rollback from backup |
| Delete failed | SWAP_DELETE_FAILED | "Cannot remove {dir}" | Abort, backup preserved |


---

## 4. Database Design

Not applicable. This feature uses file-based state (.agent-config.json) instead of a database. See Section 5 for the state file schema and Section 6 for the file I/O patterns.

---

## 5. Class / Module Design

### 5.1 Package Structure

```
backend/extension/src/platform-swap/
+-- index.ts                    # Public API exports
+-- platform-detector.ts        # PlatformDetector class (Strategy)
+-- platform-config.ts          # Static platform definitions (data)
+-- backup-manager.ts           # BackupManager class
+-- swap-executor.ts            # SwapExecutor class (Template Method)
+-- state-manager.ts            # StateManager class
+-- platform-status-bar.ts      # PlatformStatusBar class
+-- swap-commands.ts            # Command handlers registration
+-- types.ts                    # Interfaces and type definitions
```

### 5.2 Key Interfaces

```typescript
// types.ts

export type PlatformId = "kiro" | "claude-code" | "github-copilot" | "antigravity";

export interface DetectionResult {
    platform: PlatformId;
    detectedAt: number;
    signals: string[];
}

export interface PlatformDefinition {
    id: PlatformId;
    displayName: string;
    directories: string[];
    conversionPath: string;
    detectionSignals: DetectionSignal[];
}

export interface DetectionSignal {
    type: "appName" | "extension" | "envVar";
    pattern: string;
    priority: number;
}

export interface AgentConfigState {
    activePlatform: PlatformId;
    lastSwapAt?: string;
    autoSwap: boolean;
    platformOverride: PlatformId | null;
    backups: BackupRecord[];
}

export interface BackupRecord {
    platform: PlatformId;
    path: string;
    createdAt: string;
    complete: boolean;
    fileCount: number;
}

export interface SwapResult {
    success: boolean;
    fromPlatform: PlatformId;
    toPlatform: PlatformId;
    backupPath?: string;
    error?: string;
}

export interface MergeReport {
    restored: number;
    updated: number;
    preserved: number;
    added: number;
}
```

### 5.3 Class: PlatformDetector

```typescript
// platform-detector.ts
import * as vscode from "vscode";
import { PlatformId, DetectionResult, PlatformDefinition } from "./types";
import { PLATFORM_DEFINITIONS } from "./platform-config";

export class PlatformDetector {
    private cachedResult: DetectionResult | null = null;

    detect(): DetectionResult {
        if (this.cachedResult) { return this.cachedResult; }
        const signals: string[] = [];
        let platform: PlatformId = "kiro";

        // Priority order: kiro > claude-code > github-copilot > antigravity
        if (this.checkKiro(signals)) { platform = "kiro"; }
        else if (this.checkClaudeCode(signals)) { platform = "claude-code"; }
        else if (this.checkGitHubCopilot(signals)) { platform = "github-copilot"; }
        else if (this.checkAntigravity(signals)) { platform = "antigravity"; }

        this.cachedResult = { platform, detectedAt: Date.now(), signals };
        return this.cachedResult;
    }

    invalidateCache(): void { this.cachedResult = null; }

    private checkKiro(signals: string[]): boolean { /* ... */ }
    private checkClaudeCode(signals: string[]): boolean { /* ... */ }
    private checkGitHubCopilot(signals: string[]): boolean { /* ... */ }
    private checkAntigravity(signals: string[]): boolean { /* ... */ }
}
```

### 5.4 Class: BackupManager

```typescript
// backup-manager.ts
import { PlatformId, BackupRecord } from "./types";

export class BackupManager {
    private static readonly MAX_RETENTION = 5;

    constructor(private readonly workspaceRoot: string) {}

    async createBackup(platform: PlatformId, directories: string[]): Promise<BackupRecord> { /* ... */ }
    async verifyBackup(record: BackupRecord): Promise<boolean> { /* ... */ }
    async restoreFromBackup(record: BackupRecord): Promise<void> { /* ... */ }
    async pruneOldBackups(platform: PlatformId, maxRetention?: number): Promise<number> { /* ... */ }

    private generateBackupPath(platform: PlatformId): string { /* ... */ }
    private async countFiles(dir: string): Promise<number> { /* ... */ }
    private async copyDirectory(src: string, dest: string): Promise<void> { /* ... */ }
}
```

### 5.5 Class: SwapExecutor (Template Method)

```typescript
// swap-executor.ts
import { PlatformId, SwapResult, MergeReport } from "./types";
import { BackupManager } from "./backup-manager";
import { StateManager } from "./state-manager";

export class SwapExecutor {
    constructor(
        private readonly workspaceRoot: string,
        private readonly backupManager: BackupManager,
        private readonly stateManager: StateManager,
        private readonly outputChannel: vscode.OutputChannel
    ) {}

    async executeSwap(fromPlatform: PlatformId, toPlatform: PlatformId): Promise<SwapResult> {
        // Template Method: fixed sequence
        // 1. Backup current
        // 2. Delete old platform dirs
        // 3. Copy new platform dirs from conversions/
        // 4. Update state
        // Returns SwapResult
    }

    async executeRestore(targetPlatform: PlatformId, backup: BackupRecord): Promise<SwapResult> {
        // 1. Backup current (before restore)
        // 2. Delete current platform dirs
        // 3. Copy from backup
        // 4. Merge extension updates
        // 5. Update state
    }

    private async deletePlatformDirs(platform: PlatformId): Promise<void> { /* ... */ }
    private async copyFromConversions(platform: PlatformId): Promise<void> { /* ... */ }
    private async mergeExtensionUpdates(extensionPath: string): Promise<MergeReport> { /* ... */ }
    private async rollback(backupRecord: BackupRecord): Promise<void> { /* ... */ }
}
```

### 5.6 Class: StateManager

```typescript
// state-manager.ts
import { AgentConfigState, PlatformId, BackupRecord } from "./types";

export class StateManager {
    private static readonly STATE_FILE = ".agent-config.json";

    constructor(private readonly workspaceRoot: string) {}

    async read(): Promise<AgentConfigState> { /* atomic read, init if missing */ }
    async write(state: AgentConfigState): Promise<void> { /* atomic write via temp+rename */ }
    async updateActivePlatform(platform: PlatformId): Promise<void> { /* ... */ }
    async addBackupRecord(record: BackupRecord): Promise<void> { /* ... */ }
    async removeOldestBackup(platform: PlatformId): Promise<void> { /* ... */ }

    private getDefaultState(): AgentConfigState {
        return { activePlatform: "kiro", autoSwap: false, platformOverride: null, backups: [] };
    }
}
```

### 5.7 Class: PlatformStatusBar

```typescript
// platform-status-bar.ts
import * as vscode from "vscode";
import { PlatformId, DetectionResult } from "./types";

export class PlatformStatusBar implements vscode.Disposable {
    private item: vscode.StatusBarItem;

    constructor() {
        this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
        this.item.command = "kiroSdlc.swapPlatform";
        this.item.show();
    }

    update(activePlatform: PlatformId, detectedPlatform: PlatformId): void { /* ... */ }
    showSwapping(): void { /* ... */ }
    showError(message: string): void { /* ... */ }
    dispose(): void { this.item.dispose(); }
}
```

### 5.8 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| Strategy | PlatformDetector signal checks | Each platform has different detection logic |
| Template Method | SwapExecutor.executeSwap() | Fixed sequence: backup->clean->copy->update |
| Singleton | PlatformDetector (cached) | Detection runs once, result reused |
| Observer | PlatformStatusBar updates | React to swap completion events |
| Facade | index.ts exports | Simple API for extension.ts integration |

### 5.9 Error Handling

| Exception | Action | When Thrown |
|-----------|--------|------------|
| BackupFailedError | Abort swap, notify user | Disk full, permissions |
| SwapAbortedError | Rollback from backup, notify | Delete/copy fails mid-swap |
| StateCorruptedError | Recreate state from detection | Invalid JSON in state file |
| DirectoryLockedError | Retry 3x, then abort | File locked by process |
| ConversionMissingError | Abort, notify user | conversions/{platform}/ missing |


---

## 6. Integration Design

### 6.1 Integration: Extension Activation (extension.ts)

| Attribute | Value |
|-----------|-------|
| Protocol | Direct function call |
| Trigger | Extension activate() |
| Timeout | 100ms budget for detection |

**Integration Point:**

In `extension.ts` `initializeWorkspace()`, after existing setup:

```typescript
// After existing McpServerManager, ConfigWatcher, etc.
import { initPlatformSwap } from "./platform-swap";

const platformSwap = await initPlatformSwap(context, workspaceRoot, outputChannel);
// Returns: { detector, swapExecutor, statusBar }
// Registers commands, starts detection, renders status bar
```

**Sequence Diagram:**

![Activation Sequence](diagrams/api-sequence-activation.png)

### 6.2 Integration: Existing Checksum Module

| Attribute | Value |
|-----------|-------|
| Protocol | Direct import |
| Used By | SwapExecutor.mergeExtensionUpdates() |
| Purpose | Detect user-modified files during merge-on-restore |

**Data Mapping:**

| SwapExecutor calls | Checksum API | Purpose |
|-------------------|-------------|---------|
| Get file statuses | getFileStatuses(root, extPath) | Find outdated/modified files |
| Detect modifications | detectModifiedFiles(root, extPath) | Identify user-customized files |
| After merge | buildManifestAfterInject(root, extPath) | Update workspace manifest |

### 6.3 Integration: Existing Injector Module

| Attribute | Value |
|-----------|-------|
| Protocol | Shared pattern (not direct call) |
| Relationship | Parallel feature, similar patterns |
| Constraint | Must not conflict - injector manages .kiro/, swap also manages .kiro/ |

**Conflict Resolution:**
- Swap is the master operation: if a swap is in progress, injector operations are queued
- Injector handles per-file updates; Swap handles entire directory replacement
- After swap, workspace manifest is rebuilt (same as after inject)

---

## 7. Security Design

### 7.1 Authentication

Not applicable. All operations are local file system operations within the user's workspace.

### 7.2 Authorization

Inherited from VS Code/OS file permissions. The extension operates with the same permissions as the user's VS Code process.

### 7.3 Data Protection

| Data Type | At Rest | In Transit | In Logs |
|-----------|---------|------------|---------|
| .agent-config.json | Plain (no secrets) | N/A (local) | Full content |
| Backup files | Plain (copies of config) | N/A (local) | Path only |
| Platform detection | Memory only | N/A | Platform ID only |

### 7.4 Input Validation

| Input | Validation | Sanitization |
|-------|-----------|--------------|
| platformId | Must be in PlatformId enum | Reject unknown values |
| File paths | Must be within workspace root | path.resolve + startsWith check |
| .agent-config.json | JSON.parse with try/catch | Reset to defaults on corruption |
| QuickPick selection | Must be from provided list | Type-safe VS Code API |

---

## 8. Performance & Scalability

### 8.1 Performance Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| Platform detection | < 100ms | Date.now() before/after |
| Full swap (50 files) | < 3000ms | Date.now() around swap |
| Backup creation (50 files) | < 1500ms | Part of swap timing |
| State file read/write | < 10ms | Negligible |
| Status bar update | < 5ms | Event handler duration |

### 8.2 Optimization Strategies

| Strategy | Where | Impact |
|----------|-------|--------|
| Cached detection | PlatformDetector | Detect once per activation |
| Streaming copy | BackupManager.copyDirectory | Handle large directories |
| Parallel file operations | BackupManager | Copy multiple files concurrently |
| Lazy load | platform-swap module | Only load if feature used |

### 8.3 Resource Usage

| Resource | Budget | Justification |
|----------|--------|---------------|
| Memory | < 5MB peak during swap | File buffers released after copy |
| Disk | Backup size = config size x retention | ~50 files x 5 backups = manageable |
| CPU | Minimal (I/O bound) | No heavy computation |

---

## 9. Monitoring & Observability

### 9.1 Logging

| Log Event | Level | Fields | Destination |
|-----------|-------|--------|-------------|
| Detection complete | INFO | platform, signals, duration | Output channel |
| Swap started | INFO | from, to | Output channel |
| Backup created | INFO | path, fileCount, duration | Output channel |
| Swap complete | INFO | from, to, duration | Output channel |
| Swap failed | ERROR | reason, backup preserved | Output channel |
| State file corrupted | WARN | error message | Output channel |
| Backup pruned | DEBUG | platform, count removed | Output channel |

### 9.2 Output Channel

All logs go to the existing "Kiro MCP Server" output channel with `[PlatformSwap]` prefix:
```
[PlatformSwap] Detected platform: claude-code (signals: appName=VS Code, ext=anthropic.claude)
[PlatformSwap] Swap started: kiro -> claude-code
[PlatformSwap] Backup created: .agent-config-backup/kiro-20250714T100000 (47 files, 1.2s)
[PlatformSwap] Swap complete: kiro -> claude-code (2.8s total)
```

---

## 10. Deployment Considerations

### 10.1 Build Integration

Add `platform-swap/` to esbuild entry points (already auto-included via imports from extension.ts).

No new dependencies required. Uses only:
- Node.js built-in: `fs/promises`, `path`, `crypto`
- VS Code API: already available in extension context

### 10.2 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| kiroSdlc.platformSwap.enabled | true | Enable/disable entire feature |
| kiroSdlc.platformSwap.autoSwap | false | Auto-swap on detection mismatch |
| kiroSdlc.platformSwap.autoConfirm | false | Skip confirmation dialog |
| kiroSdlc.platformSwap.maxBackups | 5 | Maximum backup retention count |

### 10.3 Rollback Strategy

Feature is purely additive. Rollback = disable feature flag or revert extension version.
- No database migrations to rollback
- No external service dependencies
- .agent-config.json and .agent-config-backup/ can be deleted without harm

### 10.4 Migration

For existing users who already have .kiro/ configs:
1. On first activation with feature enabled, detect platform
2. Initialize .agent-config.json with activePlatform: "kiro" (current state)
3. No file changes until user explicitly triggers swap

---

## 11. Implementation Checklist

### Files to Create

| # | File | Size Estimate | Description |
|---|------|---------------|-------------|
| 1 | src/platform-swap/types.ts | ~60 lines | All interfaces and type definitions |
| 2 | src/platform-swap/platform-config.ts | ~80 lines | Static platform definitions |
| 3 | src/platform-swap/platform-detector.ts | ~100 lines | Detection logic with caching |
| 4 | src/platform-swap/backup-manager.ts | ~150 lines | Backup CRUD operations |
| 5 | src/platform-swap/swap-executor.ts | ~180 lines | Orchestration with rollback |
| 6 | src/platform-swap/state-manager.ts | ~100 lines | Atomic JSON state management |
| 7 | src/platform-swap/platform-status-bar.ts | ~80 lines | Status bar rendering |
| 8 | src/platform-swap/swap-commands.ts | ~100 lines | Command handler registration |
| 9 | src/platform-swap/index.ts | ~40 lines | Public API and initialization |

### Files to Modify

| # | File | Change | Description |
|---|------|--------|-------------|
| 1 | src/extension.ts | Add import + init call | Wire platform swap into activation |
| 2 | package.json | Add commands + settings | Register new commands and config |

### Test Files to Create

| # | File | Tests | Description |
|---|------|-------|-------------|
| 1 | src/test/platform-detector.test.ts | 8 tests | Detection signals and priority |
| 2 | src/test/backup-manager.test.ts | 10 tests | Backup create/verify/restore/prune |
| 3 | src/test/swap-executor.test.ts | 12 tests | Swap flow + rollback scenarios |
| 4 | src/test/state-manager.test.ts | 8 tests | Read/write/corrupt recovery |

---

## 12. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Activation | VS Code extension lifecycle event when extension loads |
| QuickPick | VS Code multi-option selection UI |
| Atomic write | Write to temp file then rename (prevents partial writes) |
| Retention | Maximum number of backups kept before pruning |

### Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| 1 | Should .agent-config-backup/ be gitignored? | Resolved | Yes - add to .gitignore template |
| 2 | Should swap lock prevent injector updates? | Resolved | Yes - use mutex during swap |
| 3 | What if user has custom dirs not in platform mapping? | Resolved | Not managed by swap - only platform-specific dirs |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Activation Sequence | [api-sequence-activation.png](diagrams/api-sequence-activation.png) | [api-sequence-activation.drawio](diagrams/api-sequence-activation.drawio) |
