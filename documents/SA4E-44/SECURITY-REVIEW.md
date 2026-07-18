# 🔒 Security Design Review

## SA4E-44: Persistent Task Queue & Code Intelligence Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-44 |
| TDD Version | 2.0 |
| Reviewer | Security Agent |
| Date | 2026-07-17 |
| Type | Design Review (pre-implementation) |
| Overall Risk | **Medium** |

---

## Executive Summary

The TDD for SA4E-44 describes a well-structured dual-scope change: (1) persistent task queue for KB enrichment, and (2) migration of code intelligence from backend-local to extension-driven architecture. The design demonstrates solid security awareness with explicit input validation tables, path traversal prevention, parameterized queries via DatabaseAdapter, and localhost-only binding.

However, several architectural gaps exist that could be exploited in specific threat scenarios, particularly around the **lack of authentication on MCP endpoints** (extension-to-backend trust), **potential DoS via unbounded payload processing**, and **task queue payload poisoning**. These are addressable with targeted controls before implementation.

**Positive security decisions already in the design:**
- Path traversal validation with null byte, `..`, and absolute path checks
- Parameterized queries via DatabaseAdapter (SQL injection protection)
- Localhost-only binding for both backend and extension wrapper
- Batch size limits (100 files, 10000 symbols/file)
- Hash-based dedup prevents replay of unchanged data
- Graceful degradation when services unavailable
- Backend never accesses filesystem (strong isolation boundary)

---

## Findings Table

| ID | Severity | Category | Finding | Recommendation |
|----|----------|----------|---------|----------------|
| SEC-01 | **High** | Auth/AuthZ | No authentication on MCP StreamableHTTP endpoint for `code_intel_upload` by default — any local process can inject arbitrary code intelligence data | Add API key auth (already exists as `apiKeyAuth` middleware) to MCP endpoint; make it mandatory (auto-generate key on first start) |
| SEC-02 | **High** | Task Queue | Task payload (`payload: string` JSON) parsed without schema validation — malicious/corrupted payloads can crash worker or cause unexpected behavior | Add strict JSON schema validation in TaskWorker before dispatching to processor; validate at creation time |
| SEC-03 | **Medium** | API Security | No request body size limit enforced at MCP protocol level — `HTTP_BODY_LIMIT` (10MB) configured but enforcement not shown in Hono middleware | Explicitly configure Hono body parser limit; add per-tool payload size validation before DB transaction |
| SEC-04 | **Medium** | DoS | `code_intel_upload` processes up to 100 files x 10000 symbols = 1M symbol insertions in single transaction — can exhaust DB connections and block worker | Add total symbols-per-request cap (e.g., 50000); consider chunked processing for large batches |
| SEC-05 | **Medium** | Data Protection | `doc_comment` and `signature` fields in code_symbols are unbounded TEXT — can store arbitrary content including accidentally committed secrets | Add max length validation (e.g., 10KB per field); optional secret pattern detection |
| SEC-06 | **Medium** | Infrastructure | `/internal/tasks/*` diagnostic API protected by localhost binding only — if binding changes (e.g., Docker 0.0.0.0), endpoints are exposed | Add explicit IP whitelist middleware on /internal/* routes as defense-in-depth |
| SEC-07 | **Medium** | Extension Trust | Extension `TimestampResolver` executes git commands with file paths — adversarial filenames could enable command injection if using shell exec | Use array-based `execFile` (not shell-interpolated `exec`); validate filename characters |
| SEC-08 | **Low** | Session Mgmt | MCP StreamableHTTP is stateless (no session persistence) — no session fixation risk, but no request correlation for audit trail | Add X-Request-ID header generation for request tracing |
| SEC-09 | **Low** | Rate Limiting | No rate limiting on MCP tools (design says "trusted internal callers") — local malware could flood backend | Add soft rate limit (1000 req/min) on MCP endpoint as defense-in-depth |
| SEC-10 | **Low** | Data Protection | Logging includes `projectId` and `fileCount` — ensure file paths are not logged at INFO level (may reveal sensitive project structure) | Audit log levels; DEBUG-only for file path details |
| SEC-11 | **Low** | Injection | `code_search` ILIKE pattern is safe from SQLi but SQL wildcards (%, _) in user input can cause slow queries | Escape SQL wildcards in search input; leverage existing 200ms query timeout |
| SEC-12 | **Info** | Crypto | No encryption at rest for code intelligence data — code snippets stored in plaintext | Acceptable for single-user IDE tool; document as limitation for enterprise deployments |

---

## Detailed Analysis

### 1. Authentication & Authorization Design

**Current Design:**
- MCP endpoint (`/mcp`) has `apiKeyAuth` middleware applied
- `apiKeyAuth` is no-op when `CODE_INTEL_API_KEY` env var is NOT set
- Internal REST endpoints (`/internal/tasks/*`) rely solely on localhost binding
- Extension communicates via MCP StreamableHTTP — no per-tool authorization

**What works well:**
- `apiKeyAuth` uses timing-safe comparison (`timingSafeEqual`) — prevents timing attacks
- Bearer token and X-API-Key header both supported
- Existing PKCE SSO auth for external communication via AuthManager

**Gap (SEC-01):**
In the default development setup (no API key configured), ANY local process can call `code_intel_upload` and inject malicious code intelligence data. The TDD Section 9.3 states "No explicit rate limit for MCP tools (trusted internal callers)" — this trust assumption is too broad.

**Recommendation:**
```typescript
// Auto-generate API key on first server start
import { randomBytes, writeFileSync, readFileSync } from 'crypto';

function getOrCreateApiKey(dataDir: string): string {
  const keyPath = path.join(dataDir, '.api-key');
  try {
    return readFileSync(keyPath, 'utf-8').trim();
  } catch {
    const key = randomBytes(32).toString('hex');
    writeFileSync(keyPath, key, { mode: 0o600 });
    return key;
  }
}
```

### 2. Data Protection

**Current Design:**
- No encryption at rest (SQLite/PostgreSQL standard storage)
- No PII by design — code intelligence contains file paths, symbol names, signatures
- Localhost-only communication (no TLS for loopback)

**Risk Assessment:** Low for intended single-user deployment. Code in `doc_comment` and `signature` fields could inadvertently contain secrets if developers document credentials in comments.

**Recommendation:** Optional secret pattern detection in PayloadValidator (warn, don't block).

### 3. API Security — Input Validation

**Strong points (already designed):**
- Path traversal: explicit validation function checking `..`, absolute paths, null bytes
- ProjectId: alphanumeric + dash, max 100 chars
- Hash: exact 64 hex chars
- Timestamp: ISO 8601 validation
- Batch limits: 100 files, 10000 symbols/file

**Gaps:**
- No validation on `language` field (VARCHAR(50) but no whitelist)
- No runtime enum validation for `kind` in symbols
- `signature` and `doc_comment` are unbounded TEXT
- No total request payload size validation at tool level

**Recommendation:**
- Add runtime enum validation for `language` (whitelist: typescript, javascript, kotlin, python, java, go, rust, etc.)
- Add runtime enum validation for `kind` (function, class, interface, variable, method, property)
- Cap `signature` at 2KB, `doc_comment` at 10KB
- Cap `source` in ImportPayload at 500 chars

### 4. Dependency Risks

| Dependency | Version | Risk | Notes |
|-----------|---------|------|-------|
| Tree-sitter WASM | 0.22+ | Low | Runs in extension (sandboxed WASM memory isolation) |
| better-sqlite3 | current | Low | Well-maintained; no known CVEs |
| Hono | 4.x | Low | Lightweight; smaller attack surface than Express |
| PostgreSQL | 15+ | Low | Mature; excellent security track record |
| ONNX Runtime | current | Low | ML inference only; no network exposure |
| @modelcontextprotocol/sdk | 1.0 | Medium | Newer library; fewer security audits |

**Recommendation:** Pin exact versions; add `npm audit` to CI; monitor MCP SDK advisories.

### 5. Infrastructure Security

**Strong points:**
- Backend binds `localhost:48721`
- Extension wrapper binds `localhost:9181`
- Environment variables for configuration
- No secrets in payloads or logs

**Gaps:**
- Docker deployment: if server binds `0.0.0.0`, all localhost-only assumptions break
- No startup validation requiring auth when non-localhost binding
- Feature flags as plain env vars — no integrity protection

**Recommendation:**
- Add startup check: if host != 127.0.0.1/localhost, require CODE_INTEL_API_KEY
- Document binding requirements explicitly in DPG

### 6. Injection Risks

**SQL Injection: WELL PROTECTED**
- All DB access via `DatabaseAdapter` with parameterized queries (`?` placeholders)
- `prepare()` + `run()` pattern prevents injection
- No string concatenation in SQL shown

**Command Injection (Extension — SEC-07):**
- `TimestampResolver` executes git commands with file paths
- Adversarial filenames (e.g., `$(rm -rf /)`, `` `cmd` ``) could inject if using shell exec

**Safe pattern:**
```typescript
import { execFile } from 'child_process';

// SAFE: array args, no shell interpolation
execFile('git', ['log', '-1', '--format=%aI', '--', filePath], 
  { cwd: workspaceRoot }, (err, stdout) => { ... });
```

### 7. Session Management

- MCP StreamableHTTP is stateless (new transport per request)
- No session tokens, no cookies, no session fixation risk
- Missing request correlation ID for audit trail

**Verdict:** Low risk — stateless by design.

### 8. Task Queue Security

**Payload Risks (SEC-02):**
- `payload` field is `string` (raw JSON) — parsed at processing time
- No schema validation between creation and processing
- Worker processes one task at a time — poisoned task blocks queue for up to 5 minutes (stale threshold)

**Mitigation already in design:**
- Non-retryable error classification includes `invalid_json_payload`
- Stale task recovery on restart
- Dead letter mechanism after max_retries

**What's missing:**
- Schema validation at task CREATION time (fail fast before persisting)
- Per-task processing timeout (currently relies only on stale detection)
- Payload size limit for `pending_tasks.payload` column

**Recommendation:**
```typescript
// Validate payload schema BEFORE inserting task
function validateTaskPayload(taskType: TaskType, payload: object): boolean {
  const schema = TASK_SCHEMAS[taskType];
  if (!schema) return false;
  return schema.validate(payload); // e.g., zod or ajv
}
```

### 9. Extension-to-Backend Trust

**Threat Model:**
- Extension and backend run on same machine, communicate via localhost
- Any local process that discovers port 48721 can impersonate the extension
- `apiKeyAuth` exists but is optional by default

**Scenarios:**
1. Malicious VS Code extension discovers port, injects false code intelligence
2. Local malware enumerates localhost ports, finds MCP endpoint
3. Compromised npm package in devDependencies calls backend during build

**Recommendation:**
- Auto-generate API key on server start → write to known filesystem location (mode 0600)
- Extension reads key on activation → includes in all MCP requests
- Key rotates on each server restart for forward secrecy
- This provides "something you have" auth without user friction

---

## OWASP Top 10 (2021) Mapping

| Category | Status | Findings |
|----------|--------|----------|
| A01: Broken Access Control | ⚠️ Medium | SEC-01, SEC-06 — optional auth, binding-only protection |
| A02: Cryptographic Failures | ✅ Low | SEC-12 (informational) — no crypto needed for localhost |
| A03: Injection | ✅ Good | SEC-07, SEC-11 — parameterized queries solid; git exec needs safe pattern |
| A04: Insecure Design | ✅ Good | Clear separation; defense-in-depth noted |
| A05: Security Misconfiguration | ⚠️ Medium | SEC-03, SEC-06 — default permissive config |
| A06: Vulnerable Components | ✅ Low | Standard, maintained libraries |
| A07: Auth Failures | ⚠️ Medium | SEC-01 — optional auth in default mode |
| A08: Data Integrity | ✅ Good | Atomic transactions; hash dedup; idempotent uploads |
| A09: Logging Failures | ✅ Low | SEC-08, SEC-10 — good logging; missing correlation |
| A10: SSRF | ✅ N/A | Backend makes no outbound requests from user input |

---

## Recommendations Priority

### Immediate — Must Address Before Implementation

| # | Finding | Action for SA/TDD Update |
|---|---------|--------------------------|
| 1 | SEC-01 | Update TDD Section 9.3: Make API key mandatory (auto-generated); add to Security Design |
| 2 | SEC-02 | Update TDD Section 7.1: Add payload schema validation at task creation time |
| 3 | SEC-07 | Update TDD Section 3.3 (extension): Specify `execFile` for git commands; add filename validation |

### During Implementation — Should Address

| # | Finding | Action for DEV |
|---|---------|----------------|
| 4 | SEC-03 | Enforce HTTP body limit in Hono middleware (already configured, ensure applied) |
| 5 | SEC-04 | Add total symbols-per-request cap (50K) |
| 6 | SEC-05 | Add max length for doc_comment (10KB) and signature (2KB) |
| 7 | SEC-06 | Add IP whitelist middleware on /internal/* routes |

### Post-Implementation — Nice to Have

| # | Finding | Action |
|---|---------|--------|
| 8 | SEC-08 | Add X-Request-ID header for audit correlation |
| 9 | SEC-09 | Soft rate limit on MCP endpoint (1000 req/min) |
| 10 | SEC-10 | Review log levels for path info |
| 11 | SEC-11 | Escape SQL wildcards in search input |

---

## Conclusion

The TDD demonstrates **strong security fundamentals**: parameterized queries, path traversal prevention, localhost binding, batch limits, and graceful error handling. The primary gaps are:

1. **Default authentication posture** — opt-in rather than mandatory
2. **Task payload validation depth** — schema validation at creation time
3. **Extension command injection** — git exec pattern must be array-based

**Verdict: PASS with conditions** — Address SEC-01, SEC-02, and SEC-07 in TDD Security Design section. Remaining findings are implementation-level guidance for DEV.

---

*End of Security Design Review*
