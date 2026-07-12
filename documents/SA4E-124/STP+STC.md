# Software Test Plan & Cases (STP+STC)
**Ticket**: SA4E-124
**Project**: SDLC Agents 4 Enterprise
**Author**: QA-Agent
**Status**: APPROVED
**Date**: 2026-07-11

---

## 1. Test Strategy (STP)

The testing strategy focuses on Unit and Integration testing, specifically targeting the `McpBridge` layer and its interactions with the `McpServerManager`. Because the AI Agent operates strictly via prompts, the goal is to mathematically guarantee that no Base64 strings ever reach the LLM Context Window when handling files.

![Test Strategy](diagrams/stp_test_strategy.png)
*Figure 1: The Test Strategy covers Unit, Integration, and E2E verification phases.*

### 1.1. Test Environment Setup
The tests will be conducted entirely within the local VSCode Workspace. We will utilize a "Mock MCP Server" capable of emitting predefined `{"_base64_file": "..."}` responses to simulate the backend.

![Test Environment](diagrams/stp_test_environment.png)
*Figure 2: The Test Environment illustrates the interactions between the local VSCode workspace and the Mock Server.*

---

## 2. Test Cases (STC)

### 2.1. Discovery Interceptor (Schema)

**TC-01: Verify Schema Dynamic Rename**
- **Pre-conditions**: A mock tool schema is loaded, containing `image_base64: { type: "string" }` and `required: ["image_base64"]`.
- **Steps**:
  1. Trigger `discoverTools()`.
  2. Parse the returned JSON string.
- **Expected Result**: 
  - The property is renamed to `image_base64_as_path`.
  - The description explicitly mentions "Absolute path to the local file".
  - The `required` array is updated to demand `image_base64_as_path`.

| ID | Test Case | Pre-conditions | Steps | Expected Result | Notes |
|---|---|---|---|---|---|
| TC-13 | Missing Required Array | Tool schema lacks `required` array | 1. Trigger `discoverTools()`. | Schema is safely rewritten without crashing `indexOf`. | `required` is undefined |
| TC-14 | Multiple Base64 Keys | Tool has multiple `base64` properties | 1. Trigger `discoverTools()`. | Both properties get the `_as_path` suffix. | Nested properties (out of scope) |

### 2.2. Payload Request Interceptor

**TC-02: Valid File Conversion**
- **Pre-conditions**: A dummy file `test.png` exists in the local workspace.
- **Steps**:
  1. Call `mcpBridge.callTool` with `{ image_base64_as_path: "/path/to/test.png" }`.
- **Expected Result**: 
  - The proxy successfully reads the file.
  - The backend receives `{ image_base64: "iVBORw0KGgoAAAANSU..." }`.
  - The `_as_path` key is removed.

**TC-03: Missing File Graceful Degradation (Edge Case)**
- **Pre-conditions**: The LLM hallucinates an invalid path `/invalid/path/missing.png`.
- **Steps**:
  1. Call `mcpBridge.callTool` with `{ file_base64_as_path: "/invalid/path/missing.png" }`.
- **Expected Result**: 
  - The proxy catches the `ENOENT` exception internally.
  - A `console.error` logs the failure.
  - The backend receives a payload without the key, failing cleanly via validation rather than crashing the extension.

**TC-06: Nested Object Conversion**
- **Pre-conditions**: Payload contains an object within an object: `{ data: { image_base64_as_path: "/path/to/test.png" } }`.
- **Expected Result**: The proxy deeply traverses the object, converts the file, and removes the nested key.

**TC-07: Array Payload Conversion**
- **Pre-conditions**: Payload contains an array: `[{ image_base64_as_path: "/path/to/test.png" }]`.
- **Expected Result**: The proxy traverses the array elements, converts the file, and preserves the array structure.

**TC-08: Directory instead of File Exception (EISDIR)**
- **Pre-conditions**: User provides a directory path `/documents`.
- **Expected Result**: `fs.readFileSync` throws an error. The proxy catches it and drops the key silently.

**TC-09: Multiple Base64 Keys**
- **Pre-conditions**: Payload contains `image1_base64_as_path` and `image2_base64_as_path`.
- **Expected Result**: Both files are converted independently.

### 2.3. Payload Response Interceptor

**TC-04: Valid Base64 Response Decoding**
- **Pre-conditions**: The backend returns a valid JSON string: `{"_base64_file": "SGVsbG8=", "_filename": "hello.txt"}`.
- **Steps**:
  1. The proxy processes the return string via `interceptResponse`.
- **Expected Result**: 
  - A file `hello.txt` is created in `<workspace>/documents/tmp/`.
  - The proxy returns the string: `"File saved successfully to: <workspace>/documents/tmp/hello.txt"`.
  - The LLM receives this string and can reference the file moving forward.

**TC-05: Non-JSON Response Handling (Edge Case)**
- **Pre-conditions**: The backend returns plain text: `"Operation completed successfully"`.
- **Steps**:
  1. The proxy processes the return string via `interceptResponse`.
- **Expected Result**: 
  - The `JSON.parse` fails silently.
  - The proxy returns `"Operation completed successfully"` untouched.

**TC-10: Missing Filename Fallback**
- **Pre-conditions**: The backend returns `{"_base64_file": "SGVsbG8="}` without `_filename`.
- **Expected Result**: File is saved using the fallback format `output_${Date.now()}.bin`.

**TC-11: Workspace Undefined Fallback**
- **Pre-conditions**: VSCode workspace is not opened.
- **Expected Result**: Proxy cannot find `workspaceRoot`. It safely returns the original raw JSON string.

**TC-12: Malformed Base64 String**
- **Pre-conditions**: The backend returns `{"_base64_file": "!@#$%^&*()"}`.
- **Expected Result**: `Buffer.from` attempts decoding. The file is created (potentially corrupt), preventing extension crash.

---

## 3. Diagram Index

| Diagram | Description | Status |
|---------|-------------|--------|
| `diagrams/stp_test_strategy.drawio` | QA Test Strategy overview | DONE |
| `diagrams/stp_test_environment.drawio` | QA Test Environment setup | DONE |
