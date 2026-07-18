# Business Requirements Document (BRD)

## SDLC-Agents-4-Enterprise — SA4E-33: Multi-database Support with Admin Configuration & Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-33 |
| Title | Multi-database support with admin configuration page and migration |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-14 |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-14 | BA Agent | Initial document — auto-generated from feature request |

---

## 1. Introduction

### 1.1 Scope

Implement multi-database support for the Code Intelligence backend. The system currently uses SQLite (better-sqlite3) exclusively. This CR adds:
- A database abstraction layer (Strategy pattern) enabling pluggable database engines
- Admin UI for database configuration (view current DB, switch engines, test connections)
- Data migration tooling to transfer existing data from SQLite to a target database (PostgreSQL, MySQL)
- Rollback capability if migration fails

### 1.2 Out of Scope

- Database clustering / replication setup
- Cloud-managed database provisioning (RDS, Cloud SQL)
- Schema versioning for application upgrades (handled separately)
- Multi-tenant database isolation
- Read replicas or connection pooling optimization

### 1.3 Preliminary Requirements

- Node.js backend with Hono framework operational
- Existing SQLite databases (admin.db, index.db) with defined schemas
- Admin webview panel accessible to authorized users

---

## 2. Business Requirements

### 2.1 High Level Process Map

The system provides a unified database layer that abstracts engine-specific operations. Administrators can view the current database configuration, switch to a different engine, and migrate existing data — all through the admin panel without touching configuration files or CLI.

### 2.2 List of User Stories

| # | Story | Priority | Source |
|---|-------|----------|--------|
| 1 | As an admin, I want to view the current database engine and connection status so that I know the system state | MUST HAVE | SA4E-33 |
| 2 | As an admin, I want to switch the database engine from SQLite to PostgreSQL/MySQL so that I can use a production-grade database | MUST HAVE | SA4E-33 |
| 3 | As an admin, I want to test the connection to a new database before committing so that I avoid downtime from misconfiguration | MUST HAVE | SA4E-33 |
| 4 | As an admin, I want to migrate all data from SQLite to the new database automatically so that I don't lose existing knowledge entries | MUST HAVE | SA4E-33 |
| 5 | As an admin, I want to see migration progress and rollback if it fails so that I can recover from errors safely | SHOULD HAVE | SA4E-33 |
| 6 | As a developer, I want the backend to use a database abstraction layer so that adding new database engines requires minimal code changes | MUST HAVE | SA4E-33 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** Admin opens the Database Configuration section in the admin panel

**Step 2:** System displays current database engine (SQLite/PostgreSQL/MySQL), connection status, and database file/URL

**Step 3:** Admin selects a different database engine from dropdown

**Step 4:** System shows connection configuration form (host, port, username, password, database name)

**Step 5:** Admin fills in connection details and clicks "Test Connection"

**Step 6:** System validates connection parameters and attempts to connect to the target database

**Step 7:** If test succeeds → "Start Migration" button becomes enabled; if fails → show error message

**Step 8:** Admin clicks "Start Migration"

**Step 9:** System creates schema in target database, copies all tables/data from SQLite, shows progress bar

**Step 10:** If migration succeeds → system switches active database, confirms success

**Step 11:** If migration fails → system rolls back to SQLite, shows error details

> **Note:** The original SQLite database is preserved as backup during and after migration. Migration is non-destructive to the source.

---

#### STORY 1: View Current Database Status

> As an admin, I want to view the current database engine and connection status so that I know the system state

**Requirement Details:**

1. Display the active database engine name (SQLite, PostgreSQL, MySQL)
2. Show connection status indicator (connected/disconnected/error)
3. For SQLite: show file path and size
4. For PostgreSQL/MySQL: show host, port, database name (mask password)
5. Show database statistics: total entries in admin.db, total indexed symbols in index.db

**Acceptance Criteria:**

1. GIVEN the admin panel is open, WHEN I navigate to Database Configuration, THEN I see the current engine name and status
2. GIVEN SQLite is active, WHEN I view the config, THEN I see the file paths for admin.db and index.db
3. GIVEN PostgreSQL is active, WHEN I view the config, THEN I see host:port/dbname with password masked

---

#### STORY 2: Switch Database Engine

> As an admin, I want to switch the database engine from SQLite to PostgreSQL/MySQL so that I can use a production-grade database

**Requirement Details:**

1. Dropdown to select target engine: SQLite, PostgreSQL, MySQL
2. When non-SQLite selected → show connection form
3. Connection form fields: host, port, username, password, database name, SSL toggle
4. Form validates required fields before enabling Test Connection
5. Switching back to SQLite does not require connection form

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| engine | enum | Yes | Target database engine | postgresql |
| host | string | Yes (non-SQLite) | Database server hostname | localhost |
| port | number | Yes (non-SQLite) | Database server port | 5432 |
| username | string | Yes (non-SQLite) | Database user | sa4e_user |
| password | string | Yes (non-SQLite) | Database password | ••••••• |
| database | string | Yes (non-SQLite) | Database name | sa4e_db |
| ssl | boolean | No | Enable SSL connection | false |

**Acceptance Criteria:**

1. GIVEN I select PostgreSQL, WHEN the form renders, THEN I see host/port/user/password/database/ssl fields
2. GIVEN I select SQLite, WHEN the form renders, THEN no connection form is shown
3. GIVEN required fields are empty, WHEN I try to test connection, THEN the button is disabled

---

#### STORY 3: Test Database Connection

> As an admin, I want to test the connection to a new database before committing so that I avoid downtime from misconfiguration

**Requirement Details:**

1. "Test Connection" button sends connection params to backend API
2. Backend attempts to connect with timeout (5 seconds)
3. On success: show green checkmark + "Connection successful"
4. On failure: show red X + specific error message (auth failed, host unreachable, DB not found, etc.)
5. Test does NOT modify any data or switch the active database

**Acceptance Criteria:**

1. GIVEN valid connection params, WHEN I click Test Connection, THEN I see success indicator within 5 seconds
2. GIVEN invalid credentials, WHEN I click Test Connection, THEN I see "Authentication failed" error
3. GIVEN unreachable host, WHEN I click Test Connection, THEN I see "Connection timed out" error

---

#### STORY 4: Migrate Data to New Database

> As an admin, I want to migrate all data from SQLite to the new database automatically so that I don't lose existing knowledge entries

**Requirement Details:**

1. "Start Migration" button enabled only after successful connection test
2. Migration process:
   a. Create schema in target database (all tables)
   b. Copy data table by table with batch inserts
   c. Verify row counts match after copy
   d. Switch active database configuration
   e. Restart affected services with new connection
3. Migration is atomic — all or nothing
4. Original SQLite files are preserved (not deleted)
5. Tables to migrate: knowledge entries, embeddings, code symbols, graph edges, analytics

**Acceptance Criteria:**

1. GIVEN test connection passed, WHEN I click Start Migration, THEN all data is copied to the target database
2. GIVEN migration completes, WHEN I verify, THEN row counts match between source and target
3. GIVEN migration succeeds, WHEN system restarts, THEN it uses the new database
4. GIVEN migration fails mid-way, WHEN error occurs, THEN system remains on SQLite with no data loss

---

#### STORY 5: Migration Progress & Rollback

> As an admin, I want to see migration progress and rollback if it fails so that I can recover from errors safely

**Requirement Details:**

1. Progress bar showing: current table, rows copied / total rows, percentage
2. Real-time updates via WebSocket or polling (every 500ms)
3. "Cancel Migration" button available during migration
4. If cancelled or failed: automatic rollback (drop tables in target, revert config)
5. Migration log visible: timestamped entries for each step
6. After rollback: system confirms "Rolled back to SQLite successfully"

**Acceptance Criteria:**

1. GIVEN migration is running, WHEN I view the panel, THEN I see progress bar with table name and percentage
2. GIVEN I click Cancel, WHEN migration is in progress, THEN it stops and rolls back
3. GIVEN migration fails, WHEN error occurs, THEN rollback happens automatically and I see the error details

---

#### STORY 6: Database Abstraction Layer

> As a developer, I want the backend to use a database abstraction layer so that adding new database engines requires minimal code changes

**Requirement Details:**

1. Strategy pattern: `DatabaseAdapter` interface with methods for all DB operations
2. Implementations: `SqliteAdapter`, `PostgresAdapter`, `MysqlAdapter`
3. Factory: `DatabaseAdapterFactory.create(config)` returns the correct adapter
4. All existing code uses adapter interface — no direct better-sqlite3 calls outside adapter
5. Configuration stored in a config file (database.json) that persists across restarts
6. Adding a new engine = implement the interface + register in factory

**Acceptance Criteria:**

1. GIVEN the abstraction layer exists, WHEN I implement a new adapter, THEN no existing code needs modification
2. GIVEN the system starts, WHEN it reads database.json, THEN it initializes the correct adapter
3. GIVEN no database.json exists, WHEN the system starts fresh, THEN it defaults to SQLite

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| better-sqlite3 | System | Current SQLite driver (remains for default) |
| pg (node-postgres) | System | PostgreSQL client library |
| mysql2 | System | MySQL client library |
| Admin Webview | Infrastructure | Existing admin panel must support new section |
| Node.js backend | Infrastructure | Hono server must expose new API endpoints |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility |
|------|-------------|----------------|
| Developer | Dev Team | Implement abstraction layer + adapters |
| Admin User | Operations | Configure and migrate databases |
| QA | QA Team | Verify migration integrity |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Data loss during migration | High | Low | Atomic migration + SQLite backup preserved |
| Performance regression with abstraction layer | Medium | Medium | Benchmark before/after, optimize hot paths |
| Connection string stored insecurely | High | Medium | Encrypt credentials at rest, never log passwords |
| Large database migration timeout | Medium | Medium | Batch processing + progress tracking + resume capability |

### 5.2 Assumptions

- Admin users have network access to target database servers
- Target databases are pre-created (system creates schema, not the database itself)
- SQLite remains the recommended option for single-user / development setups
- Migration is a one-time operation (not continuous sync)

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Abstraction overhead < 5ms per query | Adapter pattern should not add significant latency |
| Performance | Migration throughput >= 1000 rows/second | Batch inserts for large tables |
| Security | Credentials encrypted at rest | database.json stores encrypted passwords |
| Security | Connection test does not expose credentials in logs | Mask password in all log output |
| Reliability | Migration atomic (all or nothing) | Transaction-based with rollback on failure |
| Usability | Zero-config for SQLite | Fresh install works without any database configuration |

---

## 7. Related Tickets

| Ticket Key | Summary | Type | Relationship |
|------------|---------|------|--------------|
| SA4E-33 | Multi-database support with admin config & migration | Feature | Main ticket |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Database Adapter | Strategy pattern implementation that wraps engine-specific SQL operations |
| Migration | One-time data transfer from SQLite to a target database engine |
| Rollback | Reverting to SQLite after a failed migration attempt |
| Connection Test | Non-destructive validation that target database is reachable and credentials are valid |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
