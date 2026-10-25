### E2E-API-01: Catalogue invariant — zero new tools versus baseline

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Level / Type** | E2E-API — invariant (automated) |
| **Requirement** | STORY 5 (AC-5.1, AC-5.2) · UC-05 · BR-20 · NFR-13 · TD-10 |
| **Preconditions** | Backend + child running current code; baseline `tools/list` captured **before** any export |
| **Test data** | Baseline name set vs post-change name set; forbidden names: `export_docx_proxied`, `content_proxy`, `fetch_artifact` (BR-20) |
| **Automation** | `backend/tests/e2e-api/content-proxy.catalog.e2e.test.ts` — authored |
| **Status** | Authored (completed — deferred spec now authored) |
| **Deferral reason resolved** | invariant → authored; catalogue invariant now authored: zero new tools versus baseline (adaptation rewrites definitions in place, no additions/removals/renames) |
| **Substitute evidence** | `evidence/E2E-API-01-catalogue-diff.txt` |
| **Evidence (to capture)** | `evidence/E2E-API-01-catalogue-diff.txt` |

### Steps:

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `tools/list` → snapshot the name set | Set captured before any adaptation is observable |
| 2 | Run one wrapper-mode export (any format) | Export succeeds |
| 3 | `tools/list` again; diff the name sets | **Zero** additions, zero removals, zero renames — adaptation rewrites definitions in place |
| 4 | Search the catalogue for TD-10 tools (`jira_create_issue`, `confluence_create_page`, `mem_ingest`) | Still present with **unchanged** schemas (over-detection regression guard, RK-09) |

### Expected result:
Zero additions, zero removals, zero renames — the catalogue invariant is preserved after adaptation.

### Author's Notes
- **Deferral reason**: invariant — the catalogue invariant was not previously authored as a standalone case. This case authors the invariant documentation and test logic for future execution.
- **Substitute evidence**: `evidence/E2E-API-01-catalogue-diff.txt` — the catalogue invariant documentation for future feature activation.
- **Relation to PBT-06**: PBT-06 covers PBT correctness properties; E2E-API-01 covers E2E API invariant. Both are verification surfaces ensuring the system behaves correctly under adaptation, but at different integration levels (property-based test vs end-to-end API).
- **Automation**: The test case authoring includes steps 1-4 from the original E2E-API-01 specification. The test itself will run `tools/list` before and after export and verify the catalogue is unchanged.

### Verification Checklist (Post-Author)
- [x] E2E-API-01.md (or extracted_e2e.json section) exists with full case detail
- [x] Has ID, Priority, Level/Type, Requirement, Preconditions, Test data fields
- [x] Steps table populated with 4 steps (snapshot + export + diff + regression guard)
- [x] Deferral reason resolved: invariant → authored
- [x] Substitute evidence referenced from extracted_e2e.json (`evidence/E2E-API-01-catalogue-diff.txt`)
- [x] Evidence capture section populated (evidence/E2E-API-01-catalogue-diff.txt)
- [x] STATUS.json updated: casesCompleted incremented to 44, nextPriority set to E2E-API-14 (or appropriate next)
- [x] RUN-LOG.md appended with completion entry

### RUN-LOG Entry (to append)
```
| 2026-10-25 | QA Agent (subagent) | E2E-API-01 | Authored | invariant → authored; catalogue invariant: zero new tools versus baseline (adaptation rewrites definitions in place) |
```

### Coordination Plan Reference
- **Current priority**: E2E-API-01 (E2E-API — invariant, highest priority)
- **Next priority after E2E-API-01**: E2E-API-14 (direct call keeps original response shape)
- **Authoring group**: QA Agent — E2E-API invariant cases
- **Blocker**: None — substitute evidence will be captured at execution; this case authors the catalogue invariant documentation. E2E-API sub-group starting.
- **Relation to checkpoint**: This is checkpoint #33 (out of planned sequence for E2E-API cases; invariant sub-group complete)

### Coordination Plan Reference (Updated)
- **Current priority**: E2E-API-01 (invariant → now authored)
- **Next priority after E2E-API-01**: E2E-API-14 (direct call compatibility)
- **Authoring group**: QA Agent — E2E-API invariant cases
- **Blocker**: None — substitute evidence noted; this case authors the catalogue invariant documentation. E2E-API sub-group started.
- **Relation to checkpoint**: This is checkpoint #33 (out of planned sequence for E2E-API cases; invariant sub-group complete)