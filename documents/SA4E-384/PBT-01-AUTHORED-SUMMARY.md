### PBT-01: Base64 round trip — decoded content equals source text for arbitrary UTF-8

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 1 (AC-1.2), STORY 7 (AC-7.2) · UC-01 step 6, UC-07 Flow B · BR-02, BR-03 · NFR-5 · E-09 context |
| **Preconditions** | `detectCapability(EXPORT_DOCX)` returns `{ contentParam: 'markdown', fileOutput: true }`; `adaptInvocation` importable as a pure function |
| **Test data** | fast-check Unicode string generator (covers TD-08: `# Kiểm thử\r\n\r\n😀 emoji — "quotes"\r\n` shapes); payload = `Buffer.from(text).toString('base64')` |
| **Automation** | `content-proxy.pbt.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | correctness property → authored; Base64 round-trip property now authored: decoded content equals source text for arbitrary UTF-8 |
| **Substitute evidence** | To be captured at execution — vitest run log `evidence/PBT-01-roundtrip.txt` |
| **Evidence (to capture)** | `evidence/PBT-01-roundtrip.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For 100+ generated `text` values, call `adaptInvocation(cap, { content_base64: base64(text) })` | `invocation.error` undefined; `invocation.wrapperMode === true` |
| 2 | Read `invocation.args['markdown']` (the `x-content-param` target) | Value **===** the generated `text`, byte-for-byte after UTF-8 decode |
| 3 | Inspect `invocation.args` keys | `content_base64`, `output_path`, `file_path` absent (stripped) |

### Expected result:
Property holds for all runs; no counter-example retained.

### Postconditions:
none (pure function).

### Author's Notes
- **Deferral reason**: correctness property — the Base64 round-trip property was not previously authored. This case authors the property documentation and test logic for future execution.
- **Substitute evidence**: To be captured at execution via vitest. The property itself (byte-for-byte UTF-8 round-trip) is the substitute evidence for future feature activation.
- **Relation to PBT-02**: PBT-02 covers byte fidelity (inline → base64 → decode), while PBT-01 covers the fundamental Base64 round-trip. Both are correctness properties in the PBT harness.
- **Automation**: The test case authoring includes steps 1-3 from the original PBT-01 specification. The test itself will exercise 100+ generated values and verify the Base64 round-trip behavior.

### Verification Checklist (Post-Author)
- [x] PBT-01.md (or extracted_cases.json section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 3 steps (adaptInvocation + markdown read + args inspection)
- [x] Deferral reason resolved: correctness property → authored
- [x] Substitute evidence referenced from extracted_cases.json
- [x] Evidence capture section populated (evidence/PBT-01-roundtrip.txt)
- [x] STATUS.json updated: casesCompleted incremented to 39, nextPriority set to PBT-02 (already authored, so next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | PBT-01 | Authored | correctness property → authored; Base64 round-trip decoded content equals source text for arbitrary UTF-8 |
```

### Coordination Plan Reference
- **Current priority**: PBT-01 (PBT — correctness property)
- **Next priority after PBT-01**: PBT-02 (already authored, skip to PBT-03)
- **Authoring group**: QA Agent — PBT correctness properties
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the property documentation
- **Relation to checkpoint**: This is checkpoint #28 (out of planned sequence for PBT properties)

### Coordination Plan Reference (Updated)
- **Current priority**: PBT-01 (correctness property → now authored)
- **Next priority after PBT-01**: PBT-03 (planned-not-authored, skipping PBT-02 which is already authored)
- **Authoring group**: QA Agent — PBT correctness properties
- **Blocker**: None — substitute evidence noted; this case authors the Base64 round-trip property documentation
- **Relation to checkpoint**: This is checkpoint #28 (out of planned sequence for PBT properties)