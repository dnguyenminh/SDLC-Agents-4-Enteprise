---
name: phase-5-implementation
description: Phase 5 workflow — DEV implements code, creates UG, security code review
---

## Prerequisites

- TDD.md exists
- design.status = "done"
- Jira ticket in IN PROGRESS (or transition "Implement")

## Workflow

### Step 5a: Prepare

1. Verify Jira status = IN PROGRESS. If not:
```
transition_issue(issue_key: "{TICKET}", transition_name: "Implement")
```

2. Create git branch:
```bash
git checkout -b {TICKET}
```

3. Update STATUS: `implementation.status = "in_progress"`

### Step 5b: Invoke DEV Agent

```
invokeSubAgent(
  name: "dev-agent",
  prompt: "Implement code for {TICKET} per TDD. Read code intelligence data."
)
```

### Step 5c: Verify & Push

4. Verify code created (check for new/modified files)

5. Commit and push:
```bash
git add -A
git commit -m "{TICKET}: {summary from Jira}"
git push -u origin {TICKET}
```

6. Transition Jira: IN PROGRESS → IN REVIEW:
```
transition_issue(issue_key: "{TICKET}", transition_name: "Review code")
```

7. Update STATUS: `implementation.status = "done"`

8. Report: "Phase 5 done — Code pushed to branch {TICKET}. Proceed to Phase 5.5 (User Guide)?"
9. Wait for user confirmation.

## Phase 5.5: User Guide (DEV write + BA review + QA verify)

### Prerequisites
- Code exists (implementation.status = "done")
- BRD + FSD + TDD exist

### Step 5.5a: DEV Writes UG

1. Update STATUS: `user_guide.status = "in_progress"`

2. Invoke DEV:
```
invokeSubAgent(
  name: "dev-agent",
  prompt: "Write User Guide for {TICKET}. Read BRD, FSD, TDD from KB. Read source code. Template: documents/templates/UG-TEMPLATE.md. Output: documents/{TICKET}/UG.md. Content: Installation, Configuration Reference, Usage, Administration, Troubleshooting, Error Codes, FAQ."
)
```

3. Verify `documents/{TICKET}/UG.md` exists

### Step 5.5b: BA Reviews UG

4. Invoke BA:
```
invokeSubAgent(
  name: "ba-agent",
  prompt: "Review User Guide for {TICKET} at documents/{TICKET}/UG.md. Check: 1) User-friendly language, 2) All BRD use cases covered, 3) Clear configuration examples, 4) Troubleshooting covers common issues. Edit directly if needed."
)
```

### Step 5.5c: QA Verifies UG (MANDATORY)

5. Invoke QA:
```
invokeSubAgent(
  name: "qa-agent",
  prompt: "Verify User Guide for {TICKET} by following instructions in documents/{TICKET}/UG.md.
  MUST execute (not just read):
  1. Follow Quick Start: run server, verify log output
  2. Copy minimal config example, verify server start
  3. Copy full config example, verify YAML syntax
  4. Send tools/list request, verify response
  5. Try each tool, verify response format
  6. Verify error codes match actual behavior
  7. Verify config validation rules match actual
  Report PASS/FAIL for each step."
)
```

6. If QA FAIL → DEV fixes UG → re-verify (max 2 iterations)

### Step 5.5d: Finalize

7. Update STATUS: `user_guide.status = "done"`, `user_guide.version = N`

8. Attach to Jira: `embed_images → export_docx → jira_update_issue`

9. Ingest UG into KB (FULL content)

10. Report: "Phase 5.5 done — UG.md created, BA reviewed, QA verified."

## Quality Gate — UG

| # | Check | If Missing |
|---|-------|------------|
| 1 | UG.md exists | Re-invoke DEV |
| 2 | Installation/Quick Start section | Ask DEV to add |
| 3 | Configuration Reference with tables | Ask DEV to add |
| 4 | Usage section with examples | Ask DEV to add |
| 5 | Troubleshooting section | Ask DEV to add |
| 6 | Error Codes table | Ask DEV to add |
| 7 | API Reference (if applicable) | Ask DEV to add |
| 8 | BA review completed | Invoke BA |
| 9 | QA verification PASS | Invoke QA |

## Agent Data Access

**DEV reads:** KB (TDD + FSD + BRD), code intelligence, source code
**DEV writes:** Source code, UG.md → KB, code intelligence index

## Phase 5.7: Security Code Review (MANDATORY)

### Prerequisites
- Code exists (implementation.status = "done")
- Source code pushed to branch {TICKET}

### Step 5.7a: Security Agent Audits Code

1. Update STATUS: `security_code_review.status = "in_progress"`

2. Invoke Security agent:
```
invokeSubAgent(
  name: "security-agent",
  prompt: "Security Code Review for {TICKET}. Audit source code on branch {TICKET}. Check:
  1. OWASP Top 10 vulnerabilities
  2. Authentication/Authorization implementation correctness
  3. Input validation and output encoding
  4. SQL injection, command injection protection
  5. Secrets/credentials handling
  6. Dependency vulnerabilities
  7. Error handling (no stack traces in responses)
  8. Encryption algorithms, key management
  9. CORS, CSRF, security headers
  10. Secure defaults (fail-closed, deny by default)
  Output: documents/{TICKET}/SECURITY-ASSESSMENT.md with findings table and recommendations."
)
```

3. Verify `documents/{TICKET}/SECURITY-ASSESSMENT.md` exists

### Step 5.7b: Handle Findings

4. Read SECURITY-ASSESSMENT.md findings:
   - **No Critical/High** → proceed to Phase 6 (Testing)
   - **Critical findings** → MUST fix before testing
   - **High findings** → DEV must fix, or user explicitly accepts risk

5. Update STATUS: `security_code_review.status = "done"`

6. Report summary of findings

7. Wait for user confirmation.

### Quality Gate — Security Code Review

| # | Check | If Missing |
|---|-------|------------|
| 1 | SECURITY-ASSESSMENT.md exists | Re-invoke security-agent |
| 2 | No Critical findings unresolved | DEV must fix → re-review |
| 3 | No High findings unresolved (or risk accepted) | DEV fix or user approval |
| 4 | All findings have remediation recommendations | Ask security-agent to add |