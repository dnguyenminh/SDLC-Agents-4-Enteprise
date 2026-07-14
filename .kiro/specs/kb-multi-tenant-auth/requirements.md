# Requirements Document

## Introduction

The Knowledge Base (KB) backend currently lacks proper multi-tenant data isolation. While an `IsolationLayer` and `ProjectContext` exist with `projectId` and `userId` fields, the current transport layer does not transmit user identity. This means the KB cannot enforce data segregation by user or workspace when accessed as a shared server. This feature replaces the MCP protocol transport with a RESTful API that carries OAuth/SSO JWT tokens via standard `Authorization: Bearer` headers, establishes a four-level data scoping hierarchy (User → Workspace → Project → Shared), and enforces hard access controls at the query layer with backward compatibility for existing data.

## Glossary

- **KB_Backend**: The Node.js/Hono/Better-SQLite3 server that provides knowledge storage, semantic search, and memory management via REST API
- **REST_Transport**: The HTTP REST API layer implementing standard endpoints between the VSCode extension client and the KB_Backend
- **Identity_Token**: A cryptographically signed JWT token (from OAuth/SSO) containing user identity claims (user_id, workspace_id, project_id)
- **Scope_Hierarchy**: The four-level data visibility model: USER (private), WORKSPACE (team), PROJECT (repo-specific), SHARED (company-wide)
- **ProjectContext**: The immutable session-level context object containing identity claims used by the IsolationLayer for scope enforcement
- **IsolationLayer**: The centralized module that constructs SQL filters and validates ownership for all KB read/write operations
- **Workspace**: A VSCode workspace folder, identified by a unique workspace_id
- **Auth_Middleware**: The Hono middleware that extracts and validates JWT from Authorization header, establishing ProjectContext before tool execution
- **Legacy_Entry**: A knowledge entry created before multi-tenant auth existed, lacking workspace_id or having NULL scope identifiers

## Requirements

### Requirement 1: REST API Identity Injection

**User Story:** As a KB_Backend operator, I want every REST API request to carry user identity via JWT, so that the backend can enforce multi-tenant data isolation.

#### Acceptance Criteria

1. WHEN a REST API request arrives at any `/api/v1/*` endpoint, THE Auth_Middleware SHALL extract the Identity_Token from the `Authorization: Bearer` header
2. WHEN a request arrives without an `Authorization` header AND the environment variable `CODE_INTEL_REQUIRE_AUTH` is set to `true`, THE KB_Backend SHALL respond with HTTP 401 Unauthorized
3. WHEN a request arrives without an `Authorization` header AND `CODE_INTEL_REQUIRE_AUTH` is not set or is `false`, THE KB_Backend SHALL proceed with a default anonymous context (backward compatibility mode)
4. THE Auth_Middleware SHALL validate the Identity_Token signature using the configured public key or shared secret before establishing a ProjectContext
5. IF the Identity_Token is expired or has an invalid signature, THEN THE KB_Backend SHALL respond with HTTP 401 Unauthorized with body `{"error": "Invalid or expired token"}`

### Requirement 2: Identity Token Structure

**User Story:** As a system integrator, I want a well-defined JWT format containing user, workspace, and project claims, so that the backend can construct a complete ProjectContext from a single token.

#### Acceptance Criteria

1. THE Identity_Token SHALL contain the following claims: `sub` (user_id), `wid` (workspace_id), `pid` (project_id), `iat` (issued-at), `exp` (expiry)
2. THE Identity_Token SHALL use the JWT (RFC 7519) format with HS256 or RS256 signing algorithm
3. WHEN the `pid` claim is absent from the Identity_Token, THE Auth_Middleware SHALL derive project_id from the workspace context or leave it NULL
4. THE Identity_Token `exp` claim SHALL have a maximum lifetime of 24 hours from `iat`
5. WHEN the `wid` claim is absent, THE Auth_Middleware SHALL treat the request as belonging to a default workspace scoped to the user

### Requirement 3: Scope Hierarchy Data Model

**User Story:** As a KB_Backend developer, I want the data model to support a four-level scope hierarchy, so that entries can be isolated at user, workspace, project, or shared levels.

#### Acceptance Criteria

1. THE KB_Backend SHALL support four scope levels: USER, WORKSPACE, PROJECT, SHARED
2. THE `knowledge_entries` table SHALL include a `workspace_id` column (TEXT, nullable) to support workspace-level isolation
3. WHEN a new entry is ingested with scope USER, THE KB_Backend SHALL stamp the entry with the `user_id` from the ProjectContext
4. WHEN a new entry is ingested with scope WORKSPACE, THE KB_Backend SHALL stamp the entry with both `user_id` and `workspace_id` from the ProjectContext
5. WHEN a new entry is ingested with scope PROJECT, THE KB_Backend SHALL stamp the entry with `project_id` and `workspace_id` from the ProjectContext
6. WHEN a new entry is ingested with scope SHARED, THE KB_Backend SHALL stamp the entry with `workspace_id` only (visible to all users in the workspace)

### Requirement 4: Read Access Enforcement

**User Story:** As a KB user, I want search results to respect scope boundaries, so that I only see entries I am authorized to access.

#### Acceptance Criteria

1. WHEN a `mem_search` operation is executed, THE IsolationLayer SHALL return entries matching ALL of the following visibility rules: USER entries where `user_id` matches the caller, WORKSPACE entries where `workspace_id` matches the caller, PROJECT entries where `project_id` matches the caller, and SHARED entries where `workspace_id` matches the caller or `workspace_id` is NULL
2. WHEN a search is executed with scope filter parameter set to a specific level, THE IsolationLayer SHALL restrict results to only that scope level
3. THE IsolationLayer SHALL construct a single SQL WHERE clause combining scope conditions using OR logic for multi-scope visibility
4. WHEN the ProjectContext has a NULL `workspace_id` (anonymous mode), THE IsolationLayer SHALL only return SHARED entries with NULL `workspace_id` and PROJECT entries matching `project_id`

### Requirement 5: Write Access Enforcement

**User Story:** As a KB user, I want mutation operations to verify ownership before allowing changes, so that users cannot modify entries belonging to other scopes.

#### Acceptance Criteria

1. WHEN an update or delete operation targets a USER-scoped entry, THE IsolationLayer SHALL verify that `user_id` on the entry matches the caller's `user_id`
2. WHEN an update or delete operation targets a WORKSPACE-scoped entry, THE IsolationLayer SHALL verify that `workspace_id` on the entry matches the caller's `workspace_id`
3. WHEN an update or delete operation targets a PROJECT-scoped entry, THE IsolationLayer SHALL verify that `project_id` on the entry matches the caller's `project_id`
4. WHEN a mutation fails ownership validation, THE KB_Backend SHALL respond with HTTP 403 Forbidden with body `{"error": "Access denied: entry belongs to a different scope"}`
5. THE IsolationLayer SHALL allow any authenticated user within the same workspace to mutate SHARED entries belonging to that workspace

### Requirement 6: VSCode Extension REST Client

**User Story:** As a VSCode extension developer, I want the extension to automatically provision JWT tokens and call REST API endpoints, so that users get multi-tenant isolation without manual configuration.

#### Acceptance Criteria

1. WHEN the VSCode extension initializes, THE Extension_Client SHALL retrieve an Identity_Token from the configured OAuth/SSO provider containing the current user_id, workspace_id, and project_id
2. THE Extension_Client SHALL derive the `project_id` by computing a SHA-256 hash of the git repository remote URL of the active workspace folder
3. THE Extension_Client SHALL include the Identity_Token as an `Authorization: Bearer` header on every HTTP request to the KB REST API endpoints
4. WHEN the Identity_Token is within 5 minutes of expiry, THE Extension_Client SHALL refresh the token from the OAuth/SSO provider before the next request
5. THE Extension_Client SHALL store OAuth refresh tokens in the VSCode SecretStorage API, not in plaintext configuration files
6. THE Extension_Client SHALL use fetch/axios to call REST endpoints (e.g., `POST /api/v1/memory/search`, `POST /api/v1/memory/ingest`)

### Requirement 7: Database Migration for Existing Data

**User Story:** As a system administrator, I want existing KB entries to remain accessible after the multi-tenant upgrade, so that no data is lost during migration.

#### Acceptance Criteria

1. WHEN the KB_Backend starts and detects the `knowledge_entries` table lacks a `workspace_id` column, THE MigrationRunner SHALL add the column with a NULL default
2. THE MigrationRunner SHALL NOT modify existing entries during the schema migration (entries retain their current scope, user_id, and project_id values)
3. WHEN reading Legacy_Entries with NULL `workspace_id`, THE IsolationLayer SHALL treat the entries as accessible to any authenticated user whose `project_id` matches the entry's `project_id` (or to all users if entry `project_id` is also NULL)
4. THE KB_Backend SHALL provide a `POST /api/v1/admin/migrate-scope` endpoint that assigns `workspace_id` to Legacy_Entries based on a provided mapping configuration
5. IF the migration tool encounters an entry with conflicting scope assignments, THEN THE KB_Backend SHALL log the conflict and skip the entry without aborting the migration batch

### Requirement 8: Token Signing Configuration

**User Story:** As a system administrator, I want to configure token verification parameters via environment variables, so that deployment does not require code changes.

#### Acceptance Criteria

1. THE KB_Backend SHALL read the token verification secret from environment variable `KB_TOKEN_SECRET`
2. THE KB_Backend SHALL read the token signing algorithm from environment variable `KB_TOKEN_ALGORITHM` with a default value of `HS256`
3. WHEN `KB_TOKEN_SECRET` is not set AND `CODE_INTEL_REQUIRE_AUTH` is `true`, THE KB_Backend SHALL refuse to start and log an error message "KB_TOKEN_SECRET must be set when authentication is required"
4. THE KB_Backend SHALL support both symmetric (HS256) and asymmetric (RS256) token verification
5. WHEN RS256 is configured, THE KB_Backend SHALL read the public key from environment variable `KB_TOKEN_PUBLIC_KEY` or from file path specified in `KB_TOKEN_PUBLIC_KEY_FILE`

### Requirement 9: ProjectContext Extension

**User Story:** As a KB_Backend developer, I want the ProjectContext to carry workspace identity alongside user and project identity, so that the IsolationLayer can enforce workspace-level isolation.

#### Acceptance Criteria

1. THE ProjectContext interface SHALL include a `workspaceId` field (string, optional) in addition to existing `projectId` and `userId` fields
2. THE `createProjectContext` factory function SHALL accept a `workspaceId` parameter and include it in the frozen context object
3. WHEN the Auth_Middleware creates a ProjectContext from an Identity_Token, THE Auth_Middleware SHALL map the `wid` claim to `workspaceId`
4. THE ProjectContext SHALL remain immutable after creation (Object.freeze behavior preserved)

### Requirement 10: Scope Promotion with Tenant Awareness

**User Story:** As a KB user, I want scope promotion (USER→PROJECT→SHARED) to respect tenant boundaries, so that promoted entries remain within the correct workspace.

#### Acceptance Criteria

1. WHEN an entry is promoted from USER scope to PROJECT scope, THE ScopePromotionService SHALL preserve the original `workspace_id` on the promoted entry
2. WHEN an entry is promoted from PROJECT scope to SHARED scope, THE ScopePromotionService SHALL preserve the original `workspace_id` on the promoted entry
3. THE ScopePromotionService SHALL NOT promote entries across workspace boundaries (an entry in workspace A cannot be promoted to SHARED in workspace B)
4. WHEN scope promotion is called, THE ScopePromotionService SHALL verify that the caller's `workspace_id` matches the entry's `workspace_id` before promoting

### Requirement 11: REST API Endpoint Design

**User Story:** As a KB_Backend developer, I want well-defined REST endpoints replacing the MCP tool interface, so that clients can call knowledge operations via standard HTTP.

#### Acceptance Criteria

1. THE KB_Backend SHALL expose `POST /api/v1/memory/search` replacing `mem_search` tool
2. THE KB_Backend SHALL expose `POST /api/v1/memory/ingest` replacing `mem_ingest` tool
3. THE KB_Backend SHALL expose `POST /api/v1/memory/ingest-file` replacing `mem_ingest_file` tool
4. THE KB_Backend SHALL expose `POST /api/v1/code/search` replacing `code_search` tool
5. THE KB_Backend SHALL expose `POST /api/v1/context/curated` replacing `get_curated_context` tool
6. THE KB_Backend SHALL expose `GET /api/v1/admin/status` replacing `orchestration_status` tool
7. THE KB_Backend SHALL expose `POST /api/v1/admin/migrate-scope` for legacy data migration
8. ALL REST endpoints SHALL accept JSON request body and return JSON response with consistent envelope: `{"data": ..., "error": null}` or `{"data": null, "error": {"code": "...", "message": "..."}}`
9. THE KB_Backend SHALL remove the `/mcp` endpoint entirely

### Requirement 12: MCP Endpoint Removal

**User Story:** As a system operator, I want the legacy MCP endpoint completely removed, so that there is no unauthenticated access path to KB data.

#### Acceptance Criteria

1. THE KB_Backend SHALL remove the `/mcp` route handler and all MCP protocol processing code
2. THE KB_Backend SHALL remove MCP SDK dependencies from package.json
3. THE KB_Backend SHALL return HTTP 404 for any request to `/mcp`
4. THE Extension_Client SHALL remove all MCP client SDK code and dependencies
5. THE Extension_Client SHALL replace all MCP tool calls with equivalent REST API calls
