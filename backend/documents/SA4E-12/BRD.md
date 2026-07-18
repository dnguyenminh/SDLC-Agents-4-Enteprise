# Business Requirements Document (BRD)

## SDLC Agents 4 Enterprise — SA4E-12: Rich LLM Configuration UI

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-12 |
| Title | Rich LLM Configuration UI |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-26 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-12.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | SM Agent – Scrum Master | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-26 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-12 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

This change request implements a **Rich LLM Configuration UI** for the SDLC Agents 4 Enterprise VS Code extension. The feature enhances the existing basic Settings Panel (SettingsPanel.ts) into a polished, production-quality configuration experience with:

- Provider selection dropdown with rich descriptions and visual indicators
- Dynamic model list fetched from provider APIs (with static fallback)
- Secure API key management with masked input, status indicators, and per-provider key storage
- One-click connection testing with real-time feedback
- Provider-specific configuration sections (base URL, Ollama URL, ONNX model download)
- Responsive, accessible UI following VS Code design patterns

**Current State:** A basic SettingsPanel exists with functional provider dropdown, API key input, model select, and test button. However the UI needs refinement for production use — better error states, visual feedback, accessibility, and UX polish.

### 1.2 Out of Scope

- Backend LLM service configuration (backend/src/modules/memory/llm/) — separate concern
- New LLM provider integrations (adding new providers like Gemini native) — separate ticket
- Chat Panel model selector redesign — only sync with Settings panel
- ONNX model download progress UI (handled by existing native-addon-manager)
- Authentication/SSO integration with LLM providers (e.g., OAuth for cloud APIs)

### 1.3 Preliminary Requirement

- VS Code extension framework (extension.ts) running
- vscode.SecretStorage available for secure key storage
- Backend MCP Server running on port 48721 (for gateway model fetch)
- Webview-assets directory structure for CSS/JS files
- Existing SettingsPanel, ProviderConfigService, LlmTestService infrastructure

---

## 2. Business Requirements

### 2.1 High Level Process Map

The Rich LLM Config UI enables developers to configure their AI agent pipeline with the correct LLM provider in a guided, error-proof flow:

1. **Select Provider** — Choose from supported providers (Anthropic, OpenAI, OpenRouter, LM Studio, Ollama, ONNX)
2. **Configure Credentials** — Enter API key (or server URL for local providers)
3. **Select Model** — Pick from dynamically loaded model list
4. **Test Connection** — Verify end-to-end connectivity
5. **Save & Activate** — Configuration applied immediately to LangGraph pipeline

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source Ticket |
|---|------------------|----------|---------------|
| 1 | As a developer, I want to select an LLM provider from a rich dropdown with descriptions so that I can quickly understand what each provider offers | MUST HAVE | SA4E-12 |
| 2 | As a developer, I want to securely store and manage API keys per provider so that my credentials are safe and I can switch providers without re-entering keys | MUST HAVE | SA4E-12 |
| 3 | As a developer, I want to see available models for my selected provider (dynamically fetched) so that I always have the latest model options | MUST HAVE | SA4E-12 |
| 4 | As a developer, I want to test my LLM connection with one click so that I can verify everything works before using agents | MUST HAVE | SA4E-12 |
| 5 | As a developer, I want provider-specific configuration sections (base URL, Ollama URL) that show/hide contextually so that I only see relevant options | SHOULD HAVE | SA4E-12 |
| 6 | As a developer, I want visual status indicators (connected/disconnected/testing) so that I always know my LLM connection state | SHOULD HAVE | SA4E-12 |
| 7 | As a developer, I want the Settings panel to auto-test connection when I change providers so that I get immediate feedback | COULD HAVE | SA4E-12 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** Developer opens Settings Panel via command palette ("SDLC: Settings") or sidebar icon

**Step 2:** Panel displays current provider configuration with status indicator (connected ✅ / disconnected ❌ / unknown ⚪)

**Step 3:** Developer selects provider from dropdown → UI updates to show provider-specific config section

**Step 4:** Developer enters API key (for cloud providers) or server URL (for local providers)

**Step 5:** Developer selects model from dropdown (dynamically populated from provider/gateway API)

**Step 6:** Developer clicks "Test Connection" → UI shows loading state → displays result (success/error with details)

**Step 7:** On success, configuration is saved to VS Code settings and SecretStorage → LangGraph pipeline picks up new config immediately

> **Note:** Auto-test fires on provider change. Chat panel model selector syncs with Settings panel selection via kiroSdlc.llmModel config key.

---

#### STORY 1: Rich Provider Dropdown

> As a developer, I want to select an LLM provider from a rich dropdown with descriptions so that I can quickly understand what each provider offers.

**Requirement Details:**

1. Provider dropdown displays provider name + short description + icon/emoji
2. Options: Anthropic (recommended), OpenAI, OpenRouter, LM Studio, Ollama, ONNX
3. Each option indicates whether API key is required or it's a local provider
4. "Recommended" badge on Anthropic option
5. Selecting a provider immediately shows/hides relevant config sections
6. Provider selection persists in kiroSdlc.llmProvider VS Code setting (global scope)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| provider | enum | Yes | Selected LLM provider ID | `anthropic` |
| displayName | string | Yes | Human-readable provider name | `Anthropic` |
| description | string | Yes | Short description of provider | `Claude models (recommended)` |
| requiresApiKey | boolean | Yes | Whether provider needs API key | `true` |
| isLocal | boolean | Yes | Whether provider runs locally | `false` |

**Acceptance Criteria:**

1. Given the Settings panel opens, the provider dropdown shows all 6 providers with descriptions
2. Given I select "Ollama", the API key section hides and the Ollama URL section appears
3. Given I select "Anthropic", the API key section appears and the Ollama section hides
4. Given I select a provider and close/reopen the panel, my selection is preserved
5. Given the kiroSdlc.llmProvider config changes externally (e.g., settings.json edit), the UI updates to reflect it

**UI Specifications:**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | provider-select | Select/Dropdown | Yes | Provider selection dropdown | Shows all 6 providers |
| 2 | provider-description | Label | No | Inline description below dropdown | Updates on selection |
| 3 | provider-badge | Badge | No | "Recommended" badge | Only on Anthropic |
| 4 | connection-status | StatusIndicator | Yes | Green/Red/Gray dot next to provider | Reflects test result |

---

#### STORY 2: Secure API Key Management

> As a developer, I want to securely store and manage API keys per provider so that my credentials are safe and I can switch providers without re-entering keys.

**Requirement Details:**

1. API keys stored in VS Code SecretStorage (encrypted, not in settings.json)
2. Each provider has its own secret key (anthropic, openai, openrouter share openai key for compatible APIs)
3. Input shows masked value (password field) with toggle visibility button
4. "Key saved" status indicator shows whether key exists (without revealing value)
5. "Clear Key" button to remove stored key
6. Key validation: non-empty, reasonable length, correct prefix format (sk-*, etc.)
7. Save button disabled until key input changes from stored value

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| apiKey | string (secret) | Yes (for cloud providers) | Provider API key | `sk-ant-api03-...` |
| hasKey | boolean | Yes | Whether key is stored | `true` |
| keyPrefix | string | No | Expected key prefix for validation | `sk-` |

**Acceptance Criteria:**

1. Given I enter an API key and click "Save", the key is stored in SecretStorage (not settings.json)
2. Given a key is already saved, the input shows "••••••••" placeholder with "Key saved ✅" indicator
3. Given I click the eye icon, the masked input toggles to show/hide the actual key value
4. Given I click "Clear Key", the stored key is removed and the status indicator updates to "No key ❌"
5. Given I switch provider from Anthropic to OpenAI, the key section shows OpenAI key status (independent of Anthropic key)
6. Given I enter a key with wrong format (e.g., too short or missing prefix), a warning shows but save is still allowed (soft validation)

**Validation Rules:**

- API key must not be empty string or whitespace-only
- Warning (non-blocking) if key doesn't match expected prefix pattern for provider
- No max-length restriction (provider keys vary in length)

**Error Handling:**

- SecretStorage write failure: Show error toast "Failed to save API key. Check VS Code keychain settings."
- SecretStorage read failure: Show "Unable to read key status" in indicator area

---

#### STORY 3: Dynamic Model Selection

> As a developer, I want to see available models for my selected provider (dynamically fetched) so that I always have the latest model options.

**Requirement Details:**

1. Model dropdown populated per selected provider
2. For gateway-connected providers (Anthropic with base URL), fetch live model list from /v1/models
3. Fallback to static model catalog (chat-models.ts) when gateway unreachable
4. Model entries show: model name, optional description, optional rate multiplier badge
5. Auto-select recommended/default model when switching providers
6. "Custom model" option allowing free-text model ID input for advanced users
7. Selected model persists in kiroSdlc.llmModel VS Code setting

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| modelId | string | Yes | Selected model identifier | `claude-sonnet-4-20250514` |
| modelName | string | Yes | Display name | `Claude Sonnet 4` |
| description | string | No | Model description | `Best balance of speed and quality` |
| rateMultiplier | number | No | Cost multiplier relative to baseline | `1.3` |

**Acceptance Criteria:**

1. Given I select "Anthropic" provider with a configured gateway base URL, models are fetched live from the gateway /v1/models endpoint
2. Given the gateway is unreachable, the dropdown shows static fallback models without error
3. Given I select a model, it persists in kiroSdlc.llmModel and the Chat Panel updates its model selector
4. Given a provider has rate multipliers, each model option shows a cost badge (e.g., "2.2x" for Opus)
5. Given I select "Custom model" option, a text input appears where I can type any model ID
6. Given I switch providers, the model dropdown refreshes with new provider's models and auto-selects the default

---

#### STORY 4: One-Click Connection Test

> As a developer, I want to test my LLM connection with one click so that I can verify everything works before using agents.

**Requirement Details:**

1. "Test Connection" button in a dedicated card section
2. Test sends a lightweight request (isAvailable check) to the configured provider
3. During test: button shows loading spinner, text changes to "Testing..."
4. On success: green success message with provider name and response time
5. On failure: red error message with actionable troubleshooting hint
6. Connection status propagates to Chat Panel via VS Code commands (kiroSdlc.notifyLlmConnected/Disconnected)
7. Test has 10-second timeout with clear timeout message

**Acceptance Criteria:**

1. Given valid Anthropic config (key + default URL), clicking "Test" shows "✅ Connected to Anthropic (230ms)"
2. Given invalid API key, clicking "Test" shows "❌ Authentication failed. Check your API key."
3. Given network error (URL unreachable), shows "❌ Provider unreachable. Check base URL or network."
4. Given test in progress, the button is disabled and shows spinner
5. Given test completes (success or failure), the connection status badge in the provider section updates
6. Given timeout after 10 seconds, shows "❌ Connection timed out. Provider may be slow or unreachable."

**Error Handling:**

- Authentication error (401/403): "Authentication failed. Verify your API key is correct and active."
- Network error (ECONNREFUSED): "Cannot reach provider at {url}. Check the URL or your network."
- Timeout: "Connection timed out after 10s. The provider may be overloaded."
- Unknown error: "Unexpected error: {message}. Try again or check VS Code dev console."

---

#### STORY 5: Provider-Specific Configuration Sections

> As a developer, I want provider-specific configuration sections (base URL, Ollama URL) that show/hide contextually so that I only see relevant options.

**Requirement Details:**

1. Cloud providers (Anthropic, OpenAI, OpenRouter): Show API key section + optional base URL
2. Ollama: Show server URL input + model dropdown (fetched from Ollama /api/tags)
3. LM Studio: Show server URL input (default: localhost:1234/v1) + model dropdown
4. ONNX: Show model selection from local registry + download status
5. Base URL section has "Use default URL" checkbox — when checked, input is disabled and default URL shown
6. Each section has provider-specific help text/link

**Acceptance Criteria:**

1. Given I select Anthropic, I see: API key input, base URL (with "use default" checkbox), model dropdown, test button
2. Given I select Ollama, I see: server URL input (default localhost:11434), model dropdown (fetched from /api/tags), test button
3. Given I check "Use default URL" for Anthropic, the base URL input is disabled and shows the default (empty = official API)
4. Given I uncheck "Use default URL", the input enables and I can type a custom gateway URL
5. Given I select ONNX, I see available local models with download status (downloaded ✅ / not downloaded ⬇️)

---

#### STORY 6: Visual Status Indicators

> As a developer, I want visual status indicators (connected/disconnected/testing) so that I always know my LLM connection state.

**Requirement Details:**

1. Global connection status: badge in provider section header (✅ Connected / ❌ Disconnected / ⚪ Unknown / ⏳ Testing)
2. API key status: inline indicator next to key input (Key saved ✅ / No key ❌)
3. Test result: card below test button with colored background (green/red) and message
4. Status persists visually until next test or provider change
5. On extension activation, auto-test runs silently and updates badge (no toast)

**Acceptance Criteria:**

1. Given I have never tested, the connection badge shows ⚪ (unknown/gray)
2. Given a successful test, the badge updates to ✅ and remains green until next event
3. Given a failed test, the badge updates to ❌ and remains red
4. Given I change providers, the badge resets to ⚪ until auto-test completes
5. Given the API key is stored, the key status shows "✅ Key saved" next to the input

---

#### STORY 7: Auto-Test on Provider Change

> As a developer, I want the Settings panel to auto-test connection when I change providers so that I get immediate feedback.

**Requirement Details:**

1. When provider dropdown selection changes, trigger auto-test after 500ms debounce
2. Auto-test updates connection badge and sends notification to chat panel
3. Auto-test uses 8-second timeout (shorter than manual test)
4. Auto-test failure does NOT show error toast (silent) — only updates badge
5. Manual "Test" button always available regardless of auto-test result

**Acceptance Criteria:**

1. Given I change provider to Ollama (with Ollama running), badge auto-updates to ✅ within 2 seconds
2. Given I rapidly switch providers 3 times, only the final provider is tested (debounce)
3. Given auto-test fails, no toast notification appears — only badge turns ❌
4. Given auto-test succeeds, chat panel receives kiroSdlc.notifyLlmConnected command

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| VS Code SecretStorage API | System | N/A | Required for secure API key storage |
| ProviderConfigService | System | SA4E-12 (existing) | Service for reading/writing LLM config to VS Code settings |
| LlmTestService | System | SA4E-12 (existing) | Service for testing LLM connectivity |
| chat-models.ts | System | SA4E-12 (existing) | Static model catalog and gateway fetch logic |
| Webview Assets | System | N/A | CSS and JS files for Settings panel webview |
| Backend MCP Server | System | SA4E-1 | Gateway model list endpoint (/v1/models) |
| LangGraph Engine | System | SA4E-1 | Consumes configured LLM provider for pipeline execution |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Product Owner | SA4E Team Lead | Approve requirements, prioritize features | Ticket reporter |
| Developer | Extension Dev | Implement UI components and services | Assigned developer |
| QA | QA Agent | Verify UI functionality and accessibility | Pipeline |
| End User | Developers using SDLC agents | Configure LLM provider for agent pipeline | Primary users |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Gateway /v1/models endpoint unavailable | Medium | Medium | Static fallback catalog ensures UI always has model options |
| API key exposed in webview postMessage | High | Low | Keys never sent to webview — only hasKey boolean. Storage/retrieval happens in extension host |
| Provider API changes model IDs | Low | Medium | Static catalog updated periodically; custom model input as escape hatch |
| VS Code SecretStorage not available (remote/web scenarios) | Medium | Low | Graceful degradation — show warning, allow config without key storage |
| CSS conflicts with VS Code theme updates | Low | Medium | Use VS Code CSS variables (--vscode-*) for all colors |

### 5.2 Assumptions

- VS Code 1.85+ is the minimum supported version (SecretStorage API stable)
- Webview communication is secure within the VS Code extension host sandbox
- Developers have internet access for cloud provider connection testing
- The chat-models.ts static catalog is kept up-to-date with major model releases
- Only one Settings panel instance exists at a time (singleton pattern)
- Configuration changes apply immediately — no "apply" button or restart needed

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Panel opens in < 500ms | No heavy computation on open; model fetch is async and non-blocking |
| Performance | Auto-test completes in < 8s | Timeout ensures UI doesn't hang indefinitely |
| Performance | Provider switch UI update < 100ms | Show/hide sections with CSS transitions, no re-render |
| Security | API keys never leave SecretStorage | Keys stored encrypted; webview only receives hasKey boolean |
| Security | No key in postMessage | Extension host handles all secret read/write; webview never touches raw keys |
| Accessibility | WCAG 2.1 AA compliance | Keyboard navigation, screen reader labels, focus management, contrast ratios |
| Accessibility | All form controls have labels | aria-label or visible label for every input/button/select |
| Usability | Consistent with VS Code design | Use VS Code CSS variables, standard form patterns, familiar UX |
| Reliability | Graceful degradation | If gateway unavailable → static models; if SecretStorage fails → warning message |
| Maintainability | < 200 lines per file | Follow project code standards (SRP, file size limits) |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-12 | Rich LLM Configuration UI | In Progress | Story | Main ticket |
| SA4E-1 | Backend MCP Server (Core Infrastructure) | Done | Story | Foundation — gateway API |
| SA4E-6 | Sandbox Execution (MCP Server Bridge) | In Progress | Story | Sibling feature — uses configured LLM |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| LLM | Large Language Model — AI model used by agents for code generation and analysis |
| Provider | LLM service (Anthropic, OpenAI, Ollama, etc.) that hosts/serves models |
| Gateway | Local proxy server that routes requests to LLM providers with model management |
| SecretStorage | VS Code encrypted storage API for sensitive data (API keys) |
| MCP | Model Context Protocol — communication protocol between agents and tools |
| ONNX | Open Neural Network Exchange — format for running local AI models on CPU |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| SA4E Architecture Report | .code-intel/SA4E-ARCHITECTURE.md |
| Existing SettingsPanel | extension/src/panels/settings/SettingsPanel.ts |
| ProviderConfigService | extension/src/services/ProviderConfigService.ts |
| LlmTestService | extension/src/services/LlmTestService.ts |
| Chat Models Catalog | extension/src/chat-panel/chat-models.ts |
| LlmProviderConfig | extension/src/models/LlmProviderConfig.ts |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
