### E2E-API-02~07: Schema Contract per Exporter (Group Table)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02~07 (Group) |
| **Priority** | High (02~05) / Medium (06~07) |
| **Level / Type** | E2E-API — schema contract (automated, table format) |
| **Requirement** | STORY 5 (AC-5.3, AC-5.4) · UC-05 · BR-11 · verified live shape per FSD §3.9.1 |
| **Preconditions** | Backend running; exporter discoverable via `find_tools` |
| **Test data** | `find_tools('<exporter>')` response; reference live shape: properties `markdown`, `file_name` (`anyOf[string,null]`), `options`, `content_base64`; `required: []` |
| **Automation** | `backend/tests/e2e-api/content-proxy.schema.e2e.test.ts` — one test per exporter (6 tests) |
| **Status** | Authored (completed — deferred spec now authored as group table) |
| **Deferral reason resolved** | schema contract (group) → authored; 6 exporter schema contracts now authored as group table from extracted_e2e.json |
| **Substitute evidence** | `evidence/E2E-API-02-07-schema-group.txt` |
| **Evidence (to capture)** | `evidence/E2E-API-02-07-schema-group.txt` |

### Table: 6 Exporter Schema Contracts

| # | Tool | Priority | Required | x-content-param | x-output-base64 | content_base64 | description marker |
|---|------|----------|----------|-----------------|-----------------|----------------|-------------------|
| 1 | export_docx | High | [] | 'markdown' | true | Present, type string, warning LLM | Exactly once |
| 2 | export_xlsx | High | [] | 'markdown' | true | Present, type string, warning LLM | Exactly once |
| 3 | export_pptx | High | [] | 'markdown' | true | Present, type string, warning LLM | Exactly once |
| 4 | export_pdf | High | [] | 'markdown' | true | Present, type string, warning LLM | Exactly once |
| 5 | export_html | Medium | [] | 'markdown' | true | Present, type string, warning LLM | Exactly once |
| 6 | export_json | Medium | [] | 'markdown' | true | Present, type string, warning LLM | Exactly once |

### Author's Notes
- **Deferral reason**: schema contract (group) — the 6 exporter schema contracts were stored as a table group in `extracted_e2e.json`. This case authors the group table documentation for all 6 exporter schema contracts simultaneously.
- **Substitute evidence**: `evidence/E2E-API-02-07-schema-group.txt` — the group table documentation for all 6 exporter schema contracts for future execution and verification.
- **Relation to individual summaries**: E2E-API-02 through E2E-API-07 are also authored as individual summaries, but this group table provides a consolidated view of all 6 exporter schema contracts side-by-side for easier comparison.
- **Automation**: The group table is derived from the automated `content-proxy.schema.e2e.test.ts` test suite, one test per exporter.

### Verification Checklist (Post-Author)
- [x] E2E-API-02-07.md (group) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Table populated with 6 exporter schema contract rows
- [x] Deferral reason resolved: schema contract (group) → authored
- [x] Substitute evidence referenced from extracted_e2e.json (`evidence/E2E-API-02-07-schema-group.txt`)
- [x] Evidence capture section populated (`evidence/E2E-API-02-07-schema-group.txt`)
- [x] STATUS.json updated: casesCompleted incremented to 52
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | E2E-API-02-07 | Authored | schema contract (group) → authored; 6 exporter schema contracts from extracted_e2e.json grouped together |
```

### Coordination Plan Reference
- **Current priority**: E2E-API-02~07 (E2E-API — schema contract group, all 6 exporter contracts)
- **Next priority after E2E-API-02~07**: All 52 cases complete → STATUS.json phase transition
- **Authoring group**: QA Agent — E2E-API schema contracts (group summaries)
- **Blocker**: None — substitute evidence extracted from extracted_e2e.json; this case authors the group table summary.
- **Relation to checkpoint**: This is checkpoint #50 (out of planned sequence for E2E-API cases; schema contract group complete)

### Coordination Plan Reference (Updated)
- **Current priority**: E2E-API-02~07 (schema contract group → now authored; all 52 cases complete)
- **Next priority after E2E-API-02~07**: All 52 cases complete → STATUS.json phase transition to `implementation` or `closed`
- **Authoring group**: QA Agent — E2E-API schema contracts
- **Blocker**: None — substitute evidence noted; this case authors the group table summary. All case groups complete.
- **Relation to checkpoint**: This is checkpoint #50 (out of planned sequence for E2E-API cases; schema contract group complete; final checkpoint)