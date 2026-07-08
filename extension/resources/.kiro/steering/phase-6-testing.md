# Phase 6: Testing (QA → Test Execution + Quality Review)

## Prerequisites

- Code exists (implementation.status = "done")
- STP/STC exist (test_planning.status = "done")
- Jira ticket ở IN REVIEW hoặc QA TEST

## Workflow

### Step 6a: Transition Jira

```
transition_issue(issue_key: "{TICKET}", transition_name: "Verify")
```
→ IN REVIEW → QA TEST

Update STATUS: `testing.status = "in_progress"`

### Step 6b: Two-Axis Code Review (MANDATORY — before test execution)

**After DEV pushes code and before QA runs tests, SM MUST run a two-axis code review.**

Both reviews run in PARALLEL (2 independent sub-agent invocations):

#### Axis 1: Standards Review

```
invokeSubAgent(
  name: "dev-agent",
  prompt: "CODE REVIEW — Standards Axis cho {TICKET}.

  Đọc code vừa implement (git diff main..{TICKET}) và review theo .kiro/steering/code-standards.md.

  CHECK LIST:
  1. File size: mỗi file ≤ 200 dòng?
  2. Function size: mỗi hàm ≤ 20 dòng?
  3. SOLID violations? (SRP, OCP, LSP, ISP, DIP)
  4. Fowler code smells:
     - Feature Envy (method uses another class's data more than its own)
     - Duplicated Code (similar logic in multiple places)
     - Long Parameter List (>3 params without grouping)
     - Data Clumps (same group of data appears together repeatedly)
     - Primitive Obsession (using primitives instead of small objects)
     - Divergent Change (one class changed for multiple reasons)
     - Shotgun Surgery (one change requires edits in many classes)
  5. Model/processing separation: DTOs in models/, logic in services/?
  6. Design patterns: Strategy/Factory/Observer used where appropriate?
  7. Exception handling: no swallowed exceptions? User notified on errors?
  8. Serialization: encodeDefaults=true for protocol communication?

  Output format:
  ## Standards Review — {TICKET}
  | # | File | Issue | Severity | Fowler Smell |
  |---|------|-------|----------|--------------|
  | 1 | path | description | High/Med/Low | Feature Envy / None |

  Verdict: PASS / PASS with warnings / FAIL (needs fix)
  ",
  contextFiles: [{ "path": ".kiro/steering/code-standards.md" }]
)
```

#### Axis 2: Spec Compliance Review

```
invokeSubAgent(
  name: "qa-agent",
  prompt: "CODE REVIEW — Spec Compliance Axis cho {TICKET}.

  Đọc TDD.md và FSD.md từ KB (mem_search('{TICKET} TDD') + mem_search('{TICKET} FSD')).
  Đọc code vừa implement (git diff main..{TICKET}).

  CHECK LIST:
  1. Missing features: TDD specs chưa implement?
  2. Scope creep: Code implement thứ KHÔNG có trong TDD/FSD?
  3. API contracts: Endpoints match TDD Section 3 (API Design) exactly?
  4. Data model: Entity fields match FSD data specifications?
  5. Business rules: All FSD BR-XX rules implemented in code?
  6. Error codes: All FSD error codes handled with correct HTTP status?
  7. Integration: External system calls match TDD Section 6?
  8. Security: Auth/authz match TDD security design?

  Output format:
  ## Spec Compliance Review — {TICKET}

  ### Missing from Spec (not implemented)
  | # | TDD/FSD Section | Expected | Status |
  |---|-----------------|----------|--------|

  ### Scope Creep (implemented but not in spec)
  | # | File | Extra Code | Risk |
  |---|------|-----------|------|

  ### Discrepancies
  | # | Spec Says | Code Does | Severity |
  |---|-----------|-----------|----------|

  Verdict: PASS / PASS with warnings / FAIL (needs fix)
  "
)
```

#### Review Outcomes

| Axis 1 | Axis 2 | Action |
|--------|--------|--------|
| PASS | PASS | ✅ Proceed to QA test execution |
| PASS w/warnings | PASS | ⚠️ Log warnings as tech debt, proceed |
| FAIL | * | ❌ Send back to DEV to fix standards violations |
| * | FAIL | ❌ Send back to DEV to fix spec gaps |
| FAIL | FAIL | ❌ Send back to DEV — fix both axes |

**If FAIL on either axis:**
```
invokeSubAgent(
  name: "dev-agent",
  prompt: "Fix code review issues cho {TICKET}:
  Standards issues: {list from Axis 1}
  Spec issues: {list from Axis 2}
  Fix và push lại."
)
```

Re-run code review after fix (max 2 iterations). If still FAIL → escalate to user.

### Step 6c: QA Runs Automated Tests

Invoke QA agent for test execution:
```
invokeSubAgent(
  name: "qa-agent",
  prompt: "Chạy automated tests cho {TICKET}. Run ./gradlew test. Báo cáo pass/fail."
)
```

### Step 6d: SM Reviews Test Code Quality (MANDATORY)

**SM MUST verify test implementation matches STC spec.** Quality gate prevents "all-mock integration tests" from passing as real integration tests.

**Review process:**
1. Read STC.md — identify IT-level test cases and specified techniques
2. Read actual IT test source files (`*IntegrationTest.kt`)
3. Compare: does test code use the technique STC specified?

**Red Flags:**

| Red Flag | Meaning | Action |
|----------|---------|--------|
| IT uses `mockk()` for ALL deps | Not real integration test | ❌ Send back to DEV |
| IT calls service directly (no HTTP) | Missing API layer testing | ❌ Send back to DEV |
| IT has no Testcontainers when STC requires | Missing real DB/infra | ❌ Send back to DEV |
| IT mocks Connection/Transport | Missing real process interaction | ❌ Send back to DEV |
| Config reload only parses YAML | Missing file watcher test | ⚠️ Flag as degraded |

**Acceptable exceptions:**
- External paid APIs (OpenAI, cloud) → mock OK
- DEV documented limitation with TODO → accept as degraded, track tech debt

**If issues found:**
```
invokeSubAgent(
  name: "dev-agent",
  prompt: "Fix IT tests cho {TICKET}. QA phát hiện: {discrepancies}. Phải dùng đúng technique trong STC."
)
```
Re-run tests after fix.

### Step 6e: Finalize

- If tests fail → transition "Fix bugs" → DEV fix → retest (loop)
- If tests pass + quality review OK:
  - Update STATUS: `testing.status = "done"`
  - Report results including quality assessment

### Step 6f: UAT (Phase 6.5)

**After QA pass:**

1. Transition Jira: QA TEST → UAT (transition "Start UAT")
2. Inform user/PO feature ready for UAT:
   - URL environment
   - Test accounts
   - Acceptance criteria (from BRD)
   - Key test scenarios
3. **⛔ STOP — WAIT for user/PO to actually test and confirm**
   - SM CANNOT auto-transition past UAT
   - SM CANNOT assume UAT pass
   - Only when user says "UAT pass" or "accepted" → continue
4. UAT FAIL → "Fix bugs" → IN PROGRESS → DEV fix → re-test → re-UAT
5. UAT PASS → Phase 7 (Deployment)

## Quality Gate — TEST-REPORT

| # | Check | If Missing |
|---|-------|------------|
| 1 | TEST-REPORT.md exists | Re-invoke QA |
| 2 | TEST-REPORT DOCX attached to Jira | Export + attach |

## Agent Data Access

**QA reads:** KB (BRD + FSD + TDD), STP/STC, source code (test files)
**QA writes:** Test results, TEST-REPORT.md
