# Jira Integration Rules

## Transition Timing

| When | Jira Transition | Transition Name |
|---|---|---|
| Phase 1 starts | TO DO → DOCS REVIEW | "Review Docs" |
| Docs approved, DEV starts | DOCS REVIEW → IN PROGRESS | "Implement" |
| DEV submits PR | IN PROGRESS → IN REVIEW | "Review code" |
| Code review approved | IN REVIEW → QA TEST | "Verify" |
| QA tests pass | QA TEST → UAT | "Start UAT" |
| PO accepts UAT | UAT → READY FOR PRODUCT | "Deploy" |
| Deploy + sanity pass | READY FOR PRODUCT → DONE | "Complete" |
| Bug found (any stage) | * → IN PROGRESS | "Fix bugs" |
| Docs need fix | DOCS REVIEW → IN PROGRESS | "Document Invalid" |

## Dynamic Transition Resolution (NO HARDCODING)

- **NEVER** hardcode transition IDs (e.g., "11", "21")
- **ALWAYS** fetch available transitions using `jira_get_transitions(issue_key: "{TICKET}")`
- **RESOLVE** transition ID by matching the name

## Pre-Transition Checklist

1. Verify current status via `jira_get_issue`
2. Confirm transition exists from current → target status
3. Verify prerequisites (artifacts exist, ingested into KB)
4. Every transition MUST have a Jira comment explaining action + artifact references

## Document Attachment Rules

### Naming
`{DOC}-v{version}-{TICKET}.docx`
Examples: `BRD-v1-SCRUM-50.docx`, `FSD-v2-KSA-102.docx`

### Attachment Process
```
1. embed_image(file_path, output_path)
2. execute_dynamic_tool(toolName="export_docx", arguments={file_path, file_name})
3. jira_attach_file(issue_key: {TICKET}, file_path: "...docx")
```

### Timing
| Phase | Attach |
|---|---|
| Phase 1 | BRD.docx |
| Phase 2 | FSD.docx |
| Phase 3 | TDD.docx |
| Phase 4 | STP.docx + STC.xlsx |
| Phase 5.5 | UG.docx |
| Phase 6 | TEST-REPORT.docx |
| Phase 7 | DPG.docx + RLN.docx |

### Format Rules
- **Narrative** (BRD, FSD, TDD, STP, UG, DPG, RLN): DOCX
- **Tabular** (STC): XLSX
- **Diagrams**: attach `.drawio` files alongside DOCX

### ⛔ Document References MUST use DOCX/XLSX
- ❌ WRONG: `| Related BRD | documents/MTO-5/BRD.md |`
- ✅ RIGHT: `| Related BRD | BRD-v2-MTO-5.docx |`

### Draw.io Attachment (MANDATORY)
Every DOCX attachment MUST include all related `.drawio` files.

## Comment Processing

| Comment Pattern | SM Action |
|---|---|
| "approved", "LGTM", "OK to proceed" | Auto-advance |
| "cần sửa", "reject", "changes needed" | Mark needs_revision, report |
| "đã cập nhật description" | Re-read ticket, compare with BRD |
| "scope change", "thêm requirement" | Update BRD/FSD |

- Only process comments newer than STATUS.json.lastUpdated
- Ignore comments from same user who invoked SM

## Description Change Handling

1. Re-fetch ticket when comment indicates description updated
2. Compare with existing BRD
3. If NEW requirements → invoke BA to update BRD/FSD; mark TDD as needs_revision

## Git Branch Convention

- Branch name = ticket key: `{TICKET}`
- Commit message: `{TICKET}: {short description}`

## ⛔ Transitions SM CANNOT Auto-Execute

| Transition | Why |
|---|---|
| UAT → READY FOR PRODUCT | Must wait for user confirmation |
| READY FOR PRODUCT → DONE | Must wait for DevOps deploy + sanity |