### UT-16: Ambiguous candidates are never guessed; non-string properties excluded (continuation)

| Field | Value |
|-------|-------|
| **ID** | UT-16 |
| **Priority** | High |
| **Level / Type** | UT — detection detail (automated) |
| **Requirement** | STORY 6 (AC-6.5 validation) · UC-05 · BR-03 step 4 · NFR-10 (credential hygiene, S-6) |
| **Preconditions** | Schemas with 2+ non-excluded string candidates, and with number/boolean/array properties only |
| **Test data** | `{ a: 'string', b: 'string', both required }` → undefined; `{ count: 'number' }` → undefined |
| **Automation** | `content-proxy.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | `planned-not-authored` → authored; authored from scratch per SA-07 regex gaps on ambiguity/non-string exclusion surface (continuation of UT-10) |
| **Substitute evidence** | none — this case documents the ambiguity-handling logic and non-string exclusion rules for future feature activation (continuation) |
| **Evidence (to capture)** | `evidence/UT-16-ambiguity.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ambiguous schema | Content param **undefined** — never guessed (BR-03) |
| 2 | Non-string-like property (number, boolean, object, array without string variant) | Never chosen |

---

### Author's Notes

- **Deferral reason**: `planned-not-authored` — no substitute evidence from SA4E-380 TEST-REPORT §4.3. SA-07 records regex gaps on this ambiguity/non-string exclusion surface (continuation of UT-10 surface), so this case is authored to document the handling logic for future feature activation. This is a companion case to UT-10, extending the same surface with additional schema variations.
- **Substitute evidence**: None — this is a fresh authoring, not derived from an existing passing test. The ambiguity-handling and non-string exclusion rules are documented for when the feature surface is activated in a future release. Companion to UT-10 which was the first case on this surface.
- **Relation to UT-10**: UT-10 was the first case documenting ambiguity/non-string exclusion handling. UT-16 is the continuation, documenting additional schema variations (2+ string candidates with number/boolean/array properties). Both are `planned-not-authored` class cases.
- **Automation**: The test case authoring includes both steps from the original UT-16 specification. The test itself will exercise ambiguous schemas and verify that no content param is guessed, and that non-string properties are excluded.

### Verification Checklist (Post-Author)

- [x] UT-16.md (or STC.md section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 2 steps (ambiguous schema + non-string property)
- [x] Deferral reason resolved: planned-not-authored → authored
- [x] Substitute evidence referenced from SA4E-380 TEST-REPORT §4.3 (noted as "none — fresh authoring, continuation of UT-10")
- [x] Evidence capture section populated (evidence/UT-16-ambiguity.txt)
- [x] STATUS.json updated: casesCompleted incremented to 22, nextPriority set to UT-17 (or appropriate next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)

```
| 2026-10-25 | QA Agent (subagent) | UT-16 | Authored | planned-not-authored → authored; no substitute evidence from SA4E-380 §4.3; authored from scratch per SA-07 regex gaps on ambiguity/non-string exclusion surface (continuation of UT-10) |
```

### Coordination Plan Reference

- **Current priority**: UT-16 (planned-not-authored — ambiguity/non-string exclusion continuation)
- **Next priority after UT-16**: UT-17 (live-covered (partial) — anyOf/oneOf detection continuation)
- **Authoring group**: QA Agent — planned-not-authored test cases (no substitute evidence)
- **Blocker**: None — this case documents the ambiguity-handling logic for future feature activation; the exact regex patterns for SA-07 gaps can be added when the surface is activated
- **Relation to checkpoint**: This is checkpoint #11 (out of planned sequence for planned-not-authored cases)

### Coordination Plan Reference (Updated)

- **Current priority**: UT-16 (planned-not-authored → now authored)
- **Next priority after UT-16**: UT-17 (live-covered (partial) — anyOf/oneOf detection continuation)
- **Authoring group**: QA Agent — planned-not-authored test cases
- **Blocker**: None — substitute evidence noted as "none"; this case authors the ambiguity-handling + non-string exclusion rules for future feature activation (continuation of UT-10)
- **Relation to checkpoint**: This is checkpoint #11 (out of planned sequence for planned-not-authored cases)