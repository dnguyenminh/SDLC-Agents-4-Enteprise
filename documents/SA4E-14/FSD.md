# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise — SA4E-14: IDE-Aware Agent Config Swap

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-14 |
| Title | IDE-Aware Agent Config Swap |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-14 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-14.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-14 | BA Agent | Initial FSD from BRD |
| 1.0 | 2025-07-14 | TA Agent | Enriched with API contracts, technical specs |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the IDE-Aware Agent Config Swap feature — a VS Code extension capability that detects the active IDE platform, manages backup/restore of agent configuration directories, and swaps configs to match the detected platform.

### 1.2 Scope

- IDE/platform detection logic
- Config backup and restore lifecycle
- Manual and automatic swap flows
- State tracking via .agent-config.json
- Status bar integration
- Platform-specific directory management

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Platform | An AI agent runtime (Kiro, Claude Code, GitHub Copilot, Antigravity) |
| Config Swap | Replacing one platform's agent configs with another's |
| Backup | Timestamped copy of platform config dirs before swap |
| Restore | Copying backup back to active position |
| Merge-on-Restore | Applying extension updates on top of restored backup |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-14.docx |
| SA4E Architecture | .code-intel/SA4E-ARCHITECTURE.md |
| Existing Injector | backend/extension/src/injector.ts |
| Checksum Module | backend/extension/src/checksum.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Config Swap feature operates within the VS Code extension host, interacting with:
- **VS Code API** — IDE detection signals, command palette, status bar, notifications
- **File System** — Read/write config directories, backups, state file
- **Existing Extension Modules** — Checksum (modification detection), Injector (version management)
- **Conversion Directories** — Source of truth for platform-specific configs

### 2.2 System Architecture

The feature adds a new subsystem to the existing extension:
- **PlatformDetector** — Identifies current IDE environment
- **ConfigSwapManager** — Orchestrates backup → clean → copy → update state
- **BackupManager** — Handles backup creation, verification, retention, restore
- **StateManager** — Reads/writes .agent-config.json
- **StatusBarController** — Visual indicator of active platform and mismatch warnings

---

## 3. Functional Requirements

### 3.1 Feature: IDE Platform Detection

**Source:** BRD Story 1

#### 3.1.1 Description

On extension activation, the system determines which AI agent platform the user is currently using based on environment signals. Detection runs once and produces a deterministic platform ID.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** Developer (implicit - system triggered)
**Preconditions:** Extension activated in IDE
**Postconditions:** Platform ID determined and stored in memory

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Check vscode.env.appName | Read IDE application name |
| 2 | | Check installed extensions | Query vscode.extensions.all for platform markers |
| 3 | | Check environment variables | Look for GEMINI_API_KEY |
| 4 | | Apply priority rules | Resolve conflicts when multiple signals detected |
| 5 | | Store result | Cache platform ID in memory |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Multiple platform signals detected | Apply priority: kiro > claude-code > github-copilot > antigravity |
| AF-02 | platformOverride set in .agent-config.json | Skip detection, use override value |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | VS Code API unavailable | Default to "kiro" |
| EF-02 | Unknown IDE environment | Default to "kiro" |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Detection priority order: kiro > claude-code > github-copilot > antigravity | BRD Story 1 |
| BR-02 | Detection must complete within 100ms | BRD NFR |
| BR-03 | Same environment always produces same result (deterministic) | BRD Story 1 |
| BR-04 | Cursor and Windsurf map to claude-code platform | BRD Story 1 |
| BR-05 | If platformOverride is set, detection is bypassed | BRD Story 6 |

#### 3.1.4 Data Specifications

**Detection Signal Matrix:**

| Signal | Platform | Method |
|--------|----------|--------|
| appName contains "Kiro" | kiro | vscode.env.appName |
| Extension claude-dev or anthropic.claude active | claude-code | vscode.extensions |
| Extension github.copilot active | github-copilot | vscode.extensions |
| appName contains "Cursor" | claude-code | vscode.env.appName |
| appName contains "Windsurf" | claude-code | vscode.env.appName |
| GEMINI_API_KEY env var set | antigravity | process.env |
| None of above | kiro (default) | Fallback |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| platformId | string | One of: "kiro", "claude-code", "github-copilot", "antigravity" |
| detectedAt | number | Timestamp of detection (ms) |
| signals | string[] | List of signals that matched |


---

### 3.2 Feature: Backup Before Swap

**Source:** BRD Story 2

#### 3.2.1 Description

Before any config modification (swap or restore), the system creates a complete, verified backup of the currently active platform directories. Backup is atomic - either fully completes or the swap is aborted.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** System (triggered by swap flow)
**Preconditions:** Swap requested, active platform has config directories
**Postconditions:** Complete backup exists at .agent-config-backup/{platform}-{timestamp}/

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Determine active platform | Read from .agent-config.json or detect |
| 2 | | Resolve source directories | Map platform to directory list |
| 3 | | Create backup directory | .agent-config-backup/{platform}-{ISO timestamp}/ |
| 4 | | Copy all files recursively | Preserve directory structure |
| 5 | | Verify backup completeness | Compare file count source vs backup |
| 6 | | Update state file | Record backup in .agent-config.json |
| 7 | | Prune old backups | If > maxRetention, delete oldest |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | No config directories exist (first-time workspace) | Skip backup, proceed with swap |
| AF-02 | Backup already exists for this timestamp | Append incremental suffix (-1, -2) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Disk full | Abort swap, notify "Insufficient disk space for backup" |
| EF-02 | Permission denied on source files | Abort swap, list inaccessible files |
| EF-03 | Verification failed (count mismatch) | Mark backup incomplete, abort swap |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-06 | Backup MUST complete before any file deletion | BRD Story 2 |
| BR-07 | Default retention: 5 most recent backups per platform | BRD Story 2 |
| BR-08 | Backup verification: file count of backup must match source | BRD Story 2 |
| BR-09 | Incomplete backups are preserved for manual recovery | BRD Story 2 |
| BR-10 | Backup path must not exceed OS path length limit (260 Win, 4096 Linux) | BRD Story 2 |

#### 3.2.4 Data Specifications

**Platform Directory Mapping:**

| Platform | Directories/Files to Backup |
|----------|----------------------------|
| kiro | .kiro/agents/, .kiro/steering/, .kiro/hooks/, .kiro/settings/ |
| claude-code | CLAUDE.md, .claude/ |
| github-copilot | .github/copilot-instructions.md, .github/instructions/, .github/agents/, .github/hooks/ |
| antigravity | AGENTS.md, GEMINI.md, .agents/, skills/ |

**Backup Record Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| platform | string | Yes | Platform that was backed up |
| path | string | Yes | Relative path to backup dir |
| createdAt | string (ISO) | Yes | Backup creation timestamp |
| complete | boolean | Yes | Whether backup fully completed |
| fileCount | number | Yes | Number of files in backup |


---

### 3.3 Feature: Manual Platform Swap via Command Palette

**Source:** BRD Story 3

#### 3.3.1 Description

Developer can manually trigger a platform swap through VS Code command palette. The command shows available platforms (only those with conversion directories present), executes backup, cleans old config, copies new config, and updates state.

#### 3.3.2 Use Case

**Use Case ID:** UC-03
**Actor:** Developer
**Preconditions:** Extension activated, workspace open
**Postconditions:** Agent configs match selected platform

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Invoke command palette | | User presses Ctrl+Shift+P, types "Swap Platform" |
| 2 | | Show QuickPick | Display available platforms with current highlighted |
| 3 | Select platform | | User picks target platform |
| 4 | | Show confirmation | "Swap to {platform}? Current config will be backed up." |
| 5 | Confirm | | User clicks "Yes" |
| 6 | | Execute swap | Backup -> Clean -> Copy -> Update state |
| 7 | | Show success | Toast notification with backup location |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | User selects currently active platform | Show info "Already on {platform}", no swap |
| AF-02 | User cancels QuickPick | No action taken |
| AF-03 | autoConfirm setting enabled | Skip step 4-5, proceed directly |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | No conversion directories found | Show error "No platform configs available" |
| EF-02 | Swap fails mid-operation | Restore from backup automatically, show error |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-11 | Only show platforms with existing conversions/{platform}/ directory | BRD Story 3 |
| BR-12 | Current platform shown with checkmark in QuickPick | BRD Story 3 |
| BR-13 | Confirmation dialog can be disabled via settings | BRD Story 3 |
| BR-14 | Progress notification shown during swap operation | BRD Story 3 |

#### 3.3.4 UI Specifications

**Command Registration:**

| Command ID | Title | Category |
|-----------|-------|----------|
| kiroSdlc.swapPlatform | Swap Agent Platform | Kiro SDLC |
| kiroSdlc.restoreBackup | Restore Agent Backup | Kiro SDLC |

**QuickPick Items:**

| # | Element | Type | Behavior |
|---|---------|------|----------|
| 1 | Platform name | QuickPickItem.label | Platform display name |
| 2 | Current marker | QuickPickItem.description | "$(check) current" if active |
| 3 | Platform icon | QuickPickItem.iconPath | Platform-specific icon |
| 4 | Status | QuickPickItem.detail | "conversions/{platform}/ ready" |

#### 3.3.5 API Contract (Functional View)

**Command:** `kiroSdlc.swapPlatform`
**Purpose:** Manual platform swap trigger

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| targetPlatform | string | No | BR-11 | If provided, skip QuickPick and swap directly |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether swap completed |
| fromPlatform | string | Previous active platform |
| toPlatform | string | New active platform |
| backupPath | string | Path to created backup |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| No conversions available | "No platform configs available. Run conversion first." | conversions/ dir empty |
| Already on platform | "Already using {platform} config." | target == active |
| Swap failed | "Swap failed: {reason}. Backup preserved at {path}." | Any exception during swap |


---

### 3.4 Feature: Restore on Return

**Source:** BRD Story 4

#### 3.4.1 Description

When user returns to a previously-used IDE (detected on activation), the system offers to restore the backup associated with that platform. Restore uses the backup (preserving customizations) rather than fresh conversion files.

#### 3.4.2 Use Case

**Use Case ID:** UC-04
**Actor:** Developer (implicit - system triggered on activation)
**Preconditions:** Extension activates, platform detected differs from active, backup exists for detected platform
**Postconditions:** Previous platform config restored from backup

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Detect platform | Run UC-01 |
| 2 | | Read .agent-config.json | Check activePlatform |
| 3 | | Detect mismatch | detected != active |
| 4 | | Find matching backup | Search backups[] for detected platform |
| 5 | | Prompt user | "Restore {platform} config from backup?" |
| 6 | Confirm | | User clicks "Restore" |
| 7 | | Execute restore | Backup current -> Clean -> Copy from backup -> Update state |
| 8 | | Apply extension updates | Run merge-on-restore (UC-05) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | No backup exists for detected platform | Offer fresh swap from conversions/ instead |
| AF-02 | User declines restore | Keep current config active, show mismatch warning in status bar |
| AF-03 | autoSwap enabled in .agent-config.json | Skip prompt, auto-restore |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Backup corrupted (missing files) | Fall back to fresh swap from conversions/, warn user |
| EF-02 | Restore fails mid-operation | Re-restore from the backup-of-current (created in step 7) |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-15 | Restore uses backup files (preserves customizations) | BRD Story 4 |
| BR-16 | After restore, backup is NOT deleted (kept for safety) | BRD Story 4 |
| BR-17 | If no backup, fall back to fresh swap from conversions/ | BRD Story 4 |
| BR-18 | User can decline restore; mismatch shown in status bar | BRD Story 4 |

---

### 3.5 Feature: Extension Updates Merged on Restore

**Source:** BRD Story 5

#### 3.5.1 Description

After restoring a backup, check if extension bundles newer agent file versions. If so, merge updates on top of restored files using checksum-based modification detection. User-modified files are preserved.

#### 3.5.2 Use Case

**Use Case ID:** UC-05
**Actor:** System (triggered after restore)
**Preconditions:** Backup restored, extension has bundled manifest
**Postconditions:** Restored files augmented with new extension updates where safe

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Load bundled manifest | Read resources/.sdlc-checksums.json |
| 2 | | Load workspace manifest | Read .kiro/.sdlc-manifest.json from restored backup |
| 3 | | Compare versions | Identify files where bundled version > workspace version |
| 4 | | Detect user modifications | Compare actual file hash vs manifest hash |
| 5 | | Apply updates | Copy new version for unmodified files, skip modified |
| 6 | | Add new files | Files in bundled that don't exist in workspace |
| 7 | | Update workspace manifest | Record new versions and hashes |
| 8 | | Report summary | "Restored: N, Updated: M, Preserved: K user-modified" |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | No bundled manifest exists | Skip merge, restore only |
| AF-02 | All files already at latest version | Skip merge, report "All current" |

#### 3.5.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-19 | User-modified files (hash differs from manifest) are NEVER overwritten | BRD Story 5 |
| BR-20 | New files not in backup are always added | BRD Story 5 |
| BR-21 | Uses existing checksum.ts mechanism for modification detection | BRD Story 5 |
| BR-22 | Merge summary shown to user after completion | BRD Story 5 |


---

### 3.6 Feature: Config State File (.agent-config.json)

**Source:** BRD Story 6

#### 3.6.1 Description

A JSON state file at project root tracks the current platform, backup history, swap timestamps, and user overrides. Human-readable and git-committable.

#### 3.6.2 Use Case

**Use Case ID:** UC-06
**Actor:** System (read/write during all swap operations)
**Preconditions:** Workspace root accessible
**Postconditions:** State file reflects current swap state accurately

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Check file existence | Look for .agent-config.json at root |
| 2 | | Parse or initialize | If exists, parse JSON; if not, create with defaults |
| 3 | | Read state | Return typed AgentConfig object |
| 4 | | Update on swap | Write new activePlatform, lastSwapAt, backups[] |
| 5 | | Atomic write | Write to temp file, then rename (prevents corruption) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | File corrupted (invalid JSON) | Recreate with detected state, log warning |
| EF-02 | File locked by another process | Retry 3x with 200ms delay, then error |

#### 3.6.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-23 | File initialized on first activation if not exists | BRD Story 6 |
| BR-24 | activePlatform defaults to "kiro" on initialization | BRD Story 6 |
| BR-25 | File writes are atomic (temp + rename) to prevent corruption | BRD Story 6 |
| BR-26 | No sensitive data (keys, tokens) stored in this file | BRD Story 6 |
| BR-27 | File should be committed to git (team-shared state) | BRD Story 6 |

#### 3.6.4 Data Specifications

**AgentConfigState Schema:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| activePlatform | string | Yes | enum: kiro, claude-code, github-copilot, antigravity | Currently active platform |
| lastSwapAt | string (ISO 8601) | No | Valid ISO date | Timestamp of last swap |
| autoSwap | boolean | No | - | Auto-swap on IDE detection |
| platformOverride | string or null | No | Same enum as activePlatform | Manual override |
| backups | BackupRecord[] | No | Max 5 per platform | Backup history |

**BackupRecord Schema:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| platform | string | Yes | Platform enum | Platform backed up |
| path | string | Yes | Valid relative path | Path to backup dir |
| createdAt | string (ISO 8601) | Yes | Valid ISO date | Creation timestamp |
| complete | boolean | Yes | - | Backup completion status |
| fileCount | number | No | >= 0 | File count for verification |

---

### 3.7 Feature: Status Bar Platform Indicator

**Source:** BRD Story 7

#### 3.7.1 Description

A status bar item shows the currently active platform. Clicking triggers the swap command. Shows warning when platform mismatch is detected.

#### 3.7.2 Use Case

**Use Case ID:** UC-07
**Actor:** Developer (visual indicator)
**Preconditions:** Extension activated
**Postconditions:** Status bar reflects current platform state

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Read state | Get activePlatform from .agent-config.json |
| 2 | | Detect current platform | Run UC-01 |
| 3 | | Compare | Check if detected == active |
| 4 | | Render status bar | Show platform name with appropriate icon |
| 5 | Clicks status bar | | Triggers kiroSdlc.swapPlatform |
| 6 | | Update after swap | Re-render with new platform |

#### 3.7.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-28 | Matched state shows check icon with platform name | BRD Story 7 |
| BR-29 | Mismatch shows warning icon with both platforms | BRD Story 7 |
| BR-30 | Click always triggers swap command | BRD Story 7 |
| BR-31 | Updates immediately after swap completes | BRD Story 7 |

#### 3.7.4 UI Specifications

| State | Icon | Text | Tooltip |
|-------|------|------|---------|
| Matched (kiro) | $(check) | Kiro | "Agent config: Kiro (matched)" |
| Matched (claude) | $(check) | Claude | "Agent config: Claude Code (matched)" |
| Mismatch | $(warning) | {active} != {detected} | "Platform mismatch! Click to swap" |
| Swap in progress | $(sync~spin) | Swapping... | "Swapping agent config..." |
| Error state | $(error) | Config Error | "Config state corrupted. Click to repair." |


---

### 3.8 Feature: Platform-Specific Directory Handling

**Source:** BRD Story 8

#### 3.8.1 Description

Each platform has a defined set of directories/files. On swap, ALL old platform directories are removed (after backup) and ALL new platform directories are copied from conversions/. Protected files are never touched.

#### 3.8.2 Use Case

**Use Case ID:** UC-08
**Actor:** System (during swap execution)
**Preconditions:** Backup completed, target platform config exists in conversions/
**Postconditions:** Only target platform directories exist, protected files untouched

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Resolve old platform dirs | Get directory list for current platform |
| 2 | | Verify backup exists | Confirm backup of old dirs is complete |
| 3 | | Delete old platform dirs | Remove all old platform directories/files |
| 4 | | Resolve source path | conversions/{targetPlatform}/ |
| 5 | | Copy new platform dirs | Recursive copy from conversions to workspace root |
| 6 | | Verify copy | Check file count matches source |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Source directory has nested structure | Preserve structure exactly during copy |
| AF-02 | Target files already exist (partial previous swap) | Overwrite - backup already captured state |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Directory locked by another process | Retry 3x with 500ms delay, then abort with error |
| EF-02 | Source conversion directory missing | Abort swap, "Platform config not available. Run conversion first." |
| EF-03 | Delete fails on some files | Abort, attempt restore from backup, report locked files |

#### 3.8.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-32 | Protected paths are NEVER modified by swap | BRD Story 8 |
| BR-33 | Only ONE platform's configs active at a time | BRD Story 8 |
| BR-34 | Delete retry: 3 attempts, 500ms between | BRD Story 8 |
| BR-35 | Non-platform files in workspace are never deleted | BRD Story 8 |

#### 3.8.4 Data Specifications

**Protected Paths (NEVER touched):**

| Path | Reason |
|------|--------|
| documents/ | SDLC documents, platform-independent |
| .code-intel/ | Code intelligence data, shared |
| jira.conf | Project config, shared |
| conversions/ | Source of truth for configs |
| .agent-config.json | Swap state tracking |
| .agent-config-backup/ | Backup storage |
| .gitignore | Git config |
| backend/ | Extension source code |
| node_modules/ | Dependencies |
| .git/ | Version control |

---

## 4. Data Model

### 4.1 Logical Entities

#### Entity: AgentConfigState

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| activePlatform | PlatformId | Yes | BR-24 | Currently active config platform |
| lastSwapAt | ISO DateTime | No | - | Last swap timestamp |
| autoSwap | boolean | No | - | Auto-swap on detection |
| platformOverride | PlatformId | No | BR-05 | Override detection result |
| backups | BackupRecord[] | No | BR-07 | Backup history (max 5 per platform) |

#### Entity: BackupRecord

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| platform | PlatformId | Yes | - | Which platform was backed up |
| path | string | Yes | BR-10 | Relative path to backup directory |
| createdAt | ISO DateTime | Yes | - | When backup was created |
| complete | boolean | Yes | BR-09 | Whether backup is fully verified |
| fileCount | number | No | BR-08 | File count for verification |

#### Entity: PlatformConfig

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| id | PlatformId | Yes | Platform identifier |
| displayName | string | Yes | Human-readable name |
| directories | string[] | Yes | Directories managed by this platform |
| conversionPath | string | Yes | Path in conversions/ directory |
| detectionSignals | DetectionSignal[] | Yes | How to identify this platform |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| AgentConfigState | BackupRecord | 1:N | State has many backups |
| BackupRecord | PlatformConfig | N:1 | Each backup belongs to a platform |
| AgentConfigState | PlatformConfig | N:1 | Active platform reference |


---

## 5. Integration Specifications

### 5.1 External System: VS Code Extension API

| Attribute | Value |
|-----------|-------|
| Purpose | IDE detection, command palette, status bar, notifications |
| Direction | Bidirectional |
| Data Format | TypeScript API calls |
| Frequency | Real-time (event-driven) |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| Platform ID | vscode.env.appName | Receive | BR-01 |
| Extension query | vscode.extensions.all | Receive | BR-01 |
| Status bar item | StatusBarItem API | Send | BR-28 |
| Commands | Command registration | Send | BR-11 |
| Notifications | Window messages | Send | BR-14 |

### 5.2 External System: File System (Node.js fs)

| Attribute | Value |
|-----------|-------|
| Purpose | Config directory management, backup operations |
| Direction | Bidirectional |
| Data Format | Files and directories |
| Frequency | On-demand (during swap operations) |

**Data Exchange:**

| Operation | Data | Direction | Business Rule |
|-----------|------|-----------|---------------|
| Copy directories | Platform configs | Read + Write | BR-06 |
| Delete directories | Old platform configs | Write (delete) | BR-32, BR-34 |
| Read/Write JSON | .agent-config.json | Bidirectional | BR-25 |
| Verify file count | Directory stats | Read | BR-08 |

### 5.3 Internal System: Checksum Module (checksum.ts)

| Attribute | Value |
|-----------|-------|
| Purpose | Detect user modifications for merge-on-restore |
| Direction | Read |
| Data Format | ChecksumManifest, WorkspaceManifest |
| Frequency | On restore (UC-05) |

**Data Exchange:**

| Our Data | Module Data | Direction | Business Rule |
|----------|------------|-----------|---------------|
| File path | computeFileHash() | Call | BR-21 |
| Extension path | loadBundledManifest() | Call | BR-21 |
| Workspace root | getFileStatuses() | Call | BR-19 |

---

## 6. Processing Logic

### 6.1 Swap Execution Process

**Trigger:** User selects platform via command palette OR auto-swap on activation
**Input:** targetPlatform (PlatformId)
**Output:** SwapResult { success, fromPlatform, toPlatform, backupPath }

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate target platform != active | Return early with "already on platform" |
| 2 | Validate conversions/{target}/ exists | Abort with "config not available" |
| 3 | Create backup (UC-02) | If backup fails, abort entire swap |
| 4 | Delete active platform directories | If delete fails, restore from backup |
| 5 | Copy from conversions/{target}/ to workspace | If copy fails, restore from backup |
| 6 | Update .agent-config.json | If update fails, log warning (non-fatal) |
| 7 | Update status bar | If fails, log warning (non-fatal) |
| 8 | Show success notification | Non-fatal |

**State Diagram:**

![Swap State Machine](diagrams/state-swap.png)

### 6.2 Restore Execution Process

**Trigger:** Platform mismatch detected on activation AND backup exists
**Input:** detectedPlatform, backup record
**Output:** RestoreResult { success, restoredPlatform, mergeReport }

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Backup current config (before restore) | If fails, abort restore |
| 2 | Delete current platform directories | If fails, attempt recovery |
| 3 | Copy from backup path to workspace root | If fails, restore from step 1 backup |
| 4 | Run merge-on-restore (UC-05) | If fails, log warning (restore already done) |
| 5 | Update .agent-config.json | Non-fatal on failure |
| 6 | Update status bar | Non-fatal |

### 6.3 Auto-Detection on Activation

**Trigger:** Extension activates
**Schedule:** Once per activation

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Read .agent-config.json | If missing/corrupt, initialize with defaults |
| 2 | Check platformOverride | If set, use override, skip detection |
| 3 | Run platform detection (UC-01) | If fails, default to "kiro" |
| 4 | Compare detected vs active | If match, done |
| 5 | Check for backup of detected platform | If exists, offer restore (UC-04) |
| 6 | If no backup, offer fresh swap | User can accept or decline |
| 7 | If autoSwap enabled, execute automatically | Skip user prompt |

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

Not applicable - this feature operates locally within the extension host with file system access inherited from VS Code.

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| .agent-config.json | Internal | No secrets, safe to commit to git |
| Backup directories | Internal | May contain custom prompts (no secrets) |
| Platform detection signals | Internal | Runtime-only, not persisted |

### 7.3 Security Constraints

| Constraint | Rule | Enforcement |
|-----------|------|-------------|
| No credentials in state file | BR-26 | Code review + validation on write |
| File operations within workspace only | - | All paths resolved relative to workspace root |
| No network calls | - | Feature is fully offline/local |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Swap completes in < 3 seconds | For workspace with ~50 config files |
| Performance | IDE detection < 100ms | Must not delay extension activation |
| Reliability | Zero data loss | Backup always created and verified before modification |
| Reliability | Atomic swap | Either fully completes or fully rolls back |
| Usability | Single command swap | One command palette action + one QuickPick selection |
| Compatibility | Cross-platform | Works on Windows, macOS, Linux |
| Scalability | 100+ config files | No O(n^2) operations; streaming copy |
| Observability | All operations logged | "Kiro MCP Server" output channel |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Disk full during backup | Critical | "Insufficient disk space. Need {X}MB, have {Y}MB." | Swap aborted, no changes |
| Permission denied | Critical | "Cannot access {file}. Check permissions." | Swap aborted |
| Conversion dir missing | Warning | "Platform config not available. Run conversion first." | Swap aborted |
| State file corrupted | Warning | "Config state reset. Detected current platform: {x}" | Auto-repair |
| Backup verification failed | Warning | "Backup incomplete. Swap aborted for safety." | Swap aborted |
| Directory locked | Warning | "Cannot delete {dir} - in use by another process." | Retry 3x then abort |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Swap success | Developer | VS Code toast | Immediate |
| Swap failure | Developer | VS Code error dialog | Immediate |
| Platform mismatch | Developer | Status bar warning | On activation |
| Backup pruned | Developer | Output channel (debug) | After swap |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Detect Kiro IDE | appName="Kiro" | platform="kiro" | High |
| TC-02 | Detect Claude Code | Claude extension active | platform="claude-code" | High |
| TC-03 | Detect GitHub Copilot | Copilot extension active | platform="github-copilot" | High |
| TC-04 | Priority resolution | Multiple signals | Highest priority wins | High |
| TC-05 | Swap kiro to claude | target="claude-code" | .kiro/ removed, .claude/ created | High |
| TC-06 | Backup created | Before any swap | Backup dir exists with matching files | High |
| TC-07 | Backup retention | 6th backup created | Oldest pruned, 5 remain | Medium |
| TC-08 | Restore from backup | Return to kiro IDE | .kiro/ restored from backup | High |
| TC-09 | Merge on restore | Backup v1.0, bundled v1.1 | New files added, modified preserved | Medium |
| TC-10 | Protected files | Swap any direction | documents/, .code-intel/ untouched | High |
| TC-11 | State file init | First activation, no file | .agent-config.json created | High |
| TC-12 | State file corrupted | Invalid JSON | File recreated with defaults | Medium |
| TC-13 | Concurrent swap lock | Two swap requests | Second blocked until first completes | Medium |

---

## 11. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Swap Sequence | [sequence-swap.png](diagrams/sequence-swap.png) | [sequence-swap.drawio](diagrams/sequence-swap.drawio) |
| 3 | Swap State Machine | [state-swap.png](diagrams/state-swap.png) | [state-swap.drawio](diagrams/state-swap.drawio) |

### Change Log from BRD

- Consolidated Stories 1-8 into 8 Use Cases (UC-01 through UC-08)
- Added explicit error handling flows not in BRD
- Added protected paths list (expanded from BRD Story 8)
- Added state file atomic write requirement (not in BRD)
- Added concurrent swap lock requirement (derived from risk analysis)
