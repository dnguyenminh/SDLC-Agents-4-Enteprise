# Business Requirements Document (BRD)

## Kiro SDLC — F8-chat-panel: Chat Panel

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F8-chat-panel |
| Title | Chat Panel — Webview Chat UI with Multi-model Conversation Management |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Pattern | AI Agent System + Plugin (VS Code Extension) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initiate document — generated from source code analysis |

---

## 1. Introduction

### 1.1 Scope

The Chat Panel is the primary user interface for the Kiro SDLC Agent system, implemented as a VS Code Webview sidebar panel. It provides:

- **Conversational AI interface** — users interact with LLM models (Claude, GPT, local models) through a chat UI
- **Multi-tab conversation management** — independent conversation contexts with token tracking
- **Context injection** — users attach files, folders, git diffs, terminal output, specs, and steering rules as context
- **SDLC pipeline integration** — users trigger pipeline operations (BRD, FSD, TDD creation) via ticket-key commands
- **Streaming response display** — real-time markdown rendering with code blocks and inline actions
- **Model selection** — dynamic model catalog from multiple providers (Anthropic, OpenAI, Ollama, ONNX, LM Studio, OpenRouter)

### 1.2 Out of Scope

- LLM inference logic (handled by LangGraph engine)
- MCP server management (handled by McpServerManager)
- Backend agent orchestration (handled by LangGraph pipeline)
- Authentication/auth token management (handled by auth module)
- VS Code native editor features (diff view, source control)

### 1.3 Preliminary Requirements

- VS Code extension activation and webview infrastructure
- MCP server running and reachable
- At least one LLM provider configured with valid API key
- LangGraph engine initialized

---

## 2. Business Requirements

### 2.1 High Level Process Map

The Chat Panel serves as the front-end layer in the Kiro SDLC system:

1. User opens Chat Panel sidebar in VS Code
2. Panel checks MCP + LLM connectivity and reports status
3. User types message, optionally attaching context items
4. Message is routed: either to SDLC pipeline (ticket commands) or general chat
5. LLM streams response back; panel renders markdown in real-time
6. User can interact with response (apply code, insert code, approve/reject pipeline steps)

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories

| # | Story / Use Case | Priority | Source |
|---|-----------------|----------|--------|
| 1 | Multi-model conversation with streaming | MUST HAVE | ChatPanelProvider, MessageHandler |
| 2 | Multi-tab conversation management | MUST HAVE | ConversationManager |
| 3 | Model selection and provider switching | MUST HAVE | ChatModelManager |
| 4 | Context picker (files, folders, git diff, terminal, problems) | MUST HAVE | ChatContextPicker |
| 5 | Token counting and context window tracking | MUST HAVE | TokenCounter, ContextUsageTracker |
| 6 | Message routing (SDLC pipeline vs. general chat) | MUST HAVE | MessageRouting |
| 7 | Streaming markdown display with code blocks | MUST HAVE | markdown-renderer.js |
| 8 | File attachments (images, documents) | SHOULD HAVE | AttachmentItem handling |
| 9 | Chat state persistence and restoration | MUST HAVE | ChatStateManager |
| 10 | Connection status monitoring (MCP + LLM) | MUST HAVE | ChatStatusManager |
| 11 | Code actions (Apply to editor, Insert at cursor) | MUST HAVE | handleApplyCode, handleInsertCode |
| 12 | Slash commands and agent invocation | SHOULD HAVE | MessageRouting agent patterns |
| 13 | Autopilot/Supervised mode toggle | SHOULD HAVE | AutopilotMode |
| 14 | Pipeline approval workflow (approve/reject/revise) | MUST HAVE | ApprovalAction handling |
| 15 | Workflow graph visualization | SHOULD HAVE | graph-viz.js |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** User opens VS Code sidebar, Chat Panel view activates
**Step 2:** WebviewViewProvider resolves, loads HTML/CSS/JS, webview sends `ready` message
**Step 3:** Extension sends combined status (MCP + LLM), model list, restored state, steering info
**Step 4:** User composes message in contenteditable input area
**Step 5:** User optionally clicks `#` to add context (file, folder, git diff, terminal, problems, spec, steering, MCP)
**Step 6:** User optionally attaches files via paperclip button
**Step 7:** User selects model from dropdown (or keeps "Auto")
**Step 8:** User sends message (Enter or Send button)
**Step 9:** Extension routes message: ticket pattern → SDLC pipeline; `/agent` prefix → agent; otherwise → general chat
**Step 10:** LLM streams response chunks; webview renders markdown progressively
**Step 11:** User interacts with rendered response (copy code, apply to file, approve pipeline step)

---

#### STORY 1: Multi-model Conversation with Streaming

> As a developer, I want to chat with AI models and see responses streamed in real-time so that I get immediate feedback while the model generates.

**Requirement Details:**

1. User types message in contenteditable input (supports multi-line, paste)
2. Message sent to LangGraph engine which invokes selected LLM
3. Response streams via `chat:streamChunk` events with progressive content
4. Stream completion marked by `chat:streamComplete` event
5. User can cancel ongoing stream at any time via Cancel button
6. Working indicator shows during generation with "Working..." label
7. Error responses show with error code, message, and retryable flag

**Acceptance Criteria:**

1. GIVEN user sends a message WHEN LLM is connected THEN response streams in real-time with < 500ms first-token latency (network permitting)
2. GIVEN streaming in progress WHEN user clicks Cancel THEN stream stops immediately and "Cancelled by user" message appears
3. GIVEN LLM disconnected WHEN user sends message THEN error message with code and retry option shown
4. GIVEN response contains markdown WHEN rendered THEN code blocks have syntax highlighting, copy button, and apply/insert actions

---

#### STORY 2: Multi-tab Conversation Management

> As a developer, I want multiple independent conversation tabs so that I can work on different topics simultaneously without losing context.

**Requirement Details:**

1. Tab bar at top of chat panel with tabs and "+" button
2. Each tab has independent message history, token count, and state
3. Maximum 10 tabs allowed; error shown when limit reached
4. Tabs can be renamed (max 30 characters)
5. Closing a tab activates the left neighbor (or right if leftmost)
6. Cannot close last remaining tab
7. Each tab preserves: scroll position, draft message, token count
8. Tab state persists across VS Code restarts via workspaceState

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| id | string (UUID) | Yes | Unique tab identifier | "a1b2c3d4-..." |
| name | string | Yes | Tab display name (max 30 chars) | "Chat 1" |
| messages | TabMessage[] | Yes | Message history | [...] |
| tokenCount | number | Yes | Current token usage | 4500 |
| maxTokens | number | Yes | Model context limit | 128000 |
| isActive | boolean | Yes | Whether tab is focused | true |
| scrollPosition | number | Yes | Saved scroll offset | 320 |
| draftMessage | string | Yes | Unsent input text | "How do I..." |

**Acceptance Criteria:**

1. GIVEN 9 tabs open WHEN user clicks "+" THEN new tab created and activated
2. GIVEN 10 tabs open WHEN user clicks "+" THEN error "Maximum 10 tabs reached" shown
3. GIVEN tab with messages WHEN user switches to another tab THEN returns to find messages preserved
4. GIVEN tab "Chat 3" WHEN user renames to "Auth Bug" THEN tab label updates
5. GIVEN VS Code restarts WHEN Chat Panel opens THEN previous tabs/messages restored

---

#### STORY 3: Model Selection and Provider Switching

> As a developer, I want to select which AI model to use for my conversation so that I can choose between quality, speed, and cost.

**Requirement Details:**

1. Model selector button in input toolbar shows current model name
2. Clicking opens dropdown with available models for configured provider
3. Models organized by provider (Anthropic, OpenAI, Ollama, ONNX, LM Studio, OpenRouter)
4. "Auto" option uses provider default
5. Model list refreshes when provider configuration changes
6. For gateway providers (local 127.0.0.1), fetch live model list from `/v1/models`
7. Each model entry can show: name, description, rate multiplier
8. Selection persists in VS Code settings (`kiroSdlc.llmModel`)

**Acceptance Criteria:**

1. GIVEN Anthropic provider configured WHEN user opens model dropdown THEN shows Claude models (Opus, Sonnet, Haiku, etc.)
2. GIVEN provider changed to OpenAI WHEN dropdown opened THEN shows GPT-4o, o1, o3 models
3. GIVEN local gateway running WHEN dropdown opened THEN fetches live model list from gateway
4. GIVEN gateway unreachable WHEN dropdown opened THEN falls back to static model catalog

---

#### STORY 4: Context Picker (#File, #Folder, #Problems, #Terminal, #Git Diff)

> As a developer, I want to easily attach workspace context to my messages so that the AI has relevant information for better responses.

**Requirement Details:**

1. "#" button opens context menu with 9 context types:
   - File — VS Code file picker dialog
   - Folder — VS Code folder picker dialog
   - Problems — current diagnostics from Problems panel
   - Git Diff — staged/unstaged changes
   - Terminal — last terminal output
   - Spec — .kiro/specs files
   - Current File — active editor content
   - Steering — .kiro/steering rules
   - MCP — available MCP tool listing
2. Selected context appears as chips in input area above the message
3. Context content is assembled into `<context>` XML blocks before the user message
4. Each context item has type, label, optional path, optional content

**Acceptance Criteria:**

1. GIVEN user clicks "#" → "Files" WHEN VS Code file picker opens THEN selected file path appears as chip
2. GIVEN user adds Git Diff context WHEN there are uncommitted changes THEN diff content included in message
3. GIVEN user adds Problems context WHEN there are diagnostics THEN all current problems included
4. GIVEN 3 context items attached WHEN message sent THEN all 3 included in enriched text with XML structure

---

#### STORY 5: Token Counting and Context Window Tracking

> As a developer, I want to see how much of the model's context window I've used so that I know when to start a new conversation.

**Requirement Details:**

1. Circular progress arc in header shows context usage percentage
2. Token estimation: ~4 characters per token heuristic (upgradeable to tiktoken)
3. Context categorized into: conversation, MCP tools, steering rules
4. Threshold states: safe (< 60%), warning (60-80%), critical (80-95%), full (> 95%)
5. Toast notification when crossing threshold boundaries
6. "Context window is full" warning with "Start new tab" link at full state
7. Max tokens determined per model (Claude: 200K, GPT-4o: 128K, etc.)
8. Usage tooltip shows: "{used} / {max} tokens ({percentage}%)"

**Acceptance Criteria:**

1. GIVEN conversation with 50K tokens WHEN Claude selected (200K max) THEN arc shows 25%, color = safe (green)
2. GIVEN conversation crosses 80% WHEN threshold changes to critical THEN toast "Context usage at 80%" appears
3. GIVEN context at 95% WHEN full state reached THEN warning banner appears with "Start new tab" link
4. GIVEN model switched from Claude (200K) to GPT-4o (128K) THEN percentage recalculated with new max

---

#### STORY 6: Message Routing (SDLC Pipeline vs. General Chat)

> As a developer, I want to trigger SDLC pipeline actions by typing ticket keys so that I can manage the software development lifecycle from the chat.

**Requirement Details:**

1. Ticket pattern `[A-Z]+-\d+ action` routes to SDLC pipeline engine
2. Direct commands: `status`, `resume`, `cancel`
3. Agent prefix `/agent-name task` routes to specific agent
4. All other messages route to general chat (invokeChat)
5. Phase keywords recognized: brd, fsd, tdd, stp, implement, test, deploy, full
6. Working status bar shows during pipeline/chat execution

**Acceptance Criteria:**

1. GIVEN user types "KSA-50 tao BRD" WHEN message sent THEN SDLC pipeline invoked for KSA-50 requirements phase
2. GIVEN user types "status" WHEN sent THEN graph update with current node states shown
3. GIVEN user types "/qa-agent review tests" WHEN sent THEN QA agent invoked with task
4. GIVEN user types "How do I fix this bug?" WHEN sent THEN general chat invoked

---

#### STORY 7: Streaming Markdown Display with Code Blocks

> As a developer, I want AI responses rendered as formatted markdown with actionable code blocks so that I can read and use the output efficiently.

**Requirement Details:**

1. Markdown rendered with: headings, bold, italic, lists, tables, links
2. Code blocks with: language detection, syntax highlighting, copy button
3. Code blocks include action buttons: "Apply" (replace in editor), "Insert" (at cursor)
4. "Apply" logic: if file open + selection → replace selection; if empty selection + code has imports → replace entire file
5. "Insert" logic: insert at cursor position in active editor
6. Streaming chunks progressively render (no full-page re-render)
7. Images render inline from data URIs

**Acceptance Criteria:**

1. GIVEN response contains ```typescript code block WHEN rendered THEN shows syntax-highlighted TypeScript with copy/apply/insert buttons
2. GIVEN user clicks "Apply" on code block WHEN active editor open with selection THEN replaces selection
3. GIVEN user clicks "Apply" on full-file code WHEN no selection THEN replaces entire file content
4. GIVEN streaming in progress WHEN new chunks arrive THEN appended without flicker

---

#### STORY 8: File Attachments

> As a developer, I want to attach files (images, PDFs, documents) to my messages so that the AI can analyze visual or document content.

**Requirement Details:**

1. Paperclip button opens VS Code file picker (multi-select enabled)
2. Selected files shown as attachment chips in input area
3. Attachment metadata: name, MIME type, size, URI
4. Attached files sent as context items with type "file" and workspace-relative path

**Acceptance Criteria:**

1. GIVEN user clicks attach → selects 2 files WHEN shown in input THEN both appear as removable chips
2. GIVEN image attached WHEN message sent THEN image data available to LLM as context

---

#### STORY 9: Chat State Persistence and Restoration

> As a developer, I want my conversations preserved across VS Code sessions so that I don't lose work.

**Requirement Details:**

1. Chat state saved on every change via `chat:saveState` message
2. State stored in VS Code workspaceState (Memento API)
3. On webview `ready`, state restored: tabs, activeTabId, message history
4. Engine chat history also restored (last 20 messages of active tab)
5. Steering files loaded and sent to webview on ready

**Acceptance Criteria:**

1. GIVEN 3 tabs with messages WHEN VS Code reloads THEN all 3 tabs restored with messages
2. GIVEN active tab had draft "How do..." WHEN restored THEN draft appears in input
3. GIVEN LangGraph engine restarted WHEN state restored THEN last 20 messages available for context

---

#### STORY 10: Connection Status Monitoring (MCP + LLM)

> As a developer, I want to see at a glance whether my AI backend is connected so that I know if I can send messages.

**Requirement Details:**

1. Status indicator in header: "connected" (green) / "disconnected" (red) / "failed" (red)
2. Combined check: both MCP server AND LLM provider must be available
3. Status updates automatically when MCP status changes
4. Status updates when LLM configuration changes (provider, base URL)
5. Explicit status notification from Settings panel when LLM test passes/fails

**Acceptance Criteria:**

1. GIVEN MCP connected + LLM available WHEN status checked THEN shows "connected" (green)
2. GIVEN MCP connected + LLM unavailable WHEN status checked THEN shows "disconnected" (red)
3. GIVEN user changes LLM provider in settings WHEN config change fires THEN status re-evaluated

---

#### STORY 11: Code Actions (Apply to Editor, Insert at Cursor)

> As a developer, I want to apply AI-generated code directly to my editor so that I can quickly use suggestions.

**Requirement Details:**

1. "Apply" button on code blocks: replaces selection or entire file
2. "Insert" button: inserts at cursor position
3. If no active editor + filePath provided → opens file first, then applies
4. If no active editor + no filePath → warning "No active editor. Open the target file first."
5. Full-file detection: code starts with `import ` or `package ` → replaces whole file when no selection

**Acceptance Criteria:**

1. GIVEN code block with filePath WHEN user clicks Apply THEN file opened and code applied
2. GIVEN no active editor WHEN user clicks Apply THEN warning message shown
3. GIVEN code with `import` prefix WHEN Apply clicked with empty selection THEN entire file replaced

---

#### STORY 14: Pipeline Approval Workflow

> As a developer, I want to approve or reject pipeline quality gates from the chat so that I can control the SDLC process interactively.

**Requirement Details:**

1. Pipeline sends `chat:approvalRequest` with checkpoint details
2. User responds with: approve, reject, or revise (with optional feedback)
3. Decision forwarded to LangGraph engine via `handleApproval`
4. Pipeline resumes or rolls back based on decision
5. Paused pipelines can be resumed from chat with `resume` command or "Resume" button

**Acceptance Criteria:**

1. GIVEN pipeline reaches quality gate WHEN approval request shown THEN user sees checkpoint details with approve/reject/revise buttons
2. GIVEN user clicks "reject" with feedback WHEN sent THEN pipeline receives rejection with feedback text
3. GIVEN paused pipeline exists WHEN user types "resume" THEN pipeline continues from pause point

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| LangGraph Engine | Internal | Handles LLM invocation, pipeline state, streaming |
| MCP Server Manager | Internal | Provides tool execution and status monitoring |
| VS Code Webview API | Platform | WebviewViewProvider, postMessage, Memento |
| LLM Provider (Anthropic/OpenAI/Ollama) | External | AI model inference |
| uuid library | Library | Tab ID generation |
| Markdown rendering (custom) | Internal | markdown-renderer.js for response display |

---

## 4. Stakeholders

| Role | Team | Responsibility |
|------|------|----------------|
| Developer | Extension Team | Primary user of Chat Panel |
| Solution Architect | Platform Team | Defines architecture constraints |
| Product Owner | Product Team | Prioritizes features and accepts deliverables |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Token estimation inaccuracy (4 chars/token heuristic) | Medium | High | Provide tiktoken upgrade path; conservative thresholds |
| Webview memory with large conversations | High | Medium | Limit message buffer to 200; encourage new tabs at critical threshold |
| Model catalog drift (static list outdated) | Low | Medium | Gateway live fetch as primary; static as fallback |
| Context window exceeded silently | High | Low | Multi-level threshold warnings; hard block at full |
| Stream disconnection mid-response | Medium | Medium | Graceful recovery with partial content shown |

### 5.2 Assumptions

- VS Code version >= 1.74 with WebviewView support
- At least one LLM provider will be configured and accessible
- MCP server starts automatically with extension activation
- Users are developers familiar with VS Code extension sidebar
- Network latency to LLM providers < 5s for first token

---

## 6. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | First token latency | < 500ms (network excluded) |
| Performance | UI render for stream chunk | < 16ms (60fps) |
| Performance | Panel activation time | < 200ms |
| Memory | Max message buffer | 200 messages |
| Memory | Max tabs | 10 simultaneous |
| Reliability | State persistence | 100% — no data loss on reload |
| Usability | Keyboard shortcuts | Ctrl+Enter send, Ctrl+Shift+T new tab |
| Security | CSP enforcement | No inline scripts, no external connects |
| Security | Secret handling | API keys in SecretStorage only |
| Compatibility | VS Code versions | >= 1.74 |
| Accessibility | Screen reader | ARIA roles on input, tabs, buttons |

---

## 7. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Webview | VS Code API for rendering custom HTML/CSS/JS in sidebar/panel |
| MCP | Model Context Protocol — tool execution framework |
| LangGraph | State machine engine for AI agent pipelines |
| Token | Unit of text processing for LLMs (~4 English characters) |
| Streaming | Progressive response delivery chunk-by-chunk |
| Context Window | Maximum tokens an LLM can process in a single request |
| CSP | Content Security Policy — browser security mechanism |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
