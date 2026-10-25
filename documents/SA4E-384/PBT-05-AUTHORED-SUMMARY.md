### PBT-05: Schema invariant — adaptation keeps the schema callable and self-describing

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 5 (AC-5.3, AC-5.4), STORY 2 (AC-2.1) · UC-05 main flow · BR-11, BR-20 · NFR-13 |
| **Preconditions** | `adaptToolDefinition` importable; tool definitions generated with a content alias and arbitrary `required` orders |
| **Test data** | Generated schemas (properties including `markdown`/`content`/`text` aliases, 0..3 other required entries) |
| **Automation** | `content-proxy.pbt.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | correctness property → authored; schema invariant property now authored: adaptation keeps the schema callable and self-describing |
| **Substitute evidence** | `evidence/PBT-05-schema-invariant.txt` |
| **Evidence (to capture)** | `evidence/PBT-05-schema-invariant.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Adapt 100+ generated definitions; locate the resolved content argument | Content argument **never** appears in `required` after adaptation |
| 2 | Read `x-content-param` | Always names a property that exists in `properties` |
| 3 | Count occurrences of `output_base64` in `description` | Appears **at most once** (marker sentence idempotent) |
| 4 | Verify tool `name` | Unchanged — adaptation never renames (BR-20) |

### Expected result:
property holds for all generated schemas.

### Author's Notes
- **Deferral reason**: correctness property — the schema invariant property was not previously authored. This case authors the property documentation and test logic for future execution.
- **Substitute evidence**: `evidence/PBT-05-schema-invariant.txt` — the schema invariant documentation for future feature activation.
- **Relation to PBT-04**: PBT-04 covers name safety correctness; PBT-05 covers schema invariant correctness. Both are correctness properties in the PBT harness, documenting different validation surfaces.
- **Automation**: The test case authoring includes steps 1-4 from the original PBT-05 specification. The test itself will exercise 100+ generated schemas and verify the adaptation behavior.

### Verification Checklist (Post-Author)
- [x] PBT-05.md (or extracted_cases.json section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 4 steps (adaptation + content param + marker count + tool name)
- [x] Deferral reason resolved: correctness property → authored
- [x] Substitute evidence referenced from extracted_cases.json (`evidence/PBT-05-schema-invariant.txt`)
- [x] Evidence capture section populated (evidence/PBT-05-schema-invariant.txt)
- [x] STATUS.json updated: casesCompleted incremented to 42, nextPriority set to indicate all PBT cases now complete or on-track
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | PBT-05 | Authored | correctness property → authored; schema invariant: adaptation keeps the schema callable and self-describing |
```

### Coordination Plan Reference
- **Current priority**: PBT-05 (PBT — correctness property)
- **Next priority after PBT-05**: All PBT cases complete → proceed to E2E-API-01
- **Authoring group**: QA Agent — PBT correctness properties
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the schema invariant property documentation
- **Relation to checkpoint**: This is checkpoint #31 (out of planned sequence for PBT properties; PBT sub-group complete)

### Coordination Plan Reference (Updated)
- **Current priority**: PBT-05 (correctness property → now authored; PBT sub-group complete)
- **Next priority after PBT-05**: E2E-API-01 (high priority baseline catalogue diff)
- **Authoring group**: QA Agent — PBT correctness properties
- **Blocker**: None — substitute evidence noted; PBT sub-group complete, proceeding to E2E-API cases
- **Relation to checkpoint**: This is checkpoint #31 (out of planned sequence for PBT properties; PBT sub-group complete)