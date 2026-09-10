# Software Test Plan (STP)

## SDLC-Agents-4-Enterprise — SA4E-197: Add execute_shell tool with pattern-based auto-approve to chat agent

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-197 |
| Title | Add execute_shell tool with pattern-based auto-approve to chat agent |
| Author | DevOps Agent (test-planning documentation) |
| Version | 1.0 |
| Date | 2026-08-30 |
| Status | Draft |
| Related TDD | TDD-v1-SA4E-197.docx |
| Related FSD | FSD-v1-SA4E-197.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-30 | DevOps Agent | Initiate document — derived from TDD §7 Testing Strategy and source test files |

---

## 1. Test Objectives

Verify that the `execute_shell` tool and the pattern-based auto-approve mechanism (CommandPatternMatcher) behave correctly and safely:

- Shell commands can only execute after approval (unless pattern-matched).
- Glob patterns correctly auto-approve matching commands and bypass the gate.
- The approval gate (ToolApprovalGate) blocks, rejects, times out, and supports retry correctly.
- Tool classification correctly separates dangerous (shell/git/write) from safe tools.
- Bug fixes (Resume hang, tool overflow, model name overflow) do not regress.

---

## 2. Test Items (Scope)

| Item | Type | Location | In Scope |
|------|------|----------|----------|
| `CommandPatternMatcher` | New module | `extension/src/chat/engine/CommandPatternMatcher.ts` | Yes (unit) |
| `execute_shell` tool | New tool def | `vscode-tool-definitions.ts`, `vscode-tools.ts` | Yes (integration) |
| Pattern check in `executeSingleTool` | Modified | `chat-graph-nodes.ts` | Yes (integration) |
| `ToolApprovalGate` | Reused (SA4E-85/185) | `ToolApprovalGate.ts` | Yes (regression) |
| `ToolApprovalClassifier` | Reused + extended | `ToolApprovalClassifier.ts` | Yes (regression) |
| `PermissionGuard.svelte` UI | Modified | UI component | Manual only |

---

## 3. Test Levels & Approach

| Level | Focus | Framework | Approach |
|-------|-------|-----------|----------|
| Unit | CommandPatternMatcher (glob→regex, match, suggest, add/remove/clear) | Vitest | White-box, direct class calls |
| Unit | ToolApprovalClassifier classification matrix | Vitest | Direct function calls |
| Integration | executeSingleTool pattern-check + approval gate flow | Vitest + mocks | Mocked McpBridge / StreamHandler |
| E2E-API | TOOL_CALL_RESPONSE contract (web ↔ ext) | Vitest | Mocked postMessage contract |
| Manual | PermissionGuard modal interaction, Resume/overflow fixes | VS Code Extension Host | Exploratory |

### 3.1 Test Suites Executed (43 tests total)

| Suite File | Cases | Covers |
|------------|-------|--------|
| `__tests__/ToolApprovalGate.test.ts` | 28 | Approval gate lifecycle, idempotency, metrics, escalation, retry |
| `__tests__/tool-approval-classifier.test.ts` | 8 | Dangerous/safe classification, git_* heuristic, set accessors |
| `subgraphs/__tests__/executeSingleTool-approval.test.ts` | 7 | Gate integration in executeSingleTool (wait/reject/timeout/safe-bypass/write-family) |

> **Note on SA4E-197 traceability:** The capture suite above is tagged `SA4E-85` (prerequisite PermissionGuard ticket), not `SA4E-197`. The `CommandPatternMatcher` module — the core new code for SA4E-197 — currently has **no dedicated test file** in the repository. Its behavior is only exercised indirectly through the integration wiring. This is a known traceability/documentation gap (see §7).

---

## 4. Entry / Exit Criteria

### 4.1 Entry Criteria

- [x] Source code implemented and present in repo
- [x] `npm install` succeeded in `extension/`
- [x] Vitest configured (`extension/package.json` → `vitest run`)
- [ ] CommandPatternMatcher dedicated unit tests added (RECOMMENDED — currently missing)

### 4.2 Exit Criteria

- [x] All 43 captured tests pass (`vitest run` green)
- [x] No blocking/high defects open
- [ ] CommandPatternMatcher direct coverage added and green (RECOMMENDED before PROD publish)

---

## 5. Test Environment

| Component | Value |
|-----------|-------|
| Runtime | Node.js 20.x, VS Code ^1.85.0 |
| Test runner | Vitest 4.x |
| OS | win32 (CI also cross-platform) |
| Build | `npm run esbuild` / `esbuild-production` |
| Command | `cd extension && npm test` (runs `vitest run`) |

---

## 6. Traceability Matrix (BRD → Test)

| BRD Story | Requirement | Test Coverage | Status |
|-----------|-------------|---------------|--------|
| Story 1 — Execute shell | Approval before exec | executeSingleTool-approval (wait/reject/timeout) | ✅ Indirect |
| Story 2 — Pattern auto-approve | Pattern match bypasses gate | CommandPatternMatcher (NO dedicated test) | ⚠️ Gap |
| Story 3 — Resume hang fix | workingStatus reset | Manual / regression | ⚠️ Not auto-tested |
| Story 4 — Tool overflow fix | CSS contain fix | Manual / regression | ⚠️ Not auto-tested |
| Story 5 — Model name overflow | ellipsis CSS | Manual / regression | ⚠️ Not auto-tested |

---

## 7. Risks & Known Limitations

| Risk | Impact | Mitigation |
|------|--------|------------|
| CommandPatternMatcher untested directly | Medium | Add `CommandPatternMatcher.test.ts` (globToRegex, matches, suggestPattern) |
| Tests tagged SA4E-85 not SA4E-197 | Low (traceability) | Re-tag or add SA4E-197 suite grouping |
| UI fixes not auto-tested | Low | Manual verification in Extension Host |

---

## 8. Sign-Off

| Name | Role | Signature |
|------|------|-----------|
| | QA Lead | ☐ |
| | Dev Lead | ☐ |
| | DevOps | ☐ |
