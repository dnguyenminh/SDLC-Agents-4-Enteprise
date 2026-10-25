### E2E-API-02: export_docx — adapted schema contract

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Level / Type** | E2E-API — schema contract (automated) |
| **Requirement** | STORY 5 (AC-5.3, AC-5.4) · UC-05 · BR-11 · verified live shape per FSD §3.9.1 |
| **Preconditions** | Backend running; exporter discoverable via `find_tools` |
| **Test data** | `find_tools('export_docx')` response; reference live shape of `export_pdf`: properties `markdown`, `file_name` (`anyOf[string,null]`), `options`, `content_base64`; `required: []` |
| **Automation** | `backend/tests/e2e-api/content-proxy.schema.e2e.test.ts` — one test per exporter |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | schema contract → authored; export_docx schema contract now authored: `required: []`, `x-content-param: 'markdown'`, `x-output-base64: true`, `content_base64` present with warning, marker sentence appears exactly once |
| **Substitute evidence** | `evidence/E2E-API-02-schema.txt` |
| **Evidence (to capture)** | `evidence/E2E-API-02-schema.txt` |

### Steps (identical for E2E-API-02):

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `find_tools` for `export_docx` | Tool found; **same name** as the child publishes |
| 2 | `inputSchema.required` | `[]` — the content argument (`markdown`) is no longer required |
| 3 | `inputSchema['x-content-param']` | `'markdown'` — names the child's real content argument |
| 4 | `inputSchema['x-output-base64']` | `true` |
| 5 | `inputSchema.properties.content_base64` | Present, `type: string`, description warns the LLM never to send it |
| 6 | `description` | Mentions `output_base64` **exactly once** (marker sentence not duplicated on repeat reads) |

### Expected result:
All 6 schema checks pass for `export_docx`: required empty, content param named, output base64 true, content_base64 present with warning, marker sentence single occurrence.

### Author's Notes
- **Deferral reason**: schema contract — the export_docx schema contract was stored as a table entry in `extracted_e2e.json`. This case authors the individual summary documenting the contract verification for `export_docx`.
- **Substitute evidence**: `evidence/E2E-API-02-schema.txt` — the schema contract documentation for `export_docx` for future execution and verification.
- **Relation to E2E-API-03~07**: E2E-API-02~07 are the 6 exporter schema contracts (export_docx, export_xlsx, export_pptx, export_pdf, export_html, export_json). Each is a separate case documenting the live-schema verification for that exporter. All 6 share the same step structure but with different tool names and priority levels (High for first 5, Medium for export_json).
- **Automation**: The test case authoring includes all 6 steps from the original specification. The test itself will verify the live shape of each exporter via `find_tools` and check the 6 schema fields.

### Verification Checklist (Post-Author)
- [x] E2E-API-02.md exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 6 steps (find_tools + required + content-param + output-base64 + content_base64 + description)
- [x] Deferral reason resolved: schema contract → authored
- [x] Substitute evidence referenced from extracted_e2e.json (`evidence/E2E-API-02-schema.txt`)
- [x] Evidence capture section populated (`evidence/E2E-API-02-schema.txt`)
- [x] STATUS.json updated: casesCompleted incremented
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | E2E-API-02 | Authored | schema contract → authored; export_docx schema contract: required [], x-content-param markdown, x-output-base64 true |
```

### Coordination Plan Reference
- **Current priority**: E2E-API-02 (E2E-API — schema contract, 2nd of 6 exporter contracts)
- **Next priority after E2E-API-02**: E2E-API-03 (3rd of 6 exporter contracts)
- **Authoring group**: QA Agent — E2E-API schema contracts
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the export_docx schema contract summary. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #40 (out of planned sequence for E2E-API cases; schema contract sub-group starting)

### Coordination Plan Reference (Updated)
- **Current priority**: E2E-API-02 (schema contract → now authored)
- **Next priority after E2E-API-02**: E2E-API-03 (3rd of 6 exporter contracts)
- **Authoring group**: QA Agent — E2E-API schema contracts
- **Blocker**: None — substitute evidence noted; this case authors the export_docx schema contract summary. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #40 (out of planned sequence for E2E-API cases; schema contract sub-group starting)