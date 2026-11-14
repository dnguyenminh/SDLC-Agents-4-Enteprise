# Shared: Document Quality Gates — Post-Phase Verification

## Principle

After each sub-agent completes, SM MUST verify output before marking phase = done.

## Verification Process

1. READ the generated document
2. CHECK each item in the checklist
3. CHECK diagrams directory
4. VALIDATE drawio XML: no self-closing edges, no `<mxfile>` wrapper
5. VISION SELF-CHECK (MANDATORY): read PNG, check overlaps/clipped labels
6. Critical items missing → re-invoke agent (max 2 retries)
7. ONLY mark phase = done AFTER all Critical checks pass

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
| 4 | System Context Diagram | Critical |
| 5 | Sequence Diagram(s) | Critical |
| 6 | State Diagram | Critical |

## TDD Checklist (Phase 3)

| # | Check | Severity |
|---|---|---|
| 1 | TDD.md exists | Critical |
| 2 | Architecture Overview | Critical |
| 3 | Class/Module Design | Critical |
| 4 | Architecture Diagram | Critical |
| 5 | Component Diagram | Critical |

## STP/STC Checklist (Phase 4)

| # | Check | Severity |
|---|---|---|
| 1 | STP.md + STC.md exist | Critical |
| 2 | 6 test levels (PBT, UT, IT, E2E-API, E2E-UI, SIT) | Critical |
| 3 | RTM (Requirements Traceability Matrix) | Critical |

## UG Checklist (Phase 5.5)

| # | Check | Severity |
|---|---|---|
| 1 | UG.md exists | Critical |
| 2 | Installation/Quick Start | Critical |
| 3 | Real screenshots + User Actions tables (UG Writing Standard) | Critical |
| 4 | BA review completed | Critical |
| 5 | QA verification PASS | Critical |

## DPG Checklist (Phase 7)

| # | Check | Severity |
|---|---|---|
| 1 | DPG.md exists | Critical |
| 2 | Deployment Steps section | Critical |
| 3 | Rollback Plan section | Critical |

## ⛔ CRITICAL RULE

SM MUST run verification AFTER each sub-agent call. Pipeline mode = Phase 1 verify → Phase 2 verify → Phase 3 verify. Each phase MUST pass before proceeding.