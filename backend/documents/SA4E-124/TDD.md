# Technical Design Document (TDD)
**Ticket**: SA4E-124
**Project**: SDLC Agents 4 Enterprise
**Author**: SA-Agent
**Status**: APPROVED
**Date**: 2026-07-11

---

## 1. Architectural Overview

The Tool Payload Proxy is implemented entirely within the Extension Client's `McpBridge` class, which serves as a wrapper around the core `McpServerManager`. This centralization guarantees that any LangGraph node calling any tool will transparently inherit the Base64 interception logic.

![Architecture Diagram](diagrams/tdd_architecture.png)
*Figure 1: The McpBridge intercepts calls from the BaseNode before they reach the McpServerManager.*

---

## 2. Core Components & Methods

### 2.1. `base-node.ts: discoverTools()`
This method invokes `find_tools` and parses the JSON string containing tool schemas. 
**Algorithm:**
- Iterate through each tool in the array.
- Extract `inputSchema.properties`.
- Check if any key includes the substring `"base64"`.
- If a match is found:
  1. Construct a new key: `${key}_as_path`.
  2. Map the new key to a `{ type: "string" }` object with a specialized description.
  3. Delete the original key.
  4. Update the `required` array by swapping the original key name with the new key name.
- Serialize the modified object back to a string and return it to the LLM.

### 2.2. `mcp-bridge.ts: interceptRequestArgs()`

This private method intercepts the arguments object before passing it to the MCP Server.

![Request Sequence](diagrams/tdd_sequence_request.png)
*Figure 2: The Request Sequence shows how the proxy intercepts the arguments, reads the file, converts to Base64, and forwards the modified payload.*

**Implementation Details:**
- **Signature**: `private interceptRequestArgs(args: Record<string, unknown>): Record<string, unknown>`
- **Recursion**: The function uses deep recursion to support nested tool schemas. If an argument is an object, it calls itself.
- **File I/O**: It utilizes `fs.readFileSync(path, "base64")` to efficiently read the binary data and encode it in memory.
- **Exception Handling**: A `try-catch` block surrounds the `fs` call. If it fails, a `console.error` is triggered, and the key is simply deleted from the payload to prevent sending invalid data to the backend.

### 2.3. `mcp-bridge.ts: interceptResponse()`

This private method intercepts the string response returning from the MCP Server.

![Response Sequence](diagrams/tdd_sequence_response.png)
*Figure 3: The Response Sequence shows how the proxy catches JSON payloads, decodes the Base64 string, and saves it to a physical file.*

**Implementation Details:**
- **Signature**: `private interceptResponse(resultStr: string): string`
- **Schema Validation**: It relies on a `try-catch` wrapper around `JSON.parse`. It explicitly checks for the `typeof resultObj._base64_file === "string"` to confirm the payload type.
- **Workspace Resolution**: It leverages `vscode.workspace.workspaceFolders?.[0]?.uri.fsPath` to dynamically resolve the user's current project directory.
- **Directory Creation**: It executes `fs.mkdirSync(tmpDir, { recursive: true })` to ensure the `documents/tmp/` directory exists.
- **Buffer Decoding**: It converts the string back to binary using `Buffer.from(resultObj._base64_file, "base64")` and writes it via `fs.writeFileSync`.

---

## 3. Complexity Analysis

### 3.1. Time Complexity
- **`interceptRequestArgs`**: $O(K + S)$, where $K$ is the number of keys in the argument tree, and $S$ is the size of the file being read. The recursive object traversal is extremely fast for standard JSON structures.
- **`interceptResponse`**: $O(L)$, where $L$ is the length of the response string. The time is dominated by `JSON.parse` and the Base64-to-Buffer decoding.

### 3.2. Space Complexity
- **Peak Memory**: $O(M)$, where $M$ is the size of the Base64 string. The proxy temporarily holds the Base64 string in RAM before it is passed to the backend (or written to disk). For very large files (>100MB), this could impact Extension Host memory, though standard tool outputs (diagrams, small datasets) rarely exceed 5MB.

---

## 4. Dependencies
- **Node.js Built-ins**: `fs`, `path` for local file system manipulation.
- **VSCode API**: `vscode` namespace to access workspace configurations.
- **McpServerManager**: The core backend connection pool.

---

## 5. Diagram Index

| Diagram | Description | Status |
|---------|-------------|--------|
| `diagrams/tdd_architecture.drawio` | Architecture of McpBridge Interceptors | DONE |
| `diagrams/tdd_sequence_request.drawio` | Sequence diagram for Request Interception | DONE |
| `diagrams/tdd_sequence_response.drawio` | Sequence diagram for Response Interception | DONE |
