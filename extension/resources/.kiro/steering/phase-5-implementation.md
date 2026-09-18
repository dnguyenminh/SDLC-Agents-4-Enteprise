# Phase 5: Implementation (DEV → Code)

## Prerequisites

- TDD.md exists
- design.status = "done"
- Jira ticket ở IN PROGRESS (hoặc transition "Implement")

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
  prompt: "Implement code cho {TICKET} theo TDD. Đọc code intelligence data."
)
```

### Step 5c: TA Reviews Implementation (MANDATORY — code done only after TA approves)

**Sau khi DEV implement xong, TA (Technical Architect) PHẢI review code để xác nhận implementation bám sát thiết kế kỹ thuật (FSD/TDD). Code chỉ hoàn thành khi TA agent approve.**

4. Verify code created (check for new/modified files)

5. Invoke TA:
```
invokeSubAgent(
  name: "ta-agent",
  prompt: "Technical Review implementation cho {TICKET}. Đọc FSD + TDD từ KB (mem_search '{TICKET} FSD', '{TICKET} TDD'). Đọc code vừa implement (git diff main..{TICKET}). Kiểm tra:
  1. Design conformance — Code có bám sát architecture/component design trong TDD?
  2. API contracts — Endpoints/signatures match TDD API design exactly?
  3. Integration — External/internal integrations đúng như TDD Section Integration?
  4. Data model — Entities/fields khớp FSD + TDD data design?
  5. Pseudocode alignment — Complex logic implement đúng pseudocode/thuật toán đã thiết kế?
  6. Technical debt / deviations — Có lệch thiết kế không? Nếu có, có justify được không?
  7. Extensibility & patterns — Dùng đúng design pattern như TDD chỉ định?
  Output format:
  ## TA Review — Implementation {TICKET}
  | # | Design Item (TDD/FSD) | Implemented | Conforms? | Note |
  |---|-----------------------|-------------|-----------|------|
  ### Deviations from design
  | # | Design | Code does | Severity | Justified? |
  Verdict: APPROVED / CHANGES REQUESTED (list changes)"
)
```

6. Handle TA verdict:
   - **APPROVED** → proceed to push (Step 5d)
   - **CHANGES REQUESTED** → invoke DEV to fix theo danh sách từ TA → re-invoke TA to re-review (max 2 iterations)

7. ⛔ **Implementation KHÔNG được đánh dấu done cho tới khi TA verdict = APPROVED.** Nếu sau 2 iterations vẫn CHANGES REQUESTED → report user.

### Step 5d: Verify & Push

8. Commit and push:
```bash
git add -A
git commit -m "{TICKET}: {summary from Jira}"
git push -u origin {TICKET}
```

9. Transition Jira: IN PROGRESS → IN REVIEW:
```
transition_issue(issue_key: "{TICKET}", transition_name: "Review code")
```

10. Update STATUS: `implementation.status = "done"`, `implementation.taReview = "approved"`

11. Report: "✅ Phase 5 done — Code TA-approved & pushed to branch {TICKET}. Chuyển sang Phase 5.5 (User Guide)?"

12. Wait for user confirmation.

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
  prompt: "Viết User Guide cho {TICKET}. Đọc BRD, FSD, TDD từ KB. Đọc source code. Template: documents/templates/UG-TEMPLATE.md. Output: documents/{TICKET}/UG.md. Nội dung: Installation, Configuration Reference, Usage, Administration, Troubleshooting, Error Codes, FAQ."
)
```

3. Verify `documents/{TICKET}/UG.md` exists

### Step 5.5b: BA Reviews UG

4. Invoke BA:
```
invokeSubAgent(
  name: "ba-agent",
  prompt: "Review User Guide cho {TICKET} tại documents/{TICKET}/UG.md. Kiểm tra: 1) Ngôn ngữ user-friendly, 2) Đầy đủ use cases từ BRD, 3) Configuration examples rõ ràng, 4) Troubleshooting covers common issues. Sửa trực tiếp nếu cần."
)
```

### Step 5.5c: QA Verifies UG (MANDATORY)

5. Invoke QA:
```
invokeSubAgent(
  name: "qa-agent",
  prompt: "Verify User Guide cho {TICKET} bằng cách thực hiện theo instructions trong documents/{TICKET}/UG.md.
  PHẢI thực hiện (không chỉ đọc):
  1. Follow Quick Start: chạy server, verify log output
  2. Copy minimal config example, verify server start
  3. Copy full config example, verify YAML syntax
  4. Send tools/list request, verify response
  5. Gọi thử từng tool, verify response format
  6. Verify error codes match actual behavior
  7. Verify config validation rules match actual
  Báo cáo PASS/FAIL cho mỗi step."
)
```

6. If QA FAIL → DEV fix UG → re-verify (max 2 iterations)

### Step 5.5d: Finalize

7. Update STATUS: `user_guide.status = "done"`, `user_guide.version = N`

8. Attach to Jira:
```
embed_images → export_docx → jira_update_issue
```

9. Ingest UG vào KB (FULL content)

10. Report: "✅ Phase 5.5 done — UG.md created, BA reviewed, QA verified."

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
**TA reads:** KB (FSD + TDD), git diff (implementation) — reviews code for design conformance
**TA writes:** TA Review verdict (APPROVED / CHANGES REQUESTED) — gate for implementation completion

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
  prompt: "Security Code Review cho {TICKET}. Audit source code on branch {TICKET}. Check:
  1. OWASP Top 10 vulnerabilities (injection, broken auth, sensitive data exposure, XXE, broken access control, security misconfiguration, XSS, insecure deserialization, known vulns, insufficient logging)
  2. Authentication/Authorization implementation correctness
  3. Input validation and output encoding
  4. SQL injection, command injection protection
  5. Secrets/credentials handling (no hardcoded secrets, proper env var usage)
  6. Dependency vulnerabilities (check CVEs for libraries used)
  7. Error handling (no stack traces or sensitive info in responses)
  8. Encryption — correct algorithms, key management
  9. CORS, CSRF, security headers
  10. Secure defaults (fail-closed, deny by default)
  Output: documents/{TICKET}/SECURITY-ASSESSMENT.md với:
  - Findings table (ID, Severity, Category, File, Description, Remediation)
  - Overall risk rating
  - Recommendations prioritized by severity"
)
```

3. Verify `documents/{TICKET}/SECURITY-ASSESSMENT.md` exists

### Step 5.7b: Handle Findings

4. Read SECURITY-ASSESSMENT.md findings:
   - **No Critical/High** → proceed to Phase 6 (Testing)
   - **Critical findings** → MUST fix before testing:
     ```
     invokeSubAgent(
       name: "dev-agent",
       prompt: "Fix security vulnerabilities cho {TICKET}. Security review phát hiện:
       {list critical findings with file + line + remediation}
       Fix từng issue. Commit message: '{TICKET}: fix security - {category}'"
     )
     ```
     After fix → re-invoke security-agent for re-review (max 2 iterations)
   - **High findings** → DEV must fix, or user explicitly accepts risk

5. Update STATUS: `security_code_review.status = "done"`

6. Report: "✅ Phase 5.7 done — Security Code Review complete. {N} findings ({critical} critical, {high} high, {medium} medium). Chuyển sang Phase 6 (Testing)?"

7. Wait for user confirmation.

### Quality Gate — Security Code Review

| # | Check | If Missing |
|---|-------|------------|
| 1 | SECURITY-ASSESSMENT.md exists | Re-invoke security-agent |
| 2 | No Critical findings unresolved | DEV must fix → re-review |
| 3 | No High findings unresolved (or risk accepted) | DEV fix or user approval |
| 4 | All findings have remediation recommendations | Ask security-agent to add |
