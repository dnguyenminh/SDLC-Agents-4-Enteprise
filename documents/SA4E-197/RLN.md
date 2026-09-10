# Release Notes (RLN)

## SDLC-Agents-4-Enterprise — SA4E-197: Add execute_shell tool with pattern-based auto-approve to chat agent

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.39.0 |
| Release Date | 2026-08-30 |
| Jira Ticket | SA4E-197 |
| Environment | VS Code Marketplace (extension publish) |
| Author | DevOps Agent |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-30 | DevOps Agent | Initiate document |

---

## 1. What's New

### 1.1 Feature Summary

The chat agent can now execute terminal commands on your behalf via a new `execute_shell` tool, with a pattern-based auto-approve mechanism so you can whitelist command families (e.g. `npm *`) and stop approving each one individually. Also ships three UI/UX bug fixes.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | execute_shell tool | Run build/test/git commands from chat | High |
| 2 | Pattern auto-approve | "Allow all {pattern} this session" button | High |
| 3 | Resume button fix | No longer hangs | Medium |
| 4 | Tool section overflow fix | Full-width display | Low |
| 5 | Model name overflow fix | Truncated with tooltip | Low |

### 1.3 Screenshots

See FSD diagrams: [sequence-execute-shell.png](diagrams/sequence-execute-shell.png), [state-tool-approval.png](diagrams/state-tool-approval.png).

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| New | `execute_shell` tool | LLM tool call | Runs `child_process.exec` with cwd/timeout |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| None | — | No database changes (extension-only) |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| `CommandPatternMatcher` instance | New | Injected through LangGraph pipeline (session-scoped) |
| `execute_shell` in tool defs | New | Added to `VSCODE_TOOL_DEFINITIONS` |
| `execute_shell` in `DANGEROUS_TOOLS` | New | Classified high-risk |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Extension bundle | Modified | New tool + matcher wired into pipeline |

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|------------|---------|----------|
| 1 | SA4E-197 | Resume button hangs indefinitely | Major |
| 2 | SA4E-197 | Tool section overflow/collapse | Minor |
| 3 | SA4E-197 | Model name overflow in UI | Minor |

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | Patterns not persisted across sessions | Must re-approve after reload | By design (security) | — |
| 2 | Command output truncated at 50 KB | Long logs cut | Run manually | — |

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SA4E-85 PermissionGuard UI | Done | Deployed | This release |
| SA4E-185 Tool execution pipeline | Done | Deployed | This release |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| VS Code Marketplace | Publish new VSIX | Pending | Publisher |

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| None | No data migration | n/a | 0 |

### 6.2 Breaking Changes

No breaking changes in this release. Fully backward compatible.

### 6.3 Backward Compatibility

Fully compatible — adds a new tool and extends classification; no existing behavior removed.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit (ToolApprovalGate) | 28 | 28 | 0 | 0 | 100% |
| Unit (ToolApprovalClassifier) | 8 | 8 | 0 | 0 | 100% |
| Integration (executeSingleTool) | 7 | 7 | 0 | 0 | 100% |
| **Total** | **43** | **43** | **0** | **0** | **100%** |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 0 | 0 | 0 | 0 |
| Minor | 0 | 0 | 0 | 0 |

> Note: `CommandPatternMatcher` (SA4E-197 core module) lacks a dedicated automated test; covered indirectly. Recommend adding before next release.

---

## 8. Deployment Instructions

See [Deployment Guide](DPG-v1.0-SA4E-197.docx).

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Build extension (`esbuild-production`) | ~1 min |
| 2 | Package VSIX (`vsce package`) | ~1 min |
| 3 | Publish / install | ~2 min |
| 4 | Verification (reload + smoke) | ~3 min |
| **Total** | | **~7 min** |

---

## 9. Rollback Plan

Reference DPG §8. Rollback = publish/install previous VSIX version (1.38.x). Estimated rollback time ~5 min.

---

## 10. Contacts

| Role | Name | Contact |
|------|------|---------|
| Release Manager | Extension Team | — |
| DevOps | DevOps Agent | — |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ |
| QA Lead | | | ☐ |
| Business Owner | | | ☐ |
