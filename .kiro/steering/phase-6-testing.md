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

### Step 6b: QA Runs Automated Tests

Invoke QA agent for test execution:
```
invokeSubAgent(
  name: "qa-agent",
  prompt: "Chạy automated tests cho {TICKET}. Run ./gradlew test. Báo cáo pass/fail."
)
```

### Step 6c: SM Reviews Test Code Quality (MANDATORY)

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

### Step 6d: Finalize

- If tests fail → transition "Fix bugs" → DEV fix → retest (loop)
- If tests pass + quality review OK:
  - Update STATUS: `testing.status = "done"`
  - Report results including quality assessment

### Step 6e: UAT (Phase 6.5)

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
