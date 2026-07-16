# Functional Specification Document (FSD)

## SA4E Extension — SA4E-29: Fix base64 design for file tools (drawio, mem_ingest_file)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-29 |
| Title | Fix base64 design for file tools (drawio, mem_ingest_file) |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-18 |
| Status | Draft (Retroactive) |
| Related BRD | documents/SA4E-29/BRD.md |
| Documentation Mode | Retroactive — grounded from implemented code |

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
| 1.0 | 2026-07-18 | BA Agent | Initiate document — retroactive FSD from implemented code (SA4E-29) |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Base64 Proxy system that transparently bridges file I/O between the local Extension (port 9181) and the remote Backend (port 48721). It defines use cases, business rules, processing logic, and data specifications grounded from the actual implementation in `Base64ProxyService.ts` and `WrapperServer.ts`.

### 1.2 Scope

- Schema-driven auto-detection of file tools requiring proxy
- Schema rewriting to hide internal base64 params from LLM
- Input proxy: file_path → content_base64
- Output proxy: output_base64 → local file write
- execute_dynamic_tool nested argument unwrapping
- find_tools response schema rewriting
### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Base64 Proxy | Transparent mechanism converting file_path to base64 for remote tool invocation |
| WrapperServer | HTTP JSON-RPC server (port 9181) bridging LLM requests to backend |
| Schema Rewriting | Modifying tool schemas to hide content_base64 from LLM |
| execute_dynamic_tool | Meta-tool that invokes other tools by name with nested arguments |
| find_tools | Discovery tool returning available tools and their schemas |
| MCP | Model Context Protocol - JSON-RPC based tool communication |
| Input Proxy | Converting file_path to reading file then base64 encoding |
| Output Proxy | Decoding base64 response then writing local file |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-29/BRD.md |
| Architecture ADR | documents/SA4E-29/ARCHITECTURE-BASE64-PROXY.md |
| Base64ProxyService | extension/src/services/Base64ProxyService.ts |
| WrapperServer | extension/src/services/WrapperServer.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The system comprises three actors in a linear proxy chain:

| Actor | Role | Port | Filesystem Access |
|-------|------|------|-------------------|
| LLM Agent | Tool consumer (sends file_path) | - | None |
| Extension (WrapperServer) | MCP proxy + file I/O bridge | 9181 | Full local access |
| Backend | Tool logic + content processing | 48721 | No local access |

### 2.2 System Architecture

The Extension acts as a transparent proxy between LLM and Backend:
- **WrapperServer**: HTTP server accepting MCP JSON-RPC on `/mcp` endpoint
- **Base64ProxyService**: Single-responsibility service handling all proxy logic
- **Backend**: Remote MCP server processing tool requests with base64 content

---

## 3. Functional Requirements

### 3.1 Use Case: UC-01 — Transparent File Tool Call via Proxy

**Source:** BRD Story 1 (Transparent file_path interface for LLM)

#### 3.1.1 Description

LLM calls a file-based tool using only `file_path`. The Extension transparently reads the file, encodes to base64, forwards to backend, receives output_base64, writes to local file, and returns file_path to LLM.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** LLM Agent
**Preconditions:** Extension WrapperServer running on port 9181; Backend running on port 48721; File exists at specified file_path
**Postconditions:** Output file written locally; LLM receives file_path + size_bytes

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | LLM sends tools/call with file_path | | LLM calls e.g. drawio_export_png(file_path: "doc.drawio") |
| 2 | | WrapperServer.routeToolCall() | Routes to callWithProxy(name, args) |
| 3 | | Base64ProxyService.proxyInput() | Reads file via fs.readFileSync, encodes to base64, injects content_base64 into args, removes file_path from forwarded args |
| 4 | | WrapperServer forwards to backend | Calls restCallTool(name, proxiedArgs) |
| 5 | | Backend processes content | Backend uses content_base64, returns output_base64 in response |
| 6 | | Base64ProxyService.proxyOutput() | Extracts output_base64, resolves output path, writes file via fs.writeFileSync |
| 7 | | WrapperServer returns result to LLM | Returns { file_path: "doc.png", size_bytes: N } |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01-1 | Tool does not need output proxy (e.g. mem_ingest_file) | Skip step 6; return backend response unchanged |
| AF-01-2 | LLM provides output_path parameter | Use output_path instead of auto-derived path in step 6 |
| AF-01-3 | Tool is not in base64InputTools set | Skip proxy entirely; pass through to backend unchanged |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01-1 | File not found at file_path | proxyInput throws Error("Failed to read file {path}: ENOENT"); WrapperServer returns JSON-RPC error |
| EF-01-2 | Write permission denied on output | proxyOutput catches error silently, returns raw backend result |
| EF-01-3 | Backend unreachable | restCallTool throws; WrapperServer returns JSON-RPC error code -32603 |
| EF-01-4 | Backend returns error result | proxyOutput detects result.isError, returns result unchanged |

---

### 3.2 Use Case: UC-02 — Auto-Detection of Proxy Tools from Schema

**Source:** BRD Story 2 (Zero-config auto-detection for new tools)

#### 3.2.1 Description

On every tools/list call, Extension scans backend tool schemas and auto-populates the input/output proxy Sets. No hardcoded tool names.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** Extension (internal trigger on tools/list)
**Preconditions:** Backend is reachable and returns tool list
**Postconditions:** base64InputTools and base64OutputTools Sets are populated

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | WrapperServer.getToolsRewritten() | Calls restGetTools() to fetch backend tools |
| 2 | | Base64ProxyService.detectFromToolList(tools) | Clears both Sets, iterates all tools |
| 3 | | hasBase64InputParam(tool) | Checks tool.inputSchema.properties for "content_base64" key |
| 4 | | hasBase64Output(tool) | Checks tool.description contains "output_base64" |
| 5 | | Populates Sets | Adds tool.name to respective Set(s) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-02-1 | Tool has no inputSchema | hasBase64InputParam returns false; tool skipped for input proxy |
| AF-02-2 | Tool has no description | hasBase64Output returns false; tool skipped for output proxy |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-02-1 | Backend returns empty tool list | Both Sets cleared; no tools proxied |
| EF-02-2 | Backend unreachable during tools/list | Error propagates; previous Sets remain (stale until next successful call) |

---

### 3.3 Use Case: UC-03 — Schema Rewriting for LLM

**Source:** BRD Story 3 (Single proxy service) + Story 5 (find_tools schema rewriting)

#### 3.3.1 Description

Tool schemas returned to LLM are rewritten to hide content_base64 and expose file_path as the required parameter.

#### 3.3.2 Use Case

**Use Case ID:** UC-03
**Actor:** LLM Agent (requesting tools/list)
**Preconditions:** detectFromToolList() has been called (always happens before rewrite)
**Postconditions:** LLM receives schemas with file_path (not content_base64)

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | LLM sends tools/list request | | JSON-RPC method: tools/list |
| 2 | | WrapperServer.getToolsRewritten() | Fetches tools from backend, runs detection |
| 3 | | Base64ProxyService.rewriteSchemasForLlm(tools) | Iterates tools, rewrites each proxied tool |
| 4 | | rewriteSingleSchema(tool) | For input tools: remove content_base64 from properties, add file_path (required); For output tools: add output_path (optional) |
| 5 | | WrapperServer returns rewritten tools to LLM | LLM sees file_path-based schemas |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-03-1 | Tool is not in either proxy Set | rewriteSingleSchema returns tool unchanged |
| AF-03-2 | Tool already has file_path in schema | Keeps existing file_path definition, only removes content_base64 |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-03-1 | Tool schema has no properties object | Returns tool unchanged (no rewriting possible) |

---

### 3.4 Use Case: UC-04 — execute_dynamic_tool Unwrapping

**Source:** BRD Story 6 (execute_dynamic_tool nested arg unwrapping)

#### 3.4.1 Description

When execute_dynamic_tool is called, the system unwraps nested toolName + arguments, applies proxy to inner args, re-wraps, and forwards.

#### 3.4.2 Use Case

**Use Case ID:** UC-04
**Actor:** LLM Agent
**Preconditions:** LLM calls execute_dynamic_tool with toolName and arguments/args containing file_path
**Postconditions:** Inner tool is proxied correctly; response is output-proxied

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | LLM calls execute_dynamic_tool | | Args: { toolName: "drawio_export_png", arguments: { file_path: "x.drawio" } } |
| 2 | | WrapperServer.handleDynamic(args) | Detects execute_dynamic_tool routing |
| 3 | | Base64ProxyService.unwrapDynamicTool(args) | Extracts toolName (from args.toolName or args.tool_name) and innerArgs (from args.arguments or args.args) |
| 4 | | Base64ProxyService.proxyInput(toolName, innerArgs) | Reads file, injects content_base64 |
| 5 | | Base64ProxyService.wrapDynamicTool(originalArgs, proxiedInnerArgs) | Re-wraps into execute_dynamic_tool shape |
| 6 | | restCallTool("execute_dynamic_tool", finalArgs) | Forwards to backend |
| 7 | | Base64ProxyService.proxyOutput(toolName, innerArgs, result) | Handles output_base64 if present |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-04-1 | Inner toolName is "find_tools" | Skip proxy; forward as-is, then rewrite response (UC-05) |
| AF-04-2 | unwrapDynamicTool returns null (no toolName found) | Forward entire call unchanged to backend |
| AF-04-3 | Inner tool uses "args" key instead of "arguments" | unwrapDynamicTool handles both; wrapDynamicTool preserves original key |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-04-1 | Inner file_path not found | proxyInput throws; error propagates as JSON-RPC error |
| EF-04-2 | Backend returns error for inner tool | proxyOutput detects isError, returns unchanged |

---

### 3.5 Use Case: UC-05 — find_tools Response Rewriting

**Source:** BRD Story 5 (find_tools schema rewriting)

#### 3.5.1 Description

When find_tools returns tool schemas in its response, those schemas are rewritten to hide content_base64 from LLM, ensuring consistency with tools/list.

#### 3.5.2 Use Case

**Use Case ID:** UC-05
**Actor:** LLM Agent (via execute_dynamic_tool calling find_tools)
**Preconditions:** find_tools returns response containing tool schemas
**Postconditions:** Schemas in response are rewritten identically to tools/list

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | LLM calls execute_dynamic_tool(toolName: "find_tools", ...) | | Discovery request |
| 2 | | WrapperServer.handleDynamic() | Detects toolName === "find_tools" |
| 3 | | Forward to backend unchanged | No input proxy needed for find_tools |
| 4 | | WrapperServer.rewriteFindToolsResponse(result) | Intercepts response |
| 5 | | Parse result.content[0].text as JSON | Extract tools array (from parsed.tools or parsed directly) |
| 6 | | Base64ProxyService.rewriteSchemasForLlm(tools) | Apply same rewriting as tools/list |
| 7 | | Replace content text with rewritten JSON | Return modified result to LLM |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-05-1 | Response has no content[0].text | Return result unchanged |
| AF-05-2 | Parsed content has no tools array | Return result unchanged |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-05-1 | JSON parse fails on response text | Catch silently; return original result unchanged |

---

### 3.6 Use Case: UC-06 — Production-Ready Zero-Config Operation

**Source:** BRD Story 4 (Production-ready without manual configuration)

#### 3.6.1 Description

The proxy system works immediately on fresh installation without any manual configuration. Output directories are auto-created. Non-file tools pass through unchanged.

#### 3.6.2 Use Case

**Use Case ID:** UC-06
**Actor:** Platform Operator / LLM Agent
**Preconditions:** Extension + Backend running; no special configuration
**Postconditions:** File tools proxied automatically; non-file tools unaffected

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | First tools/list call arrives | | Triggers auto-detection |
| 2 | | detectFromToolList() | Scans schemas, populates Sets (no config file needed) |
| 3 | LLM calls non-file tool (e.g. mem_search) | | Not in base64InputTools |
| 4 | | callWithProxy() | proxyInput returns args unchanged; passes through |
| 5 | LLM calls file tool with output to new directory | | e.g. output to docs/new_dir/out.png |
| 6 | | proxyOutput() -> ensureDir() | Creates directory recursively with fs.mkdirSync(dir, { recursive: true }) |
| 7 | | Writes output file | Operation succeeds without pre-existing directory |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-06-1 | Output directory already exists | ensureDir() is no-op (fs.existsSync check) |
| AF-06-2 | Tool is LOCAL_TOOLS (stream_write_file, embed_image) | Executed locally via executeLocalTool(); no backend forwarding |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-06-1 | Request body exceeds MAX_BODY_SIZE (1MB) | WrapperServer.readBody() destroys request, rejects with Error("Body too large") |
| EF-06-2 | Backend unreachable on first call | Error propagates; proxy Sets remain empty until backend recovers |

---

## 4. Business Rules

| Rule ID | Rule | Source | Implementation |
|---------|------|--------|----------------|
| BR-01 | A tool requires INPUT proxy if and only if its inputSchema.properties contains a key named "content_base64" | BRD Story 2 | Base64ProxyService.hasBase64InputParam() |
| BR-02 | A tool requires OUTPUT proxy if and only if its description contains the substring "output_base64" or "Returns output_base64" | BRD Story 2 | Base64ProxyService.hasBase64Output() |
| BR-03 | Schema rewriting for LLM MUST remove content_base64 from properties and required arrays, and add file_path as required string parameter | BRD Story 1 | Base64ProxyService.rewriteSingleSchema() |
| BR-04 | Schema rewriting for output tools MUST add output_path as optional string parameter | BRD Story 1 | Base64ProxyService.rewriteSingleSchema() |
| BR-05 | Input proxy MUST read file synchronously via fs.readFileSync and encode to base64 string | BRD Story 1 | Base64ProxyService.proxyInput() |
| BR-06 | Input proxy MUST NOT proxy if content_base64 already exists in args (avoid double-encoding) | Code logic | proxyInput() early return check |
| BR-07 | Output proxy MUST resolve output path: use args.output_path if provided; else derive from file_path (e.g. .drawio -> .png; default: .out suffix) | BRD Story 1 | Base64ProxyService.resolveOutputPath() |
| BR-08 | Output proxy MUST create parent directories recursively if they do not exist | BRD Story 4 | Base64ProxyService.ensureDir() |
| BR-09 | execute_dynamic_tool unwrapping MUST support both "arguments" and "args" keys for inner arguments, and both "toolName" and "tool_name" for tool name | BRD Story 6 | Base64ProxyService.unwrapDynamicTool() |
| BR-10 | execute_dynamic_tool re-wrapping MUST preserve the original key name (arguments vs args) | BRD Story 6 | Base64ProxyService.wrapDynamicTool() |
| BR-11 | find_tools responses MUST be rewritten with same logic as tools/list (schema consistency guarantee) | BRD Story 5 | WrapperServer.rewriteFindToolsResponse() |
| BR-12 | Proxy detection Sets MUST be rebuilt (cleared + re-populated) on every tools/list call | BRD Story 2 | detectFromToolList() clears both Sets first |
| BR-13 | No hardcoded tool names in proxy logic - all detection is schema-driven | BRD Story 2 | Detection uses schema inspection, not name matching |
| BR-14 | LOCAL_TOOLS (stream_write_file, embed_image) execute locally without forwarding to backend | Code logic | WrapperServer.routeToolCall() |
| BR-15 | Maximum request body size is 1MB (1024 * 1024 bytes) | BRD Story 4 | WrapperServer.readBody() MAX_BODY_SIZE constant |
| BR-16 | Output proxy MUST NOT process if result.isError is truthy | Code logic | proxyOutput() early return on isError |
| BR-17 | Output proxy MUST NOT process if response text cannot be parsed as JSON | Code logic | proxyOutput() catch block returns original result |

---

## 5. Data Specifications

### 5.1 Tool Schema Structure (Backend)

**inputSchema format (from backend tools/list response):**

| Field | Type | Description |
|-------|------|-------------|
| type | string | Always "object" |
| properties | Record<string, PropertyDef> | Map of parameter name to definition |
| required | string[] | Array of required parameter names |

**PropertyDef:**

| Field | Type | Description |
|-------|------|-------------|
| type | string | JSON Schema type (string, number, boolean, etc.) |
| description | string | Parameter description for LLM consumption |

### 5.2 Proxy Detection Criteria

**Input Proxy Detection (BR-01):**

`
tool.inputSchema !== undefined
  AND tool.inputSchema.properties !== undefined
  AND "content_base64" IN Object.keys(tool.inputSchema.properties)
`

**Output Proxy Detection (BR-02):**

`
tool.description !== undefined
  AND (tool.description.includes("output_base64")
       OR tool.description.includes("Returns output_base64"))
`

### 5.3 Input Proxy Data Flow

**Input (from LLM):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| file_path | string | Yes | Local filesystem path to source file |
| output_path | string | No | Optional destination path for output |
| (other params) | any | Varies | Tool-specific parameters passed through |

**Transformed Output (to Backend):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| content_base64 | string | Yes | Base64-encoded file content |
| file_path | string | Yes | Original path (kept as reference for backend) |
| output_path | string | No | Passed through if provided |
| (other params) | any | Varies | Tool-specific parameters passed through |

### 5.4 Output Proxy Data Flow

**Input (from Backend response):**

| Field | Type | Description |
|-------|------|-------------|
| output_base64 | string | Base64-encoded output file content |
| (other fields) | any | Tool-specific response data |

**Transformed Output (to LLM):**

| Field | Type | Description |
|-------|------|-------------|
| file_path | string | Local path where output was written |
| size_bytes | number | Size of written file in bytes |
| (other fields) | any | Tool-specific response data (output_base64 removed) |

### 5.5 MCP JSON-RPC Message Format

**tools/list response structure:**

`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "drawio_export_png",
        "description": "Export drawio to PNG. Returns output_base64.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "file_path": { "type": "string", "description": "Local file path to read" },
            "output_path": { "type": "string", "description": "Output file path (optional)" }
          },
          "required": ["file_path"]
        }
      }
    ]
  }
}
`

### 5.6 execute_dynamic_tool Argument Structure

**Incoming (from LLM):**

| Field | Type | Variants | Description |
|-------|------|----------|-------------|
| toolName / tool_name | string | Both supported | Name of inner tool to invoke |
| arguments / args | Record<string, unknown> | Both supported | Inner tool arguments |

---

## 6. Processing Logic

### 6.1 Process: tools/list Rewrite

**Trigger:** LLM sends JSON-RPC request with method "tools/list"
**Input:** Backend tool list (raw schemas with content_base64)
**Output:** Rewritten tool list (schemas with file_path for LLM)

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | WrapperServer calls restGetTools() to fetch tools from backend | If backend unreachable, throw error (propagates as JSON-RPC -32603) |
| 2 | Pass tools array to detectFromToolList() | N/A - pure logic, no external I/O |
| 3 | Clear base64InputTools and base64OutputTools Sets | N/A |
| 4 | For each tool: check hasBase64InputParam() and hasBase64Output() | N/A - safe property access |
| 5 | Add matching tool names to respective Sets | N/A |
| 6 | Call rewriteSchemasForLlm(tools) | N/A |
| 7 | For each tool in proxy Sets: clone schema, modify properties/required | N/A |
| 8 | Return rewritten tools array wrapped in JSON-RPC response | N/A |

### 6.2 Process: tools/call Proxy (Input + Output)

**Trigger:** LLM sends JSON-RPC request with method "tools/call"
**Input:** Tool name + arguments (with file_path)
**Output:** Proxied result (with local file_path in response)

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Extract name and args from params | If missing, forward unchanged |
| 2 | Check if name is in LOCAL_TOOLS | If yes, execute locally via executeLocalTool() |
| 3 | Check if name === "execute_dynamic_tool" | If yes, route to handleDynamic() (see 6.3) |
| 4 | Call proxyInput(name, args) | If file not found: throw Error("Failed to read file {path}: {message}") |
| 5 | If tool not in base64InputTools: return args unchanged | N/A - passthrough |
| 6 | If file_path missing or content_base64 already present: return args unchanged | N/A - skip proxy |
| 7 | Read file via fs.readFileSync(filePath) | Throw on ENOENT, EACCES |
| 8 | Set newArgs.content_base64 = buffer.toString("base64") | N/A |
| 9 | Call restCallTool(name, finalArgs) to forward to backend | If backend error, propagate |
| 10 | Call proxyOutput(name, args, result) | If parse/write fails: return original result |
| 11 | If tool not in base64OutputTools: return result unchanged | N/A |
| 12 | If result.isError: return result unchanged | N/A |
| 13 | Extract text from result.content[0].text | If no text: return unchanged |
| 14 | Parse text as JSON; check for output_base64 field | If no output_base64: return unchanged |
| 15 | Resolve output path (output_path or derived from file_path) | If no path resolvable: return unchanged |
| 16 | Decode base64, ensure directory exists, write file | Silent catch on failure |
| 17 | Return updated result: { file_path, size_bytes, ...rest } without output_base64 | N/A |

### 6.3 Process: execute_dynamic_tool Unwrap

**Trigger:** tools/call with name === "execute_dynamic_tool"
**Input:** Args containing toolName/tool_name + arguments/args
**Output:** Proxied dynamic tool result

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Call unwrapDynamicTool(args) | Returns null if no toolName found |
| 2 | If null: forward to backend as-is (no proxy) | N/A |
| 3 | If toolName === "find_tools": forward unchanged, then rewrite response (6.4) | N/A |
| 4 | Call proxyInput(toolName, innerArgs) on the inner arguments | Throw on file read error |
| 5 | Call wrapDynamicTool(originalArgs, proxiedInnerArgs) | Preserves original key (arguments vs args) |
| 6 | Forward finalArgs to backend via restCallTool("execute_dynamic_tool", finalArgs) | Propagate backend errors |
| 7 | Call proxyOutput(toolName, innerArgs, result) on response | Silent catch on parse/write failures |
| 8 | Return final result to LLM | N/A |

### 6.4 Process: find_tools Response Rewrite

**Trigger:** execute_dynamic_tool with toolName === "find_tools" returns
**Input:** Backend response containing tool schemas
**Output:** Response with schemas rewritten for LLM

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Check result.content[0].text exists | If not: return result unchanged |
| 2 | Parse text as JSON | If parse fails: catch, return original |
| 3 | Extract tools array (from parsed.tools or parsed if already array) | If not array: return unchanged |
| 4 | Call rewriteSchemasForLlm(tools) | N/A - pure transformation |
| 5 | Reconstruct output: if original had .tools wrapper, wrap rewritten | N/A |
| 6 | Replace content[0].text with JSON.stringify(output) | N/A |
| 7 | Return modified result | N/A |

---

## 7. Error Handling

### 7.1 Error Scenarios

| Scenario | Severity | Error Message | Expected Behavior |
|----------|----------|--------------|-------------------|
| File not found (ENOENT) | Critical | "Failed to read file {path}: ENOENT: no such file or directory" | JSON-RPC error returned to LLM; tool call fails |
| Write permission denied (EACCES) | Critical | "Failed to read file {path}: EACCES: permission denied" | JSON-RPC error returned to LLM |
| Request body exceeds 1MB | Critical | "Body too large" | Request stream destroyed; connection rejected |
| Backend unreachable | Critical | Network error message from restCallTool | JSON-RPC error code -32603 returned |
| Invalid JSON in request body | Warning | "Parse error" | JSON-RPC error code -32700 returned |
| Unsupported HTTP method on /mcp | Warning | "Method not allowed" | HTTP 405 returned |
| Missing Content-Type header | Warning | "Expected application/json" | JSON-RPC error code -32700 returned |
| Output base64 decode/write failure | Info | (silent) | Original backend result returned unchanged; no file written |
| JSON parse failure in response | Info | (silent) | Original backend result returned unchanged |
| Unsupported JSON-RPC method | Warning | "Method not supported: {method}" | JSON-RPC error code -32601 returned |

### 7.2 Error Propagation Rules

1. **File read errors** (proxyInput): Always propagated as exceptions - LLM must know file is inaccessible
2. **File write errors** (proxyOutput): Silently caught - LLM receives raw backend response
3. **Backend errors**: Propagated unchanged via JSON-RPC error response
4. **Parse errors**: Silently caught in proxyOutput/rewriteFindToolsResponse - original response preserved
5. **Body size exceeded**: Connection destroyed immediately (security protection)

---

## 8. Non-Functional Requirements

| Category | Requirement | Acceptance Criteria |
|----------|-------------|---------------------|
| Transparency | LLM never sees base64 params | tools/list and find_tools always show file_path, never content_base64 |
| Zero-config | No config file or env var needed | Proxy works on fresh install with Extension + Backend running |
| Performance | File I/O is synchronous and local | Sub-millisecond for typical files (< 1MB) |
| Extensibility | New tools auto-proxied from schema | Adding content_base64 to backend tool schema = instant proxy support |
| Reliability | Graceful degradation on output failure | If write fails, return raw response rather than crash |
| Security | Body size limit enforced | MAX_BODY_SIZE = 1MB prevents memory exhaustion attacks |
| Maintainability | Single Responsibility Principle | Base64ProxyService: proxy logic only; WrapperServer: HTTP routing only |

---

## 9. Sequence Diagram

![Sequence - Proxy Call](diagrams/sequence-proxy-call.png)

Sequence for a single tool call through the base64 proxy (UC-01 main flow).

---

## 10. State Diagram

![State - Tool Detection](diagrams/state-tool-detection.png)

State machine showing how a tool schema transitions through detection states (Not Detected -> Input Only / Output Only / Both / Not Proxied).

---

## 11. Appendix

### 11.1 Tools Currently Auto-Detected

| Tool Name | Input Proxy | Output Proxy | Detection Trigger |
|-----------|-------------|--------------|-------------------|
| drawio_export_png | Yes | Yes | schema has content_base64 + description has "output_base64" |
| drawio_auto_layout | Yes | No | schema has content_base64; description lacks "output_base64" |
| mem_ingest_file | Yes | No | schema has content_base64; description lacks "output_base64" |

### 11.2 Output Path Resolution Rules

| Source file_path | Resolved output_path |
|------------------|---------------------|
| *.drawio | *.png (regex replace .drawio$ with .png) |
| Any other extension | *.out (append .out suffix) |
| output_path provided by LLM | Used as-is (takes priority) |
| No file_path and no output_path | null (no file written, return raw result) |

### 11.3 WrapperServer Routing Table

| Condition | Route | Handler |
|-----------|-------|---------|
| pathname === "/health" | Health check | Returns {"status":"ok","mode":"wrapper"} |
| pathname === "/mcp" + method POST | MCP JSON-RPC | handleMcp() |
| method === "tools/list" | Tool listing | getToolsRewritten() |
| method === "tools/call" + LOCAL_TOOLS | Local execution | executeLocalTool() |
| method === "tools/call" + execute_dynamic_tool | Dynamic routing | handleDynamic() |
| method === "tools/call" + any other | Standard proxy | callWithProxy() |
| Any other pathname | 404 | {"error":"Not found"} |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context — 3 actors (LLM, Extension, Backend) | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Proxy Call flow for 1 tool call | [sequence-proxy-call.png](diagrams/sequence-proxy-call.png) | [sequence-proxy-call.drawio](diagrams/sequence-proxy-call.drawio) |
| 3 | State — Tool Detection states | [state-tool-detection.png](diagrams/state-tool-detection.png) | [state-tool-detection.drawio](diagrams/state-tool-detection.drawio) |
