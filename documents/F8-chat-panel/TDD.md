# Technical Design Document (TDD)

## Kiro SDLC — F8-chat-panel: Chat Panel

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F8-chat-panel |
| Title | Chat Panel — Technical Design |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F8-chat-panel.docx |
| Related FSD | FSD-v1-F8-chat-panel.docx |
| Pattern | AI Agent System + Plugin (VS Code Extension) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initiate document — architecture and component design |

---

## 1. Introduction

### 1.1 Purpose

Design the Chat Panel as a modular, extensible VS Code WebviewViewProvider that separates concerns across managers, handlers, and a protocol layer while maintaining less than 200 lines per file per project standards.

### 1.2 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Platform | VS Code Extension API | 1.74+ |
| UI Runtime | Webview (DOM, vanilla JS) | HTML5 |
| Build | esbuild | latest |
| Test | Vitest | latest |
| UUID | uuid (v4) | 9.x |
| Markdown | Custom renderer (no external lib) | — |

### 1.3 Design Principles

- **Single Responsibility** — each file/class has one reason to change
- **File max 200 lines** — enforced via project code standards
- **Function max 20 lines** — extract helpers aggressively
- **No external UI frameworks** — vanilla JS for webview (CSP compliance, minimal bundle)
- **Type-safe message protocol** — discriminated unions for all postMessage types
- **Fail-safe defaults** — disconnected state is safe, missing data leads to graceful fallback

### 1.4 Constraints

- Webview runs in sandboxed iframe — no Node.js access
- CSP: no inline scripts, no external connects, nonce-based
- postMessage is async, unordered — design for eventual consistency
- Extension host is single-threaded — avoid blocking operations
- SecretStorage for API keys only — never in webview

### 1.5 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F8-chat-panel.docx |
| FSD | FSD-v1-F8-chat-panel.docx |

---

## 2. System Architecture

### 2.1 Architecture Overview

The Chat Panel follows a Model-View-Controller pattern adapted for VS Code webviews:

- **View**: Webview HTML/CSS/JS (chat.js, markdown-renderer.js, graph-viz.js)
- **Controller**: ChatPanelProvider (routes messages), MessageHandler (dispatches actions)
- **Model**: ConversationManager, TokenCounter, ContextUsageTracker (domain state)
- **Services**: ChatStatusManager, ChatModelManager, ChatStateManager (concern-separated managers)

![Architecture Diagram](diagrams/architecture.png)

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

### 2.3 Layer Communication

The extension host communicates with the webview via VS Code postMessage API. All messages are typed via discriminated unions defined in message-protocol.ts. The extension host contains all business logic; the webview is a thin rendering layer.

---

## 3. Component Design

### 3.1 ChatPanelProvider (Controller)

**File:** `chat-panel/chat-panel-provider.ts` (~170 lines)

**Responsibility:** WebviewViewProvider lifecycle, message routing to managers/handlers

**Key Design Decisions:**
- Implements `vscode.WebviewViewProvider` + `vscode.Disposable`
- Delegates ALL business logic to extracted managers
- Manages message buffer (max 200) for when webview is hidden
- Lazy-initializes LangGraphEngine and MessageHandler

**Public API:**

| Method | Description |
|--------|-------------|
| resolveWebviewView() | VS Code lifecycle — set options, generate HTML, register listeners |
| notifyLlmStatusChanged(status) | Called by Settings panel when LLM status changes |
| saveChatState(state) | External state save trigger |
| sendContextUsage(tabId) | Send token breakdown for tab |
| getContextUsageTracker() | Accessor for tracker instance |
| dispose() | Cleanup engine and disposables |

**Message Routing Priority:**
1. `executeCommand` — immediate VS Code command execution
2. `chat:saveState` — StateManager (immediate, no response)
3. `chat:debugLog` — debug logging (immediate, no response)
4. `ready` — initialization sequence (status + models + state + steering)
5. All others — delegated to MessageHandler.handle()

### 3.2 MessageHandler (Dispatcher)

**File:** `chat-panel/message-handler.ts` (~120 lines)

**Pattern:** Switch-based dispatcher with callback injection (Dependency Inversion)

**Constructor Dependencies (all callbacks):**

| Callback | Purpose |
|----------|---------|
| getEngine | Lazy LangGraphEngine factory |
| sendToWebview | Output message callback |
| onPickContext | Context picker trigger |
| onPickAttachment | File picker trigger |
| onApplyCode | Editor apply action |
| onInsertCode | Editor insert action |
| onSetModel | Config update action |

**Design Rationale:** Callbacks decouple MessageHandler from VS Code API specifics. The handler only knows about LangGraphEngine and message types, making it fully testable without VS Code mocks.

### 3.3 MessageRouting (Pure Functions)

**File:** `chat-panel/message-routing.ts` (~110 lines)

**Exported Functions:**

| Function | Purpose | Pure? |
|----------|---------|-------|
| buildEnrichedText(text, context[]) | Wrap context in XML before message | Yes |
| routeUserMessage(text, enriched, getEngine, sendToWebview) | Pattern-match and execute | No (side effects) |
| parsePhase(action) | Map action string to SDLCPhase | Yes |

**Routing Algorithm (priority order):**
1. Direct commands (status, resume, cancel) — exact match
2. Agent prefix (/agent-name task) — regex match
3. Ticket pattern ([A-Z]+-\d+ action) — regex match
4. Default: general chat

### 3.4 ConversationManager (Domain Model)

**File:** `chat-panel/conversation-manager.ts` (~130 lines)

**Data Structure:** `Map<string, ConversationTab>` keyed by UUID v4

**Invariants (enforced by all mutation methods):**
- tabs.size >= 1 (cannot close last)
- tabs.size <= maxTabs (cannot create over limit)
- Exactly one tab has isActive=true at any time
- tabCounter increases monotonically

**Operations:**

| Operation | Complexity | Throws? |
|-----------|-----------|---------|
| createTab() | O(1) | Yes (max reached) |
| switchTab(id) | O(1) | Yes (not found) |
| closeTab(id) | O(n) for neighbor find | Yes (last tab, not found) |
| renameTab(id, name) | O(1) | Yes (not found) |
| addMessage(id, msg) | O(1) | Yes (not found) |

### 3.5 TokenCounter (Domain Service)

**File:** `chat-panel/token-counter.ts` (~90 lines)

**Token Estimation:**
- Per message: `ceil(content.length / 4) + 4` (4 chars/token + role overhead)
- Per conversation: sum(message tokens) + 100 (system prompt overhead)

**Model Context Limits:**

| Model Pattern | Max Tokens |
|--------------|-----------|
| claude-* | 200,000 |
| gpt-4o* | 128,000 |
| deepseek-* | 64,000 |
| Default fallback | 128,000 |

**Threshold Configuration (overridable via constructor):**

| Threshold | Default Ratio |
|-----------|--------------|
| warning | 0.60 |
| critical | 0.80 |
| full | 0.95 |

### 3.6 ContextUsageTracker

**File:** `chat-panel/context-usage-tracker.ts` (~110 lines)

**Per-tab breakdown:**
- conversation: updated via updateFromMessages()
- mcpTools: updated via addToolTokens() (incremental)
- steering: updated via updateSteeringTokens()

**Payload structure returned to webview:**

```typescript
interface ContextUsagePayload {
  tabId: string;
  conversation: { tokens: number; percentage: number };
  mcpTools: { tokens: number; percentage: number };
  steering: { tokens: number; percentage: number };
  total: { tokens: number; percentage: number; threshold: ContextThreshold };
  maxTokens: number;
}
```

### 3.7 ChatStatusManager

**File:** `chat-panel/ChatStatusManager.ts` (~50 lines)

**Combined Status Logic:**
1. Map MCP raw status → webview status
2. If MCP not connected → return that
3. If MCP connected → check LLM via `provider.isAvailable()`
4. LLM check timeout/error → "disconnected"

### 3.8 ChatModelManager

**File:** `chat-panel/ChatModelManager.ts` (~50 lines)

**Model Resolution Strategy:**
1. Read provider from config
2. Check if gateway URL (127.0.0.1)
3. If gateway → fetch live from /v1/models (5s timeout)
4. If fetch fails or not gateway → use static catalog
5. Determine selected model (config > first in list > provider default)

### 3.9 ChatStateManager

**File:** `chat-panel/ChatStateManager.ts` (~130 lines)

**Persistence:** VS Code workspaceState Memento, key = "chatPanel.state"

**Restore sequence:**
1. Read state from Memento
2. Validate: tabs array non-empty
3. Send tab:updated to webview
4. Extract last 20 messages from active tab
5. Call engine.setChatHistory() for context continuity

**Steering Discovery:**
- Recursive scan of `.kiro/steering/` for .md files
- Filter: frontmatter `inclusion: always` or `inclusion: auto`
- Send to webview as `chat:steeringLoaded`

### 3.10 ChatContextPicker

**File:** `chat-panel/ChatContextPicker.ts` (~190 lines)

**Dispatch table (contextType → method):**

| Type | VS Code API | Returns |
|------|-------------|---------|
| file | showOpenDialog | ContextItem with path |
| folder | showOpenDialog (canSelectFolders) | ContextItem with path |
| problems | languages.getDiagnostics() | ContextItem with content |
| gitDiff | child_process (git diff) | ContextItem with content |
| terminal | Active terminal buffer | ContextItem with content |
| spec | workspace.findFiles + quickPick | ContextItem with content |
| currentFile | activeTextEditor.document | ContextItem with content |
| steering | findFiles + quickPick | ContextItem with content |
| mcp | HTTP GET tools/list | ContextItem with content |

### 3.11 ChatHtmlBuilder

**File:** `chat-panel/ChatHtmlBuilder.ts` (~180 lines)

**Static class with build() + section helpers.**

HTML sections generated:
1. Header (status indicator, context arc)
2. Tab bar (role=tablist)
3. Steering section (collapsible)
4. Warnings (context full, working bar)
5. Welcome state (suggestions)
6. Messages area
7. Input area (contenteditable, toolbar, menus)

**CSP Implementation:**
- Generate unique nonce per resolve
- All script tags use nonce attribute
- No inline event handlers in HTML

### 3.12 Message Protocol (Type Layer)

**File:** `chat-panel/message-protocol.ts` (~130 lines)

**Pattern:** Discriminated union types using `type` field

Two main types:
- `ChatWebviewToExtMessage` — union of 20+ webview→extension messages
- `ChatExtToWebviewMessage` — union of 18+ extension→webview messages

Each message type is a distinct interface with required fields. TypeScript exhaustive switch checking ensures all types handled.

---

## 4. Webview Frontend Design

### 4.1 Architecture (vanilla JS)

No framework — direct DOM manipulation with event delegation.

**Files:**
- `chat.js` — Main controller (event binding, state, postMessage)
- `markdown-renderer.js` — Markdown → HTML converter with streaming support
- `graph-viz.js` — Pipeline graph visualization

### 4.2 Streaming Render Strategy

```
onStreamChunk(chunk):
  1. Append chunk to current message buffer
  2. Parse buffer as markdown (incremental — only new content)
  3. Append new HTML nodes to message container
  4. If following output: scrollToBottom()
```

No full re-render per chunk — only append new DOM nodes.

### 4.3 Code Block Actions

Each fenced code block renders with action buttons:
- **Copy** — clipboard API
- **Apply** — postMessage({type: "chat:applyCode", code, filePath})
- **Insert** — postMessage({type: "chat:insertCode", code})

filePath extracted from code block metadata (if language specifies file path).

---

## 5. Error Handling Strategy

| Layer | Error Type | Strategy | User Notification |
|-------|-----------|----------|-------------------|
| Provider | Handler throws | try/catch → chat:error | Error message with retry |
| Provider | View undefined | Buffer messages (max 200) | None (deferred) |
| Config | Update fails | try/catch, non-fatal | None |
| Model | Gateway fetch fails | Return null → static fallback | None |
| Status | LLM check fails | Catch → "disconnected" | Status indicator |
| Webview | Invalid message | Ignore | None |
| Code Action | No editor | showWarningMessage | VS Code toast |
| Conversation | Max tabs | Throw Error | Caught by handler |

---

## 6. Security Design

### 6.1 Content Security Policy

Strict CSP prevents XSS and data exfiltration:
- `default-src 'none'` — deny everything by default
- `script-src 'nonce-{random}'` — only nonce-matched scripts
- `connect-src 'none'` — no outbound network from webview
- Images restricted to extension resources and data: URIs

### 6.2 Data Protection

- API keys: SecretStorage only, never exposed to webview
- User messages: sent to configured LLM provider only (via extension host)
- File content: read via VS Code FS API, never cached in webview
- State: stored in workspaceState (local, not synced)

---

## 7. Performance Design

| Metric | Target | Strategy |
|--------|--------|----------|
| Panel activation | < 200ms | Pre-built HTML, lazy engine init |
| Stream chunk render | < 16ms | Incremental DOM append, no full re-render |
| State save | < 50ms | Fire-and-forget Memento update |
| State restore | < 200ms | Direct object deserialize, no file I/O |
| Memory (buffer) | < 200 messages | FIFO eviction |
| Memory (tabs) | 10 max | Hard cap in ConversationManager |

---

## 8. Implementation Checklist

### Existing Files (all implemented)

| # | File | Lines | Status |
|---|------|-------|--------|
| 1 | chat-panel-provider.ts | ~170 | Complete |
| 2 | message-handler.ts | ~120 | Complete |
| 3 | message-routing.ts | ~110 | Complete |
| 4 | message-protocol.ts | ~130 | Complete |
| 5 | conversation-manager.ts | ~130 | Complete |
| 6 | conversation-types.ts | ~50 | Complete |
| 7 | token-counter.ts | ~90 | Complete |
| 8 | context-usage-tracker.ts | ~110 | Complete |
| 9 | ChatStatusManager.ts | ~50 | Complete |
| 10 | ChatModelManager.ts | ~50 | Complete |
| 11 | ChatStateManager.ts | ~130 | Complete |
| 12 | ChatContextPicker.ts | ~190 | Complete |
| 13 | ChatHtmlBuilder.ts | ~180 | Complete |
| 14 | chat-models.ts | ~190 | Complete |

### Webview Assets

| # | File | Purpose |
|---|------|---------|
| 1 | chat/chat.js | Main UI controller |
| 2 | chat/chat.css | Styles |
| 3 | chat/markdown-renderer.js | MD rendering |
| 4 | chat/graph-viz.js | Pipeline graph |

### Test Coverage Targets

| Module | Target | Priority |
|--------|--------|----------|
| ConversationManager | 95% | P0 |
| TokenCounter | 95% | P0 |
| MessageRouting | 90% | P0 |
| ContextUsageTracker | 90% | P1 |
| ChatModelManager | 85% | P1 |
| ChatStateManager | 80% | P2 |

---

## 9. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
