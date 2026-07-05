---
paths:
  - "documents/**"
  - "**/*.json"
---

# SDLC Pipeline Rules

## Phase Order (NEVER skip)

| Phase | Agent | Output | Prerequisites |
|-------|-------|--------|---------------|
| 1 | ba-agent | BRD.md | Jira ticket exists |
| 2 | ba-agent + ta-agent | FSD.md | BRD.md exists |
| 2.5 | ui-agent | Wireframes | FSD with UI specs |
| 3 | sa-agent | TDD.md | FSD.md exists |
| 3.5 | BA+SA loop | FSD fix + TDD update | DISCREPANCY.md exists |
| 4 | qa-agent | STP.md, STC.md | BRD + FSD + TDD exist |
| 5 | dev-agent | Source code | TDD exists |
| 5.5 | dev+ba+qa | UG.md | Code + all docs |
| 6 | qa-agent | Test results | Code + STP/STC |
| 6.5 | PO/User | UAT acceptance | All tests pass |
| 7 | devops-agent | DPG.md, RLN.md | UAT accepted |

## Status Tracking

File: `documents/{TICKET}/STATUS.json`
Values: not_started, in_progress, done, needs_revision, blocked

## Quality Gates

After each phase completes, verify:
- Document exists and has real content (>100 chars)
- Required diagrams exist (.drawio + .png)
- Ingest into KB (FULL content, not summary)

## Document Attachment (MANDATORY after each phase)

1. embed_images → 2. export_docx → 3. attach to Jira
Naming: `{DOC}-v{version}-{TICKET}.docx`

## Jira Transitions

| When | Transition |
|------|-----------|
| Phase 1 starts | TO DO → DOCS REVIEW |
| Docs approved | DOCS REVIEW → IN PROGRESS |
| Code pushed | IN PROGRESS → IN REVIEW |
| Review OK | IN REVIEW → QA TEST |
| QA pass | QA TEST → UAT |
| UAT pass | UAT → READY FOR PRODUCT |
| Deploy done | READY FOR PRODUCT → DONE |

## Anti-Loop Rules
- Do NOT loop same phase — file exists + content → move forward
- Each sub-agent max 2 invocations per document
- Detect placeholder docs (<100 chars) → treat as not created
