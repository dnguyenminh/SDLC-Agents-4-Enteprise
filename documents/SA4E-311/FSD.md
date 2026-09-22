# Functional Specification Document (FSD)

## SA4E-311 — Security Review Multi-Provider SSO Hardening

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-311 |
| Title | [Security] Multi-provider SSO hardening review |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-22 |
| Status | Draft |
| Related BRD | documents/SA4E-311/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-22 | BA Agent | Initial rewrite from code review |

---

## 1. Introduction

### 1.1 Purpose

Specify functional behavior of security controls for multi-provider SSO: state/nonce/PKCE per provider, email verification gate, anti account-takeover policies, no logging of secrets, redirect allowlist, and rate limiting.

### 1.2 Scope

Functional view of EntraProviderStrategy, GoogleProviderStrategy, GitHubProviderStrategy, JitProvisioningService, sso-dynamic routes. Technical implementation details deferred to TDD.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| PKCE | Proof Key for Code Exchange S256 |
| JIT | Just-In-Time provisioning |
| OIDC | OpenID Connect |
| NormalizedProfile | Provider-agnostic profile |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-311/BRD.md |
| MULTI-PROVIDER-SSO-PLAN | documents/SA4E-262/MULTI-PROVIDER-SSO-PLAN.md |

---

## 2. System Overview

### 2.1 System Context Diagram

![Authorize Callback Verify JIT](diagrams/authorize_callback_verify_jit.png)
*[Edit in draw.io](diagrams/authorize_callback_verify_jit.drawio)*

System interacts with Entra ID, Google, GitHub IdPs, and internal users DB.

### 2.2 System Architecture

Provider strategies registered in SsoStrategyRegistry. sso-dynamic routes dispatch to strategy.buildAuthorizeUrl / handleCallback. JitProvisioningService consumes NormalizedProfile.

---

## 3. Functional Requirements

### 3.1 Feature: Provider Strategy Security Controls

**Source:** BRD Story 1

#### 3.1.1 Description

Each provider strategy implements buildAuthorizeUrl and handleCallback with provider-specific security controls.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** User / Security Auditor
**Preconditions:** Provider enabled in sso_providers.
**Postconditions:** Secure callback processed or rejected.

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | User | | Select provider |
| 2 | | Server | Build authorize URL with PKCE/state/nonce |
| 3 | User | IdP | Authenticate |
| 4 | IdP | Server | Redirect with code/state |
| 5 | | Server | Verify state/nonce/emailVerified |
| 6 | | Server | JIT provision |
| 7 | | Server | Issue session |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | GitHub | No PKCE/nonce, state only |
| AF-2 | Existing external identity | Update last login, no create |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | State mismatch | Return 401 invalid_state |
| EF-2 | Nonce mismatch | Return 401 invalid_nonce |
| EF-3 | Email unverified | Reject with error |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Entra/Google authorize must use PKCE S256 | EntraProviderStrategy.ts:43 |
| BR-02 | Nonce must be generated and verified against id_token | EntraProviderStrategy.ts:99-103 |
| BR-03 | GitHub must assert state CSRF | GitHubProviderStrategy.ts:71-76 |
| BR-04 | No token/secret logged | sso-dynamic.ts:12-24 |
| BR-05 | Email verified gate before link/create | JitProvisioningService.ts:86-91 |

#### 3.1.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| code | string | Y | non-empty | Authorization code |
| state | string | Y | matches stored | CSRF token |
| nonce | string | Y OIDC | matches id_token | Replay protection |
| code_verifier | string | Y OIDC | base64url | PKCE verifier |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| NormalizedProfile.provider | string | entra/google/github |
| NormalizedProfile.emailVerified | boolean | Verification flag |
| user_id | string | Provisioned user |

#### 3.1.5 UI Specifications

N/A - backend only.

#### 3.1.6 API Contract

**Endpoint:** GET /sso/providers
**Purpose:** List enabled providers safe fields.
**Output:** providers[] with provider_id, provider_type, name, login_ui_html.
**Business Error:** empty list if error.

---

### 3.2 Feature: JIT Provisioning Security Gates

**Source:** BRD Story 2

#### 3.2.1 Description

JitProvisioningService enforces emailVerified, anti-HYBRID, anti-local auto-link.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** System
**Preconditions:** NormalizedProfile received
**Postconditions:** User created/linked or rejected with audit.

**Main Flow:**
1. Check external identity exists → update last login.
2. Check email match → verify emailVerified, account_type, not already linked, not LOCAL.
3. Create new user if emailVerified.

**Exception Flows:**
- EF-01 Email not verified → audit SSO_LINK_REJECTED_EMAIL_NOT_VERIFIED.
- EF-02 Account type HYBRID → audit SSO_LINK_REJECTED_HYBRID_ACCOUNT.
- EF-03 Local account → audit SSO_LINK_REJECTED_LOCAL_NO_AUTOLINK.

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-06 | Never auto-link SSO to LOCAL account | JitProvisioningService.ts:110-113 |
| BR-07 | Reject HYBRID account_type | JitProvisioningService.ts:93-96 |
| BR-08 | Email must be verified for JIT create | JitProvisioningService.ts:126-129 |

---

## 4. Data Model

Logical entities: users, sso_providers.

### 4.2 Logical Entities

#### Entity: users
| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| user_id | string | Y | | Primary key |
| email | string | Y | | Lowercased |
| account_type | string | Y | BR-06/07 | LOCAL/SSO |
| external_provider | string | N | | entra/google/github |
| external_subject_id | string | N | | oid/sub/id |
| email_verified | boolean | Y | BR-05 | |

---

## 5. Integration Specifications

### 5.1 External System: Entra ID
| Attribute | Value |
|-----------|-------|
| Purpose | OIDC authentication |
| Direction | Inbound |
| Data Format | JWT |
| Frequency | Real-time |

### 5.2 External System: Google
Same as Entra.

### 5.3 External System: GitHub
OAuth2, no OIDC. Calls /user and /user/emails.

---

## 6. Processing Logic

### 6.1 Callback Verify Flow

**Trigger:** GET /auth/{provider}/callback
**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Retrieve stored state/nonce/code_verifier | 400 if missing |
| 2 | Exchange code for token | 502 on failure |
| 3 | Verify JWT signature/claims/nonce | 401 invalid_nonce |
| 4 | Resolve verified email | 403 email_not_verified |
| 5 | JIT provision | Audit reject |

**Activity Diagram:**
![Authorize Callback Verify JIT](diagrams/authorize_callback_verify_jit.png)

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions |
|------|-------------|
| Authenticated User | Initiate SSO |
| System | Verify tokens |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Requirement |
|-----------|----------------|-------------|
| client_secret | Restricted | Never log/expose |
| id_token | Confidential | Verify then discard |
| access_token | Confidential | No log |

### 7.3 Audit Trail

| Event | Logged Fields | Retention |
|-------|---------------|-----------|
| SSO_JIT_PROVISION | user_id,email,provider | 1 year |
| SSO_LINK_REJECTED_* | email,provider,reason | 1 year |

---

## 8. Non-Functional Requirements

| Category | Requirement | Acceptance Criteria |
|----------|-------------|---------------------|
| Security | PKCE S256 for OIDC | Present in URL |
| Security | State CSRF enforced | 401 on mismatch |
| Security | No secret logging | Code review passes |

---

## 9. Error Handling

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|--------------|-------------------|
| invalid_state | Critical | Invalid session | Redirect to login error |
| invalid_nonce | Critical | Token mismatch | Reject login |
| email_not_verified | Warning | Email not verified | Reject linking |

---

## 10. Testing Considerations

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | State mismatch GitHub | wrong state | 401 | High |
| TC-02 | Nonce mismatch Google | tampered nonce | 401 | High |
| TC-03 | Unverified email | email_verified false | Reject | High |
| TC-04 | Local auto-link attempt | existing LOCAL user | Reject | High |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| Authorize Callback Verify JIT Security Flow | [authorize_callback_verify_jit.png](diagrams/authorize_callback_verify_jit.png) |
| Edit source | [authorize_callback_verify_jit.drawio](diagrams/authorize_callback_verify_jit.drawio) |

### Change Log from BRD

FSD adds functional use cases, business rules IDs, data specs, API contract and audit requirements derived from code review.
