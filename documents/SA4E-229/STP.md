# Software Test Plan (STP)

## JiraAssist Extension — SA4E-229: Implement jira_download_attachment tool to fix 403 error when fetching attachments

---
## Document Information
| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-229 |
| Title | Implement jira_download_attachment tool to fix 403 error when fetching attachments |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-08-28 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-229 |
| Related FSD | FSD not available |
| Related TDD | TDD-v1.0-SA4E-229 |

## 1. Introduction
**Purpose:** Test `jira_download_attachment` MCP tool to eliminate 403 errors.

**Objectives:**
- Verify download by ID/URL with auth
- Validate error handling
- Verify performance <5s

## 2. Test Strategy
| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties | Automated | fast-check |
| UT | Unit tests | Automated | vitest |
| IT | Integration | Automated | vitest + Hono |
| E2E-API | REST E2E | Automated | vitest + fetch |
| E2E-UI | Browser E2E | Automated | Playwright |
| SIT | Manual exploratory | Manual | Browser |

Test Cases Summary
| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| E2E-API | 10 | 10 | 0 |
| SIT | 4 | 0 | 4 |
| Total | 14 | 10 | 4 |

## 3. Test Scope
In Scope: Download by ID, by URL, error handling, 403 fix, performance
Out of Scope: Upload

## 4. Test Environment
Test MCP server with Jira authenticated session.

## 5. Test Schedule
Planning 2026-08-28, Execution 2026-08-29/30

## 6. Resources
QA Agent

## 7. Risk & Mitigation
Auth expiry, large files

## 8. Defect Management
Severity Critical/Major/Minor/Trivial

## 9. Metrics
Execution 100%, Pass ≥95%

