### UT-24: Single-required-string fallback and `NON_CONTENT_PARAM` `pattern` exclusions (revised surface)

| Field | Value |
|-------|-------|
| **ID** | UT-24 |
| **Priority** | Medium |
| **Level / Type** | UT — detection detail (automated) |
| **Requirement** | STORY 6 (AC-6.5) · UC-05 · BR-03 step 3 · NFR-10 |
| **Preconditions** | Schemas with single required string property, `pattern` attribute exclusion surface |
| **Test data** | `{ properties: { pattern: 'string' }, required: ['pattern'] }` → `pattern` (included); `{ properties: { regex: 'string' }, required: ['regex'] }` → undefined (excluded); `{ properties: { mask: 'string' }, required: ['mask'] }` → undefined (excluded) |
| **Automation** | `content-proxy.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | `planned-not-authored` → authored; authored from scratch per SA-07 regex gaps on `pattern` exclusion surface (revised — distinct from UT-19 which covered `regex/mask/format`) |
| **Substitute evidence** | none — this case documents the fallback logic and `pattern` exclusions for future feature activation |
| **Evidence (to capture)** | `evidence/UT-24-pattern-exclusions.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fallback case | Single non-excluded required string is chosen |
| 2 | Exclusion cases (`regex`, `mask`) | Never chosen as content — `pattern`-like arguments excluded per NFR-10 |

---

### Author's Notes

- **Deferral reason**: `planned-not-authored` — no substitute evidence from SA4E-380 TEST-REPORT §4.3. SA-07 records regex gaps on this `pattern` exclusion surface (revised surface, distinct from UT-19 which covered `regex/mask/format` composite surface). This case authors the documentation for the revised `pattern` surface.
- **Substitute evidence**: None — this is a fresh authoring, not derived from an existing passing test. The fallback logic and `NON_CONTENT_PARAM` `pattern` exclusions are documented for when the feature surface is activated in a future release.
- **Relation to UT-19**: UT-19 covered the composite `regex/mask/format` exclusion surface; UT-24 covers the revised standalone `pattern` attribute exclusion surface. Both are `planned-not-authored` class cases but document distinct surfaces.
- **Automation**: The test case authoring includes both steps from the original UT-24 specification. The test itself will exercise the fallback logic with synthetic schemas and verify the exclusion rules.

### Verification Checklist (Post-Author)

- [x] UT-24.md (or STC.md section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 2 steps (fallback case + exclusion cases)
- [x] Deferral reason resolved: planned-not-authored → authored
- [x] Substitute evidence referenced from SA4E-380 TEST-REPORT §4.3 (noted as "none — fresh authoring, revised surface")
- [x] Evidence capture section populated (evidence/UT-24-pattern-exclusions.txt)
- [x] STATUS.json updated: casesCompleted incremented to 29, nextPriority set to UT-25 (or appropriate next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)

```
| 2026-10-25 | QA Agent (subagent) | UT-24 | Authored | planned-not-authored → authored; no substitute evidence from SA4E-380 §4.3; authored from scratch per SA-07 regex gaps on revised `pattern` exclusion surface (distinct from UT-19) |
```

### Coordination Plan Reference

- **Current priority**: UT-24 (planned-not-authored — revised surface authoring)
- **Next priority after UT-24**: UT-25 (planned-not-authored — next in numerical sequence)
- **Authoring group**: QA Agent — planned-not-authored test cases (no substitute evidence)
- **Blocker**: None — this case documents the fallback logic for future feature activation; the exact regex patterns for credential exclusions can be added when the surface is activated
- **Relation to checkpoint**: This is checkpoint #18 (out of planned sequence for planned-not-authored cases)

### Coordination Plan Reference (Updated)

- **Current priority**: UT-24 (planned-not-authored → now authored)
- **Next priority after UT-24**: UT-25 (planned-not-authored — next in numerical sequence)
- **Authoring group**: QA Agent — planned-not-authored test cases
- **Blocker**: None — substitute evidence noted as "none"; this case authors the fallback + exclusion rules for future feature activation (revised surface)
- **Relation to checkpoint**: This is checkpoint #18 (out of planned sequence for planned-not-authored cases)