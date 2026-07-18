# Technical Design Document (TDD)

## SA4E Extension — SA4E-29: Fix base64 design for file tools (drawio, mem_ingest_file)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-29 |
| Title | Fix base64 design for file tools (drawio, mem_ingest_file) |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-07-20 |
| Status | Approved (Retroactive) |
| Related FSD | documents/SA4E-29/FSD.md |
| Related BRD | documents/SA4E-29/BRD.md |
| Documentation Mode | Retroactive — design as-implemented |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer | BA Agent – Business Analyst | Review completeness vs requirements |

---
## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-20 | SA Agent | Initiate document — retroactive TDD from implemented code (SA4E-29) |

---

## 1. Architecture Overview

### 1.1 System Context

The SA4E extension operates in a **split-process architecture** where the Extension (local) acts as a transparent proxy between the LLM Agent and the remote Backend:

| Component | Port | Role | Filesystem |
|-----------|------|------|------------|
| LLM Agent | — | Tool consumer (sends file_path) | None |
| Extension (WrapperServer) | 9181 | MCP proxy + file I/O bridge | Full local |
| Backend | 48721 | Tool logic + content processing | None |

### 1.2 Component Placement

Within the VS Code Extension process:

`
extension/src/
├── services/
│   ├── Base64ProxyService.ts   ← Proxy logic (SRP: only base64 proxy)
│   └── WrapperServer.ts        ← HTTP routing (SRP: only JSON-RPC dispatch)
├── backend-local-tools.ts       ← Local tool execution (stream_write_file, embed_image)
└── extension.ts                 ← Activation entry point, wires dependencies
`

### 1.3 Data Flow

**Normal tool call (no file I/O):**
LLM → WrapperServer.routeToolCall() → restCallTool() → Backend → result → LLM

**File tool call (with base64 proxy):**
1. LLM sends `{ file_path: "doc.drawio" }` to Extension
2. WrapperServer.routeToolCall() → callWithProxy()
3. Base64ProxyService.proxyInput() reads file, injects `content_base64`
4. restCallTool() forwards to Backend with base64 content
5. Backend processes, returns `{ output_base64: "..." }`
6. Base64ProxyService.proxyOutput() decodes, writes local file
7. LLM receives `{ file_path: "doc.png", size_bytes: N }`

**Dynamic tool call (execute_dynamic_tool):**
1. LLM sends `execute_dynamic_tool({ toolName: "drawio_export_png", arguments: { file_path } })`
2. WrapperServer.handleDynamic() → unwrapDynamicTool() → proxyInput on inner args
3. wrapDynamicTool() → restCallTool("execute_dynamic_tool", finalArgs)
4. proxyOutput() on response → LLM receives file_path result

![Architecture Overview](diagrams/architecture.png)

---

## 2. Design Patterns

### 2.1 Proxy Pattern (GoF — Structural)

**Applied in:** `Base64ProxyService`

The service acts as a transparent proxy between the LLM and Backend, intercepting requests to transform file_path ↔ content_base64 without either party knowing. The LLM believes it talks to a local file tool; the Backend believes it receives base64 content natively.

**Key characteristics:**
- Same interface presented to both sides
- Transformation is invisible to caller and callee
- Additional behavior (file I/O) injected transparently

### 2.2 Strategy Pattern (GoF — Behavioral)

**Applied in:** `WrapperServer.routeToolCall()`

Routing decisions are strategy-based:
- LOCAL_TOOLS → `executeLocalTool()` (local strategy)
- "execute_dynamic_tool" → `handleDynamic()` (dynamic strategy)
- All others → `callWithProxy()` (proxy strategy)

The routing logic dispatches to the appropriate handler without modifying tool behavior.

### 2.3 Single Responsibility Principle (SOLID — S)

**Strict separation:**
- `Base64ProxyService`: ONLY proxy logic (detect, rewrite, proxy I/O, unwrap/wrap)
- `WrapperServer`: ONLY HTTP routing, JSON-RPC dispatch, response formatting
- `backend-local-tools.ts`: ONLY local tool execution

No class has more than one reason to change.

### 2.4 Dependency Inversion (SOLID — D)

**Applied in:** `WrapperServerDeps` interface

WrapperServer depends on abstractions (interface), not on concrete implementations:
- `restGetTools: () => Promise<any[]>` — abstract tool fetch
- `restCallTool: (name, args) => Promise<any>` — abstract tool call
- `base64Proxy: Base64ProxyService` — injected service
- `outputChannel: vscode.OutputChannel` — injected logger

This enables unit testing with mocked dependencies.

---

## 3. Class/Module Design

### 3.1 Base64ProxyService

**Location:** `extension/src/services/Base64ProxyService.ts`
**Responsibility:** Schema-driven auto-detection and transparent file ↔ base64 proxy.

#### Interface

`	ypescript
export interface ToolSchema {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}
`

#### Class Members

**Private State:**
- `base64InputTools: Set<string>` — tools requiring input proxy
- `base64OutputTools: Set<string>` — tools returning output_base64

#### Public Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| detectFromToolList | `(tools: ToolSchema[]): void` | Scan tools, populate proxy Sets |
| needsInputProxy | `(toolName: string): boolean` | Check if tool needs input proxy |
| needsOutputProxy | `(toolName: string): boolean` | Check if tool needs output proxy |
| rewriteSchemasForLlm | `(tools: ToolSchema[]): ToolSchema[]` | Hide content_base64, expose file_path |
| proxyInput | `(toolName: string, args: Record<string, unknown>): Record<string, unknown>` | Read file → inject base64 |
| proxyOutput | `(toolName: string, args: Record<string, unknown>, result: any): any` | Decode base64 → write file |
| unwrapDynamicTool | `(args: Record<string, unknown>): { toolName: string; innerArgs: Record<string, unknown> } | null` | Extract nested tool info |
| wrapDynamicTool | `(originalArgs: Record<string, unknown>, proxiedInnerArgs: Record<string, unknown>): Record<string, unknown>` | Re-wrap proxied args |

#### Private Methods

| Method | Purpose |
|--------|---------|
| hasBase64InputParam(tool) | Check schema.properties for "content_base64" key |
| hasBase64Output(tool) | Check description contains "output_base64" |
| rewriteSingleSchema(tool) | Transform one tool's schema for LLM |
| resolveOutputPath(toolName, args) | Determine output file path |
| extractText(result) | Get text from MCP result structure |
| replaceText(result, newText) | Replace text in MCP result structure |
| ensureDir(dir) | Create directory recursively if not exists |

### 3.2 WrapperServer

**Location:** `extension/src/services/WrapperServer.ts`
**Responsibility:** HTTP JSON-RPC server bridging LLM to Backend.

#### Dependencies Interface

`	ypescript
export interface WrapperServerDeps {
  outputChannel: vscode.OutputChannel;
  base64Proxy: Base64ProxyService;
  restGetTools: () => Promise<any[]>;
  restCallTool: (name: string, args: Record<string, unknown>) => Promise<any>;
}
`

#### Constants

- `MAX_BODY_SIZE = 1024 * 1024` (1MB)
- `LOCAL_TOOLS = new Set(["stream_write_file", "embed_image"])`

#### Public Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| start | `(requestedPort: number): Promise<void>` | Start HTTP server |
| stop | `(): Promise<void>` | Stop HTTP server |
| routeToolCall | `(params: any): Promise<any>` | Route tool call to appropriate handler |
| listeningPort | `get: number | null` | Currently bound port |

#### Private Methods

| Method | Signature | Purpose |
|--------|-----------|---------|
| handleRequest | `(req, res): Promise<void>` | HTTP dispatch: /mcp, /health, CORS |
| handleMcp | `(req, res): Promise<void>` | JSON-RPC method dispatch |
| getToolsRewritten | `(): Promise<any[]>` | Fetch + detect + rewrite tools |
| handleDynamic | `(args): Promise<any>` | execute_dynamic_tool routing |
| rewriteFindToolsResponse | `(result): any` | Rewrite find_tools schemas in response |
| callWithProxy | `(name, args): Promise<any>` | Input proxy → call → output proxy |
| readBody | `(req): Promise<string>` | Read body with MAX_BODY_SIZE check |
| sendResult | `(res, id, result): void` | JSON-RPC success response |
| sendError | `(res, id, code, message): void` | JSON-RPC error response |

---

## 4. Implementation Details

### 4.1 Detection Logic (detectFromToolList)

`	ypescript
detectFromToolList(tools: ToolSchema[]): void {
  this.base64InputTools.clear();     // BR-12: rebuild on every call
  this.base64OutputTools.clear();
  for (const tool of tools) {
    if (this.hasBase64InputParam(tool))   // BR-01
      this.base64InputTools.add(tool.name);
    if (this.hasBase64Output(tool))       // BR-02
      this.base64OutputTools.add(tool.name);
  }
}
`

**Detection criteria (BR-01, BR-02):**
- Input: `tool.inputSchema.properties` contains key `"content_base64"`
- Output: `tool.description` contains `"output_base64"`

### 4.2 Input Proxy Logic (proxyInput)

`	ypescript
proxyInput(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
  if (!this.base64InputTools.has(toolName)) return args;  // not proxied
  const filePath = args.file_path as string | undefined;
  if (!filePath || args.content_base64) return args;       // BR-06: no double-encode
  const newArgs = { ...args };
  try {
    const buf = fs.readFileSync(filePath);                 // BR-05: sync read
    newArgs.content_base64 = buf.toString("base64");
  } catch (err: any) {
    throw new Error(Failed to read file : );  // propagate
  }
  return newArgs;
}
`

**Key decisions:**
- Synchronous read (BR-05): local filesystem, sub-ms latency
- Throw on failure: LLM must know file is inaccessible
- Keep file_path in forwarded args (backend uses it as reference)

### 4.3 Output Proxy Logic (proxyOutput)

`	ypescript
proxyOutput(toolName: string, args: Record<string, unknown>, result: any): any {
  if (!this.base64OutputTools.has(toolName)) return result;
  if (!result || result.isError) return result;     // BR-16
  const text = this.extractText(result);
  if (!text) return result;
  try {
    const parsed = JSON.parse(text);
    if (!parsed.output_base64) return result;
    const outputPath = this.resolveOutputPath(toolName, args);  // BR-07
    if (!outputPath) return result;
    const buf = Buffer.from(parsed.output_base64, "base64");
    this.ensureDir(path.dirname(outputPath));                    // BR-08
    fs.writeFileSync(outputPath, buf);
    const updated = { ...parsed, file_path: outputPath, size_bytes: buf.length };
    delete updated.output_base64;
    return this.replaceText(result, JSON.stringify(updated));
  } catch { return result; }    // BR-17: silent catch
}
`

**Key decisions:**
- Silent catch (BR-17): if write fails, return raw backend response (graceful degradation)
- resolveOutputPath priority: output_path > derived from file_path > null

### 4.4 Output Path Resolution (resolveOutputPath)

`	ypescript
resolveOutputPath(toolName: string, args: Record<string, unknown>): string | null {
  if (args.output_path) return args.output_path as string;     // user-specified
  const fp = args.file_path as string | undefined;
  if (!fp) return null;
  if (fp.endsWith(".drawio")) return fp.replace(/\.drawio$/, ".png");  // drawio→png
  return fp + ".out";                                                    // default
}
`

### 4.5 Schema Rewriting (rewriteSingleSchema)

For each proxied tool:
1. Clone schema (immutable transform)
2. **Input tools:** remove `content_base64` from properties + required; add `file_path` as required string
3. **Output tools:** add `output_path` as optional string

### 4.6 Dynamic Tool Handling (handleDynamic)

`	ypescript
private async handleDynamic(args: Record<string, unknown>): Promise<any> {
  const unwrapped = this.deps.base64Proxy.unwrapDynamicTool(args);
  if (!unwrapped) return this.deps.restCallTool("execute_dynamic_tool", args);
  const { toolName, innerArgs } = unwrapped;
  if (toolName === "find_tools") {
    const result = await this.deps.restCallTool("execute_dynamic_tool", args);
    return this.rewriteFindToolsResponse(result);    // UC-05
  }
  const proxied = this.deps.base64Proxy.proxyInput(toolName, innerArgs);
  const finalArgs = this.deps.base64Proxy.wrapDynamicTool(args, proxied);
  let result = await this.deps.restCallTool("execute_dynamic_tool", finalArgs);
  result = this.deps.base64Proxy.proxyOutput(toolName, innerArgs, result);
  return result;
}
`

**Routing logic:**
- No toolName found → passthrough to backend
- toolName === "find_tools" → forward unchanged, then rewrite response schemas
- Any other tool → apply full proxy (input + output)

### 4.7 WrapperServer Routing Table

| Condition | Handler | Description |
|-----------|---------|-------------|
| pathname === "/health" | Inline | Returns `{"status":"ok","mode":"wrapper"}` |
| pathname === "/mcp" + POST | handleMcp() | JSON-RPC dispatch |
| method === "tools/list" | getToolsRewritten() | Detect + rewrite + return |
| method === "tools/call" + LOCAL_TOOLS | executeLocalTool() | Local execution |
| method === "tools/call" + execute_dynamic_tool | handleDynamic() | Dynamic routing |
| method === "tools/call" + other | callWithProxy() | Standard proxy flow |
| OPTIONS | CORS preflight | 204 with headers |
| Other | 404 | `{"error":"Not found"}` |

---

## 5. Error Handling Design

### 5.1 Error Propagation Rules

| Context | Behavior | Rationale |
|---------|----------|-----------|
| proxyInput: file read fails | **Throw** Error | LLM must know file is inaccessible (ENOENT, EACCES) |
| proxyOutput: decode/write fails | **Silent catch**, return original result | Graceful degradation — LLM still gets backend response |
| rewriteFindToolsResponse: JSON parse fails | **Silent catch**, return original result | Don't break discovery flow |
| readBody: exceeds MAX_BODY_SIZE | **Destroy stream**, reject with Error | Security: prevent memory exhaustion |
| handleMcp: any unhandled error | Catch → sendError(res, id, -32603, message) | JSON-RPC compliant error response |
| Backend unreachable | Error propagates from restCallTool | Returns JSON-RPC error code -32603 |

### 5.2 JSON-RPC Error Codes

| Code | Message | Trigger |
|------|---------|---------|
| -32700 | "Parse error" | Invalid JSON body or wrong Content-Type |
| -32601 | "Method not supported: {method}" | Unknown JSON-RPC method |
| -32603 | (error.message) | Internal error (file read, backend unreachable) |

### 5.3 Design Decision: Asymmetric Error Handling

**Input errors THROW** because:
- File not found = tool call cannot proceed at all
- LLM needs actionable feedback to retry with correct path

**Output errors are SILENT** because:
- Backend already processed successfully
- LLM can still use the text-based response
- Writing to disk is a "bonus" — not blocking the response

---

## 6. Security Design

### 6.1 Body Size Limit

`MAX_BODY_SIZE = 1024 * 1024` (1MB) enforced in `readBody()`:
- Prevents memory exhaustion attacks via oversized JSON-RPC payloads
- Stream destroyed immediately on breach (no buffering)
- Accounts for ~33% base64 overhead (effective file limit ~750KB)

### 6.2 Path Traversal

**Not a concern in this design:**
- File paths come from the LLM (trusted agent within the extension)
- Extension has full local filesystem access by design
- No user-facing HTTP endpoint — only internal tool communication
- OS-level `fs.readFileSync` handles path resolution safely

### 6.3 No Secrets Handling

- No authentication between Extension ↔ Backend (localhost/LAN trust)
- No credentials stored or transmitted in proxy payloads
- Base64 encoding is NOT encryption — it's transport encoding only

### 6.4 CORS Headers

Applied to all responses:
- `Access-Control-Allow-Origin: *` (local development tool)
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`

**Acceptable risk:** Server only binds to `127.0.0.1` — not accessible from network.

---

## 7. Implementation Checklist (BR Mapping)

| BR | Rule | Implementation | File | Verified |
|----|------|----------------|------|----------|
| BR-01 | Input proxy detection: content_base64 in properties | `hasBase64InputParam()` checks `tool.inputSchema.properties` for key | Base64ProxyService.ts:L107-112 | ✅ |
| BR-02 | Output proxy detection: "output_base64" in description | `hasBase64Output()` checks `tool.description.includes()` | Base64ProxyService.ts:L114-117 | ✅ |
| BR-03 | Rewrite: remove content_base64, add file_path required | `rewriteSingleSchema()` deletes from props, splices required | Base64ProxyService.ts:L119-138 | ✅ |
| BR-04 | Rewrite: add output_path optional for output tools | `rewriteSingleSchema()` adds output_path property | Base64ProxyService.ts:L133 | ✅ |
| BR-05 | Input proxy: fs.readFileSync + base64 encoding | `proxyInput()` uses `fs.readFileSync` + `buf.toString("base64")` | Base64ProxyService.ts:L66-71 | ✅ |
| BR-06 | Skip if content_base64 already in args | `proxyInput()` early return: `if (!filePath || args.content_base64) return args` | Base64ProxyService.ts:L64 | ✅ |
| BR-07 | Output path: output_path > derived > null | `resolveOutputPath()` checks output_path first, then .drawio→.png, else .out | Base64ProxyService.ts:L140-145 | ✅ |
| BR-08 | Create parent directories recursively | `ensureDir()` uses `fs.mkdirSync(dir, { recursive: true })` | Base64ProxyService.ts:L157-159 | ✅ |
| BR-09 | Unwrap supports toolName/tool_name + arguments/args | `unwrapDynamicTool()` checks both key variants with `??` | Base64ProxyService.ts:L95-99 | ✅ |
| BR-10 | Wrap preserves original key (arguments vs args) | `wrapDynamicTool()` checks `"arguments" in originalArgs` | Base64ProxyService.ts:L104-110 | ✅ |
| BR-11 | find_tools response rewriting uses same logic as tools/list | `rewriteFindToolsResponse()` calls `rewriteSchemasForLlm()` | WrapperServer.ts:L113-121 | ✅ |
| BR-12 | Detection Sets rebuilt (clear + populate) on every tools/list | `detectFromToolList()` calls `.clear()` on both Sets first | Base64ProxyService.ts:L27-28 | ✅ |
| BR-13 | No hardcoded tool names | Detection uses schema inspection only | Both files | ✅ |
| BR-14 | LOCAL_TOOLS execute locally | `routeToolCall()` checks `LOCAL_TOOLS.has(name)` | WrapperServer.ts:L93 | ✅ |
| BR-15 | Max body size = 1MB | `MAX_BODY_SIZE = 1024 * 1024` in readBody() | WrapperServer.ts:L17 | ✅ |
| BR-16 | Output proxy skips if result.isError | `proxyOutput()` checks `if (!result || result.isError) return result` | Base64ProxyService.ts:L78 | ✅ |
| BR-17 | Output proxy silent catch on parse/write failure | `proxyOutput()` outer `try {} catch { return result; }` | Base64ProxyService.ts:L88 | ✅ |

---

## 8. Non-Functional Design Decisions

| Category | Decision | Rationale |
|----------|----------|-----------|
| Synchronous I/O | `fs.readFileSync` / `fs.writeFileSync` | Local filesystem — sub-ms; avoids async complexity for single-file ops |
| Set-based lookup | `Set<string>` for proxy detection | O(1) lookup per tool call; rebuilt cheaply on tools/list |
| Immutable transforms | Spread operator `{ ...args }` / `{ ...tool }` | Never mutate incoming arguments — prevents side effects |
| Schema-driven | No hardcoded tool names | New backend tools auto-proxied; zero extension changes needed |
| Graceful degradation | Output proxy catch-all returns raw result | Proxy failure never blocks tool response to LLM |
| Localhost binding | `127.0.0.1` only | Security: not exposed to network; no auth needed |

---

## 9. Component Diagram

![Component Diagram](diagrams/component.png)

---

## 10. Appendix

### 10.1 File Size Summary

| File | Lines | Compliant (≤200) |
|------|-------|------------------|
| Base64ProxyService.ts | ~160 | ✅ |
| WrapperServer.ts | ~140 | ✅ |

### 10.2 Method Size Compliance

All methods are ≤20 lines of logic (excluding signature/closing brace). Largest methods:
- `proxyOutput`: ~15 lines
- `rewriteSingleSchema`: ~18 lines
- `handleDynamic`: ~12 lines

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture — Component layout and data flow | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component — Class diagram (Base64ProxyService + WrapperServer) | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |

