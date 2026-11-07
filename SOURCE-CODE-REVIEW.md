# Source Code Review — SDLC-Agents-4-Enterprise (v1.55.16)

> **Adversarial, evidence-based review of the application code** in `backend/src/`, `extension/src/`, and `source/slash/`.
> Findings are grounded in actual source; every issue cites a file path, function, and line.

---

## 0. Correction of the previous review

The prior `SOURCE-CODE-REVIEW.md` (dated 2026-10-17, version 1.53.4) is **factually wrong** about this project and must not be trusted:

| Claim in old review | Reality (verified) |
|---|---|
| "Kotlin/Ktor/SQLDelight backend" | **No.** Backend is **TypeScript + Hono** (HTTP framework), MCP SDK, SQLite/PostgreSQL, `jose`-style HS256 JWT, `zod`, `ajv`. (`backend/package.json`, `backend/src/index.ts`, `HttpServer.ts`.) |
| "284 files / 3,079 tests / 1,349+ nodes" | **No.** `backend/src` = **1,632 TS files / ~151.8k LOC**; `extension/src` = **1,305 TS files / ~133.7k LOC**; `source/slash` = **6 files**. No Kiro/Pi "nodes" concept. |
| "Kiro multi-agent orchestrator" | Partially true in spirit — a **module-registry DI container** + Hono HTTP server + Streamable-HTTP MCP endpoint — but implemented in TS, not Kotlin. |

**Correct architecture (from source):**
- **Backend** (`backend/src/`): Hono app assembled by `createConfiguredApp()` in `HttpRouteRegistrar.ts`. A `ModuleRegistry` DI container (lazy modules: `memory`, `orchestration`, `knowledge`, `pega`, …). DB layer in `admin/db/` with a parameterized `DbAdapter`. Streamable-HTTP MCP transport mounted at `/mcp`. Binds **only to `127.0.0.1`** (`HttpServer.ts`) — no direct network exposure.
- **Extension** (`extension/src/`): VS Code extension on Kiro/Pi agent libraries, Svelte 5 UI, `puppeteer-core`, and a corporate-proxy subsystem (`proxy/`) with curl/PowerShell subprocess transports. Auth is a `AuthManager` state machine in `extension/src/auth/`.
- **Slash commands** (`source/slash/`): re-exports the `slashMenu` singleton and registers command handlers (`copy`, `debug`, `help`, `init`, `sessions`, `skills`, `status`, `thinking`).

The rest of this document is the **genuine review**.

---

## 1. Security findings

### SEC-1 (Medium) — CSP deliberately downgraded to `unsafe-inline` / `unsafe-eval`

`backend/src/server/middleware/security-headers.ts` sets:

```
script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net
```

Rationale (in-code comment): the admin SPA uses inline scripts + Babel `eval` + CDN libs. This is a **known CSP downgrade** — if the CSP is ever bypassed (e.g. via a reflected XSS in the SPA or a same-origin token leak into an embeddable view), injected script/eval will execute. `object-src 'none'`, `base-uri 'self'`, and locked `connect-src 'self'` are good compensating controls, but `'unsafe-eval'` defeats the main defense-in-depth purpose of CSP. **Recommendation:** move Babel to `'strict-dynamic'` + a nonce, or ship Babel as a build step so `eval` is eliminated, and tighten `script-src`.

### SEC-2 (Medium) — Anonymous fallback in no-auth mode lets any client self-assign identity

`CODE_INTEL_REQUIRE_AUTH` defaults to *not set*, which enables **anonymous mode** across the API. In `backend/src/server/routes/tools.ts`, `stampUserId()`:

```ts
} else if (!isApiKeyAuthEnabled()) {
  const userId = c.req.header('X-User-Id') || c.req.header('x-user-id');
  if (userId) { logger.warn({ userId }, 'X-User-Id header used without verified auth — identity unverified'); args.__userId = userId; }
}
```

In no-auth mode an unauthenticated client can set `X-User-Id` and have it stamped as their `__userId`. `jwtAuthStrict` on `/api/v1/*` correctly fails closed, but `/api/tools`, `/api/admin/*`, and `/api/tags/*` fall back to this **unverified self-assignment**. **Recommendation:** no-auth mode should be development-only (documented in CI gating) and never enabled in production; `X-User-Id` should be rejected outright (401) rather than logged-and-used.

### SEC-3 (Medium) — Streaming ingest endpoint has no per-request size cap (DoS vector)

`HttpRouteRegistrar.ts` applies a 100 MB global `bodyLimit` to `*` **except** `/api/v1/pega/ingest-stream`:

```ts
app.use('*', async (c, next) => {
  if (c.req.path === '/api/v1/pega/ingest-stream') return next();
  return bodyLimit({ maxSize: 100 * 1024 * 1024 })(c, next);
});
```

The stream handler (`backend/src/server/routes/pega-stream.ts`) reads the NDJSON body line-by-line but still accumulates **every line into an in-memory `string[]`**, then buffers the raw text per line. There is **no per-request cap on the stream body**, so a client can send an unbounded NDJSON payload and exhaust host memory before processing finishes. **Recommendation:** add an explicit `bodyLimit` (or a max-line-count / max-bytes guard) on the ingest-stream route, and cap the buffered `lines[]` (e.g. drop/skip lines beyond a configured threshold with a `413`).

### SEC-4 (Low–Medium) — Tool output can trigger an arbitrary in-workspace file write

`extension/src/mcp/mcp-bridge.ts` `interceptResponse()`:

```ts
const filename = resultObj._filename || `output_${Date.now()}.bin`;
const outPath = path.join(tmpDir, filename);
fs.writeFileSync(outPath, Buffer.from(resultObj._base64_file, 'base64'));
```

`_base64_file` / `_filename` originate from tool/LLM output. `path.join` normalizes `..`, so writes are **confined to `<workspace>/documents/tmp/`** — no true filesystem escape. Still, this is an **arbitrary file-creation path driven by agent/tool output** with **no base64 validation** (`Buffer.from` silently produces garbage on invalid input) and no extension/size guard. **Recommendation:** validate base64 strictly, enforce a filename whitelist/regex (no dots/allowed extensions), and size-limit the write.

### SEC-5 (Low–Medium) — HS256 API-key comparison in the tools route is not constant-time

`backend/src/server/routes/tools.ts` `resolveCallerIdentity()`:

```ts
if (!provided || provided !== envKey) return null;
```

The dedicated `apiKeyAuth` middleware (`middleware/api-key-auth.ts`) correctly uses `timingSafeEqual`, but the tools route uses a plain `===` comparison of the API key — a **timing side-channel** that leaks key length. **Recommendation:** route API-key checks through the existing `safeCompare`/`timingSafeEqual` helper.

### SEC-6 (Low) — Single shared HS256 secret signs both access JWTs and opaque session tokens

`backend/src/admin/db/jwt.ts` uses one secret (`KB_TOKEN_SECRET` env, or a `0o600` provisioned `<dataDir>/.jwt-secret`, or an ephemeral per-process value) to HMAC-sign **both** the 15-min access JWTs and the opaque session tokens (`SessionService.validate`). If the secret file/disk is shared across environments or the secret is leaked, **all tokens can be forged**. The JWT auth middleware accepts any 3-part token and verifies it against this secret (`jwt-auth.ts` `verifyHs256`). **Recommendation:** treat `.jwt-secret` as a high-sensitivity artifact (restrict filesystem permissions to the owner user/group, rotate on deploy), and consider per-role signing keys for long-lived session tokens vs. short-lived access tokens.

### SEC-7 (Low) — `/api/admin/*` and `/api/tools` rely on internal per-route auth (not global middleware)

Only `/api/v1/*`, `/api/v1/pega/*`, `/api/index/*`, `/api/tags/*`, `/mcp/*` are gated by the global middleware chain. `/api/admin/*` and `/api/tools` depend on each route calling `ctx.requireAuth()` (confirmed in `admin/index.ts`, `tools.ts`). This is **not a bug** — the audited routes all enforce auth — but it is a **design smell**: a missed `requireAuth` in any future admin/tool route silently exposes it. **Recommendation:** add a static/lint gate (or a route registry) that flags handler functions lacking a `requireAuth` call.

---

## 2. Bugs

### BUG-1 (Low) — `McpBridge.callTool` timeout does not cancel the in-flight MCP call

`extension/src/mcp/mcp-bridge.ts` races `invokeTool()` against a `setTimeout` via `Promise.race`. On timeout the timer rejects, but `this.mcpManager.invokeTool(...)` is **not cancelled** — the underlying request keeps running in the background after the call returns `McpToolTimeoutError`. Concurrent calls can also leave multiple in-flight requests. **Recommendation:** support aborting the MCP call (e.g. an `AbortSignal` passed to the manager, if the SDK supports it), or at least log/track orphaned calls.

### BUG-2 (Low) — `listTools()` hardcodes `http://127.0.0.1:<port>/mcp` with no host validation

`extension/src/mcp/mcp-bridge.ts` fetches `http://127.0.0.1:${port}/mcp`. The port comes from `this.mcpManager.port`. If the manager ever resolves an empty/wrong port, the fetch silently fails with `McpServerNotRunningError`. Acceptable (localhost, no SSRF), but the port should be validated to be a sane integer before use.

---

## 3. Architecture & design

### POSITIVE — Strong multi-tenant scope isolation
Project identity is **derived from authenticated identity, never from the request body** (`SA4E-241 SEC-01`). `verifyProjectBinding()` in `tools.ts` rejects an `X-Project-Id` outside the caller's JWT grant (`allowedProjectsFromClaims`). WRITE paths fail closed (401 with no identity) instead of trusting `body.projectId`.

### POSITIVE — RBAC + reserved-key stripping on the tool boundary
`tools.ts` drops client-supplied `__projectId/__userId/__workspaceRoot` keys before stamping trusted values, and filters tool visibility by the `MCP_ACCESS` permission (`roleData.toolAccess`). Clean separation of "what the caller may see" vs. "scope the server controls."

### POSITIVE — Error classification & no internal-detail leakage
`pega-ingest-rule.ts` classifies errors into a structured envelope on the wire and keeps full stack traces **only in the server log** ("no internal detail leak"). `interceptResponse` returns user-facing messages, not stack traces.

### POSITIVE — Graceful degradation of startup
`HttpServerDbBootstrap.ts` runs schema/migration ensures; failures are non-fatal (degrade to in-memory progress). Migrations use parameterized queries.

### POSITIVE — Robust auth state machine
`extension/src/auth/AuthManager.ts` is a cohesive FSM owning all token/session state; flows are isolated methods (`loginFlow`, `logoutFlow`, `doRefreshFlow`, `sso-loopback`, `http-flow`, etc.). The refresh credential is stored in **VS Code SecretStorage** (OS keychain), not plain storage. Token response includes both dual-token (`accessToken` + `refreshToken`) and a legacy single-token format for back-compat.

### POSITIVE — CSP compensating controls
Despite `unsafe-inline`, `object-src 'none'`, `base-uri 'self'`, and locked `connect-src` block plugin/base-tag/clickjacking vectors. Server strips `X-Powered-By`.

### POSITIVE — Proxy boundary is SSRF-safe
`extension/src/proxy/HttpClient.ts` builds URLs as `this._baseUrl + path` (path is a fixed relative prefix, never attacker-controlled). Proxy dispatch goes through `ProxyAgentFactory` with a bypass list. curl/PowerShell subprocess transports keep the OS as a trust boundary.

### NEGATIVE — Over-commented / "TODO landmine" style
Many files carry extensive inline `SEC-*` / `DIP` / `SA4E-*` justification comments. This documents intent well, but the codebase contains several **`TODO(...)` blocks with unimplemented security follow-ups** (e.g. `tools.ts`: "TODO(SA4E-41 SEC-03): issue per-tenant API keys / JWT grants so a missing header can be resolved from the principal instead of relying on the caller"). These should be tracked as tickets, not left as open TODOs.

### NEGATIVE — Route registry drift
`HttpRouteRegistrar.ts` mounts routes with many inline `SA4E-xxx` comments; several routes are conditionally mounted (`if (knowledgeModule && 'getService' in ...)`, `registerMcpConfigRoutes` skips when orchestration is absent). Conditional mounting without a central registry risks **orphaned/insecure routes in some deployments**. A declarative route registry would make the auth-surface auditable.

---

## 4. Performance

### PERF-1 (Low) — Ingest stream buffers entire NDJSON in memory
`pega-stream.ts` accumulates all lines in `string[]` despite streaming. For the "39K+ rules" use case this is bounded but still not incremental. The per-tick `setImmediate` batching (50 rules/tick) does keep the event loop responsive. **Recommendation:** process lines incrementally (ingest per line as it arrives) rather than buffering the whole array.

### PERF-2 (Info) — `interceptResponse` re-parses every tool result
Every tool call path JSON-parses the full result string to check for `_base64_file`. For high-throughput tooling this is a per-call parse cost. Minor; acceptable given the base64 proxy is an opt-in feature.

### POSITIVE — No N+1 / blocking patterns observed
Startup uses `Promise.all` for parallel user-permission/session lookups (`/me`). `tools/list` and tool calls are async. The DB adapter appears to wrap async calls cleanly.

---

## 5. Test coverage

- Backend has `__tests__/` dirs under `auth/` and `server/`; the route factories expose injectable deps (`HttpServerOptions.toolRouter` / `mcpConfigService`) for deterministic tests.
- `security-headers.ts`, `api-key-auth.ts`, `jwt-auth.ts` all use timing-safe comparison in at least one path.
- **Note:** I could not execute the suite here (`test:unit`/`test:contract`/`test:e2e-api` per `backend/package.json`). Coverage claims are inferred from directory structure; a real run would confirm.

---

## 6. Summary & prioritized recommendations

| Priority | Item |
|---|---|
| **M** | SEC-3: add a per-request size cap on `/api/v1/pega/ingest-stream` (DoS) |
| **M** | SEC-2: make no-auth mode dev-only; reject unverified `X-User-Id` (privilege/confusion) |
| **M** | SEC-1: replace `unsafe-eval` in CSP with `'strict-dynamic'`+nonce / build-time Babel |
| **L** | SEC-4: validate base64 + filename on `McpBridge` file-write path |
| **L** | SEC-5: constant-time API-key comparison in `tools.ts` |
| **L** | BUG-1: cancel MCP call on `McpBridge.callTool` timeout |
| **L** | SEC-6: protect/rotate the shared HS256 secret file |
| **L** | Track all `TODO(SA4E-*)` security follow-ups as tickets |

**Overall assessment:** This is a **mature, well-engineered TypeScript codebase**. The security posture is genuinely strong for its class — localhost-only binding, strict JWT multi-tenancy, RBAC on the tool boundary, reserved-key stripping, fail-closed identity, classified error envelopes, and a robust auth state machine with OS-keychain-backed secrets. The findings above are mostly **medium-to-low** and largely about hardening defaults (no-auth mode), resource limits (stream DoS), and CSP hygiene rather than exploitable flaws. The main structural risk is that **auth is enforced per-route on some groups**, so the security surface depends on disciplined per-handler `requireAuth` calls.
