# Software Test Plan (STP)

## SA4E-329: Pi Model Routing and Fallback small to large

## Document Information
| Field | Value |
| Jira Ticket | SA4E-329 |
| Title | Pi Model Routing and Fallback small to large |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-26 |

## 1. Introduction
Purpose: Test model routing and fallback small to large.

## 2. Test Strategy
Test Levels: PBT, UT, IT, E2E-API, E2E-UI, SIT

### Test Levels Table
| Level | Scope | Automation | Tools |
| PBT | Correctness properties | Automated | fast-check |
| UT | Unit/edge case | Automated | vitest |
| IT | API integration | Automated | vitest + Hono |
| E2E-API | REST endpoint | Automated | vitest + fetch |
| E2E-UI | Browser UI | Automated | Playwright |
| SIT | Manual exploratory | Manual | Browser |

### Test Cases Summary
| Level | Count | Automated | Manual |
| PBT | 2 | 2 | 0 |
| UT | 6 | 6 | 0 |
| IT | 4 | 4 | 0 |
| E2E-API | 3 | 3 | 0 |
| SIT | 4 | 0 | 4 |
| Total | 19 | 15 | 4 |

## 3. Test Scope
In Scope: Model routing, Fallback escalation, Routing diagnostics
Out of Scope: Model provider changes

## 4. Test Environment
SIT: localhost:3000

## 5. Test Schedule
Planning 2026-09-26 to 2026-09-27

## 6. Resources
Test Lead: QA Agent

## 7. Risk & Mitigation
Escalation latency → Timeout thresholds

## 8. Defect Management
Severity Critical/Major/Minor/Trivial

## 9. Test Metrics
Execution Rate 100%, Pass Rate ≥95%
