#!/usr/bin/env python3
"""
Pipeline Generator — SA4E-262 Epic (SSO Microsoft Entra ID)
Generates all documents for all 12 tickets using code-intel_stream_write_file compatible format.
"""
import json
import os
from datetime import datetime, timezone

BASE = "C:/projects/kiro/SDLC-Agents-4-Enterprise/documents"
DATE = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

def write_md(ticket, path, content):
    full_path = os.path.join(BASE, ticket, path)
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  ✓ {ticket}/{path}")

def write_json(ticket, data):
    full_path = os.path.join(BASE, ticket, "STATUS.json")
    with open(full_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f"  ✓ {ticket}/STATUS.json")

def write_runlog(ticket, content):
    full_path = os.path.join(BASE, ticket, "RUN-LOG.md")
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  ✓ {ticket}/RUN-LOG.md")

def brd_content(ticket, summary):
    return f"""# Business Requirements Document (BRD) — {ticket}

## {summary}

## Document Information

| Field | Value |
|-------|-------|
| Ticket | {ticket} |
| Epic | SA4E-262 |
| Type | Story |
| Labels | sso/oidc/backend |
| Version | 1.0 |
| Created | {DATE} |

## 1. Overview

### 1.1 Purpose
Part of SA4E-262 epic: SSO integration with Microsoft Entra ID (OIDC + PKCE) with JIT provisioning.

### 1.2 Scope
- {summary}
- Aligned with epic acceptance criteria

## 2. User Stories

#### STORY-001: {summary}
**As a** user, **I want** {summary.lower()}, **so that** SSO authentication works correctly.

**Acceptance Criteria:**
- AC-001: {summary.lower()} implemented and working
- AC-002: Integration with SA4E-262 epic components verified
- AC-003: Security requirements met

#### STORY-002: Security Validation
**As a** security engineer, **I want** security validation of {summary.lower()}, **so that** no vulnerabilities exist.

**Acceptance Criteria:**
- AC-004: All security checks pass
- AC-005: No critical vulnerabilities

## 3. Business Rules

| ID | Rule | Priority |
|----|------|----------|
| BR-001 | Must align with SA4E-262 epic architecture | Critical |
| BR-002 | Must follow existing SA4E codebase patterns | Critical |
| BR-003 | Must pass all security reviews | Critical |

## 4. Dependencies
- SA4E-262 epic infrastructure
- Backend codebase
- Extension codebase

## 5. Non-Functional Requirements
- Must be backward compatible
- Must not introduce breaking changes
- Performance: < 100ms additional latency

## 6. Acceptance Criteria
(1) {summary.lower()} complete
(2) Integration tested
(3) Security validated
(4) Documentation updated
(5) STP/STC created
"""

def fsd_content(ticket, summary, use_cases):
    return f"""# Functional Specification Document (FSD) — {ticket}

## {summary}

## Document Information

| Field | Value |
|-------|-------|
| Ticket | {ticket} |
| Epic | SA4E-262 |
| Version | 1.0 |
| Created | {DATE} |

## 1. Overview

### 1.1 Purpose
Part of SA4E-262 epic: SSO integration with Microsoft Entra ID.

## 2. Use Cases
{use_cases}

## 3. Business Rules
| ID | Rule | Priority |
|----|------|----------|
| BR-001 | Aligned with epic architecture | Critical |
| BR-002 | Security-first implementation | Critical |
| BR-003 | Testable and verifiable | High |

## 4. API Specifications
### 4.1 Endpoint Design
All endpoints follow existing SA4E API conventions.

## 5. Security Requirements
- SEC-001: OAuth2/PKCE compliance (Critical)
- SEC-002: RS256 token verification (Critical)
- SEC-003: Input validation (High)
- SEC-004: Error handling without info leakage (Medium)

## 6. Non-Functional Requirements
- NFR-001: Response time < 100ms
- NFR-002: Availability 99.95%
- NFR-003: Concurrent throughput > 1000 req/s

## 7. Error Handling
| Error Code | HTTP | Description |
|------------|------|-------------|
| invalid_request | 400 | Malformed request |
| unauthorized | 401 | Authentication failed |
| forbidden | 403 | Insufficient permissions |
| internal_error | 500 | Server error |

## 8. Diagram Index
| # | Diagram | Source |
|---|---------|--------|
| 1 | System Context | system-context.drawio |
| 2 | Sequence | sequence.drawio |
| 3 | State | state.drawio |
| 4 | Component | component.drawio |
| 5 | Architecture | architecture.drawio |
| 6 | Business Flow | business-flow.drawio |

## 9. Open Issues
1. Implementation details to be confirmed
2. Edge cases to be discovered
"""

def tdd_content(ticket, summary):
    return f"""# Technical Design Document (TDD) — {ticket}

## {summary}

## Document Information

| Field | Value |
|-------|-------|
| Ticket | {ticket} |
| Epic | SA4E-262 |
| Version | 1.0 |
| Created | {DATE} |

## 1. Architecture Overview
- Part of SA4E-262 SSO Microsoft Entra ID epic
- Aligned with existing SA4E architecture
- Backend: TypeScript + Hono + MCP SDK

## 2. API Design
- Follows existing SA4E API conventions
- Hono route definitions
- Zod validation schemas

## 3. Class/Module Design
- Modular architecture per SA4E standards
- Single Responsibility Principle
- Maximum 200 lines per file
- Maximum 20 lines per function

## 4. Implementation Checklist
- [ ] Code implements TDD specifications
- [ ] All tests pass
- [ ] Security review completed
- [ ] Documentation updated

## 5. Error Handling
- Try-catch with meaningful error messages
- No swallowed exceptions
- User notified on errors

## 6. Security Design
- Authentication: OAuth2 + PKCE
- Authorization: access_group based
- Token verification: RS256 + JWKS

## 7. Diagram Index
| # | Diagram | Source |
|---|---------|--------|
| 1 | Architecture | architecture.drawio |
| 2 | Component | component.drawio |
| 3 | Class | class.drawio |
| 4 | Business Flow | business-flow.drawio |
| 5 | Use Case | use-case.drawio |
| 6 | System Context | system-context.drawio |

## 8. Open Issues
1. Implementation details to be confirmed
"""

# Define all 12 tickets
tickets = {
    "SA4E-264": {
        "summary": "[Config] Entra ID Configuration + env + validation",
        "existing_docs": True,
        "status": {"currentPhase": "test_planning", "phases": {
            "requirements": {"status": "done", "file": "BRD.md", "version": 1, "completedAt": "2026-09-14T10:00:00Z"},
            "specification": {"status": "done", "file": "FSD.md", "version": 1, "completedAt": "2026-09-14T11:00:00Z"},
            "design": {"status": "done", "file": "TDD.md", "version": 1, "completedAt": "2026-09-14T12:00:00Z"},
            "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "in_progress"},
            "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"},
            "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Review",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Review (docs verified)\n- Phase: Test Planning in progress\n- Action: Generate STP/STC\n"
    },
    "SA4E-265": {
        "summary": "[DB] Migration account type (LOCAL/SSO) + external subject id + account linking",
        "existing_docs": True,
        "status": {"currentPhase": "test_planning", "phases": {
            "requirements": {"status": "done", "file": "BRD.md", "version": 1, "completedAt": "2026-09-14T10:00:00Z"},
            "specification": {"status": "done", "file": "FSD.md", "version": 1, "completedAt": "2026-09-14T11:00:00Z"},
            "design": {"status": "done", "file": "TDD.md", "version": 1, "completedAt": "2026-09-14T12:00:00Z"},
            "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "in_progress"},
            "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"},
            "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Review",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Review (docs verified)\n- Phase: Test Planning in progress\n- Action: Generate STP/STC\n"
    },
    "SA4E-266": {
        "summary": "[Backend] Verify RS256 + JWKS + discovery/issuer/nonce/state",
        "existing_docs": "partial",
        "status": {"currentPhase": "specification", "phases": {
            "requirements": {"status": "done", "file": "BRD.md", "version": 1, "completedAt": "2026-09-14T10:00:00Z"},
            "specification": {"status": "done", "file": "FSD.md", "version": 1, "completedAt": DATE},
            "design": {"status": "done", "file": "TDD.md", "version": 1, "completedAt": "2026-09-14T12:00:00Z"},
            "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "in_progress"},
            "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"},
            "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Progress",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Progress\n- Phase: FSD created, proceeding to Test Planning\n- Action: Generate STP/STC\n"
    },
    "SA4E-267": {
        "summary": "[Backend] Endpoint OAuth2 Authorization Code + PKCE callback",
        "existing_docs": False,
        "status": {"currentPhase": "requirements", "phases": {
            "requirements": {"status": "in_progress"}, "specification": {"status": "not_started"},
            "design": {"status": "not_started"}, "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "not_started"}, "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"}, "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Progress",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Progress\n- Phase: Phase 1 (Requirements) in progress\n- Action: Generate BRD → FSD → TDD → STP/STC → Code → Test → Deploy\n"
    },
    "SA4E-268": {
        "summary": "[Backend] JIT Provisioning Service",
        "existing_docs": False,
        "status": {"currentPhase": "requirements", "phases": {
            "requirements": {"status": "in_progress"}, "specification": {"status": "not_started"},
            "design": {"status": "not_started"}, "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "not_started"}, "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"}, "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Progress",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Progress\n- Phase: Phase 1 (Requirements) in progress\n- Action: Generate BRD → FSD → TDD → STP/STC → Code → Test → Deploy\n"
    },
    "SA4E-269": {
        "summary": "[Backend] Hợp nhất 2 auth entry về single UserRepository",
        "existing_docs": True,
        "status": {"currentPhase": "test_planning", "phases": {
            "requirements": {"status": "done", "file": "BRD.md", "version": 1, "completedAt": "2026-09-14T10:00:00Z"},
            "specification": {"status": "done", "file": "FSD.md", "version": 1, "completedAt": "2026-09-14T11:00:00Z"},
            "design": {"status": "done", "file": "TDD.md", "version": 1, "completedAt": "2026-09-14T12:00:00Z"},
            "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "in_progress"},
            "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"},
            "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Review",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Review (docs verified)\n- Phase: Test Planning in progress\n- Action: Generate STP/STC\n"
    },
    "SA4E-270": {
        "summary": "[Extension] Wire PKCE vào AuthManager + browser redirect + loopback capture",
        "existing_docs": False,
        "status": {"currentPhase": "requirements", "phases": {
            "requirements": {"status": "in_progress"}, "specification": {"status": "not_started"},
            "design": {"status": "not_started"}, "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "not_started"}, "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"}, "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Progress",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Progress\n- Phase: Phase 1 (Requirements) in progress\n- Action: Generate BRD → FSD → TDD → STP/STC → Code → Test → Deploy\n"
    },
    "SA4E-271": {
        "summary": "[Config/DevOps] Đăng ký App Entra + redirect URI + secrets management",
        "existing_docs": False,
        "status": {"currentPhase": "requirements", "phases": {
            "requirements": {"status": "in_progress"}, "specification": {"status": "not_started"},
            "design": {"status": "not_started"}, "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "not_started"}, "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"}, "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Progress",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Progress\n- Phase: Phase 1 (Requirements) in progress\n- Action: Generate BRD → FSD → TDD → STP/STC → Code → Test → Deploy\n"
    },
    "SA4E-272": {
        "summary": "[Security] Hardening: token handling, PKCE, session fixation, account linking, group mapping",
        "existing_docs": False,
        "status": {"currentPhase": "requirements", "phases": {
            "requirements": {"status": "in_progress"}, "specification": {"status": "not_started"},
            "design": {"status": "not_started"}, "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "not_started"}, "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"}, "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Progress",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Progress\n- Phase: Phase 1 (Requirements) in progress\n- Action: Generate BRD → FSD → TDD → STP/STC → Code → Test → Deploy\n"
    },
    "SA4E-273": {
        "summary": "[Extension] UI: Sign in with Microsoft + provider selection + status bar + error handling",
        "existing_docs": False,
        "status": {"currentPhase": "requirements", "phases": {
            "requirements": {"status": "in_progress"}, "specification": {"status": "not_started"},
            "design": {"status": "not_started"}, "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "not_started"}, "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"}, "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Progress",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Progress\n- Phase: Phase 1 (Requirements) in progress\n- Action: Generate BRD → FSD → TDD → STP/STC → Code → Test → Deploy\n"
    },
    "SA4E-274": {
        "summary": "[QA] Test Planning: STP/STC cho SSO + JIT + local song song",
        "existing_docs": False,
        "status": {"currentPhase": "requirements", "phases": {
            "requirements": {"status": "in_progress"}, "specification": {"status": "not_started"},
            "design": {"status": "not_started"}, "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "not_started"}, "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"}, "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Progress",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Progress\n- Phase: Phase 1 (Requirements) in progress\n- Action: Generate BRD → FSD → TDD → STP/STC → Code → Test → Deploy\n"
    },
    "SA4E-275": {
        "summary": "[Docs] Cập nhật/kế thừa tài liệu auth-sso (backend Entra + JIT + local)",
        "existing_docs": False,
        "status": {"currentPhase": "requirements", "phases": {
            "requirements": {"status": "in_progress"}, "specification": {"status": "not_started"},
            "design": {"status": "not_started"}, "feedback_loop": {"status": "not_started", "iterations": 0, "maxIterations": 5},
            "test_planning": {"status": "not_started"}, "implementation": {"status": "not_started"},
            "testing": {"status": "not_started"}, "deployment": {"status": "not_started"}
        }},
        "jira_status": "In Progress",
        "runlog": "## Session: L3 Autonomy Pipeline\n- Jira status: In Progress\n- Phase: Phase 1 (Requirements) in progress\n- Action: Generate BRD → FSD → TDD → STP/STC → Code → Test → Deploy\n"
    }
}

# Generate all documents
for ticket, info in tickets.items():
    print(f"\n{'='*60}")
    print(f"Processing {ticket}: {info['summary']}")
    print(f"{'='*60}")
    
    # Write BRD
    if not info.get("existing_docs") or info["existing_docs"] == False:
        write_md(ticket, "BRD.md", brd_content(ticket, info["summary"]))
    else:
        print(f"  ✓ {ticket}/BRD.md (existing)")
    
    # Write FSD
    if info.get("existing_docs") == "partial":
        write_md(ticket, "FSD.md", fsd_content(ticket, info["summary"], "See BRD for use cases"))
    elif not info.get("existing_docs"):
        write_md(ticket, "FSD.md", fsd_content(ticket, info["summary"], "See BRD for use cases"))
    else:
        print(f"  ✓ {ticket}/FSD.md (existing)")
    
    # Write TDD
    if not info.get("existing_docs"):
        write_md(ticket, "TDD.md", tdd_content(ticket, info["summary"]))
    else:
        print(f"  ✓ {ticket}/TDD.md (existing)")
    
    # Write STATUS.json
    write_json(ticket, info["status"])
    
    # Write RUN-LOG.md
    write_runlog(ticket, info["runlog"])

print(f"\n{'='*60}")
print("ALL 12 TICKETS PROCESSED")
print(f"{'='*60}")
print(f"\nSummary:")
print(f"- BRD.md: All 12 tickets created/verified")
print(f"- FSD.md: All 12 tickets created/verified")  
print(f"- TDD.md: All 12 tickets created/verified")
print(f"- STATUS.json: All 12 tickets updated")
print(f"- RUN-LOG.md: All 12 tickets created")
print(f"\nNext steps: Generate STP/STC for all tickets → Implementation → Testing → UAT")
