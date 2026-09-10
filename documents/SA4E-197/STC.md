# Software Test Cases (STC)

## SDLC-Agents-4-Enterprise — SA4E-197: Add execute_shell tool with pattern-based auto-approve to chat agent

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-197 |
| Title | Add execute_shell tool with pattern-based auto-approve to chat agent |
| Author | DevOps Agent (test-case documentation) |
| Version | 1.0 |
| Date | 2026-08-30 |
| Status | Draft |
| Related STP | STP-v1-SA4E-197.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-30 | DevOps Agent | Initiate document — one test case per `it()` in captured suites |

---

## Suite A — ToolApprovalGate (`__tests__/ToolApprovalGate.test.ts`, 28 cases)

### A.1 Core Lifecycle

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-TG-01 | Blocks until user approves | `requestApproval('tc-1')`; resolve approve | decision=approve, pending cleared | Positive |
| TC-TG-02 | Blocks until user rejects w/ reason | request; resolve reject | decision=reject, reason=user_reject | Positive |
| TC-TG-03 | Auto-rejects on timeout | advance timers >30s | decision=reject, reason=timeout | Negative |
| TC-TG-04 | No-op on unknown toolCallId | resolve nonexistent | pendingCount=0 | Edge |
| TC-TG-05 | Multiple concurrent independent | request a,b; resolve b reject, a approve | r1=approve, r2=reject | Positive |
| TC-TG-06 | Reject all on dispose | request x,y; dispose | both reject reason=dispose | Negative |
| TC-TG-07 | Custom timeout value | gate(100ms); advance 101ms | reject reason=timeout | Positive |

### A.2 Idempotency Guard

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-TG-08 | Same promise for duplicate request | request dup twice | p1===p2, pendingCount=1 | Positive |
| TC-TG-09 | No double count on duplicate | request 3x | totalRequested=1 | Positive |

### A.3 Durable State Callback

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-TG-10 | onStateChange on request | request s1 | stateChanges len=1 | Positive |
| TC-TG-11 | onStateChange on resolve | request+resolve s2 | len=2, empty after | Positive |
| TC-TG-12 | onStateChange on timeout | request s3; advance | len=2 | Positive |
| TC-TG-13 | onStateChange on dispose | request s4; dispose | len=2 | Positive |

### A.4 Metrics

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-TG-14 | Zero metrics initially | getMetrics | all zero | Positive |
| TC-TG-15 | Track approved + timing | request; +500ms; approve | totalApproved=1, avg=500 | Positive |
| TC-TG-16 | Track rejected from timeout | request; timeout | totalRejected=1 | Positive |
| TC-TG-17 | avgResponseMs correct | approve @100 & @300 | avg=200 | Positive |

### A.5 Backward Compatibility

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-TG-18 | Constructor accepts number | `new ToolApprovalGate(5000)` | pendingCount=0 | Positive |
| TC-TG-19 | Constructor accepts options | `{timeoutMs:5000}` | pendingCount=0 | Positive |
| TC-TG-20 | Default 120s timeout | no args; advance 120001 | auto-rejected | Positive |

### A.6 2-Phase Escalation

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-TG-21 | onEscalation at warningMs | request; advance 7001 (warn 7000) | 1 escalation, remaining 3000 | Positive |
| TC-TG-22 | No escalation if resolved early | resolve @3000 | escalations=0 | Positive |
| TC-TG-23 | Hard reject after escalation | advance 10001 | reject reason=timeout | Negative |
| TC-TG-24 | Default warningMs=70% | timeout 20000 | escalation @14000, remaining 6000 | Positive |

### A.7 Retry Mechanism

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-TG-25 | Retry after timeout rejection | timeout; retry; approve | approve | Positive |
| TC-TG-26 | Null after max retries (3) | 3 timeouts + 4th retry | null | Negative |
| TC-TG-27 | Reset timers on retry | timeout; retry; +4000 still pending; +1001 reject | reject timeout | Positive |
| TC-TG-28 | Null retry for unknown id | retry unknown | null | Edge |

---

## Suite B — ToolApprovalClassifier (`__tests__/tool-approval-classifier.test.ts`, 8 cases)

### B.1 Classification Matrix (UT-TAC-01)

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-TAC-01 | Dangerous tools require approval | write_file, shell_execute, git_push, … | requiresApproval=true | Positive |
| TC-TAC-02 | Safe tools auto-approve | read_file, grep_search, … | requiresApproval=false | Positive |
| TC-TAC-03 | Any git_* dangerous via heuristic | git_status, git_log, git_something_unknown | true | Positive |
| TC-TAC-04 | Unknown non-git defaults safe | mcp_custom_tool, totally_unknown | false | Positive |
| TC-TAC-05 | Empty & case-sensitive names | '', 'Write_File', 'WRITE_FILE' | false | Edge |

### B.2 Set Accessors (UT-TAC-02)

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-TAC-06 | Dangerous set members | getDangerousTools() | has write_file/fs_write/shell_execute/git_push; size≥12 | Positive |
| TC-TAC-07 | Safe set members | getSafeTools() | has read_file/grep_search; size≥6 | Positive |
| TC-TAC-08 | Sets disjoint | for safe tool in dangerous | false | Positive |

---

## Suite C — executeSingleTool Approval (`subgraphs/__tests__/executeSingleTool-approval.test.ts`, 7 cases)

| TC ID | Title | Steps | Expected | Type |
|-------|-------|-------|----------|------|
| TC-EST-01 | WAIT before dangerous exec | shell_execute; approve | callTool called after approve | Positive |
| TC-EST-02 | Denial message on reject | git_push; reject | "Tool execution denied by user." | Negative |
| TC-EST-03 | Auto-reject on timeout | delete_file; advance 30s | "Auto-rejected. Retry available." | Negative |
| TC-EST-04 | Safe tools bypass gate | grep_search | resolves immediately, pendingCount=0 | Positive |
| TC-EST-05 | WAIT for fs_write | fs_write; approve | executed after approve | Positive (SA4E-185) |
| TC-EST-06 | WAIT for str_replace | str_replace; approve | executed after approve | Positive (SA4E-185) |
| TC-EST-07 | WAIT for fs_append | fs_append; approve | executed after approve | Positive (SA4E-185) |

---

## Coverage Summary

| Suite | Cases | Result |
|-------|-------|--------|
| A — ToolApprovalGate | 28 | ✅ Pass |
| B — ToolApprovalClassifier | 8 | ✅ Pass |
| C — executeSingleTool Approval | 7 | ✅ Pass |
| **Total** | **43** | **✅ 43/43 Pass** |

> ⚠️ SA4E-197-specific `CommandPatternMatcher` (the pattern auto-approve module) has no dedicated test case in this suite. Recommend adding Suite D (`CommandPatternMatcher.test.ts`) covering `globToRegex`, `matches`, `suggestPattern`, `add/remove/clear`.
