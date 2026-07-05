# Software Test Plan (STP)

## SDLC Agents 4 Enterprise — SA4E-14: IDE-Aware Agent Config Swap

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-14 |
| Title | IDE-Aware Agent Config Swap — Test Plan |
| Author | QA Agent (SM-generated) |
| Version | 1.0 |
| Date | 2025-07-14 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-14.docx |
| Related FSD | FSD-v1-SA4E-14.docx |
| Related TDD | TDD-v1-SA4E-14.docx |

---

## 1. Test Strategy

### 1.1 Objectives

- Verify all 8 user stories from BRD are fully covered
- Validate SOLID architecture and design pattern implementations
- Ensure cross-platform compatibility (Windows, macOS, Linux)
- Confirm zero data loss during swap operations
- Validate performance targets (detection < 100ms, swap < 3s)

### 1.2 Test Levels

| # | Level | Framework | Purpose | Automation |
|---|-------|-----------|---------|------------|
| 1 | PBT (Property-Based) | fast-check + Mocha | Invariant verification for state management | 100% automated |
| 2 | UT (Unit Tests) | Mocha + sinon | Individual class/function correctness | 100% automated |
| 3 | IT (Integration Tests) | Mocha + real fs (tmp dirs) | Multi-module interactions, file system ops | 100% automated |
| 4 | E2E-API (Command Tests) | Mocha + VS Code test runner | Full command execution paths | 100% automated |
| 5 | E2E-UI (Extension Tests) | VS Code Extension Test | Status bar, QuickPick, notifications | 90% automated |
| 6 | SIT (System Integration) | Manual + checklists | Cross-platform, real IDE environments | Manual |

### 1.3 Test Scope

**In Scope:**
- PlatformDetector — all detection signals and priority logic
- BackupManager — create, verify, restore, prune operations
- SwapExecutor — full swap flow, rollback, merge-on-restore
- StateManager — atomic read/write, corruption recovery
- PlatformStatusBar — rendering, click handlers, state updates
- SwapCommands — command registration, QuickPick flow
- Integration with existing checksum.ts module
- Cross-platform file path handling

**Out of Scope:**
- Actual AI agent runtime behavior after swap
- Network-based config sync
- CI/CD pipeline integration testing
- Performance benchmarking beyond functional targets

### 1.4 Entry/Exit Criteria

**Entry Criteria:**
- All 9 source files implemented per TDD
- Code compiles without TypeScript errors
- VS Code extension builds with esbuild

**Exit Criteria:**
- All Critical/High test cases PASS
- Code coverage >= 80% on business logic
- No Critical/High defects open
- Cross-platform test results reviewed

---

## 2. Test Environment

### 2.1 Software

| Component | Version | Purpose |
|-----------|---------|---------|
| Node.js | >= 18.14 | Runtime |
| TypeScript | 5.x | Language |
| Mocha | latest | Test framework (extension convention) |
| sinon | latest | Mocking/stubbing |
| fast-check | latest | Property-based testing |
| VS Code | 1.85+ | Extension host |
| OS: Windows | 11 | Cross-platform validation |
| OS: macOS | 14+ | Cross-platform validation |
| OS: Linux | Ubuntu 22.04 | Cross-platform validation |

### 2.2 Test Data

- CSV test data files in `documents/SA4E-14/testdata/`
- Fixture directories simulating platform configs (created per test)
- Mock VS Code API responses (existing `test/mocks/vscode.ts`)

---

## 3. Requirements Traceability Matrix (RTM)

| Requirement ID | Requirement | Test Cases | Coverage |
|---------------|-------------|------------|----------|
| UC-01 (Story 1) | IDE Platform Detection | UT-DET-01..08, IT-DET-01..03 | 100% |
| UC-02 (Story 2) | Backup Before Swap | UT-BAK-01..10, IT-BAK-01..04 | 100% |
| UC-03 (Story 3) | Manual Platform Swap | UT-SWP-01..12, E2E-CMD-01..05 | 100% |
| UC-04 (Story 4) | Restore on Return | UT-RST-01..06, IT-RST-01..03 | 100% |
| UC-05 (Story 5) | Extension Updates Merged | UT-MRG-01..05, IT-MRG-01..03 | 100% |
| UC-06 (Story 6) | Config State File | UT-STM-01..08, PBT-STM-01..03 | 100% |
| UC-07 (Story 7) | Status Bar Indicator | UT-SBR-01..06, E2E-UI-01..04 | 100% |
| UC-08 (Story 8) | Platform Directory Handling | UT-DIR-01..05, IT-DIR-01..04 | 100% |
| BR-01 | Detection priority order | UT-DET-04, UT-DET-05 | 100% |
| BR-02 | Detection < 100ms | PBT-PERF-01 | 100% |
| BR-06 | Backup before deletion | IT-BAK-01, IT-SWP-01 | 100% |
| BR-07 | Max 5 backup retention | UT-BAK-08, UT-BAK-09 | 100% |
| BR-25 | Atomic state writes | PBT-STM-01, UT-STM-05 | 100% |
| BR-32 | Protected paths never modified | IT-DIR-03, IT-DIR-04 | 100% |
| BR-34 | Delete retry 3x/500ms | UT-DIR-04, IT-DIR-02 | 100% |
| NFR-Performance | Swap < 3s for 50 files | IT-PERF-01 | 100% |
| NFR-Reliability | Zero data loss / atomic | IT-SWP-02, PBT-STM-02 | 100% |

---

## 4. Test Schedule

| Phase | Duration | Activities |
|-------|----------|------------|
| Phase 1 | Day 1 | UT: PlatformDetector, StateManager, PlatformConfig |
| Phase 2 | Day 1-2 | UT: BackupManager, SwapExecutor |
| Phase 3 | Day 2 | IT: File system operations, multi-module flows |
| Phase 4 | Day 3 | E2E: Command tests, status bar tests |
| Phase 5 | Day 3 | PBT: State invariants, performance properties |
| Phase 6 | Day 4 | SIT: Cross-platform manual validation |

---

## 5. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| File system differences across OS | High | Use path.join/resolve everywhere; test on all 3 OS |
| VS Code API mocking incomplete | Medium | Existing mock in test/mocks/vscode.ts covers most; extend as needed |
| Race conditions in async file ops | High | Atomic write pattern (temp + rename); test concurrent scenarios |
| Backup corruption during test | Low | Use tmpdir per test; clean up in afterEach |

---

## 6. Test Summary by Level

| Level | Total Cases | Automated | Manual | Priority Distribution |
|-------|-------------|-----------|--------|----------------------|
| PBT | 6 | 6 | 0 | 6 Critical |
| UT | 60 | 60 | 0 | 30 Critical, 20 High, 10 Medium |
| IT | 17 | 17 | 0 | 10 Critical, 7 High |
| E2E-API (Commands) | 10 | 10 | 0 | 5 Critical, 5 High |
| E2E-UI | 8 | 6 | 2 | 4 High, 4 Medium |
| SIT | 6 | 0 | 6 | 3 High, 3 Medium |
| **Total** | **107** | **99** | **8** | |

---

## 7. Defect Management

| Severity | Response Time | Resolution Target |
|----------|--------------|-------------------|
| Critical | Immediate | Same day |
| High | 4 hours | 1 day |
| Medium | 1 day | 3 days |
| Low | Best effort | Next sprint |
