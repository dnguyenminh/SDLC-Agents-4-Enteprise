# Shared: Jira Integration Rules

## Transition Timing

| Khi nào | Jira Transition | Transition Name |
|---------|----------------|-----------------|
| Phase 1 bắt đầu | TO DO → DOCS REVIEW | "Review Docs" |
| Docs approved, DEV bắt đầu | DOCS REVIEW → IN PROGRESS | "Implement" |
| DEV submit PR | IN PROGRESS → IN REVIEW | "Review code" |
| Code review approved | IN REVIEW → QA TEST | "Verify" |
| QA tests pass | QA TEST → UAT | "Start UAT" |
| PO accepts UAT | UAT → READY FOR PRODUCT | "Deploy" |
| Deploy + sanity pass | READY FOR PRODUCT → DONE | "Complete" |
| Bug found (any stage) | * → IN PROGRESS | "Fix bugs" |
| Docs cần sửa | DOCS REVIEW → IN PROGRESS | "Document Invalid" |

## Document Attachment Rules

### Naming Convention
`{DOC}-v{version}-{TICKET}.docx`
Examples: `BRD-v1-SCRUM-50.docx`, `FSD-v2-KSA-102.docx`

### Attachment Process
```
1. embed_images(file_path="documents/{TICKET}/{DOC}.md", output_path="documents/{TICKET}/{DOC}-embedded.md")
2. export_docx(file_path="documents/{TICKET}/{DOC}-embedded.md", file_name="{DOC}-v{version}-{TICKET}")
3. jira_update_issue(issue_key: "{TICKET}", fields: "{}", attachments: "documents/{TICKET}/{DOC}-v{version}-{TICKET}.docx")
```

### Timing
| Phase | Documents to Attach |
|-------|-------------------|
| Phase 1 | BRD.docx |
| Phase 2 | FSD.docx |
| Phase 3 | TDD.docx |
| Phase 4 | STP.docx + STC.docx |
| Phase 5.5 | UG.docx |
| Phase 6 | TEST-REPORT.docx |
| Phase 7 | DPG.docx + RLN.docx |

### Format Rules
- **Narrative docs** (BRD, FSD, TDD, STP, UG, DPG, RLN): → DOCX
- **Tabular docs** (STC): → XLSX
- **Diagrams**: attach `.drawio` files for reviewer editing

### ⛔ Document References MUST use DOCX/XLSX format
- ❌ WRONG: `| Related BRD | documents/MTO-5/BRD.md |`
- ✅ RIGHT: `| Related BRD | BRD-v2-MTO-5.docx |`

### Draw.io Attachment (MANDATORY)
Every DOCX attachment MUST include all related `.drawio` files:
```powershell
Get-ChildItem "documents/{TICKET}/diagrams/*.drawio" | ForEach-Object {
    jira_update_issue(issue_key: "{TICKET}", attachments: $_.FullName)
}
```

## Comment Processing Rules

### Auto-advance patterns
| Comment Pattern | SM Action |
|----------------|-----------|
| "approved", "LGTM", "OK to proceed" | Auto-advance to next phase |
| "cần sửa", "reject", "changes needed" | Mark needs_revision, report user |
| "đã cập nhật description" | Re-read ticket, compare with BRD |
| "scope change", "thêm requirement" | Re-read ticket, update BRD/FSD |

### Processing Rules
- Only process comments newer than `STATUS.json.lastUpdated`
- Ignore comments from same user who invoked SM
- Approval → auto-advance without asking
- Rejection → MUST report to user first

## Description Change Handling

When comment indicates description updated:
1. Re-fetch ticket
2. Compare with existing BRD
3. If NEW requirements found:
   - Report: "⚠️ Jira description đã thay đổi"
   - Invoke BA to update BRD
   - If FSD exists → update FSD
   - If TDD exists → mark needs_revision
4. If cosmetic only → no action

## Git Branch Convention

- Branch name = ticket key: `{TICKET}`
- Commit message: `{TICKET}: {short description}`
- Push before transitioning to IN REVIEW

## ⛔ Transitions SM CANNOT Auto-Execute

| Transition | Who | Why |
|-----------|-----|-----|
| UAT → READY FOR PRODUCT | SM only after user confirms | Must wait for user |
| READY FOR PRODUCT → DONE | SM only after deploy+sanity | Must wait for DevOps |
