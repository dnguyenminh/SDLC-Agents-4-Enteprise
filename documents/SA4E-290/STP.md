# Software Test Plan (STP)

## SA4E-289 — SA4E-290: SA4E-289.1 – Setup Pi SDK & Pi Provider

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-290 |
| Title | SA4E-289.1 – Setup Pi SDK & Pi Provider |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related BRD | documents/SA4E-290/BRD.md |
| Related FSD | documents/SA4E-290/FSD.md |
| Related TDD | N/A |

---

## 1. Introduction

### 1.1 Purpose
Test Plan for SA4E-290 Setup Pi SDK & Pi Provider. Defines strategy, scope, resources and entry/exit criteria for verifying Pi SDK installation and PiProvider interface creation per BRD and FSD.

### 1.2 Test Objectives
- Verify Pi SDK `@earendil-works/pi-agent-core` installed correctly with no dependency conflicts
- Validate PiProvider interface exists, compatible with existing LLM provider contract
- Ensure business rules BR-001 to BR-004 are enforced
- Verify non-functional requirements: init latency <500ms p95, no secrets in code, 100% JSDoc coverage
- Ensure error handling and fallback behavior works as specified

### 1.3 References
| Document | Location |
|----------|----------|
| BRD | documents/SA4E-290/BRD.md |
| FSD | documents/SA4E-290/FSD.md |
| Pi Migration Plan | documents/pi-migration-plan.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties for config validation | Automated | fast-check |
| UT | Unit tests for PiProvider config validation | Automated | vitest |
| IT | Integration tests for SDK import and Provider init | Automated | vitest |
| E2E-API | REST endpoint E2E | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E | Automated | Playwright |
| SIT | Manual verification of files, package.json, docs | Manual | File system |

### 2.2 Test Types
| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features per FSD use cases | Yes |
| Regression Testing | Ensure existing provider contract not broken | Yes |
| Performance Testing | Init latency <500ms p95 | Yes |
| Security Testing | No secrets in code | Yes |

### 2.3 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 2 | 2 | 0 |
| UT | 6 | 6 | 0 |
| IT | 6 | 6 | 0 |
| E2E-API | 0 | 0 | 0 |
| E2E-UI | 0 | 0 | 0 |
| SIT | 6 | 0 | 6 |
| Total | 20 | 14 (70%) | 6 (30%) |

---

## 3. Test Scope

### 3.1 In Scope
Setup Pi SDK Installation, Create Pi Provider Interface, Business rules BR-001..004, Error handling & fallback, Non-functional requirements.

### 3.2 Out of Scope
PiAgent Executor, Phase Router, State Adapter, Streaming adapter, Human Approval, LangGraph cleanup.

---

## 4. Test Environment
Dev environment localhost:3000, SQLite. Test data in documents/SA4E-290/testdata/

---

## 5. Test Schedule
Planning 2026-09-16, Execution 2026-09-17 to 2026-09-19.

---

## 6. Resources & Responsibilities
Test Lead: QA Agent, QA Engineer: QA Agent, BA: Duc Nguyen Minh, Developer: TBD, Architect: TBD.

---

## 7. Risk & Mitigation
Pi SDK API changes - lock version. Dependency conflict - check peers. Missing docs - request support.

---

## 8. Defect Management
Severity Critical/Major/Minor/Trivial. Priority P1-P4.

---

## 9. Test Metrics
Execution 100%, Pass ≥95%, Critical defects 0.

---
