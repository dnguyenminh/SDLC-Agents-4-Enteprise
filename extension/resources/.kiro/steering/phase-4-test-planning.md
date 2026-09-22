# Phase 4: Test Planning (QA → STP/STC → SM Review)

## Prerequisites

- BRD.md + FSD.md + TDD.md exist
- design.status = "done"

## Workflow

### Step 4a: QA Agent Creates STP/STC

1. Update STATUS: `test_planning.status = "in_progress"`

2. Invoke QA agent:
```
invokeSubAgent(
  name: "qa-agent",
  prompt: "Tạo STP và STC cho {TICKET}. PHẢI tạo draw.io diagrams (test-coverage.drawio + test-execution-flow.drawio) và export PNG.",
  contextFiles: [{ "path": ".kiro/steering/drawio.md" }]
)
```

3. Verify `documents/{TICKET}/STP.md` and `documents/{TICKET}/STC.md` exist

### Step 4b: SM Reviews STP/STC

**SM tự review** với các tiêu chí:

| # | Tiêu chí | Severity |
|---|----------|----------|
| 1 | Completeness — RTM coverage = 100%? | Critical |
| 2 | 6 Test Levels (PBT, UT, IT, E2E-API, E2E-UI, SIT) | Critical |
| 3 | E2E Classification — SIT maximized automation? | High |
| 4 | Consistency — counts, IDs match between STP/STC | High |
| 5 | Test Case Quality — steps reproducible, data specific | High |
| 6 | E2E-API Coverage — CRUD lifecycle, auth, errors | High |
| 7 | E2E-UI Gherkin — scenarios ready to implement | Medium |
| 8 | Redundancy — no unnecessary duplicates | Low |
| 9 | Diagrams — test coverage + execution flow | Medium |
| 10 | Test Data — CSV files cover all test case IDs | High |

**Review Process:**
1. Read STP.md and STC.md
2. Cross-reference with BRD.md for RTM coverage
3. Check 6 test levels present
4. Verify E2E-API has sufficient cases
5. Verify SIT only has visual/UX tests
6. Check consistency (counts, IDs)
7. Generate review report

**Report Format:**
```
📋 STP/STC Review — {TICKET}

✅ Điểm tốt:
- ...

⚠️ Cần cải thiện:
- ...

❌ Lỗi cần sửa:
- ...

Verdict: {Approve / Approve with conditions / Reject}
```

**Outcomes:**
- **Approve** → proceed to Step 4b.5 (BA review)
- **Approve with conditions** → QA fixes → re-verify → proceed
- **Reject** → QA redo → re-review (max 2 iterations)

### Step 4b.5: BA Reviews Test Cases (MANDATORY — QA done only after BA approves)

**Sau khi SM review pass, BA PHẢI review STC để xác nhận test cases phản ánh đúng business requirements. QA chỉ hoàn thành việc khi BA agent đồng ý.**

1. Invoke BA:
```
invokeSubAgent(
  name: "ba-agent",
  prompt: "Review Test Cases cho {TICKET} tại documents/{TICKET}/STC.md (và STP.md). Đọc BRD từ KB (mem_search '{TICKET} BRD'). Kiểm tra:
  1. Business coverage — Mọi User Story và Acceptance Criteria trong BRD đều có test case tương ứng?
  2. Business rules — Mọi BR-XX trong FSD đều được test?
  3. Đúng ý nghĩa nghiệp vụ — Expected results phản ánh đúng hành vi business mong đợi?
  4. Edge cases nghiệp vụ — Các luồng exception/alternative quan trọng đã được cover?
  5. Không thiếu, không thừa — Không bỏ sót requirement, không test ngoài scope.
  Output format:
  ## BA Review — Test Cases {TICKET}
  | # | Requirement (US/AC/BR) | Covered by TC | Status |
  |---|------------------------|---------------|--------|
  ### Missing coverage
  | # | Requirement | Gap |
  Verdict: APPROVED / CHANGES REQUESTED (list changes)"
)
```

2. Handle BA verdict:
   - **APPROVED** → proceed to Step 4c/4d (finalize)
   - **CHANGES REQUESTED** → invoke QA to fix STC/STP với danh sách gap từ BA → re-invoke BA to re-review (max 2 iterations)

3. ⛔ **QA test planning KHÔNG được đánh dấu done cho tới khi BA verdict = APPROVED.** Nếu sau 2 iterations vẫn CHANGES REQUESTED → report user.

### Step 4c: Fix Issues (if any)

```
invokeSubAgent(
  name: "qa-agent",
  prompt: "Fix các issues sau trong STP/STC cho {TICKET}: {list}",
  contextFiles: [{ "path": ".kiro/steering/drawio.md" }]
)
```

Max 2 iterations. If still Critical issues → report to user.

### Step 4d: Finalize

⛔ Prerequisite: SM review = Approve AND BA verdict = APPROVED (Step 4b.5). QA test planning KHÔNG được done nếu thiếu BA approval.

1. Update STATUS: `test_planning.status = "done"`, `test_planning.review = "approved"`, `test_planning.baReview = "approved"`

2. Attach to Jira (MANDATORY):
```
embed_images(file_path="documents/{TICKET}/STP.md", output_path="documents/{TICKET}/STP-embedded.md")
export_docx(file_path="documents/{TICKET}/STP-embedded.md", file_name="STP-v1-{TICKET}")
embed_images(file_path="documents/{TICKET}/STC.md", output_path="documents/{TICKET}/STC-embedded.md")
export_docx(file_path="documents/{TICKET}/STC-embedded.md", file_name="STC-v1-{TICKET}")
jira_update_issue(issue_key: "{TICKET}", fields: "{}", attachments: "documents/{TICKET}/STP-v1-{TICKET}.docx,documents/{TICKET}/STC-v1-{TICKET}.docx")
```

3. Report:
```
✅ Phase 4 done — STP.md + STC.md created and reviewed.
- {N} test cases across 6 levels
- RTM coverage: 100%
- Review: Approved
Chuyển sang Phase 5 (Implementation)?
```

4. Wait for user confirmation.

## Quality Gate

| # | Check | If Missing |
|---|-------|------------|
| 1 | STP.md exists | Re-invoke QA |
| 2 | STC.md exists | Re-invoke QA |
| 3 | 6 test levels present | Re-invoke QA |
| 4 | RTM (Traceability Matrix) | Re-invoke QA |
| 5 | Test Coverage Diagram (.drawio + .png) | Invoke QA for diagrams |
| 6 | Test Execution Flow Diagram (.drawio + .png) | Invoke QA for diagrams |
| 7 | CSV test data files | Re-invoke QA |
| 8 | BA review of Test Cases = APPROVED | Invoke BA (Step 4b.5) — QA not done until BA approves |

## Agent Data Access

**QA reads:** KB (BRD + FSD + TDD)
**QA writes:** STP.md, STC.md → KB
**BA reads:** KB (BRD + FSD), STP.md, STC.md — reviews test cases for business coverage
**BA writes:** BA Review verdict (APPROVED / CHANGES REQUESTED) — gate for QA completion
