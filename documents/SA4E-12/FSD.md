# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise — SA4E-12: Rich LLM Configuration UI

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-12 |
| Title | Rich LLM Configuration UI |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-26 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-12.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-26 | BA Agent | Initiate document from BRD SA4E-12 |
| 1.0 | 2025-07-26 | TA Agent | Enrich with API contracts, pseudocode, technical details |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Rich LLM Configuration UI for the SA4E VS Code extension. It details use cases, data flows, UI interactions, and API contracts for configuring LLM providers.

### 1.2 Scope

Enhancement of the existing SettingsPanel webview to provide a production-quality LLM configuration experience with provider selection, API key management, dynamic model loading, and connection testing.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| LLM | Large Language Model |
| Provider | LLM service (Anthropic, OpenAI, Ollama, etc.) |
| Gateway | Local proxy routing requests to LLM providers |
| SecretStorage | VS Code encrypted credential storage API |
| MCP | Model Context Protocol |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-12.docx |
| Architecture | .code-intel/SA4E-ARCHITECTURE.md |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Settings Panel webview communicates with the VS Code extension host via postMessage. The extension host manages SecretStorage, VS Code configuration, and communicates with external LLM providers/gateways for model fetching and connection testing.

**Actors:**
- **Developer** — interacts with Settings Panel webview
- **VS Code Extension Host** — manages config, secrets, and provider communication
- **LLM Gateway/Provider API** — responds to model list requests and connectivity checks
- **LangGraph Engine** — consumes the configured LLM provider for pipeline execution
- **Chat Panel** — syncs model selection from settings

### 2.2 Component Architecture

| Component | Responsibility | Location |
|-----------|---------------|----------|
| SettingsPanel | Webview shell, HTML generation | extension/src/panels/settings/SettingsPanel.ts |
| SettingsMessageHandler | Message routing and business logic | extension/src/panels/settings/SettingsMessageHandler.ts |
| ProviderConfigService | Read/write VS Code config + SecretStorage | extension/src/services/ProviderConfigService.ts |
| LlmTestService | Connection testing logic | extension/src/services/LlmTestService.ts |
| chat-models.ts | Static model catalog + gateway fetch | extension/src/chat-panel/chat-models.ts |
| LlmProviderConfig | Provider constants (keys, URLs) | extension/src/models/LlmProviderConfig.ts |
| settings.js | Webview JavaScript (UI logic) | webview-assets/settings/settings.js |
| settings.css | Webview styles | webview-assets/settings/settings.css |

---

## 3. Functional Requirements

### 3.1 Feature: Provider Selection (UC-01)

**Source:** BRD Story 1

#### 3.1.1 Description

Developer selects an LLM provider from a dropdown. Selection persists in kiroSdlc.llmProvider VS Code setting and triggers contextual UI updates.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** Developer
**Preconditions:** Settings Panel is open
**Postconditions:** Provider is saved; relevant config sections shown/hidden

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Selects provider from dropdown | | Developer picks e.g. "Anthropic" |
| 2 | | Updates kiroSdlc.llmProvider | Persists to VS Code Global settings |
| 3 | | Shows/hides config sections | API key section for cloud; URL section for local |
| 4 | | Triggers auto-test (debounced 500ms) | Silent connectivity check |
| 5 | | Fetches model list for new provider | From gateway or static catalog |
| 6 | | Updates model dropdown | Auto-selects default model |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01.1 | Provider is ONNX | Show ONNX model registry with download status instead of API key section |
| AF-01.2 | Provider is Ollama | Show server URL section instead of API key; fetch models from /api/tags |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01.1 | VS Code config write fails | Show toast "Failed to save provider setting" |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Provider selection persists globally (not per-workspace) | BRD Story 1 AC4 |
| BR-02 | Selecting a cloud provider shows API key section | BRD Story 5 |
| BR-03 | Selecting a local provider hides API key section and shows URL section | BRD Story 5 |
| BR-04 | Provider change triggers auto-test after 500ms debounce | BRD Story 7 |

#### 3.1.4 Data Specifications

**Provider Registry (Static):**

| Provider ID | Display Name | Requires API Key | Is Local | Default Base URL |
|-------------|-------------|------------------|----------|-----------------|
| anthropic | Anthropic — Claude models (recommended) | Yes | No | (official API) |
| openai | OpenAI — GPT models | Yes | No | https://api.openai.com/v1 |
| openrouter | OpenRouter — Multi-model gateway | Yes | No | https://openrouter.ai/api/v1 |
| lmstudio | LM Studio — Local models | No | Yes | http://localhost:1234/v1 |
| ollama | Ollama — Local models (no API key needed) | No | Yes | http://localhost:11434 |
| onnx | ONNX — CPU-only local (Phi-3, SmolLM2) | No | Yes | N/A |

#### 3.1.5 UI Specifications

**Screen: Provider Selection Card**

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | provider-select | Select | Yes | 6 options with descriptions | None |
| 2 | connection-status | Badge | Yes | Shows current connection state | N/A |

---

### 3.2 Feature: API Key Management (UC-02)

**Source:** BRD Story 2

#### 3.2.1 Description

Developers securely store API keys per provider using VS Code SecretStorage. Keys are never exposed to the webview — only hasKey boolean is transmitted.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** Developer
**Preconditions:** Cloud provider selected; Settings Panel open
**Postconditions:** API key stored in SecretStorage

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Types API key in masked input | | Password-type input field |
| 2 | Clicks "Save API Key" | | Button enabled when input non-empty |
| 3 | | Sends {type:"saveKey", key: value} to extension host | postMessage to host |
| 4 | | Extension host stores key in SecretStorage | secrets.store(SECRET_KEYS[provider], key) |
| 5 | | Returns {type:"keySaved", success:true} | postMessage back to webview |
| 6 | | Updates key status indicator to "Key saved ✅" | Visual feedback |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-02.1 | Developer clicks "Clear Key" | Extension host deletes key from SecretStorage; status → "No key ❌" |
| AF-02.2 | Developer clicks eye icon | Toggle input type between "password" and "text" |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-02.1 | SecretStorage write fails | Show toast error; key status shows "Error saving" |
| EF-02.2 | SecretStorage read fails on panel open | Key status shows "Unknown" state |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-05 | API keys stored ONLY in SecretStorage (never in settings.json) | BRD Story 2 AC1 |
| BR-06 | Webview never receives actual key value — only hasKey boolean | BRD NFR Security |
| BR-07 | Each provider has independent key storage (switching providers doesn't lose keys) | BRD Story 2 AC5 |
| BR-08 | Save button disabled when input empty or unchanged | BRD Story 2 |

#### 3.2.4 Data Specifications

**Secret Storage Keys:**

| Provider | Secret Key | Shared With |
|----------|-----------|-------------|
| anthropic | kiroSdlc.anthropicApiKey | — |
| openai | kiroSdlc.openaiApiKey | openrouter, lmstudio |
| openrouter | kiroSdlc.openaiApiKey | openai, lmstudio |
| lmstudio | kiroSdlc.openaiApiKey | openai, openrouter |

---

### 3.3 Feature: Dynamic Model Selection (UC-03)

**Source:** BRD Story 3

#### 3.3.1 Description

Model dropdown is populated dynamically per provider. For gateway-connected providers, models are fetched live from /v1/models endpoint. Falls back to static catalog.

#### 3.3.2 Use Case

**Use Case ID:** UC-03
**Actor:** Developer
**Preconditions:** Provider selected; Settings Panel open
**Postconditions:** Model selection saved to kiroSdlc.llmModel

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | System detects selected provider | On panel open or provider change |
| 2 | | Checks if gateway base URL configured | getGatewayBaseUrl(provider) |
| 3 | | Attempts GET {baseUrl}/v1/models | With 5s timeout |
| 4 | | On success: populates dropdown with live models | Includes name, description, rateMultiplier |
| 5 | | On failure: loads static catalog | AVAILABLE_MODELS[provider] from chat-models.ts |
| 6 | | Auto-selects current or default model | Based on kiroSdlc.llmModel or DEFAULT_MODELS[provider] |
| 7 | Developer selects model | | Picks from populated dropdown |
| 8 | | Saves to kiroSdlc.llmModel (global) | Chat panel also reads this config |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-03.1 | Provider is Ollama | Fetch from /api/tags endpoint (different schema) |
| AF-03.2 | Developer selects "Custom model" | Show text input for arbitrary model ID |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-09 | Gateway models take precedence over static catalog when available | BRD Story 3 |
| BR-10 | Gateway fetch has 5s timeout — no UI blocking | BRD NFR Performance |
| BR-11 | Model selection syncs to Chat Panel via shared config key | BRD Story 3 AC3 |
| BR-12 | Rate multiplier displayed as badge (e.g., "2.2x") when available | BRD Story 3 AC4 |

#### 3.3.4 API Contract (Functional View)

**Endpoint:** `GET {gateway_base_url}/v1/models`
**Purpose:** Retrieve available models from LLM gateway

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| data | Array | List of model objects |
| data[].id | string | Model identifier (used in API calls) |
| data[].display_name | string | Human-readable model name |
| data[].description | string | Optional model description |
| data[].rate_multiplier | number | Optional cost multiplier |

**Business Error Scenarios:**

| Scenario | User Impact | Trigger |
|----------|-------------|---------|
| Gateway unreachable | Silent fallback to static models | Network error or timeout |
| Gateway returns empty list | Use static catalog | No models configured in gateway |

---

### 3.4 Feature: Connection Testing (UC-04)

**Source:** BRD Story 4

#### 3.4.1 Description

One-click connection test verifies end-to-end LLM provider connectivity. Shows loading state during test, then success/failure with actionable messages.

#### 3.4.2 Use Case

**Use Case ID:** UC-04
**Actor:** Developer
**Preconditions:** Provider configured (key/URL set)
**Postconditions:** Connection status badge updated; Chat Panel notified

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Clicks "Test Connection" | | Manual trigger |
| 2 | | Button shows spinner; text = "Testing..." | Loading state |
| 3 | | Creates provider instance via createProviderByType() | Uses current config |
| 4 | | Calls provider.isAvailable() with 10s timeout | Lightweight connectivity check |
| 5 | | On success: show "✅ Connected to {provider} ({time}ms)" | Green result card |
| 6 | | Fires kiroSdlc.notifyLlmConnected command | Chat Panel badge updates |
| 7 | | Updates connection status badge to ✅ | Persists until next event |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-04.1 | Auto-test (provider change) | Same flow but 8s timeout, no toast on failure |
| AF-04.2 | Test during existing test | Ignore (button disabled while testing) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-04.1 | Auth error (401/403) | Show "❌ Authentication failed. Check your API key." |
| EF-04.2 | Network error | Show "❌ Provider unreachable. Check base URL or network." |
| EF-04.3 | Timeout (10s) | Show "❌ Connection timed out. Provider may be slow." |
| EF-04.4 | Unknown error | Show "❌ Error: {message}" |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-13 | Manual test timeout = 10 seconds | BRD Story 4 |
| BR-14 | Auto-test timeout = 8 seconds | BRD Story 7 |
| BR-15 | Connection result propagates to Chat Panel via VS Code command | BRD Story 4 AC5 |
| BR-16 | Auto-test failure is silent (no toast, only badge update) | BRD Story 7 AC3 |

---

### 3.5 Feature: Base URL Configuration (UC-05)

**Source:** BRD Story 5

#### 3.5.1 Use Case

**Use Case ID:** UC-05
**Actor:** Developer
**Preconditions:** Cloud provider selected
**Postconditions:** Custom base URL saved or default used

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | "Use default URL" checkbox shown (checked by default) | Input disabled when checked |
| 2 | Developer unchecks "Use default URL" | | Enables URL input |
| 3 | Types custom URL | | e.g., http://localhost:8990/anthropic |
| 4 | | Saves to kiroSdlc.{provider}BaseUrl | Per-provider config key |
| 5 | | Re-fetches model list from new URL | Gateway may have different models |

#### 3.5.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-17 | Default URL = empty string (means official API for Anthropic/OpenAI) | Existing behavior |
| BR-18 | URL persists per-provider (anthropicBaseUrl, openaiBaseUrl, etc.) | LlmProviderConfig.ts |
| BR-19 | Changing base URL triggers model list refresh | BRD Story 5 AC4 |

---

### 3.6 Feature: Connection Status Indicators (UC-06)

**Source:** BRD Story 6

#### 3.6.1 Description

Visual indicators show connection state and key status throughout the panel.

#### 3.6.2 Status States

| State | Badge | Color | Trigger |
|-------|-------|-------|---------|
| Unknown | ⚪ | Gray | Initial state, no test performed |
| Connected | ✅ | Green | Test passed |
| Disconnected | ❌ | Red | Test failed |
| Testing | ⏳ | Yellow/Animated | Test in progress |

#### 3.6.3 Key Status States

| State | Display | Trigger |
|-------|---------|---------|
| Key saved | "✅ Key saved" | SecretStorage has key for current provider |
| No key | "❌ No key" | SecretStorage empty for current provider |
| Error | "⚠️ Unable to read" | SecretStorage read failed |

---

## 4. Data Model

### 4.1 Configuration State

| Setting Key | Type | Default | Scope | Description |
|------------|------|---------|-------|-------------|
| kiroSdlc.llmProvider | string | "anthropic" | Global | Selected provider ID |
| kiroSdlc.llmModel | string | "" | Global | Selected model ID |
| kiroSdlc.ollamaUrl | string | "http://localhost:11434" | Global | Ollama server URL |
| kiroSdlc.anthropicBaseUrl | string | "" | Global | Custom Anthropic/gateway URL |
| kiroSdlc.openaiBaseUrl | string | "" | Global | Custom OpenAI URL |
| kiroSdlc.lmstudioBaseUrl | string | "http://localhost:1234/v1" | Global | LM Studio URL |
| kiroSdlc.openrouterBaseUrl | string | "https://openrouter.ai/api/v1" | Global | OpenRouter URL |

### 4.2 Webview State (In-Memory)

| Field | Type | Description |
|-------|------|-------------|
| provider | string | Currently selected provider |
| model | string | Currently selected model |
| hasKey | boolean | Whether API key exists for provider |
| connectionStatus | enum | "unknown" / "connected" / "disconnected" / "testing" |
| models | ChatModelEntry[] | Available models for current provider |
| testResult | object | Last test result (success, message, error) |

---

## 5. Integration Specifications

### 5.1 VS Code Configuration API

| Attribute | Value |
|-----------|-------|
| Purpose | Persist LLM settings |
| Direction | Bidirectional |
| Data Format | VS Code ConfigurationTarget.Global |
| Frequency | On-demand (user interaction) |

### 5.2 VS Code SecretStorage API

| Attribute | Value |
|-----------|-------|
| Purpose | Secure API key storage |
| Direction | Bidirectional |
| Data Format | Key-value (string) |
| Frequency | On-demand (save/load key) |

### 5.3 LLM Gateway API

| Attribute | Value |
|-----------|-------|
| Purpose | Fetch available model list |
| Direction | Inbound (read only) |
| Data Format | JSON (OpenAI-compatible /v1/models) |
| Frequency | On provider change, on panel open |

### 5.4 LLM Provider API (Test)

| Attribute | Value |
|-----------|-------|
| Purpose | Verify connectivity (isAvailable check) |
| Direction | Outbound |
| Data Format | Provider-specific |
| Frequency | On manual test, on provider change (auto-test) |

---

## 6. Processing Logic

### 6.1 Provider Change Flow

**Trigger:** Developer selects new provider from dropdown
**Input:** Provider ID
**Output:** Updated UI state, auto-test result

**Pseudocode:**
```
function onProviderChange(newProvider):
    // 1. Persist selection
    config.update("llmProvider", newProvider)
    
    // 2. Update UI visibility
    if provider.requiresApiKey:
        show(apiKeySection)
        hide(ollamaSection)
        keyStatus = await secrets.get(SECRET_KEYS[newProvider])
        updateKeyIndicator(keyStatus != null)
    else if newProvider == "ollama":
        hide(apiKeySection)
        show(ollamaSection)
    
    // 3. Fetch models
    models = await getModels(newProvider)
    populateModelDropdown(models)
    
    // 4. Auto-test (debounced)
    clearTimeout(autoTestTimer)
    autoTestTimer = setTimeout(() => autoTest(newProvider), 500)
```

### 6.2 Connection Test Flow

**Trigger:** "Test Connection" button click or auto-test
**Input:** Current provider config
**Output:** Test result (success/failure + message)

**Pseudocode:**
```
function testConnection(provider, isAutoTest = false):
    setStatus("testing")
    disableTestButton()
    
    timeout = isAutoTest ? 8000 : 10000
    
    try:
        llmProvider = createProviderByType(provider, secrets, ...)
        available = await race([
            llmProvider.isAvailable(),
            timeoutPromise(timeout)
        ])
        llmProvider.dispose()
        
        if available:
            setStatus("connected")
            vscode.commands.execute("kiroSdlc.notifyLlmConnected")
            showResult(success: true, "Connected to {provider}")
        else:
            setStatus("disconnected")
            vscode.commands.execute("kiroSdlc.notifyLlmDisconnected")
            if not isAutoTest: showResult(error: "Provider unreachable")
    catch error:
        setStatus("disconnected")
        vscode.commands.execute("kiroSdlc.notifyLlmDisconnected")
        if not isAutoTest: showResult(error: error.message)
    finally:
        enableTestButton()
```

---

## 7. Security Requirements

### 7.1 Data Sensitivity

| Data Type | Classification | Protection |
|-----------|---------------|------------|
| API Keys | Restricted | SecretStorage only; never in config/logs/postMessage |
| Provider selection | Internal | VS Code settings (user profile) |
| Model selection | Internal | VS Code settings (user profile) |
| Base URLs | Internal | VS Code settings; may contain local network info |

### 7.2 Security Rules

| Rule | Implementation |
|------|---------------|
| Keys never reach webview | Extension host stores/retrieves; only sends hasKey boolean |
| No key logging | pino logger configured to never log secret values |
| CSP enforced | Content-Security-Policy in webview HTML prevents external resource loading |
| No eval/inline scripts | Nonce-based script loading in webview |

---

## 8. Non-Functional Requirements

| Category | Requirement | Acceptance Criteria |
|----------|-------------|---------------------|
| Performance | Panel opens < 500ms | Measured from command invocation to DOM ready |
| Performance | Model fetch < 5s | Gateway timeout; UI shows models from cache/static immediately |
| Performance | Auto-test < 8s | Timeout ensures responsiveness |
| Accessibility | WCAG 2.1 AA | All controls have labels; keyboard navigable; 4.5:1 contrast |
| Usability | No page reload on config change | All updates via DOM manipulation |
| Reliability | Works offline for local providers | Ollama/ONNX don't need internet |

---

## 9. Error Handling

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Recovery |
|----------|----------|-------------|----------|
| API key save failed | Warning | "Failed to save API key" (toast) | Retry save |
| Gateway model fetch timeout | Info | (silent — static models shown) | None needed |
| Connection test auth error | Warning | "Authentication failed. Check API key." | Re-enter key |
| Connection test network error | Warning | "Provider unreachable. Check URL." | Fix URL |
| Connection test timeout | Warning | "Timed out after 10s." | Check provider status |
| Config write failed | Error | "Failed to save settings" (toast) | Check VS Code permissions |

---

## 10. Testing Considerations

### 10.1 Key Test Scenarios

| ID | Scenario | Input | Expected | Priority |
|----|----------|-------|----------|----------|
| TC-01 | Select each provider | Click all 6 options | Correct section visibility | High |
| TC-02 | Save API key | Enter key, click Save | Key in SecretStorage | High |
| TC-03 | Clear API key | Click Clear | Key removed; status ❌ | High |
| TC-04 | Toggle key visibility | Click eye icon | Input toggles password/text | Medium |
| TC-05 | Model list loads (static) | No gateway | Static models shown | High |
| TC-06 | Model list loads (gateway) | Gateway running | Live models shown | High |
| TC-07 | Test connection success | Valid config | ✅ message + badge | High |
| TC-08 | Test connection failure | Invalid key | ❌ message + badge | High |
| TC-09 | Auto-test on change | Switch provider | Badge updates silently | Medium |
| TC-10 | Config persists restart | Change, restart VS Code | Same settings | High |

---

## 11. Appendix

### Message Protocol (Webview ↔ Extension Host)

| Direction | Message Type | Payload | Purpose |
|-----------|-------------|---------|---------|
| Webview → Host | setProvider | {provider: string} | Provider selection changed |
| Webview → Host | saveKey | {key: string} | Save API key |
| Webview → Host | clearKey | {} | Remove stored key |
| Webview → Host | setModel | {model: string} | Model selection changed |
| Webview → Host | getModels | {provider: string} | Request model list |
| Webview → Host | testLlm | {provider?: string, baseUrl?: string} | Trigger connection test |
| Webview → Host | setBaseUrl | {url: string, provider: string} | Custom base URL |
| Webview → Host | toggleDefaultUrl | {useDefault: boolean} | Toggle use-default checkbox |
| Host → Webview | state | {provider, model, hasKey, ...} | Full state sync |
| Host → Webview | models | {provider, models[], selected, defaultModel} | Model list response |
| Host → Webview | keySaved | {success: boolean} | Key save result |
| Host → Webview | llmTestResult | {success, message?, error?} | Test result |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence: Provider Change | [sequence-provider-change.png](diagrams/sequence-provider-change.png) | [sequence-provider-change.drawio](diagrams/sequence-provider-change.drawio) |
| 3 | State: Connection Status | [state-connection.png](diagrams/state-connection.png) | [state-connection.drawio](diagrams/state-connection.drawio) |
