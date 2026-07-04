# Technical Design Document (TDD)

## SA4E Extension — F11: Webview Panels

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F11 |
| Title | Webview Panels (Dashboard/Analytics/Settings) |
| Author | SA Agent |
| Version | 1.1 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F11.docx |
| Related FSD | FSD-v1-F11.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initiate document |
| 1.1 | 2026-07-04 | SA Agent | Bugfix: Admin panel page routing — page param decoupled from token check |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies the technical architecture, class design, message protocols, and implementation patterns for the F11 Webview Panels feature.

### 1.2 Scope

- Panel infrastructure (abstract base, factory, lifecycle management)
- 6 iframe-based panels (Graph, Dashboard, Tags, Quality, Analytics, Workflow)
- 3 custom HTML panels (Security, Impact, Settings)
- Message protocol (WebviewToExtMessage / ExtToWebviewMessage)
- CSP configuration per panel type
- Service layer (LlmTestService, ProviderConfigService)

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Platform | VS Code Extension API | 1.85+ |
| Build | esbuild | Latest |
| Test | Vitest | Latest |
| 3D Rendering | Three.js + 3d-force-graph | Latest |
| Runtime | Node.js (host) + Chromium (webview) | - |

### 1.4 Design Principles

- **Single Responsibility**: Each panel class handles one panel type
- **Template Method**: BasePanel lifecycle skeleton, subclasses override
- **Factory Method**: WebviewPanelManager creates panel subclass
- **Singleton**: One instance per PanelType via Map registry
- **Observer**: Panels subscribe to McpServerManager status changes
- **Strategy**: Iframe vs Custom HTML rendering with shared lifecycle

### 1.5 Constraints

- VS Code webview CSP restrictions (no eval except Workflow)
- No filesystem access from webview (isolated process)
- Message passing is async JSON-only between host and webview
- retainContextWhenHidden increases memory per panel

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F11.docx |
| FSD | FSD-v1-F11.docx |

---

## 2. System Architecture

### 2.1 Architecture Overview

Layered architecture:
1. **Command Layer** - VS Code commands trigger panel operations
2. **Manager Layer** - WebviewPanelManager (factory + registry)
3. **Panel Layer** - BasePanel abstract + concrete subclasses
4. **Infrastructure Layer** - McpServerManager, KbEventBus, SecretStorage
5. **Rendering Layer** - HTML generation (iframe or custom)

![Architecture Diagram](diagrams/architecture.png)

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| WebviewPanelManager | Singleton registry, factory | TypeScript class |
| BasePanel | Abstract lifecycle, CSP, messaging | Abstract class |
| GraphPanel | KB Graph iframe | Extends BasePanel |
| DashboardPanel | Dashboard iframe | Extends BasePanel |
| TagsPanel | Tags iframe + KbEventBus | Extends BasePanel |
| QualityPanel | Quality iframe + KbEventBus | Extends BasePanel |
| AnalyticsPanel | Analytics iframe + KbEventBus | Extends BasePanel |
| WorkflowPanel | 3D pipeline (Three.js) | Extends BasePanel |
| SecurityPanel | Security findings custom HTML | Extends BasePanel |
| ImpactPanel | Blast radius custom HTML | Extends BasePanel |
| SettingsPanel | LLM config (standalone singleton) | Independent class |
| SettingsMessageHandler | Message routing for Settings | Delegate class |
| LlmTestService | LLM connection testing | Service class |
| ProviderConfigService | Config read/write | Service class |
| panel-html.ts | Shared HTML generators | Utility module |

### 2.3 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| Command | PanelManager | Direct call | Sync | openPanel(type) |
| PanelManager | Panel subclass | Constructor | Sync | Factory creation |
| Panel | Webview | postMessage | Async | Send data |
| Webview | Panel | onDidReceiveMessage | Async | User actions |
| Panel | McpServerManager | invokeTool() | Promise | Fetch data |
| McpServerManager | Panel | onStatusChange | Event | Server status |
| KbEventBus | Panels | Subscription | Event | Real-time updates |
| Settings | SecretStorage | store/delete | Promise | Key management |

---

## 3. API Design (Message Protocol)

### 3.1 WebviewToExtMessage Types

| Message | Fields | Source Panel |
|---------|--------|-------------|
| ready | - | All |
| refresh | - | All |
| manualRetry | - | All |
| filterByType | types: string[] | Graph |
| filterByTier | tiers: string[] | Graph |
| filterByTag | tag, offset?, limit? | Tags |
| nodeClick | entryId: number | Graph |
| createTag | tag, category? | Tags |
| searchNodes | query: string | Graph |
| bulkAction | action, entryIds[] | Quality |
| createEntry | title, content, type | Dashboard |
| markReviewed | entryId: number | Dashboard |
| openFile | file, line | Security/Impact |

### 3.2 ExtToWebviewMessage Types

| Message | Key Fields | Target |
|---------|-----------|--------|
| graphData | nodes[], edges[] | Graph |
| dashboardData | healthScore, totalEntries, ... | Dashboard |
| tagsData | taxonomy, popular[] | Tags |
| qualityData | stats, lowQuality[], confidence | Quality |
| analyticsData | volume[], popular[], gaps[] | Analytics |
| filteredEntries | entries[], total? | Tags/Graph |
| entryDetail | entry | Graph |
| serverStatus | status: connected/disconnected/failed | All |
| error | message, retryable | All |

### 3.3 Settings Messages

| Direction | Type | Fields |
|-----------|------|--------|
| W->E | setProvider | provider |
| W->E | getModels | provider |
| W->E | setModel | model |
| W->E | saveApiKey | provider, key |
| W->E | clearApiKey | provider |
| W->E | testLlm | provider?, baseUrl? |
| W->E | setBackendUrl | url |
| W->E | testBackendConnection | url |
| W->E | setMcpServerPort | port |
| W->E | restartMcpServer | - |
| E->W | state | provider, model, hasKey, backendUrl |
| E->W | models | provider, models[], selected |
| E->W | keySaved | provider, success, error? |
| E->W | llmTestResult | success, message, latencyMs? |
| E->W | backendTestResult | success, message, latencyMs? |

---

## 4. Data Model

### 4.1 PanelType and Constants

```typescript
type PanelType = "graph" | "dashboard" | "tags" | "quality" | "analytics" | "workflow";

const PANEL_VIEW_TYPES: Record<PanelType, string> = {
  graph: "kiroKbGraph", dashboard: "kiroKbDashboard", tags: "kiroKbTags",
  quality: "kiroKbQuality", analytics: "kiroKbAnalytics", workflow: "kiroWorkflowGraph",
};
```

### 4.2 Interfaces

```typescript
interface IPanelManager {
  openPanel(type: PanelType): void;
  getPanel(type: PanelType): IKbPanel | undefined;
  disposeAll(): void;
  notifyAllPanels(message: ExtToWebviewMessage): void;
}

interface IKbPanel {
  readonly viewType: string;
  readonly panel: vscode.WebviewPanel;
  reveal(): void;
  dispose(): void;
  sendMessage(msg: ExtToWebviewMessage): void;
  loadData(): Promise<void>;
}
```

### 4.3 Configuration Settings

| Setting | Type | Default |
|---------|------|---------|
| kiroSdlc.llmProvider | string | "anthropic" |
| kiroSdlc.llmModel | string | "" |
| kiroSdlc.backend.url | string | "http://127.0.0.1:48721" |
| kiroSdlc.mcpServerPort | number | 9181 |
| kiroSdlc.enableMcpServer | boolean | false |

---

## 5. Class / Module Design

### 5.1 Package Structure

```
extension/src/
+-- panels/
|   +-- base-panel.ts         # Abstract base (lifecycle, CSP, messaging)
|   +-- panel-html.ts         # HTML generators (iframe + base)
|   +-- graph-panel.ts        # KB Graph (iframe)
|   +-- dashboard-panel.ts    # Dashboard (iframe)
|   +-- tags-panel.ts         # Tags (iframe + events)
|   +-- quality-panel.ts      # Quality (iframe + events)
|   +-- analytics-panel.ts    # Analytics (iframe + events)
|   +-- workflow-panel.ts     # Workflow (3D custom)
|   +-- security-panel.ts    # Security (custom HTML)
|   +-- impact-panel.ts      # Impact (custom HTML)
|   +-- settings-panel.ts    # Re-export
|   +-- settings/
|       +-- SettingsPanel.ts          # Panel shell
|       +-- SettingsMessageHandler.ts # Message routing
+-- services/
|   +-- LlmTestService.ts
|   +-- ProviderConfigService.ts
+-- types/
|   +-- panel-types.ts
|   +-- server-types.ts
+-- webview-panel-manager.ts
+-- mcp-server-manager.ts
+-- kb-event-bus.ts

extension/resources/webview-assets/
+-- settings/
|   +-- settings.css
|   +-- settings.js
+-- workflow-graph.css
+-- workflow-graph.js
+-- three.min.js
+-- 3d-force-graph.min.js
```

### 5.2 Class Hierarchy

```
BasePanel (abstract)
+-- GraphPanel          (iframe)
+-- DashboardPanel      (iframe)
+-- TagsPanel           (iframe + KbEventBus)
+-- QualityPanel        (iframe + KbEventBus)
+-- AnalyticsPanel      (iframe + KbEventBus)
+-- WorkflowPanel       (custom 3D)
+-- SecurityPanel       (custom, overrides create())
+-- ImpactPanel         (custom, overrides create())

SettingsPanel (standalone singleton)
+-- SettingsMessageHandler (delegate)
    +-- LlmTestService
    +-- ProviderConfigService
```

### 5.3 Design Patterns

| Pattern | Where | Rationale |
|---------|-------|-----------|
| Template Method | BasePanel lifecycle | Consistent create/getHtml/loadData/handleMessage |
| Factory Method | PanelManager.createPanel() | Centralized creation |
| Singleton | PanelManager Map, SettingsPanel.instance | One per type |
| Observer | onStatusChange subscriptions | Decouple status from panels |
| Strategy | Iframe vs Custom rendering | Same lifecycle, different output |
| Delegate | Settings -> MessageHandler | SRP separation |
| Facade | McpServerManager.invokeTool() | Simple interface |

### 5.4 Error Handling

| Error | Strategy | User Feedback |
|-------|----------|---------------|
| MCP tool fails | Catch, send error msg | Overlay + retry button |
| Panel disposed | onDidDispose cleanup | Panel disappears |
| Auth token expired | Detect auth_error, refresh, reload | Seamless |
| SecretStorage write fails | Catch, return error | Status indicator |
| Backend unreachable | Iframe fallback text | "Loading..." persists |
| File not found | Silent catch | No visible error |

---

## 6. Integration Design

### 6.1 MCP Server

| Attribute | Value |
|-----------|-------|
| Protocol | JSON-RPC over stdio |
| Tools Used | mem_search, mem_admin, code_search, code_context |
| Timeout | No explicit timeout |
| Retry | Manual (user retry button) |

### 6.2 KbEventBus (SSE)

| Attribute | Value |
|-----------|-------|
| Protocol | Server-Sent Events |
| Events | kb_entry_created/updated/deleted |
| Consumers | TagsPanel, QualityPanel, AnalyticsPanel |
| Fallback | Polling timer |

---

## 7. Security Design

### 7.1 CSP Per Panel Type

| Type | CSP |
|------|-----|
| Iframe | `default-src 'none'; frame-src {origin}; style-src 'unsafe-inline'` |
| Custom | `default-src 'none'; script-src 'nonce-{n}'; style-src {csp} 'unsafe-inline'; img-src {csp} data:; connect-src 'none'` |
| Workflow | + `'unsafe-eval'` for Three.js |

### 7.2 Secret Management

- API keys in VS Code SecretStorage (encrypted)
- Never in settings.json or webview
- Only `hasKey: boolean` sent to webview
- Token: in-memory only, refreshed on demand

---

## 8. Performance

### 8.1 Targets

| Operation | Target |
|-----------|--------|
| Panel HTML generation | < 10ms |
| Panel creation (e2e) | < 200ms |
| MCP tool response | < 2000ms |
| Settings state load | < 100ms |
| 3D graph render | < 1000ms |

### 8.2 Memory Strategy

- Singleton panels (Map registry)
- Dispose cleanup (timers, subscriptions)
- Lazy loading (panels created on demand)
- retainContextWhenHidden for UX

---

## 9. Implementation Checklist

| # | File | Status | Notes |
|---|------|--------|-------|
| 1 | panels/base-panel.ts | Existing | Core lifecycle |
| 2 | panels/panel-html.ts | Existing | HTML generators |
| 3 | panels/graph-panel.ts | Existing | Iframe |
| 4 | panels/dashboard-panel.ts | Existing | Iframe |
| 5 | panels/tags-panel.ts | Existing | Iframe + events |
| 6 | panels/quality-panel.ts | Existing | Iframe + events |
| 7 | panels/analytics-panel.ts | Existing | Iframe + events |
| 8 | panels/workflow-panel.ts | Existing | 3D custom |
| 9 | panels/security-panel.ts | Existing | Custom HTML |
| 10 | panels/impact-panel.ts | Existing | Custom HTML |
| 11 | panels/settings/SettingsPanel.ts | Existing | Singleton |
| 12 | panels/settings/SettingsMessageHandler.ts | Existing | Delegate |
| 13 | services/LlmTestService.ts | Existing | Testing |
| 14 | services/ProviderConfigService.ts | Existing | Config |
| 15 | webview-panel-manager.ts | Existing | Factory |
| 16 | types/panel-types.ts | Existing | Types |

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |

### Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| 1 | Should Security/Impact panels join WebviewPanelManager? | Resolved | No - different lifecycle |
| 2 | KbEventBus polling interval configurable? | Open | Currently hardcoded |
| 3 | Workflow graph data dynamic vs static? | Resolved | Static (SDLC_GRAPH_DEFINITION) |

---

## 11. Bugfix Log

### BF-001: Admin Panel Page Routing (2026-07-04)

**Problem:** Clicking Graph/Tags/Quality/Analytics in VS Code sidebar always renders Dashboard page instead of the target page.

**Root Cause:** In `backend/src/server/routes/admin.ts`, the `page` query parameter replacement was nested inside `if (token)` block:

```typescript
// BEFORE (bug)
if (token) {
    const injectScript = '<script>localStorage.setItem("admin_token","' + token + '");</script>';
    html = html.replace('</head>', injectScript + '</head>');
    if (page) {
      html = html.replace("useState('dashboard')", "useState('" + page + "')");
    }
}
```

When `token` was empty/undefined (edge case in session flow), the `page` replacement was skipped entirely, causing the SPA to always initialize with `useState('dashboard')`.

**Fix:** Decoupled `page` replacement from `token` check:

```typescript
// AFTER (fixed)
if (token) {
    const injectScript = '<script>localStorage.setItem("admin_token","' + token + '");</script>';
    html = html.replace('</head>', injectScript + '</head>');
}
if (page) {
    html = html.replace("useState('dashboard')", "useState('" + page + "')");
}
```

**Flow (Extension → Backend → SPA):**

1. Extension `panel-html.ts` builds iframe URL: `/admin?embed=true&page={panelType}&token={token}`
2. Backend reads `index.html`, injects embed CSS (hides sidebar), sets token in localStorage, replaces initial page state
3. SPA `PortalInstance` component initializes with correct page → renders correct sub-page

**Files Changed:**

| File | Change |
|------|--------|
| `backend/src/server/routes/admin.ts` | Move `page` replace out of `if (token)` block |

**Verification:** Confirmed via HTTP response — `useState('graph')` present in HTML when `?page=graph` is passed.