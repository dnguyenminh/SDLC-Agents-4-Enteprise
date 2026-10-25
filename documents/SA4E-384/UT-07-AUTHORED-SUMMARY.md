### UT-07: Override `fileOutput: true` enables inlining for a non-convention tool

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | Medium |
| **Level / Type** | UT — override behaviour (automated) |
| **Requirement** | STORY 6 (AC-6.4) · UC-05 AF-5 · BR-04 |
| **Preconditions** | Override `{ make_bundle: { fileOutput: true } }` on a tool matching no prefix/description convention |
| **Test data** | `{ name: 'make_bundle', description: 'Builds a bundle', properties: { spec: 'string' } }` |
| **Automation** | `content-proxy.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | scope → authored; same empty-overrides table as UT-05; test case authored for override `fileOutput: true` enables inlining |
| **Substitute evidence** | TEST-REPORT §4.3 (scope) — deferral reason documented for future feature activation when `CONTENT_PROXY_OVERRIDES` table is populated |
| **Evidence (to capture)** | `evidence/UT-07-override-fileoutput.txt` |

**Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `detectCapability(make_bundle)` | Non-null with `fileOutput: true` — `x-output-base64` set downstream (UT-12) |

---

### Author's Notes

- **Deferral reason**: `scope` — the `CONTENT_PROXY_OVERRIDES` table ships empty (inert this release), same as UT-05. This case is authored to document the expected behaviour when overrides are activated.
- **Substitute evidence**: Referenced from SA4E-380 TEST-REPORT §4.3 (scope category). No executed test pins this behaviour — follow-up note added for when the overrides table is populated in a future release.
- **Relation to UT-05**: UT-05 covers `enabled: false` override; UT-06 covers `contentParam` force and `null` meaning; UT-07 covers `fileOutput: true` override. All three are scope-class cases documenting override behaviour for future feature activation.
- **Automation**: The test case authoring includes the single step from the original UT-07 specification. The test itself will be run when `CONTENT_PROXY_OVERRIDES` is configured with valid rows.

### Verification Checklist (Post-Author)

- [x] UT-07.md (or STC.md section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 1 step (`detectCapability(make_bundle)`)
- [x] Deferral reason resolved: scope → authored
- [x] Substitute evidence referenced from SA4E-380 TEST-REPORT §4.3
- [x] Evidence capture section populated (evidence/UT-07-override-fileoutput.txt)
- [x] STATUS.json updated: casesCompleted incremented to 13, nextPriority set to UT-08
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)

```
| 2026-10-25 | QA Agent (subagent) | UT-07 | Authored | scope → authored; same empty-overrides table as UT-05; test case authored for override fileOutput: true enables inlining; substitute evidence TEST-REPORT §4.3 (scope) — deferral reason documented for future feature activation |
```

---

### Coordination Plan Reference

- **Current priority**: UT-07 (Medium, scope deferral)
- **Next priority after UT-07**: UT-08 (covered-by-suite, alias priority)
- **Authoring group**: QA Agent — scope-class override test cases
- **Blocker**: `CONTENT_PROXY_OVERRIDES` table must be populated for these tests to execute
- **Relation to checkpoint**: This is checkpoint #2 (cases 13-13 out of 52 total)