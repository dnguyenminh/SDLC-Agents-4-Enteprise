# Software Test Plan (STP)

## SDLC Agents 4 Enterprise — SA4E-12: Rich LLM Configuration UI

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-12 |
| Title | Rich LLM Configuration UI |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2025-07-26 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-12.docx |
| Related FSD | FSD-v1-SA4E-12.docx |
| Related TDD | TDD-v1-SA4E-12.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | QA Agent – QA Engineer | Create document |
| Peer Reviewer | SM Agent – Scrum Master | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-26 | QA Agent | Initiate document — auto-generated from BRD, FSD, and TDD |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the test plan in this STP |
| | ☐ I agree and confirm the test plan in this STP |

---

## 1. Introduction

### 1.1 Purpose

This test plan defines the strategy, scope, schedule, and resources for testing the **Rich LLM Configuration UI** feature of the SA4E VS Code extension. The feature enhances the existing SettingsPanel with provider selection, secure API key management, dynamic model loading, connection testing, and visual status indicators.

### 1.2 Test Objectives

- Verify all 6 Use Cases (UC-01 to UC-06) from FSD are implemented correctly
- Validate all 19 Business Rules (BR-01 to BR-19) are enforced
- Ensure 7 User Stories with their Acceptance Criteria are satisfied
- Verify security requirements (API keys in SecretStorage, no key in postMessage)
- Validate non-functional requirements (panel open < 500ms, test timeout, WCAG 2.1 AA)
- Confirm webview–extension host message protocol integrity
- Test graceful degradation when external services are unavailable

### 1.3 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-12.docx |
| FSD | FSD-v1-SA4E-12.docx |
| TDD | TDD-v1-SA4E-12.docx |

---

## 2. Test Strategy

### 2.1 Test Levels

| Level | Scope | Automation | Tools |
|-------|-------|------------|-------|
| PBT | Message protocol invariants, state machine properties, config persistence | Automated | fast-check (TypeScript) |
| UT | ProviderConfigService, LlmTestService, SettingsMessageHandler, settings.js functions | Automated | Vitest |
| IT | Webview↔Host message flow, config persistence, model fetching, SecretStorage integration | Automated | Vitest + VS Code Extension Test (Mocha) |
| E2E-API | Connection test flow end-to-end with mock providers, model list fetch | Automated | Vitest + nock/msw (HTTP mocking) |
| E2E-UI | Full Settings Panel UI interactions via Cucumber scenarios | Automated | Playwright + Cucumber |
| SIT | Visual verification, theme switching, keyboard navigation, screen reader | Manual | VS Code + Browser DevTools |

![Test Execution Flow](diagrams/test-execution-flow.png)

### 2.2 Test Types

| Type | Description | Applicable |
|------|-------------|------------|
| Functional Testing | Verify provider selection, key management, model loading, connection test | Yes |
| Regression Testing | Ensure existing Chat Panel, extension activation not broken | Yes |
| Performance Testing | Panel open time, model fetch time, auto-test responsiveness | Yes |
| Security Testing | API key isolation, CSP enforcement, no key in postMessage | Yes |
| Usability Testing | WCAG 2.1 AA, keyboard nav, focus management | Yes |
| Compatibility Testing | VS Code 1.85+, dark/light/high-contrast themes | Yes |

### 2.3 Test Approach

- **Risk-based prioritization**: Security (key leakage) and functional (connection test) are highest priority
- **Automation-first**: PBT, UT, IT, E2E-API cover all logic paths; only visual/UX tests remain manual
- **Mock isolation**: External provider APIs mocked at network layer; SecretStorage mocked for UT, real for IT
- **Theme coverage**: All E2E-UI scenarios run against both dark and light themes
- **Plugin pattern focus**: Extension lifecycle (activate/deactivate), webview lifecycle, host API mocks

### 2.4 Entry Criteria

| Level | Entry Criteria |
|-------|---------------|
| UT | Code compiles, all dependencies installed |
| IT | VS Code extension test host available, mock SecretStorage configured |
| E2E-API | Mock HTTP servers configured for all provider endpoints |
| E2E-UI | Extension packaged, test VS Code instance available |
| SIT | Extension installed in real VS Code, all providers accessible |

### 2.5 Exit Criteria

| Level | Exit Criteria |
|-------|--------------|
| UT | 100% pass, ≥90% branch coverage for services |
| IT | 100% pass, all message types verified |
| E2E-API | 100% pass, all provider scenarios covered |
| E2E-UI | 100% pass, all Gherkin scenarios green |
| SIT | All manual test cases executed, 0 Critical defects, ≤2 Minor UI issues |

### 2.6 E2E Automation Coverage

| Scenario Type | Classification | Rationale |
|--------------|----------------|-----------|
| Provider selection + section visibility | E2E-UI | Deterministic DOM changes |
| API key save/clear/toggle | E2E-UI | Input + button + verify indicator |
| Model dropdown population | E2E-API | API response → UI update |
| Connection test success/failure | E2E-API | HTTP mock → verify result message |
| Auto-test debounce behavior | E2E-API | Timing + HTTP mock |
| Base URL toggle/save | E2E-UI | Checkbox + input + verify config |
| Status badge transitions | E2E-UI | Click → verify badge state |
| Dark/light theme contrast | SIT (manual) | Visual verification |
| Keyboard navigation order | SIT (manual) | Human judgment on focus flow |
| Screen reader announcements | SIT (manual) | Requires assistive technology |

---

## 3. Test Scope

### 3.1 Features In Scope

| # | Feature / Story | Priority | FSD Reference | Test Type |
|---|----------------|----------|---------------|-----------|
| 1 | Provider Selection (6 providers, descriptions, persistence) | High | UC-01, BR-01–BR-04 | Functional + UI |
| 2 | API Key Management (save, clear, toggle, status indicator) | High | UC-02, BR-05–BR-08 | Functional + Security |
| 3 | Dynamic Model Selection (gateway fetch, static fallback, custom model) | High | UC-03, BR-09–BR-12 | Functional + Integration |
| 4 | Connection Testing (manual test, timeout, error messages) | High | UC-04, BR-13–BR-16 | Functional + E2E |
| 5 | Base URL Configuration (default toggle, per-provider URL) | Medium | UC-05, BR-17–BR-19 | Functional |
| 6 | Status Indicators (connection badge, key status, test result) | Medium | UC-06 | UI + Functional |
| 7 | Auto-Test on Provider Change (debounce, silent failure) | Low | Story 7, BR-04, BR-14, BR-16 | Functional |

![Test Coverage](diagrams/test-coverage.png)

### 3.2 Features Out of Scope

| # | Feature | Reason |
|---|---------|--------|
| 1 | Backend LLM service configuration | Separate concern (backend module) |
| 2 | New LLM provider integrations | Separate ticket |
| 3 | Chat Panel model selector redesign | Only sync verification needed |
| 4 | ONNX model download progress UI | Existing native-addon-manager handles this |
| 5 | OAuth/SSO integration with providers | Not in scope for SA4E-12 |

---

## 4. Test Environment

### 4.1 Environment Requirements

| Environment | Setup | Purpose |
|-------------|-------|---------|
| UT/IT | Node.js 18+, Vitest, VS Code Extension Test Host | Unit + Integration tests |
| E2E-API | Mock HTTP servers (nock/msw), test extension host | API-level E2E |
| E2E-UI | VS Code instance + Playwright, extension packaged | Browser UI automation |
| SIT | Real VS Code 1.85+, real provider accounts (test keys) | Manual exploratory |

### 4.2 VS Code Version Requirements

| Version | Theme | OS | Required |
|---------|-------|-----|----------|
| VS Code 1.85+ | Dark+ (default dark) | Windows 10/11 | Yes |
| VS Code 1.85+ | Light+ (default light) | macOS | Yes |
| VS Code 1.85+ | High Contrast | Windows | Yes (accessibility) |

### 4.3 Test Data Requirements

| Data Type | Description | Source | Preparation |
|-----------|-------------|--------|-------------|
| Provider configs | 6 provider configurations with URLs | Static (test-data/providers.csv) | Pre-configured |
| API keys | Valid/invalid/empty keys per provider | Static (test-data/api-keys.csv) | Test keys from providers |
| Model lists | Static + gateway responses | Mock server / static catalog | Pre-defined JSON |
| VS Code settings | kiroSdlc.* configuration entries | VS Code workspace settings | Test fixture |

### 4.4 External Dependencies

| System | Dependency | Mock/Stub Available |
|--------|-----------|---------------------|
| Anthropic API | /v1/models endpoint, isAvailable check | Yes — nock/msw mock |
| OpenAI API | /v1/models endpoint | Yes — nock/msw mock |
| Ollama | /api/tags endpoint | Yes — local mock server |
| LM Studio | /v1/models endpoint | Yes — nock/msw mock |
| VS Code SecretStorage | Encrypted key storage | Yes — MockSecretStorage in tests |
| LLM Gateway (localhost:48721) | /v1/models proxy | Yes — mock HTTP server |

---

## 5. Test Schedule

| Phase | Start Date | End Date | Duration | Milestone |
|-------|-----------|----------|----------|-----------|
| Test Planning | Day 1 | Day 2 | 2 days | STP + STC approved |
| Test Data Preparation | Day 2 | Day 3 | 1 day | Test data + mocks ready |
| UT + PBT Execution | Day 3 | Day 4 | 2 days | All unit tests pass |
| IT Execution | Day 4 | Day 5 | 1 day | Integration tests pass |
| E2E-API Execution | Day 5 | Day 6 | 1 day | API E2E tests pass |
| E2E-UI Execution | Day 6 | Day 7 | 1 day | UI E2E scenarios pass |
| SIT Execution | Day 7 | Day 8 | 2 days | Manual tests complete |
| Defect Fix & Retest | Day 8 | Day 9 | 1 day | All Critical/Major fixed |
| Sign-off | Day 9 | Day 10 | 1 day | Test completion report |

---

## 6. Resources & Responsibilities

| Role | Name | Responsibility |
|------|------|---------------|
| Test Lead | QA Agent | Test planning, coordination, reporting |
| QA Engineer | QA Agent | Test case design, execution, defect reporting |
| BA | BA Agent | Acceptance criteria clarification, UAT support |
| Developer | DEV Agent | Bug fixing, unit test coverage, mock setup |
| DevOps | DevOps Agent | CI pipeline, test environment |

---

## 7. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| 1 | Provider test API keys expire/rate-limited | Medium | Medium | Use mock servers for automated tests; real keys only for SIT |
| 2 | VS Code Extension Test Host instability | High | Low | Pin VS Code version, retry flaky tests |
| 3 | SecretStorage unavailable in CI | Medium | Medium | MockSecretStorage for UT/IT; real storage only in SIT |
| 4 | Webview CSP blocks test scripts | High | Low | Use nonce injection pattern matching production |
| 5 | Gateway endpoint changes | Low | Low | Mock at network layer; contract tests catch drift |
| 6 | Theme CSS variable changes in new VS Code | Low | Medium | Test against minimum supported version |

---

## 8. Defect Management

### 8.1 Severity Levels

| Severity | Definition | Example |
|----------|-----------|---------|
| Critical | API key exposed, extension crash, data loss | Key appears in postMessage/logs |
| Major | Feature not working, no workaround | Connection test always fails; model list empty |
| Minor | UI cosmetic, workaround exists | Badge color wrong; alignment off |
| Trivial | Typo, minor spacing | Label typo |

### 8.2 Priority Levels

| Priority | Definition | SLA (Fix Time) |
|----------|-----------|----------------|
| P1 | Security issue or blocker | 4 hours |
| P2 | Must fix before release | 1 business day |
| P3 | Should fix if time permits | 3 business days |
| P4 | Nice to fix, can defer | Next release |

### 8.3 Defect Lifecycle

```
New → Open → In Progress → Fixed → Ready for Retest → Verified → Closed
                                                     → Reopened → In Progress
```

---

## 9. Test Metrics & Reporting

### 9.1 Metrics

| Metric | Formula | Target |
|--------|---------|--------|
| Test Execution Rate | Executed / Total × 100% | 100% |
| Pass Rate | Passed / Executed × 100% | ≥ 95% |
| Defect Density | Defects / Test Cases | ≤ 0.1 |
| Critical Defect Count | Count of Critical severity | 0 |
| Automation Rate | Automated / Total × 100% | ≥ 80% |
| Requirements Coverage | Covered Requirements / Total × 100% | 100% |

### 9.2 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 5 | 5 | 0 |
| UT | 24 | 24 | 0 |
| IT | 10 | 10 | 0 |
| E2E-API | 8 | 8 | 0 |
| E2E-UI | 12 | 12 | 0 |
| SIT | 6 | 0 | 6 |
| **Total** | **65** | **59 (91%)** | **6 (9%)** |

### 9.3 Reporting Schedule

| Report | Frequency | Audience |
|--------|-----------|----------|
| Daily Test Status | Daily during execution | Project team |
| Defect Summary | Daily | Dev team |
| Test Completion Report | End of each level | All stakeholders |

---

## 10. Appendix

### Glossary

| Term | Definition |
|------|------------|
| PBT | Property-Based Testing — randomized input testing for invariant verification |
| UT | Unit Testing — isolated function/method tests |
| IT | Integration Testing — component interaction tests with real/mocked dependencies |
| E2E-API | End-to-End API Testing — full request/response flow without browser |
| E2E-UI | End-to-End UI Testing — browser-based automation |
| SIT | System Integration Testing — manual exploratory testing |
| CSP | Content Security Policy |
| SecretStorage | VS Code encrypted credential storage API |

### Assumptions

- VS Code 1.85+ is the minimum supported version
- Test API keys are available for Anthropic and OpenAI (test tier)
- CI environment supports VS Code Extension Test Host
- Mock servers (nock/msw) accurately represent provider API behavior
- ONNX local model testing not needed (existing infrastructure)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Test Coverage | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 2 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |
