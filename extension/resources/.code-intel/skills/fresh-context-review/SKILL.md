---
name: fresh-context-review
description: Context-isolated code review — reviewer only sees diff + specs (no session history) for unbiased review
---

# Fresh-Context Review — Isolating Context in Code Review

## Purpose

A code review mechanism in which the reviewer receives NO conversation/session history.
The reviewer only sees: git diff + specs (TDD, FSD, code-standards). Removes bias from the implementation process.

## When Activated

- Phase 6 Code Review (Axis 1: Standards, Axis 2: Spec Compliance)
- SM MUST run a fresh-context review when ANY of the following conditions are met:
  - >500 lines changed (`git diff --stat`)
  - Security-related changes (auth, authorization, encryption)
  - Data model changes (DB schema, migration files)
  - Complex refactoring (>5 files modified)

## Context Isolation Rules

### Reviewer RECEIVES (whitelist)

| # | Input | Source |
|---|-------|--------|
| 1 | Git diff (main..{TICKET}) | `git diff main..{TICKET}` |
| 2 | TDD.md | `documents/{TICKET}/TDD.md` |
| 3 | FSD.md | `documents/{TICKET}/FSD.md` |
| 4 | Code standards | the `code-standards` skill (load via the skill tool) |
| 5 | File tree (new/modified files only) | `git diff --name-status` |

### Reviewer MUST NOT RECEIVE (denylist)

| # | Excluded Context | Reason |
|---|-----------------|--------|
| 1 | Prior conversation/session history | Prevents confirmation bias |
| 2 | RUN-LOG.md | Shows what other agents decided |
| 3 | STATUS.json progress data | Reveals implementation journey |
| 4 | BRD.md (business context) | Forces pure technical review |
| 5 | Implementation agent's reasoning | Prevents "agree with author" bias |
| 6 | Test results / TEST-REPORT | Reviewer must judge code independently |

### Reviewer prompt constraints

- MUST NOT contain: "as discussed", "as implemented", "based on previous"
- MUST NOT reference: agent names, phase transitions, iteration history
- MUST force independent analysis: reviewer forms own opinion FIRST

## Fresh Review Prompt Template

```
task(
  description: "Independent fresh-context code review for {TICKET}",
  prompt: "INDEPENDENT CODE REVIEW — Fresh Context

  You are reviewing code changes for the FIRST time with NO prior context.
  You have NEVER seen this code before. Form your OWN assessment.

  ## Input
  - Git diff: run `git diff main..{TICKET}`
  - Technical Design Document (TDD) for expected behavior: read documents/{TICKET}/TDD.md
  - Functional Specification (FSD) for business requirements: read documents/{TICKET}/FSD.md
  - Code standards for style/quality rules: load the 'code-standards' skill via the skill tool

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
  subagent_type: "{review-agent}"
)
```

## Comparison Mechanism (Biased vs Unbiased)

After the fresh review completes, SM compares findings:

### Process

1. **Standard review** (Axis 1 + Axis 2) runs first — reviewer has full context
2. **Fresh review** runs after — reviewer is isolated, only sees diff + specs
3. SM compares the two results:

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

### Actions based on comparison

| Scenario | Action |
|----------|--------|
| Fresh review finds Critical issues standard missed | BLOCK — DEV must fix |
| Fresh review finds High issues standard missed | DEV fix or user accepts risk |
| Only Medium/Low blind spots | Log as tech debt, proceed |
| Fresh review finds nothing new | Confirms standard review quality |

## SM Integration

SM only runs fresh-context review when criteria are met (see "When Activated").
Fresh review is an OPTIONAL enhancement — does not block pipeline if unavailable.

Order: Standard review → Fresh review → Comparison → Decision.