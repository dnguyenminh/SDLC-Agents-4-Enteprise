# BA Review — Test Cases SA4E-386

**Reviewer:** BA Agent  
**Date:** 2026-10-28  
**Ticket:** SA4E-386 — Pin Node.js to 22.23.4 to Patch CVE-2026-111497 and Related Highs; retire legacy `better-sqlite3` build workflow CR-01  
**Documents reviewed:**
- `documents/SA4E-386/BRD.md` v1.0
- `documents/SA4E-386/FSD.md` v1.3
- `documents/SA4E-386/STP.md` v1.0
- `documents/SA4E-386/STC.md` v1.0

## Review Scope

1. Business coverage: every BRD FR-01..FR-16 and AC-01..AC-08 has at least one test case.
2. Business rules BR-01..BR-30 covered.
3. Test oracles match FSD v1.3 for 18 artifacts, 15 workflows, `.nvmrc` 8-byte contract, digest pinning, CR-01 removal.
4. No out-of-scope tests.

## 1. Business Coverage — FR / AC

| Requirement | Coverage in STC | Test Cases |
|-------------|----------------|------------|
| FR-01 Root `package.json` engines | ✅ | PBT-01, UT-01, IT-02, IT-10 |
| FR-02 backend/package.json engines | ✅ | PBT-01, UT-01, IT-02, IT-08 |
| FR-03 `.nvmrc = 22.23.4` | ✅ | PBT-02, UT-02, IT-02 |
| FR-04 Dockerfile NODE_VERSION + real digest | ✅ | PBT-04, UT-04, UT-05, IT-02, E2E-API-01 |
| FR-05 Dockerfile CVE comment | ✅ | UT-04, IT-02 |
| FR-06 27 `node-version` literals | ✅ | PBT-03, UT-03, IT-04, SIT-05 |
| FR-07 Matrix handling | ✅ | UT-03, IT-06 |
| FR-08 Review of build-push-backend.yml / scheduled-prebuild-scan.yml | ✅ | IT-04, IT-02 |
| FR-09 Grep clean of 22.x / '22' / "22" | ✅ | PBT-05, UT-08, IT-05 |
| FR-10 docker build --target production succeeds | ✅ | E2E-API-01, IT-09 |
| FR-11 Optional Trivy scan, claim restated M1∧M2∧M3 | ✅ | UT-06, SIT-07 |
| FR-12 Branch + per-file staging + exact commit subject | ✅ | IT-01, SIT-01, SIT-04 |
| FR-13 PR against main, no direct push | ✅ | SIT-01 |
| FR-14 Delete build-native.yml | ✅ | IT-05, IT-01, SIT-02 |
| FR-15 auto-release.yml trigger list = 1 item | ✅ | UT-09, IT-02 |
| FR-16 scheduled-prebuild-scan.yml simplified, ONNX preserved | ✅ | UT-10, IT-06, SIT-05 |

All 16 FRs are covered.

Acceptance Criteria:

| AC | Coverage |
|----|----------|
| AC-01 engines exact range | PBT-01, PBT-05, UT-01, IT-02, IT-10 ✅ |
| AC-02 `.nvmrc` byte-exact | PBT-02, UT-02, IT-02, SIT-08 ✅ |
| AC-03 Dockerfile version + digest | PBT-04, UT-04, UT-05, IT-12, E2E-API-01, E2E-API-05 ✅ |
| AC-04 CI workflows use 22.23.4 | PBT-03, PBT-05, UT-03, IT-03, IT-04, SIT-05 ✅ |
| AC-05 Build succeeds, no High CVE from base | IT-09, E2E-API-01/02/03/04, SIT-07 ✅ |
| AC-06 PR opened, no direct push | IT-01, SIT-01, SIT-04 ✅ |
| AC-07 No out-of-scope changes | IT-01, IT-08, IT-13, SIT-01 ✅ |
| AC-08 No reference to build-native / better-sqlite3 | IT-05, IT-07, UT-08, UT-09, UT-10, SIT-02 ✅ |

All 8 ACs are covered.

## 2. Business Rules BR-01..BR-30

RTM §7.4 lists BR-01..BR-30 with test cases assigned. Spot checks:

- BR-01 single source of truth: PBT-01, IT-04, IT-10 ✅
- BR-08 `.nvmrc` 8 bytes `22.23.4\n`, no BOM/CRLF/v/range: PBT-02, UT-02, IT-02 ✅
- BR-10 digest resolved at implementation time: PBT-04, SIT-01 ✅
- BR-11 digest format `sha256:` + 64 hex: PBT-04, UT-05, IT-02 ✅
- BR-12 FROM lines untouched: UT-04, IT-02, IT-06 ✅
- BR-15 quote style preserved: PBT-03, UT-03, IT-04 ✅
- BR-16 matrix preserved: UT-03, IT-06, IT-04 ✅
- BR-19 forbidden-literal classifier: PBT-05, UT-08, IT-05 ✅
- BR-20 NOT_EXECUTED distinct from PASS: UT-07 ✅
- BR-29 better-sqlite3 never added: IT-07, IT-01, SIT-01 ✅
- BR-30 ONNX capability preserved: UT-10, IT-06, E2E-API-02, SIT-05 ✅

All 30 business rules are covered with at least one test case. No rule is unmapped.

## 3. Oracles vs FSD v1.3

### 18 artifacts / 17 modified + 1 deleted
- FSD §1.2 scope amendment CR-01: 18 diff entries = 17 modified + 1 deleted.
- STC IT-01 Scope gate checks residual set = 18 entries: 17 `M` + 1 `D`. ✅
- The allow-list in STP §4.4 and STC IT-01 matches FSD §13.6.3.

### 15 workflows post CR-01
- FSD v1.3 §1.2.1: `build-native.yml` deleted → 15 workflow files remain.
- STC IT-03 enumerates 15 files. IT-04 census: 28 `node-version` keys = 27 literals + 1 matrix expression. ✅

### `.nvmrc` 8-byte contract
- FSD §3.3 DISC-3: exactly `22.23.4\n` = 8 bytes `32 32 2E 32 33 2E 34 0A`.
- STC PBT-02 validates byte contract, UT-02 checks length=8 and hex, IT-02 runs on real tree. ✅

### Digest pinning
- FSD FR-04, BR-10/BR-11.
- STC PBT-04 normalises digest, UT-05 validates format and equality, IT-12 checks assertion exists, E2E-API-05 proves substitution is rejected. ✅

### CR-01 removal
- FR-14/FR-15/FR-16, AC-08, BR-29/BR-30.
- STC IT-05 AC-08 sweep `exit 1 = PASS`, UT-09 trigger list =1, UT-10 ONNX preservation byte-diff, SIT-02 remote listing. ✅

All oracles align with FSD v1.3.

## 4. Scope Discipline — Out-of-Scope Tests

- E2E-UI: 0 cases, explicitly documented as not applicable. STP §2.1.1 and STC §5 confirm no UI surface.
- Business code: No test cases target application logic. STC §3.2 lists features out of scope and confirms no dependency upgrades, no major Node upgrade, no extension/package.json edits.
- Scope gate IT-01 enforces 18-entry allow-list and rejects extra files. ✅

No out-of-scope tests identified.

## 5. Observations

- Coverage is complete and traceability is bidirectional: requirements → cases and FSD TC-01..TC-46 → cases. RTM §7.7 shows 125/125 coverage.
- Residual gaps are declared in STC §9.2 and are compensating controls, not coverage holes: fabricated-but-well-formed digest, comment meaning, delayed scheduled scan, nvm absent, etc.
- Inverted-oracle semantics are tested in UT-08, preventing false PASS on missing matches.

## Verdict

**APPROVED**

All BRD functional requirements FR-01..FR-16 and acceptance criteria AC-01..AC-08 are covered. All FSD business rules BR-01..BR-30 are covered. Test oracles match FSD v1.3 for artifact count, workflow count, `.nvmrc` byte contract, digest pinning and CR-01 removal. No out-of-scope tests are present.

The QA deliverables are ready for implementation gate G0–G8.

---
*This review does not modify STP/STC.*
