# Software Test Cases (STC)

## SA4E-330: Pi Session Compaction and Eval harness for small models

## Document Information
| Field | Value |
| Jira Ticket | SA4E-330 |
| Author | QA Agent |
| Version | 1.0 |

## Test Case Summary
| Category | ID Range | Count |
| Functional — Happy Path | TC-001 to TC-099 | 3 |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 |
| Business Rule Validation | TC-300 to TC-399 | 2 |
| Integration Testing | TC-700 to TC-799 | 4 |

## 1. Functional Test Cases — Happy Path

### TC-001: Auto-compact Session At >=95% Usage
| Field | Value |
| ID | TC-001 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Session usage >=95% |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Monitor session | Auto-compact triggered |

### TC-002: Warn At >=85% Usage
| Field | Value |
| ID | TC-002 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Session usage >=85% |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Monitor session | Warning issued |

### TC-003: Summarize Intent/Tools/Last Response
| Field | Value |
| ID | TC-003 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Compaction triggered |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Compact session | Intent/tools/last response summarized |

## 2. Alternative Flows

### TC-101: 20-turn Dialogue No Intent Loss
| Field | Value |
| ID | TC-101 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | AC |
| Preconditions | 20-turn dialogue |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Run dialogue | No intent loss |

### TC-102: Eval Harness Runs Real E2E
| Field | Value |
| ID | TC-102 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | AC |
| Preconditions | Eval harness configured |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Execute harness | Real E2E not mock |

## 4. Business Rule Validation

### TC-301: Small Eval >80% Baseline Large
| Field | Value |
| ID | TC-301 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC |
| Preconditions | Golden dataset |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Run eval | Small eval >80% baseline large |

### TC-302: Faithfulness + Task Success Metrics Reported
| Field | Value |
| ID | TC-302 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC |
| Preconditions | Eval run |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Evaluate | Faithfulness and task success reported |

## 7. Integration Testing

### TC-701: Session Monitor → Compaction Trigger Integration
| Field | Value |
| ID | TC-701 |
| Priority | High |
| Type | Integration |
| Requirement | Architecture |
| Preconditions | Session usage high |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Monitor usage | Compaction triggered at threshold |

### TC-702: Summarizer Integration
| Field | Value |
| ID | TC-702 |
| Priority | High |
| Type | Integration |
| Requirement | Architecture |
| Preconditions | Compaction triggered |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Summarize | Intent/tools/last response condensed |

### TC-703: Eval Harness Integration
| Field | Value |
| ID | TC-703 |
| Priority | Medium |
| Type | Integration |
| Requirement | UC-1 |
| Preconditions | Golden dataset |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Run harness | Metrics computed |

### TC-704: E2E Testing Integration
| Field | Value |
| ID | TC-704 |
| Priority | Medium |
| Type | Integration |
| Requirement | AC |
| Preconditions | Real environment |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Execute E2E | Real E2E performed |

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Status |
| UC-1 | FSD | TC-001, TC-002, TC-003, TC-701, TC-702, TC-703, TC-704 | Covered |
| AC No Intent Loss | BRD | TC-101 | Covered |
| AC Eval >80% | BRD | TC-301 | Covered |
| AC Real E2E | BRD | TC-102, TC-704 | Covered |

Coverage Summary:
| Category | Total | Covered | Coverage % |
| Use Cases | 1 | 1 | 100% |
| Acceptance Criteria | 3 | 3 | 100% |
| Overall | 4 | 4 | 100% |
