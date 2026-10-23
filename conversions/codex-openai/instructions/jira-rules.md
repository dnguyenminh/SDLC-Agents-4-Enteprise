# Jira Integration Rules

## Transition Timing

| When | Transition | Name |
|---|---|---|
| Phase 1 starts | TO DO → DOCS REVIEW | "Review Docs" |
| Docs approved | DOCS REVIEW → IN PROGRESS | "Implement" |
| DEV submits PR | IN PROGRESS → IN REVIEW | "Review code" |
| Code review approved | IN REVIEW → QA TEST | "Verify" |
| QA tests pass | QA TEST → UAT | "Start UAT" |
| PO accepts UAT | UAT → READY FOR PRODUCT | "Deploy" |
| Deploy + sanity pass | READY FOR PRODUCT → DONE | "Complete" |
| Bug found | * → IN PROGRESS | "Fix bugs" |

## Dynamic Transition Resolution (NO HARDCODING)

- NEVER hardcode transition IDs
- ALWAYS fetch via `jira_get_transitions(issue_key)`
- RESOLVE transition ID by matching name

## Pre-Transition Checklist

1. Verify current status via `jira_get_issue`
2. Confirm transition exists from current → target
3. Verify prerequisites (artifacts exist, ingested into KB)
4. Every transition MUST have a Jira comment

## Document Attachment

### Naming: `{DOC}-v{version}-{TICKET}.docx`

### Process
```
1. embed_image(file_path, output_path)
2. execute_dynamic_tool(toolName="export_docx", arguments={file_path, file_name})
3. jira_attach_file(issue_key: {TICKET}, file_path: "...docx")
```

### Timing
| Phase | Attach |
|---|---|
| 1 | BRD.docx |
| 2 | FSD.docx |
| 3 | TDD.docx |
| 4 | STP.docx + STC.xlsx |
| 5.5 | UG.docx |
| 6 | TEST-REPORT.docx |
| 7 | DPG.docx + RLN.docx |

### Format Rules
- Narrative (BRD, FSD, TDD, STP, UG, DPG, RLN): DOCX
- Tabular (STC): XLSX
- Diagrams: attach `.drawio` files alongside DOCX (MANDATORY)

### Document References MUST use DOCX/XLSX
- ❌ WRONG: `| Related BRD | documents/MTO-5/BRD.md |`
- ✅ RIGHT: `| Related BRD | BRD-v2-MTO-5.docx |`

## Comment Processing

| Comment Pattern | Action |
|---|---|
| "approved", "LGTM" | Auto-advance |
| "cần sửa", "reject" | Mark needs_revision |
| "đã cập nhật description" | Re-read ticket, compare BRD |

Only process comments newer than STATUS.json.lastUpdated. Ignore comments from same user who invoked SM.

## Git Branch Convention

- Branch = ticket key: `{TICKET}`
- Commit: `{TICKET}: {short description}`

## ⛔ Transitions SM CANNOT auto-execute

| Transition | Why |
|---|---|
| UAT → READY FOR PRODUCT | Must wait for user |
| READY FOR PRODUCT → DONE | Must wait for DevOps deploy + sanity |