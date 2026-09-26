# Software Test Cases (STC)

## SA4E-329: Pi Model Routing and Fallback small to large

## Document Information
| Field | Value |
| Jira Ticket | SA4E-329 |
| Author | QA Agent |
| Version | 1.0 |

## Test Case Summary
| Category | ID Range | Count |
| Functional — Happy Path | TC-001 to TC-099 | 3 |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 |
| Business Rule Validation | TC-300 to TC-399 | 2 |
| Integration Testing | TC-700 to TC-799 | 4 |

## 1. Functional Test Cases — Happy Path

### TC-001: Small Model First Routing
| Field | Value |
| ID | TC-001 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | User request |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Submit request | Routed to small model first |

### TC-002: Low Confidence Escalates To Large
| Field | Value |
| ID | TC-002 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Confidence low |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Detect low confidence | Escalate to large model |

### TC-003: Routing Decision Logged
| Field | Value |
| ID | TC-003 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Routing performed |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Check logs | Routing decision recorded |

## 2. Alternative Flows

### TC-101: ThinkingLevel Maps To MaxTokens + Retry
| Field | Value |
| ID | TC-101 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | UC-1 |
| Preconditions | thinkingLevel set |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Set thinkingLevel | maxTokens mapped, retry configured |

### TC-102: Easy Questions Stay Small
| Field | Value |
| ID | TC-102 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | AC |
| Preconditions | Easy query |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Submit easy query | Stays on small model, no escalation |

## 4. Business Rule Validation

### TC-301: phi-3 Fail Escalates To gpt-4o-mini
| Field | Value |
| ID | TC-301 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC |
| Preconditions | phi-3 fails |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Trigger fail | Escalates to gpt-4o-mini with log |

### TC-302: Easy Questions Stay Small
| Field | Value |
| ID | TC-302 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC |
| Preconditions | Easy question |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Process | Remains on small model |

## 7. Integration Testing

### TC-701: Router → Small Model Integration
| Field | Value |
| ID | TC-701 |
| Priority | High |
| Type | Integration |
| Requirement | Architecture |
| Preconditions | Router active |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Route request | Small model invoked |

### TC-702: Confidence Check → Fallback Integration
| Field | Value |
| ID | TC-702 |
| Priority | High |
| Type | Integration |
| Requirement | Architecture |
| Preconditions | Low confidence |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Check confidence | Fallback to large triggered |

### TC-703: Logging Integration
| Field | Value |
| ID | TC-703 |
| Priority | Medium |
| Type | Integration |
| Requirement | UC-1 |
| Preconditions | Routing performed |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Check log | Decision persisted |

### TC-704: ThinkingLevel Mapping Integration
| Field | Value |
| ID | TC-704 |
| Priority | Medium |
| Type | Integration |
| Requirement | UC-1 |
| Preconditions | thinkingLevel set |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Map level | maxTokens and retry configured |

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Status |
| UC-1 | FSD | TC-001, TC-002, TC-003, TC-101, TC-701, TC-702, TC-703, TC-704 | Covered |
| AC Escalation | BRD | TC-301 | Covered |
| AC Stay Small | BRD | TC-102, TC-302 | Covered |

Coverage Summary:
| Category | Total | Covered | Coverage % |
| Use Cases | 1 | 1 | 100% |
| Acceptance Criteria | 2 | 2 | 100% |
| Overall | 3 | 3 | 100% |
