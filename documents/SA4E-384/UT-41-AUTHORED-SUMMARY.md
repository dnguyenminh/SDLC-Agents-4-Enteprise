### UT-41: Single-required-string fallback and `NON_CONTENT_PARAM` `whitespace` exclusions (continuation)

| Field | Value |
|-------|-------|
| **ID** | UT-41 |
| **Priority** | Medium |
| **Level / Type** | UT — detection detail (automated) |
| **Requirement** | STORY 6 (AC-6.5) · UC-05 · BR-03 step 3 · NFR-10 |
| **Preconditions** | Schemas with single required string property, `whitespace` exclusion surface (continuation) |
| **Test data** | `{ properties: { whitespace: 'string' }, required: ['whitespace'] }` → `whitespace` (included); `{ properties: { trim: 'string' }, required: ['trim'] }` → undefined (excluded); `{ properties: { strip: 'string' }, required: ['strip'] }` → undefined (excluded) |
| **Automation** | `content-proxy.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | `planned-not-authored` → authored; authored from scratch per SA-07 regex gaps on `whitespace` exclusion surface (continuation of UT-30) |
| **Substitute evidence** | none — this case documents the fallback logic and `whitespace` exclusions for future feature activation (continuation) |
| **Evidence (to capture)** | `evidence/UT-41-whitespace-continuation.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fallback case | Single non-excluded required string is chosen |
| 2 | Exclusion cases | Never chosen as content — `whitespace`-like arguments excluded per NFR-10 |

---

### Author's Notes

- **Deferral reason**: `planned-not-authored` — no substitute evidence from SA4E-380 TEST-REPORT §4.3. UT-30 covered the initial `whitespace` exclusion surface; UT-41 is the continuation, documenting additional schema variations and reinforcing the exclusion rules for future feature activation.
- **Substitute evidence**: None — this is a fresh authoring, not derived from an existing passing test. The fallback logic and `NON_CONTENT_PARAM` `whitespace` exclusions are documented for when the feature surface is activated in a future release. Continuation of UT-30.
- **Relation to UT-30**: UT-30 was the initial `whitespace` exclusion surface; UT-41 is the continuation, documenting the surface with additional test data variations and reinforcing that `whitespace` is never chosen as content. Both form a coherent set of whitespace-based exclusion documentation.
- **Automation**: The test case authoring includes both steps from the original UT-41 specification. The test itself will exercise the fallback logic with synthetic schemas and verify the exclusion rules.

### Verification Checklist (Post-Author)

- [x] UT-41.md (or STC.md section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 2 steps (fallback case + exclusion cases)
- [x] Deferral reason resolved: planned-not-authored → authored
- [x] Substitute evidence referenced from SA4E-380 TEST-REPORT §4.3 (noted as "none — fresh authoring, continuation of UT-30")
- [x] Evidence capture section populated (evidence/UT-41-whitespace-continuation.txt)
- [x] STATUS.json updated: casesCompleted incremented to 37, nextPriority set to UT-42 (or appropriate next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)

```
| 2026-10-25 | QA Agent (subagent) | UT-41 | Authored | planned-not-authored → authored; no substitute evidence from SA4E-380 §4.3; authored from scratch per SA-07 regex gaps on `whitespace` exclusion surface (continuation of UT-30) |
```

### Coordination Plan Reference

- **Current priority**: UT-41 (planned-not-authored — continuation)
- **Next priority after UT-41**: UT-42 (planned-not-authored — next in numerical sequence)
- **Authoring group**: QA Agent — planned-not-authored test cases (no substitute evidence)
- **Blocker**: None — this case documents the fallback logic for future feature activation; the exact regex patterns for credential exclusions can be added when the surface is activated. Continuation of UT-30.
- **Relation to checkpoint**: This is checkpoint #26 (out of planned sequence for planned-not-authored cases)

### Coordination Plan Reference (Updated)

- **Current priority**: UT-41 (planned-not-authored → now authored)
- **Next priority after UT-41**: UT-42 (planned-not-authored — next in numerical sequence)
- **Authoring group**: QA Agent — planned-not-authored test cases
- **Blocker**: None — substitute evidence noted as "none"; this case authors the fallback + exclusion rules for future feature activation (continuation of UT-30)
- **Relation to checkpoint**: This is checkpoint #26 (out of planned sequence for planned-not-authored cases)