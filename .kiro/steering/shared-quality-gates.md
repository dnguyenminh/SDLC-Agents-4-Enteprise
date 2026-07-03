# Shared: Document Quality Gates — Post-Phase Verification

## Principle

**Sau khi mỗi sub-agent hoàn thành, SM PHẢI tự verify output trước khi đánh dấu phase = done.**
SM KHÔNG ĐƯỢC tin tưởng output mà không kiểm tra.

## Verification Process

```
After each sub-agent completes:

1. READ the generated document
2. CHECK each item in the checklist for that phase
3. CHECK diagrams directory: listDirectory("documents/{TICKET}/diagrams/")
4. VALIDATE drawio XML: grep for self-closing edge cells
   (pattern: edge="1" followed by /> without <mxGeometry>)
   If found → re-invoke agent to fix before export
5. VALIDATE no <mxfile> wrapper: must start with <mxGraphModel>
   If wrapped → strip wrapper or re-invoke agent
6. IF Critical items missing:
   → Re-invoke agent with specific fix request
   → Re-verify after fix
   → Max 2 retry attempts
7. IF only Minor items missing:
   → Log as warning, proceed
8. REPORT verification result:
   "✅ BRD verified: 6/6 checks passed, 2 diagrams present"
   or
   "⚠️ FSD verified: 7/9 checks. Missing: sequence diagram. Requesting BA..."
9. ONLY mark phase = done AFTER all Critical checks pass
```

## BRD Checklist (Phase 1)

| # | Check | Severity | If Missing |
|---|-------|----------|------------|
| 1 | BRD.md exists | Critical | Re-invoke BA |
| 2 | ≥3 User Stories with Acceptance Criteria | Critical | Re-invoke BA |
| 3 | Business Flow Diagram (.drawio + .png) | Critical | Invoke BA for diagrams |
| 4 | Use Case Diagram (.drawio + .png) | Critical | Invoke BA for diagrams |
| 5 | Dependencies section | Minor | Ask BA to add |
| 6 | Non-Functional Requirements | Minor | Ask BA to add |

## FSD Checklist (Phase 2)

| # | Check | Severity | If Missing |
|---|-------|----------|------------|
| 1 | FSD.md exists | Critical | Re-invoke BA |
| 2 | Use Cases with Main/Alt/Exception flows | Critical | Re-invoke BA |
| 3 | Business Rules table (BR- IDs) | Critical | Re-invoke BA |
| 4 | UI Specifications / Wireframes | Minor | Ask BA to add |
| 5 | System Context Diagram (.drawio + .png) | Critical | Invoke BA for diagrams |
| 6 | Sequence Diagram(s) (.drawio + .png) | Critical | Invoke BA for diagrams |
| 7 | State Diagram (.drawio + .png) | Critical | Invoke BA for diagrams |
| 8 | API Specifications (if applicable) | Minor | Ask BA to add |
| 9 | Error Handling section | Minor | Ask BA to add |

## TDD Checklist (Phase 3)

| # | Check | Severity | If Missing |
|---|-------|----------|------------|
| 1 | TDD.md exists | Critical | Re-invoke SA |
| 2 | Architecture Overview | Critical | Re-invoke SA |
| 3 | API Design section (if applicable) | Minor | Ask SA to add |
| 4 | Class/Module Design | Critical | Re-invoke SA |
| 5 | Architecture Diagram (.drawio + .png) | Critical | Invoke SA for diagrams |
| 6 | Component Diagram (.drawio + .png) | Critical | Invoke SA for diagrams |
| 7 | Implementation Checklist | Minor | Ask SA to add |
| 8 | Error Handling section | Minor | Ask SA to add |
| 9 | Security Design section | Minor | Ask SA to add |

## STP/STC Checklist (Phase 4)

| # | Check | Severity | If Missing |
|---|-------|----------|------------|
| 1 | STP.md exists | Critical | Re-invoke QA |
| 2 | STC.md exists | Critical | Re-invoke QA |
| 3 | 6 test levels (PBT, UT, IT, E2E-API, E2E-UI, SIT) | Critical | Re-invoke QA |
| 4 | RTM (Requirements Traceability Matrix) | Critical | Re-invoke QA |
| 5 | Test Coverage Diagram (.drawio + .png) | Minor | Invoke QA for diagrams |
| 6 | Test Execution Flow Diagram (.drawio + .png) | Minor | Invoke QA for diagrams |
| 7 | CSV test data files | Minor | Re-invoke QA |

## UG Checklist (Phase 5.5)

| # | Check | Severity | If Missing |
|---|-------|----------|------------|
| 1 | UG.md exists | Critical | Re-invoke DEV |
| 2 | Installation/Quick Start | Critical | Ask DEV to add |
| 3 | Configuration Reference with tables | Critical | Ask DEV to add |
| 4 | Usage section with examples | Critical | Ask DEV to add |
| 5 | Troubleshooting section | Minor | Ask DEV to add |
| 6 | Error Codes table | Minor | Ask DEV to add |
| 7 | API Reference (if applicable) | Minor | Ask DEV to add |
| 8 | BA review completed | Critical | Invoke BA |
| 9 | QA verification PASS | Critical | Invoke QA |

## TEST-REPORT Checklist (Phase 6)

| # | Check | Severity | If Missing |
|---|-------|----------|------------|
| 1 | TEST-REPORT.md exists | Critical | Re-invoke QA |
| 2 | TEST-REPORT DOCX attached to Jira | Critical | Export + attach |

## DPG Checklist (Phase 7)

| # | Check | Severity | If Missing |
|---|-------|----------|------------|
| 1 | DPG.md exists | Critical | Re-invoke DevOps |
| 2 | Deployment Steps section | Critical | Re-invoke DevOps |
| 3 | Rollback Plan section | Critical | Re-invoke DevOps |
| 4 | Deployment Flow Diagram (.drawio + .png) | Minor | Invoke DevOps for diagrams |
| 5 | Rollback Flow Diagram (.drawio + .png) | Minor | Invoke DevOps for diagrams |
| 6 | Pre-Deployment Checklist | Minor | Ask DevOps to add |
| 7 | Post-Deployment Verification | Minor | Ask DevOps to add |

## Diagram Minimum Requirements

| Document | Required Diagrams | Format |
|----------|------------------|--------|
| BRD | business-flow + use-case | draw.io → PNG |
| FSD | system-context + sequence + state | draw.io → PNG |
| TDD | architecture + component | draw.io → PNG |
| STP | test-coverage + test-execution-flow | draw.io → PNG |
| DPG | deployment-flow + rollback-flow | draw.io → PNG |
| UG | None required | Markdown → DOCX |

## ⛔ Diagram Index (MANDATORY in every document with diagrams)

```markdown
### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | {Name} | [{name}.png](diagrams/{name}.png) | [{name}.drawio](diagrams/{name}.drawio) |
```

## ⛔ CRITICAL RULE

SM PHẢI chạy verification SAU MỖI sub-agent call. Pipeline mode = Phase 1 verify → Phase 2 verify → Phase 3 verify. Mỗi phase PHẢI pass trước khi chuyển tiếp.
