---
name: fresh-context-review
description: Fresh-Context Review — Cô lập ngữ cảnh khi Code Review
---


# Fresh-Context Review — Cô lập ngữ cảnh khi Code Review

## Mục đích

Cơ chế review code trong đó reviewer KHÔNG nhận bất kỳ lịch sử conversation/session nào.
Reviewer chỉ thấy: git diff + specs (TDD, FSD, code-standards). Loại bỏ bias từ quá trình implementation.

## Khi nào kích hoạt

- Phase 6 Code Review (Axis 1: Standards, Axis 2: Spec Compliance)
- SM PHẢI chạy fresh-context review khi ĐẠT bất kỳ điều kiện nào sau:
  - >500 dòng thay đổi (git diff --stat)
  - Security-related changes (auth, authorization, encryption)
  - Data model changes (DB schema, migration files)
  - Complex refactoring (>5 files modified)

## Quy tắc cô lập ngữ cảnh (Context Isolation Rules)

### Reviewer ĐƯỢC NHẬN (whitelist)

| # | Input | Source |
|---|-------|--------|
| 1 | Git diff (main..{TICKET}) | `git diff main..{TICKET}` |
| 2 | TDD.md | `documents/{TICKET}/TDD.md` |
| 3 | FSD.md | `documents/{TICKET}/FSD.md` |
| 4 | code-standards.md | `.opencode/rules/sdlc/code-standards.md` |
| 5 | File tree (new/modified files only) | `git diff --name-status` |

### Reviewer KHÔNG ĐƯỢC NHẬN (denylist)

| # | Excluded Context | Reason |
|---|-----------------|--------|
| 1 | Prior conversation/session history | Prevents confirmation bias |
| 2 | RUN-LOG.md | Shows what other agents decided |
| 3 | STATUS.json progress data | Reveals implementation journey |
| 4 | BRD.md (business context) | Forces pure technical review |
| 5 | Implementation agent's reasoning | Prevents "agree with author" bias |
| 6 | Test results / TEST-REPORT | Reviewer must judge code independently |

### Reviewer prompt constraints

- KHÔNG được chứa: "as discussed", "as implemented", "based on previous"
- KHÔNG được reference: agent names, phase transitions, iteration history
- PHẢI force independent analysis: reviewer forms own opinion FIRST

## Fresh Review Prompt Template

```
invokeSubAgent(
  name: "{review-agent}",
  prompt: "INDEPENDENT CODE REVIEW — Fresh Context

  You are reviewing code changes for the FIRST time with NO prior context.
  You have NEVER seen this code before. Form your OWN assessment.

  ## Input
  - Git diff attached below
  - Technical Design Document (TDD) for expected behavior
  - Functional Specification (FSD) for business requirements
  - Code standards for style/quality rules

  ## Your Task
  Review the diff against specs and standards. Report:

  ### Findings
  | # | File | Line | Issue | Severity | Category |
  |---|------|------|-------|----------|----------|

  Categories: SECURITY, LOGIC, STANDARD, SPEC-GAP, SCOPE-CREEP, PERFORMANCE

  ### Summary
  - Total issues: {N}
  - Critical: {N} | High: {N} | Medium: {N} | Low: {N}
  - Verdict: PASS / PASS-WITH-WARNINGS / FAIL

  ## Rules
  - Do NOT assume anything about implementation intent
  - Do NOT reference any prior discussion or decision
  - Judge ONLY what the code does vs what specs say it should do
  - Flag anything that SURPRISES you — if code does something unexpected, report it
  ",
  contextFiles: [
    { "path": "documents/{TICKET}/TDD.md" },
    { "path": "documents/{TICKET}/FSD.md" },
    { "path": ".opencode/rules/sdlc/code-standards.md" }
  ]
)
```

## Comparison Mechanism (Biased vs Unbiased)

Sau khi fresh review hoàn thành, SM so sánh findings:

### Quy trình

1. **Standard review** (Axis 1 + Axis 2) chạy trước — reviewer có full context
2. **Fresh review** chạy sau — reviewer cô lập, chỉ thấy diff + specs
3. SM so sánh hai kết quả:

### Comparison Report Format

```markdown
## Fresh-Context Review Comparison — {TICKET}

### Findings ONLY in Fresh Review (Blind Spots)
| # | Issue | Why Standard Review Missed It |
|---|-------|-------------------------------|

### Findings ONLY in Standard Review (Context-Dependent)
| # | Issue | Why Fresh Review Missed It |
|---|-------|----------------------------|

### Common Findings (Both Reviews Agree)
| # | Issue | Severity |
|---|-------|----------|

### Insight
- Blind spots detected: {N}
- Context-dependent issues: {N}
- Agreement rate: {percent}%
- Action: {merge findings / escalate blind spots / no action}
```

### Hành động dựa trên comparison

| Scenario | Action |
|----------|--------|
| Fresh review finds Critical issues standard missed | ❌ BLOCK — DEV must fix |
| Fresh review finds High issues standard missed | ⚠️ DEV fix or user accepts risk |
| Only Medium/Low blind spots | Log as tech debt, proceed |
| Fresh review finds nothing new | ✅ Confirms standard review quality |

## SM Integration

SM chỉ chạy fresh-context review khi criteria đạt (xem "Khi nào kích hoạt").
Fresh review là OPTIONAL enhancement — không block pipeline nếu unavailable.

Thứ tự: Standard review → Fresh review → Comparison → Decision.


