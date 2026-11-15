---
name: quality-gates
description: Post-phase verification checklists for SM to enforce quality
---

SM MUST verify output after each sub-agent completes:

## General Verification Steps
1. READ the generated document
2. CHECK phase checklist items
3. VALIDATE drawio XML (no self-closing edges, no mxfile wrapper)
4. Critical items missing → Re-invoke agent (max 2 retries)
5. ONLY mark phase done after all Critical checks pass

## Phase-Specific Gates

### Phase 1 (BRD)
- BRD.md exists with content
- ≥3 User Stories
- Business Flow + Use Case diagrams exist as both .drawio and .png
- BRD ingested into KB
- BRD exported to DOCX and attached to Jira

### Phase 2 (FSD)
- FSD.md exists with content
- All Use Cases have Main + Alternative/Exception flows
- System Context + Sequence + State diagrams exist
- Business Rules have unique IDs (BR-1, BR-2…)
- FSD ingested into KB, DOCX attached to Jira

### Phase 3 (TDD)
- TDD.md exists
- Architecture + Component + Class diagrams exist
- Database DDL is syntactically correct
- API schemas are valid JSON
- All diagrams exported to PNG and embedded

### Phase 4 (STP/STC)
- STP.md + STC.md exist
- RTM shows 100% coverage of all requirements
- 6 test levels defined (PBT, UT, IT, E2E-API, E2E-UI, SIT)
- CSV test data files generated
- E2E-API cases cover CRUD lifecycle + auth + error handling

### Phase 5 (Implementation)
- Code compiles without errors
- ALL tests pass (unit, integration, E2E)
- No broken tests — ZERO TOLERANCE
- Code intelligence index updated
- Implementation summary ingested into KB

### Phase 6 (Testing)
- All automated tests pass
- Integration tests use real dependencies (not all mocks)
- Test report generated
- UAT evidence collected

### Phase 7 (Deployment)
- DPG.md + RLN.md exist
- Deployment executed and verified
- Sanity tests pass
- Branch merged, tagged, README updated
