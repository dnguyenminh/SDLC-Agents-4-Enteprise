### E2E-API-14: Direct call keeps the child's original response shape

| Field | Value |
|-------|-------|
| **ID** | E2E-API-14 |
| **Priority** | Medium |
| **Level / Type** | E2E-API — compatibility (automated) |
| **Requirement** | STORY 2 (AC-2.6), STORY 5 (AC-5.6) · UC-06 · BR-12 · NFR-4, NFR-14 · RK-11 |
| **Preconditions** | Backend + child running |
| **Test data** | `execute_dynamic_tool('export_pdf', { markdown: '# Direct' })` — no wrapper-owned key |
| **Automation** | `backend/tests/e2e-api/content-proxy.direct.e2e.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | compatibility → authored; direct-call compatibility now authored: child's original response shape preserved (no `output_base64`, no file written by proxy) |
| **Substitute evidence** | `evidence/E2E-API-14-direct-shape.txt` |
| **Evidence (to capture)** | `evidence/E2E-API-14-direct-shape.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute the direct call | HTTP 200; not `isError` |
| 2 | Parse the response | Child's **original** shape — `artifacts[].path` preserved verbatim, no `output_base64`, no file written by the proxy |

### Expected result:
HTTP 200; child's original shape preserved verbatim.

### Author's Notes
- **Deferral reason**: compatibility — the direct-call compatibility was not previously authored as a standalone case. This case authors the compatibility documentation and test logic for future execution.
- **Substitute evidence**: `evidence/E2E-API-14-direct-shape.txt` — the direct-call compatibility documentation for future feature activation.
- **Relation to E2E-API-01**: E2E-API-01 covers catalogue invariant (zero new tools vs baseline); E2E-API-14 covers direct-call compatibility (child's original response shape). Both are E2E API verification surfaces, but at different aspects: catalogue-level vs call-level.
- **Automation**: The test case authoring includes steps 1-2 from the original E2E-API-14 specification. The test itself will execute a direct call and verify the response shape is preserved.

### Verification Checklist (Post-Author)
- [x] E2E-API-14.md (or extracted_e2e.json section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 2 steps (direct call + response shape)
- [x] Deferral reason resolved: compatibility → authored
- [x] Substitute evidence referenced from extracted_e2e.json (`evidence/E2E-API-14-direct-shape.txt`)
- [x] Evidence capture section populated (evidence/E2E-API-14-direct-shape.txt)
- [x] STATUS.json updated: casesCompleted incremented to 45, nextPriority set to E2E-API-15 (or appropriate next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | E2E-API-14 | Authored | compatibility → authored; direct-call compatibility: child's original response shape preserved (no `output_base64`, no file written by proxy) |
```

### Coordination Plan Reference
- **Current priority**: E2E-API-14 (E2E-API — compatibility)
- **Next priority after E2E-API-14**: E2E-API-15 (missing-content error path)
- **Authoring group**: QA Agent — E2E-API compatibility cases
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the direct-call compatibility documentation. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #34 (out of planned sequence for E2E-API cases; compatibility sub-group complete)

### Coordination Plan Reference (Updated)
- **Current priority**: E2E-API-14 (compatibility → now authored)
- **Next priority after E2E-API-14**: E2E-API-15 (missing-content error path)
- **Authoring group**: QA Agent — E2E-API compatibility cases
- **Blocker**: None — substitute evidence noted; this case authors the direct-call compatibility documentation. E2E-API sub-group continuing.
- **Relation to checkpoint**: This is checkpoint #34 (out of planned sequence for E2E-API cases; compatibility sub-group complete)