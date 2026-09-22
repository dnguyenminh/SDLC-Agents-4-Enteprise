# SA4E-308 TDD

![Sequence](diagrams/sequence_detailed.png)

Component: backend/src/server/auth/strategies/GoogleProviderStrategy.ts

Flow: buildAuthorizeUrl -> redirect Google -> callback -> exchange code -> verify id_token -> NormalizedProfile -> JIT

Quyết định: dùng TokenVerifier hiện có, PKCE lưu state store
