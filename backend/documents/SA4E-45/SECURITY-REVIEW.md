# 🔒 Security Design Review — SA4E-45

## Document Information

| Field | Value |
|-------|-------|
| Ticket | SA4E-45 |
| Scope | Refactor engine layer — DatabaseAdapter abstraction for IndexingEngine, MemoryEngine, GraphSync |
| Date | 2025-07-18 |
| Reviewer | Security Agent |
| TDD Version | 1.0 |
| Status | Complete |

---

## Executive Summary

SA4E-45 introduces a `DatabaseAdapter` abstraction layer and `DialectHelper` module to decouple engine modules from concrete SQLite. The TDD design is **generally solid** on SQL injection prevention — all data queries use parameterized statements (`?` placeholders). However, several **Medium** and **Low** severity issues were identified related to: (1) SSL certificate validation disabled in PostgresAdapter, (2) encryption key file permissions, (3) table name interpolation in migration/utility methods, (4) `.gitignore` gaps for sensitive files, and (5) missing connection string sanitization in logs.

**Overall Risk Rating: Medium**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 |
| 🟡 Medium | 4 |
| 🔵 Low | 3 |
| ℹ️ Informational | 2 |

---

## Findings Summary

| # | Finding | Severity | OWASP | CWE | Location |
|---|---------|----------|-------|-----|----------|
| 1 | TLS Certificate Validation Disabled (`rejectUnauthorized: false`) | 🟠 High | A02 | CWE-295 | `PostgresAdapter.ts:40` |
| 2 | Encryption Key File Has No Restrictive Permissions | 🟡 Medium | A02 | CWE-732 | `DatabaseConfigService.ts:93` |
| 3 | Table Name Interpolation in `getRowCount()` and `copyTable()` | 🟡 Medium | A03 | CWE-89 | Multiple adapters + `MigrationService.ts:112` |
| 4 | `.gitignore` Missing `.env` and `.dbkey` Patterns | 🟡 Medium | A05 | CWE-538 | Root `.gitignore` |
| 5 | DialectHelper `upsert()`/`insertIgnore()` — Table/Column Names Not Quoted | 🟡 Medium | A03 | CWE-89 | TDD §2.1 (proposed code) |
| 6 | FTS Sanitization Allows Colon (`:`) — Minor FTS Injection | 🔵 Low | A03 | CWE-89 | TDD §2.3 / `core.ts:55` |
| 7 | Migration `BATCH_SIZE` Interpolated via Template Literal | 🔵 Low | A03 | CWE-89 | `MigrationService.ts:112` |
| 8 | No Rate Limiting on Database Migration Endpoint | 🔵 Low | A05 | CWE-770 | Server routes |
| 9 | `exec(sql)` Method Accepts Raw Multi-Statement SQL | ℹ️ Info | A03 | CWE-89 | `DatabaseAdapter.ts` interface |
| 10 | Synchronous PG Adapter Methods Throw — Insufficient Error Context | ℹ️ Info | A09 | CWE-209 | `PostgresAdapter.ts:53-58` |

---

## Detailed Findings

### Finding #1: TLS Certificate Validation Disabled

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A02:2021 — Cryptographic Failures |
| **CWE** | CWE-295: Improper Certificate Validation |
| **CVSS Score** | 7.4 |
| **Location** | `backend/src/database/adapters/PostgresAdapter.ts:40` |
| **Status** | Open |

**Description:**
When SSL is enabled for PostgreSQL connections, the adapter sets `rejectUnauthorized: false`, which disables server certificate verification. This allows Man-in-the-Middle (MITM) attacks where an attacker could intercept database traffic between the application and PostgreSQL server.

**Evidence:**
```typescript
// PostgresAdapter.ts:40
ssl: this.config.ssl ? { rejectUnauthorized: false } : false,
```

**Impact:**
An attacker on the network path could intercept credentials and query data in transit. In cloud deployments (where network hops are less trusted), this is especially concerning. DB credentials (`DB_PASSWORD`) would be exposed.

**Remediation:**
```typescript
// Option 1: Validate against system CA (most secure for cloud-managed PG)
ssl: this.config.ssl ? { rejectUnauthorized: true } : false,

// Option 2: Allow CA cert to be configured
ssl: this.config.ssl ? {
  rejectUnauthorized: true,
  ca: this.config.sslCaCert ? fs.readFileSync(this.config.sslCaCert) : undefined,
} : false,
```

Add `sslCaCert?: string` to `PostgresConfig` interface. For development, allow `rejectUnauthorized: false` ONLY when `NODE_ENV=development`.

---

### Finding #2: Encryption Key File Has No Restrictive Permissions

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A02:2021 — Cryptographic Failures |
| **CWE** | CWE-732: Incorrect Permission Assignment for Critical Resource |
| **CVSS Score** | 5.5 |
| **Location** | `backend/src/database/config/DatabaseConfigService.ts:93` |
| **Status** | Open |

**Description:**
The `.dbkey` file containing the AES-256-GCM encryption key is written with default permissions (`fs.writeFileSync`). On multi-user systems, other users may read this file, compromising all encrypted passwords in `database.json`.

**Evidence:**
```typescript
// DatabaseConfigService.ts:93
private getKey(): Buffer {
  if (!fs.existsSync(this.keyPath)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(this.keyPath, key); // No permission restriction
    return key;
  }
  return fs.readFileSync(this.keyPath);
}
```

**Impact:**
Any process or user with read access to the data directory can read the encryption key and decrypt stored database passwords.

**Remediation:**
```typescript
private getKey(): Buffer {
  if (!fs.existsSync(this.keyPath)) {
    const key = crypto.randomBytes(32);
    fs.writeFileSync(this.keyPath, key, { mode: 0o600 }); // Owner read/write only
    return key;
  }
  return fs.readFileSync(this.keyPath);
}
```

---

### Finding #3: Table Name Interpolation in `getRowCount()` and `copyTable()`

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-89: SQL Injection |
| **CVSS Score** | 5.3 |
| **Location** | All adapters `getRowCount()`, `MigrationService.ts:112` |
| **Status** | Open — mitigated by trusted source |

**Description:**
Table names are interpolated into SQL via template literals. While in current usage the `table` parameter comes from `getTableNames()` (a trusted source: `sqlite_master` / `pg_tables`), this design creates a latent injection vector if callers change in the future.

**Evidence:**
```typescript
// SqliteAdapter.ts:114 / PostgresAdapter.ts:104 / MysqlAdapter.ts:114
async getRowCount(table: string): Promise<number> {
  const row = this.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM "${table}"`);
  return row?.cnt ?? 0;
}

// MigrationService.ts:112
const rows = this.source.all<Record<string, unknown>>(
  `SELECT * FROM "${table}" LIMIT ${BATCH_SIZE} OFFSET ${copied}`
);
```

**Impact:**
Currently low risk because `table` values come from system catalog queries. However, if future code passes user-controlled table names to these methods, SQL injection becomes possible. Defense-in-depth recommends sanitization.

**Remediation:**
```typescript
// Add table name validation helper
function assertValidIdentifier(name: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid identifier: ${name}`);
  }
}

// Use in getRowCount
async getRowCount(table: string): Promise<number> {
  assertValidIdentifier(table);
  const row = this.get<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM "${table}"`);
  return row?.cnt ?? 0;
}
```

---

### Finding #4: `.gitignore` Missing `.env` and `.dbkey` Patterns

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-538: Insertion of Sensitive Information into Externally-Accessible File or Directory |
| **CVSS Score** | 5.1 |
| **Location** | Root `.gitignore` |
| **Status** | Open |

**Description:**
The root `.gitignore` does NOT include `.env`, `.env.*`, or `.dbkey` patterns. While `.code-intel/` is ignored (which contains `.dbkey` in the standard setup), `.env` files at root or in `backend/` could be accidentally committed. The `.dockerignore` correctly excludes these, but `.gitignore` does not.

**Evidence:**
```
# Root .gitignore — missing entries:
# .env
# .env.*
# .dbkey
# database.json
```

**Impact:**
Developers could accidentally `git add .env` and push credentials (DB passwords, API keys) to the repository.

**Remediation:**
Add to root `.gitignore`:
```gitignore
# Secrets
.env
.env.*
!.env.example
!.env.test
.dbkey
database.json
```

---

### Finding #5: DialectHelper `upsert()`/`insertIgnore()` — Table/Column Names Not Quoted

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-89: SQL Injection |
| **CVSS Score** | 4.8 |
| **Location** | TDD Section 2.1 — proposed `DialectHelper.ts` |
| **Status** | Design-phase (not yet implemented) |

**Description:**
The proposed `DialectHelper.upsert()` and `insertIgnore()` methods directly interpolate table and column names without quoting. The TDD Section 5.2 states "only hardcoded string literals" will be passed, but the API design does not enforce this at the type level.

**Evidence (from TDD):**
```typescript
upsert(table: string, columns: string[], conflictKey: string, updateColumns: string[]): string {
  // No quoting of table or columns — relies on caller discipline
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (...)`;
}
```

**Impact:**
If any future caller passes user-derived values to `table` or `columns`, SQL injection is possible. This is a defense-in-depth concern since TDD Section 5.2 documents the restriction.

**Remediation:**
```typescript
private quoteIdentifier(name: string): string {
  // Double-quote escaping (works for PG and SQLite)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new DialectError(this.engine, 'quoteIdentifier', `Invalid identifier: ${name}`);
  }
  return `"${name}"`;
}

upsert(table: string, columns: string[], conflictKey: string, updateColumns: string[]): string {
  const qt = this.quoteIdentifier(table);
  const qc = columns.map(c => this.quoteIdentifier(c));
  const qk = this.quoteIdentifier(conflictKey);
  const qu = updateColumns.map(c => this.quoteIdentifier(c));
  
  if (this.engine === 'sqlite') {
    return `INSERT OR REPLACE INTO ${qt} (${qc.join(', ')}) VALUES (${qc.map(() => '?').join(', ')})`;
  }
  const setClauses = qu.map(c => `${c} = EXCLUDED.${c}`).join(', ');
  return `INSERT INTO ${qt} (${qc.join(', ')}) VALUES (${qc.map(() => '?').join(', ')}) ON CONFLICT (${qk}) DO UPDATE SET ${setClauses}`;
}
```

---

### Finding #6: FTS Sanitization Allows Colon (`:`) Character

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-89: SQL Injection |
| **CVSS Score** | 3.1 |
| **Location** | TDD Section 2.3, existing `core.ts:55` |
| **Status** | Open |

**Description:**
The FTS sanitization regex `/[^\w\s*":.]/g` allows the colon character (`:`) which in SQLite FTS5 is used for column filters (e.g., `content:malicious`). While this alone does not lead to data exfiltration, it could allow targeted column filtering in search results.

**Evidence:**
```typescript
// core.ts:55 + TDD Section 2.3
const ftsQuery = query.replace(/[^\w\s*":.]/g, ' ').trim() || '*';
```

**Impact:**
Attacker could use `column_name:value` syntax to search specific FTS columns, potentially revealing information about column structure. Low impact because FTS results are still filtered by scope/permissions.

**Remediation:**
Remove `:` from allowed characters if column filtering is not intended:
```typescript
const ftsQuery = query.replace(/[^\w\s*"]/g, ' ').trim() || '*';
```

---

### Finding #7: Migration `BATCH_SIZE` Interpolated via Template Literal

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-89: SQL Injection |
| **CVSS Score** | 2.0 |
| **Location** | `backend/src/database/migration/MigrationService.ts:112` |
| **Status** | Open — no actual risk (constant value) |

**Description:**
`BATCH_SIZE` (500) and `copied` (numeric counter) are interpolated in SQL via template literal instead of parameterized. While both are always numeric constants controlled by the application, this violates the TDD's stated principle of "ALL queries use parameterized statements."

**Evidence:**
```typescript
`SELECT * FROM "${table}" LIMIT ${BATCH_SIZE} OFFSET ${copied}`
```

**Impact:**
No actual injection risk since both values are application-controlled integers. This is a code style consistency issue that could mask real injection if the pattern is copied elsewhere.

**Remediation:**
```typescript
this.source.all<Record<string, unknown>>(
  `SELECT * FROM "${table}" LIMIT ? OFFSET ?`,
  [BATCH_SIZE, copied]
);
```

---

### Finding #8: No Rate Limiting on Database Migration/Admin Endpoints

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-770: Allocation of Resources Without Limits |
| **CVSS Score** | 3.7 |
| **Location** | `backend/src/server/routes/admin/database.ts` |
| **Status** | Open |

**Description:**
Database admin routes (test connection, trigger migration) have no rate limiting. Repeated calls could cause resource exhaustion (connection pool depletion, disk I/O pressure during migration).

**Impact:**
Low impact since these are admin routes (presumably authenticated), but defense-in-depth suggests rate limiting expensive operations like migration.

**Remediation:**
Add rate limiting middleware on `/admin/database/*` routes — 5 requests/minute for migration, 10 requests/minute for test connection.

---

### Finding #9: `exec(sql)` Method Accepts Raw Multi-Statement SQL (Informational)

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-89 |
| **Location** | `DatabaseAdapter.ts` interface |

**Description:**
The `exec(sql: string)` method accepts arbitrary SQL strings (potentially multi-statement). This is by design for DDL operations and schema setup. The TDD correctly limits its use to schema operations, but the interface does not enforce this restriction.

**Recommendation:**
Document clearly that `exec()` MUST NEVER receive user-controlled input. Consider adding a JSDoc warning:
```typescript
/**
 * Execute raw SQL (DDL only). 
 * WARNING: NEVER pass user input to this method. Use run/get/all with params instead.
 */
exec(sql: string): void;
```

---

### Finding #10: Synchronous PG Methods Throw Generic Errors (Informational)

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A09:2021 — Security Logging and Monitoring Failures |
| **CWE** | CWE-209 |
| **Location** | `PostgresAdapter.ts:53-58` |

**Description:**
Sync method stubs throw `new Error('Use runAsync')` which could confuse error monitoring. After SA4E-45 refactor, engines will call these sync methods on PG adapters (per TDD Section 1.3 Decision #1: "PG adapter wraps async internally"). Ensure the sync-to-async bridge handles errors with proper context.

**Recommendation:**
After SA4E-45, these sync stubs should be replaced with proper async-to-sync bridges or the decision to keep `DatabaseAdapter` synchronous must include a wrapping strategy for PG.

---

## Security Design Assessment (TDD Section 5)

### What Is Done Well

| Area | Assessment |
|------|-----------|
| **Parameterized queries** | All data operations use `?` placeholders — strong SQL injection prevention ✅ |
| **Credential encryption at rest** | AES-256-GCM with random IV for passwords in `database.json` ✅ |
| **No credentials in logs** | `getStatus()` explicitly excludes connection details ✅ |
| **Adapter non-serializable** | No risk of credential leakage via JSON.stringify ✅ |
| **Connection lifecycle control** | `SqliteDbAdapter.connect()/disconnect()` are no-ops, preventing accidental manipulation ✅ |
| **Database files outside web root** | `.code-intel/` path not served by HTTP ✅ |
| **FTS input sanitization** | Regex strips special chars before FTS MATCH ✅ |
| **Migration rollback** | All-or-nothing with table drop on failure ✅ |
| **Transaction safety** | SQLite WAL mode + FK enforcement enabled ✅ |

### Areas for TDD Update

| Area | Current State | Recommendation |
|------|--------------|----------------|
| TLS verification | `rejectUnauthorized: false` | Make configurable; default to `true` in production |
| Key file permissions | Default OS permissions | Set `mode: 0o600` on creation |
| Identifier validation | Trust-based (caller discipline) | Add `assertValidIdentifier()` utility |
| `.gitignore` gaps | Missing `.env`, `.dbkey` | Add patterns to root `.gitignore` |
| DialectHelper quoting | No quoting in proposed code | Add identifier quoting + validation |

---

## Dependency Risk Assessment

| Dependency | Version | Known Risk | Status |
|-----------|---------|-----------|--------|
| `pg` | ^8.22.0 | No known critical CVEs in 8.x | ✅ OK |
| `better-sqlite3` | ^11.10.0 | No known critical CVEs | ✅ OK |
| `hono` | ^4.0.0 | No known critical CVEs | ✅ OK |
| `pino` | ^9.2.0 | No known critical CVEs | ✅ OK |
| `zod` | ^3.23.0 | No known critical CVEs | ✅ OK |
| `@modelcontextprotocol/sdk` | ^1.29.0 | Relatively new, monitor for advisories | ⚠️ Watch |
| `@xenova/transformers` | ^2.0.1 | ML runtime — monitor for model loading vulns | ⚠️ Watch |
| `onnxruntime-node` | ^1.18.0 | Native module — monitor for memory safety | ⚠️ Watch |

No critical CVEs identified in current dependency set. Caret ranges (`^`) allow minor/patch updates which is acceptable for a development tool.

---

## Recommendations Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | Fix TLS certificate validation (#1) | Low | Prevents MITM on DB connections |
| 2 | Add `.env`/`.dbkey` to `.gitignore` (#4) | Low | Prevents credential leaks to VCS |
| 3 | Set file permissions on `.dbkey` (#2) | Low | Restricts encryption key access |
| 4 | Add identifier validation for DialectHelper (#5) | Medium | Defense-in-depth for SQL construction |
| 5 | Parameterize LIMIT/OFFSET in migration (#7) | Low | Code consistency |

---

## Recommendations for DEV Implementation

### Immediate Actions (before implementation)

1. **Update `.gitignore`** — add `.env`, `.env.*`, `.dbkey`, `database.json`
2. **Fix `rejectUnauthorized`** — make it configurable, default `true` for production
3. **Set `.dbkey` file permissions** — `mode: 0o600`

### During Implementation (SA4E-45)

4. **Add `assertValidIdentifier()` utility** — validate table/column names in `DialectHelper`
5. **Quote identifiers in DialectHelper** — use `"identifier"` quoting
6. **Remove `:` from FTS sanitization regex** — unless column filtering is intended
7. **Parameterize all literals in migration queries** — even constants like `BATCH_SIZE`
8. **Add JSDoc security warnings** on `exec()` method in `DatabaseAdapter` interface

### Post-Implementation

9. **Add integration test** verifying `rejectUnauthorized` is true when `NODE_ENV=production`
10. **Document async bridge strategy** for PostgresAdapter sync stubs (SA4E-46 prerequisite)

---

## Scope Limitations

- **Static analysis only** — no dynamic testing, penetration testing, or runtime verification performed
- **Design review** — findings are based on TDD proposed code and existing source code patterns
- **No infrastructure review** — network policies, firewall rules, and deployment configs not assessed
- **Dependencies** — CVE check based on known advisories at time of review; not a full SCA scan
- **Authentication endpoints** — not in scope for this refactor (SA4E-45 is engine-layer only)
