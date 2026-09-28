# Software Test Cases (STC)

## SA4E-326: Pi Prompt Compression + Role-scoped prompts per model tier

## Document Information
| Field | Value |
| Jira Ticket | SA4E-326 |
| Author | QA Agent |
| Version | 1.0 |

## Test Case Summary
| Category | ID Range | Count |
| Functional — Happy Path | TC-001 to TC-099 | 3 |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 |
| Business Rule Validation | TC-300 to TC-399 | 3 |
| Boundary & Negative Testing | TC-400 to TC-499 | 3 |
| Integration Testing | TC-700 to TC-799 | 5 |

## 1. Functional Test Cases — Happy Path

### TC-001: Prompt Compression for Small Model
| Field | Value |
| ID | TC-001 |
| Priority | High |
| Type | Functional |
| Requirement | UC-1 |
| Preconditions | Small model selected |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Request prompt for small model | Compressed variant returned |
| 2 | Verify size | Smaller than full variant |

### TC-002: Role-scoped Skill Filtering - SM
| Field | Value |
| ID | TC-002 |
| Priority | High |
| Type | Functional |
| Requirement | Story 2 |
| Preconditions | User role SM |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Load prompts for SM | Only BRD skill visible |

### TC-003: Role-scoped Skill Filtering - DEV
| Field | Value |
| ID | TC-003 |
| Priority | High |
| Type | Functional |
| Requirement | Story 2 |
| Preconditions | User role DEV |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Load prompts for DEV | Only code skill visible |

## 2. Alternative Flows

### TC-101: Prompt Discovery No Preload
| Field | Value |
| ID | TC-101 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | Story 1 |
| Preconditions | /template call |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Call /template | Prompt injected on demand |

### TC-102: SYSTEM.md Append in Replace Mode
| Field | Value |
| ID | TC-102 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | Story 3 |
| Preconditions | mode=replace |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Request with replace mode | SYSTEM.md appended |

## 4. Business Rule Validation

### TC-301: Prompt Discovery <500ms
| Field | Value |
| ID | TC-301 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-1 |
| Preconditions | <100 templates |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Measure discovery time | <500ms |

### TC-302: Small Model Passes STC of SA4E-318
| Field | Value |
| ID | TC-302 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC Story 1 |
| Preconditions | Small model with compressed prompt |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Execute STC | Pass |

### TC-303: Role Filter Correct Per Role
| Field | Value |
| ID | TC-303 |
| Priority | High |
| Type | Business Rule |
| Requirement | AC Story 2 |
| Preconditions | Roles SM, DEV, QA |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Load per role | SM sees BRD, DEV sees code, QA sees test |

## 5. Boundary & Negative Testing

### TC-401: Empty Template Set
| Field | Value |
| ID | TC-401 |
| Priority | Medium |
| Type | Negative |
| Requirement | Validation |
| Preconditions | No templates |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Request prompt | Graceful empty response |

### TC-402: Unknown Role
| Field | Value |
| ID | TC-402 |
| Priority | Medium |
| Type | Negative |
| Requirement | Validation |
| Preconditions | Role unknown |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Load prompts | Default or error |

### TC-403: Model Tier Detection Failure
| Field | Value |
| ID | TC-403 |
| Priority | Medium |
| Type | Negative |
| Requirement | Validation |
| Preconditions | Tier unknown |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Request prompt | Fallback to full variant |

## 7. Integration Testing

### TC-701: Integration with agent-configurator.ts
| Field | Value |
| ID | TC-701 |
| Priority | High |
| Type | Integration |
| Requirement | Integration Spec |
| Preconditions | Configurator available |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Load prompt | Role filter applied |

### TC-702: Integration with prompt-template.service.ts
| Field | Value |
| ID | TC-702 |
| Priority | High |
| Type | Integration |
| Requirement | Integration Spec |
| Preconditions | Service running |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Request template | Compressed/full variant returned |

### TC-703: Model Tier Detection Integration
| Field | Value |
| ID | TC-703 |
| Priority | Medium |
| Type | Integration |
| Requirement | UC-1 |
| Preconditions | Model configured |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Detect tier | Correct variant selected |

### TC-704: Prompt Injection On Demand
| Field | Value |
| ID | TC-704 |
| Priority | Medium |
| Type | Integration |
| Requirement | Story 1 |
| Preconditions | /template endpoint |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Call /template | Prompt injected, no preload |

### TC-705: Role Scope Filter Integration
| Field | Value |
| ID | TC-705 |
| Priority | Medium |
| Type | Integration |
| Requirement | Story 2 |
| Preconditions | Multiple roles |

**Test Steps:**
| Step | Action | Expected Result |
| 1 | Load per role | Tool list not polluted |

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Status |
| UC-1 | FSD 3.1 | TC-001, TC-101, TC-301, TC-302, TC-703, TC-704 | Covered |
| Story 2 | BRD 2.2 | TC-002, TC-003, TC-303, TC-705 | Covered |
| Story 3 | BRD 2.2 | TC-102 | Covered |
| BR-1 | FSD 3.1 | TC-301 | Covered |

Coverage Summary:
| Category | Total | Covered | Coverage % |
| Use Cases | 1 | 1 | 100% |
| Stories | 3 | 3 | 100% |
| Business Rules | 1 | 1 | 100% |
| Overall | 5 | 5 | 100% |
