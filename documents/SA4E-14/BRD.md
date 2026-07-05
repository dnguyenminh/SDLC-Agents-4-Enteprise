# Business Requirements Document (BRD)

## SDLC Agents 4 Enterprise — SA4E-14: Convert Kiro Pipeline to Multi-Platform (IDE-Aware Agent Config Swap)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-14 |
| Title | Convert Kiro Pipeline to Multi-Platform — IDE-Aware Agent Config Swap |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-14 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-14.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | SM Agent – Scrum Master | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-14 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-14 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

This ticket covers **Part 2** of the multi-platform conversion effort: an **IDE-aware agent config swap** extension feature.

The SDLC Agents pipeline has already been converted from Kiro-native format (.kiro/agents, .kiro/steering, .kiro/hooks) to three additional platforms: **Claude Code**, **GitHub Copilot**, and **Antigravity (Gemini)**. Converted configs reside in conversions/{platform}/.

Part 2 builds an extension feature that:
1. **Detects which IDE the user is currently working in** (Kiro, VS Code + Claude Code, VS Code + Copilot, or Antigravity-compatible editor)
2. **Backs up** the current agent config (.kiro/ or platform-specific directories)
3. **Swaps** the active config to match the detected (or manually selected) platform
4. **Restores on return** — when the user returns to a previous IDE, restores backup and applies any extension updates on top

### 1.2 Out of Scope

- The actual conversion of agent prompts (Part 1 — already DONE, 27 agent files + steering + hooks + GAPS.md)
- Runtime execution differences between platforms (each platform's AI engine handles execution independently)
- Cloud-sync of configs across machines
- Automatic conflict resolution when multiple IDEs are open simultaneously on the same workspace
- CI/CD integration for config validation

### 1.3 Preliminary Requirement

- Part 1 conversion completed: conversions/claude-code/, conversions/github-copilot/, conversions/antigravity/ directories populated
- VS Code Extension (ackend/extension/) installed and activated
- Workspace has at least one set of agent configs (.kiro/ or platform equivalent)
- Node.js >= 18.14 runtime

---

## 2. Business Requirements

### 2.1 High Level Process Map

The IDE-aware agent config swap operates as a **workspace config lifecycle manager**:

1. On extension activation, detect current IDE/platform
2. Compare detected platform with currently active config
3. If mismatch detected → prompt user to swap (or auto-swap if configured)
4. Backup current config → copy matching platform config → activate
5. On return to previous IDE → restore backup → merge extension updates

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source Ticket |
|---|------------------|----------|---------------|
| 1 | As a developer, I want the extension to detect which IDE I'm using so that agent configs are automatically matched to my current platform | MUST HAVE | SA4E-14 |
| 2 | As a developer, I want a backup created before any config swap so that I never lose my customizations | MUST HAVE | SA4E-14 |
| 3 | As a developer, I want to manually trigger a platform swap via command palette so that I can override auto-detection | MUST HAVE | SA4E-14 |
| 4 | As a developer, I want my configs restored when I return to a previous IDE so that I don't have to manually reconfigure | MUST HAVE | SA4E-14 |
| 5 | As a developer, I want extension updates merged on top of restored backups so that I get latest improvements without losing my settings | SHOULD HAVE | SA4E-14 |
| 6 | As a developer, I want a config state file (.agent-config.json) tracking current platform and backup locations so that swap state is transparent | MUST HAVE | SA4E-14 |
| 7 | As a developer, I want to see which platform config is currently active via status bar so that I always know my current state | SHOULD HAVE | SA4E-14 |
| 8 | As a developer, I want the swap to handle all platform-specific directories correctly so that no stale configs interfere with my AI agent | MUST HAVE | SA4E-14 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** Extension activates in IDE (Kiro, VS Code, Cursor, Windsurf, etc.)

**Step 2:** IDE detection logic identifies current platform based on environment signals (extension host, `vscode.env.appName`, presence of platform-specific extensions)

**Step 3:** Extension reads .agent-config.json at project root to determine currently active platform config

**Step 4:** If detected platform ≠ active platform → trigger swap flow (auto or prompt based on settings)

**Step 5:** Backup active config directories to .agent-config-backup/{platform}-{timestamp}/

**Step 6:** Delete active config directories (.kiro/, .claude/, .github/copilot-instructions.md, etc.)

**Step 7:** Copy matching platform config from conversions/{platform}/ to workspace root

**Step 8:** Update .agent-config.json with new active platform, backup location, timestamp

**Step 9:** When user returns to original IDE, detect platform change → restore from backup → apply extension updates (new agent versions) on top

> **Note:** If .agent-config.json doesn't exist (first run), current config is assumed to be "kiro" platform and .agent-config.json is initialized.

---

#### STORY 1: IDE Detection

> As a developer, I want the extension to detect which IDE I'm using so that agent configs are automatically matched to my current platform.

**Requirement Details:**

1. Extension detects IDE identity on activation using environment signals
2. Supported platforms: Kiro, Claude Code (VS Code + claude extension), GitHub Copilot (VS Code + copilot extension), Antigravity (Gemini-compatible editor)
3. Detection is deterministic — same environment always produces same result
4. Detection runs once on activation (not continuously)
5. Result stored in memory and exposed via API for other extension features

**Detection Signals:**

| Signal | Platform | Method |
|--------|----------|--------|
| `vscode.env.appName` contains "Kiro" | kiro | Direct check |
| Extension claude-dev or nthropic.claude installed and active | claude-code | Extension presence |
| Extension github.copilot installed and active | github-copilot | Extension presence |
| `vscode.env.appName` contains "Cursor" | cursor (maps to claude-code) | Direct check |
| `vscode.env.appName` contains "Windsurf" | windsurf (maps to claude-code) | Direct check |
| Environment variable GEMINI_API_KEY set or Antigravity extension active | antigravity | Env var + extension check |
| None of the above | kiro (default) | Fallback |

**Acceptance Criteria:**

1. Given the user opens the workspace in Kiro IDE, the extension detects platform = "kiro"
2. Given the user opens the workspace in VS Code with Claude extension active, the extension detects platform = "claude-code"
3. Given the user opens the workspace in VS Code with GitHub Copilot active, the extension detects platform = "github-copilot"
4. Given an unknown IDE environment, the extension defaults to "kiro" platform
5. Given detection completes, the result is available within 100ms of activation

**Error Handling:**

- Multiple platform signals detected simultaneously: use priority order (kiro > claude-code > github-copilot > antigravity)
- Extension API unavailable: default to "kiro"

---

#### STORY 2: Backup Before Swap (No Data Loss)

> As a developer, I want a backup created before any config swap so that I never lose my customizations.

**Requirement Details:**

1. Before ANY file deletion or overwrite, a complete backup of current config is created
2. Backup stored at .agent-config-backup/{platform}-{timestamp}/
3. Backup includes ALL platform-specific directories and files
4. Backup is atomic — either fully completes or rolls back
5. Multiple backups are retained (configurable retention, default: 5 most recent)

**Files Backed Up Per Platform:**

| Platform | Directories/Files |
|----------|-------------------|
| kiro | .kiro/agents/, .kiro/steering/, .kiro/hooks/, .kiro/settings/ |
| claude-code | CLAUDE.md, .claude/ |
| github-copilot | .github/copilot-instructions.md, .github/instructions/, .github/agents/, .github/hooks/ |
| antigravity | AGENTS.md, GEMINI.md, .agents/, skills/ |

**Acceptance Criteria:**

1. Given a swap is triggered, a timestamped backup directory is created BEFORE any file modifications
2. Given backup creation fails (disk full, permissions), the swap is aborted and user notified with clear error
3. Given 6 backups exist and max retention is 5, the oldest backup is pruned after successful swap
4. Given a backup exists, user can manually restore from it via command palette
5. Given an interrupted swap (crash during copy), the backup remains intact for manual recovery

**Validation Rules:**

- Backup directory must not already exist (timestamp ensures uniqueness)
- Backup must be verified (file count matches source) before proceeding with swap
- Backup path must not contain special characters or exceed OS path length limits

**Error Handling:**

- Disk full: Abort swap, report available space vs. required space
- Permission denied: Report which files couldn't be backed up, abort swap
- Partial backup (crash): Leave partial backup in place, mark as "incomplete" in .agent-config.json

---

#### STORY 3: Manual Platform Swap via Command Palette

> As a developer, I want to manually trigger a platform swap via command palette so that I can override auto-detection.

**Requirement Details:**

1. Command registered: kiroSdlc.swapPlatform — available in command palette
2. Shows quick pick with available platforms (filtered to only those with conversions available)
3. Shows current platform highlighted
4. Executes swap flow after user selection
5. Provides progress notification during swap

**UI Specification:**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Platform Picker | QuickPick | Yes | List of available platforms with icons | Current platform marked with ✓ |
| 2 | Confirm Dialog | MessageBox | Conditional | "Swap to {platform}? Current config will be backed up." | Only if auto-confirm disabled |
| 3 | Progress | Notification | Yes | "Swapping agent config to {platform}..." with progress bar | Auto-dismiss on complete |
| 4 | Success Toast | Information | Yes | "✅ Agent config swapped to {platform}" | Shows backup location |

**Acceptance Criteria:**

1. Given user invokes kiroSdlc.swapPlatform, a quick pick shows all platforms with conversions available
2. Given user selects a platform different from current, swap executes with backup
3. Given user selects the currently active platform, a message indicates no change needed
4. Given swap completes successfully, a success notification shows with backup location
5. Given swap fails, an error notification shows with reason and backup is preserved

---

#### STORY 4: Restore on Return

> As a developer, I want my configs restored when I return to a previous IDE so that I don't have to manually reconfigure.

**Requirement Details:**

1. On extension activation, if detected platform matches a previously active platform that was swapped away from, offer to restore
2. Restore copies backup files back to their original locations
3. Restore removes the current platform's config files first (clean swap back)
4. Restore is equivalent to "swap to {previous platform}" but uses backup instead of conversions/ directory
5. User customizations in backup are preserved (unlike fresh swap from conversions/)

**Acceptance Criteria:**

1. Given user was on "kiro", swapped to "claude-code", then reopens in Kiro IDE, extension offers to restore "kiro" backup
2. Given user confirms restore, backup files are copied back and .agent-config.json updated
3. Given user declines restore, current config remains active (no forced swap)
4. Given backup doesn't exist for the detected platform, extension falls back to fresh swap from conversions/
5. Given restore completes, backup is NOT deleted (kept for safety, pruned by retention policy)

**Error Handling:**

- Backup corrupted or missing files: Fall back to fresh swap from conversions/, warn user that customizations were lost
- Restore conflicts with newer extension version: Apply extension updates on top (Story 5)

---

#### STORY 5: Extension Updates Merged on Restore

> As a developer, I want extension updates merged on top of restored backups so that I get latest improvements without losing my settings.

**Requirement Details:**

1. After restoring backup, check if extension has newer bundled agent versions
2. If newer version available, merge new files on top of restored backup
3. Merge strategy: add new files, update unchanged files, preserve user-modified files
4. Uses existing checksum mechanism (checksum.ts) to detect user modifications
5. Reports what was updated vs. preserved

**Acceptance Criteria:**

1. Given backup has agent v1.0 and extension bundles v1.1, new/changed files from v1.1 are applied after restore
2. Given user modified a-agent.md in backup, that file is preserved (not overwritten by v1.1)
3. Given a completely new file exists in v1.1 that wasn't in backup, it is added
4. Given merge completes, a summary shows: "Restored: N files, Updated: M files, Preserved: K user-modified files"

---

#### STORY 6: Config State File (.agent-config.json)

> As a developer, I want a config state file tracking current platform and backup locations so that swap state is transparent.

**Requirement Details:**

1. File location: .agent-config.json at project root
2. Created on first swap or first activation (if not exists)
3. Human-readable JSON format
4. Tracks: active platform, backup history, last swap timestamp, detection overrides
5. Should be committed to git (team-shared state)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| activePlatform | string | Yes | Currently active platform ID | "kiro" |
| lastSwapAt | string (ISO) | No | Timestamp of last swap | "2025-07-14T10:00:00Z" |
| backups | object[] | No | List of backup records | See below |
| backups[].platform | string | Yes | Platform that was backed up | "kiro" |
| backups[].path | string | Yes | Relative path to backup dir | ".agent-config-backup/kiro-20250714T100000" |
| backups[].createdAt | string | Yes | Backup creation timestamp | "2025-07-14T10:00:00Z" |
| backups[].complete | boolean | Yes | Whether backup completed fully | 	rue |
| autoSwap | boolean | No | Auto-swap on IDE detection (default: false) | alse |
| platformOverride | string | No | Manual override (ignores detection) | 
ull |

**Acceptance Criteria:**

1. Given first extension activation in a workspace without .agent-config.json, file is created with ctivePlatform: "kiro"
2. Given a swap occurs, lastSwapAt and ackups[] are updated atomically
3. Given .agent-config.json is corrupted (invalid JSON), extension recreates it with current state detection
4. Given platformOverride is set, detection is skipped and override platform is used
5. Given the file exists, it is readable by other tools/scripts (standard JSON)

---

#### STORY 7: Status Bar Platform Indicator

> As a developer, I want to see which platform config is currently active via status bar so that I always know my current state.

**Requirement Details:**

1. Status bar item shows current platform with icon
2. Clicking status bar triggers kiroSdlc.swapPlatform command
3. Updates in real-time after swap
4. Shows warning icon if detected platform ≠ active platform (mismatch)

**UI Specification:**

| State | Display | Tooltip |
|-------|---------|---------|
| Kiro active, in Kiro | $(check) Kiro | "Agent config: Kiro (matched)" |
| Claude active, in VS Code | $(check) Claude | "Agent config: Claude Code (matched)" |
| Kiro active, in VS Code + Claude | $(warning) Kiro ≠ Claude | "Platform mismatch! Click to swap" |
| Swap in progress | $(sync~spin) Swapping... | "Swapping agent config..." |

**Acceptance Criteria:**

1. Given extension activates with matched platform, status bar shows green check with platform name
2. Given platform mismatch detected, status bar shows warning icon with mismatch description
3. Given user clicks status bar, command palette opens with platform picker
4. Given swap completes, status bar updates immediately to reflect new platform

---

#### STORY 8: Correct Handling of Platform-Specific Directories

> As a developer, I want the swap to handle all platform-specific directories correctly so that no stale configs interfere with my AI agent.

**Requirement Details:**

1. Each platform has a defined set of directories/files (see Story 2 table)
2. On swap: ALL directories for the OLD platform are removed (after backup)
3. On swap: ALL directories for the NEW platform are copied from source
4. No cross-contamination: a workspace should only have ONE platform's configs active at a time
5. Shared files (e.g., documents/, .code-intel/, jira.conf) are NEVER touched by swap

**Protected Files (NEVER swapped or deleted):**

| Path | Reason |
|------|--------|
| documents/ | SDLC documents are platform-independent |
| .code-intel/ | Code intelligence data shared across platforms |
| jira.conf | Project config shared across platforms |
| conversions/ | Source of truth for platform configs |
| .agent-config.json | Swap state tracking |
| .agent-config-backup/ | Backup storage |
| .gitignore | Git config |
| ackend/ | Extension source code |

**Acceptance Criteria:**

1. Given swap from kiro to claude-code: .kiro/ removed, CLAUDE.md + .claude/ copied from conversions/claude-code/
2. Given swap from claude-code to github-copilot: CLAUDE.md + .claude/ removed, .github/copilot-instructions.md + .github/instructions/ + .github/agents/ + .github/hooks/ copied
3. Given swap to any platform, documents/ directory is untouched
4. Given swap to any platform, .code-intel/ directory is untouched
5. Given a file exists in workspace that's not in source conversions directory, it is NOT deleted (only platform-specific paths are managed)

**Error Handling:**

- Directory locked by another process: Retry 3 times with 500ms delay, then abort with error
- Source conversion directory missing: Abort swap, report "Platform config not available. Run conversion first."

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Part 1 Conversion | System | SA4E-14 (Part 1) | Converted config files must exist in conversions/ directory |
| VS Code Extension API | System | N/A | `vscode.env.appName`, `vscode.extensions.all` for IDE detection |
| Existing Injector (injector.ts) | System | SA4E-1 | Checksum and manifest logic reused for merge-on-restore |
| File System Access | Infrastructure | N/A | Read/write/delete workspace directories |
| .kiro/.sdlc-manifest.json | System | N/A | Existing manifest used for version comparison during merge |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Product Owner | SA4E Team Lead | Approve requirements, prioritize | Ticket reporter |
| Developer | Extension Dev | Implement swap feature | Assigned developer |
| QA | QA Agent | Verify swap safety and correctness | Pipeline |
| End Users | All developers using SA4E | Multi-IDE workflow consumers | System |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Swap corrupts user customizations | High | Low | Mandatory backup before any modification; atomic operations |
| IDE detection gives wrong result | Medium | Medium | Allow manual override via command palette; transparent .agent-config.json |
| Multiple IDEs open on same workspace | High | Medium | Lock file prevents concurrent swaps; detect and warn user |
| Backup disk usage grows unbounded | Low | Medium | Retention policy (default 5 backups); auto-prune oldest |
| Platform conversion is incomplete (gaps) | Medium | Low | GAPS.md documents known gaps; user informed during swap |
| File system permissions on Windows/Mac/Linux differ | Medium | Medium | Use Node.js s API with proper error handling; test on all OS |

### 5.2 Assumptions

- Developer uses ONE IDE at a time per workspace (not parallel)
- conversions/ directory is kept up-to-date with latest platform configs (manually or via CI)
- Extension activation happens before any AI agent reads config (config must be swapped before agent starts)
- File system operations (copy/delete) complete within acceptable time (<5s for typical workspace)
- Git is available and .agent-config-backup/ can be gitignored to reduce repo bloat

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Swap completes in < 3 seconds | For typical workspace (~50 config files) |
| Performance | IDE detection < 100ms | Must not slow extension activation |
| Reliability | Zero data loss | Backup ALWAYS created before swap; verified before proceeding |
| Reliability | Atomic swap | Either fully completes or fully rolls back (no partial state) |
| Usability | Single command swap | Ctrl+Shift+P → "Swap Platform" → select → done |
| Security | No sensitive data in .agent-config.json | No API keys, tokens, or credentials stored |
| Compatibility | Works on Windows, macOS, Linux | All file operations use cross-platform Node.js APIs |
| Scalability | Handles workspaces with 100+ config files | No O(n²) operations; streaming copy |
| Observability | Swap operations logged to output channel | "Kiro MCP Server" output channel |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-14 | Convert Kiro Pipeline to Multi-Platform | In Progress | Story | Main ticket |
| SA4E-1 | Backend MCP Server (Core Infrastructure) | Done | Story | Extension foundation |
| SA4E-6 | Sandbox Execution | In Progress | Story | Sibling feature |

---

## 8. Appendix

### Platform Config Directory Mapping

| Platform ID | Config Source | Active Directories (workspace root) |
|-------------|-------------|--------------------------------------|
| kiro | .kiro/ (native) | .kiro/agents/, .kiro/steering/, .kiro/hooks/, .kiro/settings/ |
| claude-code | conversions/claude-code/ | CLAUDE.md, .claude/rules/, .claude/agents/, .claude/hooks.json, .claude/mcp.json |
| github-copilot | conversions/github-copilot/ | .github/copilot-instructions.md, .github/instructions/, .github/agents/, .github/hooks/, AGENTS.md |
| ntigravity | conversions/antigravity/ | AGENTS.md, GEMINI.md, .agents/hooks.json, skills/ |

### .agent-config.json Example

```json
{
  "activePlatform": "claude-code",
  "lastSwapAt": "2025-07-14T10:30:00Z",
  "autoSwap": false,
  "platformOverride": null,
  "backups": [
    {
      "platform": "kiro",
      "path": ".agent-config-backup/kiro-20250714T103000",
      "createdAt": "2025-07-14T10:30:00Z",
      "complete": true
    }
  ]
}
```

### Glossary

| Term | Definition |
|------|------------|
| Platform | An AI agent runtime environment (Kiro, Claude Code, GitHub Copilot, Antigravity) |
| Config Swap | The process of replacing one platform's agent configs with another's |
| Backup | A timestamped copy of platform config directories before swap |
| Restore | Copying a backup back to active position |
| Detection | Identifying which platform the current IDE belongs to |
| Merge-on-Restore | Applying extension updates on top of restored backup files |
| Conversion | The Part 1 process of translating Kiro configs to other platform formats |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Conversion Guide | conversions/CONVERSION-GUIDE.md |
| Conversion Gaps | conversions/GAPS.md |
| SA4E Architecture | .code-intel/SA4E-ARCHITECTURE.md |
| Extension Source | backend/extension/src/ |
| Existing Injector | backend/extension/src/injector.ts |
| Config Definitions | backend/extension/src/config.ts |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
