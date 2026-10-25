### E2E-API-06: export_html — adapted schema contract

| Field | Value |
|-------|-------|
| **ID** | E2E-API-06 |
| **Priority** | Medium |
| **Level / Type** | E2E-API — schema contract (automated) |
| **Requirement** | STORY 5 (AC-5.3, AC-5.4) · UC-05 · BR-11 · verified live shape per FSD §3.9.1 |
| **Preconditions** | Backend running; exporter discoverable via `find_tools` |
| **Test data** | `find_tools('export_html')` response; reference live shape of `export_pdf`: properties `markdown`, `file_name` (`anyOf[string,null]`), `options`, `content_base64`; `required: []` |
| **Automation** | `backend/tests/e2e-api/content-proxy.schema.e2e.test.ts` — one test per exporter |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | schema contract → authored; export_html schema contract now authored: `required: []`, `x-content-param: 'markdown'`, `x-output-base64: true`, `content_base64` present with warning, marker sentence appears exactly once |
| **Substitute evidence** | `evidence/E2E-API-06-schema.txt` |
| **Evidence (to capture)** | `evidence/E2E-API-06-schema.txt` |

### Steps (identical structure to E2E-API-02/03/04/05, different tool, Medium priority):

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `find_tools` for `export_html` | Tool found; **same name** as the child publishes |
| 2 | `inputSchema.required` | `[]` — the content argument (`markdown`) is no longer required |
| 3 | `inputSchema['x-content-param']` | `'markdown'` — names the child's real content argument |
| 4 | `inputSchema['x-output-base64']` | `true` |
| 5 | `inputSchema.properties.content_base64` | Present, `type: string`, description warns the LLM never to send it |
| 6 | `description` | Mentions `output_base64` **exactly once** (marker sentence not duplicated on repeat reads) |

### Expected result:
All schema checks pass for `export_html`: required empty, content param named, output base64 true, content_base64 present with warning, marker sentence single occurrence.

### Author's Notes
- **Deferral reason**: schema contract — the export_html schema contract was stored as a table entry in `extracted_e2e.json`. This case authors the individual summary documenting the contract verification for `export_html`.
- **Substitute evidence**: `evidence/E2E-API-06-schema.txt` — the schema contract documentation for `export_html` for future execution and verification.
- **Relation to E2E-API-02/03/04/05**: E2E-API-02 covers `export_docx` (High), E2E-API-03 covers `export_xlsx` (High), E2E-API-04 covers `export_pptx` (High), E2E-API-05 covers `export_pdf` (High), E2E-API-06 covers `export_html` (Medium). All 5 are exporter schema contracts sharing the same verification surface but with different tool names and priority levels.
- **Automation**: The test case authoring includes all 6 steps from the original specification. The test itself will verify the live shape of `export_html` via `find_tools` and check the 6 schema fields.

### Verification Checklist (Post-Author)
- [x] E2E-API-06.md exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 6 steps (find_tools + required + content-param + output-base64 + content_base64 + description)
- [x] Deferral reason resolved: schema contract → authored
- [x] Substitute evidence referenced from extracted_e2e.json (`evidence/E2E-API-06-schema.txt`)
- [x] Evidence capture section populated (`evidence/E2E-API-06-schema.txt`)
- [x] STATUS.json updated: casesCompleted incremented
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | E2E-API-06 | Authored | schema contract → authored; export_html schema contract: required [], x-content-param markdown, x-output-base64 true |
```

### Coordination Plan Reference
- **Current priority**: E2E-API-06 (E2E-API — schema contract, 6th and final of 6 High/Medium exporter contracts)
- **Next priority after E2E-API-06**: E2E-API-07 (E2E-API — schema contract, first of 6 export format signature cases)
- **Authoring group**: QA Agent — E2E-API schema contracts
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the export_html schema contract summary. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #44 (out of planned sequence for E2E-API cases; schema contract sub-group final of High/Medium)

### Coordination Plan Reference (Updated)
- **Current priority**: E2E-API-06 (schema contract → now authored)
- **Next priority after E2E-API-06**: E2E-API-07 (schema contract, first of 6 export format signature cases)
- **Authoring group**: QA Agent — E2E-API schema contracts
- **Blocker**: None — substitute evidence noted; this case authors the export_html schema contract summary. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #44 (out of planned sequence for E2E-API cases; schema contract sub-group final of High/Medium)