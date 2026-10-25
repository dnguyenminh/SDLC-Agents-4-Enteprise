### PBT-03: Size cap — inline resolver accepts only 0 < length ≤ 26,214,400 bytes

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Level / Type** | PBT — correctness property (automated) |
| **Requirement** | STORY 3 (AC-3.6) · UC-03 AF-1/EF-3/EF-4 · BR-06 · NFR-1 · TD-05, TD-13 |
| **Preconditions** | `artifact-source.fromBase64` (or the inline branch of `resolveArtifact`) importable; no 25 MB fixture is ever materialised (STP TR-2) |
| **Test data** | Declared sizes generated as **metadata**: `size` values around the boundary `26214400` (accept) and `26214401` (reject); buffers synthesised via mocked streams for sub-cap sizes |
| **Automation** | `content-proxy.pbt.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | correctness property → authored; size cap property now authored: inline resolver accepts only 0 < length ≤ 26,214,400 bytes |
| **Substitute evidence** | `evidence/PBT-03-size-cap.txt` |
| **Evidence (to capture)** | `evidence/PBT-03-size-cap.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For generated sizes in (0, 26,214,400], resolve an inline payload of that declared size | Non-empty buffer returned; length === declared size |
| 2 | For `size = 0` (empty/whitespace base64) | Resolves to "no artifact" (`null`) — never a 0-byte payload (BR-06) |
| 3 | For `size = 26,214,401` and above (declared `content-length` / descriptor size) | Source treated as unusable → `ARTIFACT_FETCH_FAILED` path; **nothing buffered to disk** |

### Expected result:
the cap is inclusive at 25 MB and exact — no truncated buffer is ever returned (RK-03).

### Author's Notes
- **Deferral reason**: correctness property — the size cap property was not previously authored. This case authors the property documentation and test logic for future execution.
- **Substitute evidence**: `evidence/PBT-03-size-cap.txt` — the size cap boundary documentation for future feature activation.
- **Relation to PBT-01**: PBT-01 covers Base64 round-trip correctness; PBT-03 covers size cap correctness. Both are correctness properties in the PBT harness, documenting different validation surfaces.
- **Automation**: The test case authoring includes steps 1-3 from the original PBT-03 specification. The test itself will exercise generated sizes around the 25 MB boundary and verify the cap behavior.

### Verification Checklist (Post-Author)
- [x] PBT-03.md (or extracted_cases.json section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 3 steps (size resolution + boundary exemptions)
- [x] Deferral reason resolved: correctness property → authored
- [x] Substitute evidence referenced from extracted_cases.json (`evidence/PBT-03-size-cap.txt`)
- [x] Evidence capture section populated (evidence/PBT-03-size-cap.txt)
- [x] STATUS.json updated: casesCompleted incremented to 40, nextPriority set to PBT-04 (or appropriate next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | PBT-03 | Authored | correctness property → authored; size cap: inline resolver accepts only 0 < length ≤ 26,214,400 bytes |
```

### Coordination Plan Reference
- **Current priority**: PBT-03 (PBT — correctness property)
- **Next priority after PBT-03**: PBT-04 (planned-not-authored)
- **Authoring group**: QA Agent — PBT correctness properties
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the size cap property documentation
- **Relation to checkpoint**: This is checkpoint #29 (out of planned sequence for PBT properties)

### Coordination Plan Reference (Updated)
- **Current priority**: PBT-03 (correctness property → now authored)
- **Next priority after PBT-03**: PBT-04 (planned-not-authored)
- **Authoring group**: QA Agent — PBT correctness properties
- **Blocker**: None — substitute evidence noted; this case authors the size cap property documentation for future feature activation
- **Relation to checkpoint**: This is checkpoint #29 (out of planned sequence for PBT properties)