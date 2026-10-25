### E2E-API-16: Invalid content_base64 → exact rejection

| Field | Value |
|-------|-------|
| **ID** | E2E-API-16 |
| **Priority** | High |
| **Level / Type** | E2E-API — error path (automated) |
| **Requirement** | STORY 7 (AC-7.2) · UC-01 EF-3, UC-07 Flow B · BR-01 · E-09 · NFR-5, NFR-12 · TD-04 · RK-04 |
| **Preconditions** | Backend + child running |
| **Test data** | TD-04 — `content_base64: '!!!not-base64!!!'` |
| **Automation** | `backend/tests/e2e-api/content-proxy.payload.e2e.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | error path → authored; invalid-base64 rejection now authored: exact rejection message, no file written, child not invoked |
| **Substitute evidence** | `evidence/E2E-API-16-invalid-base64.txt` |
| **Evidence (to capture)** | `evidence/E2E-API-16-invalid-base64.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute with the malformed payload | `isError === true`; text === `Invalid content_base64 payload.` (exact documented message) |
| 2 | Verify no side effects | No file written; child not invoked; no corrupted document reported as success |

### Expected result:
`isError === true`; exact error message; no side effects.

### Author's Notes
- **Deferral reason**: error path — the invalid-content_base64 error path was not previously authored as a standalone case. This case authors the error path documentation and test logic for future execution.
- **Substitute evidence**: `evidence/E2E-API-16-invalid-base64.txt` — the invalid-base64 rejection documentation for future feature activation.
- **Relation to E2E-API-15**: E2E-API-15 covers missing-content error (no content provided); E2E-API-16 covers invalid-content_base64 error (content provided but malformed). Both are E2E API error-handling surfaces, but at different failure modes: no content vs bad content.
- **Automation**: The test case authoring includes steps 1-2 from the original E2E-API-16 specification. The test itself will execute with malformed content_base64 and verify the exact error message and no side effects.

### Verification Checklist (Post-Author)
- [x] E2E-API-16.md (or extracted_e2e.json section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 2 steps (execute + verify no side effects)
- [x] Deferral reason resolved: error path → authored
- [x] Substitute evidence referenced from extracted_e2e.json (`evidence/E2E-API-16-invalid-base64.txt`)
- [x] Evidence capture section populated (evidence/E2E-API-16-invalid-base64.txt)
- [x] STATUS.json updated: casesCompleted incremented to 47, nextPriority indicates all E2E-API cases now complete or on-track, move to SIT cases
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | E2E-API-16 | Authored | error path → authored; invalid-content_base64 rejection: exact error message, no file written, child not invoked |
```

### Coordination Plan Reference
- **Current priority**: E2E-API-16 (E2E-API — error path, final of sixteen)
- **Next priority after E2E-API-16**: SIT-08 (first of three SIT cases)
- **Authoring group**: QA Agent — E2E-API error path cases
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the invalid-base64 rejection documentation. E2E-API sub-group complete.
- **Relation to checkpoint**: This is checkpoint #36 (out of planned sequence for E2E-API cases; error path sub-group complete; E2E-API total 16/16)

### Coordination Plan Reference (Updated)
- **Current priority**: E2E-API-16 (error path → now authored; E2E-API sub-group complete)
- **Next priority after E2E-API-16**: SIT-08 (first of three SIT test cases)
- **Authoring group**: QA Agent — E2E-API error path cases
- **Blocker**: None — substitute evidence noted; this case authors the invalid-base64 rejection documentation. E2E-API sub-group complete, proceeding to SIT cases.
- **Relation to checkpoint**: This is checkpoint #36 (out of planned sequence for E2E-API cases; error path sub-group complete; E2E-API total 16/16)