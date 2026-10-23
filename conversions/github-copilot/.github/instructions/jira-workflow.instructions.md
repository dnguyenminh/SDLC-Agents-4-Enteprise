---
name: 'Jira integration rules — transitions, comments, attachments for SDLC pipeline'
description: 'Jira integration rules — transitions, comments, attachments for SDLC pipeline'
applyTo: '**'
---

## Jira Transitions
| When | Transition |
|------|-----------|
| Phase 1 starts (BRD creation) | TO DO → DOCS REVIEW |
| DEV starts implementation | DOCS REVIEW → IN PROGRESS |
| PR submitted | IN PROGRESS → IN REVIEW |
| Code review approved | IN REVIEW → QA TEST |
| QA tests pass | QA TEST → UAT |
| PO accepts UAT | UAT → READY FOR PRODUCT |
| Deploy + sanity pass | READY FOR PRODUCT → DONE |
| Bug found (any stage) | * → IN PROGRESS |

## Document Attachments
- Naming: `{DOC}-v{version}-{TICKET}.docx`
- Process: embed_image → export_docx → jira_update_issue
- Attach IMMEDIATELY after each phase, not at end of pipeline

## Rules
- NEVER hardcode transition IDs — always fetch dynamically
- Every transition needs a Jira comment explaining the change
- Always link related tickets in comments
- When description changes, re-read ticket and check if BRD/FSD needs update
