# Software Test Cases (STC)

## SA4E-328: Pi Verification loop + Hallucination grader for small models

## Document Information
| Field | Value |
| Jira Ticket | SA4E-328 |
| Author | QA Agent |
| Version | 1.0 |

## Test Case Summary
| Category | ID Range | Count |
| Functional — Happy Path | TC-001 to TC-099 | 3 |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 |
| Business Rule Validation | TC-300 to TC-399 | 2 |
| Integration Testing | TC-700 to TC-799 | 4 |

## 1. Functional Test Cases — Happy Path

### TC-001: Hallucination Grading Returns Faithfulness Score
| Field | Value |
| ID | TC-001 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Answer generated |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Run hallucination grader | Faithfulness score returned |

### TC-002: Verification Loop Retries On Low Faithfulness
| Field | Value |
| ID | TC-002 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Faithfulness < threshold |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Grader score low | Retry triggered |

### TC-003: Small Model Skips Self Verify
| Field | Value |
| ID | TC-003 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Small model active |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Execute tools | Direct routing + external grader used |

## 2. Alternative Flows

### TC-101: Large Model Keeps Verify
| Field | Value |
| ID | TC-101 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | UC-1 |
| Preconditions | Large model active |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Execute tools | Verify loop retained |

### TC-102: Faithfulness Metric On Golden Set
| Field | Value |
| ID | TC-102 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | AC |
| Preconditions | Golden dataset |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Run eval harness | Metrics reported |

## 4. Business Rule Validation

### TC-301: Wrong Fact Answers Caught + Retry
| Field | Value |
| ID | TC-301 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC |
| Preconditions | Hallucinated answer |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Grade answer | Wrong fact caught, retry performed |

### TC-302: Faithfulness Metric Reported
| Field | Value |
| ID | TC-302 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC |
| Preconditions | Eval run |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Evaluate | Faithfulness on golden set reported |

## 7. Integration Testing

### TC-701: Execute Tools → Verification Loop Integration
| Field | Value |
| ID | TC-701 |
| Priority | High |
| Type | Integration |
| Requirement | Architecture |
| Preconditions | Tools executed |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Post execute_tools | Verification loop invoked |

### TC-702: Verification Loop → Hallucination Grader Integration
| Field | Value |
| ID | TC-702 |
| Priority | High |
| Type | Integration |
| Requirement | Architecture |
| Preconditions | Loop active |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Grader invoked | Score returned |

### TC-703: Model Routing Integration
| Field | Value |
| ID | TC-703 |
| Priority | Medium |
| Type | Integration |
| Requirement | UC-1 |
| Preconditions | Small vs large model |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Route model | Correct verification strategy applied |

### TC-704: Retry Integration
| Field | Value |
| ID | TC-704 |
| Priority | Medium |
| Type | Integration |
| Requirement | UC-1 |
| Preconditions | Low faithfulness |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Retry triggered | New answer generated |

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Status |
| UC-1 | FSD 3 | TC-001, TC-002, TC-003, TC-101, TC-701, TC-702, TC-703, TC-704 | Covered |
| AC Wrong Fact | BRD | TC-301 | Covered |
| AC Faithfulness | BRD | TC-102, TC-302 | Covered |

Coverage Summary:
| Category | Total | Covered | Coverage % |
| Use Cases | 1 | 1 | 100% |
| Acceptance Criteria | 2 | 2 | 100% |
| Overall | 3 | 3 | 100% |
