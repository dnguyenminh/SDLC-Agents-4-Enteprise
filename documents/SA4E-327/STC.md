# Software Test Cases (STC)

## SA4E-327: Pi Task Decomposition + Map-Reduce for large repo queries

## Document Information
| Field | Value |
| Jira Ticket | SA4E-327 |
| Author | QA Agent |
| Version | 1.0 |

## Test Case Summary
| Category | ID Range | Count |
| Functional — Happy Path | TC-001 to TC-099 | 3 |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 |
| Business Rule Validation | TC-300 to TC-399 | 2 |
| Integration Testing | TC-700 to TC-799 | 4 |

## 1. Functional Test Cases — Happy Path

### TC-001: Query Decomposition Into Batches of 20
| Field | Value |
| ID | TC-001 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | GLOBAL query on large repo |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Submit GLOBAL query | Decomposer creates batches of 20 files |
| 2 | Verify batches | Each batch processed |

### TC-002: Map Summarization Per Batch
| Field | Value |
| ID | TC-002 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Batches created |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Process batches | Small model summarizes each batch |
| 2 | Verify output | Summaries generated |

### TC-003: Reduce Synthesis
| Field | Value |
| ID | TC-003 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Summaries ready |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Aggregate summaries | Final synthesized answer returned |

## 2. Alternative Flows

### TC-101: Parallelism Limit Enforced
| Field | Value |
| ID | TC-101 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | Business Rule |
| Preconditions | Many batches |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Process batches | Parallelism limit respected |

### TC-102: Timeout Handling
| Field | Value |
| ID | TC-102 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | Business Rule |
| Preconditions | Batch timeout |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Batch times out | Timeout handled, partial results used |

## 4. Business Rule Validation

### TC-301: No OOM On Large Repo
| Field | Value |
| ID | TC-301 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC |
| Preconditions | Large repo query |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Execute query | No OOM, completes successfully |

### TC-302: Quality Comparable To 1-shot Large Model
| Field | Value |
| ID | TC-302 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC |
| Preconditions | Golden dataset |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Compare outputs | Quality comparable |

## 7. Integration Testing

### TC-701: Decomposer → Map Workers Integration
| Field | Value |
| ID | TC-701 |
| Priority | High |
| Type | Integration |
| Requirement | Architecture |
| Preconditions | Query received |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Decompose | Map workers receive batches |

### TC-702: Map → Reduce Integration
| Field | Value |
| ID | TC-702 |
| Priority | High |
| Type | Integration |
| Requirement | Architecture |
| Preconditions | Summaries ready |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Aggregate | Reduce produces final answer |

### TC-703: Query Router Intent Integration
| Field | Value |
| ID | TC-703 |
| Priority | Medium |
| Type | Integration |
| Requirement | UC-1 |
| Preconditions | Query submitted |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Classify intent | GLOBAL/STRUCTURAL routed to Map-Reduce |

### TC-704: Deduplication Integration
| Field | Value |
| ID | TC-704 |
| Priority | Medium |
| Type | Integration |
| Requirement | Business Rule |
| Preconditions | Overlapping batches |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Process | Duplicates removed |

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Status |
| UC-1 | FSD 3 | TC-001, TC-002, TC-003, TC-101, TC-102, TC-701, TC-702, TC-703 | Covered |
| AC No OOM | BRD | TC-301 | Covered |
| AC Quality | BRD | TC-302 | Covered |

Coverage Summary:
| Category | Total | Covered | Coverage % |
| Use Cases | 1 | 1 | 100% |
| Acceptance Criteria | 2 | 2 | 100% |
| Overall | 3 | 3 | 100% |
