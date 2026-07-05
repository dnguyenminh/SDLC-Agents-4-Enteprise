# Functional Specification Document (FSD)

## SA4E Extension — F11: Webview Panels

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F11 |
| Title | Webview Panels (Dashboard/Analytics/Settings) |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F11.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA + TA Agent | Initiate document — full FSD for F11 Webview Panels |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of 9 webview panels within the SA4E VS Code extension. It details use cases, business rules, data specifications, UI layout, and API contracts for each panel.

### 1.2 Scope

All webview panels: KB Graph, Analytics, Quality, Security, Workflow, Tags, Impact, Settings, Dashboard. Covers rendering strategies (iframe vs custom HTML), message protocols, data flows, and error handling.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| CSP | Content Security Policy — browser security mechanism for webviews |
| MCP | Model Context Protocol — tool invocation for AI agents |
| SSE | Server-Sent Events — real-time push from server |
| Nonce | Cryptographic random for CSP script allowlisting |
| WebviewPanel | VS Code API panel displayed in editor area |
| KbEventBus | Event bus for KB changes via SSE subscription |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F11.docx |
| VS Code Webview API | https://code.visualstudio.com/api/extension-guides/webview |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The webview panels system consists of:
- **Extension Host** — Node.js process running VS Code extension logic
- **Webview Process** — Isolated Chromium renderer for each panel
- **MCP Server** — Local server providing KB and code intelligence data
- **Backend Server** — HTTP server providing admin UI for iframe panels

### 2.2 System Architecture

Two rendering strategies:

**Strategy A: Iframe Panels** (Graph, Dashboard, Tags, Quality, Analytics, Workflow)
- Panel HTML contains a single `<iframe>` pointing to `{backendUrl}/admin?embed=true&page={type}&token={token}`
- All UI rendered by backend server
- Extension only manages panel lifecycle and auth token refresh

**Strategy B: Custom HTML Panels** (Security, Impact, Settings)
- Panel HTML generated in extension with full CSP
- Data fetched via MCP tool invocations
- Message passing between webview and extension host

---

## 3. Functional Requirements

### 3.1 Feature: Panel Lifecycle Management

**Source:** BRD Story 1-9 (shared infrastructure)

#### 3.1.1 Description

All panels share a common lifecycle managed by `WebviewPanelManager`. Only one instance per PanelType exists at any time (singleton pattern).

#### 3.1.2 Use Case: Open Panel

**Use Case ID:** UC-01
**Actor:** Developer
**Preconditions:** SA4E extension is activated
**Postconditions:** Panel is visible and displaying data

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer executes command | | User triggers "SDLC: Open {Panel}" |
| 2 | | WebviewPanelManager.openPanel(type) | Manager receives request |
| 3 | | Check panels Map | Is panel already open? |
| 4 | | Factory creates panel | Instantiate correct subclass |
| 5 | | Panel.create() | Create VS Code WebviewPanel |
| 6 | | Panel.getHtml() | Generate HTML with CSP |
| 7 | | Panel.loadData() | Fetch initial data |
| 8 | | Webview renders | User sees panel content |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Panel already open | Step 3: panel.reveal() → skip to Step 8 |
| AF-02 | Panel was disposed externally | Step 3: remove stale reference → continue from Step 4 |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | loadData() fails (MCP unavailable) | Show error overlay with retry button |
| EF-02 | Auth token expired (iframe) | Receive auth_error message → refresh token → reload webview |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Only one instance per PanelType may exist at any time | Architecture decision |
| BR-02 | Panel must retain context when hidden (retainContextWhenHidden=true) | UX requirement |
| BR-03 | All panels must subscribe to server status changes | Resilience requirement |
| BR-04 | CSP must be set on all panels to prevent XSS | Security requirement |
| BR-05 | API keys must use SecretStorage, never plaintext | Security requirement |
| BR-06 | Iframe panels must include auth token in URL | Auth requirement |
| BR-07 | Panel disposal must clean up all subscriptions and timers | Memory management |

---

### 3.2 Feature: Settings Panel (LLM Configuration)

**Source:** BRD Story 8

#### 3.2.1 Description

The Settings panel provides a visual UI for configuring LLM providers, managing API keys securely, testing connections, and configuring backend/wrapper server URLs.

#### 3.2.2 Use Case: Configure LLM Provider

**Use Case ID:** UC-02
**Actor:** Developer
**Preconditions:** Settings panel is open
**Postconditions:** LLM provider configured and tested

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Select provider from dropdown | | User picks Anthropic/OpenAI/etc. |
| 2 | | Update workspace config | `kiroSdlc.llmProvider` = selected |
| 3 | | Load models for provider | Populate model dropdown |
| 4 | | Auto-test if key exists | Run connection test |
| 5 | Enter API key | | User types key |
| 6 | Click "Save API Key" | | User saves |
| 7 | | Store in SecretStorage | Key encrypted by VS Code |
| 8 | | Show success indicator | Green checkmark |
| 9 | Select model | | User picks model |
| 10 | | Update workspace config | `kiroSdlc.llmModel` = selected |
| 11 | Click "Test LLM" | | User tests |
| 12 | | Send test prompt | Call LLM API |
| 13 | | Display result | Pass/Fail + latency |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-03 | Provider is Ollama/ONNX (no API key needed) | Skip Steps 5-8, show Ollama URL config instead |
| AF-04 | User enables custom base URL | Uncheck "Use default URL" → enable URL input |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-03 | API key save fails | Show error toast with reason |
| EF-04 | LLM test fails | Show error with message + latency |
| EF-05 | Ollama server unreachable | Show "Connection failed: {error}" |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-08 | Supported providers: anthropic, openai, openrouter, lmstudio, ollama, onnx | Product requirement |
| BR-09 | API key stored per provider (separate secret keys) | Security |
| BR-10 | Connection test timeout: 5 seconds | UX |
| BR-11 | Settings panel is a true singleton (static instance) | Architecture |
| BR-12 | Model list is provider-specific and includes a default | UX |

#### 3.2.4 Data Specifications

**Input Data (Provider Config):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| provider | string (enum) | Yes | One of: anthropic, openai, openrouter, lmstudio, ollama, onnx | Selected LLM provider |
| apiKey | string | Conditional | Non-empty when provider needs key | API authentication key |
| baseUrl | string | No | Valid URL format | Custom API endpoint |
| model | string | Yes | Non-empty | Model identifier |
| ollamaUrl | string | Conditional | Valid URL | Ollama server endpoint |
| backendUrl | string | No | Valid URL | Backend MCP server URL |
| mcpPort | number | No | 1-65535 | MCP wrapper server port |
| enableMcpServer | boolean | No | - | Whether to start wrapper on activation |

**Output Data (State):**

| Field | Type | Description |
|-------|------|-------------|
| provider | string | Current active provider |
| model | string | Current selected model |
| hasKey | boolean | Whether API key exists for provider |
| backendUrl | string | Current backend URL |
| mcpPort | number | Current wrapper port |
| enableMcpServer | boolean | Whether wrapper is enabled |

#### 3.2.5 UI Specifications

**Screen: Settings Panel**

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | Provider Select | Dropdown | Yes | Changes visible sections | - |
| 2 | API Key Input | Password input | Conditional | Toggle show/hide | Non-empty |
| 3 | Save API Key | Button | Conditional | Stores to SecretStorage | Key must be entered |
| 4 | Clear Key | Button | Conditional | Deletes from SecretStorage | Confirmation implicit |
| 5 | Use Default URL | Checkbox | No | Disables/enables URL input | - |
| 6 | Base URL Input | Text input | No | Custom API endpoint | Valid URL |
| 7 | Model Select | Dropdown | Yes | Provider-specific models | - |
| 8 | Test LLM | Button | No | Sends test prompt | Provider + key configured |
| 9 | Backend URL | Text input | No | MCP server URL | Valid URL |
| 10 | MCP Port | Number input | No | Wrapper port | 1-65535 |
| 11 | Enable MCP Server | Checkbox | No | Auto-start toggle | - |
| 12 | Restart MCP Server | Button | No | Restart wrapper | - |

#### 3.2.6 API Contract (Message Protocol)

**Message: setProvider**
**Purpose:** Change active LLM provider

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | "setProvider" | Yes | Message type |
| provider | string | Yes | Provider identifier |

**Response: state**

| Field | Type | Description |
|-------|------|-------------|
| type | "state" | Response type |
| provider | string | Active provider |
| model | string | Active model |
| hasKey | boolean | Key exists |
| backendUrl | string | Backend URL |

**Message: saveApiKey**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | "saveApiKey" | Yes | Message type |
| provider | string | Yes | Provider for key |
| key | string | Yes | API key value |

**Response: keySaved**

| Field | Type | Description |
|-------|------|-------------|
| type | "keySaved" | Response type |
| provider | string | Provider |
| success | boolean | Whether save succeeded |
| error | string? | Error message if failed |

**Message: testLlm**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| type | "testLlm" | Yes | Message type |
| provider | string? | No | Override provider |
| baseUrl | string? | No | Override URL |

**Response: llmTestResult**

| Field | Type | Description |
|-------|------|-------------|
| type | "llmTestResult" | Response type |
| success | boolean | Test passed |
| message | string | Result message |
| latencyMs | number? | Response time |

---

### 3.3 Feature: Security Findings Panel

**Source:** BRD Story 4

#### 3.3.1 Description

Displays security vulnerabilities from code analysis, grouped by severity. Each finding links to source code location.

#### 3.3.2 Use Case: View Security Findings

**Use Case ID:** UC-03
**Actor:** Developer
**Preconditions:** Security panel is opened
**Postconditions:** Findings displayed grouped by severity

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Open Security panel | | Command triggered |
| 2 | | Call code_search MCP tool | query="security vulnerability", limit=50 |
| 3 | | Call mem_search MCP tool | query="security", type=ERROR_PATTERN, limit=20 |
| 4 | | Parse and merge results | Combine findings from both sources |
| 5 | | Group by severity | critical → high → medium → low |
| 6 | | Render HTML | Show badge bar + grouped findings |
| 7 | Click finding | | User selects an item |
| 8 | | Open file at line | Navigate editor to source |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-05 | No findings from code_search | Continue with mem_search results only |
| AF-06 | No findings at all | Show "No security issues found" |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-06 | code_search tool unavailable | Show error with retry |
| EF-07 | File referenced by finding doesn't exist | Silently skip navigation |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-13 | Severity mapping: "critical"→red, "high"→orange, "medium"→yellow, "low"→blue | UX |
| BR-14 | Unknown severity defaults to "medium" | Defensive coding |
| BR-15 | Findings from mem_search default to severity "medium" | Data quality |

---

### 3.4 Feature: Impact Analysis Panel

**Source:** BRD Story 7

#### 3.4.1 Description

Shows blast radius for a given code symbol. Displays affected files, callers, and related tests.

#### 3.4.2 Use Case: Analyze Symbol Impact

**Use Case ID:** UC-04
**Actor:** Developer
**Preconditions:** Code file is open with cursor on a symbol
**Postconditions:** Impact panel shows blast radius

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Trigger "Show Impact" command | | Cursor on symbol |
| 2 | | Get word under cursor | Default symbol from editor |
| 3 | | Show input box | Pre-filled with symbol |
| 4 | Confirm/edit symbol | | User confirms |
| 5 | | Call code_context MCP tool | symbol=selected |
| 6 | | Parse impact result | Extract files, callers, tests |
| 7 | | Render summary stats | N files, N callers, N tests |
| 8 | | Render detail sections | Clickable items |
| 9 | Click item | | User navigates |
| 10 | | Open file at line | Editor navigation |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-07 | No editor active (no cursor) | Input box with empty default |
| AF-08 | User cancels input | Abort, no panel opened |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-16 | Symbol input defaults to word under cursor | UX convenience |
| BR-17 | Empty impact = "No impact detected" message | UX |
| BR-18 | Impact panel is separate from PanelType (not in WebviewPanelManager) | Architecture |

---

### 3.5 Feature: Workflow Pipeline Visualization

**Source:** BRD Story 5

#### 3.5.1 Description

Renders the SDLC pipeline as a 3D force-directed graph using Three.js and 3d-force-graph library.

#### 3.5.2 Use Case: View Workflow Graph

**Use Case ID:** UC-05
**Actor:** Developer
**Preconditions:** Workflow panel opened
**Postconditions:** 3D graph visible with all pipeline nodes

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Open Workflow panel | | Command triggered |
| 2 | | Load SDLC_GRAPH_DEFINITION | Static graph data |
| 3 | | Send workflowData message | nodes + edges + metadata |
| 4 | | 3d-force-graph renders | 3D visualization |
| 5 | Click node | | User interacts |
| 6 | | Show node info panel | Agent details |

#### 3.5.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-19 | Graph data is static (from SDLC_GRAPH_DEFINITION) | Architecture |
| BR-20 | CSP must allow 'unsafe-eval' for Three.js | Technical constraint |
| BR-21 | Phase bar shows pipeline progress | UX |

---

### 3.6 Feature: Iframe Panels (Graph, Dashboard, Tags, Quality, Analytics)

**Source:** BRD Stories 1, 2, 3, 6, 9

#### 3.6.1 Description

These panels embed the backend server admin UI via iframe. The extension manages lifecycle, auth token, and server status overlay only.

#### 3.6.2 Use Case: View Iframe Panel

**Use Case ID:** UC-06
**Actor:** Developer
**Preconditions:** Backend server is running
**Postconditions:** Iframe loads backend admin page

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Open panel command | | User triggers |
| 2 | | Get backend URL from config | `kiroSdlc.backend.url` |
| 3 | | Get auth token | From authTokenProvider |
| 4 | | Build iframe src | `{url}/admin?embed=true&page={type}&token={token}` |
| 5 | | Set CSP: frame-src | Allow only backend origin |
| 6 | | Render iframe HTML | Full-screen iframe |
| 7 | | Listen for auth_error | From iframe postMessage |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-09 | No auth token available | Embed without token (may trigger auth_error) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-08 | Backend server not responding | Iframe shows loading message, fallback text visible |
| EF-09 | Auth error received from iframe | Refresh token → reload webview HTML |

#### 3.6.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-22 | Backend URL default: http://127.0.0.1:48721 | Configuration |
| BR-23 | CSP frame-src must match backend origin exactly | Security |
| BR-24 | Token URL-encoded in iframe src | Security |
| BR-25 | loadData() is no-op for iframe panels | Architecture |

---

## 4. Data Model

### 4.1 Message Types (WebviewToExtMessage)

| Message Type | Fields | Source Panel | Description |
|-------------|--------|--------------|-------------|
| ready | - | All | Webview loaded, request initial data |
| refresh | - | All | User requests data reload |
| filterByType | types: string[] | Graph | Filter nodes by entry type |
| filterByTier | tiers: string[] | Graph | Filter nodes by tier |
| filterByTag | tag: string, offset?, limit? | Tags | Filter entries by tag |
| nodeClick | entryId: number | Graph | Node selected |
| createTag | tag: string, category? | Tags | Create new tag |
| searchNodes | query: string | Graph | Search graph nodes |
| bulkAction | action, entryIds: number[] | Quality | Bulk archive/delete/review |
| createEntry | title, content, entryType | Dashboard | Create new KB entry |
| markReviewed | entryId: number | Dashboard | Mark entry as reviewed |
| manualRetry | - | All | User clicks retry after error |
| openFile | file: string, line: number | Security, Impact | Navigate to file |

### 4.2 Message Types (ExtToWebviewMessage)

| Message Type | Key Fields | Target Panel | Description |
|-------------|-----------|--------------|-------------|
| graphData | nodes, edges | Graph | Graph visualization data |
| dashboardData | healthScore, totalEntries, ... | Dashboard | Dashboard metrics |
| tagsData | taxonomy, popular | Tags | Tag management data |
| qualityData | stats, lowQuality, confidence | Quality | Quality scores |
| analyticsData | volume, popular, gaps, recommendations | Analytics | Usage analytics |
| filteredEntries | entries, total | Tags, Graph | Filtered KB entries |
| entryDetail | entry | Graph | Single entry details |
| serverStatus | status: connected/disconnected/failed | All | Server health |
| error | message, retryable | All | Error notification |

---

## 5. Integration Specifications

### 5.1 MCP Server Integration

| Attribute | Value |
|-----------|-------|
| Purpose | Provide KB data, code analysis results |
| Direction | Bidirectional (invoke tools, receive results) |
| Protocol | JSON-RPC over stdio |
| Frequency | On-demand (panel load + user action) |

**Tools Used:**

| Tool | Panels Using It | Purpose |
|------|----------------|---------|
| mem_search | Security, Graph, Tags | Search KB entries |
| mem_admin | Dashboard, Quality, Analytics | Admin operations (dashboard metrics) |
| code_search | Security | Find security findings |
| code_context | Impact | Get symbol impact data |

### 5.2 Backend Server Integration

| Attribute | Value |
|-----------|-------|
| Purpose | Serve admin UI for iframe panels |
| Direction | Outbound (iframe loads from backend) |
| Protocol | HTTPS (iframe src) |
| Frequency | On panel open/reload |
| Auth | Token in URL query parameter |

---

## 6. Processing Logic

### 6.1 Server Status Monitoring

**Trigger:** McpServerManager emits status change
**Input:** New status (connected/disconnected/crashed)
**Output:** All panels receive serverStatus message

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | McpServerManager detects status change | - |
| 2 | Map internal status to webview status | `mapServerStatusToWebview()` |
| 3 | WebviewPanelManager.notifyAllPanels() | Skip disposed panels |
| 4 | Each panel's webview shows/hides overlay | Based on status |

### 6.2 Auth Token Refresh (Iframe panels)

**Trigger:** Iframe sends `auth_error` postMessage
**Input:** auth_error message event
**Output:** Panel reloaded with fresh token

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Webview receives postMessage with auth_error | - |
| 2 | Forward to extension host | vscode.postMessage({type:'auth_error'}) |
| 3 | Execute kiroSdlc.refreshToken command | May fail if no auth provider |
| 4 | Regenerate panel HTML with new token | - |
| 5 | Set webview.html to reload iframe | - |

---

## 7. Security Requirements

### 7.1 Content Security Policy

| Panel Type | CSP Directive | Value |
|-----------|---------------|-------|
| Iframe panels | frame-src | Backend origin only |
| Iframe panels | default-src | 'none' |
| Iframe panels | style-src | 'unsafe-inline' |
| Custom panels | script-src | 'nonce-{random}' |
| Custom panels | style-src | cspSource + 'unsafe-inline' |
| Custom panels | img-src | cspSource + data: |
| Custom panels | connect-src | 'none' |
| Workflow panel | script-src | 'nonce-{random}' 'unsafe-eval' |

### 7.2 Secret Management

| Data Type | Storage | Access |
|-----------|---------|--------|
| API Keys | VS Code SecretStorage | SettingsMessageHandler only |
| Auth Token | In-memory (static provider) | BasePanel.authTokenProvider |
| Backend URL | VS Code workspace config | Any panel |

---

## 8. Non-Functional Requirements

| Category | Requirement | Acceptance Criteria |
|----------|-------------|---------------------|
| Performance | Panel creation < 200ms | Measured from command to first paint |
| Performance | Data load < 2s | MCP tool response time |
| Memory | Per-panel < 50MB | Verified via VS Code memory inspector |
| Resilience | Graceful degradation on server down | Error overlay + retry within 1 click |
| Compatibility | VS Code 1.85+ | Test on minimum supported version |

---

## 9. Error Handling

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| MCP server unavailable | Warning | "Server disconnected. Reconnecting..." | Auto-retry with overlay |
| MCP server failed permanently | Critical | "Server unavailable. Click to retry." | Show retry button |
| Backend iframe load failure | Warning | "Loading Dashboard UI from backend..." | Fallback text visible |
| API key save failure | Warning | "Failed to save key: {reason}" | Error shown in status indicator |
| LLM test failure | Info | "Test failed: {reason}" | Show test result area |
| File not found (security/impact) | Info | (silent) | Skip navigation, no error shown |
| Tool invocation error | Warning | "{Panel} scan failed: {error}" | Error message + retry button |

---

## 10. Appendix

### Panel Type Mapping

| PanelType | ViewType Constant | Title | Category |
|-----------|------------------|-------|----------|
| graph | kiroKbGraph | KB Graph | Iframe |
| dashboard | kiroKbDashboard | KB Dashboard | Iframe |
| tags | kiroKbTags | KB Tags | Iframe |
| quality | kiroKbQuality | KB Quality | Iframe |
| analytics | kiroKbAnalytics | KB Analytics | Iframe |
| workflow | kiroWorkflowGraph | SDLC Workflow Graph | Custom (3D) |

**Standalone panels (not in WebviewPanelManager):**

| Class | ViewType | Title | Category |
|-------|---------|-------|----------|
| SecurityPanel | kiroSecurityPanel | Security Findings | Custom |
| ImpactPanel | kiroImpactPanel | Impact Analysis | Custom |
| SettingsPanel | kiroSettingsPanel | SDLC Pipeline Settings | Custom |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Panel Open | [sequence-panel-open.png](diagrams/sequence-panel-open.png) | [sequence-panel-open.drawio](diagrams/sequence-panel-open.drawio) |
| 3 | State — Panel Lifecycle | [state-panel-lifecycle.png](diagrams/state-panel-lifecycle.png) | [state-panel-lifecycle.drawio](diagrams/state-panel-lifecycle.drawio) |
