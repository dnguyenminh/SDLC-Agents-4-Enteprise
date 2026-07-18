# Functional Specification Document (FSD)

## Kiro SDLC — F8-chat-panel: Chat Panel

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F8-chat-panel |
| Title | Chat Panel — Functional Specification |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F8-chat-panel.docx |
| Pattern | AI Agent System + Plugin (VS Code Extension) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA + TA | Initiate document — business flows + technical enrichment |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Chat Panel feature — the primary conversational UI of the Kiro SDLC Agent system. It details use cases, message protocols, state management, and integration points.

### 1.2 Scope

Covers: Webview initialization, message routing, conversation management, context injection, token tracking, model selection, streaming display, code actions, pipeline integration, and state persistence.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Webview | VS Code embedded web content panel (HTML/CSS/JS sandbox) |
| postMessage | VS Code API for bidirectional webview ↔ extension communication |
| CSP | Content Security Policy — restricts webview resource loading |
| Streaming | Server-Sent Events pattern for progressive LLM response delivery |
| Context Item | A piece of workspace information (file, diff, etc.) attached to a message |
| Token | LLM processing unit (~4 English characters) |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F8-chat-panel.docx |
| VS Code Webview API | https://code.visualstudio.com/api/extension-guides/webview |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Chat Panel operates within VS Code as a WebviewViewProvider sidebar:

| External Actor | Interaction |
|----------------|-------------|
| Developer (User) | Types messages, attaches context, selects models, applies code |
| LLM Provider (Anthropic/OpenAI/Ollama) | Receives prompts, streams responses |
| MCP Server | Provides tool execution, reports connection status |
| VS Code API | Provides webview, file system, editor, diagnostics, terminal access |
| LangGraph Engine | Executes pipelines, manages agent state, streams output |

### 2.2 Architecture Layers

| Layer | Responsibility | Key Files |
|-------|---------------|-----------|
| Webview (Frontend) | HTML/CSS/JS UI rendering | chat.js, chat.css, markdown-renderer.js, graph-viz.js |
| Message Protocol | Type-safe bidirectional communication | message-protocol.ts |
| Provider (Controller) | Routes messages, manages lifecycle | chat-panel-provider.ts |
| Managers | Separated concerns (status, model, state) | ChatStatusManager, ChatModelManager, ChatStateManager |
| Message Handling | Dispatches to engine actions | message-handler.ts, message-routing.ts |
| Domain Logic | Conversations, tokens, context | ConversationManager, TokenCounter, ContextUsageTracker |
| Engine Integration | LLM invocation, pipeline execution | LangGraphEngine (external) |

---

## 3. Functional Requirements

### 3.1 Feature: Webview Initialization & Lifecycle

**Source:** BRD Story 1, 9, 10

#### 3.1.1 Use Case: UC-01 — Panel Activation

**Actor:** Developer
**Preconditions:** VS Code extension activated, Chat Panel view registered
**Postconditions:** Webview loaded, status checked, state restored

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Opens sidebar | | Developer clicks Chat Panel icon |
| 2 | | resolveWebviewView() | VS Code calls provider |
| 3 | | Set webview options | enableScripts=true, localResourceRoots set |
| 4 | | Generate HTML | ChatHtmlBuilder.build() produces page |
| 5 | | Register listeners | onDidReceiveMessage, onDidDispose, onDidChangeVisibility |
| 6 | webview sends "ready" | | JS loaded, DOM ready |
| 7 | | sendCombinedStatus() | Check MCP + LLM connectivity |
| 8 | | sendModels() | Send available model list |
| 9 | | restoreChatState() | Restore tabs/messages from Memento |
| 10 | | sendSteeringInfo() | Load and send steering rules |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | Panel was previously visible (reuse) | Skip HTML generation, flush message buffer |
| AF-02 | workspaceState empty (first use) | Skip restore, show welcome state |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | MCP + LLM both disconnected | Show "disconnected" status, disable send |
| EF-02 | Extension URI invalid | Log error, show blank panel |

---

### 3.2 Feature: Message Sending & Routing

**Source:** BRD Story 1, 6, 12

#### 3.2.1 Use Case: UC-02 — Send Message

**Actor:** Developer
**Preconditions:** Panel active, status = connected
**Postconditions:** Message routed, response streaming

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Types message | | In contenteditable input |
| 2 | Clicks Send (or Enter) | | Submit message |
| 3 | | Receive `chat:userMessage` | With text + context[] + attachments[] |
| 4 | | buildEnrichedText() | Wrap context items in XML |
| 5 | | routeUserMessage() | Pattern-match to determine routing |
| 6 | | Show working status | `chat:workingStatus` working=true |
| 7 | | Execute (varies by route) | See routing table below |
| 8 | | Stream response | `chat:streamChunk` events |
| 9 | | Complete | `chat:streamComplete` + working=false |

**Routing Decision Table:**

| Pattern | Route | Handler |
|---------|-------|---------|
| `[A-Z]+-\d+ action` | SDLC Pipeline | engine.invoke(ticket, phase) |
| `status` / `resume` / `cancel` | Direct Command | handleDirectCommand() |
| `/agent-name task` | Agent Invocation | engine.invokeChat("[Agent: name] task") |
| Everything else | General Chat | engine.invokeChat(enrichedText) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | User cancels during stream | engine.cancel(), show "Cancelled by user" |
| AF-02 | Message is `executeCommand` type | vscode.commands.executeCommand(command) |
| AF-03 | Message is `chat:debugLog` | debugLog(text), no response |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Handler throws error | Send `chat:error` with HANDLER_ERROR code, retryable=true |

---

### 3.3 Feature: Multi-tab Conversation Management

**Source:** BRD Story 2

#### 3.3.1 Use Case: UC-03 — Create Tab

**Actor:** Developer
**Preconditions:** < 10 tabs open
**Postconditions:** New tab created and active

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Clicks "+" button | | Tab bar add button |
| 2 | | ConversationManager.createTab() | Generate UUID, set name "Chat N" |
| 3 | | Deactivate previous tab | isActive = false |
| 4 | | Send tab:updated | Webview updates tab bar |

**Business Rules:**

| ID | Rule | Details |
|----|------|---------|
| BR-01 | Max 10 tabs | Error thrown if exceeded |
| BR-02 | Tab name max 30 chars | Truncated on rename |
| BR-03 | Cannot close last tab | Error "Cannot close the last tab" |
| BR-04 | Close activates neighbor | Left preferred, right if leftmost |
| BR-05 | Initial tab auto-created | On ConversationManager construction |

#### 3.3.2 Use Case: UC-04 — Switch Tab

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Clicks tab | | In tab bar |
| 2 | | switchTab(tabId) | Save current, activate target |
| 3 | | engine.switchActiveTab(tabId) | Update engine context |
| 4 | | Send tab:updated | Webview renders target tab messages |

---

### 3.4 Feature: Model Selection

**Source:** BRD Story 3

#### 3.4.1 Use Case: UC-05 — Change Model

**Actor:** Developer
**Preconditions:** Panel active
**Postconditions:** Model updated in settings, dropdown reflects selection

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Clicks model selector | | Opens dropdown |
| 2 | Selects model | | From available list |
| 3 | | Receive `chat:setModel` | model = selected ID |
| 4 | | Update VS Code config | kiroSdlc.llmModel = model |
| 5 | | Trigger config change | Re-creates LLM provider in engine |
| 6 | | Re-send status | Combined status check |

**Model Resolution Logic (Pseudocode):**

```
function resolveModels(provider):
  models = getStaticModels(provider)
  if isGatewayUrl(anthropicBaseUrl):
    gatewayModels = fetchGatewayModels(baseUrl)  // GET /v1/models, timeout 5s
    if gatewayModels.length > 0:
      models = gatewayModels
  selected = config.llmModel || models[0].id
  if selected not in models:
    selected = models[0].id
  return { provider, models, selected, supportsAuto: true }
```

**Supported Providers:**

| Provider | Default Model | Context Window |
|----------|---------------|----------------|
| anthropic | claude-sonnet-4-20250514 | 200K |
| openai | gpt-4o | 128K |
| ollama | llama3.1 | varies |
| onnx | phi-3-mini | local |
| lmstudio | local-model | varies |
| openrouter | anthropic/claude-sonnet-4 | varies |

---

### 3.5 Feature: Context Picker

**Source:** BRD Story 4

#### 3.5.1 Use Case: UC-06 — Pick Context

**Actor:** Developer
**Preconditions:** Panel active, workspace open
**Postconditions:** Context item added to input chips

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Clicks "#" button | | Opens context menu |
| 2 | Selects context type | | file/folder/problems/gitDiff/terminal/spec/currentFile/steering/mcp |
| 3 | | ChatContextPicker.pick(type) | Delegates to type-specific handler |
| 4 | | Returns ContextItem | {type, label, path?, content?} |
| 5 | | Send `chat:contextPicked` | Webview shows chip |

**Context Type Handlers:**

| Type | Handler | Picker UI | Content Source |
|------|---------|-----------|----------------|
| file | pickFile() | VS Code file dialog | File path (content read at send) |
| folder | pickFolder() | VS Code folder dialog | Folder path |
| problems | pickProblems() | None (auto) | vscode.languages.getDiagnostics() |
| gitDiff | pickGitDiff() | None (auto) | `git diff` + `git diff --staged` |
| terminal | pickTerminal() | None (auto) | Active terminal buffer |
| spec | pickSpec() | Quick pick (spec list) | .kiro/specs file content |
| currentFile | pickCurrentFile() | None (auto) | Active editor document text |
| steering | pickSteering() | Quick pick | .kiro/steering file content |
| mcp | pickMcp() | None (auto) | MCP tools/list response |

**Context Assembly (enriched text format):**

```xml
<context>
<file name="src/auth.ts" path="/project/src/auth.ts">
...file content...
</file>
<gitDiff name="Unstaged Changes">
...diff content...
</gitDiff>
</context>

User's actual message here
```

---

### 3.6 Feature: Token Counting & Context Usage

**Source:** BRD Story 5

#### 3.6.1 Use Case: UC-07 — Monitor Context Window

**Actor:** Developer (passive — visual indicator)
**Preconditions:** Active conversation with messages
**Postconditions:** Usage UI updated

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Message added to conversation | Token count updated |
| 2 | | ContextUsageTracker.getUsagePayload() | Calculate totals |
| 3 | | Send `chat:contextUsage` | Payload with breakdown |
| 4 | | Webview updates arc | Color + percentage |
| 5 | | Check threshold transition | If crosses boundary → toast |

**Token Estimation Algorithm:**

```
function countMessageTokens(content: string): number
  if empty(content): return 0
  return ceil(content.length / 4) + 4  // +4 overhead for role/formatting

function countConversationTokens(messages: TabMessage[]): number
  total = sum(msg.tokenCount for msg in messages)
  total += 100  // system prompt overhead
  return total
```

**Context Budget Categories:**

| Category | Source | Tracked By |
|----------|--------|-----------|
| conversation | User + assistant messages | updateFromMessages() |
| mcpTools | Tool call results | addToolTokens() |
| steering | Loaded steering rules | updateSteeringTokens() |

**Threshold Rules:**

| Threshold | Ratio | UI Behavior |
|-----------|-------|-------------|
| safe | < 60% | Green arc, no notification |
| warning | 60-80% | Yellow arc, toast on transition |
| critical | 80-95% | Red arc, toast on transition |
| full | >= 95% | Red arc + "Context full" banner + "Start new tab" link |

---

### 3.7 Feature: Streaming & Markdown Rendering

**Source:** BRD Story 7

#### 3.7.1 Use Case: UC-08 — Render Streaming Response

**Actor:** System (LLM via engine)
**Preconditions:** Message sent, LLM processing
**Postconditions:** Formatted response visible with code actions

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Engine fires streamChunk | Content chunk + metadata |
| 2 | | postMessage to webview | `chat:streamChunk` event |
| 3 | | markdown-renderer.js | Parse and render incrementally |
| 4 | | Detect code blocks | Add copy/apply/insert buttons |
| 5 | | Auto-scroll to bottom | Follow output option |
| 6 | | Engine fires streamComplete | Final content + metadata |
| 7 | | Finalize rendering | Remove streaming cursor |

**Stream Message Format:**

```typescript
{
  type: "chat:streamChunk",
  streamId: string,      // unique per response
  nodeId: string,        // which graph node produced this
  eventType: StreamEventType,
  content: string,       // incremental text chunk
  timestamp: string,
  metadata?: Record<string, unknown>
}
```

**Markdown Rendering Features:**

| Feature | Implementation |
|---------|---------------|
| Headings (H1-H6) | HTML headers |
| Bold/Italic | Standard markdown |
| Code blocks (fenced) | Syntax highlighting + action buttons |
| Inline code | Monospace span |
| Lists (ordered/unordered) | HTML lists |
| Tables | HTML tables |
| Links | Clickable (CSP restricted) |
| Images | Inline from data: URIs only |

---

### 3.8 Feature: Code Actions

**Source:** BRD Story 11

#### 3.8.1 Use Case: UC-09 — Apply Code to Editor

**Actor:** Developer
**Preconditions:** Response rendered with code block
**Postconditions:** Code applied to editor

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Clicks "Apply" on code block | | Button in rendered response |
| 2 | | Receive `chat:applyCode` | {code, filePath?} |
| 3 | | Check active editor | vscode.window.activeTextEditor |
| 4 | | Determine apply mode | Selection? Full-file? |
| 5 | | Apply edit | editor.edit() with replace/insert |

**Apply Decision Logic:**

```
if no activeEditor AND filePath:
  open file → apply
elif no activeEditor AND no filePath:
  show warning "No active editor"
elif activeEditor.selection.isEmpty AND code starts with "import " or "package ":
  replace entire file content
elif activeEditor.selection.isEmpty:
  insert at cursor
else:
  replace selection
```

---

### 3.9 Feature: Pipeline Approval

**Source:** BRD Story 14

#### 3.9.1 Use Case: UC-10 — Approve Quality Gate

**Actor:** Developer
**Preconditions:** Pipeline paused at quality gate
**Postconditions:** Pipeline resumes or modifies course

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Send `chat:approvalRequest` | Checkpoint details displayed |
| 2 | Developer reviews | | Reads quality gate info |
| 3 | Clicks approve/reject/revise | | With optional feedback text |
| 4 | | Receive `chat:approvalAction` | {decision, feedback?} |
| 5 | | engine.handleApproval() | Pipeline continues or adjusts |

**Decision Options:**

| Decision | Pipeline Behavior |
|----------|------------------|
| approve | Continue to next phase |
| reject | Stop pipeline, report failure |
| revise | Retry with feedback incorporated |

---

### 3.10 Feature: State Persistence

**Source:** BRD Story 9

#### 3.10.1 Use Case: UC-11 — Save/Restore Chat State

**Trigger:** Every state change (message, tab switch, draft update)
**Storage:** VS Code workspaceState Memento (key: "chatPanel.state")

**State Schema:**

```typescript
interface PersistedState {
  tabs: Array<{
    id: string;
    name: string;
    messages: TabMessage[];
    tokenCount: number;
    maxTokens: number;
    isActive: boolean;
    scrollPosition: number;
    draftMessage: string;
  }>;
  activeTabId: string;
  messageHistory?: string[];  // stringified for engine restore
}
```

**Restore Sequence:**

1. Read state from Memento
2. If valid (tabs.length > 0): send `tab:updated` to webview
3. Find active tab, extract last 20 user/assistant messages
4. Call engine.setChatHistory() to restore context

---

### 3.11 Feature: Connection Status

**Source:** BRD Story 10

#### 3.11.1 Use Case: UC-12 — Combined Status Check

**Trigger:** Panel ready, MCP status change, config change

**Status Logic:**

```
function sendCombinedStatus():
  mcpStatus = mcpManager.status
  webviewStatus = mapServerStatusToWebview(mcpStatus)
  if webviewStatus != "connected":
    send "serverStatus" = webviewStatus
    return
  llmAvailable = await provider.isAvailable()
  send "serverStatus" = llmAvailable ? "connected" : "disconnected"
```

**Status Values:**

| Status | Meaning | UI |
|--------|---------|-----|
| connected | MCP + LLM both available | Green dot |
| disconnected | Either MCP or LLM unavailable | Red dot |
| failed | Connection error state | Red dot with "failed" text |

---

## 4. Message Protocol Specification

### 4.1 Webview → Extension (ChatWebviewToExtMessage)

| Message Type | Payload | Description |
|-------------|---------|-------------|
| ready | — | Webview loaded and ready |
| refresh | — | Request full state refresh |
| chat:userMessage | text, context?, attachments? | User sends chat message |
| chat:approvalAction | decision, feedback? | Pipeline approval response |
| chat:cancelStream | streamId? | Cancel ongoing generation |
| chat:resumePipeline | threadId | Resume paused pipeline |
| chat:clearHistory | — | Clear conversation |
| chat:startFresh | — | Reset to welcome state |
| chat:pickContext | contextType | Request context picker |
| chat:pickAttachment | — | Request file attachment dialog |
| chat:setModel | model | Change active model |
| chat:setMode | mode | Toggle autopilot/supervised |
| chat:applyCode | code, filePath? | Apply code to editor |
| chat:insertCode | code | Insert code at cursor |
| chat:graphNodeClick | nodeId | View pipeline node details |
| chat:openWorkflowGraph | — | Open workflow visualization |
| chat:saveState | payload | Persist current state |
| chat:debugLog | text | Debug logging |
| tab:create | — | Create new tab |
| tab:switch | tabId | Switch active tab |
| tab:close | tabId | Close tab |
| tab:rename | tabId, newName | Rename tab |

### 4.2 Extension → Webview (ChatExtToWebviewMessage)

| Message Type | Payload | Description |
|-------------|---------|-------------|
| chat:streamChunk | streamId, nodeId, content, timestamp | Streaming response chunk |
| chat:streamComplete | streamId, nodeId, finalContent | Stream finished |
| chat:graphUpdate | nodes[] | Pipeline graph state update |
| chat:approvalRequest | checkpoint | Quality gate needs decision |
| chat:chatHistory | messages[] | Restore message history |
| chat:pipelineStatus | status, phase, ticketKey | Pipeline progress |
| chat:nodeDetails | node, recentOutputs | Pipeline node info |
| chat:resumePrompt | threadId, ticketKey, phase, pausedAt | Paused pipeline prompt |
| chat:error | code, message, retryable | Error notification |
| chat:toolCall | toolCall | Tool execution started |
| chat:toolCallUpdate | id, status, result?, duration? | Tool execution update |
| chat:contextPicked | item | Context item selected |
| chat:models | provider, models[], selected, supportsAuto | Model list |
| chat:workingStatus | working, label? | Working indicator |
| tab:updated | tabs[], activeTabId | Tab state sync |
| tab:contextUpdate | tabId, tokenCount, maxTokens, percentage, threshold | Token usage |
| chat:steeringLoaded | rules[] | Steering files info |
| chat:hookTriggered | hook | Agent hook event |
| chat:contextUsage | payload | Detailed context breakdown |
| serverStatus | status | Connection state |

---

## 5. Business Rules

| ID | Rule | Category |
|----|------|----------|
| BR-01 | Maximum 10 conversation tabs | Conversation |
| BR-02 | Tab name limited to 30 characters | Conversation |
| BR-03 | Cannot close the last remaining tab | Conversation |
| BR-04 | Message buffer capped at 200 when view not visible | Memory |
| BR-05 | Token estimation uses 4 chars/token heuristic | Token |
| BR-06 | Gateway model fetch timeout: 5 seconds | Model |
| BR-07 | Engine history restore limited to last 20 messages | State |
| BR-08 | Only process steering files with inclusion: always/auto | Steering |
| BR-09 | CSP: no inline scripts, no external connects | Security |
| BR-10 | API keys stored only in SecretStorage | Security |
| BR-11 | Full-file apply only when code starts with "import"/"package" | Code Action |
| BR-12 | Config changes trigger combined status recheck | Status |

---

## 6. Error Handling

| Scenario | Error Code | User-Facing Message | Recovery |
|----------|-----------|---------------------|----------|
| Handler throws exception | HANDLER_ERROR | Error message text | Retry (retryable=true) |
| No active editor for Apply | — | "No active editor. Open the target file first." | User opens file |
| Max tabs reached | — | "Maximum 10 tabs reached" | Close a tab first |
| Close last tab | — | "Cannot close the last tab" | — |
| Tab not found | — | (internal, not shown) | — |
| Gateway fetch fails | — | (silent fallback to static) | Uses static catalog |
| LLM unavailable | — | Status shows "disconnected" | Fix config/network |
| Stream cancelled | — | "Cancelled by user" | User re-sends |

---

## 7. UI Specifications

### 7.1 Layout Structure

```
+-------------------------------------------+
| [○ ctx]  SDLC Pipeline        [connected] |  ← Header (status + context arc)
+-------------------------------------------+
| [Chat 1] [Chat 2] [+]                     |  ← Tab Bar
+-------------------------------------------+
| ▶ Included Rules (3)                       |  ← Steering section (collapsible)
+-------------------------------------------+
| ⚠ Context window is full... [New tab]     |  ← Warning (conditional)
+-------------------------------------------+
|  Working... [Cancel] [Follow 👁]           |  ← Working bar (conditional)
+-------------------------------------------+
|                                            |
|  Welcome / Messages area                   |  ← Main content
|                                            |
+-------------------------------------------+
| [context chips]                            |  ← Input context chips
| [message input area          ]             |  ← Contenteditable div
| [#] [📎] [⏹]    [Model ▼] [Autopilot] [↑]|  ← Input toolbar
+-------------------------------------------+
```

### 7.2 Welcome State

Shown when no messages in active tab:
- Title: "SDLC Pipeline Agent"
- Subtitle: "Ask a question or describe a task..."
- Quick suggestion buttons: Create BRD, Create FSD, Full pipeline, Status, Resume, Open Workflow Graph

### 7.3 Context Menu (# button)

9 items with icons: Files 📄, Spec 📋, Git Diff 🔀, Terminal 💻, Problems ⚠, Folder 📁, Current File 📝, Steering 🧭, MCP 🔌

### 7.4 Slash Command Popup (/ prefix)

Organized by section:
- **Agents**: qa-agent 🧪, sa-agent 🏗, sm-agent 📋, ta-agent 🔧, ui-agent 🎨, security-agent 🛡
- **Steering Rules**: dynamically loaded from .kiro/steering

---

## 8. Non-Functional Requirements (Quantified)

| Category | Metric | Target | Measurement |
|----------|--------|--------|-------------|
| Latency | Panel activation | < 200ms | Time from view resolve to ready |
| Latency | First stream chunk render | < 16ms | Per-chunk render time |
| Memory | Webview DOM nodes | < 5000 | After 100 messages |
| Memory | Extension host | < 50MB overhead | Chat panel contribution |
| Throughput | Stream chunks/sec | Handle 100+/sec | No dropped chunks |
| Persistence | State save | < 50ms | Memento update time |
| Persistence | State restore | < 200ms | Full tab restore |

---

## 9. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Send Message | [sequence-send-message.png](diagrams/sequence-send-message.png) | [sequence-send-message.drawio](diagrams/sequence-send-message.drawio) |
| 3 | State — Conversation Tab | [state-conversation.png](diagrams/state-conversation.png) | [state-conversation.drawio](diagrams/state-conversation.drawio) |
