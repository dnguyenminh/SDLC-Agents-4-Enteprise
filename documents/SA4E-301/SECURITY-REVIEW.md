# 🔒 Security Assessment & Design Review Report

## Document Information
| Field | Value |
|-------|-------|
| Project | SDLC Agents 4 Enterprise |
| Scope | SA4E-301: Technical Design Review (`documents/SA4E-301/TDD.md`) |
| Date | 2026-09-19 |
| Assessor | Security Agent |
| Version | 1.0 |

---

## Executive Summary

This Security Design Review evaluates the architecture, data protection, cryptographic integrity, API security, input handling, and dependency risks specified in Technical Design Document **SA4E-301**: *"Option: ưu tiên rule từ local workspace khi checksum khớp server (Pega index)"*.

The overall technical objective of SA4E-301 is to optimize Pega workspace indexing in the VS Code/Kiro extension by reading rule JSON files from `<workspaceRoot>/rules/<safeClass>/<safeName>.pega.json` when the 3-field SHA256 checksum matches the Pega catalog server checksum. While this design significantly reduces network overhead and speeds up indexing, our threat modeling and code-level design evaluation identified **1 Critical**, **2 High**, **3 Medium**, and **1 Low** security risks that must be addressed prior to implementation sign-off.

### Key Risk Areas Identified:
1. **Cryptographic Integrity Scope Flaw (Critical):** The 3-field SHA256 checksum formula (`computePegaChecksum`) only hashes `pzInsKey`, `pxUpdateDateTime`, and `pxSaveDateTime`. It does **not** hash actual rule step content. An attacker or malicious local process modifying rule execution logic in local JSON while leaving metadata timestamps intact will bypass checksum validation and successfully poison the Code-Intelligence Knowledge Base.
2. **Path Traversal Vulnerability (High):** Local workspace path construction (`safeClass` / `safeName`) allows dot `.` characters without canonicalization or directory jail checks, permitting directory traversal outside `<workspaceRoot>/rules`.
3. **Broken Authorization & Unauthenticated Ingestion (High):** API `POST /api/v1/pega/ingest-rule` specifies optional authentication and relies solely on a user-controlled `X-Project-Id` header (BOLA/IDOR risk).

**Overall Risk Rating:** 🔴 **HIGH**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 1 |
| 🟠 High | 2 |
| 🟡 Medium | 3 |
| 🔵 Low | 1 |
| ℹ️ Informational | 0 |

---

## Findings Summary by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
- 🟠 **Finding #2:** Path Traversal Vulnerability in Local Workspace Rule Path Resolution (CWE-22)
- 🟠 **Finding #3:** Missing Mandatory Authentication & Broken Object Level Authorization (BOLA) on Ingestion API (CWE-306, CWE-639)

### A02:2021 — Cryptographic Failures
- 🟡 **Finding #5:** Unencrypted HTTP Transport Risk for Pega REST and Backend API Endpoints (CWE-319)

### A03:2021 — Injection
- No direct SQL/Command/LDAP injection vectors found in parameterized database queries ✅

### A04:2021 — Insecure Design
- 🟡 **Finding #4:** Cleartext Storage of Sensitive Pega Rule Logic in Local Workspace Cache (CWE-313)

### A05:2021 — Security Misconfiguration
- 🟡 **Finding #6:** Unrestricted Request Body & Lack of Schema Validation for Ingest Payload (CWE-400, CWE-20)

### A06:2021 — Vulnerable and Outdated Components
- Unpinned semver dependencies checked in `package.json` (`hono ^4.0.0`, `undici ^6.21.0`)

### A07:2021 — Identification and Authentication Failures
- 🔵 **Finding #7:** Missing Sliding-Window Rate Limiting & Token Revocation Controls (CWE-613)

### A08:2021 — Software and Data Integrity Failures
- 🔴 **Finding #1:** Cryptographic Integrity Bypass via Insufficient Local Checksum Hashing Scope (CWE-353, CWE-345)

### A09:2021 — Security Logging and Monitoring Failures
- Logging implementation verified in Pino/VS Code Output channel with structured meta ✅

### A10:2021 — Server-Side Request Forgery (SSRF)
- `PegaHttpClient` target URLs restricted to configured Pega endpoint ✅

---
## Detailed Findings

### Finding #1: Cryptographic Integrity Bypass via Insufficient Local Checksum Hashing Scope (Local Rule Code Tampering)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔴 Critical |
| **OWASP Category** | A08:2021 — Software and Data Integrity Failures |
| **CWE** | CWE-353: Missing Support for Integrity Check / CWE-345: Insufficient Verification of Data Authenticity |
| **CVSS v3.1 Score** | 9.1 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N`) |
| **Location** | `extension/src/services/PegaBfsIndexer.ts:587-594` & `extension/src/code-intel/checksum/PegaRuleChecksumStrategy.ts` |
| **Status** | Open |

**Description:**
The 3-field SHA-256 checksum algorithm (`computePegaChecksum`) introduced under SA4E-241 and reused in SA4E-301 calculates a digest based strictly on three metadata string fields:
```typescript
computePegaChecksum({ pzInsKey, pxUpdateDateTime, pxSaveDateTime })
```
When `preferLocalOnChecksumMatch` is enabled, `PegaBfsIndexer.tryReadLocalRule` computes `localChecksum` using `computePegaChecksum` from the local JSON file on disk and compares it to `catalogRow.checksum` from the server catalog. 

Because `computePegaChecksum` **does not include the actual executable rule payload** (`pySteps`, `pyActivityCode`, `pyRuleDefinition`, etc.) in its hash calculation, an attacker or a local process modifying rule code in `<workspaceRoot>/rules/<safeClass>/<safeName>.pega.json` while keeping metadata timestamps unchanged will produce an identical 3-field checksum string. As a result, `localChecksum === catalogRow.checksum` evaluates to `true`, and the tampered local rule content is ingested directly into the backend Code-Intelligence Knowledge Base without detection.

**Evidence (Vulnerable Design in `PegaBfsIndexer.ts`):**
```typescript
// Vulnerable implementation in tryReadLocalRule:
const localChecksum = computePegaChecksum({
  pzInsKey: String(localObj.pzInsKey),
  pxUpdateDateTime: localObj.pxUpdateDateTime as string | undefined,
  pxSaveDateTime: localObj.pxSaveDateTime as string | undefined,
});

// Checks ONLY 3 metadata fields — rule content payload is completely ignored!
if (localChecksum.toLowerCase() === (item.checksum ?? "").toLowerCase()) {
  return { success: true, ruleObj: localObj, checksum: localChecksum };
}
```

**Impact:**
An attacker who alters local rule JSON files can inject malicious logic, backdoors, or deceptive code metadata into the Code-Intelligence KB. Downstream developers and AI agents relying on the KB for code generation, dependency graph analysis, or architecture reviews will receive poisoned data, leading to severe supply-chain integrity compromise.

**Remediation:**
To maintain strict compliance with Invariant INV-1 while guaranteeing local payload authenticity, `tryReadLocalRule` must verify both:
1. Metadata 3-field SHA256 matches `catalogRow.checksum`.
2. Full content SHA256 of local JSON matches a stored full-content hash digest, OR re-verify payload structure before ingestion.

```typescript
// Fixed implementation in PegaBfsIndexer.ts
import * as crypto from "crypto";

private async tryReadLocalRule(
  item: CrawlPlanItem,
  root: string
): Promise<{ success: boolean; ruleObj?: Record<string, unknown>; checksum?: string }> {
  const safeClass = this.sanitizePathComponent(item.pxObjClass);
  const safeName = this.sanitizePathComponent(item.pyRuleName);
  const localPath = path.resolve(root, "rules", safeClass, `${safeName}.pega.json`);

  // Canonical path jail check (Fix for Finding #2)
  const rulesBaseDir = path.resolve(root, "rules");
  if (!localPath.startsWith(rulesBaseDir + path.sep)) {
    this.log(`[BfsIndexer] ⛔ Path traversal blocked for ${localPath}`);
    return { success: false };
  }

  try {
    if (fs.existsSync(localPath)) {
      const rawText = fs.readFileSync(localPath, "utf-8");
      const localObj = JSON.parse(rawText) as Record<string, unknown>;

      if (localObj.pzInsKey && (localObj.pxUpdateDateTime || localObj.pxSaveDateTime)) {
        // 1. Verify 3-field metadata checksum matches catalog checksum (INV-1)
        const localMetaChecksum = computePegaChecksum({
          pzInsKey: String(localObj.pzInsKey),
          pxUpdateDateTime: localObj.pxUpdateDateTime as string | undefined,
          pxSaveDateTime: localObj.pxSaveDateTime as string | undefined,
        });

        if (localMetaChecksum.toLowerCase() !== (item.checksum ?? "").toLowerCase()) {
          this.log(`[BfsIndexer] ℹ️ Metadata checksum mismatch for ${item.insKey} — downloading from server`);
          return { success: false };
        }

        // 2. Content integrity check: Verify raw payload content has not been tampered with
        if (typeof localObj._contentHash === "string") {
          const actualContentHash = crypto.createHash("sha256").update(JSON.stringify(localObj.rulePayload ?? localObj)).digest("hex");
          if (actualContentHash !== localObj._contentHash) {
            this.log(`[BfsIndexer] ⚠️ Local content payload tampered for ${item.insKey} — downloading from server`);
            return { success: false };
          }
        }

        return { success: true, ruleObj: localObj, checksum: localMetaChecksum };
      }
    }
  } catch (err: any) {
    this.log(`[BfsIndexer] ⚠️ Exception reading local file ${localPath} (${err.message}) — fallback to server download`);
  }

  return { success: false };
}
```

**References:**
- CWE-353: https://cwe.mitre.org/data/definitions/353.html
- OWASP Data and Software Integrity Failures: https://owasp.org/Top10/A08_2021-Software_and_Data_Integrity_Failures/

---

### Finding #2: Path Traversal Vulnerability in Local Workspace Rule Path Resolution

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A01:2021 — Broken Access Control |
| **CWE** | CWE-22: Improper Limitation of a Pathname to a Restricted Directory ('Path Traversal') |
| **CVSS v3.1 Score** | 8.6 (`CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:N`) |
| **Location** | `extension/src/services/PegaBfsIndexer.ts:577-580` |
| **Status** | Open |

**Description:**
The TDD specifies local rule file path construction as:
```typescript
const safeClass = item.pxObjClass.replace(/[^a-zA-Z0-9_-]/g, "_");
const safeName = item.pyRuleName.replace(/[^a-zA-Z0-9_.-]/g, "_");
const localPath = path.join(root, "rules", safeClass, `${safeName}.pega.json`);
```
Notice that the regex for `safeName` (`[^a-zA-Z0-9_.-]`) permits period characters (`.`). If `pyRuleName` contains relative directory traversal patterns like `../../etc/passwd` or `../../.ssh/id_rsa`, the replacement retains the dots (`.._.._.ssh_id_rsa`). When resolved with `path.join`, these dot sequences can navigate above the intended `<workspaceRoot>/rules/` directory boundaries.

Additionally, the implementation lacks a canonical path prefix check (`path.resolve(localPath).startsWith(rulesBase)`) to ensure the target file resides strictly within the workspace rules root directory.

**Evidence (Vulnerable Code):**
```typescript
// Vulnerable path creation without canonical prefix validation:
const safeClass = item.pxObjClass.replace(/[^a-zA-Z0-9_-]/g, "_");
const safeName = item.pyRuleName.replace(/[^a-zA-Z0-9_.-]/g, "_"); // Allows '.' dot characters!
const localPath = path.join(root, "rules", safeClass, `${safeName}.pega.json`);
// fs.readFileSync(localPath) executes without checking if localPath is inside rules/
```

**Impact:**
An attacker crafting malicious Pega rule metadata (`pyRuleName`) could cause the extension process to read arbitrary files from the local filesystem or overwrite system/workspace files outside the designated `rules/` directory when downloaded rules are saved to disk.

**Remediation:**
Strictly sanitize path components by removing dot sequences and enforcing canonical path boundary validation using `path.resolve` and `startsWith`:

```typescript
// Fixed Path Sanitization Helper
private sanitizePathComponent(name: string): string {
  // Strip null bytes, replace path separators, dot-dot sequences, and non-alphanumeric chars (except single dash/underscore)
  return name
    .replace(/\0/g, "")
    .replace(/\.\./g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_");
}

private getCanonicalLocalPath(root: string, pxObjClass: string, pyRuleName: string): string | null {
  const safeClass = this.sanitizePathComponent(pxObjClass);
  const safeName = this.sanitizePathComponent(pyRuleName);
  const rulesBaseDir = path.resolve(root, "rules");
  const targetPath = path.resolve(rulesBaseDir, safeClass, `${safeName}.pega.json`);

  // Enforce directory jail boundary
  if (!targetPath.startsWith(rulesBaseDir + path.sep)) {
    return null; // Traversal attempt detected
  }
  return targetPath;
}
```

**References:**
- CWE-22: https://cwe.mitre.org/data/definitions/22.html
- OWASP Path Traversal: https://owasp.org/www-community/attacks/Path_Traversal

---

### Finding #3: Missing Mandatory Authentication & Broken Object Level Authorization (BOLA) on Ingestion API

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A01:2021 — Broken Access Control |
| **CWE** | CWE-306: Missing Authentication for Critical Function / CWE-639: Authorization Bypass Through User-Controlled Key |
| **CVSS v3.1 Score** | 8.2 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:H/A:L`) |
| **Location** | `backend/src/routes/pega-ingest.ts` & TDD §3.3 |
| **Status** | Open |

**Description:**
In TDD §3.3 (`POST /api/v1/pega/ingest-rule`), the HTTP request specification lists the `Authorization` header as **Optional** (`Authorization: Optional | Bearer JWT token if authentication is enabled`). Request authorization relies entirely on `X-Project-Id` (a 12-character hex identifier).

Without mandatory JWT session authentication and project ownership verification, any unauthenticated client on the network can invoke `POST /api/v1/pega/ingest-rule` or `POST /api/v1/pega/rulecatalog/bulk-check` by supplying an arbitrary 12-char hex string in `X-Project-Id`. 

**Evidence (Vulnerable API Contract Specification in TDD §3.3):**
```markdown
| Header | Required | Description |
|--------|----------|-------------|
| Content-Type | Yes | application/json |
| X-Project-Id | Yes | 12-character hex project identifier |
| Authorization | Optional | Bearer JWT token if authentication is enabled |
```

**Impact:**
An unauthenticated attacker can overwrite, insert, or tamper with Pega rule records stored in the backend SQLite/PostgreSQL `pega_rules` table for any target project ID (Broken Object Level Authorization / BOLA).

**Remediation:**
Require Bearer JWT authentication on all `/api/v1/pega/*` endpoints and validate that the authenticated user ID has explicit access to the specified `projectId`:

```typescript
// Fixed Hono route handler in backend/src/routes/pega-ingest.ts
import { Hono } from "hono";
import { jwtAuth } from "../middleware/jwtAuth";
import { verifyProjectAccess } from "../middleware/verifyProjectAccess";
import { IngestRuleRequestSchema } from "../schemas/pegaIngestSchema";

const pegaIngestRouter = new Hono();

// Enforce mandatory JWT authentication and project permission check middleware
pegaIngestRouter.post("/api/v1/pega/ingest-rule", jwtAuth(), verifyProjectAccess(), async (c) => {
  const user = c.get("authUser");
  const body = await c.req.json();
  const parsed = IngestRuleRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: "ERR_INVALID_PAYLOAD", details: parsed.error.format() }, 400);
  }

  // Check sum verification (INV-1)
  const computedHash = computePegaChecksum(parsed.data.rule);
  if (computedHash !== parsed.data.checksum) {
    return c.json({ error: "ERR_INV1_MISMATCH", message: "Checksum mismatch" }, 400);
  }

  // Insert rule into database
  const result = await ingestPegaRule(parsed.data.projectId, parsed.data.rule, parsed.data.checksum);
  return c.json(result, 200);
});
```

**References:**
- OWASP API1:2023 — Broken Object Level Authorization: https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/
- CWE-306: https://cwe.mitre.org/data/definitions/306.html

---

### Finding #4: Cleartext Storage of Sensitive Pega Rule Logic in Local Workspace Cache

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A04:2021 — Insecure Design |
| **CWE** | CWE-313: Cleartext Storage of Sensitive Information in a File |
| **CVSS v3.1 Score** | 5.5 (`CVSS:3.1/AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N`) |
| **Location** | `extension/src/services/PegaBfsIndexer.ts:579` & TDD §7.1 |
| **Status** | Open |

**Description:**
Rule JSON files downloaded from remote Pega servers are stored in unencrypted, cleartext format inside `<workspaceRoot>/rules/<safeClass>/<safeName>.pega.json`. Pega rule definitions often contain proprietary business logic, hardcoded service integration endpoints, database table mappings, or API keys. If the developer workspace is committed to Git without excluding the `rules/` directory, sensitive enterprise rule content will leak to version control systems.

**Impact:**
Accidental exposure of sensitive enterprise business rules and credentials in public or shared code repositories.

**Remediation:**
1. Automatically verify and add `rules/` to `.gitignore` when the extension initializes in a workspace.
2. Implement automated credential/secret masking before writing `.pega.json` files to disk.

```typescript
// Fixed `.gitignore` auto-updater in Extension Activation
import * as fs from "fs";
import * as path from "path";

export function ensureRulesGitIgnored(workspaceRoot: string): void {
  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  const ignorePattern = "\n# Pega Local Rule Cache (SA4E-301)\nrules/\n*.pega.json\n";

  try {
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, "utf-8");
      if (!content.includes("rules/") && !content.includes("*.pega.json")) {
        fs.appendFileSync(gitignorePath, ignorePattern);
      }
    } else {
      fs.writeFileSync(gitignorePath, ignorePattern);
    }
  } catch (err) {
    // Non-fatal logging
  }
}
```

**References:**
- CWE-313: https://cwe.mitre.org/data/definitions/313.html

---

### Finding #5: Unencrypted HTTP Transport Risk for Remote Pega and Backend API Endpoints

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A02:2021 — Cryptographic Failures |
| **CWE** | CWE-319: Cleartext Transmission of Sensitive Information |
| **CVSS v3.1 Score** | 6.5 (`CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:L/A:N`) |
| **Location** | `extension/package.json` default settings & TDD §3.2 |
| **Status** | Open |

**Description:**
Default settings in `extension/package.json` specify plaintext `http://` URLs:
- `kiroSdlc.backend.url`: `"http://127.0.0.1:48721"`
- `kiroSdlc.pegaEndpoint`: `"http://localhost:8080/prweb"`

While loopback traffic (`127.0.0.1`) is isolated locally, users frequently reconfigure these parameters to point to remote backend servers or corporate Pega instances across local networks. Transmitting Pega Basic Auth credentials (`Authorization: Basic <base64>`) or Bearer tokens over cleartext HTTP exposes sensitive headers to network sniffing, proxy interception, and MITM attacks.

**Impact:**
Interception of Pega operator credentials or session tokens over non-TLS connections.

**Remediation:**
Enforce TLS/HTTPS for non-loopback network destinations and issue warnings in the VS Code Output channel when plaintext HTTP is configured for external hosts.

```typescript
// Fixed endpoint validator in PegaHttpClient.ts
export function validateEndpointSecurity(urlStr: string): void {
  const parsed = new URL(urlStr);
  const isLoopback = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1";

  if (parsed.protocol === "http:" && !isLoopback) {
    throw new Error(`[Security Policy Violation] Plaintext HTTP endpoint (${urlStr}) rejected for remote host. HTTPS is required.`);
  }
}
```

**References:**
- CWE-319: https://cwe.mitre.org/data/definitions/319.html

---

### Finding #6: Unrestricted Request Body & Lack of Schema Validation for Ingest Payload

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-400: Uncontrolled Resource Consumption / CWE-20: Improper Input Validation |
| **CVSS v3.1 Score** | 5.3 (`CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L`) |
| **Location** | `backend/src/routes/pega-ingest.ts` & TDD §3.3 |
| **Status** | Open |

**Description:**
TDD §3.3 defines the ingest schema as `rule: z.record(z.unknown())`. This allows arbitrarily large JSON objects with arbitrary nesting depth and property keys. Under high ingestion concurrency (`ingestConcurrency` default 10, max 64), an attacker or malfunctioning client sending 50MB+ rule payloads can trigger heap allocation exhaustion (Node.js OOM DoS) or CPU starvation during JSON parsing.

**Impact:**
Backend service denial of service (OOM crash) during indexing operations.

**Remediation:**
Enforce body size limits in Hono (`bodyLimit({ maxSize: 5 * 1024 * 1024 })`) and validate maximum field key counts in Zod schemas.

```typescript
// Fixed Hono Middleware Configuration
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";

const app = new Hono();

app.use("/api/v1/pega/*", bodyLimit({
  maxSize: 5 * 1024 * 1024, // 5MB limit per request
  onError: (c) => c.json({ error: "ERR_PAYLOAD_TOO_LARGE", message: "Payload size exceeds 5MB limit" }, 413),
}));
```

**References:**
- CWE-400: https://cwe.mitre.org/data/definitions/400.html

---

### Finding #7: Missing Sliding-Window Rate Limiting & Token Revocation Controls

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A07:2021 — Identification and Authentication Failures |
| **CWE** | CWE-613: Insufficient Session Expiration |
| **CVSS v3.1 Score** | 3.7 (`CVSS:3.1/AV:N/AC:H/PR:L/UI:N/S:U/C:N/I:L/A:N`) |
| **Location** | `backend/src/routes/pega-ingest.ts` & TDD §6.2 |
| **Status** | Open |

**Description:**
The backend API configures a global high rate limit (6000 RPM) without per-client or per-IP sliding window controls. Additionally, JWT ingestion tokens lack explicit short lifetime (TTL) or revocation list checking.

**Impact:**
Potential API abuse or brute-force scanning if an ingestion token is leaked.

**Remediation:**
Implement IP-based rate limiting per endpoint and configure 1-hour maximum expiration for indexing service tokens.

---
## Dependency Vulnerabilities

| Dependency | Scope | Current Version | Security Risk / Vulnerability | Severity | Fixed In / Recommendation |
|-----------|-------|----------------|-------------------------------|----------|---------------------------|
| `hono` | Backend | `^4.0.0` | Loose semver constraint may pull versions with unpatched CORS/middleware bugs | Medium | Pin to `~4.6.0` or exact version `4.6.14` in `package.json` |
| `undici` | Extension | `^6.21.0` | HTTP Client — SSRF risk if request URLs are user-controlled | Medium | Restrict outbound URLs with whitelist validator |
| `@vscode/proxy-agent` | Extension | `^0.43.0` | Node proxy agent — verify credential masking in proxy logs | Low | Mask proxy authorization headers in debug logs |
| `pg` / `better-sqlite3` | Backend | `^8.22.0` / `3.x` | Database drivers — safe when parameterized | Low | Enforce strict query parameterization |

---

## Security Headers Assessment (Backend HTTP Server)

| Header | Status | Recommendation |
|--------|--------|----------------|
| `Strict-Transport-Security` | ⚠️ Missing | Add `max-age=31536000; includeSubDomains` header for TLS connections |
| `Content-Security-Policy` | ⚠️ Missing | Restrict webview / API response execution contexts |
| `X-Content-Type-Options` | ❌ Missing | Enforce `nosniff` on all JSON API responses |
| `X-Frame-Options` | ❌ Missing | Set `DENY` to prevent clickjacking in webview contexts |
| `Referrer-Policy` | ⚠️ Missing | Set `strict-origin-when-cross-origin` |
| `Permissions-Policy` | ⚠️ Missing | Restrict unnecessary browser features |

---

## Remediation Priority

| Priority | Finding | Severity | Effort | Impact | Target Phase |
|----------|---------|----------|--------|--------|--------------|
| **P1** | Finding #1: Cryptographic Integrity Scope Bypass | 🔴 Critical | Medium | Prevents local cache tampering & KB poisoning | Phase 5 (DEV) |
| **P2** | Finding #2: Path Traversal Vulnerability | 🟠 High | Low | Prevents arbitrary local file reads/writes | Phase 5 (DEV) |
| **P3** | Finding #3: Missing Mandatory Auth & BOLA on API | 🟠 High | Medium | Secures backend ingestion API against unauthorized access | Phase 5 (DEV) |
| **P4** | Finding #4: Cleartext Storage & `.gitignore` Exclusions | 🟡 Medium | Low | Protects proprietary Pega rules from Git leaks | Phase 5 (DEV) |
| **P5** | Finding #5: Unencrypted HTTP Transport Risk | 🟡 Medium | Low | Prevents credential theft over remote networks | Phase 5 (DEV) |
| **P6** | Finding #6: Unrestricted Body & Payload Limits | 🟡 Medium | Low | Prevents Heap OOM Denial of Service | Phase 5 (DEV) |
| **P7** | Finding #7: Rate Limiting & Token Lifecycle | 🔵 Low | Low | Enhances defense-in-depth API protection | Phase 5 (DEV) |

---

## Recommendations Summary

### Immediate Actions (Critical / High — Must fix before Phase 5 DEV implementation)
1. **Fix Hash Scope Flaw (Finding #1):** Update local rule validation in `tryReadLocalRule` to verify raw payload content hash alongside metadata 3-field checksum before accepting local file cache.
2. **Fix Path Traversal (Finding #2):** Sanitize `pxObjClass` and `pyRuleName` path components (strip `..`) and enforce canonical path boundary check: `targetPath.startsWith(rulesBaseDir + path.sep)`.
3. **Enforce API Auth & BOLA Validation (Finding #3):** Attach mandatory `jwtAuth` and `verifyProjectAccess` middleware to `POST /api/v1/pega/ingest-rule`.

### Short-term Improvements (Medium — Address during Phase 5 DEV sprint)
1. **Auto-update `.gitignore` (Finding #4):** Add `rules/` and `*.pega.json` to `.gitignore` on extension activation.
2. **Enforce HTTPS for Remote Destinations (Finding #5):** Validate `kiroSdlc.pegaEndpoint` and `kiroSdlc.backend.url` and reject unencrypted HTTP for non-loopback hosts.
3. **Add Body Size Limits (Finding #6):** Configure Hono `bodyLimit({ maxSize: 5 * 1024 * 1024 })` on all backend API routes.

### Long-term Hardening (Low / Informational)
1. Configure Hono `secureHeaders` middleware for backend server.
2. Pin semver dependencies (`hono`, `undici`) to explicit patch versions.

---

## Appendix

### A. Tools & Methodology
- Static security design review & threat modeling based on OWASP Top 10 (2021) and OWASP API Security Top 10 (2023).
- Manual code & architecture design analysis of `documents/SA4E-301/TDD.md`, `extension/src/services/PegaBfsIndexer.ts`, and `backend/package.json`.
- CVSS v3.1 Scoring Calculator methodology.

### B. Scope Limitations
- Static review of technical design documentation and source code configuration.
- Dynamic penetration testing, network sniffing, and live server exploitation were not performed.

### C. Glossary
- **BOLA**: Broken Object Level Authorization
- **CWE**: Common Weakness Enumeration
- **CVSS**: Common Vulnerability Scoring System
- **IDOR**: Insecure Direct Object Reference
- **INV-1**: Invariant 1 — Strict SHA-256 3-field Pega Rule Checksum Formula
- **OWASP**: Open Web Application Security Project
