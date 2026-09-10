# STP – SmartLLM Hub Test Plan
**Ticket:** SH-1
**Version:** 1.1
**Date:** 2026-08-30

## 1. Introduction
### 1.1 Purpose
Đảm bảo Gateway routing đúng provider, health check hoạt động, fallback hoạt động, và full compliance với BRD/FSD/TDD SH-1.

### 1.2 Scope
Test cho:
- API `POST /v1/chat/completions` OpenAI-compatible
- Smart Router logic
- Health Checker & Capability Check
- Crawler sync awesome-freellm-apis
- Local fallback llama-server
- Provider Registry Maintenance

### 1.3 References
- `documents/SH-1/BRD.md`
- `documents/SH-1/FSD.md`
- `documents/SH-1/TDD.md`

### 1.4 Test Objectives
- Routing chính xác 100% cho tool calling
- Latency P95 < 2s
- Uptime >99% với fallback
- Error mapping OpenAI-compatible

## 2. Test Strategy
### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Correctness properties with random inputs for router selection, health flapping | Automated | hypothesis |
| UT | Unit tests for SmartRouter.select_best_provider, HealthChecker.run, Crawler.parser | Automated | pytest |
| IT | API integration với Hono/FastAPI in-process, SQLite real, mock providers | Automated | pytest + httpx.AsyncClient |
| E2E-API | REST endpoint E2E trên real server, JWT / API key, full request-response | Automated | pytest + test client |
| E2E-UI | N/A for backend-only. Manual visual check for logs/metrics dashboard if exists | Manual | Browser |
| SIT | Manual exploratory edge cases, visual timing, complex UX | Manual | Browser / curl |

### 2.2 Test Types
Functional, Non-Functional, Security, Regression

### 2.3 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 5 | 5 | 0 |
| UT | 12 | 12 | 0 |
| IT | 8 | 8 | 0 |
| E2E-API | 10 | 10 | 0 |
| E2E-UI | 0 | 0 | 0 |
| SIT | 6 | 0 | 6 |
| **Total** | **41** | **35 (85%)** | **6 (15%)** |

Entry/Exit criteria defined per level.

## 3. Test Scope
### In Scope
- UC-01 to UC-06
- FR1-FR5, BR-01 to BR-12
- NFR1-NFR3
- API validation, routing, health, fallback, crawler

### Out of Scope
- UI dashboard
- Billing / paid API management
- Performance load test >100 concurrent (covered separately)

## 4. Test Environment
- Python 3.11+, FastAPI, SQLite test DB
- Mock providers via httpx.MockTransport
- Local llama-server on localhost:8000 for fallback tests
- Browsers: Chrome/Edge for SIT

## 5. Test Schedule
- Phase 1: UT/PBT - 2 days
- Phase 2: IT/E2E-API - 2 days
- Phase 3: SIT/Manual - 1 day

## 6. Resources & Responsibilities
- QA Lead: Test plan & RTM
- QA Engineer: STC execution
- Dev: Bug fix
- BA: UAT support

## 7. Risk & Mitigation
- Provider sập → mock & fallback tests
- Repo structure change → parser fallback test
- Latency >2s → performance gate

## 8. Defect Management
Severity: Critical/Major/Minor/Trivial
Priority P1-P4
SLA: P1 4h, P2 1d, P3 3d, P4 backlog

## 9. Test Metrics
- Execution progress, Pass/Fail rate, Defect density, Coverage %

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| US-1 AC1.1-AC1.5 | BRD | TC-001, TC-101, TC-201 | ✅ |
| US-2 AC2.1-AC2.4 | BRD | TC-102, TC-202 | ✅ |
| US-3 AC3.1-AC3.4 | BRD | TC-003, TC-301, TC-401 | ✅ |
| US-4 AC4.1-AC4.4 | BRD | TC-004, TC-302, TC-402 | ✅ |
| US-5 AC5.1-AC5.4 | BRD | TC-005, TC-203, TC-501 | ✅ |
| US-6 AC6.1-AC6.3 | BRD | TC-006, TC-303 | ✅ |
| BR-01 to BR-12 | FSD | TC-301 to TC-399 | ✅ |
| UC-01 to UC-06 | FSD | TC-001 to TC-006 | ✅ |

![test_coverage](diagrams/test_coverage.png)

*[Edit in draw.io](diagrams/test_coverage.drawio)*
