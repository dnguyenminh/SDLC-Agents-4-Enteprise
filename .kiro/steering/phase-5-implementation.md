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

8. Report: "✅ Phase 5 done — Code pushed to branch {TICKET}. Chuyển sang Phase 5.5 (User Guide)?"

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
