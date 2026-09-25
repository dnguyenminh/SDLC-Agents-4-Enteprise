# SA4E-308 BRD — Google SSO OIDC Strategy

## Hiện thực
`backend/src/server/auth/strategies/GoogleProviderStrategy.ts:39-147`
- `buildAuthorizeUrl`: `GOOGLE_AUTHORIZE_URL` với PKCE S256, state, nonce, scopes từ `loadGoogleConfig`
- `handleCallback`: exchange code → id_token, verify via `GoogleIdTokenVerifier`, `assertNonce` bằng `decodeJwtPayload`
- `normalize`: `sub`→externalSubjectId, email, `isEmailVerified`, name, groups []

## Config
`backend/src/server/auth/strategies/GoogleProviderConfig.ts` đọc từ bảng `sso_providers` provider_type='google'

## Diagram
![Sequence](diagrams/sequence_detailed.png)

## AC code
1. id_token verify issuer/aud/exp/nonce
2. email_verified false → reject bởi JitProvisioningService
3. `external_provider='google'`
