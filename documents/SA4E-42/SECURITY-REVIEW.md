# 🔒 Security Design Review — SA4E-42

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (Code Intelligence MCP Server) |
| Ticket | SA4E-42 — find_tools does not re-index when child MCP server connects late |
| Scope | Design review of the Re-index Subscriber (event-driven `mcp_tools` re-index), additive `server` column migration, scoped upsert/prune/delete SQL, and per-server async concurrency model |
| Sources reviewed | `documents/SA4E-42/TDD.md`, `documents/SA4E-42/FSD.md` §12 (IR-1..IR-10); grounded against `backend/src/index.ts`, `engine/db/schema.ts`, `admin/db/schema.ts`, `modules/orchestration/McpClientManager.ts` |
| Phase | 3.7 — Security Design Review |
| Date | 2026-02-14 |
| Assessor | Security Agent |
| Tech stack (actual) | Node.js / TypeScript / Hono / better-sqlite3 / ONNX EmbeddingService / pino |
| Version | 1.0 |

> ⚠️ **Note on tech stack:** This ticket targets the **Node.js / better-sqlite3** backend (not Kotlin/Ktor). Findings and remediation are written for that stack. Static design review only — no runtime/dynamic testing performed (see Scope Limitations).

---

## Executive Summary

SA4E-42 is an internal, backend-only bug fix that adds an event-driven re-index subscriber so the `find_tools` semantic index (`mcp_tools`) stays current when a child MCP server connects late, auto-reconnects, disconnects, or fails. It introduces **no new external interface** (no new MCP tool, HTTP route, or socket), **no new authN/authZ surface**, **no new dependency**, and processes **only tool metadata** (name/description/schema) plus derived embedding vectors — no user PII.

The design is security-sound for its threat model. The two highest-value security decisions are already made correctly: (1) all SQL uses **bound parameters** with no string interpolation of any server- or tool-derived value, and (2) a **dedicated `server` column** (instead of the overloaded `category`) makes scoped `DELETE ... WHERE server = ?` unable to match core tools (whose `server IS NULL`) — so BR-05 scope isolation is safe *by construction* rather than by naming convention. Debounce + per-server serialization + a latest-state guard bound the work triggered by reconnect flapping, and fail-soft error handling keeps a partial failure from wiping the index (reads degrade to last-known-good).

**No Critical or High findings.** Four Low and three Informational findings are noted for hardening — chiefly a cross-server row-overwrite edge caused by the globally-`UNIQUE` `name` column, a swallow-all `catch {}` inherited from the SA4E-41 migration precedent, and log-hygiene of raw error payloads. None block the pipeline.

**Overall Risk Rating: Low** — ✅ Pipeline may proceed to Phase 4.

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 0 |
| 🔵 Low | 4 |
| ℹ️ Informational | 3 |

---

## Answers to the Review Questions

| # | Question | Verdict | Detail |
|---|----------|---------|--------|
| 1 | SQL injection — scoped upsert/prune/delete parameterized? `DELETE ... WHERE server=?` and `NOT IN (...)` safe? | ✅ Safe | All statements are `better-sqlite3` prepared statements with bound params. The `NOT IN` placeholder string is built from `?` literals only (count = number of tool names); tool names are passed as bound values, never interpolated. See F-06 for the one verification DEV must keep true. |
| 2 | Scope isolation — can scoped delete remove another server's tools or a core tool (`server IS NULL`)? | ✅ Safe by construction, ⚠️ one edge | Dedicated `server` column + `WHERE server = ?` cannot match `server IS NULL` core tools. One residual edge: globally-`UNIQUE` `name` lets two child servers with an identically-named tool overwrite each other's row → **F-01 (Low)**. |
| 3 | Data protection — PII in tool metadata/embeddings? | ✅ None expected | Only tool name/description/schema + derived vectors, classified Internal. Metadata originates from operator-configured child servers. See F-07 (Info). |
| 4 | DoS/resource — reconnect flapping → re-index storm? debounce/mutex enough? | ✅ Adequate | 250 ms debounce + per-server async mutex + latest-state guard coalesce flapping to one refresh per settled state. Residual: slow flapping (>250 ms period) still re-embeds → **F-05 (Info)**; very large tool sets can hit the SQLite bound-variable limit → **F-04 (Low)**. |
| 5 | Injection via server name — is `serverName` validated/escaped when used as scoping key? | ✅ Safe | `serverName` comes from operator-authored `orchestration.json` keys (trusted config), and is used only as a **bound parameter**, never string-interpolated into SQL or shell. See F-06 (Info). |
| 6 | Dependency risks — new dependency added? | ✅ None | Reuses existing `better-sqlite3`, `EmbeddingService` (ONNX), `pino`. No new runtime dependency introduced (confirmed against TDD §7 and design). |
| 7 | Error handling — does fail-soft leak sensitive info in logs? | ⚠️ Minor | Fail-soft is correct (prior state preserved, other servers unaffected). But logging raw caught `err` and `event.error` (child-server-supplied) can leak internal paths/stack traces into operator logs → **F-03 (Low)**. |
| 8 | Migration safety — additive `ALTER TABLE`, no data loss? | ✅ Safe, ⚠️ pattern | `ADD COLUMN server TEXT` (nullable, no default) is additive and non-destructive; `CREATE INDEX IF NOT EXISTS` is idempotent. The SA4E-41 precedent's blind `catch {}` swallows all errors → **F-02 (Low)**; TDD already prefers a `PRAGMA table_info` probe (recommended). |

---

## Findings by OWASP Top 10 (2021)

### A01:2021 — Broken Access Control
Internal in-process feature, no request-level authorization surface. Scope isolation (BR-05) is enforced by the `server` column. One data-integrity edge from the unique-`name` constraint — see **F-01**.

### A02:2021 — Cryptographic Failures
No secrets, keys, or crypto introduced. Embedding vectors are non-sensitive derived data. No issues found ✅

### A03:2021 — Injection
SQL is fully parameterized; server/tool names are bound values. No command/LDAP/template injection vectors. Verification note **F-06**. No exploitable issues found ✅

### A04:2021 — Insecure Design
Fail-soft, idempotent, scope-isolated design is appropriate. Concurrency hazards (`await` interleaving) explicitly addressed via per-server mutex + latest-state guard. Minor robustness notes **F-04**, **F-05**.

### A05:2021 — Security Misconfiguration
Additive migration is low-risk. Migration error-handling pattern hardening — see **F-02**. No issues found in configuration exposure ✅

### A06:2021 — Vulnerable and Outdated Components
No new dependencies. No issues found ✅

### A07:2021 — Identification and Authentication Failures
No authentication surface touched. No issues found ✅

### A08:2021 — Software and Data Integrity Failures
Atomic single-transaction writes; embeddings generated before the transaction (no `await` inside). Unique-`name` cross-server overwrite is the only integrity edge — **F-01**.

### A09:2021 — Security Logging and Monitoring Failures
Per-server add/update/remove counts logged (BR-11) — good observability. Log-hygiene of raw error payloads — see **F-03**.

### A10:2021 — Server-Side Request Forgery (SSRF)
No outbound requests constructed from user/tool input. Tool reads use already-established child-server clients. No issues found ✅

---

## Detailed Findings

### Finding F-01: Global-`UNIQUE` `name` allows cross-server row overwrite (scope-isolation edge)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A08:2021 — Software and Data Integrity Failures |
| **CWE** | CWE-706: Use of Incorrectly-Resolved Name or Reference |
| **Location** | `engine/db/schema.ts` (`mcp_tools.name TEXT NOT NULL UNIQUE`); TDD §3.3 upsert (probe by `name`); FSD §12.2.1 |
| **Status** | Open |

**Description:**
`mcp_tools.name` is globally `UNIQUE`, and both the upsert and prune key on `name`. If two different child servers each expose a tool with the **same** `name`, the second server's `connected` re-index will `UPDATE` the first server's row (overwriting `server`, `category`, `vector`). Afterwards, a `disconnected`/`failed` event for the second server (`DELETE ... WHERE server = ?`) removes a tool that a user of the first server still expects, or the prune reassigns ownership. This is a scope-isolation edge that the dedicated `server` column does not by itself close, because the collision happens on the `name` key before scoping applies.

**Evidence:**
```typescript
// engine/db/schema.ts — name is globally unique across ALL servers
CREATE TABLE IF NOT EXISTS mcp_tools (
  ...
  name TEXT NOT NULL UNIQUE,   // <-- collision point across servers
  server TEXT,                 // scoping key (SA4E-42)
  ...
);

// TDD §3.3 / FSD §12.2.1 — upsert probes by name only
SELECT id FROM mcp_tools WHERE name = @name;  // matches ANY server's row with that name
```

**Impact:**
Low in practice: current live servers (`atlassian`, `markdown-exporter`) have non-colliding tool names, so no current exploit. But a future/misconfigured child server (or a malicious child server presenting a well-known tool name) could silently hijack or evict another server's index entry, causing `find_tools` to route discovery to the wrong owner. Integrity/availability of the discovery index, not data disclosure.

**Remediation:**
Prefer a namespaced identity so ownership is explicit, while keeping `name` stable for `find_tools`. Minimal, non-breaking option — make the probe scope-aware so cross-server collisions are detected rather than silently overwritten, and log a collision warning (fail-soft):
```typescript
// Scope-aware probe: only treat as "same tool" when it belongs to this server (or is unowned)
const existing = db.prepare(
  'SELECT id, server FROM mcp_tools WHERE name = ?'
).get(it.name) as { id: number; server: string | null } | undefined;

if (existing && existing.server && existing.server !== serverName) {
  logger.warn(
    { server: serverName, tool: it.name, ownedBy: existing.server },
    're-index skipped: tool name already owned by another server (collision)'
  );
  continue; // do not hijack another server's row
}
```
Longer term (schema change, out of scope for this bug): store proxied tools under a namespaced key (e.g. `${server}:${name}`) or change the uniqueness constraint to `UNIQUE(name, server)` with a namespaced display name.

**References:**
- CWE-706: https://cwe.mitre.org/data/definitions/706.html

---

### Finding F-02: Migration uses swallow-all `catch {}` (inherited SA4E-41 pattern)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 — Security Misconfiguration |
| **CWE** | CWE-703: Improper Check or Handling of Exceptional Conditions |
| **Location** | Precedent: `admin/db/schema.ts:112` (`catch { /* column already exists */ }`); planned `engine/db/schema.ts` `server` migration (TDD §3.2, FSD §12.3) |
| **Status** | Open |

**Description:**
The additive migration itself is safe (see Migration Safety Assessment). The concern is the **error-handling pattern** the SA4E-41 precedent establishes: a blind `try { ALTER TABLE ... } catch { /* ignore */ }` swallows **every** error, not only "duplicate column name". A genuine failure (DB locked, disk full, corrupted schema) would be silently ignored, after which `CREATE INDEX IF NOT EXISTS idx_mcp_tools_server` may run against a table without the column and fail confusingly — with no signal to the operator. This also violates the project code-standard "no swallowed exceptions."

**Evidence:**
```typescript
// admin/db/schema.ts:111-115 — precedent the TDD points to
try {
  db.exec(`ALTER TABLE graph_nodes ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
} catch { /* column already exists */ }   // <-- swallows ALL errors, not just duplicate-column
db.exec(`CREATE INDEX IF NOT EXISTS idx_graph_nodes_project ON graph_nodes(project_id)`);
```

**Impact:**
Low. A silent migration failure would leave `mcp_tools` without the `server` column; scoped operations would then fail at runtime (caught fail-soft) and the index would go stale — a reliability/observability gap, not a direct security breach. Diagnosis is harder because the root failure was swallowed.

**Remediation:**
Use the `PRAGMA table_info` probe the TDD already recommends (§3.2) instead of blind try/catch, and if retaining a catch, re-throw anything that is not the expected duplicate-column error:
```typescript
function ensureServerColumn(db: Database): void {
  const cols = db.prepare(`PRAGMA table_info(mcp_tools)`).all() as { name: string }[];
  if (!cols.some(c => c.name === 'server')) {
    db.exec(`ALTER TABLE mcp_tools ADD COLUMN server TEXT`); // additive, nullable
  }
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server)`);
}
// If keeping try/catch, narrow it:
// catch (e) { if (!String(e.message).includes('duplicate column name')) throw e; }
```

**References:**
- CWE-703: https://cwe.mitre.org/data/definitions/703.html

---

### Finding F-03: Fail-soft logging may leak child-server error internals

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A09:2021 — Security Logging and Monitoring Failures |
| **CWE** | CWE-209: Generation of Error Message Containing Sensitive Information |
| **Location** | TDD §6 (error table), FSD §12.5 pseudocode (`logger.warn({..., err: e})`), `event.error` field (FSD §12.1.1) |
| **Status** | Open |

**Description:**
The fail-soft handlers log the full caught exception object (`err: e`) and the design consumes `event.error` (a child-server-supplied string) for logging. Raw error objects can carry stack traces, absolute filesystem paths, and child-server transport internals. While these logs are for the platform operator (not an external user), unbounded inclusion of externally-influenced (`event.error`) content in structured logs is a log-hygiene and log-injection risk. The TDD already lists this as an open item for this review.

**Evidence:**
```text
// FSD §12.5 pseudocode
logger.warn({server: serverName, err: e}, "re-index write failed; retry next event")
// FSD §12.1.1: event.error is "Present on unhealthy/failed/disconnected; logged"
```

**Impact:**
Low. Operator-only exposure of internal paths/stack traces; potential log-forging if `event.error` contains newlines/control chars. No user-facing disclosure.

**Remediation:**
Log a bounded, allowlisted error representation — message only, length-capped, and let `pino` serialize via its `err` serializer rather than dumping arbitrary child strings:
```typescript
const safeErr = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).slice(0, 500);

logger.warn(
  { server: serverName, phase: 'write', err: safeErr(e) },
  're-index write failed; retry next event'
);
// For event.error, log a bounded field, never the raw payload verbatim:
logger.warn({ server: event.serverName, reason: safeErr(event.error) }, 'server removal');
```
Confirm the log-field allowlist is `{ serverName, phase, counts, boundedMessage }` — no tool arguments, no credentials, no raw transport payloads.

**References:**
- CWE-209: https://cwe.mitre.org/data/definitions/209.html
- CWE-117 (Log Injection): https://cwe.mitre.org/data/definitions/117.html

---

### Finding F-04: Prune `NOT IN (...)` can exceed SQLite bound-variable limit for large tool sets

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A04:2021 — Insecure Design |
| **CWE** | CWE-770: Allocation of Resources Without Limits or Throttling |
| **Location** | TDD §3.3 prune; FSD §12.2.2 (`DELETE ... WHERE server = ? AND name NOT IN (?, ?, ...)`) |
| **Status** | Open |

**Description:**
The prune generates one positional placeholder per current tool name. `better-sqlite3` / SQLite caps bound parameters per statement (historically `SQLITE_MAX_VARIABLE_NUMBER` = 999; 32766 in SQLite ≥ 3.32). A child server exposing a very large number of tools would exceed the limit and the prepared statement would throw. Fail-soft catches it (prior state preserved), so it is not a crash, but the prune silently never succeeds for that server and stale rows accumulate.

**Impact:**
Low. Requires an unusually large tool count from a single child server. Degrades index accuracy for that server (stale entries), not a breach.

**Remediation:**
Guard the placeholder count and fall back to an anti-join via a temp table (or chunk the names) when it is large:
```typescript
const MAX_VARS = 900; // safe margin under SQLITE_MAX_VARIABLE_NUMBER
if (currentNames.length <= MAX_VARS) {
  const ph = currentNames.map(() => '?').join(',');
  db.prepare(`DELETE FROM mcp_tools WHERE server = ? AND name NOT IN (${ph})`)
    .run(serverName, ...currentNames);
} else {
  // fallback: stage names in a temp table and delete via anti-join (no variable-count limit)
  db.exec(`CREATE TEMP TABLE IF NOT EXISTS _keep(name TEXT PRIMARY KEY)`);
  db.prepare(`DELETE FROM _keep`).run();
  const ins = db.prepare(`INSERT OR IGNORE INTO _keep(name) VALUES (?)`);
  for (const n of currentNames) ins.run(n);
  db.prepare(
    `DELETE FROM mcp_tools WHERE server = ? AND name NOT IN (SELECT name FROM _keep)`
  ).run(serverName);
}
```

**References:**
- CWE-770: https://cwe.mitre.org/data/definitions/770.html

---

### Finding F-05: Debounce coalesces only within 250 ms — slow flapping still re-embeds (Informational)

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A04:2021 — Insecure Design |
| **CWE** | CWE-400: Uncontrolled Resource Consumption |
| **Location** | TDD §5 (debounce 250 ms), FSD §12.4 |
| **Status** | Open (accept / defense-in-depth) |

**Description:**
The 250 ms debounce coalesces bursts, but a server that flaps on a period longer than 250 ms (e.g., reconnect every 1–2 s) will trigger a full re-embed of its tool set on each settled `connected` event. Embedding is CPU-bound (ONNX). This is bounded in practice by the SA4E-37 reconnect backoff (exponential), which is the correct upstream throttle, and by per-server serialization (one server cannot parallel-saturate itself).

**Impact:**
Informational. Worst case is elevated CPU for a persistently-flapping misconfigured server; other servers remain responsive (disjoint chains), and `find_tools` reads are off the write path.

**Remediation (optional, defense-in-depth):**
Skip re-embedding when the tool set is unchanged since the last successful index for that server (hash of `name+description` per server), so a reconnect with identical tools becomes a cheap no-op. Rely on SA4E-37 backoff as the primary bound.

**References:**
- CWE-400: https://cwe.mitre.org/data/definitions/400.html

---

### Finding F-06: SQL injection surface — verified safe; keep placeholder builder value-free (Informational)

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A03:2021 — Injection |
| **CWE** | CWE-89: SQL Injection (verification note) |
| **Location** | TDD §3.3, FSD §12.2 (all statements) |
| **Status** | Verified / advisory |

**Description:**
All statements are prepared with bound parameters; `serverName` and tool names are passed as values, never concatenated. The only dynamic SQL fragment is the prune's placeholder list, which is built purely from `?` literals (`currentNames.map(() => '?').join(',')`) — it contains no tool- or server-derived characters. This is safe. The advisory is to **keep it that way**: the placeholder string must always be generated from a count, never by interpolating the names themselves.

**Evidence:**
```typescript
// Correct (safe): placeholder count only, values bound separately
const ph = currentNames.map(() => '?').join(',');           // "?,?,?"
db.prepare(`... NOT IN (${ph})`).run(serverName, ...currentNames);

// WRONG (never do this): interpolating names into SQL
// db.prepare(`... NOT IN ('${currentNames.join("','")}')`)  // <- injection
```

**Remediation:**
Add a unit test asserting the prune statement text contains only `?` placeholders (no quotes/values), and that a tool named e.g. `x'); DROP TABLE mcp_tools;--` is stored/pruned correctly as data.

**References:**
- CWE-89: https://cwe.mitre.org/data/definitions/89.html

---

### Finding F-07: Data protection — no PII; embeddings of operator-trusted metadata (Informational)

| Attribute | Value |
|-----------|-------|
| **Severity** | ℹ️ Informational |
| **OWASP Category** | A02:2021 — Cryptographic Failures (data classification) |
| **CWE** | N/A |
| **Location** | TDD §7, FSD §7.2 |
| **Status** | Verified |

**Description:**
Indexed content is tool `name`, `description`, `schema_json`, and a derived embedding vector — classified Internal, no user PII. Descriptions originate from operator-configured child servers (`orchestration.json`). No secrets are read or embedded. The embedding text template (`"Tool: {name}\nDescription: {description}"`) does not incorporate arguments, credentials, or transport secrets. No encryption-at-rest requirement is triggered by this change (consistent with existing `mcp_tools` handling).

**Remediation:**
No action required. If a future child server were to place sensitive data in tool descriptions, that would be a child-server configuration concern, not this feature's — worth a one-line note in operator docs.

---

## Migration Safety Assessment (Question 8 detail)

| Aspect | Assessment |
|--------|-----------|
| `ALTER TABLE mcp_tools ADD COLUMN server TEXT` | ✅ Additive, nullable, **no default** → existing rows get `NULL`, no rewrite, no data loss. |
| Existing rows backfill | ⚠️ Existing proxied-tool rows keep `server = NULL` until the next `connected` re-index or the next startup ingest sets `server`. Until then a disconnect `DELETE WHERE server = ?` won't match them (they'd persist as stale). Converges after one event/startup — acceptable; note for DEV. |
| `CREATE INDEX IF NOT EXISTS idx_mcp_tools_server` | ✅ Idempotent. |
| Guard mechanism | ✅ TDD recommends `PRAGMA table_info` probe (preferred). ⚠️ Avoid the blind `catch {}` precedent — see **F-02**. |
| Rollback | ✅ Feature-flag-free; leaving the column in place is harmless if the subscriber is reverted (`find_tools` uses `SELECT *`). |
| Base DDL update | ✅ Adding `server` to `CREATE TABLE ... mcp_tools` in `schema.ts` keeps fresh installs consistent. |

Conclusion: **Migration is safe and non-destructive.** Only hardening item is the error-handling pattern (F-02) and the one-event backfill note above.

---

## Dependency Vulnerabilities

No new dependencies introduced by SA4E-42. Reused components: `better-sqlite3`, `EmbeddingService` (ONNX runtime), `pino`. Dependency CVE scanning is out of scope for this design review and is covered at Phase 5.7 (Security Code Review) against the actual lockfile.

| Dependency | Change | Note |
|-----------|--------|------|
| (none) | No add/upgrade | Feature is pure application logic + additive schema |

---

## Remediation Priority

| Priority | Finding | Severity | Effort | Impact |
|----------|---------|----------|--------|--------|
| 1 | F-02 — replace swallow-all `catch {}` with `PRAGMA` probe / narrowed catch | Low | Low | Reliable, observable migration |
| 2 | F-03 — bounded/allowlisted error logging | Low | Low | No internal-path/log-injection leakage |
| 3 | F-01 — scope-aware upsert probe + collision warning | Low | Low–Med | Closes cross-server hijack edge |
| 4 | F-04 — guard prune placeholder count (temp-table fallback) | Low | Low | Robust for large tool sets |
| 5 | F-06 — unit test asserting parameterized prune | Info | Low | Prevents future injection regressions |
| 6 | F-05 — skip re-embed on unchanged tool set | Info | Med | CPU efficiency under flapping |
| 7 | F-07 — operator-doc note on child metadata sensitivity | Info | Low | Awareness |

---

## Recommendations Summary

### Immediate Actions (Critical/High)
None — no Critical or High findings.

### Short-term Improvements (Low — recommend addressing during DEV / Phase 5)
1. Migration: use `PRAGMA table_info(mcp_tools)` probe instead of blind `catch {}`; if a catch is kept, re-throw non-"duplicate column" errors (F-02).
2. Logging: log `err.message` bounded/allowlisted, never raw child `event.error` verbatim (F-03).
3. Upsert: make the probe scope-aware and log a collision warning so one child server cannot silently overwrite another's row (F-01).
4. Prune: guard the `NOT IN` placeholder count with a temp-table anti-join fallback for large tool sets (F-04).

### Long-term Hardening (Informational)
1. Add a unit test proving the prune statement is parameterized and injection-safe (F-06).
2. Skip re-embedding when a server's tool set is unchanged (F-05).
3. Document that child-server tool descriptions are indexed as Internal data (F-07).

---

## Conclusion for Pipeline

✅ **No Critical or High findings. Overall risk = Low. The design is approved to proceed to Phase 4.**

The core security properties are correct by construction: fully parameterized SQL, dedicated `server` scoping column (safe scoped delete that cannot touch core tools), bounded concurrency (debounce + per-server mutex + latest-state guard), fail-soft writes that preserve last-known-good state, additive/non-destructive migration, and no new dependency or external attack surface. The four Low findings are hardening items suitable for the implementation phase and should be re-verified in Phase 5.7 (Security Code Review); none require a TDD change to unblock the pipeline.

---

## Appendix

### A. Tools & Methodology
- Static design review of TDD.md and FSD §12 (IR-1..IR-10).
- Source-code grounding: `backend/src/index.ts` (startup ingest), `engine/db/schema.ts` (`mcp_tools` DDL), `admin/db/schema.ts` (SA4E-41 migration precedent), `modules/orchestration/McpClientManager.ts` (`registerServerTools`, `getProxiedTools`, `executeTool`).
- OWASP Top 10 (2021) and OWASP Testing Guide v4.2 methodology; CWE for weakness classification.

### B. Scope Limitations
- **Design review only** — no dynamic/runtime testing, no penetration testing, no dependency CVE scan against the lockfile (deferred to Phase 5.7 / 6.3).
- Assumes `serverName` values continue to originate solely from operator-authored `orchestration.json` (trusted config), not from any external/user-controlled source.
- Assumes SA4E-37 provides bounded (exponential-backoff) reconnect behavior as the upstream throttle for flapping.
- Correctness of the not-yet-written implementation cannot be asserted here; findings are against the design and must be re-validated on actual code.

### C. Glossary
- **CVSS**: Common Vulnerability Scoring System
- **CWE**: Common Weakness Enumeration
- **OWASP**: Open Web Application Security Project
- **IDOR/BOLA**: Insecure Direct Object Reference / Broken Object Level Authorization
- **Fail-soft**: On error, preserve prior valid state and continue rather than crashing or wiping data
