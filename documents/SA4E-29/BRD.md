# Business Requirements Document (BRD)

## SA4E Extension — SA4E-29: Fix base64 design for file tools (drawio, mem_ingest_file)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-29 |
| Title | Fix base64 design for file tools (drawio, mem_ingest_file) |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-12 |
| Status | Draft (Retroactive) |
| Type | Task — High Priority |
| Documentation Mode | Retroactive — code already implemented |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TA Agent – Technical Architect | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-12 | BA Agent | Initiate document — retroactive documentation from implemented code (SA4E-29) |

---

## 1. Introduction

### 1.1 Scope

The SA4E extension operates in a **split-process architecture**:
- **Extension process** (port 9181): Runs locally in VS Code, has access to the local filesystem
- **Backend process** (port 48721): Runs remotely, processes tool logic but has NO local filesystem access

Several backend tools (`drawio_export_png`, `drawio_auto_layout`, `mem_ingest_file`) require file content as input and/or produce file output. These tools were originally designed with `file_path` parameters, assuming direct filesystem access. Since the backend runs remotely, it cannot read/write local files.

This BRD documents the **base64 proxy design** that transparently bridges this architectural gap: the extension reads files locally, encodes to base64, forwards to backend; backend processes content and returns output as base64; extension writes output back to local filesystem.

### 1.2 Out of Scope

- Backend server architecture changes (remains at port 48721)
- Extension server architecture changes (remains at port 9181)
- Tools that don't involve file I/O (e.g., `mem_search`, `code_search`)
- LLM prompt engineering or tool selection logic
- Authentication/authorization between Extension and Backend

### 1.3 Preliminary Requirement

- Extension MCP server (WrapperServer) must be operational on port 9181
- Backend MCP server must be operational on port 48721
- Backend tools must expose `content_base64` in their input schemas
- Backend tools returning files must include `output_base64` in descriptions

---

## 2. Business Requirements

### 2.1 High Level Process Map

The system follows a three-tier data flow for file-based tool operations:

```
LLM Agent ──► Extension (9181) ──► Backend (48721)
    │              │                      │
    │  file_path   │  content_base64      │
    │ ───────────► │ ──────────────────►  │
    │              │                      │ process
    │              │  output_base64       │
    │  file_path   │ ◄──────────────────  │
    │ ◄─────────── │                      │
```

The Extension acts as a **transparent proxy** that:
1. Intercepts file_path from LLM requests
2. Reads file, encodes to base64, forwards to Backend
3. Receives base64 output from Backend, decodes, writes to local file
4. Returns local file_path to LLM (LLM never sees base64)

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source Ticket |
|---|------------------|----------|---------------|
| 1 | As an LLM agent, I want to call file tools using file_path only, so that I don't need to understand the remote architecture or base64 encoding | MUST HAVE | SA4E-29 |
| 2 | As a backend developer, I want tools to auto-detect base64 proxy requirements from schemas, so that adding new file tools requires zero extension changes | MUST HAVE | SA4E-29 |
| 3 | As an extension developer, I want a single proxy service that handles all file tool I/O transparently, so that I don't write per-tool proxy code | MUST HAVE | SA4E-29 |
| 4 | As a platform operator, I want file tools to work correctly in split-process deployment without manual configuration, so that the system is production-ready out of the box | MUST HAVE | SA4E-29 |
| 5 | As an LLM agent, I want find_tools to return schemas with file_path (not content_base64), so that tool discovery shows me parameters I can actually provide | SHOULD HAVE | SA4E-29 |
| 6 | As a backend developer, I want execute_dynamic_tool to properly unwrap nested arguments for proxy processing, so that dynamically-invoked tools also benefit from base64 proxy | SHOULD HAVE | SA4E-29 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Current (Broken) Behavior:**

**Step 1:** LLM calls backend tool with `file_path` parameter (e.g., `drawio_export_png(file_path: "doc.drawio")`)

**Step 2:** Backend attempts to read file at `file_path` on the remote server

**Step 3:** File does not exist on remote server → **FAILURE** (FileNotFoundError)

---

**Expected (Fixed) Behavior:**

**Step 1:** LLM calls tool with `file_path` (e.g., `drawio_export_png(file_path: "doc.drawio")`)

**Step 2:** Extension intercepts call, reads file locally, encodes to base64

**Step 3:** Extension forwards to backend with `content_base64` (file_path removed from args)

**Step 4:** Backend processes the base64 content (no filesystem access needed)

**Step 5:** Backend returns `output_base64` in response

**Step 6:** Extension decodes base64, writes output file locally (e.g., `doc.png`)

**Step 7:** Extension returns `{ file_path: "doc.png", size_bytes: N }` to LLM

---

#### STORY 1: Transparent file_path interface for LLM

> As an LLM agent, I want to call file tools using file_path only, so that I don't need to understand the remote architecture or base64 encoding.

**Requirement Details:**

1. LLM MUST only see `file_path` in tool schemas (never `content_base64`)
2. When LLM calls `tools/list`, schemas for file tools must show `file_path` as required parameter
3. When LLM calls a file tool, it provides `file_path` — proxy handles the rest transparently
4. Response to LLM contains `file_path` pointing to local output file (not raw base64)
5. For output tools, an optional `output_path` parameter is exposed so LLM can specify destination

**Acceptance Criteria:**

1. GIVEN LLM calls `tools/list`, WHEN response contains drawio tools, THEN schemas show `file_path` (required) and NOT `content_base64`
2. GIVEN LLM calls `drawio_export_png(file_path: "diagram.drawio")`, WHEN file exists locally, THEN response contains `{ file_path: "diagram.png", size_bytes: N }`
3. GIVEN LLM provides `file_path` that doesn't exist, THEN error message clearly states "Failed to read file {path}: ENOENT"
4. GIVEN tool produces output, WHEN `output_path` not provided, THEN output path is auto-derived (`.drawio` → `.png`)

---

#### STORY 2: Zero-config auto-detection for new tools

> As a backend developer, I want tools to auto-detect base64 proxy requirements from schemas, so that adding new file tools requires zero extension changes.

**Requirement Details:**

1. Extension must scan backend tool schemas on `tools/list` and auto-detect which tools need proxy
2. Detection rule for INPUT proxy: tool schema has `content_base64` in `properties`
3. Detection rule for OUTPUT proxy: tool description contains `output_base64` or `Returns output_base64`
4. When a new tool is added to backend with `content_base64` param, it automatically gets proxied — no extension code changes needed
5. Proxy sets are rebuilt on every `tools/list` call (picks up new tools dynamically)

**Acceptance Criteria:**

1. GIVEN backend adds `new_file_tool` with `content_base64` in schema, WHEN extension calls `tools/list`, THEN `new_file_tool` is auto-detected for input proxy
2. GIVEN backend adds tool with "Returns output_base64" in description, WHEN extension calls `tools/list`, THEN tool is auto-detected for output proxy
3. GIVEN extension restarts, WHEN first `tools/list` is called, THEN all proxy sets are correctly rebuilt
4. GIVEN tool does NOT have `content_base64` in schema, THEN it is NOT proxied (passes through unchanged)

---

#### STORY 3: Single proxy service handles all file I/O

> As an extension developer, I want a single proxy service that handles all file tool I/O transparently, so that I don't write per-tool proxy code.

**Requirement Details:**

1. A single `Base64ProxyService` class handles all proxy logic (SRP)
2. Service provides: `detectFromToolList()`, `proxyInput()`, `proxyOutput()`, `rewriteSchemasForLlm()`
3. WrapperServer uses Base64ProxyService — no file I/O logic in WrapperServer itself
4. Service handles `execute_dynamic_tool` unwrapping: extracts nested tool name + args, proxies inner tool
5. Service handles `find_tools` response rewriting: rewrites schemas in discovery responses

**Acceptance Criteria:**

1. GIVEN any file tool call arrives, WHEN routed through WrapperServer, THEN Base64ProxyService handles all base64 logic
2. GIVEN `execute_dynamic_tool(toolName: "drawio_export_png", arguments: {file_path: "x.drawio"})`, THEN inner args are unwrapped, proxied, and re-wrapped
3. GIVEN `find_tools` returns tool schemas, THEN schemas in response are rewritten (hide content_base64, show file_path)
4. GIVEN extension developer adds new route, THEN no proxy code needed — just call `callWithProxy(name, args)`

---

#### STORY 4: Production-ready without manual configuration

> As a platform operator, I want file tools to work correctly in split-process deployment without manual configuration, so that the system is production-ready out of the box.

**Requirement Details:**

1. No configuration file or environment variable required for base64 proxy to work
2. Proxy activates automatically based on schema detection
3. Output directory is auto-created if it doesn't exist (`ensureDir` with `recursive: true`)
4. Errors are propagated with clear messages (file not found, write permission errors)
5. Non-file tools pass through unchanged — zero interference

**Acceptance Criteria:**

1. GIVEN fresh installation with Extension + Backend running, WHEN LLM calls file tool, THEN proxy works without any manual setup
2. GIVEN output directory doesn't exist, WHEN tool produces output, THEN directory is created automatically
3. GIVEN backend returns error, THEN error propagates to LLM unchanged
4. GIVEN non-file tool called (e.g., `mem_search`), THEN it passes through without any proxy interference
5. GIVEN Backend body > 1MB, THEN WrapperServer rejects with clear error (MAX_BODY_SIZE protection)

---

#### STORY 5: find_tools schema rewriting

> As an LLM agent, I want find_tools to return schemas with file_path (not content_base64), so that tool discovery shows me parameters I can actually provide.

**Requirement Details:**

1. When `execute_dynamic_tool(toolName: "find_tools", ...)` is called, response is intercepted
2. Tool schemas in the find_tools response are rewritten through `rewriteSchemasForLlm()`
3. LLM sees consistent schemas whether from `tools/list` or `find_tools`

**Acceptance Criteria:**

1. GIVEN LLM calls find_tools for drawio tools, WHEN response arrives, THEN schemas show `file_path` not `content_base64`
2. GIVEN schemas from `tools/list` and from `find_tools`, THEN both show identical rewritten schemas

---

#### STORY 6: execute_dynamic_tool nested arg unwrapping

> As a backend developer, I want execute_dynamic_tool to properly unwrap nested arguments for proxy processing, so that dynamically-invoked tools also benefit from base64 proxy.

**Requirement Details:**

1. `execute_dynamic_tool` receives `{ toolName, arguments: { file_path: "..." } }`
2. Extension must unwrap: extract inner `toolName` and `arguments` (or `args`)
3. Apply proxy to inner args (read file, inject content_base64)
4. Re-wrap proxied args back into `execute_dynamic_tool` shape
5. After backend response, apply output proxy to result

**Acceptance Criteria:**

1. GIVEN `execute_dynamic_tool(toolName: "drawio_auto_layout", arguments: {file_path: "x.drawio"})`, THEN file is read, base64 injected into inner arguments
2. GIVEN execute_dynamic_tool with `args` key (not `arguments`), THEN unwrapping still works
3. GIVEN backend returns output_base64 via execute_dynamic_tool, THEN output file is written locally

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| WrapperServer HTTP proxy | System | SA4E-29 | MCP JSON-RPC server on port 9181 routing to backend |
| Backend MCP server | System | N/A | Remote backend on port 48721 providing file tools |
| Node.js fs module | System | N/A | Local file read/write operations |
| draw.io CLI | External | N/A | Backend dependency for PNG export (not extension concern) |
| VS Code Extension API | System | N/A | Extension host environment |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| LLM Agents | AI Coding Assistants | Primary consumers of file tools | Tool users |
| Backend Dev | SA4E Team | Maintains backend tools with base64 interface | Implementor |
| Extension Dev | SA4E Team | Maintains proxy service and wrapper server | Implementor |
| Platform Operator | DevOps | Deploys and monitors the system | Operations |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Large files exceed MAX_BODY_SIZE (1MB) | High | Low | WrapperServer enforces 1MB limit; large file tools need chunking (future) |
| Base64 encoding increases payload by ~33% | Medium | Certain | Accept trade-off; 1MB limit accounts for this |
| Schema detection false positives | Medium | Low | Detection uses specific field names (`content_base64`) — unlikely to collide |
| Backend schema changes break detection | High | Low | Detection re-runs on every tools/list call — self-healing |

### 5.2 Assumptions

- Backend tools correctly declare `content_base64` in their input schemas when they need file content
- Backend tools that produce files include "output_base64" in their description
- Extension always has read access to files that LLM references
- Extension always has write access to output directories
- Network latency between Extension (9181) and Backend (48721) is negligible (localhost or LAN)

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Transparency | LLM-invisible proxy | LLM never sees base64 — only file_path in schemas and responses |
| Zero-config | Schema-driven auto-detection | No config file, env var, or hardcoded tool list required |
| Remote-safe | No filesystem dependency on backend | Backend never reads/writes local filesystem |
| Performance | Synchronous file I/O acceptable | File reads/writes are local — sub-millisecond |
| Extensibility | New tools auto-proxied | Adding backend tool with content_base64 param = auto-proxied |
| Reliability | Error propagation | File errors (ENOENT, EACCES) propagated clearly to LLM |
| Security | No path traversal | File paths validated (implicit — OS handles via fs.readFileSync) |
| Maintainability | Single Responsibility | Base64ProxyService handles ONLY proxy logic; WrapperServer handles HTTP |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-29 | Fix base64 design for file tools (drawio, mem_ingest_file) | Done | Task | Main ticket |

---

## 8. Appendix

### Tools Affected by Base64 Proxy

| Tool Name | Input Proxy | Output Proxy | Description |
|-----------|-------------|--------------|-------------|
| `drawio_export_png` | Yes | Yes | Read .drawio file, export as PNG |
| `drawio_auto_layout` | Yes | Yes | Read .drawio file, auto-layout, return modified file |
| `mem_ingest_file` | Yes | No | Read file, ingest content into KB |

### Architecture Summary

| Component | Port | Role | Filesystem Access |
|-----------|------|------|-------------------|
| LLM Agent | — | Tool consumer | None |
| Extension (WrapperServer) | 9181 | MCP proxy + file I/O | Full local access |
| Backend | 48721 | Tool logic + processing | No local access |

### Glossary

| Term | Definition |
|------|------------|
| Base64 Proxy | Transparent mechanism that converts file_path to base64 content for remote tool invocation |
| WrapperServer | HTTP server in extension that bridges LLM requests to backend via JSON-RPC |
| Schema Rewriting | Process of modifying tool schemas to hide internal params (content_base64) from LLM |
| execute_dynamic_tool | Meta-tool that invokes other tools by name with nested arguments |
| find_tools | Discovery tool that returns available tools and their schemas |

### Use Cases

![Use Case Diagram](diagrams/use-case.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow — Data flow LLM to Extension to Backend | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram — Actor interactions | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
