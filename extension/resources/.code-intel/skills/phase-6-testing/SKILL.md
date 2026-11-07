---
name: phase-6-testing
description: Phase 6 workflow — two-axis + fresh-context code review, automated testing, pentest, UAT
---

## Prerequisites

- Code exists (implementation.status = "done")
- STP/STC exist (test_planning.status = "done")
- Jira ticket in IN REVIEW or QA TEST

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
task(
  description: "Code review — standards axis for {TICKET}",
  prompt: "CODE REVIEW — Standards Axis for {TICKET}.

  Read the implemented code (git diff main..{TICKET}) and review per code standards — load the 'code-standards' skill via the skill tool.

  CHECK LIST:
  1. File size: each file ≤ 200 lines?
  2. Function size: each function ≤ 20 lines?
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
  8. Serialization: validate protocol communication with zod schemas (safeParse)?

  Output format:
  ## Standards Review — {TICKET}
  | # | File | Issue | Severity | Fowler Smell |
  |---|------|-------|----------|--------------|
  | 1 | path | description | High/Med/Low | Feature Envy / None |

  Verdict: PASS / PASS with warnings / FAIL (needs fix)
  ",
  subagent_type: "dev-agent"
)
```

#### Axis 2: Spec Compliance Review

```
task(
  description: "Code review — spec compliance axis for {TICKET}",
  prompt: "CODE REVIEW — Spec Compliance Axis for {TICKET}.

  Read TDD.md and FSD.md from KB (mem_search('{TICKET} TDD') + mem_search('{TICKET} FSD')).
  Read the implemented code (git diff main..{TICKET}).

  CHECK LIST:
  1. Missing features: TDD specs not implemented?
  2. Scope creep: code implements something NOT in TDD/FSD?
  3. API contracts: endpoints match TDD Section 3 (API Design) exactly?
  4. Data model: entity fields match FSD data specifications?
  5. Business rules: all FSD BR-XX rules implemented in code?
  6. Error codes: all FSD error codes handled with correct HTTP status?
  7. Integration: external system calls match TDD Section 6?
  8. Security: auth/authz match TDD security design?

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
  ",
  subagent_type: "qa-agent"
)
```

#### Review Outcomes

| Axis 1 | Axis 2 | Action |
|--------|--------|--------|
| PASS | PASS | Proceed to QA test execution |
| PASS w/warnings | PASS | Log warnings as tech debt, proceed |
| FAIL | * | Send back to DEV to fix standards violations |
| * | FAIL | Send back to DEV to fix spec gaps |
| FAIL | FAIL | Send back to DEV — fix both axes |

**If FAIL on either axis:**
```
task(
  description: "Fix code review issues for {TICKET}",
  prompt: "Fix code review issues for {TICKET}:
  Standards issues: {list from Axis 1}
  Spec issues: {list from Axis 2}
  Fix and push again.",
  subagent_type: "dev-agent"
)
```

Re-run code review after fix (max 2 iterations). If still FAIL → escalate to user.

#### Step 6b.5: Fresh-Context Review (OPTIONAL — High-Risk Changes)

**After standard two-axis review, SM MAY run a fresh-context review for high-risk changes.**

**Trigger criteria** (any one met → run fresh review):
- `git diff --stat` shows >500 lines changed
- Changes touch auth/authorization/encryption code
- DB schema or migration files modified
- >5 files modified (complex refactoring)

**Process:** Load the 'fresh-context-review' skill via the skill tool for full details.

**Summary:**
1. Spawn separate agent with ONLY: git diff + TDD + FSD + code-standards (NO history)
2. Agent performs independent review — no "as discussed" or "as implemented" bias
3. SM compares fresh findings vs standard review findings
4. Blind spots (fresh found, standard missed) → escalate by severity

**This step is OPTIONAL** — it enhances but does not replace the standard review.
If fresh review is unavailable (budget, time), standard review is sufficient to proceed.

### Step 6c: QA Runs Automated Tests

Invoke QA agent for test execution:
```
task(
  description: "Run automated tests for {TICKET}",
  prompt: "Run automated tests for {TICKET}. Run npm test (Vitest) in backend/ and extension/. Report pass/fail.",
  subagent_type: "qa-agent"
)
```

### Step 6d: SM Reviews Test Code Quality (MANDATORY)

**SM MUST verify test implementation matches STC spec.** Quality gate prevents "all-mock integration tests" from passing as real integration tests.

**Review process:**
1. Read STC.md — identify IT-level test cases and specified techniques
2. Read actual IT test source files (`*.test.ts` integration tests)
3. Compare: does test code use the technique STC specified?

**Red Flags:**

| Red Flag | Meaning | Action |
|----------|---------|--------|
| IT uses `mockk()` for ALL deps | Not real integration test | Send back to DEV |
| IT calls service directly (no HTTP) | Missing API layer testing | Send back to DEV |
| IT has no Testcontainers when STC requires | Missing real DB/infra | Send back to DEV |
| IT mocks Connection/Transport | Missing real process interaction | Send back to DEV |
| Config reload only parses YAML | Missing file watcher test | Flag as degraded |

**Acceptable exceptions:**
- External paid APIs (OpenAI, cloud) → mock OK
- DEV documented limitation with TODO → accept as degraded, track tech debt

**If issues found:**
```
task(
  description: "Fix IT tests for {TICKET}",
  prompt: "Fix IT tests for {TICKET}. QA found: {discrepancies}. Must use the correct technique specified in STC.",
  subagent_type: "dev-agent"
)
```
Re-run tests after fix.

### Step 6e: Penetration Testing (Phase 6.3 — MANDATORY)

**After automated tests pass and code quality is verified, Security Agent performs dynamic security testing (pentest) against the running application.**

**Prerequisites:** Application deployed to test environment (localhost or staging), all QA tests pass.

1. Update STATUS: `pentest.status = "in_progress"`

2. Invoke Security agent for pentest:
```
task(
  description: "Penetration testing for {TICKET}",
  prompt: "Penetration Testing for {TICKET}. Application running at {test_url}. Execute:

  PHASE 1 — Reconnaissance:
  1. Enumerate API endpoints (from TDD/FSD + actual discovery)
  2. Identify authentication mechanisms
  3. Map attack surface (public vs authenticated endpoints)

  PHASE 2 — Active Testing:
  4. Authentication attacks: brute force protection, session fixation, token manipulation
  5. Authorization attacks: IDOR, privilege escalation, horizontal access
  6. Injection attacks: SQL injection, command injection, LDAP injection
  7. XSS attacks: reflected, stored, DOM-based (test all input fields)
  8. CSRF verification: token presence, SameSite cookies
  9. API abuse: rate limiting bypass, mass assignment, parameter pollution
  10. Business logic attacks: race conditions, workflow bypass, price manipulation
  11. File upload attacks (if applicable): malicious file types, path traversal
  12. Information disclosure: error messages, debug endpoints, version headers

  PHASE 3 — Infrastructure:
  13. TLS/SSL configuration (cipher suites, protocol versions)
  14. Security headers (HSTS, CSP, X-Frame-Options, etc.)
  15. Cookie security (HttpOnly, Secure, SameSite)
  16. CORS misconfiguration

  TOOLS: Use curl, httpie, or equivalent CLI tools. Run actual HTTP requests.
  DO NOT just review code — EXECUTE real attacks against the running application.

  Output: documents/{TICKET}/PENTEST-REPORT.md with:
  - Executive Summary (overall risk level)
  - Findings table (ID, Severity, Category, Endpoint, Proof of Concept, Remediation)
  - Evidence (request/response pairs showing vulnerability)
  - Risk rating: Critical / High / Medium / Low / Informational",
  subagent_type: "security-agent"
)
```

3. Verify `documents/{TICKET}/PENTEST-REPORT.md` exists

4. Handle findings:
   - **Critical/High vulns found** → MUST fix before UAT:
     ```
     task(
       description: "Fix pentest vulnerabilities for {TICKET}",
       prompt: "Fix pentest vulnerabilities for {TICKET}: {findings with PoC}. Security has proven the exploit works.",
       subagent_type: "dev-agent"
     )
     ```
     After fix → re-run pentest on fixed endpoints (max 2 iterations)
   - **Medium findings** → log, proceed to UAT with known risks documented
   - **Low/Informational** → log as tech debt, proceed

5. Update STATUS: `pentest.status = "done"`

6. Attach PENTEST-REPORT to Jira (MANDATORY)

### Step 6f: Finalize

- If tests fail → transition "Fix bugs" → DEV fix → retest (loop)
- If tests pass + quality review OK + pentest done:
  - Update STATUS: `testing.status = "done"`
  - Report results including quality assessment and pentest summary

### Step 6g: UAT (Phase 6.5)

**After QA pass:**

1. Transition Jira: QA TEST → UAT (transition "Start UAT")
2. Inform user/PO feature ready for UAT: URL, test accounts, acceptance criteria, key test scenarios
3. **STOP — WAIT for user/PO to actually test and confirm**
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