# Functional Specification Document (FSD)
**Ticket**: SA4E-124
**Project**: SDLC Agents 4 Enterprise
**Author**: BA-Agent & TA-Agent
**Status**: APPROVED
**Date**: 2026-07-11

---

## 1. System Context & Functional Scope

The MCP Bridge acts as a critical middleman between the LangGraph LLM nodes (clients) and the Backend MCP Server (tools). This feature introduces an automatic interceptor mechanism within the `McpBridge` to translate file payloads on the fly. 

The primary objective is to save LLM tokens and improve system reliability. Crucially, the backend remains completely unaware of the local file system on the client. It continues to expect and return Base64 strings, while the LLM exclusively handles local file paths.

---

## 2. End-to-End Data Flow

The following diagram illustrates the complete data flow of a tool invocation that involves a file payload.

![E2E Data Flow](diagrams/fsd_data_flow.png)
*Figure 1: The E2E Data Flow demonstrates how the LLM provides a file path, which the McpBridge intercepts, encodes, and passes to the Backend as Base64.*

### 2.1. Discovery Phase
When the LLM initializes and requests available tools (via `find_tools`), the `McpBridge` scans the returned tool schemas. Any schema property indicating a Base64 payload is dynamically rewritten to expect a file path instead.

### 2.2. Execution Phase
When the LLM decides to use a tool, it provides the file path. The `McpBridge` intercepts the request, reads the file from the local disk, encodes it into Base64, and forwards it to the Backend.

---

## 3. Detailed Functional Requirements (FRs)

### 3.1. Schema Interceptor (FR-01 & FR-02)

![Schema Transform](diagrams/fsd_schema_transform.png)
*Figure 2: The Schema Transform process converts Base64 properties into Path properties.*

- **FR-01 (Detection)**: The system MUST detect any tool input parameter where the property name contains the string `base64`.
- **FR-02 (Transformation)**: The system MUST rename the detected parameter by appending the suffix `_as_path`. 
- **FR-03 (Metadata Update)**: The system MUST update the property's `description` to explicitly instruct the LLM: *"Absolute path to the local file (Proxy will convert to base64 automatically)"*.

### 3.2. Payload Request Interceptor (FR-04)

- **FR-04 (Request Scanning)**: The system MUST recursively scan all outgoing MCP `callTool` arguments for keys ending with `_as_path`.
- **FR-05 (File Encoding)**: Upon detecting an `_as_path` key, the system MUST:
  1. Extract the original key name by stripping the suffix.
  2. Read the file synchronously from the local disk at the provided path.
  3. Encode the file buffer into a Base64 string.
  4. Inject the Base64 string into the payload under the original key name.
  5. Delete the `_as_path` key from the payload.

### 3.3. Payload Response Interceptor (FR-06)

![Response Interceptor](diagrams/fsd_response_interceptor.png)
*Figure 3: The Response Interceptor catches Base64 payloads returning from the Backend, decodes them, and saves them to disk.*

- **FR-06 (Response Parsing)**: The system MUST intercept all tool responses. If a response string can be parsed as a valid JSON object containing the keys `_base64_file` and `_filename`:
  1. The system MUST decode the `_base64_file` string back into a binary buffer.
  2. The system MUST ensure the `<workspaceRoot>/documents/tmp/` directory exists.
  3. The system MUST save the buffer to disk using the provided `_filename`.
  4. The system MUST return a success message string (containing the local file path) to the LLM, replacing the original JSON payload.

---

## 4. Non-Functional Requirements (NFRs)

- **NFR-01 (Performance)**: The proxy interception (scanning object keys and replacing them) must be highly performant, executing in under $10ms$ (excluding file I/O operations).
- **NFR-02 (Extensibility)**: The proxy must be generic. It must automatically support any newly added dynamic tool discovered via `find_tools` without requiring manual code changes in the proxy layer.
- **NFR-03 (Graceful Degradation)**: If a file path provided by the LLM is invalid or missing, the system must log the error (e.g., `console.error`) and silently drop the key, allowing the backend tool to reject the request cleanly rather than crashing the Extension Host.

---

## 5. Data Dictionary & API Contracts

| Field Name | Type | Direction | Description |
|------------|------|-----------|-------------|
| `*_as_path` | String | LLM -> Proxy | A dynamic proxy key exposed to the LLM representing a local absolute file path. |
| `*_base64*` | String | Proxy -> Backend | The original key used by the Backend to receive Base64 payloads (e.g., `image_base64`). |
| `_base64_file` | String | Backend -> Proxy | The standard contract key used by the Backend to return Base64 files to the client. |
| `_filename` | String | Backend -> Proxy | The recommended filename provided by the Backend for saving the output. |

---

## 6. Edge Cases & Exception Handling

### 6.1. Corrupted File Paths
If the LLM hallucinates a file path or attempts to read a directory instead of a file, `fs.readFileSync` will throw an exception. The proxy MUST catch this exception, log a warning, and proceed with the rest of the payload intact.

### 6.2. Non-JSON Responses
If a backend tool returns a plain string (e.g., `"Success"` or a raw markdown table) instead of a JSON object, the `JSON.parse` in the Response Interceptor will throw a `SyntaxError`. The proxy MUST catch this silently and return the raw string to the LLM untouched.

---

## 7. Diagram Index

| Diagram | Description | Status |
|---------|-------------|--------|
| `diagrams/fsd_data_flow.drawio` | E2E Data flow of the Base64 interception | DONE |
| `diagrams/fsd_schema_transform.drawio` | Schema transformation mapping | DONE |
| `diagrams/fsd_response_interceptor.drawio` | Response interception logic | DONE |
