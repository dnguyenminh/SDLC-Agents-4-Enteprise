# Technical Design Document (TDD)

## SDLC Agents 4 Enterprise — SA4E-12: Rich LLM Configuration UI

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-12 |
| Title | Rich LLM Configuration UI |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-26 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-12.docx |
| Related FSD | FSD-v1-SA4E-12.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-26 | SA Agent | Initiate document from FSD SA4E-12 |

---

## 1. Introduction

### 1.1 Purpose

Technical design for enhancing the VS Code extension Settings Panel to deliver a production-quality LLM configuration UI. Covers component architecture, message protocol, service design, and implementation plan.

### 1.2 Scope

- SettingsPanel webview HTML/CSS/JS refactoring
- SettingsMessageHandler message routing enhancements
- ProviderConfigService and LlmTestService improvements
- Webview-assets (settings.js, settings.css) restructuring
- Chat Panel model sync mechanism

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | >= 18.14 |
| Host | VS Code Extension API | 1.85+ |
| UI | Webview (HTML/CSS/JS) | Native |
| Build | esbuild | 0.20+ |
| Test | Vitest (services) + Mocha (extension) | Latest |

### 1.4 Design Principles

- **SRP**: Each file < 200 lines; each function < 20 lines
- **Template Method**: BasePage pattern for webview panels
- **Observer**: Config changes propagate via VS Code events
- **Facade**: ProviderConfigService wraps VS Code APIs
- **DI**: Services injected via constructor, mockable for tests

### 1.5 Constraints

- Webview cannot access Node.js APIs or VS Code API directly
- All webview-host communication via postMessage (async, serializable)
- SecretStorage is async and may fail in remote/web VS Code
- CSS must use VS Code theme variables (--vscode-*) for dark/light mode
- No external CDN resources (CSP blocks them)

---

## 2. Architecture Overview

### 2.1 Architecture Diagram

![Architecture](diagrams/architecture.png)

### 2.2 Component Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ VS Code Extension Host (Node.js)                                 │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │ SettingsPanel     │  │ ProviderConfig   │  │ LlmTest      │  │
│  │ (webview shell)   │  │ Service          │  │ Service      │  │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘  │
│           │ postMessage          │                     │          │
│  ┌────────▼─────────┐          │                     │          │
│  │ MessageHandler    │──────────┼─────────────────────┘          │
│  └──────────────────┘          │                                 │
│                                 │                                 │
│  ┌──────────────────┐          ▼                                 │
│  │ SecretStorage     │  ┌──────────────┐                         │
│  └──────────────────┘  │ VS Code Config │                        │
│                         └──────────────┘                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ Webview (Sandboxed Browser)                                      │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │ settings.js       │  │ settings.css      │                    │
│  │ (UI logic)        │  │ (theme-aware)     │                    │
│  └──────────────────┘  └──────────────────┘                    │
└─────────────────────────────────────────────────────────────────┘
```

### 2.3 Data Flow

1. **Panel Open**: SettingsPanel creates webview → MessageHandler sends "state" message → webview renders
2. **User Action**: webview sends message → MessageHandler routes → Service executes → response message → webview updates
3. **Config Change**: ConfigService writes VS Code settings → onDidChangeConfiguration fires → Chat Panel picks up change

---

## 3. Detailed Design

### 3.1 File Structure (Target)

```
extension/src/
├── panels/settings/
│   ├── SettingsPanel.ts          (<200 lines — webview shell)
│   └── SettingsMessageHandler.ts (<200 lines — message routing)
├── services/
│   ├── ProviderConfigService.ts  (<200 lines — config read/write)
│   └── LlmTestService.ts        (<200 lines — test logic)
├── models/
│   ├── LlmProviderConfig.ts     (constants: keys, URLs, defaults)
│   ├── SettingsState.ts          (webview state interface)
│   └── LlmTestResult.ts         (test result type)
└── chat-panel/
    └── chat-models.ts            (model catalog + gateway fetch)

extension/resources/webview-assets/settings/
├── settings.css                  (theme-aware styles)
└── settings.js                   (<200 lines — webview UI logic)
```

### 3.2 Component: SettingsPanel.ts

**Responsibility:** Create/manage webview panel (singleton), inject CSP/nonce, load HTML.

**Changes:** Minimal — existing implementation is correct. Only update HTML template for enhanced UI elements:
- Add connection-status badge element in provider section header
- Add key-status indicator next to key input
- Add model rate-multiplier badges in select options
- Ensure all elements have aria-labels

### 3.3 Component: SettingsMessageHandler.ts

**Responsibility:** Route webview messages to appropriate services.

**Existing Messages (keep):** setProvider, saveKey, clearKey, setModel, getModels, testLlm, setBackendUrl

**New Messages:**
| Message | Handler | Description |
|---------|---------|-------------|
| toggleDefaultUrl | handleToggleDefaultUrl | Enable/disable base URL override |
| setBaseUrl | handleSetBaseUrl | Save custom base URL per provider |

**Implementation Pattern:**
```typescript
async handle(msg: any): Promise<void> {
  switch (msg.type) {
    case "setProvider":
      await this.configService.updateConfig("llmProvider", msg.provider);
      await this.sendCurrentState();
      await this.handleAutoTest(msg.provider);
      break;
    // ... other cases
  }
}
```

### 3.4 Component: ProviderConfigService.ts

**Responsibility:** Read/write VS Code configuration and SecretStorage.

**Key Methods:**
| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| getCurrentState() | — | SettingsState | Build full state for webview |
| getModels(provider, currentModel) | provider ID, current | models[], selected, default | Get model list (gateway or static) |
| updateConfig(key, value) | setting key, value | void | Write to VS Code Global config |
| getBaseUrlForProvider(provider) | provider ID | string | Read per-provider base URL |

**No changes needed** — existing implementation covers all requirements.

### 3.5 Component: LlmTestService.ts

**Responsibility:** Test LLM provider connectivity.

**Key Methods:**
| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| testLlm(provider?, baseUrl?) | optional overrides | {success, message?, error?} | Manual test (10s timeout) |
| autoTestAndNotify(provider) | provider ID | {success, message?, error?} | Auto-test (8s timeout, silent failure) |

**Enhancement needed:** Add response time measurement to success message.

```typescript
async testLlm(...): Promise<LlmTestResult> {
  const startTime = Date.now();
  // ... existing logic ...
  const duration = Date.now() - startTime;
  return { success: true, message: `Connected to ${provider} (${duration}ms)` };
}
```

### 3.6 Component: settings.js (Webview)

**Responsibility:** DOM manipulation, event handling, message sending.

**Key Functions:**
| Function | Description |
|----------|-------------|
| initState(state) | Apply initial state to all UI elements |
| onProviderChange(provider) | Show/hide sections, send setProvider |
| onSaveKey() | Send saveKey message |
| onTestConnection() | Show spinner, send testLlm, update badge on result |
| updateModels(models, selected) | Populate model dropdown with rate badges |
| updateConnectionBadge(status) | Set badge icon/color |
| updateKeyStatus(hasKey) | Set key indicator text/icon |
| debounce(fn, ms) | Utility for auto-test delay |

**Section Visibility Logic:**
```javascript
function updateSectionsForProvider(provider) {
  const isCloud = ['anthropic', 'openai', 'openrouter'].includes(provider);
  const isOllama = provider === 'ollama';
  const isOnnx = provider === 'onnx';
  
  apiSection.style.display = isCloud ? '' : 'none';
  ollamaSection.style.display = isOllama ? '' : 'none';
  // ONNX section handled separately
}
```

### 3.7 Component: settings.css

**Responsibility:** Theme-aware styling using VS Code CSS variables.

**Key CSS Variables Used:**
| Variable | Purpose |
|----------|---------|
| --vscode-editor-background | Card backgrounds |
| --vscode-editor-foreground | Text color |
| --vscode-button-background | Primary buttons |
| --vscode-input-background | Input fields |
| --vscode-badge-background | Status badges |
| --vscode-errorForeground | Error text |

**Status Badge Styles:**
```css
.status-badge { display: inline-flex; align-items: center; gap: 4px; }
.status-badge--connected { color: var(--vscode-testing-iconPassed); }
.status-badge--disconnected { color: var(--vscode-testing-iconFailed); }
.status-badge--unknown { color: var(--vscode-disabledForeground); }
.status-badge--testing { animation: pulse 1s infinite; }
```

---

## 4. API Design

### 4.1 Webview Message Protocol

All communication is via `panel.webview.postMessage()` and `webview.onDidReceiveMessage()`.

**Message Schema (TypeScript):**
```typescript
// Webview → Extension Host
type WebviewMessage =
  | { type: "setProvider"; provider: string }
  | { type: "saveKey"; key: string }
  | { type: "clearKey" }
  | { type: "setModel"; model: string }
  | { type: "getModels"; provider: string }
  | { type: "testLlm"; provider?: string; baseUrl?: string }
  | { type: "setBaseUrl"; url: string; provider: string }
  | { type: "toggleDefaultUrl"; useDefault: boolean }
  | { type: "setBackendUrl"; url: string }
  | { type: "init" };

// Extension Host → Webview
type HostMessage =
  | { type: "state"; provider: string; model: string; hasAnthropicKey: boolean; hasOpenaiKey: boolean; ollamaUrl: string; baseUrl: string; backendUrl: string }
  | { type: "models"; provider: string; models: ModelEntry[]; selected: string; defaultModel: string }
  | { type: "keySaved"; success: boolean }
  | { type: "keyCleared"; success: boolean }
  | { type: "llmTestResult"; success: boolean; message?: string; error?: string }
  | { type: "backendTestResult"; success: boolean; message?: string };
```

### 4.2 VS Code Commands (Cross-Panel Communication)

| Command | Publisher | Consumer | Payload |
|---------|-----------|----------|---------|
| kiroSdlc.notifyLlmConnected | LlmTestService | ChatPanelProvider | — |
| kiroSdlc.notifyLlmDisconnected | LlmTestService | ChatPanelProvider | — |

---

## 5. Security Design

### 5.1 Threat Model

| Threat | Mitigation | Implementation |
|--------|-----------|----------------|
| API key leak via postMessage | Never send raw key to webview | Extension host sends hasKey boolean only |
| XSS in webview | CSP with nonce | `Content-Security-Policy: script-src 'nonce-${nonce}'` |
| Key in VS Code settings.json | Use SecretStorage API | `secrets.store()` / `secrets.get()` |
| Key in logs | Never log secrets | pino redaction rules |
| Webview content injection | sanitize user inputs | No innerHTML from user data |

### 5.2 CSP Configuration

```
default-src 'none';
script-src 'nonce-${nonce}';
style-src ${webview.cspSource} 'unsafe-inline';
img-src ${webview.cspSource} data:;
font-src ${webview.cspSource};
connect-src 'none';
```

---

## 6. Error Handling

### 6.1 Error Strategy

| Layer | Strategy | Implementation |
|-------|----------|---------------|
| Webview | Show inline error message | Red text in result card |
| MessageHandler | Catch + return error message | try/catch in each handler |
| Services | Throw typed errors | Custom error classes |
| Network | Timeout + retry | AbortController with setTimeout |

### 6.2 Error Types

```typescript
class ConfigError extends Error { constructor(msg: string) { super(msg); this.name = "ConfigError"; } }
class ConnectionTestError extends Error { 
  constructor(msg: string, public readonly code: "AUTH" | "NETWORK" | "TIMEOUT" | "UNKNOWN") { 
    super(msg); this.name = "ConnectionTestError"; 
  }
}
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

| File | Test File | Focus |
|------|-----------|-------|
| ProviderConfigService | ProviderConfigService.test.ts | Config read/write, model list building |
| LlmTestService | LlmTestService.test.ts | Test flow, timeout, error handling |
| SettingsMessageHandler | SettingsMessageHandler.test.ts | Message routing, state building |

### 7.2 Integration Tests

| Scenario | Approach |
|----------|----------|
| Full provider change flow | Mock VS Code API, verify config persisted |
| Gateway model fetch | Mock HTTP response, verify model list |
| Connection test success/failure | Mock provider.isAvailable(), verify commands fired |

### 7.3 Manual Tests

| Scenario | Steps |
|----------|-------|
| Provider switch visibility | Select each provider; verify sections show/hide |
| Key save/clear | Enter key → save → verify indicator; clear → verify |
| Connection test | With valid/invalid config → verify messages |
| Dark/light theme | Toggle VS Code theme → verify contrast |
| Keyboard navigation | Tab through all controls → verify focus |

---

## 8. Implementation Checklist

### Files to Modify

| # | File | Change | Priority |
|---|------|--------|----------|
| 1 | extension/src/panels/settings/SettingsPanel.ts | Update HTML: add badges, status indicators, aria-labels | High |
| 2 | extension/src/panels/settings/SettingsMessageHandler.ts | Add toggleDefaultUrl, setBaseUrl handlers | Medium |
| 3 | extension/src/services/LlmTestService.ts | Add response time to success message | Low |
| 4 | webview-assets/settings/settings.js | Refactor: add badge updates, debounced auto-test, section visibility | High |
| 5 | webview-assets/settings/settings.css | Add badge styles, theme variables, accessibility | High |

### Files to Create

| # | File | Purpose | Priority |
|---|------|---------|----------|
| 1 | extension/src/models/SettingsState.ts | TypeScript interface for webview state | Medium |

### Dependencies (No new packages needed)

All functionality is implementable with existing VS Code API and project dependencies.

---

## 9. Performance Considerations

| Concern | Mitigation |
|---------|-----------|
| Panel open speed | Pre-built HTML template (no dynamic rendering on open) |
| Model fetch blocking | Async fetch with immediate static fallback display |
| Auto-test delay | 500ms debounce prevents rapid API calls |
| Memory leaks | Dispose event listeners on panel close |
| Large model list | Virtualization not needed (max ~20 models per provider) |

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Interaction | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
