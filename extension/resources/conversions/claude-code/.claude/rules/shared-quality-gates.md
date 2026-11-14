# Shared: Document Quality Gates — Post-Phase Verification

## Principle

**Sau khi mỗi sub-agent hoàn thành, SM PHẢI tự verify output trước khi đánh dấu phase = done.**

## Verification Process

```
After each sub-agent completes:

1. READ the generated document
2. CHECK each item in the checklist for that phase
3. CHECK diagrams directory
4. VALIDATE drawio XML: no self-closing edges, no <mxfile> wrapper
5. VISION SELF-CHECK (MANDATORY): read PNG, check overlaps/clipped labels
6. IF Critical items missing → re-invoke agent (max 2 retries)
7. REPORT verification result to user
8. ONLY mark phase = done AFTER all Critical checks pass
```

## BRD Checklist (Phase 1)

| # | Check | Severity |
|---|---|---|
| 1 | BRD.md exists | Critical |
| 2 | ≥3 User Stories with Acceptance Criteria | Critical |
| 3 | Business Flow Diagram (.drawio + .png) | Critical |
| 4 | Use Case Diagram (.drawio + .png) | Critical |
| 5 | Dependencies section | Minor |
| 6 | Non-Functional Requirements | Minor |

## FSD Checklist (Phase 2)

| # | Check | Severity |
|---|---|---|
| 1 | FSD.md exists | Critical |
| 2 | Use Cases with Main/Alt/Exception flows | Critical |
| 3 | Business Rules table (BR- IDs) | Critical |
| 4 | UI Specifications / Wireframes | Minor |
| 5 | System Context Diagram (.drawio + .png) | Critical |
| 6 | Sequence Diagram(s) (.drawio + .png) | Critical |
| 7 | State Diagram (.drawio + .png) | Critical |
| 8 | API Specifications (if applicable) | Minor |
| 9 | Error Handling section | Minor |

## TDD Checklist (Phase 3)

| # | Check | Severity |
|---|---|---|
| 1 | TDD.md exists | Critical |
| 2 | Architecture Overview | Critical |
| 3 | API Design section (if applicable) | Minor |
| 4 | Class/Module Design | Critical |
| 5 | Architecture Diagram (.drawio + .png) | Critical |
| 6 | Component Diagram (.drawio + .png) | Critical |
| 7 | Implementation Checklist | Minor |
| 8 | Error Handling section | Minor |
| 9 | Security Design section | Minor |

## STP/STC Checklist (Phase 4)

| # | Check | Severity |
|---|---|---|
| 1 | STP.md exists | Critical |
| 2 | STC.md exists | Critical |
| 3 | 6 test levels (PBT, UT, IT, E2E-API, E2E-UI, SIT) | Critical |
| 4 | RTM (Requirements Traceability Matrix) | Critical |
| 5 | CSV test data files | Minor |

## UG Checklist (Phase 5.5)

| # | Check | Severity |
|---|---|---|
| 1 | UG.md exists | Critical |
| 2 | Installation/Quick Start | Critical |
| 3 | Real screenshots + User Actions tables (UG Writing Standard) | Critical |
| 4 | Usage section with examples | Critical |
| 5 | Troubleshooting section | Minor |
| 6 | Error Codes table | Minor |
| 7 | BA review completed | Critical |
| 8 | QA verification PASS | Critical |

## DPG Checklist (Phase 7)

| # | Check | Severity |
|---|---|---|
| 1 | DPG.md exists | Critical |
| 2 | Deployment Steps section | Critical |
| 3 | Rollback Plan section | Critical |
| 4 | Pre-Deployment Checklist | Minor |
| 5 | Post-Deployment Verification | Minor |

## ⛔ CRITICAL RULE

SM PHẢI chạy verification SAU MỖI sub-agent call. Pipeline mode = Phase 1 verify → Phase 2 verify → Phase 3 verify. Mỗi phase PHẢI pass trước khi chuyển tiếp.