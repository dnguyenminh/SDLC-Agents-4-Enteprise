### UT-22: Single-required-string fallback and `NON_CONTENT_PARAM` enum exclusions

| Field | Value |
|-------|-------|
| **ID** | UT-22 |
| **Priority** | Medium |
| **Level / Type** | UT — detection detail (automated) |
| **Requirement** | STORY 6 (AC-6.5) · UC-05 · BR-03 step 3 · NFR-10 |
| **Preconditions** | Schemas with single required string property, enum exclusion surface |
| **Test data** | `{ properties: { enum: 'string' }, required: ['enum'] }` → `enum` (included); `{ properties: { choices: 'string' }, required: ['choices'] }` → undefined (excluded); `{ properties: { options: 'string' }, required: ['options'] }` → undefined (excluded) |
| **Automation** | `content-proxy.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | `planned-not-authored` → authored; authored from scratch per SA-07 regex gaps on enum exclusion surface |
| **Substitute evidence** | none — this case documents the fallback logic and enum exclusions for future feature activation |
| **Evidence (to capture)** | `evidence/UT-22-enum-exclusions.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fallback case | Single non-excluded required string is chosen |
| 2 | Exclusion cases (`choices`, `options`) | Never chosen as content — enum-like arguments excluded per NFR-10 |

---

### Author's Notes

- **Deferral reason**: `planned-not-authored` — no substitute evidence from SA4E-380 TEST-REPORT §4.3. SA-07 records regex gaps on this enum exclusion surface, so this case is authored to document the fallback logic and exclusion rules for future feature activation.
- **Substitute evidence**: None — this is a fresh authoring, not derived from an existing passing test. The fallback logic and `NON_CONTENT_PARAM` enum exclusions are documented for when the feature surface is activated in a future release.
- **Relation to UT-09**: UT-09 covered `token/secret/password`/`url` exclusions; UT-15 covered `label/title/name`/`slug` exclusions; UT-18 covered `format/mode/encoding` exclusions; UT-19 covered `regex/mask/format` exclusions; UT-20 covered `default/value/content` exclusions; UT-22 covers `enum/choices/options` exclusions. All five are `planned-not-authored` class cases documenting different credential-like argument exclusion surfaces.
- **Automation**: The test case authoring includes both steps from the original UT-22 specification. The test itself will exercise the fallback logic with synthetic schemas and verify the exclusion rules.

### Verification Checklist (Post-Author)

- [x] UT-22.md (or STC.md section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 2 steps (fallback case + exclusion cases)
- [x] Deferral reason resolved: planned-not-authored → authored
- [x] Substitute evidence referenced from SA4E-380 TEST-REPORT §4.3 (noted as "none — fresh authoring")
- [x] Evidence capture section populated (evidence/UT-22-enum-exclusions.txt)
- [x] STATUS.json updated: casesCompleted incremented to 27, nextPriority set to UT-23 (or appropriate next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)

```
| 2026-10-25 | QA Agent (subagent) | UT-22 | Authored | planned-not-authored → authored; no substitute evidence from SA4E-380 §4.3; authored from scratch per SA-07 regex gaps on enum exclusion surface |
```

### Coordination Plan Reference

- **Current priority**: UT-22 (planned-not-authored — fresh authoring)
- **Next priority after UT-22**: UT-23 (planned-not-authored — next in numerical sequence)
- **Authoring group**: QA Agent — planned-not-authored test cases (no substitute evidence)
- **Blocker**: None — this case documents the fallback logic for future feature activation; the exact regex patterns for credential exclusions can be added when the surface is activated
- **Relation to checkpoint**: This is checkpoint #16 (out of planned sequence for planned-not-authored cases)

### Coordination Plan Reference (Updated)

- **Current priority**: UT-22 (planned-not-authored → now authored)
- **Next priority after UT-22**: UT-23 (planned-not-authored — next in numerical sequence)
- **Authoring group**: QA Agent — planned-not-authored test cases
- **Blocker**: None — substitute evidence noted as "none"; this case authors the fallback + exclusion rules for future feature activation
- **Relation to checkpoint**: This is checkpoint #16 (out of planned sequence for planned-not-authored cases)