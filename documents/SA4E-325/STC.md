# Software Test Cases (STC)

## SA4E-325: Pi Smart Context Retrieval for repos with thousands of files

## Document Information
| Field | Value |
| Jira Ticket | SA4E-325 |
| Author | QA Agent |
| Version | 1.0 |

## Test Case Summary
| Category | ID Range | Count |
| Functional — Happy Path | TC-001 to TC-099 | 3 |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 2 |
| Business Rule Validation | TC-300 to TC-399 | 3 |
| Boundary & Negative Testing | TC-400 to TC-499 | 4 |
| UI/UX Testing | TC-500 to TC-599 | 0 |
| Integration Testing | TC-700 to TC-799 | 6 |
| Regression Testing | TC-800 to TC-899 | 2 |

## 1. Functional Test Cases — Happy Path

### TC-001: Context Retrieval Before Session - Happy Path
| Field | Value |
| ID | TC-001 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1, BR-1, BR-2 |
| Preconditions | Query submitted, code_search available |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Submit query "review auth flow" with topK=20 | ContextRetriever executes code_search/mem_search |
| 2 | Verify session created | contextFiles populated with top 20 files |
| 3 | Check token count | Token usage <6000 |

Test Data: query="review auth flow", topK=20
Postconditions: Session created with relevant context

### TC-002: Progressive Disclosure Keeps Token Under 6k
| Field | Value |
| ID | TC-002 |
| Priority | High |
| Type | Functional |
| Requirement | UC-2, BR-3 |
| Preconditions | Repo with 1000 files |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Trigger retrieval on 1000-file repo | Three-tier disclosure applied |
| 2 | Measure token usage | Usage ≤6000 |

### TC-003: File Exclusion Prevents Irrelevant Paths
| Field | Value |
| ID | TC-003 |
| Priority | Medium |
| Type | Functional |
| Requirement | UC-3 |
| Preconditions | Repo contains .git, node_modules |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Run ContextRetriever | .git, node_modules, out, dist not in contextFiles |

## 2. Alternative Flows

### TC-101: GLOBAL Intent Uses Summary-Tree
| Field | Value |
| ID | TC-101 |
| Priority | High |
| Type | Functional Alternative |
| Requirement | UC-1 AF-1 |
| Preconditions | Intent classified GLOBAL |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Submit GLOBAL query | summary-tree returned instead of per-file scan |

### TC-102: Search Timeout Fallback
| Field | Value |
| ID | TC-102 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | UC-1 AF-2 |
| Preconditions | code_search timeout simulated |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Trigger retrieval with timeout | Fallback to summary-tree, warning shown |

## 3. Exception/Error Flows

### TC-201: No Results Returns Empty Context With Warning
| Field | Value |
| ID | TC-201 |
| Priority | Medium |
| Type | Exception |
| Requirement | UC-1 EF-1 |
| Preconditions | Query with no matches |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Submit query with zero matches | Empty contextFiles, warning logged |

### TC-202: Search Service Timeout
| Field | Value |
| ID | TC-202 |
| Priority | Medium |
| Type | Exception |
| Requirement | Error Handling |
| Preconditions | Timeout configured |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Trigger retrieval | Fallback to summary-tree |

## 4. Business Rule Validation

### TC-301: topK <=20 Enforced
| Field | Value |
| ID | TC-301 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-1 |
| Preconditions | Request with topK=25 |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Call retrieve with topK=25 | topK capped to 20 or error returned |

### TC-302: Token Budget <=6000
| Field | Value |
| ID | TC-302 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-2 |
| Preconditions | Large repo |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Retrieve context | Token count ≤6000 |

### TC-303: Token Usage Under 6k for 1000-file Repo
| Field | Value |
| ID | TC-303 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-3 |
| Preconditions | Repo 1000 files |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Execute retrieval | Tokens ≤6000 and relevant files present |

## 5. Boundary & Negative Testing

### TC-401: topK = 0
| Field | Value |
| ID | TC-401 |
| Priority | Medium |
| Type | Boundary |
| Requirement | Data validation |
| Preconditions | Request topK=0 |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Submit topK=0 | Validation error |

### TC-402: Empty Query
| Field | Value |
| ID | TC-402 |
| Priority | Medium |
| Type | Negative |
| Requirement | Data validation |
| Preconditions | Empty query string |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Submit empty query | Validation error or empty result |

### TC-403: Pagination Boundary
| Field | Value |
| ID | TC-403 |
| Priority | Medium |
| Type | Boundary |
| Requirement | UC-3 |
| Preconditions | Directory with 10000 files |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Read directory with pagination | Full directory not loaded |

### TC-404: Exclusion Paths Case Sensitivity
| Field | Value |
| ID | TC-404 |
| Priority | Low |
| Type | Negative |
| Requirement | UC-3 |
| Preconditions | Path .GIT |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Retrieve | .GIT excluded or handled per rule |

## 7. Integration Testing

### TC-701: Integration with code_search
| Field | Value |
| ID | TC-701 |
| Priority | High |
| Type | Integration |
| Requirement | Integration Spec 5.1 |
| Preconditions | code_search up |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Call ContextRetriever | code_search called with query, topK returned |

### TC-702: Integration with Session Factory
| Field | Value |
| ID | TC-702 |
| Priority | High |
| Type | Integration |
| Requirement | UC-1 |
| Preconditions | Retrieval completes |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Create session | Session receives contextFiles |

### TC-703: Token Counter Integration
| Field | Value |
| ID | TC-703 |
| Priority | High |
| Type | Integration |
| Requirement | BR-2 |
| Preconditions | Context files ready |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Count tokens | Accurate count, progressive disclosure triggered |

### TC-704: Intent Classification Integration
| Field | Value |
| ID | TC-704 |
| Priority | Medium |
| Type | Integration |
| Requirement | Processing Logic |
| Preconditions | Query submitted |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Query routed | Intent correct, ContextRetriever strategy matched |

### TC-705: File Exclusion Filter Integration
| Field | Value |
| ID | TC-705 |
| Priority | Medium |
| Type | Integration |
| Requirement | UC-3 |
| Preconditions | Repo with excluded dirs |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Retrieve | Excluded paths never appear |

### TC-706: Fallback to Summary Tree
| Field | Value |
| ID | TC-706 |
| Priority | Medium |
| Type | Integration |
| Requirement | Error Handling |
| Preconditions | Search timeout |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Timeout occurs | Summary tree used |

## 9. Regression Testing

### TC-801: Existing Session Creation Unaffected
| Field | Value |
| ID | TC-801 |
| Priority | Medium |
| Type | Regression |
| Requirement | Existing feature |
| Preconditions | ContextRetriever disabled |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Create session without retrieval | Session works as before |

### TC-802: Token Budget Regression
| Field | Value |
| ID | TC-802 |
| Priority | Medium |
| Type | Regression |
| Requirement | NFR Performance |
| Preconditions | Previous baseline |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Retrieve on 1000 files | Retrieval <500ms |

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Status |
| UC-1 | FSD 3.1 | TC-001, TC-101, TC-102, TC-201, TC-202, TC-301, TC-701, TC-702 | Covered |
| BR-1 | FSD 3.1.3 | TC-301 | Covered |
| BR-2 | FSD 3.1.3 | TC-302, TC-303, TC-703 | Covered |
| BR-3 | FSD 3.2 | TC-002, TC-303 | Covered |
| UC-2 | FSD 3.2 | TC-002, TC-302 | Covered |
| UC-3 | FSD 3.3 | TC-003, TC-705 | Covered |
| AC-1 | BRD 2.3 | TC-001 | Covered |
| AC-2 | BRD 2.3 | TC-002 | Covered |
| AC-3 | BRD 2.3 | TC-003 | Covered |

Coverage Summary:
| Category | Total | Covered | Coverage % |
| Use Cases | 3 | 3 | 100% |
| Business Rules | 3 | 3 | 100% |
| Acceptance Criteria | 3 | 3 | 100% |
| Overall | 9 | 9 | 100% |
