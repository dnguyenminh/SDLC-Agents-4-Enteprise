# Technical Design Document (TDD)
## SA4E-390: LLM Configuration UI Redesign + Chat Model Picker

**Version:** 1.0
**Date:** 2026-10-30
**Status:** Design Completed
**Author:** Solution Architect

---

## 1. Introduction

### 1.1 Purpose
This Technical Design Document (TDD) specifies the technical design for the LLM Configuration UI Redesign + Chat Model Picker feature in the SDLC Agents 4 Enterprise extension (Jira ticket SA4E-390). The design translates the Business Requirements Document (BRD) and Functional Specification Document (FSD) into a concrete technical implementation plan.

### 1.2 Scope
**In-Scope:**
- Provider Table component: Multi-row table with 6 columns (Provider name, Status, API Key (masked), Base URL, Model, Actions)
- "Add Provider" button: Opens Edit Provider modal for new provider configuration
- "Save All" button: Persists all provider configurations to VS Code SecretStorage and workspace configuration
- Model Picker Popup: Replaces simple model dropdown with search, Recent section, model list with name/provider/Free badge
- Keyboard Shortcuts: Esc to close, Ctrl+A to connect integration, Ctrl+F to focus search/favorite
- Provider list unchanged: anthropic, openai, lmstudio, openrouter, ollama
- API key storage via VS Code SecretStorage
- Workspace configuration (sdlcAgents.llm.*)

**Out-of-Scope:**
- Backend Pega, Atlassian, Server, Proxy, Backend MCP, or Wrapper MCP changes
- Code implementation
- Database structure or data persistence schema changes
- Integration with new LLM providers outside existing list
- New model discovery via API calls (model data from saved configuration in this phase)

### 1.3 References
- BRD.md: SA4E-390 Business Requirements Document
- FSD.md: SA4E-390 Functional Specification Document
- Related tickets: SA4E-389 (previous phase), SA4E-323 (LLM provider settings refactor), SA4E-370 (dotted base URL keys), KSA-237 (model dropdown rendering)

### 1.4 Technology Stack
- **Framework:** VS Code Extension (TypeScript)
- **UI:** Webview Panel with HTML/CSS/JavaScript
- **Storage:** VS Code SecretStorage (for API keys), Workspace Configuration (for base URL and model)
- **Architecture:** Modular handlers (LlmSettingsHandler, ProviderConfigService, LlmTestService)
- **Patterns:** Dependency Injection, Service Layer, Repository pattern (via VS Code API)

---

## 2. System Architecture

### 2.1 High-Level Architecture
The extension follows a webview-based architecture with a main VS Code extension host and a webview panel for the settings UI. The communication follows a message-passing pattern between the webview and the extension host.

![System context — webviews, host handlers, storage, and LLM providers](diagrams/system-context.png)
*[Edit in draw.io](diagrams/system-context.drawio)*

![Layered architecture (Presentation / Message Handling / Services / Storage / External)](diagrams/architecture.png)
*[Edit in draw.io](diagrams/architecture.drawio)*

### 2.2 Component Diagram
The system consists of the following main components:

| Component | Responsibility | Interfaces |
|-----------|---------------|------------|
| **SettingsPanel** | Webview panel creation, HTML rendering, message routing | `viewType: "sdlcAgentsSettingsPanel"`, `open()`, `dispose()` |
| **SettingsMessageHandler** | Message router, delegates to domain handlers | `handle(msg: any)`, `routeLlm(msg)`, `sendCurrentState()` |
| **LlmSettingsHandler** | LLM provider settings: getModels, setBaseUrl, saveApiKey, testOllama, testLlm, autoTest | Constructor(secrets, llmTestService, configService, postMessage) |
| **ProviderConfigService** | Manages reading/writing LLM provider configuration | `getCurrentState()`, `getModels(provider, currentModel)`, `updateConfig(key, value)` |
| **LlmTestService** | Handles LLM connection testing logic | `testLlm(provider, baseUrl)`, `autoTestAndNotify(provider)` |
| **VS Code SecretStorage** | Securely stores API keys per provider | `store(key, secret)`, `get(key)`, `delete(key)` |
| **Workspace Configuration** | Stores base URL and model per provider | `vscode.workspace.getConfiguration("sdlcAgents")` |

![Component diagram — Webview UI components, extension-host services, and storage](diagrams/component.png)
*[Edit in draw.io](diagrams/component.drawio)*

### 2.3 Data Flow
1. **Provider Table Load:** Webview loads → `ready` message → `sendCurrentState()` → configService.getCurrentState() → webview renders provider table
2. **Add/Edit Provider:** User fills modal → `saveApiKey()` → secrets.store(secretKey, key) → postMessage({type: "keySaved", ...}) → webview updates
3. **Test Connection:** User clicks test → `testLlm()` → LlmTestService.testLlm() → provider.isAvailable() → result posted back to webview
4. **Model Picker:** User clicks selector → popup opens → renders model list from configService.getModels() → user selects model → `setLlmModelConfig(model)` → workspace config updated

![Provider configuration state machines — connection-test states and modal lifecycle](diagrams/state-provider-config.png)
*[Edit in draw.io](diagrams/state-provider-config.drawio)*

---

## 3. API Design

### 3.1 Webview Messages (Webview ⇄ Extension Host)

#### 3.1.1 Incoming Messages from Webview

| Message Type | Payload | Handler | Description |
|--------------|---------|---------|-------------|
| `ready` | `{}` | `routeLlm` → `sendCurrentState()` | Initial state send on panel open |
| `getState` | `{}` | `routeLlm` → `sendCurrentState()` | Request current state |
| `setProvider` | `{provider: string}` | `routeLlm` → `configService.updateConfig("llm.provider", msg.provider)` → `llm.autoTest()` | Switch provider |
| `getModels` | `{provider: string}` | `routeLlm` → `llm.getModels(msg.provider)` | Fetch model list for provider |
| `setModel` | `{model: string}` | `routeLlm` → `configService.updateConfig("llm.model", msg.model)` | Set selected model |
| `setBaseUrl` | `{provider: string, url: string}` | `routeLlm` → `llm.setBaseUrl(msg.provider, msg.url)` | Set base URL override |
| `saveApiKey` | `{provider: string, key: string}` | `routeLlm` → `llm.saveApiKey(msg.provider, msg.key)` | Save API key to SecretStorage |
| `clearApiKey` | `{provider: string}` | `routeLlm` → `llm.clearApiKey(msg.provider)` | Clear stored API key |
| `testOllamaConnection` | `{url: string}` | `routeLlm` → `llm.testOllama(msg.url)` | Test Ollama server connection |
| `testLlm` | `{provider?: string, baseUrl?: string}` | `routeLlm` → `llm.testLlm(msg.provider, msg.baseUrl)` | Test LLM connection |
| `clearApiKey` | `{provider: string}` | `routeLlm` → `llm.clearApiKey(msg.provider)` | Clear API key |

#### 3.1.2 Outgoing Messages to Webview

| Message Type | Payload | Source | Description |
|--------------|---------|--------|-------------|
| `state` | `{provider, model, ollamaUrl, baseUrl, hasAnthropicKey, hasOpenaiKey, ...}` | `sendCurrentState()` | Send current provider state + model list |
| `models` | `{provider, models, selected, defaultModel}` | `llm.getModels()` / `getModels()` | Send model list for provider |
| `keySaved` | `{provider, success, error?}` | `llm.saveApiKey()` | API key save result |
| `keyCleared` | `{provider}` | `llm.clearApiKey()` | API key cleared |
| `ollamaTested` | `{success, error}` | `llm.testOllama()` | Ollama test result |
| `llmTestResult` | `{success, message, error}` | `llm.testLlm()` / `llm.autoTestAndNotify()` | LLM test result |
| `providerChanged` | `{provider}` | `routeLlm` → `autoTest()` | Provider changed notification |

### 3.2 API Endpoints (Backend - if applicable)
The feature primarily uses VS Code Extension APIs, no backend REST endpoints are modified. The existing `/api/v1/*` routes remain unchanged.

---

## 4. Database Design

### 4.1 Storage Structure
Since this is a VS Code extension, data persistence uses VS Code APIs instead of a traditional database:

#### 4.1.1 VS Code SecretStorage (API Keys)
- **Purpose:** Securely store API keys per LLM provider
- **Keys (from SECRET_KEYS):**
  - `anthropic` → `sdlcAgents.anthropicApiKey`
  - `openai` → `sdlcAgents.openaiApiKey`
  - `openrouter` → `sdlcAgents.openaiApiKey` (legacy mapping)
  - `lmstudio` → `sdlcAgents.openaiApiKey` (legacy mapping, no auth needed)
  - `pega` → `kiroSdlc.pegaPassword` (LEGACY, read-only)
  - `atlassianEmail` → `kiroSdlc.atlassian.email` (LEGACY)
  - `atlassianToken` → `kiroSdlc.atlassian.apiToken` (LEGACY)
  - `atlassianBaseUrl` → `kiroSdlc.atlassian.baseUrl` (LEGACY)

- **Storage Pattern:**
  ```typescript
  // Store API key
  await secrets.store("sdlcAgents.anthropicApiKey", "sk-ant-...");
  
  // Read API key
  const key = await secrets.get("sdlcAgents.anthropicApiKey");
  
  // Delete API key
  await secrets.delete("sdlcAgents.anthropicApiKey");
  ```

#### 4.1.2 Workspace Configuration (base URL, model)
- **Location:** `vscode.workspace.getConfiguration("sdlcAgents")`
- **Keys:**
  - `llm.provider` — current provider ID (anthropic/openai/lmstudio/openrouter/ollama)
  - `llm.model` — selected model ID
  - `llm.anthropic.baseUrl` — optional base URL override
  - `llm.openai.baseUrl` — optional base URL override
  - `llm.lmstudio.baseUrl` — optional base URL override
  - `llm.openrouter.baseUrl` — optional base URL override
  - `llm.ollama.baseUrl` — Ollama server URL (default: http://localhost:11434)
  - `mcp.serverPort` — MCP wrapper server port (default: 9181)
  - `mcp.enabled` — whether MCP wrapper server is enabled (default: true)
  - `backend.allowInsecureRemote` — bypass HTTPS requirement

- **Configuration Targets:**
  - **Global:** API keys (written to SecretStorage, read from config as fallback)
  - **Workspace:** Base URLs, model, provider (persisted in workspace `.vscode/settings.json`)

### 4.2 DDL (Not Applicable)
No traditional database DDL is used. The design leverages VS Code's built-in persistence mechanisms.

### 4.3 Migration Plan
- **One-time migration:** SA4E-370 already completed dotted key migration (llm.anthropic.baseUrl, etc.)
- **Activation migration:** `ensureMigrated(this.secrets)` called on service initialization
- **Legacy fallback:** `getSetting()` function handles old flat key → new dotted key resolution
- **No breaking changes:** Writes target old flat keys; reads resolve to new keys

---

## 5. Class/Module Design

### 5.1 Package Structure (Extension Source)
- `extension/src/`
  - `panels/settings/`
    - `SettingsPanel.ts` — Webview panel shell
    - `SettingsMessageHandler.ts` — Message router
    - `handlers/`
      - `LlmSettingsHandler.ts` — LLM provider logic
      - `BackendSettingsHandler.ts`
      - `PegaSettingsHandler.ts`
      - `AtlassianSettingsHandler.ts`
      - `SettingsMessageHandler.ts` (parent)
  - `services/`
    - `ProviderConfigService.ts` — Provider config management
    - `LlmTestService.ts` — LLM connection testing
    - `... (other services)`
  - `models/`
    - `LlmProviderConfig.ts` — SECRET_KEYS, PROVIDER_BASE_URL_KEYS
  - `chat-panel/chat-panel-provider/`
    - `model-config.ts` — setLlmModelConfig()
  - `webview-assets/`
    - `settings/` — `settings-provider.js` (Provider UI logic), `... (other JS files)`
    - `chat/chat-model.js` — Current model dropdown (to be replaced)

### 5.2 Key Interfaces and Classes

![Webview UI class diagram — components, controllers, and host services](diagrams/class-ui-components.png)
*[Edit in draw.io](diagrams/class-ui-components.drawio)*

#### 5.2.1 Provider Table Row Component
**Purpose:** Render a single row in the Provider Table displaying one LLM provider's configuration.

**Structure:**
```typescript
interface ProviderTableRow {
  providerId: string;          // e.g., "anthropic", "openai"
  providerName: string;        // e.g., "Anthropic", "OpenAI"
  status: ProviderStatus;      // connected / disconnected / unknown
  apiKeyMasked: string;        // masked format (e.g., "••••••••") or empty
  baseUrl: string;             // base URL or default
  model: string;               // selected model ID
  actions: ProviderActions;    // { edit, testConnection, delete }
}

enum ProviderStatus {
  CONNECTED = "connected",     // Green badge
  DISCONNECTED = "disconnected", // Red badge
  UNKNOWN = "unknown"          // Gray badge
}

interface ProviderActions {
  onEdit: (providerId: string) => void;
  onTestConnection: (providerId: string) => void;
  onDelete: (providerId: string) => void;
}
```

**Renders:**
- Provider name with optional icon/category badge
- Status badge with color coding (green/red/gray)
- Masked API key display (click-to-reveal toggle)
- Base URL text (read-only, shows "Use default" if applicable)
- Model ID text
- Action buttons: Edit, Test Connection, Delete

#### 5.2.2 Edit Provider Modal
**Purpose:** Modal dialog for adding a new provider or editing an existing one.

**Structure:**
```typescript
interface EditProviderModal {
  isOpen: boolean;
  currentProvider?: string;        // undefined for new, existing ID for edit
  form: {
    provider: string;              // Provider from list
    apiKey: string;                // API key (empty for new)
    baseUrl: string;               // Base URL override (optional)
    model: string;                 // Model ID
  };
  onSave: (formData: EditProviderForm) => Promise<void>;
  onCancel: () => void;
  onTestConnection: (provider: string, baseUrl?: string) => Promise<void>;
}

interface EditProviderForm {
  providerId: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}
```

**Fields:**
- **Provider Select:** Dropdown with list [anthropic, openai, lmstudio, openrouter, ollama]
- **API Key Input:** Password input field (masked entry)
- **Base URL Input:** Text input field for endpoint URL override
- **Model Input:** Text input field for model ID
- **Test Connection Button:** Triggers connectivity check
- **Save Button:** Saves provider configuration

**Behavior:**
- For **new provider**: All fields empty, provider selection required
- For **edit provider**: Fields pre-filled with current data (API key masked)
- **Test Connection:** Calls `LlmTestService.testLlm(provider, baseUrl)` → posts result
- **Save:** Calls `ProviderConfigService.saveApiKey()` + `configService.updateConfig()` → updates webview state

#### 5.2.3 Model Picker Popup
**Purpose:** Popup interface replacing the simple model dropdown in the Chat Panel.

**Structure:**
```typescript
interface ModelPickerPopup {
  isOpen: boolean;
  onClose: () => void;
  onModelSelect: (model: ModelItem) => void;
  searchQuery: string;
  recentModels: ModelItem[];
  allModels: ModelItem[];
  focusedElement: "search" | "model-list" | "recent";
}

interface ModelItem {
  id: string;           // Model ID (e.g., "claude-3-sonnet")
  name: string;         // Display name (e.g., "Claude 3 Sonnet")
  provider: string;     // Provider name (e.g., "Anthropic")
  isFree: boolean;      // Whether model is free
  rateMultiplier?: number; // 0 if free, >0 if paid with credits
}
```

**Popup Structure (HTML):**
```html
<div class="model-picker-popup hidden">
  <!-- Search Field -->
  <div class="picker-search">
    <input type="text" id="picker-search" placeholder="Search models...">
  </div>
  
  <!-- Recent Section -->
  <div class="picker-recent">
    <h4>Recent</h4>
    <div class="model-list">
      <!-- Recent model items -->
    </div>
  </div>
  
  <!-- Model List -->
  <div class="picker-model-list">
    <h4>Models</h4>
    <div class="model-list">
      <!-- Model items: name + provider + Free badge -->
    </div>
  </div>
</div>
```

**Model Item Render:**
```
[Model Name] [Provider] [Free Badge if applicable]
```
Example: "Claude 3 Sonnet Anthropic Free" (if free)

**Keyboard Shortcuts (active when popup is focused):**
- **Esc:** Close Model Picker popup
- **Ctrl+A:** Activate "Connect an integration" function
- **Ctrl+F:** Focus search field or toggle favorite

#### 5.2.4 Keyboard Shortcut Handler
**Purpose:** Handle keyboard events within the Model Picker popup context.

**Implementation:**
```typescript
class KeyboardShortcutHandler {
  private popup: HTMLElement;
  
  constructor(popup: HTMLElement) {
    this.popup = popup;
    this.attachEvents();
  }
  
  private attachEvents(): void {
    // Esc key: close popup
    document.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Close popup
        this.popup.classList.add("hidden");
        e.stopPropagation();
      }
      
      // Ctrl+A: Connect an integration
      if (e.key === "A" && e.ctrlKey) {
        e.preventDefault(); // Prevent "select all"
        this.onConnectIntegration();
      }
      
      // Ctrl+F: Focus search field or toggle favorite
      if (e.key === "F" && e.ctrlKey) {
        e.preventDefault(); // Prevent browser find
        this.onFocusSearchOrFavorite();
      }
    });
  }
  
  private onConnectIntegration(): void {
    // Dispatch event or call function
    window.SettingsShared?.api?.connectIntegration?.();
  }
  
  private onFocusSearchOrFavorite(): void {
    const searchInput = document.getElementById("picker-search");
    if (searchInput) {
      searchInput.focus();
    } else {
      // Toggle favorite logic
      this.toggleFavorite();
    }
  }
  
  private toggleFavorite(): void {
    // Favorite toggle implementation
  }
}
```

**Important Notes:**
- Shortcuts must not conflict with system/browser hotkeys
- Scope limited to Model Picker popup DOM element (event listener on popup container)
- Ctrl+A should not trigger "select all" in this context (e.preventDefault())
- Event listeners attached to popup container, not document

#### 5.2.5 LlmSettingsHandler
**Purpose:** Handle LLM provider/model/key/ollama/test messages for the Settings panel.

**Constructor:**
```typescript
constructor(
  private readonly secrets: vscode.SecretStorage,
  private readonly llmTestService: LlmTestService,
  private readonly configService: ProviderConfigService,
  private readonly postMessage: (msg: any) => void
)
```

**Key Methods:**
- `async getModels(provider: string): Promise<void>` — Fetch and post model list
- `async setBaseUrl(provider: string, url: string): Promise<void>` — Set base URL override
- `async saveApiKey(provider: string, key: string): Promise<void>` — Store API key in SecretStorage
- `async clearApiKey(provider: string): Promise<void>` — Remove stored API key
- `async testOllama(url: string): Promise<void>` — Test Ollama server (5s timeout)
- `async testLlm(provider?, baseUrl?): Promise<void>` — Run E2E LLM test
- `async autoTest(provider: string): Promise<void>` — Auto-test after provider switch

#### 5.2.6 ProviderConfigService
**Purpose:** Manage reading/writing LLM provider configuration.

**Constructor:**
```typescript
constructor(private readonly secrets: vscode.SecretStorage)
```

**Key Methods:**
- `async getCurrentState(): Promise<State>` — Build current settings state
- `async getModels(provider: string, currentModel: string): Promise<{models, selected, defaultModel}>` — Build model list (static + optional gateway fetch)
- `async updateConfig(key: string, value: any): Promise<void>` — Update workspace configuration
- `getBaseUrlForProvider(provider: string): string` — Get base URL for provider
- `getGatewayBaseUrl(provider: string): string` — Get gateway base URL with auth

#### 5.2.7 LlmTestService
**Purpose:** Handle LLM connection testing logic.

**Constructor:**
```typescript
constructor(private readonly secrets: vscode.SecretStorage)
```

**Key Methods:**
- `async testLlm(providerOverride?, baseUrlOverride?): Promise<{success, message, error}>` — Test LLM connection with timeout
- `async autoTestAndNotify(provider: string): Promise<{success, message, error}>` — Auto-test and notify chat panel

### 5.3 Dependency Injection Configuration
The extension uses constructor-based Dependency Injection:

```typescript
// In SettingsMessageHandler constructor:
const llmTestService = new LlmTestService(secrets);
this.configService = new ProviderConfigService(secrets);
this.llm = new LlmSettingsHandler(secrets, llmTestService, this.configService, postMessage);
```

### 5.4 Error Handling Strategy

#### 5.4.1 Exception Hierarchy

| Exception | Parent | Raised By |
|-----------|--------|-----------|
| `ExtensionError` | — (base) | Common base class for all extension errors |
| `ConfigError` | `ExtensionError` | Configuration-related failures |
| `SecretStorageError` | `ExtensionError` | VS Code SecretStorage operations |
| `ConnectionError` | `ExtensionError` | LLM provider connection failures |
| `ValidationError` | `ExtensionError` | Input validation failures |

#### 5.4.2 Error Handling Patterns
- **API Key Storage:** Try/catch around `secrets.store()` → postMessage({type: "keySaved", success: false, error})
- **Connection Test:** 5s AbortController timeout → show loading state → post result on timeout/failure
- **Model Fetch:** Graceful fallback to static models if gateway API fails
- **Modal Operations:** Show error messages via `vscode.window.showErrorMessage()` or webview postMessage
- **Validation:** Check required fields before save (provider ID selected, model ID not empty, API key for cloud providers)

#### 5.4.3 User Feedback
- Success messages: `vscode.window.showInformationMessage("All configurations saved successfully")`
- Error messages: `vscode.window.showErrorMessage("Failed to save API key: " + error)`
- Loading states: Button disabled + "Testing..." text during connection test
- Masked display: API key never displayed plainly in table (always •••••••• format)

---

## 6. Integration Design

### 6.1 VS Code API Integration

#### 6.1.1 SecretStorage Integration
- **Store API Key:**
  ```typescript
  await this.secrets.store(secretKey, key);
  // secretKey from SECRET_KEYS: "sdlcAgents.anthropicApiKey"
  ```
- **Read API Key:**
  ```typescript
  const key = await this.secrets.get(secretKey);
  ```
- **Delete API Key:**
  ```typescript
  await this.secrets.delete(secretKey);
  // Also delete legacy kiroSdlc. variant
  await this.secrets.delete(secretKey.replace(/^sdlcAgents\./, "kiroSdlc."));
  ```

#### 6.1.2 Workspace Configuration Integration
- **Read Setting:**
  ```typescript
  config.get<T>("llm.provider", defaultValue);
  // Using getSetting() from settings-migration.ts for SA4E-370 compatibility
  ```
- **Write Setting:**
  ```typescript
  const config = vscode.workspace.getConfiguration("sdlcAgents");
  await config.update("llm.model", model, vscode.ConfigurationTarget.Global);
  // or Workspace for workspace-scoped
  await config.update("llm.provider", provider, vscode.ConfigurationTarget.Workspace);
  ```

#### 6.1.3 Webview PostMessage Pattern
- **From Webview to Host:** `vscode.postMessage({ type: "saveApiKey", provider, key })`
- **From Host to Webview:** `this.postMessage({ type: "keySaved", provider, success })`
- **Message Routing:** `SettingsMessageHandler.handle()` → `routeLlm()` → switch on `msg.type`

### 6.2 External System Connections

#### 6.2.1 LLM Provider Connection (Test Connection)
**Sequence:**
1. User clicks "Test Connection" in Edit Provider modal
2. Webview posts `testLlm` message to host
3. `LlmTestService.testLlm()` creates provider by type
4. `provider.isAvailable()` with 10s timeout
5. Result posted back to webview (`llmTestResult` message)
6. Webview shows success/error status

**Provider Creation (createProviderByType):**
```typescript
const provider = createProviderByType(
  providerType as any, this.secrets, undefined,
  ollamaUrl, anthropicBaseUrl, openaiBaseUrl
);
```

#### 6.2.2 Model Discovery
- **Static Models:** `getStaticModels(provider)` — predefined model catalog per provider
- **Gateway Models:** Optional fetch from provider gateway API with auth header
- **Fallback:** If gateway fetch fails or returns empty, use static catalog

### 6.3 Message Flow Diagrams

#### 6.3.1 Test Connection Flow
The original ASCII sketch under this heading was mislabeled ("Save API Key Flow" although it sketched the `testLlm` flow). The authoritative design replaces it with the sequence diagram below (UC-4, AC4; API key saving itself uses the modal's `saveApiKey` message — see Section 3.1.1):

![Test connection sequence — Test click → Testing badge → LlmTestService probe → llmTestResult](diagrams/sequence-test-connection.png)
*[Edit in draw.io](diagrams/sequence-test-connection.drawio)*

#### 6.3.2 Provider Table Load Flow

![Provider table load sequence — activate → ready → sendCurrentState → render masked rows](diagrams/sequence-provider-table.png)
*[Edit in draw.io](diagrams/sequence-provider-table.drawio)*

Provider switching (`setProvider` → `updateConfig("llm.provider", …)` → `autoTest` → `providerChanged` / `llmTestResult` → re-render) flows through the same services; see the `setProvider` row in Section 3.1.1 and the Data Flow list in Section 2.3.

#### 6.3.3 Model Selection Flow

![Model picker sequence — open → getModels → search filter → select → persist llm.model](diagrams/sequence-model-picker.png)
*[Edit in draw.io](diagrams/sequence-model-picker.drawio)*

### 6.4 Retry and Timeout Policies

| Operation | Timeout | Retry Policy | Behavior |
|-----------|---------|--------------|----------|
| Test Ollama Connection | 5s (AbortController) | None | Show result (success/error) on timeout |
| Test LLM Connection | 10s (Promise.race) | None | Show disconnected on timeout/failure |
| Auto-Test After Provider Switch | 8s (Promise.race) | None | Notify chat panel badge; continue on failure |
| Gateway Model Fetch | 30s (fetch timeout) | None | Fallback to static models if timeout |

---

## 7. Security Design

### 7.1 API Key Encryption & Storage
- **Storage Location:** VS Code SecretStorage (encrypted at rest)
- **Access Pattern:** Read/write via `vscode.secrets.store()` / `vscode.secrets.get()`
- **Never displayed plainly** in UI — always masked format
- **Migration Legacy Keys:** Old `sdlcAgents.*` flat keys read through `getSetting()` fallback

### 7.2 API Key Masking in UI
**Table Display Format:**
- Empty API key: Show "—" or empty cell
- Configured API key: Show "••••••••" (8 masking characters) or truncated format
- **Action:** Click to open Edit Provider modal for editing (not to display plain text)

**CSS Class for Masked Display:**
```css
/* Example masking style */
.api-key-cell {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  /* Masked display */
  display: inline-block;
  width: 8ch;
  /* Or show bullet characters */
}
```

### 7.3 Input Validation & Sanitization
- **Provider ID:** Must be selected from valid list [anthropic, openai, lmstudio, openrouter, ollama]
- **API Key:** Required for cloud providers (anthropic, openai, openrouter); optional for local (lmstudio, ollama)
- **Base URL:** Must be valid URL format (http/https) if provided; "Use default" option available
- **Model ID:** Must match one of the available models for the selected provider
- **Sanitization:** Trim whitespace, validate URL format, check for empty values

### 7.4 Audit Logging
- **Log Events:**
  - API key stored/retrieved/deleted from SecretStorage
  - Provider switched
  - Model changed
  - Test connection result (success/failure)
  - Save All operation result
- **Log Format:** Structured logging with timestamps, event types, and success/failure status
- **Implementation:** `console.debug()` / `vscode.log()` in handler functions

### 7.5 Scope Isolation
- **Per-Provider Secrets:** Each provider has its own SecretStorage key (anthropic, openai, etc.)
- **Workspace Isolation:** Pega/Atlassian credentials use workspace-hashed keys (SA4E-323)
- **Global Configuration:** Base URLs and model stored in `sdlcAgents` workspace config (global scope)

---

## 8. Performance & Scalability

### 8.1 Performance Requirements
| Metric | Target | Measurement |
|--------|--------|-------------|
| Provider Table Render | < 500ms for ≤ 10 providers | Chrome DevTools Performance panel |
| Model Picker Open | < 300ms after click | Time from click to popup visible |
| Model List Filter (Search) | < 100ms real-time filtering | Typing test with 50 models |
| Save All Operations | < 2s for ≤ 5 providers | From button click to confirmation message |

### 8.2 Rendering Optimization
- **Virtual Scrolling:** Not required for ≤ 10 providers, but implemented if provider count grows
- **Debounced Search:** Model picker search with 150ms debounce to avoid excessive re-renders
- **Lazy Model Loading:** Model list fetched on-demand when popup opens (not on panel load)
- **Memoization:** Provider status and model list cached within webview session

### 8.3 Caching Strategy
- **Model Cache:** Model list per provider cached for webview session duration
- **Status Cache:** Provider connection status cached after test connection (valid for session)
- **Configuration Cache:** Current state sent on `ready` message, subsequent `getState` requests use cached values

### 8.4 Scalability Considerations
- **Provider Count:** Designed for typical 1-5 providers; virtual scrolling can be added for > 10
- **Model Count:** Static catalog per provider (typically 5-20 models per provider); gateway fetch optional
- **Memory:** Webview panel retains context when hidden (`retainContextWhenHidden: true`); cleanup on dispose

### 8.5 Load Testing Notes
- Provider table with 10 providers should render within 500ms on typical developer machines
- Model picker search through 50 models should filter in < 100ms
- Save All with 5 providers should complete within 2s (dominated by SecretStorage write latency)

---

## 9. Monitoring & Observability

### 9.1 Logging Standards
- **Logging Framework:** Native `console` + `vscode.log()` for extension host; `console` in webview scripts
- **Log Levels:**
  - `debug`: Detailed debugging information (model lists, config values)
  - `info`: Informational events (panel open, provider switched, model selected)
  - `warn`: Warning conditions (missing API key, fallback to static models)
  - `error`: Error events (SecretStorage failure, connection test failure)

### 9.2 Structured Logging Examples
```typescript
// Example structured log messages
vscode.log(`[SA4E-390] Provider table rendered with ${providerCount} providers`);
vscode.log(`[SA4E-390] API key saved for provider: ${provider}`);
vscode.log(`[SA4E-390] Model picker opened, ${modelCount} models available`);
vscode.log(`[SA4E-390] Test connection failed for ${provider}: ${errorMessage}`);
```

### 9.3 Metrics to Collect
| Metric | Description | Collection Method |
|--------|-------------|-------------------|
| Panel Open Time | Time from menu click to panel visible | `performance.now()` in webview |
| Model List Load Time | Time to fetch and render model list | Handler timing |
| Test Connection Latency | Duration of provider availability check | `LlmTestService` timing |
| Save All Duration | Time from Save All click to confirmation | Message timing |
| Provider Switch Frequency | How often users switch providers | Usage analytics (if enabled) |

### 9.4 Health Check Endpoints
The extension doesn't expose HTTP health endpoints (VS Code extension format). Health checks are implicit:
- **Panel Responsive:** Webview loads without JS errors
- **Provider Table Loads:** No console errors in webview
- **Model Picker Functional:** Esc closes, Ctrl+A/Ctrl+F work

### 9.5 Alerting Thresholds
- **SecretStorage Failure:** Alert if `secrets.store()` or `secrets.get()` consistently fails
- **Connection Test Failures:** Alert if > 50% of test connection attempts fail over 1-hour window
- **Model Fetch Failures:** Alert if gateway model API consistently fails (fallback to static models)

---

## 10. Deployment

### 10.1 Environment Configuration
- **Extension Version:** Package from `package.json` version field
- **VS Code Version:** Minimum 1.80+ (for latest SecretStorage API)
- **Node Version:** 18+ (for TypeScript/ESM features)
- **Configuration File:** `extensions\package.json` + user `settings.json` (`%APPDATA%\Code\User\settings.json`)

### 10.2 Start Command
```bash
# Development (watch mode)
cd extension
npx --package vscode-terminal-flash vscode --install-extension . 

# Or via VS Code Extension Development: F5 key

# Production build
vsce package  # Creates .vsix file
code --install-extension sdlc-pipeline-<version>.vsix
```

### 10.3 Ports
| Port | Purpose | Default | Notes |
|------|---------|---------|-------|
| 9181 | MCP Wrapper Server | 9181 | Configurable via `mcp.serverPort` setting |
| N/A | No other ports required | — | Extension is VS Code-based, no standalone server |

### 10.4 Health Endpoint
- **Path:** N/A (VS Code extension, no HTTP server)
- **Check:** Open Command Palette → "SDLC Pipeline: Open Settings" → panel loads without errors
- **Alternative:** Check VS Code Terminal for extension startup logs

### 10.5 Detecting Already-Running Instance
```bash
# Check if extension is loaded
code --list-extensions | grep -i "sdlc"

# Or check VS Code running status
ps aux | grep "Code - OSS" | grep -v grep

# Or via API (extension host)
vscode.extensions.getRegisteredExtensions().some(ext => 
  ext.id.includes("sdlc")
);
```

### 10.6 Feature Verification Points
**Concrete routes/tools/commands that prove the ticket feature is present in the running build:**

| Feature | Verification Point | Expected Result |
|---------|-------------------|-----------------|
| Provider Table | Command Palette: "SDLC Pipeline: Open Settings" → "LLM Provider" tab | Provider table displays with columns: Provider name, Status, API Key (masked), Base URL, Model, Actions |
| Add Provider Button | Same as above | "Add Provider" button visible above/below table |
| Save All Button | Same as above | "Save All" button visible |
| Edit Provider Modal | Click "Edit" on any provider row | Modal opens with pre-filled data |
| Test Connection | Click "Test Connection" in modal | Connection test runs (5s timeout) |
| Model Picker | Command Palette: "SDLC Pipeline: Open Chat" → Click model selector button | Model picker popup opens (replaces dropdown) |
| Keyboard Shortcuts (Model Picker) | Open model picker, press Esc | Popup closes |
| Ctrl+A in Picker | Open model picker, press Ctrl+A | "Connect integration" activated |
| Ctrl+F in Picker | Open model picker, press Ctrl+F | Search field focused / favorite toggled |
| API Key Masked | Provider table shows masked key | API key shows as "••••••••" or masked format |
| Save All Confirmation | Click "Save All" | Success/error message displayed |

### 10.7 Rollback Strategy
- **Configuration Rollback:** VS Code extension auto-saves; user can reset `sdlcAgents` workspace config to previous state
- **SecretStorage:** API keys persist across versions; rollback requires manual key re-entry if new version changes key format
- **Feature Flag:** No feature flags needed for this UI redesign (replaces existing UI entirely)
- **Database Migration:** Not applicable (VS Code config migration handled by `ensureMigrated()`)

---

## 11. E2E Test Architecture

### 11.1 Framework & Language
- **Framework:** vitest for API E2E tests, Playwright for UI E2E tests
- **Language:** TypeScript (project's main language)
- **API Test Client:** `supertest` against running Hono server, or `app.request()` against running webview extension
- **Test Location:** `backend/tests/e2e/` for API tests, `extension/tests/e2e/` for UI tests (if applicable)
- **Note:** All test code MUST use TypeScript to share types and utilities.

### 11.2 Test Structure
- `backend/tests/`
  - `e2e/`
    - `setup/` — `server-start.e2e-test.ts` (shared server setup), `db-seed.ts` (database seed helpers), `auth-token.ts` (auth token generation)
    - `provider-table.e2e.test.ts` — Provider table E2E tests
    - `model-picker.e2e.test.ts` — Model picker E2E tests
  - `integration/`
    - `*.it.test.ts` — Integration tests

**Unit Tests:**
- `backend/src/**/*.test.ts` — Unit tests
- `extension/src/**/*.test.ts` — Unit tests for extension logic

### 11.3 Reusable Components

#### 11.3.1 E2E Setup (Shared)
```typescript
// backend/tests/e2e/setup/server-start.e2e-test.ts
import { describe, beforeAll, afterAll } from 'vitest';
import { Hono } from 'hono';
import { knowledge } from '../knowledge'; // or your module

describe('E2E Setup', () => {
  let app: Hono;
  let server: any;
  
  beforeAll(async () => {
    app = new Hono();
    // ... setup routes, db, etc.
    server = app.listen(0); // random port
  });
  
  afterAll(async () => {
    await server.close();
  });
  
  // Expose app for tests
  export { app };
});
```

#### 11.3.2 Auth Helper
```typescript
// backend/tests/e2e/setup/auth-token.ts
import { execSync } from 'child_process';

export function getAuthToken(): string {
  // Generate or retrieve JWT token for authenticated tests
  const token = execSync('code --command "extension.testToken"').toString().trim();
  return token;
}
```

#### 11.3.3 Helpers (Reusable Across Tests)
```typescript
// Helper: Login as admin
export async function loginAsAdmin(page: Page) {
  await page.goto('/login');
  await page.fill('input[name="email"]', 'admin@test.com');
  await page.fill('input[name="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForSelector('.dashboard');
}

// Helper: Create provider via API
export async function createProvider(api, providerData) {
  const res = await api.post('/api/v1/providers', providerData);
  return res.json();
}

// Helper: Save all providers
export async function saveAllProviders(api) {
  const res = await api.post('/api/v1/providers/save-all');
  return res.json();
}
```

### 11.4 E2E-API Test Design for SA4E-390

**File:** `backend/tests/e2e/provider-table.e2e.test.ts`

**Test Cases:**
| Test Case | Description |
|-----------|-------------|
| `UC-1: View Provider Table` | Verify provider table renders with all columns when panel opens |
| `UC-2: Add New Provider` | Add provider via Add Provider modal → verify appears in table |
| `UC-3: Edit Provider` | Edit existing provider → verify updates displayed in table |
| `UC-4: Test Connection` | Test connection for provider → verify status updated |
| `UC-5: Save All` | Click Save All → verify all configs persisted → verify confirmation message |
| `UC-6: Clear API Key` | Clear API key → verify removed from table |

**Auth Setup:**
- Tests require valid JWT token for authenticated routes
- Token generated from VS Code extension context or test account
- Admin privileges required for Save All operation

**Data Cleanup:**
- After each test: clean up provider configurations via API
- Reset SecretStorage state if needed
- Use test-specific provider IDs to avoid conflicts

### 11.5 E2E-UI Test Design for SA4E-390

**File:** `extension/tests/e2e/model-picker.e2e.test.ts` (or similar)

**New Helpers Needed:**
- `modelPickerOpen(page)` — Open model picker popup
- `modelPickerSearch(page, query)` — Type in search field, verify filtering
- `modelPickerSelectModel(page, modelName)` — Select model from list
- `modelPickerEscClose(page)` — Close via Esc key
- `modelPickerCtrlAFocus(page)` — Trigger Ctrl+A, verify focus behavior
- `modelPickerCtrlFFocus(page)` — Trigger Ctrl+F, verify search focus

**Reused Helpers from Shared Setup:**
- `page.goto()` — Navigate to extension page
- `page.waitForSelector()` — Wait for elements
- `page.click()` — Click interactions
- `expect().toBeVisible()` / `expect().toBeEnabled()` — Assertions

**CSS Selectors (Key Element IDs/Classes):**
```css
/* Model Picker Popup */
.model-picker-popup        ← Popup container (initially .hidden)
.model-picker-search       ← Search input (#picker-search)
.model-picker-recent        ← Recent section (.picker-recent)
.model-picker-model-list    ← Model list (.picker-model-list)
.model-item                 ← Individual model item
.model-item-name            ← Model name span
.model-item-provider        ← Provider name span  
.model-item-free-badge      ← Free badge span (.rate-free)
.model-close-button         ← Close button (Esc handler)

// Keyboard Shortcut Targets
#picker-search              ← Search input element
```

**Test Workflow:**
1. Open model picker popup
2. Verify recent section displayed (or "No recent models")
3. Type search keyword → verify list filters in real-time
4. Select model → verify model applied to chat configuration
5. Press Esc → verify popup closes
6. Press Ctrl+A → verify "Connect integration" activated
7. Press Ctrl+F → verify search field focuses

### 11.6 Test Data Fixtures
```typescript
// test-fixtures.ts
export const testProviders = [
  { id: "anthropic", name: "Anthropic", apiKey: "sk-ant-test-123", baseUrl: "https://api.anthropic.com", model: "claude-3-sonnet" },
  { id: "openai", name: "OpenAI", apiKey: "sk-test-456", baseUrl: "https://api.openai.com", model: "gpt-4o" },
  { id: "ollama", name: "Ollama", apiKey: undefined, baseUrl: "http://localhost:11434", model: "llama3" },
];

export const testModels = {
  anthropic: [
    { id: "claude-3-opus", name: "Claude 3 Opus", provider: "Anthropic", isFree: false },
    { id: "claude-3-sonnet", name: "Claude 3 Sonnet", provider: "Anthropic", isFree: false },
    { id: "claude-3-haiku", name: "Claude 3 Haiku", provider: "Anthropic", isFree: true },
  ],
  openai: [
    { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", isFree: false },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "OpenAI", isFree: false },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", provider: "OpenAI", isFree: false },
  ]
};
```

---

## 12. Discrepancy Report

### 12.1 FSD vs Actual Codebase Comparison

| Category | FSD Description | Actual Codebase | Discrepancy | Severity | Recommendation |
|----------|----------------|-----------------|-------------|----------|----------------|
| **Data Model** | Provider list: anthropic, openai, lmstudio, openrouter, ollama | Confirmed: Same 5 providers in SECRET_KEYS, LlmSettingsHandler, ProviderConfigService | None | — | No action needed |
| **API Key Storage** | VS Code SecretStorage | Confirmed: SECRET_KEYS mapping, LlmSettingsHandler.saveApiKey() uses secrets.store() | None | — | No action needed |
| **Base URL Keys** | Dotted keys: llm.anthropic.baseUrl, etc. | Confirmed: PROVIDER_BASE_URL_KEYS in models/LlmProviderConfig.ts, getSetting() in settings-migration.ts | None | — | No action needed |
| **Model Picker** | New popup with search/recent/free badge | Current: chat-model.js with simple dropdown (no picker) | **UI not yet implemented** | Low | Expected — implemented in Phase 5 |
| **Provider Table** | 6-column table with masked API key, status, actions | Confirmed: FSD design aligns with current code structure (settings-provider.js builds form) | None | — | No action needed |
| **Test Connection** | 5s timeout, show loading state | Confirmed: LlmTestService.testOllama(5s), LlmTestService.testLlm(10s) | None | — | No action needed |
| **Keyboard Shortcuts** | Esc/Ctrl+A/Ctrl+F in model picker | Not yet in codebase | **New feature** | Low | To be implemented in Phase 5 |
| **Save All** | Persist all configs, confirmation message | Confirmed: SettingsMessageHandler routes, ProviderConfigService.updateConfig() | None | — | No action needed |

### 12.2 Summary
- **Critical Discrepancies:** 0 (zero)
- **High Discrepancies:** 0
- **Low Discrepancies:** 2
  - Model Picker UI not yet implemented (expected for Phase 3 design)
  - Keyboard Shortcuts not yet wired in codebase (expected for Phase 3 design)

### 12.3 Recommendations
1. **Model Picker Implementation:** In Phase 5, implement Model Picker popup replacing chat-model.js simple dropdown. Include search field, Recent section, model list with name/provider/Free badge, and keyboard shortcuts (Esc/Ctrl+A/Ctrl+F).

2. **Keyboard Shortcuts Wiring:** In Phase 5, implement keyboard event listeners within Model Picker popup context. Ensure Ctrl+A doesn't trigger "select all", scope limited to popup DOM.

3. **No FSD Updates Required:** The FSD accurately describes the intended design. The discrepancies are expected since this is Phase 3 (Design) — implementation details will be fleshed out in Phase 5 (Implementation).

---

## Diagrams

All diagrams referenced by this TDD are authored as draw.io XML (`diagrams/*.drawio` — no Mermaid, no ASCII art). Rendered PNGs are embedded inline in the sections above and collected here for traceability.

| # | File | Type | Covers |
|---|------|------|--------|
| 1 | use-case.png | Use case | UC-1..UC-10 — actors, system boundary, redesign scope |
| 2 | system-context.png | Context (C1) | Developer ↔ Settings/Chat webviews ↔ host handlers ↔ SecretStorage/workspace config ↔ LLM providers |
| 3 | architecture.png | Layered architecture | Presentation / Message Handling / Services / Storage / External layers; cross-layer HTTP probe from LlmTestService |
| 4 | component.png | Component | Webview UI components (ProviderTable, EditProviderModal, SaveAllController, ModelPickerPopup, KeyboardShortcutHandler), host services (LlmSettingsHandler, ProviderConfigService, LlmTestService), storage adapters |
| 5 | class-ui-components.png | Class | Webview UI classes + host classes; attributes/methods and relations incl. the postMessage contract |
| 6 | sequence-provider-table.png | Sequence | Provider table load: activate → ready → sendCurrentState → render masked rows (UC-1, UC-4) |
| 7 | sequence-model-picker.png | Sequence | Model picker: open → getModels → search filter → select → persist llm.model (UC-6..UC-9) |
| 8 | sequence-test-connection.png | Sequence | Test connection: Test click → Testing badge → LlmTestService probe → llmTestResult badge update (UC-4, AC4) |
| 9 | state-provider-config.png | State machine | Connection-test states (Unknown → Testing → Connected/Failed) + modal lifecycle (Closed → Open → Saving) |

### 1. System Context
![System context](diagrams/system-context.png)
*[Edit in draw.io](diagrams/system-context.drawio)*

### 2. Use Cases
![Use cases](diagrams/use-case.png)
*[Edit in draw.io](diagrams/use-case.drawio)*

### 3. Layered Architecture
![Architecture](diagrams/architecture.png)
*[Edit in draw.io](diagrams/architecture.drawio)*

### 4. Components
![Components](diagrams/component.png)
*[Edit in draw.io](diagrams/component.drawio)*

### 5. Webview UI Classes
![Webview UI classes](diagrams/class-ui-components.png)
*[Edit in draw.io](diagrams/class-ui-components.drawio)*

### 6. Sequence — Provider Table Load
![Provider table load](diagrams/sequence-provider-table.png)
*[Edit in draw.io](diagrams/sequence-provider-table.drawio)*

### 7. Sequence — Model Picker
![Model picker](diagrams/sequence-model-picker.png)
*[Edit in draw.io](diagrams/sequence-model-picker.drawio)*

### 8. Sequence — Test Connection
![Test connection](diagrams/sequence-test-connection.png)
*[Edit in draw.io](diagrams/sequence-test-connection.drawio)*

### 9. Provider Configuration States
![Provider config states](diagrams/state-provider-config.png)
*[Edit in draw.io](diagrams/state-provider-config.drawio)*

---

## Document Information

**TDD Version:** 1.0
**Generated:** 2026-10-30
**Ticket:** SA4E-390
**Phase:** 3 — Design
**Status:** Design Completed

**Cross-Reference Mapping:**
- BRD Story 1 → TDD Section 5 (Provider Table Row), Section 10 (Feature Verification UC-1)
- BRD Story 2 → TDD Section 5 (Edit Provider Modal), Section 10 (UC-2)
- BRD Story 3 → TDD Section 5 (Edit Provider Modal), Section 10 (UC-3)
- BRD Story 4 → TDD Section 5 (Status Badge), Section 10 (UC-1)
- BRD Story 5 → TDD Section 5 (Save All), Section 10 (UC-5)
- BRD Story 6 → TDD Section 7 (Security), Section 10 (Model Picker Verification)
- BRD Story 7 → TDD Section 3 (API Design), Section 11 (E2E Test)
- BRD Story 8 → TDD Section 11 (E2E Test — Recent section)
- BRD Story 9 → TDD Section 5 (Model Item Structure), Section 11 (Model Item Fixtures)
- BRD Story 10 → TDD Section 5 (Keyboard Shortcut Handler), Section 11 (Shortcut Tests)

**FSD Requirement Mapping:**
- UC-1 → Provider table displays all columns
- UC-2 → Add Provider button displayed clearly
- UC-3 → Edit Provider modal opens when Add Provider clicked
- UC-4 → View connection status per provider
- UC-5 → Save All button persists all configurations
- UC-6 → Model picker popup replaces simple dropdown
- UC-7 → Search model in picker works
- UC-8 → Recent section displays recently used models
- UC-9 → Display model name, provider, Free badge
- UC-10 → Keyboard shortcuts Esc/Ctrl+A/Ctrl+F work correctly
