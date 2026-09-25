# Software Test Plan (STP)

## SA4E-254: Advanced RAG for large documents: Query Router + pre-computed Summary Tree

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-254 |
| Title | Advanced RAG for large documents: Query Router + pre-computed Summary Tree |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |
| Related BRD | BRD.md |
| Related FSD | FSD.md v1.1 |
| Related TDD | TDD.md v1.0 |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | TBD – Product Owner | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-09 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This Test Plan defines strategy, scope, resources, and execution approach for testing the Advanced RAG feature SA4E-254. The feature introduces Query Router intent classification, pre-computed Summary Tree at ingest, Semantic Cache for GLOBAL queries, and Async Queue for heavy queries. The plan ensures functional correctness, non-functional performance, security compliance, and regression safety for the RAG pipeline.

### 1.2 Test Objectives

- Verify all functional requirements from FSD sections 3.1-3.4 are implemented correctly
- Validate business rules BR-01 to BR-03, BR-10, BR-11 are enforced
- Ensure Query Router classification accuracy >=90% for 4 intents
- Verify Summary Tree tier1/2/3 built correctly and retrieval <1s
- Validate Semantic Cache hit/miss and invalidation on re-ingest
- Verify Async Queue processes 50 concurrent GLOBAL queries without OOM
- Ensure security conditions from SECURITY-REVIEW are satisfied
- Ensure non-functional requirements: GLOBAL <2s cache hit, LOCAL latency increase ≤10%, 200 concurrent users

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-254/BRD.md |
| FSD | documents/SA4E-254/FSD.md v1.1 |
| TDD | documents/SA4E-254/TDD.md v1.0 |
| SECURITY-REVIEW | documents/SA4E-254/SECURITY-REVIEW.md |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties for classifier and cache | Automated | fast-check |
| UT | Unit/edge case tests for services | Automated | vitest |
| IT | API integration Hono app in-process | Automated | vitest + Hono `app.request()` |
| E2E-API | REST endpoint E2E real server | Automated | vitest + fetch |
| E2E-UI | Browser UI E2E | Automated | Playwright |
| SIT | Manual exploratory / visual UX only | Manual | Browser |

**Test Cases Summary**

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 5 | 5 | 0 |
| UT | 18 | 18 | 0 |
| IT | 12 | 12 | 0 |
| E2E-API | 14 | 14 | 0 |
| E2E-UI | 8 | 8 | 0 |
| SIT | 6 | 0 | 6 |
| **Total** | **63** | **57 (90%)** | **6 (10%)** |

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify features per FSD use cases UC-01 | Yes |
| Regression Testing | Ensure existing LOCAL RAG pipeline not broken | Yes |
| Performance Testing | Response times, 200 concurrent users | Yes |
| Security Testing | Auth, authorization, IDOR, prompt injection, cache key injection, JWT hardening, PII logging | Yes |
| Non-Functional Testing | Scalability, availability | Yes |

### 2.3 Test Approach

Risk-based testing prioritizing P0 stories: Query Router and Summary Tree. Automated coverage for API and integration. Manual SIT limited to visual indicators: intent badge, cache hit icon, async job status UI. E2E-API covers full CRUD lifecycle for ingest/query, auth 401/403, validation 400, 404/409 errors, audit. E2E-UI covers UI navigation, form validation, status badges. Property-based tests verify classifier stability under paraphrase and cache key normalization.

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| SIT | Code deployed to SIT, unit tests passed >=90%, test data pre-seeded, pgvector + Redis + BullMQ up |
| UAT | SIT completed with 0 Critical/Major defects open, test environment stable, business users available |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| SIT | 100% test cases executed, Pass rate >=95%, 0 Critical, ≤2 Major open |
| UAT | All UAT scenarios passed, business sign-off obtained |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Query Router intent classification 4 intents | P0 | UC-01, BR-01/02/03 | Functional / Performance |
| 2 | Summary Tree pre-computed ingest tier1/2/3 | P0 | 3.2 | Functional / Integration |
| 3 | Global query returns document-summary no Map-Reduce | P0 | BR-03 | Functional |
| 4 | Semantic Cache hit/miss & invalidation | P1 | 3.3, BR-10/11 | Functional / Non-Functional |
| 5 | Async Queue processing heavy queries | P2 | 3.4 | Performance / Integration |
| 6 | Security conditions: Redis key injection, prompt injection, IDOR, JWT hardening, PII logging | P0 | SECURITY-REVIEW | Security |

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Embedding model change | BRD out of scope |
| 2 | Fine-tuning LLM | BRD out of scope |
| 3 | Multi-modal support | BRD out of scope |
| 4 | Chunk size change | BRD out of scope |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | URL | Database | Purpose |
|-------------|-----|----------|---------|
| SIT | http://localhost:3000 | PostgreSQL + pgvector, Redis | System Integration Testing |
| UAT | https://uat.rag.company | PostgreSQL + pgvector, Redis | User Acceptance Testing |

### 4.2 Test Data Requirements

| Data Type | Description | Source |
|-----------|-------------|--------|
| Pre-seeded documents | 100+ page PDF/text for summary tree | Test data set |
| Query corpus | 200 queries labeled LOCAL/GLOBAL/RELATIONAL/STRUCTURAL | Test data set |
| Users | Admin, Reader roles with JWT | Seed script |
| Cache entries | Pre-warmed GLOBAL query results | Test script |

### 4.3 External Dependencies

| System | Dependency | Mock/Stub |
|--------|------------|-----------|
| ONNX Embedding Service | 384-dim embeddings | Real in SIT |
| Redis | Cache + Queue | Real in SIT |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration |
|-------|-----------|----------|----------|
| Test Planning | 2026-09-09 | 2026-09-09 | 1 day |
| Test Data Preparation | 2026-09-10 | 2026-09-11 | 2 days |
| SIT Execution | 2026-09-12 | 2026-09-16 | 5 days |
| Defect Fix & Retest | 2026-09-17 | 2026-09-19 | 3 days |
| UAT Execution | 2026-09-20 | 2026-09-22 | 3 days |

---

## 6. Resources & Responsibilities

| Role | Responsibility |
|------|----------------|
| Test Lead | Test planning, coordination, reporting |
| QA Engineer | Test case design, execution, defect reporting |
| BA | UAT support, acceptance criteria clarification |
| Developer | Bug fixing, unit test coverage |
| DevOps | Environment setup, deployment |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Router classification accuracy <90% | High | Medium | Expand test corpus, tune heuristic + classifier, fallback to LOCAL |
| 2 | Summary tree quality poor | High | Medium | Evaluate summaries on sample docs, adjust LLM prompt |
| 3 | pgvector storage growth | Medium | High | Index per layer, monitor size |
| 4 | Redis cache key injection | High | Low | Sanitize and normalize keys, security test |
| 5 | Async queue OOM under burst | High | Medium | Load test 50 concurrent, limit workers |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition |
|----------|-----------|
| Critical | System crash, data loss, security breach |
| Major | Feature not working, workaround exists |
| Minor | UI issue, cosmetic |
| Trivial | Typo |

### 8.2 Priority Levels

| Priority | SLA |
|----------|-----|
| P1 | 4 hours |
| P2 | 1 business day |
| P3 | 3 business days |
| P4 | Next release |

### 8.3 Defect Lifecycle

New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed

---

## 9. Test Metrics & Reporting

| Metric | Target |
|--------|--------|
| Test Execution Rate | 100% |
| Pass Rate | ≥95% |
| Defect Density | ≤0.1 |
| Critical Defect Count | 0 |
| RTM Coverage | 100% |

Reporting daily during SIT/UAT.

---

## 10. Appendix

**Assumptions**
- Documents ingest are text-only
- Ingest cost acceptable per document
- 200 concurrent users peak scenario

