# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-14: IDE-Aware Agent Config Swap

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-14 |
| Title | IDE-Aware Agent Config Swap — Test Cases |
| Author | QA Agent (SM-generated) |
| Version | 1.0 |
| Date | 2025-07-14 |
| Status | Draft |
| Related STP | STP-v1-SA4E-14.docx |

---

## 1. Property-Based Tests (PBT)

### PBT-STM-01: State roundtrip invariant

| Attribute | Value |
|-----------|-------|
| Level | PBT |
| Priority | Critical |
| Requirement | BR-25, UC-06 |
| Technique | fast-check arbitrary for AgentConfigState |

**Property:** For any valid AgentConfigState, write(state) then read() returns an equivalent state.

**Generator:** Arbitrary AgentConfigState with random platformId, ISO dates, 0-5 backup records.

**Assertions:**
- read() after write() yields deep-equal state
- File content is valid JSON
- No data loss between write/read cycles

---

### PBT-STM-02: Concurrent writes produce valid state

| Attribute | Value |
|-----------|-------|
| Level | PBT |
| Priority | Critical |
| Requirement | BR-25, NFR-Reliability |

**Property:** Multiple concurrent write operations always produce a valid JSON file (never corrupt).

**Generator:** Array of 2-10 random state updates fired concurrently.

**Assertions:**
- File is always valid JSON after all writes complete
- Final state matches one of the written states (last-writer-wins)

---

### PBT-STM-03: Backup list never exceeds maxRetention

| Attribute | Value |
|-----------|-------|
| Level | PBT |
| Priority | Critical |
| Requirement | BR-07 |

**Property:** After any sequence of addBackupRecord calls, backups.length <= maxRetention.

**Generator:** Sequence of 1-20 addBackupRecord operations with random platforms.

**Assertions:**
- backups.length <= 5 (default maxRetention)
- Oldest backups pruned first (FIFO per platform)

---

### PBT-PERF-01: Detection completes within budget

| Attribute | Value |
|-----------|-------|
| Level | PBT |
| Priority | Critical |
| Requirement | BR-02 |

**Property:** For any combination of environment signals, detect() completes in < 100ms.

**Generator:** Random combination of appName, extensions list, env vars.

**Assertions:**
- Duration < 100ms for every generated input
- Result is always a valid PlatformId

---

### PBT-DET-01: Detection is deterministic

| Attribute | Value |
|-----------|-------|
| Level | PBT |
| Priority | Critical |
| Requirement | BR-03 |

**Property:** Same inputs always produce same output.

**Generator:** Random but fixed environment state.

**Assertions:**
- detect() called N times with same env => same result every time

---

### PBT-BAK-01: Backup file count matches source

| Attribute | Value |
|-----------|-------|
| Level | PBT |
| Priority | Critical |
| Requirement | BR-08 |

**Property:** After createBackup, the backup directory has same file count as source directories.

**Generator:** Random directory tree (1-50 files, 1-5 depth) in tmp.

**Assertions:**
- backup.fileCount === countFiles(sourceDirectories)
- All files exist in backup with same relative paths

---

## 2. Unit Tests (UT)

### 2.1 PlatformDetector

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| UT-DET-01 | Detect Kiro IDE via appName | Critical | Stub vscode.env.appName = "Kiro"; call detect() | platform = "kiro", signals includes "appName:Kiro" |
| UT-DET-02 | Detect Claude Code via extension | Critical | Stub extensions.all to include "anthropic.claude"; call detect() | platform = "claude-code" |
| UT-DET-03 | Detect GitHub Copilot via extension | Critical | Stub extensions.all to include "github.copilot"; call detect() | platform = "github-copilot" |
| UT-DET-04 | Priority: Kiro wins over Claude | Critical | Stub appName="Kiro" AND extension "anthropic.claude" present | platform = "kiro" (priority) |
| UT-DET-05 | Priority: Claude wins over Copilot | Critical | Stub extension "anthropic.claude" AND "github.copilot" present | platform = "claude-code" |
| UT-DET-06 | Cursor maps to claude-code | High | Stub vscode.env.appName = "Cursor" | platform = "claude-code" |
| UT-DET-07 | Windsurf maps to claude-code | High | Stub vscode.env.appName = "Windsurf" | platform = "claude-code" |
| UT-DET-08 | Unknown IDE defaults to kiro | Critical | Stub empty appName, no platform extensions | platform = "kiro" |

### 2.2 BackupManager

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| UT-BAK-01 | Create backup — happy path | Critical | Create dirs with files; call createBackup("kiro", dirs) | Backup dir created, fileCount matches |
| UT-BAK-02 | Create backup — empty directory | High | Source dirs exist but empty; call createBackup | Backup created with fileCount = 0 |
| UT-BAK-03 | Create backup — nested dirs preserved | Critical | Source has 3-level nesting; call createBackup | Backup mirrors directory structure exactly |
| UT-BAK-04 | Verify backup — file count matches | Critical | Create backup; call verifyBackup(record) | Returns true |
| UT-BAK-05 | Verify backup — file missing returns false | High | Create backup; delete one file from backup; call verifyBackup | Returns false |
| UT-BAK-06 | Restore from backup | Critical | Create backup; delete source; call restoreFromBackup | Source files restored from backup |
| UT-BAK-07 | Restore — backup dir doesn't exist | High | Call restoreFromBackup with non-existent path | Throws error with clear message |
| UT-BAK-08 | Prune — removes oldest when > max | Critical | Create 6 backups; call pruneOldBackups(platform, 5) | Oldest backup deleted, 5 remain |
| UT-BAK-09 | Prune — no action when <= max | Medium | Create 3 backups; call pruneOldBackups(platform, 5) | All 3 remain, returns 0 |
| UT-BAK-10 | Generate unique backup path | Medium | Call generateBackupPath twice in same second | Different paths (timestamp + suffix) |

### 2.3 SwapExecutor

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| UT-SWP-01 | Execute swap — happy path | Critical | Setup from=kiro dirs, conversions/claude-code; call executeSwap | success=true, kiro dirs gone, claude dirs present |
| UT-SWP-02 | Execute swap — backup created first | Critical | Spy on backupManager.createBackup; call executeSwap | createBackup called before any deletions |
| UT-SWP-03 | Execute swap — old dirs deleted | Critical | Setup kiro dirs; swap to claude-code | .kiro/ directory fully removed |
| UT-SWP-04 | Execute swap — new dirs copied | Critical | Setup conversions/claude-code/; swap to claude-code | CLAUDE.md and .claude/ present at root |
| UT-SWP-05 | Execute swap — state updated | Critical | Call executeSwap; read state | activePlatform = new platform, lastSwapAt updated |
| UT-SWP-06 | Execute swap — same platform rejects | High | Call executeSwap(kiro, kiro) | Returns success=false, message "already on platform" |
| UT-SWP-07 | Execute swap — missing conversions aborts | High | No conversions/{target} dir; call executeSwap | Returns success=false, error "config not available" |
| UT-SWP-08 | Rollback on copy failure | Critical | Stub copyFromConversions to throw; call executeSwap | Backup restored, workspace back to original state |
| UT-SWP-09 | Rollback on delete failure | High | Stub deletePlatformDirs to throw; call executeSwap | Backup preserved, error reported |
| UT-SWP-10 | Execute restore — happy path | Critical | Create backup; call executeRestore | Files restored from backup, state updated |
| UT-SWP-11 | Execute restore — merge applied | High | Create backup with old version; mock newer bundled manifest | New files added, user-modified preserved |
| UT-SWP-12 | Execute restore — no backup falls back | High | No backup for platform; call executeRestore | Uses conversions/ as source instead |

### 2.4 StateManager

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| UT-STM-01 | Read — file exists valid JSON | Critical | Write valid state file; call read() | Returns parsed AgentConfigState |
| UT-STM-02 | Read — file missing creates default | Critical | No .agent-config.json; call read() | Returns default state (activePlatform: "kiro") |
| UT-STM-03 | Read — corrupted JSON recreates | Critical | Write invalid JSON; call read() | Returns default state, logs warning |
| UT-STM-04 | Write — creates valid JSON file | Critical | Call write(state) | File contains exact JSON of state |
| UT-STM-05 | Write — atomic via temp+rename | Critical | Spy on fs.rename; call write() | Write to .tmp first, then renamed |
| UT-STM-06 | updateActivePlatform | High | Call updateActivePlatform("claude-code") | state.activePlatform = "claude-code" |
| UT-STM-07 | addBackupRecord | High | Call addBackupRecord(record) | Record appended to backups[] |
| UT-STM-08 | removeOldestBackup per platform | High | Add 3 kiro + 2 claude; removeOldestBackup("kiro") | Oldest kiro removed, claude untouched |

### 2.5 PlatformStatusBar

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| UT-SBR-01 | Show matched state | High | Call update("kiro", "kiro") | Text = "Kiro", icon = check |
| UT-SBR-02 | Show mismatch state | High | Call update("kiro", "claude-code") | Text shows mismatch, icon = warning |
| UT-SBR-03 | Show swapping state | Medium | Call showSwapping() | Text = "Swapping...", icon = sync~spin |
| UT-SBR-04 | Show error state | Medium | Call showError("message") | Text = "Config Error", icon = error |
| UT-SBR-05 | Click triggers command | High | Read item.command | Equals "kiroSdlc.swapPlatform" |
| UT-SBR-06 | Dispose cleans up | Medium | Call dispose() | item.dispose() called |

### 2.6 PlatformConfig

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| UT-CFG-01 | All 4 platforms defined | Critical | Read PLATFORM_DEFINITIONS | Contains kiro, claude-code, github-copilot, antigravity |
| UT-CFG-02 | Kiro directories correct | High | Read kiro definition | Has .kiro/agents/, .kiro/steering/, .kiro/hooks/, .kiro/settings/ |
| UT-CFG-03 | Claude directories correct | High | Read claude-code definition | Has CLAUDE.md, .claude/ |
| UT-CFG-04 | Copilot directories correct | High | Read github-copilot definition | Has .github/copilot-instructions.md, .github/instructions/, .github/agents/, .github/hooks/ |
| UT-CFG-05 | Antigravity directories correct | High | Read antigravity definition | Has AGENTS.md, GEMINI.md, .agents/, skills/ |

### 2.7 SwapCommands

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| UT-CMD-01 | Commands registered on init | Critical | Call registerCommands; check subscriptions | 3 commands registered |
| UT-CMD-02 | swapPlatform shows QuickPick | High | Execute handler | showQuickPick called with platforms |
| UT-CMD-03 | QuickPick filters available | High | Only conversions/claude-code exists | Items only contain claude-code + current |
| UT-CMD-04 | restoreBackup shows backup list | High | Create 3 backups; execute handler | QuickPick shows 3 items |
| UT-CMD-05 | platformStatus shows info | Medium | Execute handler | showInformationMessage called |

### 2.8 Directory Operations

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| UT-DIR-01 | Delete platform dirs — all removed | Critical | Create .kiro/ tree; deletePlatformDirs("kiro") | .kiro/ fully removed |
| UT-DIR-02 | Delete — non-existent dir no error | Medium | No .kiro/; deletePlatformDirs("kiro") | No error |
| UT-DIR-03 | Copy preserves nested structure | Critical | conversions/claude-code/ has nested dirs; copy | Exact structure at root |
| UT-DIR-04 | Delete retry on EBUSY | High | Stub EBUSY once then succeed | Retries and succeeds |
| UT-DIR-05 | Copy validates source exists | High | No conversions/{platform}/; copy | Throws ConversionMissingError |

### 2.9 Merge-on-Restore

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| UT-MRG-01 | Unmodified files updated | Critical | Hash matches manifest; newer bundled | File overwritten |
| UT-MRG-02 | User-modified files preserved | Critical | Hash differs; newer bundled | File NOT overwritten |
| UT-MRG-03 | New files added | Critical | File in bundled not in workspace | File copied |
| UT-MRG-04 | No manifest skips merge | Medium | No .sdlc-checksums.json | Returns zero counts |
| UT-MRG-05 | Merge report accurate | High | Mix of operations | Counts match actual ops |

---

## 3. Integration Tests (IT)

### 3.1 Detection Integration

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| IT-DET-01 | Full detection with state init | Critical | No state file; initPlatformSwap | State created, detection cached |
| IT-DET-02 | platformOverride bypasses detection | High | State has override; init | Uses override |
| IT-DET-03 | Cache invalidation re-detects | High | detect() then invalidateCache() then detect() | Full detection re-runs |

### 3.2 Backup Integration (real fs)

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| IT-BAK-01 | Full backup lifecycle in tmpdir | Critical | 20-file tree; create, verify, restore | All files identical |
| IT-BAK-02 | Locked file handling | High | Lock file; attempt backup | Fails gracefully |
| IT-BAK-03 | Prune removes disk directories | High | 6 backup dirs; prune(5) | Oldest dir deleted |
| IT-BAK-04 | 100+ file performance | High | 100-file tree; time backup | < 1500ms |

### 3.3 Swap Integration

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| IT-SWP-01 | Full swap kiro to claude-code | Critical | Complete workspace; full swap | Correct dirs replaced, state updated |
| IT-SWP-02 | Rollback on mid-swap failure | Critical | Error injected during copy | Restored to pre-swap |
| IT-SWP-03 | Swap then restore round-trip | Critical | Swap out then restore back | Workspace identical to original |
| IT-SWP-04 | Protected paths untouched | Critical | documents/, .code-intel/ exist; swap | Protected paths unchanged |

### 3.4 Directory Operations

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| IT-DIR-01 | Copy 5-level nested structure | High | Create deep tree; copy | Exact mirror |
| IT-DIR-02 | Delete retry on temporarily locked | High | Brief lock; delete | Succeeds on retry |
| IT-DIR-03 | Protected path rejection | Critical | Attempt delete on documents/ | Rejected |
| IT-DIR-04 | Cross-platform path separators | Critical | path.join verification | Correct on current OS |

### 3.5 Performance

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| IT-PERF-01 | 50-file workspace swap < 3s | High | 50-file conversions; time swap | < 3000ms |

---

## 4. E2E-API (Command) Tests

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| E2E-CMD-01 | swapPlatform full flow | Critical | Register; execute with mocked QuickPick | Swap completes |
| E2E-CMD-02 | swapPlatform cancel | High | QuickPick returns undefined | No swap, no error |
| E2E-CMD-03 | swapPlatform same platform | High | Returns current platform | Info message shown |
| E2E-CMD-04 | restoreBackup selection | Critical | 2 backups; execute; mock select | Restore completes |
| E2E-CMD-05 | restoreBackup no backups | High | No backups; execute | Info "No backups available" |
| E2E-CMD-06 | platformStatus command | Medium | Execute | Info message shown |
| E2E-CMD-07 | autoConfirm skips dialog | High | Set autoConfirm=true; swap | No confirmation |
| E2E-CMD-08 | Error during swap | Critical | Inject error; execute | Error notification + backup info |
| E2E-CMD-09 | Merge report on restore | High | Restore with newer version | Merge summary shown |
| E2E-CMD-10 | Progress notification | Medium | Execute swap; check | Progress displayed |

---

## 5. E2E-UI (Extension) Tests

| ID | Test Case | Priority | Type | Steps | Expected Result |
|----|-----------|----------|------|-------|-----------------|
| E2E-UI-01 | Status bar on activation | High | Auto | Activate; check items | Platform name visible |
| E2E-UI-02 | Mismatch warning shown | High | Auto | Mock mismatch; activate | Warning icon |
| E2E-UI-03 | Status bar click opens picker | High | Auto | Click status bar | QuickPick opens |
| E2E-UI-04 | Status bar updates after swap | High | Auto | Swap; check bar | New platform shown |
| E2E-UI-05 | QuickPick icons correct | Medium | Auto | Open picker | Correct icons |
| E2E-UI-06 | Success toast with path | Medium | Auto | Complete swap | Toast has backup path |
| E2E-UI-07 | Status bar visual alignment | Medium | Manual | Inspect UI | Right-aligned, no overlap |
| E2E-UI-08 | Mismatch warning visibility | Medium | Manual | Trigger mismatch | Warning clearly visible |

---

## 6. System Integration Tests (SIT) — Manual

| ID | Test Case | Priority | Steps | Expected Result |
|----|-----------|----------|-------|-----------------|
| SIT-01 | Full swap in Kiro IDE | High | Open in Kiro; swap to claude-code | Correct swap, no leftover |
| SIT-02 | Full swap in VS Code + Claude | High | VS Code with Claude ext; auto-detect | Detects claude-code |
| SIT-03 | Restore on return to Kiro | High | After SIT-02; reopen in Kiro | Restore offered |
| SIT-04 | Windows path handling | Medium | Full swap on Windows | No path errors |
| SIT-05 | macOS case-sensitivity | Medium | Full swap on macOS | No issues |
| SIT-06 | Linux permissions | Medium | Restricted permissions | Clear error messages |

---

## 7. Test Data Files

See `documents/SA4E-14/testdata/` for CSV data files referenced in test cases.
