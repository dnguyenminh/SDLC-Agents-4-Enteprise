### E2E-API-15: Missing content → exact error path

| Field | Value |
|-------|-------|
| **ID** | E2E-API-15 |
| **Priority** | High |
| **Level / Type** | E2E-API — error path (automated) |
| **Requirement** | STORY 7 (AC-7.1) · UC-07 Flow A · BR-01 · E-08 |
| **Preconditions** | Backend + child running |
| **Test data** | `execute_dynamic_tool('export_docx', { output_path: '<tmp>/never.docx' })` — no `content_base64`, no `markdown` |
| **Automation** | `backend/tests/e2e-api/content-proxy.payload.e2e.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | error path → authored; missing-content error path now authored: exact error message with no artifact produced |
| **Substitute evidence** | `evidence/E2E-API-15-missing-content.txt` |
| **Evidence (to capture)** | `evidence/E2E-API-15-missing-content.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute | `isError === true`; text begins `Missing content: pass file_path so the extension wrapper can inject content_base64 (or send markdown directly).` |
| 2 | Verify no artifact was produced | `<tmp>/never.docx` does not exist; the child was never invoked with an empty document |

### Expected result:
`isError === true`; exact missing-content error message; no artifact produced.

### Author's Notes
- **Deferral reason**: error path — the missing-content error path was not previously authored as a standalone case. This case authors the error path documentation and test logic for future execution.
- **Substitute evidence**: `evidence/E2E-API-15-missing-content.txt` — the missing-content error documentation for future feature activation.
- **Relation to E2E-API-14**: E2E-API-14 covers direct-call compatibility (child's original shape preserved); E2E-API-15 covers the error path when content is missing. Both are E2E API error-handling surfaces, but at different scenarios: success vs failure.
- **Automation**: The test case authoring includes steps 1-2 from the original E2E-API-15 specification. The test itself will execute without content and verify the exact error message is produced.

### Verification Checklist (Post-Author)
- [x] E2E-API-15.md (or extracted_e2e.json section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 2 steps (execute + verify no artifact)
- [x] Deferral reason resolved: error path → authored
- [x] Substitute evidence referenced from extracted_e2e.json (`evidence/E2E-API-15-missing-content.txt`)
- [x] Evidence capture section populated (evidence/E2E-API-15-missing-content.txt)
- [x] STATUS.json updated: casesCompleted incremented to 46, nextPriority set to E2E-API-16 (or appropriate next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | E2E-API-15 | Authored | error path → authored; missing-content error: exact error message with no artifact produced |
```

### Coordination Plan Reference
- **Current priority**: E2E-API-15 (E2E-API — error path)
- **Next priority after E2E-API-15**: E2E-API-16 (invalid content_base64 rejection)
- **Authoring group**: QA Agent — E2E-API error path cases
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the missing-content error documentation. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #35 (out of planned sequence for E2E-API cases; error path sub-group complete)

### Coordination Plan Reference (Updated)
- **Current priority**: E2E-API-15 (error path → now authored)
- **Next priority after E2E-API-15**: E2E-API-16 (invalid content_base64 rejection)
- **Authoring group**: QA Agent — E2E-API error path cases
- **Blocker**: None — substitute evidence noted; this case authors the missing-content error documentation. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #35 (out of planned sequence for E2E-API cases; error path sub-group complete)