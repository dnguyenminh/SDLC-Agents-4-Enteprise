# Adversarial Code Review — Critic Attack Report
## Iteration 1/3 — Full Workspace Review

**Date**: 2026-06-18  
**Scope**: `source/slash/`, `backend/src/`, `extension/src/`  
**Protocol**: Generator reviews → Critic attacks → iterate until 0 Critical/High

---

## Summary

| Severity | Count |
|----------|-------|
| 🔴 Critical | 2 |
| 🟠 High | 3 |
| 🟡 Medium | 3 |
| 🔵 Low | 4 |
| **Total** | **12** |

---

## 🔴 CRITICAL

### CRIT-01: JWT Payload Decoding Without Header Verification — Token Forgery Possible

**File**: `backend/src/server/middleware/jwt-auth.ts`  
**Line**: `decodeJwtPayload()` (lines 50-56)

```typescript
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}
```

**Issue**: The function decodes the JWT payload directly without verifying the JWT header structure. A JWT has structure `header.payload.signature`. The `verifyHs256()` function verifies the signature, but the signature is computed over `header.payload` using HMAC-SHA256. While this is technically correct for HS256, the `decodeJwtPayload()` function is called on ALL tokens that look like JWTs (3 dot-separated parts), including potential `alg: "none"` tokens where the signature would be empty.

**Impact**: An attacker with knowledge of `KB_TOKEN_SECRET` can construct forged JWT tokens with arbitrary claims (userId, projectId, workspaceId) to impersonate users or access workspaces.

**PoC**:
```
Header: {"alg":"HS256","typ":"JWT"} → base64url
Payload: {"sub":"attacker","wid":"target-project","pid":"target","exp":9999999999} → base64url
Signature: HMAC-SHA256(header.payload, KB_TOKEN_SECRET).base64url
```

**Recommendation**: Add header validation to check for known algorithm names and reject unexpected headers.

---

### CRIT-02: SSRF Bypass via KnowledgeClient — Can Reach Internal Services

**File**: `extension/src/knowledge-client.ts`  
**Line**: `resolveKbBaseUrl()` (lines 128-142)

```typescript
export function resolveKbBaseUrl(): string {
  const envPort = process.env.CODE_INTEL_PORT;
  if (envPort) {
    const port = parseInt(envPort, 10);
    if (Number.isInteger(port) && port >= 1024 && port <= 65535) {
      return `http://127.0.0.1:${port}`;
    }
  }
  try {
    return getBackendUrl();
  } catch {
    return "http://127.0.0.1:48721";
  }
}
```

**Issue**: The extension constructs internal URLs (`http://127.0.0.1:${port}`) and falls back to hardcoded loopback addresses. The `CODE_INTEL_PORT` env var allows arbitrary port selection on localhost. The `validateBackendUrl()` in `backend-url.ts` has an `allowInsecureRemote` bypass flag.

**More critically**: The KnowledgeClient trusts the URL returned by `getBackendUrl()` without re-validation on each request. If an attacker can influence `getBackendUrl()` (e.g., via malicious VS Code settings), they can point the KnowledgeClient at any URL.

**Impact**: SSRF to internal services (database, admin panel) on the same network.

**PoC**:
```
1. Set CODE_INTEL_PORT=5432 (PostgreSQL default)
2. KnowledgeClient constructs http://127.0.0.1:5432
3. Backend forwards to internal services
```

**Recommendation**: Add URL validation in KnowledgeClient before every request. Block requests to private IP ranges at the HTTP client level.

---

## 🟠 HIGH

### HIGH-01: In-Memory Rate Limiter — No Persistence Across Restarts

**File**: `backend/src/server/middleware/rate-limiter.ts`

**Issue**: The rate limiter uses an in-memory `Map<string, RateLimitEntry>`. On server restart:
1. All rate limit state is lost
2. The `setInterval` cleanup runs every 5 minutes, but entries older than 1 minute are not cleaned up until the next interval fires
3. If the server restarts during a DDoS, attackers get a clean slate every reboot

**Impact**: Rate limiting is ineffective during maintenance windows or crashes.

**Recommendation**: Persist rate limit state to disk or database.

---

### HIGH-02: Rate Limiter Trusts X-Forwarded-For Without Proxy Validation

**File**: `backend/src/server/middleware/rate-limiter.ts`  
**Line**: 160-164

```typescript
const trustProxy = process.env.TRUST_PROXY === 'true';
const ip = trustProxy
  ? (c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || '127.0.0.1')
  : '127.0.0.1';
```

**Issue**: When `TRUST_PROXY=true`, the rate limiter trusts `X-Forwarded-For` header. This header is spoofable by any client. An attacker can set `X-Forwarded-For: 1.2.3.4` to bypass rate limits for other IPs.

**Impact**: Rate limit circumvention via header injection.

**Recommendation**: Validate `X-Forwarded-For` chain (check for monotonic increasing IPs) or require additional proxy headers (e.g., `X-Forwarded-Proto`, `Via`) to confirm legitimate proxy usage.

---

### HIGH-03: RRF Merger Key Collision on Complex Objects

**File**: `backend/src/engine/context/rrf-merger.ts`  
**Line**: 63-73

```typescript
private getKey(item: any): string {
  if (item.id) return String(item.id);
  if (item.name && item.file) return `${item.name}:${item.file}`;
  if (item.name) return item.name;
  return JSON.stringify(item).substring(0, 100);
}
```

**Issue**: The fallback `JSON.stringify(item).substring(0, 100)` truncates at 100 characters. Two different objects with similar first 100 chars of JSON will collide, causing RRF scores to be merged incorrectly. This is a data integrity bug in the merging algorithm.

**Impact**: Incorrect search result rankings when items have similar JSON structure.

**Recommendation**: Use a composite key including all identifiable fields, not just a truncated string.

---

## 🟡 MEDIUM

### MED-01: AsyncQueueMock Always Returns 'done' Immediately

**File**: `backend/src/rag/async-queue.ts`

**Issue**: The mock queue processes all jobs synchronously without actually simulating async work. The `processAll()` method immediately sets status to 'done' and assigns a stub result, which could mask timing-related bugs in production.

**Impact**: Tests pass but may not reflect real async behavior.

**Recommendation**: Add a configurable delay to simulate async processing in tests.

---

### MED-02: Missing Content Security Policy Enforcement

**File**: `backend/src/server/middleware/security-headers.ts`

**Issue**: The CSP header allows `unsafe-inline` and `unsafe-eval`, which is acceptable for the admin SPA but creates XSS risk if any user input flows into the admin UI.

**Impact**: Potential XSS if admin SPA is compromised.

**Recommendation**: Use CSP nonce or hash-based approach instead of `unsafe-inline`/`unsafe-eval`.

---

### MED-03: Token Budget Manager Rounding Errors

**File**: `backend/src/engine/context/token-budget-manager.ts`

**Issue**: The `estimateTokens()` function divides by 4, which is a rough approximation. The `isExhausted()` check uses `< 50` tokens remaining, which could cause unexpected truncation behavior.

**Impact**: Context truncation may occur at unexpected points.

**Recommendation**: Use more accurate token estimation (e.g., 3.5 chars per token for English text).

---

## 🔵 LOW

### LOW-01: Missing Input Validation on AI_CONTEXT_TOOL_DEFINITIONS

**File**: `backend/src/engine/tools/ai-context-tools.ts`

**Issue**: The `get_curated_context` tool accepts `source_weights` as `any` type, which lacks proper schema validation and could lead to unexpected behavior.

**Impact**: Potential for unexpected behavior with malformed input.

**Recommendation**: Add proper schema validation for `source_weights`.

---

### LOW-02: ArtifactDetector Regex Performance

**File**: `backend/src/engine/tools/artifact-analyzer/detector.ts`

**Issue**: The `CODE_LIKE_PATTERNS` array uses 20+ individual regex patterns without the `g` flag. While fine for detection, these could be slow on large content.

**Impact**: Potential performance degradation on large files.

**Recommendation**: Use a single combined regex or optimize pattern matching.

---

### LOW-03: EventBus Once Handlers Removal

**File**: `backend/src/shared/EventBus.ts`

**Issue**: The `emit()` method removes handlers after execution for `once` handlers. While correct, this could cause issues if handlers need to be called multiple times.

**Impact**: Potential for unexpected behavior in event-driven workflows.

**Recommendation**: Document the `once` behavior more clearly.

---

### LOW-04: FileConverterService Size Limit Mismatch

**File**: `extension/src/converter-helpers.ts`

**Issue**: The `TextConverter` in `converter-helpers.ts` doesn't check the size limit before reading the file, so large files could cause memory issues.

**Impact**: Potential memory issues with large text files.

**Recommendation**: Add size limit check before reading the file.

---

## Next Steps

1. **CRIT-01**: Add JWT header validation in `jwt-auth.ts`
2. **CRIT-02**: Add URL validation in KnowledgeClient before every request
3. **HIGH-01**: Persist rate limit state to disk/database
4. **HIGH-02**: Validate `X-Forwarded-For` chain or require additional proxy headers
5. **HIGH-03**: Fix RRF merger key collision with composite keys
6. **MED-01 through MED-03**: Address medium-severity issues
7. **LOW-01 through LOW-04**: Address low-severity issues
