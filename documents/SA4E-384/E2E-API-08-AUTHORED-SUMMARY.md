### E2E-API-08: export_docx — export format signature (OOXML package)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-08 |
| **Priority** | High |
| **Level / Type** | E2E-API — functional happy path (automated) |
| **Requirement** | STORY 1 (AC-1.1..AC-1.6) · UC-01 main flow · BR-07, BR-09, BR-10 · TD-01 · TR-1 |
| **Preconditions** | Backend + child running; temp workspace writable; source fixture written (TD-01: `# Hello\\n\\nWorld.\\n` ~20 B written to `<tmp>/content-proxy-e2e/source.md`; `output_path: <tmp>/content-proxy-e2e/out.docx`) |
| **Test data** | TD-01 source content; `output_path: <tmp>/content-proxy-e2e/out.docx` |
| **Automation** | `backend/tests/e2e-api/content-proxy.export.e2e.test.ts` — one test per format |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | happy path → authored; export_docx happy path now authored: OOXML package signature verified (PK + word/ parts), file written, size > 0 |
| **Substitute evidence** | `evidence/E2E-API-08-export-sig.txt` |
| **Evidence (to capture)** | `evidence/E2E-API-08-export-sig.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `execute_dynamic_tool('export_docx', { file_path, output_path })` over HTTP | HTTP 200; result is not `isError` |
| 2 | Stat the destination file | Exists; size > 0 |
| 3 | Read the first bytes / inspect ZIP entries | OOXML package signature: PK + word/ parts present (AC-1.3) |
| 4 | Parse the response text | file_path = destination; size_bytes === actual byte size; output_base64 absent (post-write metadata only) |

### Expected result:
HTTP 200; OOXML package signature verified (PK + word/ parts); file written with correct size; no output_base64 in response.

### Author's Notes
- **Deferral reason**: happy path — the export_docx happy path was stored as a table entry in extracted_e2e.json. This case authors the individual summary documenting the format signature verification for export_docx.
- **Substitute evidence**: evidence/E2E-API-08-export-sig.txt — the OOXML package signature documentation for export_docx for future execution and verification.
- **Relation to E2E-API-09**: E2E-API-09 is the automated schema contract test for export_docx (verifying the adapted schema); E2E-API-08 is the functional happy path test (verifying the actual export produces a valid OOXML file). Both ensure export_docx works correctly, one at the schema level, one at the execution level.
- **Automation**: The test case authoring includes all 4 steps from the original specification. The test itself will execute the export with a source fixture and verify the OOXML package signature, file existence, and size.

### Verification Checklist (Post-Author)
- [x] E2E-API-08.md exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 4 steps (preconditions + execute + stat + signature)
- [x] Deferral reason resolved: happy path → authored
- [x] Substitute evidence referenced from extracted_e2e.json (evidence/E2E-API-08-export-sig.txt)
- [x] Evidence capture section populated (evidence/E2E-API-08-export-sig.txt)
- [x] STATUS.json updated: casesCompleted incremented
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | E2E-API-08 | Authored | happy path → authored; export_docx happy path: OOXML package signature (PK + word/ parts), file written size > 0 |
```

### Coordination Plan Reference
- **Current priority**: E2E-API-08 (E2E-API — export format signature, first of 6 format cases)
- **Next priority after E2E-API-08**: E2E-API-09 (2nd of 6 format cases)
- **Authoring group**: QA Agent — E2E-API export format signatures
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the export_docx format signature summary. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #46 (out of planned sequence for E2E-API cases; export format signature sub-group starting)

### Coordination Plan Reference (Updated)
- **Current priority**: E2E-API-08 (happy path → now authored)
- **Next priority after E2E-API-08**: E2E-API-09 (2nd of 6 format cases)
- **Authoring group**: QA Agent — E2E-API export format signatures
- **Blocker**: None — substitute evidence noted; this case authors the export_docx format signature summary. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #46 (out of planned sequence for E2E-API cases; export format signature sub-group starting)