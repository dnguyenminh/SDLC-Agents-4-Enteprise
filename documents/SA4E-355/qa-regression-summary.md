# QA Regression Summary — SA4E-355

**Date:** 2026-10-12  
**Phase:** Phase 6 Testing — Governance-focused regression  
**Executor:** QA Agent  
**Scope:** Vitest suites matching `context-governance context-budget scoped-steering role-scope compression-wiring tool-loadout budget-gate session-tier session-budget adapter-wiring` in `extension/`

## Execution Overview
- **Command:** `npx vitest run context-governance context-budget scoped-steering role-scope compression-wiring tool-loadout budget-gate session-tier session-budget adapter-wiring`
- **Test files:** 23 passed
- **Test cases:** 148 passed / 0 failed
- **Duration:** 11.64s

## STC Coverage Updated
Test report `TEST-REPORT-SA4E-355.csv` updated for governance-focused STCs.

### STC IDs set to PASS (35)
- Happy Path: STC-001, STC-002, STC-003, STC-004, STC-005, STC-006, STC-007, STC-008, STC-009, STC-010, STC-011, STC-012, STC-013, STC-015, STC-016, STC-017
- Alternative Flows: STC-100, STC-101, STC-103, STC-104, STC-105, STC-106, STC-107, STC-108, STC-110, STC-111
- Business Rules / PBT: STC-300, STC-301, STC-302, STC-303, STC-304, STC-305, STC-306, STC-307, STC-309

**Columns updated:** Status → PASS, Actual_Result → 'Test passed in vitest regression run 2026-10-12', Executed_By → QA Agent, Executed_Date → 2026-10-12

## Test File Results
- `context-governance.e2e.test.ts` → STC-700, STC-701, STC-702 ×3
- `context-governance-matrix.integration.test.ts` → STC-111, STC-016 ×3, STC-017, STC-600, STC-603
- `compression-wiring.test.ts` → STC-008, STC-105, STC-405
- `role-scope-wiring.test.ts` → STC-006, STC-305, STC-202
- `session-tier-wiring.test.ts` → STC-313, STC-106, STC-013, STC-015
- `context-governance-incident.integration.test.ts` → STC-207, STC-206, STC-307
- `adapter-wiring-session.test.ts` → STC-309
- `context-governance-turn1.integration.test.ts` → STC-011, STC-012, STC-309
- `context-governance-escalation.integration.test.ts` → STC-110, STC-205, STC-306
- `budget-gate-decisions.test.ts` → STC-011, STC-012, STC-310/401
- `scoped-steering.test.ts` → STC-007, STC-103, STC-104, STC-018, STC-303, STC-202, STC-305
- `tool-loadout-roles.test.ts` → STC-009, STC-010, STC-017, STC-107, STC-108
- `budget-gate-enforce.test.ts` → STC-206, STC-207, STC-201
- `session-budget-gate.test.ts` → STC-011, STC-110, STC-205, STC-206, STC-012
- `context-budget-resolver.test.ts` → STC-001, STC-002, STC-003, STC-004, STC-005, STC-100, STC-101, STC-200, STC-201, STC-111
- `tool-loadout-cap.test.ts` → STC-019, STC-204
- `context-budget-resolver.pbt.test.ts` → STC-300, STC-301, STC-302
- `tool-loadout-invariants.test.ts` → STC-304
- `budget-gate-escalation.test.ts` → STC-205, STC-306
- `context-budget.test.ts` → STC-401, STC-402, STC-403
- `role-scope.test.ts`, `tool-loadout-estimator.test.ts` → supporting

## Notes
- No production code modified.
- `vitest.config.ts` untouched.
- SA4E-356 files not touched.
- No git commit performed.
- STC-014, STC-102, STC-109, STC-308 not covered in this run → remain NOT_RUN.

## Conclusion
Governance-focused regression passes completely. 35 STC records updated in TEST-REPORT-SA4E-355.csv. Ready for next phase.
