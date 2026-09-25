# SA4E-308 FSD — Google SSO OIDC Strategy

## Functional Requirements
FR1: GoogleProviderStrategy.buildAuthorizeUrl tạo URL GOOGLE_AUTHORIZE_URL với client_id, response_type=code, redirect_uri, scope từ config, code_challenge S256, code_challenge_method=S256, state, nonce. Config tải từ loadGoogleConfig đọc bảng sso_providers provider_type='google'
FR2: GoogleProviderStrategy.handleCallback nhận code, codeVerifier, nonce từ params/storedState, trao đổi code lấy id_token qua GOOGLE_TOKEN_URL với client_secret và code_verifier
FR3: Verify id_token bằng GoogleIdTokenVerifier với audience = clientId, kiểm tra signature RS256, issuer, aud, exp
FR4: assertNonce kiểm tra nonce trong payload id_token khớp expectedNonce, nếu không ném invalid_nonce 401
FR5: Normalize claims thành NormalizedProfile: provider='google', externalSubjectId=sub, email, emailVerified qua isEmailVerified, name, groups=[]
FR6: Registry đăng ký GoogleProviderStrategy qua strategies/index.ts

## Non-Functional
NFR1: Không log id_token/access_token/secret, config lấy từ DB, secret quản lý qua Admin UI
NFR2: PKCE S256 bắt buộc, state/nonce chống CSRF/replay

## Diagram
![Sequence](diagrams/sequence_detailed.png)
