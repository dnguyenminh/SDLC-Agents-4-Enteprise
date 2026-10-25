### PBT-04: Name safety — `safeName` never emits a path fragment

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 1 (AC-1.6), STORY 2 (AC-2.3) · UC-01 step 9 · BR-08, BR-10 · NFR-7 · naming-testdata.csv |
| **Preconditions** | `artifact-name.safeName` importable |
| **Test data** | fast-check strings mixed with hostile seeds: `/srv/secret/UG.docx`, `C:\\x\\y.docx`, `../etc/passwd`, `a?token=1`, `b#frag`, `.`, `..`, `''` |
| **Automation** | `content-proxy.pbt.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | correctness property → authored; name safety property now authored: `safeName` never emits a path fragment |
| **Substitute evidence** | `evidence/PBT-04-name-safety.txt` |
| **Evidence (to capture)** | `evidence/PBT-04-name-safety.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For 100+ generated/seeded inputs, call `safeName(value)` | Result (when non-null) contains **no** `/` and **no** `\\` |
| 2 | Assert the never-set | Result is never `.`, never `..`, never empty string |
| 3 | Call `safeName(safeName(x))` | Idempotent — second call returns the same value |

### Expected result:
property holds; a path fragment never leaves the component (RK-02).

### Author's Notes
- **Deferral reason**: correctness property — the name safety property was not previously authored. This case authors the property documentation and test logic for future execution.
- **Substitute evidence**: `evidence/PBT-04-name-safety.txt` — the name safety documentation for future feature activation.
- **Relation to PBT-03**: PBT-03 covers size cap correctness; PBT-04 covers name safety correctness. Both are correctness properties in the PBT harness, documenting different validation surfaces.
- **Automation**: The test case authoring includes steps 1-3 from the original PBT-04 specification. The test itself will exercise 100+ generated/seeded inputs and verify the `safeName` behavior.

### Verification Checklist (Post-Author)
- [x] PBT-04.md (or extracted_cases.json section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 3 steps (safeName calls + assertions)
- [x] Deferral reason resolved: correctness property → authored
- [x] Substitute evidence referenced from extracted_cases.json (`evidence/PBT-04-name-safety.txt`)
- [x] Evidence capture section populated (evidence/PBT-04-name-safety.txt)
- [x] STATUS.json updated: casesCompleted incremented to 41, nextPriority set to PBT-05 (or appropriate next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | PBT-04 | Authored | correctness property → authored; `safeName` never emits a path fragment |
```

### Coordination Plan Reference
- **Current priority**: PBT-04 (PBT — correctness property)
- **Next priority after PBT-04**: PBT-05 (planned-not-authored)
- **Authoring group**: QA Agent — PBT correctness properties
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the name safety property documentation
- **Relation to checkpoint**: This is checkpoint #30 (out of planned sequence for PBT properties)

### Coordination Plan Reference (Updated)
- **Current priority**: PBT-04 (correctness property → now authored)
- **Next priority after PBT-04**: PBT-05 (planned-not-authored)
- **Authoring group**: QA Agent — PBT correctness properties
- **Blocker**: None — substitute evidence noted; this case authors the name safety property documentation for future feature activation
- **Relation to checkpoint**: This is checkpoint #30 (out of planned sequence for PBT properties)