# SA4E-309 TDD

![Sequence](diagrams/sequence_detailed.png)

Component: GitHubProviderStrategy.ts

Flow: authorize -> callback -> exchange token -> userinfo API -> normalize -> JIT

Lưu ý: GitHub không OIDC, verify bằng API call + email verified field
