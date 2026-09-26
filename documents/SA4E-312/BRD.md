# Business Requirements Document (BRD)

## SA4E-Agents — SA4E-312: [QA/Docs] Multi-provider SSO test planning + documentation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-312 |
| Title | [QA/Docs] Multi-provider SSO test planning + documentation |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-22 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | — | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-22 | BA Agent | Initial BRD auto-generated from Jira ticket SA4E-312 and linked tickets SA4E-307/308/309/310 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope
This BRD defines requirements for QA test planning + documentation update for multi-provider SSO. Scope includes:
- RTM coverage 100% for new Acceptance Criteria of Google and GitHub provider strategies
- Test planning STP/STC for Google OIDC + PKCE and GitHub OAuth2 non-OIDC flows
- Documentation update for auth-sso: add sequence diagrams for Google OIDC and GitHub OAuth2, config reference per provider, architectural differences PKCE/nonce/state
- Verification that code implementation reflects Strategy pattern, JitProvisioningService refactoring, and sso-dynamic registry dispatch

The work depends on backend implementation tickets SA4E-307 Strategy abstraction, SA4E-308 Google SSO, SA4E-309 GitHub SSO, SA4E-310 UI provider selection.

### 1.2 Out of Scope
- Implementation of provider strategies themselves — already done in SA4E-307/308/309
- UI implementation — done in SA4E-310
- Security review hardening — covered in SA4E-... separate
- Production deployment / infra changes

### 1.3 Preliminary Requirement
- Backend Strategy pattern implemented and verified: SsoProviderStrategy interface, SsoStrategyRegistry, EntraProviderStrategy, GoogleProviderStrategy, GitHubProviderStrategy
- JitProvisioningService accepts NormalizedProfile, no hardcode 'entra'
- sso-dynamic routes dispatch via registry, returns 501 for unimplemented providers
- Documents/SA4E-262/MULTI-PROVIDER-SSO-PLAN.md exists as design baseline
- Existing STP/STC artifacts for multi-provider SSO exist and can be extended

---

## 2. Business Requirements

### 2.1 High Level Process Map

![Authorize Callback Verify JIT](diagrams/authorize_callback_verify_jit.png)
*[Edit in draw.io](diagrams/authorize_callback_verify_jit.drawio)*

High level business flow for any SSO provider:
User initiates sign-in → backend builds authorize URL via Strategy → redirect to IdP → user authenticates → IdP redirects back with code/state → Strategy exchanges code and verifies token/userinfo → normalize to NormalizedProfile → JitProvisioningService provisions/links user → session returned.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a QA Engineer, I want RTM mapping for Google/GitHub AC so that test coverage is traceable | MUST HAVE | SA4E-312 |
| 2 | As a Technical Writer, I want updated auth-sso docs with Google OIDC and GitHub OAuth2 sequences so that admins can configure providers correctly | MUST HAVE | SA4E-312 |
| 3 | As a Product Owner, I want docs describing per-provider config reference and PKCE/nonce differences so that architectural distinctions are clear | SHOULD HAVE | SA4E-312 |
| 4 | As a Developer, I want Strategy pattern verified against code so that multi-provider extensibility is documented | SHOULD HAVE | SA4E-307 |
| 5 | As a User, I want to sign in with Google via OIDC PKCE so that JIT creates/links account | MUST HAVE | SA4E-308 |
| 6 | As a User, I want to sign in with GitHub via OAuth2 so that JIT creates/links account | MUST HAVE | SA4E-309 |

### 2.3 Details of User Stories

#### Business Flow

**Step 1:** QA reviews SA4E-307/308/309 AC and extracts testable requirements
**Step 2:** QA creates/update STP with test strategy for Google/GitHub
**Step 3:** QA creates/update STC with test cases covering authorize, callback, verification, JIT, error scenarios
**Step 4:** BA/Tech Writer updates auth-sso documentation with sequences and config reference
**Step 5:** RTM links each AC to test case ID
**Step 6:** Sign-off

> **Note:** GitHub flow does NOT use PKCE/nonce; uses state only. Google uses OIDC PKCE + nonce.

#### STORY 1: RTM coverage for Google/GitHub

> As a QA Engineer, I want RTM mapping for Google/GitHub AC so that test coverage is traceable

**Requirement Details:**
1. RTM must cover 100% of new Acceptance Criteria from SA4E-308 and SA4E-309
2. RTM must reference source tickets and BRD story IDs
3. RTM must indicate pass/fail status after test execution

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| AC_ID | String | Yes | Acceptance Criteria identifier | SA4E-308-AC1 |
| TC_ID | String | Yes | Test case identifier | TC-SSO-GOOG-001 |
| Status | Enum | Yes | Coverage status | Covered / Not Covered |

**Acceptance Criteria:**
1. RTM table contains entries for all ACs from SA4E-308 and SA4E-309
2. Each AC maps to at least one test case in STC
3. RTM is included in STP/STC documentation

**Validation Rules:**
- AC_ID must reference existing ticket AC
- No duplicate TC mapping without justification

**Error Handling:**
- Missing AC mapping → raise documentation defect
- Orphan test case → flag for review

#### STORY 2: Update auth-sso docs with sequences

> As a Technical Writer, I want updated auth-sso docs with Google OIDC and GitHub OAuth2 sequences so that admins can configure providers correctly

**Requirement Details:**
1. Docs must include sequence diagram for Google OIDC + PKCE flow
2. Docs must include sequence diagram for GitHub OAuth2 flow with /user and /user/emails calls
3. Docs must reference code implementation: strategies, JitProvisioningService, sso-dynamic registry
4. Config reference per provider: client_id, client_secret, redirect_uri, scopes, PKCE/nonce support

**Acceptance Criteria:**
1. auth-sso documentation updated with Google OIDC sequence
2. auth-sso documentation updated with GitHub OAuth2 sequence
3. Config reference table per provider exists
4. Architectural differences PKCE/nonce/state documented

**UI Specifications:**
N/A

**Validation Rules:**
- Sequence diagrams must match actual code flow observed in EntraProviderStrategy, GoogleProviderStrategy, GitHubProviderStrategy
- Config fields must match sso_providers schema

**Error Handling:**
- Diagram mismatch → document correction required

#### STORY 3: Document architectural differences

> As a Product Owner, I want docs describing per-provider config reference and PKCE/nonce differences so that architectural distinctions are clear

**Requirement Details:**
1. Table comparing Entra, Google, GitHub: protocol, token type, verification method, PKCE, nonce, state, email verification source
2. Note GitHub has no id_token/JWKS, uses userinfo API
3. Note Google uses id_token JWT RS256 + JWKS
4. Note Entra uses id_token JWT RS256 + JWKS + xms_edov

**Acceptance Criteria:**
1. Comparison table present in docs
2. PKCE/nonce differences explicitly stated

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Strategy abstraction | System | SA4E-307 | SsoProviderStrategy, Registry, JitProvisioningService refactor |
| Google provider | System | SA4E-308 | GoogleProviderStrategy OIDC PKCE |
| GitHub provider | System | SA4E-309 | GitHubProviderStrategy OAuth2 |
| UI selection | System | SA4E-310 | Login buttons render from /sso/providers |
| Design plan | Reference | SA4E-262 | MULTI-PROVIDER-SSO-PLAN.md |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter | Duc Nguyen Minh | Ticket owner | SA4E-312 |
| QA | QA Team | STP/STC/RTM | SA4E-312 |
| BA | BA Agent | BRD/FSD author | SA4E-312 |
| Dev | Backend Team | Strategy implementation | SA4E-307/308/309 |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Code drift between docs and implementation | Medium | Medium | Code review based on actual files strategies/*.ts, JitProvisioningService.ts, sso-dynamic.ts |
| GitHub email verification edge cases | High | Medium | Test cases cover primary+verified email fallback |
| Missing RTM coverage | High | Low | Checklist AC → TC mapping |

### 5.2 Assumptions
- Strategy pattern already implemented as per code review
- JitProvisioningService accepts NormalizedProfile
- sso-dynamic dispatches via registry
- Docs base auth-sso exists

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Security | Email verified gate | emailVerified must be true for JIT/link |
| Security | CSRF protection | state validated for all providers |
| Performance | Callback latency | No specific target, should match Entra baseline |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-312 | [QA/Docs] Multi-provider SSO test planning + documentation | To Do | Task | Main ticket |
| SA4E-307 | [Backend] SSO Provider Strategy abstraction + registry + refactor Entra | To Do | Story | Depends |
| SA4E-308 | [Backend] Google SSO provider strategy | To Do | Story | Depends |
| SA4E-309 | [Backend] GitHub SSO provider strategy | To Do | Story | Depends |
| SA4E-310 | [Extension] UI provider selection | To Do | Story | Depends |

---

## 8. Appendix

### Diagram Index

| Diagram | File |
|---------|------|
| Authorize Callback Verify JIT Flow | [authorize_callback_verify_jit.png](diagrams/authorize_callback_verify_jit.png) |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| MULTI-PROVIDER-SSO-PLAN | documents/SA4E-262/MULTI-PROVIDER-SSO-PLAN.md |
| Strategy Interface | backend/src/server/auth/strategies/SsoProviderStrategy.ts |
| JitProvisioningService | backend/src/server/services/JitProvisioningService.ts |
| sso-dynamic routes | backend/src/server/routes/auth/sso-dynamic.ts |
