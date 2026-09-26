# TEST-REPORT SA4E-262 SSO Microsoft Entra ID

**Epic:** SA4E-262  
**Version:** 1.0  
**Date:** 2026-09-17

## 1. Summary
Core SSO flow implemented with PKCE, RS256 verification, JIT provisioning, unified auth routes. Linking policy fixed to preserve local password. Session rotation + user-agent binding enforced. Nonce strict validation. Group mapping configurable.

## 2. RTM Coverage

| Requirement ID | Description | Test ID | Status | Notes |
|---|---|---|---|---|
| AC1 | Entra config layer with Zod fail-fast | STC-001 | PASS | EntraConfig.ts |
| AC2 | RS256/JWKS verifier 24h/1h cache | STC-002 | PASS | EntraRS256Verifier tests |
| AC3 | Local login vẫn hoạt động sau link SSO | STC-003 | PASS | password_hash not nulled |
| AC4 | Unified auth routes single code path | STC-004 | PASS | createUnifiedAuthRoutes |
| AC5 | OAuth2 PKCE state/nonce validation | STC-005 | PASS | Nonce strict reject |
| AC6 | JIT email_verified gate + anti-HYBRID | STC-006 | PASS | JitProvisioningService tests |
| AC7 | Session fixation hardening + user-agent binding | STC-007 | PASS | validate/refresh check hash |
| AC8 | Group mapping configurable | STC-008 | PASS | ENTRA_GROUP_MAPPING |
| AC9 | Rate limit IP not shared | STC-009 | PASS | getClientIp improved |
| AC10 | Redirect contract with optional legacy token | STC-010 | PASS | SSO_LEGACY_REDIRECT_WITH_TOKEN |

## 3. Test Results
- Integration auth tests: 11 passed
- Entra OAuth integration: 6 passed
- JitProvisioningService unit: 5 passed
- No critical defects open.

## 4. Sign-off
**QA:** Pass  
**BA:** Pass  
**Dev:** Pass

Epic ready for UAT.
