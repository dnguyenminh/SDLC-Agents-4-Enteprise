# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-253: Emit distinct symbol kinds per language so KB Graph node types are correct (all languages)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-253 |
| Title | Emit distinct symbol kinds per language so KB Graph node types are correct (all languages) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |

---

## Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 3 | 3 | 0 |
| UT | 12 | 12 | 0 |
| IT | 5 | 5 | 0 |
| E2E-API | 6 | 6 | 0 |
| E2E-UI | 2 | 2 | 0 |
| SIT | 2 | 0 | 2 |
| **Total** | **30** | **28** | **2** |

---

## Property-Based Tests

### PBT-01: graphTypeForKind mapping invariant

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Automated (fast-check) |
| **Traces To** | BRD Story 1, FSD UC-1 BR-2 |
| **Preconditions** | KIND_TO_TYPE initialized |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random known kind from set [apex_class, flow, sf_object, lwc_component, class, interface, enum] | - |
| 2 | Call graphTypeForKind(kind) | Returns uppercase string without spaces, deterministic |
| 3 | Repeat 1000 iterations | No failures, invariant holds |

**Test Data:** N/A
**Postconditions:** Mapping invariant holds

### PBT-02: Unknown kind fallback invariant

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Automated |
| **Traces To** | FSD UC-1 AF-1, EF-3 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate random random string not in KIND_TO_TYPE and not starting with pega_ | - |
| 2 | Call graphTypeForKind(kind) | Returns CODE_ENTITY |
| 3 | Verify warning logged | Warning logged |

### PBT-03: Pega prefix derivation invariant

| Attribute | Value |
|-----------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Type** | Automated |
| **Traces To** | FSD UC-1 AF-2, BR-4 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate strings matching pattern pega_[a-z_]+ | - |
| 2 | Call graphTypeForKind(kind) | Returns node type derived by stripping prefix and uppercasing |
| 3 | Verify 1:1 mapping preserved | Same input always same output |

---

## Unit Tests

### UT-01: graphTypeForKind apex_class mapping

| Attribute | Value |
|-----------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Unit / Functional |
| **Requirement** | UC-1, BR-2 |
| **Preconditions** | Constants loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call graphTypeForKind('apex_class') | Returns 'APEX_CLASS' |
| 2 | Verify no warning | - |

**Test Data:** kind='apex_class'
**Postconditions:** Node type correct

### UT-02: graphTypeForKind flow mapping

| Attribute | Value |
|-----------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-1, BR-2 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call graphTypeForKind('flow') | Returns 'FLOW' |

### UT-03: graphTypeForKind sf_object mapping

| Attribute | Value |
|-----------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-1, BR-2 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call graphTypeForKind('sf_object') | Returns 'SF_OBJECT' |

### UT-04: graphTypeForKind lwc_component mapping

| Attribute | Value |
|-----------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-1, BR-2 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call graphTypeForKind('lwc_component') | Returns 'LWC_COMPONENT' |

### UT-05: graphTypeForKind pega prefix mapping

| Attribute | Value |
|-----------|-------|
| **ID** | UT-05 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-1 AF-2, BR-4 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call graphTypeForKind('pega_rule_obj_flow') | Returns 'RULE_OBJ_FLOW' |

### UT-06: graphTypeForKind unknown fallback

| Attribute | Value |
|-----------|-------|
| **ID** | UT-06 |
| **Priority** | Medium |
| **Type** | Unit / Exception |
| **Requirement** | UC-1 EF-3 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call graphTypeForKind('unknown_xyz') | Returns 'CODE_ENTITY' |
| 2 | Verify warning logged | Warning present |

### UT-07: Salesforce meta parser emits sf_object

| Attribute | Value |
|-----------|-------|
| **ID** | UT-07 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-1, BR-1 |
| **Preconditions** | Test fixture object file present |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parse salesforce meta object file | Symbol kind = 'sf_object' |
| 2 | Verify no fallback to generic | Kind not 'class' |

### UT-08: Salesforce meta parser emits sf_field

| Attribute | Value |
|-----------|-------|
| **ID** | UT-08 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-1, BR-1 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parse field definition | Symbol kind = 'sf_field' |

### UT-09: Apex parser emits apex_class

| Attribute | Value |
|-----------|-------|
| **ID** | UT-09 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-1, BR-1 |
| **Preconditions** | Apex class file fixture |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parse Apex class | Symbol kind = 'apex_class' |

### UT-10: Apex parser emits trigger

| Attribute | Value |
|-----------|-------|
| **ID** | UT-10 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-1, BR-1 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parse trigger file | Symbol kind = 'trigger' |

### UT-11: CODE_KINDS includes new Salesforce kinds

| Attribute | Value |
|-----------|-------|
| **ID** | UT-11 |
| **Priority** | High |
| **Type** | Unit |
| **Requirement** | UC-1, BR-3 |
| **Preconditions** | graph-sync-service loaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check CODE_KINDS array | Contains apex_class, trigger, flow, sf_object, sf_field, lwc_component |
| 2 | Verify TYPE_Z map | Contains entries for APEX_CLASS, FLOW etc. |

### UT-12: Empty kind handling

| Attribute | Value |
|-----------|-------|
| **ID** | UT-12 |
| **Priority** | Medium |
| **Type** | Unit / Boundary |
| **Requirement** | UC-1 EF-1 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call graphTypeForKind('') | Returns CODE_ENTITY with warning |

---

## Integration Tests

### IT-01: syncProjectSymbols processes new kinds for project 7b11cdc169de

| Attribute | Value |
|-----------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-1, UC-2 |
| **Preconditions** | DB clean, project 7b11cdc169de symbols inserted |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call syncProjectSymbols('7b11cdc169de') | Completes without error |
| 2 | Query graph_nodes for project | Nodes with types APEX_CLASS, FLOW, SF_OBJECT, LWC_COMPONENT present |

**Test Data:** testdata/pre-seeded-data.csv
**Postconditions:** Nodes persisted

### IT-02: CODE_KINDS filter projects correct symbols

| Attribute | Value |
|-----------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-1 AF-3 |
| **Preconditions** | Symbols with kind not in CODE_KINDS |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Insert symbol with kind 'custom_unknown' | - |
| 2 | Run syncProjectSymbols | Symbol not projected to graph_nodes |

### IT-03: Pega kinds preserve 1:1 mapping

| Attribute | Value |
|-----------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Integration / Regression |
| **Requirement** | UC-3, BR-6 |
| **Preconditions** | Pega symbols present |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run syncProjectSymbols on Pega project | Node types unchanged |
| 2 | Compare before/after counts | No regression |

### IT-04: Graph sync failure non-fatal

| Attribute | Value |
|-----------|-------|
| **ID** | IT-04 |
| **Priority** | Medium |
| **Type** | Integration / Exception |
| **Requirement** | UC-1 EF-2 |
| **Preconditions** | DB error simulated |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger sync with DB error | Error logged, indexing continues |

### IT-05: TYPE_Z positioning for new node types

| Attribute | Value |
|-----------|-------|
| **ID** | IT-05 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | BR-3 |
| **Preconditions** | Nodes with new types synced |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Query graph_nodes z coordinate | Distinct z values for new types, no overlap |

---

## E2E API Tests

### E2E-API-01: Re-index project via API

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **File** | tests/e2e/salesforce-kinds.e2e.test.ts |
| **Traces To** | BRD Req 2, FSD UC-2 |
| **Preconditions** | Server running, JWT token available |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/projects/7b11cdc169de/reindex with Authorization header | HTTP 202 Accepted |
| 2 | Poll status until complete | Indexing completed |

**Test Data:** projectId=7b11cdc169de

### E2E-API-02: Graph query returns correct node types

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated |
| **File** | tests/e2e/graph-query.e2e.test.ts |
| **Traces To** | FSD UC-2, BR-5 |
| **Preconditions** | Project re-indexed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /api/graph/nodes?projectId=7b11cdc169de | HTTP 200 |
| 2 | Count node types | APEX_CLASS >0, FLOW >0, SF_OBJECT >0, LWC_COMPONENT >0 |
| 3 | Verify FUNCTION not dominant | FUNCTION count < 50% total |

### E2E-API-03: Unauthorized access denied

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High |
| **Type** | Security |
| **Traces To** | SECURITY-REVIEW Finding #1 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/projects/7b11cdc169de/reindex without token | HTTP 401 Unauthorized |

### E2E-API-04: Invalid projectId validation

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-04 |
| **Priority** | Medium |
| **Type** | Automated |
| **Traces To** | FSD API contract |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /api/projects/invalid/reindex | HTTP 400 Bad Request |

### E2E-API-05: Unknown kind fallback logged

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-05 |
| **Priority** | Medium |
| **Type** | Automated |
| **Traces To** | FSD EF-3 |
| **Preconditions** | Symbol with unknown kind inserted |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger sync | Warning logged, node type CODE_ENTITY |

### E2E-API-06: Backward compatibility Pega mapping

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-06 |
| **Priority** | High |
| **Type** | Regression |
| **Traces To** | FSD UC-3, BR-6 |
| **Preconditions** | Pega project indexed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /api/graph/nodes?projectId=pega-project | Node types unchanged |
| 2 | Compare snapshot | No breaking changes |

---

## E2E UI Tests

### E2E-UI-01: Graph visualization shows distinct node colors

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-01 |
| **Priority** | Medium |
| **Type** | Automated (Playwright) |
| **Feature File** | tests/e2e/graph.ui.e2e.test.ts |
| **Traces To** | FSD UC-2 |
| **Preconditions** | Project re-indexed, UI accessible |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to /graph?project=7b11cdc169de | Page loads |
| 2 | Verify nodes colored by type | APEX_CLASS nodes have distinct color |

### E2E-UI-02: Filter by node type works

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-02 |
| **Priority** | Medium |
| **Type** | Automated |
| **Feature File** | tests/e2e/graph.ui.e2e.test.ts |
| **Traces To** | FSD UC-2 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click filter FLOW | Only FLOW nodes visible |
| 2 | Count visible nodes | >0 |

---

## Manual SIT Tests

### SIT-01: Manual verification of node distribution

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | Manual |
| **Requirement** | UC-2, BR-5 |
| **Preconditions** | Project 7b11cdc169de re-indexed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open graph visualization | - |
| 2 | Manually inspect node type legend | Multiple types present, FUNCTION not dominant |
| 3 | Export node count report | Matches expected distribution |

**Test Data:** Project 7b11cdc169de
**Postconditions:** Verification complete

### SIT-02: Visual check of 3D positioning for new types

| Attribute | Value |
|-----------|-------|
| **ID** | SIT-02 |
| **Priority** | Medium |
| **Type** | Manual |
| **Requirement** | BR-3 |
| **Preconditions** | Nodes synced |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Rotate 3D graph view | New node types positioned without overlap |
| 2 | Check z-layer separation | Visual separation clear |

---

## Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| Parser emits distinct symbol kinds per language | BRD Story 1, FSD BR-1 | UT-07, UT-08, UT-09, UT-10, PBT-01 | ✅ |
| KIND_TO_TYPE mapping updated | FSD BR-2 | UT-01, UT-02, UT-03, UT-04, PBT-01 | ✅ |
| CODE_KINDS filter and TYPE_Z updated | FSD BR-3 | UT-11, IT-05 | ✅ |
| Backward compatibility Pega | FSD BR-4, BR-6 | UT-05, IT-03, E2E-API-06 | ✅ |
| KB Graph shows multiple correct node types | FSD UC-2, BR-5 | IT-01, E2E-API-02, SIT-01 | ✅ |
| Node distribution not dominated by FUNCTION | FSD BR-5 | E2E-API-02, SIT-01 | ✅ |
| Unknown kind fallback to CODE_ENTITY | FSD EF-3 | UT-06, PBT-02, E2E-API-05 | ✅ |
| Re-index project 7b11cdc169de | BRD Story 2 | E2E-API-01, IT-01 | ✅ |
