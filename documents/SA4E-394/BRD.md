# Business Requirements Document (BRD)

## SA4E — SA4E-394: [MCP Tools] Hỗ trợ multi-worktree: tham số base_dir per-call (hoặc multi-root registry) cho mọi tool nhận file_path

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-394 |
| Title | [MCP Tools] Hỗ trợ multi-worktree: tham số base_dir per-call (hoặc multi-root registry) cho mọi tool nhận file_path |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-11-01 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TBD – Solution Architect | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-01 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-394 and linked tickets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

This Business Requirements Document defines the requirements for enabling multi-worktree support in the MCP (Model Context Protocol) server tools that accept `file_path` parameters. Currently, the MCP server pins a single workspace root at startup, causing failures when agents operate from different worktrees (e.g., Orca worktrees). This enhancement introduces either a per-call `base_dir` parameter (Option A) or a multi-root registry mechanism (Option B) to allow tools to resolve relative paths against the correct workspace root per invocation.

The scope includes auditing and modifying ALL tools that accept `file_path` parameters (inherited from SA4E-357): `mem_ingest_file`, `embed_image`, `drawio_export_png`, `drawio_auto_layout`, `jira_attach_file`, `confluence_add_attachment`, `sandbox_run`, `stream_write_file`. Each tool must support the new parameter, maintain backward compatibility, and enforce path containment within an allowlist.

### 1.2 Out of Scope

- Changes to tools that do NOT accept `file_path` parameters
- Modifications to the MCP protocol specification itself
- UI/UX changes to any frontend applications
- Database schema migrations
- Authentication/authorization system changes
- Changes to the underlying file system permissions model beyond path validation

### 1.3 Preliminary Requirement

- MCP server must be running with the code-intelligence configuration
- Workspace allowlist must be configurable at server startup (environment variable or configuration file)
- Existing unit test infrastructure must be available for adding new test cases
- SA4E-357 (parent ticket) must be in a state where its scope is finalized

---

## 2. Business Requirements

### 2.1 High Level Process Map

The multi-worktree support enables the following high-level flow:

1. **Server Startup**: MCP server reads allowlist of registered workspace roots from configuration
2. **Agent Invocation**: Agent running in worktree A calls a tool with `file_path` (relative) and `base_dir`=worktree B
3. **Path Resolution**: Server validates `base_dir` against allowlist, then resolves relative path against `base_dir`
4. **Operation Execution**: Tool performs file operation on resolved absolute path
5. **Response**: Success result returned to agent; or clear error if `base_dir` not in allowlist

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As an AI agent operating in an Orca worktree, I want to call MCP tools with a `base_dir` parameter so that relative file paths resolve correctly against my worktree root | MUST HAVE | SA4E-394 |
| 2 | As a system administrator, I want to configure an allowlist of workspace roots at server startup so that path containment is enforced and path traversal is prevented | MUST HAVE | SA4E-394 |
| 3 | As an AI agent, I want backward compatibility when omitting `base_dir` so that existing tool calls continue to work without modification | MUST HAVE | SA4E-394 |
| 4 | As a security reviewer, I want explicit `PATH_REJECTED_OUTSIDE_ALLOWLIST` errors when `base_dir` is not registered so that unauthorized access attempts are clearly identified | MUST HAVE | SA4E-394 |
| 5 | As a developer, I want all `file_path`-accepting tools updated consistently so that the multi-worktree behavior is uniform across the MCP toolset | MUST HAVE | SA4E-394 |

---

### 2.3 Details of User Stories

#### Business Flow

**Step 1:** MCP server starts and loads workspace allowlist from configuration (environment variable `MCP_WORKSPACE_ROOTS` or config file)

**Step 2:** Agent session starts in a worktree (e.g., `/home/user/project-worktree-A`)

**Step 3:** Agent needs to read/write a file in a different worktree (e.g., `/home/user/project-worktree-B`)

**Step 4:** Agent calls MCP tool (e.g., `mem_ingest_file`) with parameters:
- `file_path`: `"documents/SA4E-394/BRD.md"` (relative)
- `base_dir`: `"/home/user/project-worktree-B"`

**Step 5:** MCP server validates `base_dir` against allowlist:
- If `base_dir` is in allowlist → proceed to Step 6
- If `base_dir` is NOT in allowlist → return error `PATH_REJECTED_OUTSIDE_ALLOWLIST` with details

**Step 6:** Server resolves relative `file_path` against `base_dir` → absolute path `/home/user/project-worktree-B/documents/SA4E-394/BRD.md`

**Step 7:** Tool executes file operation on resolved absolute path

**Step 8:** Tool returns success/failure result to agent

> **Note:** If `base_dir` is omitted, server falls back to the legacy single-root behavior (pinned workspace root at startup) for backward compatibility.

---

#### STORY 1: Per-Call base_dir Parameter for Path Resolution

> As an AI agent operating in an Orca worktree, I want to call MCP tools with a `base_dir` parameter so that relative file paths resolve correctly against my worktree root

**Requirement Details:**

1. Every tool that accepts `file_path` MUST accept an optional `base_dir` parameter (alias: `workspace_root`)
2. When `base_dir` is provided, relative `file_path` values MUST be resolved against `base_dir`
3. When `base_dir` is omitted, relative `file_path` values MUST resolve against the legacy pinned workspace root (backward compatible)
4. Absolute `file_path` values MUST be validated to be within the `base_dir` (if provided) or legacy root (if omitted)
5. The `base_dir` parameter MUST be documented in each tool's JSON schema with description and example

**Data Fields (if applicable):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| base_dir | string | No | Workspace root directory to resolve relative paths against. Must be in server allowlist. | /home/user/project-worktree-B |
| workspace_root | string | No | Alias for base_dir (deprecated name, kept for compatibility) | /home/user/project-worktree-B |
| file_path | string | Yes | Relative or absolute path to the file | documents/SA4E-394/BRD.md |

**Acceptance Criteria:**

1. AC1: Agent in worktree A calls tool with `base_dir`=worktree B (registered in allowlist) → success, file operation occurs in worktree B
2. AC2: Agent calls tool with `base_dir` NOT in allowlist → blocked with error `PATH_REJECTED_OUTSIDE_ALLOWLIST`
3. AC3: Agent omits `base_dir` → old behavior preserved (resolves against legacy pinned root)
4. AC4: Absolute `file_path` outside `base_dir` (or legacy root) → blocked with `PATH_REJECTED_OUTSIDE_ALLOWLIST`
5. AC5: `base_dir` parameter appears in tool schema documentation with clear description

**Validation Rules:**

- `base_dir` must be an absolute path (server normalizes if relative path provided)
- `base_dir` must exist on the filesystem
- `base_dir` must be in the server's configured allowlist
- Resolved absolute path must be within `base_dir` (no directory traversal via `../`)

**Error Handling:**

- `base_dir` not in allowlist: Return `PATH_REJECTED_OUTSIDE_ALLOWLIST` with message: "Workspace root '{base_dir}' is not registered in the allowlist. Configure MCP_WORKSPACE_ROOTS to include this path."
- `base_dir` does not exist: Return `FS_ERROR` with message: "Workspace root '{base_dir}' does not exist on filesystem"
- Resolved path escapes `base_dir`: Return `PATH_REJECTED_OUTSIDE_ALLOWLIST` with message: "Resolved path '{resolved}' is outside workspace root '{base_dir}'"
- Permission denied on file operation: Return `FS_ERROR` with OS error details

---

#### STORY 2: Workspace Allowlist Configuration at Server Startup

> As a system administrator, I want to configure an allowlist of workspace roots at server startup so that path containment is enforced and path traversal is prevented

**Requirement Details:**

1. MCP server MUST accept workspace allowlist via environment variable `MCP_WORKSPACE_ROOTS` (colon-separated on Linux/macOS, semicolon-separated on Windows) OR configuration file
2. Allowlist MUST be loaded once at server startup and cached
3. Allowlist entries MUST be normalized to absolute paths at startup
4. Server MUST validate that all allowlist entries exist and are directories at startup (warn if not)
5. Empty allowlist → server falls back to legacy single-root mode (pinned root only)
6. Allowlist MUST support both the primary checkout and Orca worktrees

**Data Fields (if applicable):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| MCP_WORKSPACE_ROOTS | string (env) | No | Delimited list of allowed workspace roots | /home/user/project:/home/user/project-worktree-A:/home/user/project-worktree-B |

**Acceptance Criteria:**

1. Server starts successfully with valid `MCP_WORKSPACE_ROOTS`
2. Server logs the loaded allowlist at startup (info level)
3. Server warns for non-existent allowlist entries but continues startup
4. Empty allowlist defaults to legacy behavior (single pinned root)
5. Allowlist changes require server restart (not hot-reload)

**Validation Rules:**

- Allowlist paths must be absolute
- Allowlist paths must be directories (not files)
- Duplicate entries are deduplicated
- Symlinks are resolved to real paths

---

#### STORY 3: Consistent Tool Updates Across All file_path Tools

> As a developer, I want all `file_path`-accepting tools updated consistently so that the multi-worktree behavior is uniform across the MCP toolset

**Requirement Details:**

1. Audit and update ALL tools accepting `file_path` (from SA4E-357 scope):
   - `mem_ingest_file`
   - `embed_image`
   - `drawio_export_png`
   - `drawio_auto_layout`
   - `jira_attach_file`
   - `confluence_add_attachment`
   - `sandbox_run`
   - `stream_write_file`
2. Each tool MUST implement `base_dir` parameter with identical behavior
3. Each tool MUST have unit tests covering:
   - Relative path with valid `base_dir` in allowlist
   - Relative path with `base_dir` NOT in allowlist (expect rejection)
   - Absolute path within `base_dir` (success)
   - Absolute path outside `base_dir` (expect rejection)
   - Omitted `base_dir` (backward compatibility)
4. Shared path resolution logic MUST be extracted to a common utility to ensure consistency

**Acceptance Criteria:**

1. All 8 tools accept `base_dir` parameter
2. All 8 tools pass the 5 unit test scenarios
3. Shared path resolution utility exists and is used by all tools
4. No tool-specific deviations in path resolution behavior
5. Schema documentation updated for all 8 tools

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| SA4E-357 | Task | SA4E-357 | Parent ticket defining the scope of tools to update; must be finalized |
| SA4E-356 | Task | SA4E-356 | Duplicate of SA4E-357; provides additional context |
| MCP Server Configuration | Infrastructure | N/A | Environment variable / config file mechanism for allowlist |
| Path Safety Utility | System | N/A | `backend/src/shared/path-safety.ts` must be extended for allowlist validation |
| Unit Test Framework | Infrastructure | N/A | Existing test infrastructure (Vitest/Jest) for adding test cases |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Product Owner | SDLC Agents Team | Prioritize and accept delivery | Project governance |
| Solution Architect | SA Agent | Technical design review (TDD) | Phase 3 |
| Backend Developer | DEV Agent | Implementation of tool updates | Phase 5 |
| QA Engineer | QA Agent | Test plan and execution | Phase 4, 6 |
| DevOps Engineer | DevOps Agent | CI/CD pipeline for server deployment | Phase 7 |
| Security Reviewer | Security Agent | Path containment validation | Phase 3.7, 5.7 |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Inconsistent implementation across tools | High | Medium | Extract shared path resolution utility; enforce via code review |
| Allowlist misconfiguration blocks legitimate worktrees | High | Low | Clear startup logging; validation endpoint for admins |
| Backward compatibility break for existing integrations | High | Low | Comprehensive test matrix; optional `base_dir` with fallback |
| Path traversal vulnerability via `../` in file_path | Critical | Low | Strict containment check after resolution; unit tests for traversal attempts |
| Performance overhead of allowlist validation per call | Low | Low | Cache allowlist in memory; O(1) lookup with Set |

### 5.2 Assumptions

- MCP server runs on a filesystem that supports absolute paths (POSIX/Windows)
- Worktree directories are created by Orca/git worktree before agent sessions start
- Agents have read/write permissions to their worktree directories
- Server restart is acceptable for allowlist changes (not required to be hot-reloadable)
- Existing tools do not have conflicting parameter names (`base_dir`, `workspace_root`)
- The pinned legacy root remains valid for backward compatibility

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Path resolution < 5ms | Allowlist lookup and path normalization must add minimal latency |
| Security | Zero path traversal | All resolved paths must be verified within `base_dir` or legacy root |
| Security | Explicit allowlist enforcement | Any `base_dir` not in allowlist must be rejected with clear error |
| Reliability | Backward compatibility | Omitting `base_dir` must not change existing behavior |
| Maintainability | Shared utility | Common path resolution function used by all 8 tools |
| Testability | 100% coverage for new logic | Unit tests for all 5 scenarios per tool (40 test cases minimum) |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-394 | [MCP Tools] Hỗ trợ multi-worktree: tham số base_dir per-call... | Open | Task | Main ticket |
| SA4E-357 | [MCP Tools] Fix multi-worktree path resolution | In Progress | Task | Parent / relates to |
| SA4E-356 | [MCP Tools] Multi-worktree support duplicate | Closed | Task | Duplicate of SA4E-357 |
| KB Entry 952 | ERROR_PATTERN mem_ingest_file FS_ERROR | - | Memory | Reference |
| KB Entry 953 | CONTEXT multi-worktree | - | Memory | Reference |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol — the protocol used by the code-intelligence server |
| Worktree | Git worktree — a linked working directory attached to the same repository |
| Orca Worktree | A worktree managed by the Orca CLI for isolated agent sessions |
| Allowlist | List of workspace root directories permitted for `base_dir` parameter |
| Pinned Root | The single workspace root fixed at server startup (legacy behavior) |
| Path Containment | Security property ensuring file operations cannot escape designated roots |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| BRD Template | documents/templates/BRD-TEMPLATE.md |
| SA4E-357 Jira Comment 12270 | Jira ticket SA4E-357, comment dated 2026-10-31 |
| Memory KB Entry 952 | code-intel memory: ERROR_PATTERN mem_ingest_file FS_ERROR |
| Memory KB Entry 953 | code-intel memory: CONTEXT multi-worktree |
| Path Safety Utility | backend/src/shared/path-safety.ts |
| MCP Server Entry | backend/src/server/HttpServer.ts, backend/src/server/mcpServer.ts |

### Phase Plan

| Phase | Description | Owner | Deliverable |
|-------|-------------|-------|-------------|
| 1 | Requirements (this BRD) | BA Agent | BRD.md |
| 2 | Specification | BA + TA + UI Agents | FSD.md |
| 3 | Design | SA Agent | TDD.md |
| 3.7 | Security Review | Security Agent | SECURITY-REVIEW.md |
| 4 | Test Planning | QA Agent | STP.md, STC.md |
| 5 | Implementation | DEV Agent | Source code changes + unit tests |
| 5.7 | Security Assessment | Security Agent | SECURITY-ASSESSMENT.md |
| 6 | Testing | QA Agent | TEST-REPORT.md |
| 6.7 | Security Deploy Review | Security Agent | SECURITY-DEPLOY-REVIEW.md |
| 7 | Deployment | DevOps Agent | DPG.md, RLN.md |

---

*End of BRD for SA4E-394*