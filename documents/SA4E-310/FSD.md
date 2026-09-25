# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise — SA4E-310: [Extension] UI provider selection for Google/GitHub SSO

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-310 |
| Title | [Extension] UI provider selection for Google/GitHub SSO |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-22 |
| Status | Draft |
| Related BRD | documents/SA4E-310/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-22 | BA Agent | Rewrite based on code review sso-dynamic.ts and SsoStrategyRegistry |

---

## 1. Introduction

### 1.1 Purpose

Specify functional behavior for UI provider selection, provider list API, and redirect flow using dynamic SSO routes and strategy registry.

### 1.2 Scope

Functional specification for `GET /sso/providers` and `GET /:provider/login` as implemented in `backend/src/server/routes/auth/sso-dynamic.ts`, UI rendering based on provider list, and registry check via `SsoStrategyRegistry`.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| SSO | Single Sign-On |
| JIT | Just-In-Time provisioning |
| Registry | SsoStrategyRegistry singleton |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-310/BRD.md |
| sso-dynamic.ts | backend/src/server/routes/auth/sso-dynamic.ts |
| SsoStrategyRegistry.ts | backend/src/server/auth/strategies/SsoStrategyRegistry.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![Authorize Callback Verify JIT](diagrams/authorize_callback_verify_jit.png)

System interacts with Extension UI, DB `sso_providers`, and Provider Strategies.

### 2.2 System Architecture

Extension UI → Backend Hono router `createSsoDynamicRoutes` → DB adapter → `ssoStrategyRegistry` → Provider Strategy → External IdP.

---

## 3. Functional Requirements

### 3.1 Feature: Provider List API

**Source:** BRD Story 1

#### 3.1.1 Description

Public endpoint returns enabled providers without secrets.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** Extension UI
**Preconditions:** User on login page
**Postconditions:** UI knows which buttons to render

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | UI | | Calls GET /sso/providers |
| 2 | | Server | Query DB `sso_providers WHERE enabled=1 AND client_id<>''` |
| 3 | | Server | Return providers safe fields |
| 4 | UI | | Render buttons |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | DB error | Return `{ providers: [] }` |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | No providers | UI shows no buttons |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Never expose client_secret/tenant_id | sso-dynamic.ts:12-22 |
| BR-02 | Only advertise providers with enabled=1 and client_id not empty | sso-dynamic.ts:18-20 |

#### 3.1.4 Data Specifications

**Input Data:** None

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| provider_id | string | ID |
| provider_type | string | Type |
| name | string | Display name |
| login_ui_html | string | Optional UI hint |

#### 3.1.5 UI Specifications

**Screen: Login Panel**

![UI Wireframe](diagrams/ui_wireframe.png)
*[Edit in draw.io](diagrams/ui_wireframe.drawio)*

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | Sign in with Google | Button | Y | Call GET /google/login | |
| 2 | Sign in with GitHub | Button | Y | Call GET /github/login | |

#### 3.1.6 API Contract (Functional View)

**Endpoint:** `GET /sso/providers`
**Purpose:** List enabled providers for UI

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| providers | array | List of provider objects |

**Business Error Scenarios:**
| Scenario | User Message | Trigger |
|----------|-------------|---------|
| Empty list | No SSO options | No enabled providers |

---

### 3.2 Feature: Provider Login Redirect

**Source:** BRD Story 2

#### 3.2.1 Description

Validate provider and redirect if strategy registered.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** End User
**Preconditions:** Provider button clicked

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | User | | Click provider button |
| 2 | | Server | GET /:provider/login |
| 3 | | Server | Fetch provider row, check enabled |
| 4 | | Server | Check `ssoStrategyRegistry.has(provider)` |
| 5 | | Server | Redirect to /auth/:provider/login |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Provider known but not implemented | Return 501 |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Provider not found/disabled | Return 404 |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-03 | Redirect only if registry.has(provider) | sso-dynamic.ts:39-41 |
| BR-04 | Use redirect_uri from DB or default base/auth/:provider/callback | sso-dynamic.ts:37 |

#### 3.2.4 API Contract

**Endpoint:** `GET /:provider/login`
**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| provider | string | Y | Must be in KNOWN_PROVIDERS | URL param |

**Output Data:** Redirect 302

**Business Error Scenarios:**
| Scenario | User Message | Trigger |
|----------|-------------|---------|
| Provider not implemented | Provider not implemented yet | registry.has false and known |
| Unknown provider | Unknown provider | Not in KNOWN_PROVIDERS |

---

## 4. Data Model

### 4.1 Entity Relationship Diagram

> No new entities introduced; uses existing `sso_providers`.

#### Entity: sso_providers

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| provider_id | string | Y | PK | |
| provider_type | string | Y | google/github/entra | |
| name | string | Y | | Display name |
| enabled | int | Y | 0/1 | |
| client_id | string | N | Must be non-empty for advertising | |
| redirect_uri | string | N | | |
| login_ui_html | string | N | | |

---

## 5. Integration Specifications

### 5.1 External System: Provider Strategy

| Attribute | Value |
|-----------|-------|
| Purpose | Handle OAuth/OIDC flow |
| Direction | Outbound |
| Data Format | JSON |

---

## 6. Processing Logic

### 6.1 Provider List Retrieval

**Trigger:** GET /sso/providers
**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Query DB for enabled providers | Return empty on error |
| 2 | Map to safe fields | Omit secrets |

![Authorize Callback Verify JIT](diagrams/authorize_callback_verify_jit.png)

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

Public read-only endpoint; no auth required.

### 7.2 Data Sensitivity

Provider list is public; secrets never returned.

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Security | No secret exposure | API response contains no client_secret |
| Performance | Fast list | <200ms |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Provider disabled | Info | Button not shown | UI hides button |
| Provider not implemented | Warning | Provider not implemented yet | Show 501 message |

---

## 10. Testing Considerations

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Enabled providers list | DB has google enabled | Returns google | High |
| TC-02 | Disabled provider hidden | DB has github disabled | Not in list | High |
| TC-03 | Registry check redirect | GET /google/login | 302 to /auth/google/login | High |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| Authorize Callback Verify JIT | [authorize_callback_verify_jit.png](diagrams/authorize_callback_verify_jit.png) |
| UI Wireframe | [ui_wireframe.png](diagrams/ui_wireframe.png) |
| UI Mockup | [ui_mockup.png](diagrams/ui_mockup.png) |

### Change Log from BRD

Aligned functional specs to actual code in sso-dynamic.ts and SsoStrategyRegistry.
