# Business Requirements Document (BRD)

## SA4E Extension — F11: Webview Panels

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F11 |
| Title | Webview Panels (Dashboard/Analytics/Settings) |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Pattern | Plugin (VS Code Extension) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initiate document — F11 Webview Panels feature |

---

## 1. Introduction

### 1.1 Scope

This feature implements multiple webview panels within the SA4E VS Code extension, providing visual dashboards for knowledge base management, code quality analytics, security findings, workflow visualization, and LLM provider configuration. Each panel operates as a `WebviewViewProvider` or `WebviewPanel` within the VS Code host environment.

**Panels in scope:**
1. **KB Graph Panel** — Interactive graph visualization of knowledge base entries and relationships
2. **Analytics Panel** — Usage statistics, tool call metrics, search volume trends
3. **Quality Panel** — Code quality scores, complexity grades, confidence analysis
4. **Security Panel** — Vulnerability findings grouped by severity with OWASP categorization
5. **Workflow Panel** — SDLC pipeline graph visualization (LangGraph nodes/edges)
6. **Tags Panel** — KB tags management with taxonomy tree and CRUD operations
7. **Impact Panel** — Code change blast radius analysis (callers, affected files, tests)
8. **Settings Panel** — LLM provider configuration (API keys, base URLs, model selection)
9. **Dashboard Panel** — KB health overview, recommendations, recent entries

### 1.2 Out of Scope

- Backend server UI (rendered via iframe from MCP server — pre-existing)
- Chat panel (covered by F8-chat-panel)
- Login/authentication panel (covered by F9-auth-sso)
- Code intelligence indexing logic (covered by F2/F5)

### 1.3 Preliminary Requirements

- VS Code Extension API v1.85+ (webview panel support)
- MCP server running locally (provides data via tools: `mem_search`, `mem_admin`, `code_search`, `code_context`)
- Backend server running at configurable URL (iframe panels load from this)
- KbEventBus for real-time SSE event subscription

---

## 2. Business Requirements

### 2.1 High Level Process Map

The webview panels serve as the visual layer for the SA4E extension. Users interact with panels through VS Code commands or sidebar icons. Panels fetch data from the MCP server (via `McpServerManager.invokeTool()`) or embed the backend admin UI via iframe.

**Two rendering strategies:**
- **Iframe Panels** (Graph, Dashboard, Tags, Quality, Analytics, Workflow) — embed backend server admin UI
- **Custom HTML Panels** (Security, Impact, Settings) — render custom HTML with VS Code theming

### 2.2 List of User Stories

| # | Story / Use Case | Priority | Source |
|---|-----------------|----------|--------|
| 1 | As a developer, I want to see KB entries as an interactive graph so I can understand relationships between knowledge items | MUST HAVE | F11 |
| 2 | As a developer, I want to view usage analytics (search volume, popular queries, gaps) so I can improve KB coverage | MUST HAVE | F11 |
| 3 | As a developer, I want to see code quality scores and complexity grades so I can prioritize refactoring | MUST HAVE | F11 |
| 4 | As a developer, I want to view security vulnerabilities grouped by severity so I can prioritize fixes | MUST HAVE | F11 |
| 5 | As a developer, I want to visualize the SDLC workflow pipeline as a 3D force-directed graph so I can understand agent interactions | SHOULD HAVE | F11 |
| 6 | As a developer, I want to manage KB tags (create, browse, filter) so I can organize knowledge items | MUST HAVE | F11 |
| 7 | As a developer, I want to analyze the blast radius of code changes so I can assess risk before refactoring | SHOULD HAVE | F11 |
| 8 | As a developer, I want to configure LLM providers (API keys, models, base URLs) from a visual settings panel so I don't need to edit JSON config files | MUST HAVE | F11 |
| 9 | As a developer, I want a dashboard overview of KB health (total entries, quality average, stale count) so I can monitor the knowledge base at a glance | MUST HAVE | F11 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** User opens VS Code with SA4E extension activated

**Step 2:** User triggers a panel via command palette (`Ctrl+Shift+P` → "SDLC: Open {Panel}") or sidebar icon

**Step 3:** `WebviewPanelManager` checks if panel is already open (singleton per type)
- If open → reveal existing panel
- If not open → create new panel instance via factory

**Step 4:** Panel renders HTML (iframe or custom) with CSP headers

**Step 5:** Panel calls `loadData()` to fetch initial data from MCP server or backend

**Step 6:** User interacts with panel (filters, clicks, edits)

**Step 7:** Panel sends messages to extension host via `vscode.postMessage()`

**Step 8:** Extension host processes message and may invoke MCP tools or update config

**Step 9:** Extension host sends response back via `panel.webview.postMessage()`

**Step 10:** Panel updates UI with new data

> **Note:** Panels auto-subscribe to server status changes. If MCP server disconnects, an overlay shows reconnection status.

![Business Flow](diagrams/business-flow.png)

---

#### STORY 1: KB Graph Visualization

> As a developer, I want to see KB entries as an interactive graph so I can understand relationships between knowledge items.

**Requirement Details:**

1. Graph renders nodes (KB entries) colored by type (DECISION=blue, ERROR_PATTERN=red, ARCHITECTURE=purple, etc.)
2. Node size reflects quality score or tier importance
3. Edges represent relationships between entries (references, dependencies)
4. Graph is interactive: pan, zoom, click nodes for detail
5. Filtering by entry type and tier supported

**Acceptance Criteria:**

1. GIVEN the KB Graph panel is opened, WHEN data loads, THEN nodes appear with correct colors per NODE_TYPE_COLORS mapping
2. GIVEN nodes are displayed, WHEN user clicks a node, THEN entry detail is shown in a side panel or tooltip
3. GIVEN the graph is displayed, WHEN user applies type filter, THEN only matching nodes are visible
4. GIVEN the MCP server is disconnected, WHEN panel is opened, THEN a disconnection overlay is shown with retry option

---

#### STORY 2: Usage Analytics

> As a developer, I want to view usage analytics so I can improve KB coverage.

**Requirement Details:**

1. Display search volume over time (line chart)
2. Show popular queries with hit counts
3. Highlight content gaps (queries with no good results)
4. Provide recommendations for new content to create
5. Real-time updates via KbEventBus SSE subscription with polling fallback

**Acceptance Criteria:**

1. GIVEN Analytics panel is opened, WHEN data loads, THEN search volume chart renders with date x-axis
2. GIVEN popular queries are displayed, THEN they are sorted by count descending
3. GIVEN gaps are identified, THEN each gap shows a suggestion for content to create
4. GIVEN KbEventBus emits a new search event, THEN analytics update within 5 seconds

---

#### STORY 3: Code Quality Scores

> As a developer, I want to see code quality scores and complexity grades so I can prioritize refactoring.

**Requirement Details:**

1. Display quality score histogram (distribution of scores across entries)
2. Show low-quality entries table with score, title, type, creation date
3. Confidence statistics (average, distribution)
4. Bulk actions on low-quality entries (archive, delete, mark for review)
5. Real-time updates via KbEventBus

**Acceptance Criteria:**

1. GIVEN Quality panel is opened, THEN quality score average and median are displayed
2. GIVEN low-quality entries exist, THEN they appear sorted by score ascending (worst first)
3. GIVEN user selects multiple entries, WHEN bulk action "archive" is clicked, THEN entries are archived
4. GIVEN a new entry is ingested, THEN quality stats refresh automatically

---

#### STORY 4: Security Findings

> As a developer, I want to view security vulnerabilities grouped by severity so I can prioritize fixes.

**Requirement Details:**

1. Fetch findings via `code_search` MCP tool (kind=security_finding) and `mem_search` (type=ERROR_PATTERN)
2. Group findings by severity: Critical (red), High (orange), Medium (yellow), Low (blue)
3. Each finding shows: title, file path, line number, description, remediation suggestion
4. Clicking a finding opens the file at the specific line in VS Code editor
5. Summary badge bar shows count per severity

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| id | string | Yes | Unique finding identifier | "SEC-001" |
| severity | enum | Yes | critical/high/medium/low | "high" |
| title | string | Yes | Short description | "SQL Injection Risk" |
| file | string | Yes | File path | "src/db/query.ts" |
| line | number | Yes | Line number | 42 |
| description | string | No | Detailed explanation | "User input not sanitized..." |
| remediation | string | No | Fix suggestion | "Use parameterized queries" |

**Acceptance Criteria:**

1. GIVEN Security panel is opened, WHEN findings load, THEN they are grouped by severity with color-coded headers
2. GIVEN a finding is displayed, WHEN user clicks it, THEN VS Code opens the file at that line
3. GIVEN no findings exist, THEN a "No security issues found" message is displayed
4. GIVEN MCP tool `code_search` fails, THEN an error message with retry button is shown

---

#### STORY 5: Workflow Pipeline Graph

> As a developer, I want to visualize the SDLC workflow pipeline as a 3D force-directed graph.

**Requirement Details:**

1. Render LangGraph pipeline nodes (agents: BA, TA, SA, QA, DEV, DevOps) and edges (data flow)
2. 3D force-directed layout using Three.js + 3d-force-graph library
3. Nodes colored by phase/type, edges show conditional routing
4. Phase progress bar at top showing current pipeline position
5. Click node to see agent details (responsibilities, inputs/outputs)
6. Refresh button to reload graph data

**Acceptance Criteria:**

1. GIVEN Workflow panel is opened, THEN 3D graph renders with all SDLC nodes
2. GIVEN nodes are displayed, WHEN user clicks a node, THEN agent detail info panel appears
3. GIVEN user clicks Refresh, THEN graph data reloads from `SDLC_GRAPH_DEFINITION`

---

#### STORY 6: KB Tags Management

> As a developer, I want to manage KB tags so I can organize knowledge items.

**Requirement Details:**

1. Display tag taxonomy tree (categories with tags)
2. Show popular tags with usage count
3. Create new tags with optional category assignment
4. Filter KB entries by tag
5. Real-time updates via KbEventBus

**Acceptance Criteria:**

1. GIVEN Tags panel is opened, THEN taxonomy tree displays all categories and tags
2. GIVEN user creates a new tag, THEN it appears in the taxonomy immediately
3. GIVEN user clicks a tag, THEN filtered entries for that tag are displayed
4. GIVEN a popular tags section exists, THEN tags are sorted by count descending

---

#### STORY 7: Impact Analysis

> As a developer, I want to analyze the blast radius of code changes.

**Requirement Details:**

1. User selects a symbol (function, class, method) — defaults to word under cursor
2. Panel calls `code_context` MCP tool with the symbol name
3. Display: affected files, callers, related tests
4. Summary stats: X files, Y callers, Z tests
5. Click any item to navigate to file/line in editor

**Acceptance Criteria:**

1. GIVEN user triggers impact analysis, WHEN a symbol is provided, THEN impact data loads
2. GIVEN impact data is displayed, THEN summary shows affected files count, callers count, tests count
3. GIVEN caller items are displayed, WHEN user clicks one, THEN editor opens at that file/line
4. GIVEN no impact is detected, THEN "No impact detected" message is shown

---

#### STORY 8: Settings Panel (LLM Configuration)

> As a developer, I want to configure LLM providers from a visual settings panel.

**Requirement Details:**

1. Provider selection dropdown: Anthropic, OpenAI, OpenRouter, LM Studio, Ollama, ONNX
2. API key management: save (to VS Code SecretStorage), clear, show/hide toggle
3. Base URL configuration: use default checkbox, custom URL input
4. Model selection dropdown (populated per provider)
5. Connection test button with latency display
6. Backend MCP server URL configuration
7. MCP wrapper server port configuration + enable/disable toggle
8. Tab-based layout: "LLM Provider" tab + "Server Settings" tab
9. Singleton pattern — only one instance open at a time

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| provider | enum | Yes | LLM provider identifier | "anthropic" |
| apiKey | string | Conditional | API key (not needed for Ollama/ONNX) | "sk-..." |
| baseUrl | string | No | Custom base URL | "https://api.custom.com" |
| model | string | Yes | Model identifier | "claude-sonnet-4-20250514" |
| backendUrl | string | No | Backend MCP server URL | "http://127.0.0.1:48721" |
| mcpPort | number | No | Wrapper server port | 9181 |

**Acceptance Criteria:**

1. GIVEN Settings panel is opened, THEN current provider/model/key state loads from config
2. GIVEN user selects a provider, THEN model dropdown updates with available models for that provider
3. GIVEN user saves an API key, THEN it's stored securely in VS Code SecretStorage
4. GIVEN user clicks "Test LLM", THEN a test prompt is sent and result (pass/fail + latency) is displayed
5. GIVEN user changes backend URL, THEN it's persisted to workspace configuration
6. GIVEN user clicks "Clear Key", THEN the API key is deleted from SecretStorage
7. GIVEN user enables "Use default URL" checkbox, THEN base URL input is disabled

---

#### STORY 9: Dashboard Overview

> As a developer, I want a dashboard overview of KB health.

**Requirement Details:**

1. Display key metrics: health score, total entries, quality average, stale count, unowned count
2. Show recommendations for KB maintenance actions
3. Display entries pending review with overdue days
4. Recent entries list with type and creation date
5. Distribution charts: by type and by tier
6. Trend line showing entry count over time

**Acceptance Criteria:**

1. GIVEN Dashboard panel is opened, THEN health metrics display with current values
2. GIVEN recommendations exist, THEN they are listed with priority indicators
3. GIVEN stale entries exist, THEN overdue review items show days overdue
4. GIVEN trend data is available, THEN a trend chart renders showing entry growth

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| VS Code Extension API | System | Webview panel creation, message passing, secret storage |
| MCP Server (local) | Infrastructure | Provides data via tool invocations (mem_search, mem_admin, code_search, code_context) |
| Backend Server | Infrastructure | Serves admin UI for iframe panels (http://127.0.0.1:48721/admin) |
| KbEventBus | System | SSE event subscription for real-time panel updates |
| Three.js + 3d-force-graph | Library | 3D rendering for Workflow panel |
| CSP Headers | Security | Content Security Policy for webview isolation |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility |
|------|-------------|----------------|
| Developer | Extension Team | Implement panels, maintain webview infrastructure |
| End User | VS Code users | Use panels for KB management, code analysis, settings |
| Product Owner | Architecture Team | Define panel features, prioritize improvements |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| MCP server unavailable | High | Medium | Show error overlay with retry; polling fallback |
| Webview memory usage with many panels open | Medium | Low | Panels are singletons; retain context only when hidden |
| CSP violations blocking functionality | High | Low | Carefully configured per-panel CSP policies |
| Backend iframe fails due to auth token expiry | Medium | Medium | Auto-refresh token on auth_error message |

### 5.2 Assumptions

- MCP server is running on localhost during extension usage
- Backend server admin UI supports `embed=true` query param for iframe embedding
- VS Code SecretStorage API is available for API key persistence
- Users have network access to external LLM providers (for Settings panel testing)

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Panel startup < 200ms | Panels must render initial HTML within 200ms of command invocation |
| Performance | Data load < 2s | Initial data fetch from MCP server must complete within 2 seconds |
| Memory | Per-panel < 50MB | Each webview panel should not exceed 50MB memory usage |
| Security | CSP enforcement | All panels must have Content-Security-Policy meta tags preventing XSS |
| Security | Secret storage | API keys MUST be stored in VS Code SecretStorage, NEVER in plaintext config |
| Accessibility | Keyboard navigation | All interactive elements must be reachable via Tab key |
| Resilience | Graceful degradation | If MCP server is down, panels show informative error with retry option |
| Compatibility | VS Code 1.85+ | All panels must work with VS Code 1.85 and later |

---

## 7. Appendix

### Glossary

| Term | Definition |
|------|------------|
| WebviewPanel | VS Code API for displaying custom HTML content in an editor tab |
| WebviewViewProvider | VS Code API for displaying webview in sidebar or panel area |
| CSP | Content Security Policy — restricts what resources webview can load |
| MCP | Model Context Protocol — tool invocation protocol for AI agents |
| KbEventBus | Server-Sent Events bus for real-time KB change notifications |
| Nonce | Unique token for CSP script-src allowing inline scripts |

### Panel Architecture Patterns

| Panel | Rendering Strategy | Data Source |
|-------|-------------------|-------------|
| KB Graph | Iframe (backend admin UI) | Backend server `/admin?page=graph` |
| Dashboard | Iframe (backend admin UI) | Backend server `/admin?page=dashboard` |
| Tags | Iframe (backend admin UI) | Backend server `/admin?page=tags` |
| Quality | Iframe (backend admin UI) | Backend server `/admin?page=quality` |
| Analytics | Iframe (backend admin UI) | Backend server `/admin?page=analytics` |
| Workflow | Custom HTML (Three.js + 3d-force-graph) | Static `SDLC_GRAPH_DEFINITION` |
| Security | Custom HTML (inline) | MCP tools: `code_search`, `mem_search` |
| Impact | Custom HTML (inline) | MCP tool: `code_context` |
| Settings | Custom HTML (external CSS/JS) | VS Code config + SecretStorage |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
