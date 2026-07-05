# Functional Specification Document (FSD)

## SA4E — F7: LangGraph SDLC Pipeline

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F7 |
| Title | LangGraph SDLC Pipeline |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-01-27 |
| Status | Draft |
| Related BRD | documents/F7-langgraph-pipeline/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-27 | BA + TA Agent | Initial FSD — multi-graph architecture specification |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the LangGraph SDLC Pipeline system — a multi-graph state machine that orchestrates software development workflows. It defines use cases, business rules, state transitions, API contracts, and integration requirements.

### 1.2 Scope

Covers: Router Graph, SDLC Subgraph, Hotfix Subgraph, Code Review Subgraph, Docs Subgraph, Security Audit Subgraph, Chat Subgraph, Checkpointer, Verify Nodes, Approval Nodes, Feedback Loop, Strategy Switch, and Streaming.

### 1.3 Definitions

| Term | Definition |
|------|------------|
| Node | A function that transforms PipelineState; mapped to a graph vertex |
| Edge | A connection between nodes; can be conditional based on state |
| Subgraph | A self-contained StateGraph compiled independently |
| Thread | A unique pipeline execution identified by threadId |
| Checkpoint | Persisted snapshot of graph state for resume |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/F7-langgraph-pipeline/BRD.md |
| LangGraph Docs | https://langchain-ai.github.io/langgraphjs/ |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The LangGraph Pipeline sits within the VS Code extension, consuming input from the Chat Panel webview, orchestrating work via MCP Bridge (tool calls), persisting state to workspace filesystem, and streaming output back to the webview.

### 2.2 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ VS Code Extension                                            │
│  ┌─────────────┐    ┌──────────────────┐                    │
│  │ Chat Panel  │───▶│ LangGraphEngine  │                    │
│  │ (Webview)   │◀───│ (Singleton)      │                    │
│  └─────────────┘    └────────┬─────────┘                    │
│                              │                               │
│         ┌────────────────────┼────────────────────┐         │
│         ▼                    ▼                    ▼         │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐     │
│  │Router Graph │   │ Checkpointer │   │StreamHandler │     │
│  │classify→route│  │  (JSON disk) │   │ (events)     │     │
│  └──────┬──────┘   └──────────────┘   └──────────────┘     │
│         │                                                    │
│  ┌──────┼────────────────────────────────────┐              │
│  │      ▼                                    │              │
│  │ ┌────────┐ ┌────────┐ ┌──────┐ ┌──────┐ │              │
│  │ │  SDLC  │ │ Hotfix │ │ Chat │ │ Docs │ │  Subgraphs   │
│  │ └────────┘ └────────┘ └──────┘ └──────┘ │              │
│  │ ┌──────────┐ ┌───────────────┐           │              │
│  │ │Code Rev. │ │Security Audit │           │              │
│  │ └──────────┘ └───────────────┘           │              │
│  └───────────────────────────────────────────┘              │
│                              │                               │
│                              ▼                               │
│                     ┌──────────────┐                         │
│                     │  MCP Bridge  │                         │
│                     │ (Tool Calls) │                         │
│                     └──────┬───────┘                         │
│                            │                                 │
└────────────────────────────┼─────────────────────────────────┘
                             ▼
                    ┌──────────────────┐
                    │   MCP Servers    │
                    │ (Jira, KB, File) │
                    └──────────────────┘
```

---

## 3. Functional Requirements

### 3.1 Feature: Router Graph (Intent Classification)

**Source:** BRD Story 2

#### 3.1.1 Description

The Router Graph is the top-level entry point. It classifies user intent and delegates execution to the appropriate subgraph. Subgraphs are lazy-loaded on first use.

#### 3.1.2 Use Case: UC-01 — Classify Intent and Route

| Field | Value |
|-------|-------|
| Actor | User (via Chat Panel) |
| Precondition | User has entered text in chat |
| Trigger | LangGraphEngine.invoke() or invokeChat() called |

**Main Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | User | Enters text in chat panel |
| 2 | System | Creates initial PipelineState with chatHistory |
| 3 | System | Executes classify_intent node |
| 4 | System | Regex rules evaluated in order (O(n) scan) |
| 5 | System | If confidence >= 0.7, route immediately |
| 6 | System | Routes to matched subgraph node |
| 7 | System | Subgraph lazy-loaded if not cached |
| 8 | System | Subgraph executes to completion |

**Alternative Flow — LLM Fallback (AF-1):**

| Step | Action |
|------|--------|
| 4a | No regex rule matches with confidence >= 0.7 |
| 4b | LLM provider available → one-shot classification prompt |
| 4c | LLM returns intent string → validate against known intents |
| 4d | Route to classified intent subgraph |

**Alternative Flow — Pre-classified Intent (AF-2):**

| Step | Action |
|------|--------|
| 3a | state.intent already set (e.g., from LangGraphEngine.invoke with explicit intent) |
| 3b | Skip classification, proceed directly to routing |

**Exception Flow — LLM Unavailable (EF-1):**

| Step | Action |
|------|--------|
| 4a | Regex confidence < 0.7 AND LLM unavailable |
| 4b | Default to "chat" intent (confidence 0.6) |

#### 3.1.3 Business Rules

| ID | Rule |
|----|------|
| BR-01 | Regex patterns are evaluated in definition order; first match wins |
| BR-02 | Confidence threshold for fast-path acceptance is 0.7 |
| BR-03 | LLM classification response must be one of 6 valid intent strings |
| BR-04 | Invalid LLM response defaults to "chat" intent |
| BR-05 | Subgraph cache persists for engine lifetime (no re-compilation) |

#### 3.1.4 Data Specifications

**IntentClassification:**

| Field | Type | Description |
|-------|------|-------------|
| intent | PipelineIntent | One of: sdlc, hotfix, code_review, docs, security_audit, chat |
| confidence | number | 0.0 to 1.0 |
| source | string | "regex" or "llm" |

**Pattern Rules (regex):**

| Pattern | Intent | Confidence |
|---------|--------|------------|
| `^[A-Z]+-\d+$` | sdlc | 0.95 |
| `^[A-Z]+-\d+\s+` | sdlc | 0.9 |
| `\b(fix bug\|hotfix\|patch)\b` | hotfix | 0.95 |
| `\b(review pr\|code review)\b` | code_review | 0.95 |
| `\b(security audit\|vulnerability scan)\b` | security_audit | 0.95 |

#### 3.1.5 API Contract

```typescript
// Engine entry points
class LangGraphEngine {
  async invoke(ticketKey: string, phase: SDLCPhase, chatInput: string, intent?: PipelineIntent): Promise<void>;
  async invokeChat(chatInput: string): Promise<void>;
  async resume(threadId: string): Promise<void>;
  async handleApproval(decision: ApprovalDecision, feedback?: string): Promise<void>;
  cancel(): void;
}
```

---

### 3.2 Feature: SDLC Subgraph (Full Pipeline)

**Source:** BRD Story 1, 4, 5, 6, 7

#### 3.2.1 Description

The SDLC Subgraph implements the full software development lifecycle as a directed graph. It includes phase nodes, verify nodes, quality gates, feedback loops, and strategy switching.

#### 3.2.2 Use Case: UC-02 — Execute SDLC Phase

| Field | Value |
|-------|-------|
| Actor | Developer |
| Precondition | Pipeline invoked with intent "sdlc" |
| Trigger | routeFromSm routes to phase-specific node |

**Main Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | System | SM node reads currentPhase from state |
| 2 | System | Routes to phase-specific agent node (e.g., ba_brd) |
| 3 | Agent Node | Invokes LLM with phase-specific prompt |
| 4 | Agent Node | Calls MCP tools to read/write files |
| 5 | Agent Node | Returns agentOutputs with content |
| 6 | System | Routes to verify node (e.g., verify_ba_brd) |
| 7 | Verify Node | Evaluates output against phase criteria via LLM |
| 8 | System | If pass, routes to quality gate |
| 9 | Quality Gate | Pauses pipeline, sets approvalRequired=true |
| 10 | User | Approves via handleApproval() |
| 11 | System | Routes back to SM, advances currentPhase |

**Alternative Flow — Verify Fails (AF-3):**

| Step | Action |
|------|--------|
| 7a | Verify evaluates output as failed |
| 7b | verifyAttempts[nodeId] incremented |
| 7c | If attempts < maxVerifyAttempts (2), route back to agent node |
| 7d | Agent re-executes with verifyFeedback in state |

**Alternative Flow — Strategy Switch (AF-4):**

| Step | Action |
|------|--------|
| 7e | verifyAttempts >= maxVerifyAttempts |
| 7f | Route to strategy_switch node |
| 7g | If alternate strategy configured, switch and reset attempts |
| 7h | Route back to agent with new strategy |

**Exception Flow — All Strategies Exhausted (EF-2):**

| Step | Action |
|------|--------|
| 7i | Alternate strategy also failed OR no alternate configured |
| 7j | Emit human_intervention_required event |
| 7k | Pipeline status = "paused", approvalRequired = true |

#### 3.2.3 Use Case: UC-03 — BA-SA Feedback Loop

| Field | Value |
|-------|-------|
| Actor | System (automatic) |
| Precondition | SA produces TDD with discrepancyFound = true |
| Trigger | feedback_check node detects discrepancy |

**Main Flow:**

| Step | Action |
|------|--------|
| 1 | feedback_check reads discrepancyFound from state |
| 2 | discrepancyFound = true AND feedbackIterations < 5 |
| 3 | feedbackIterations incremented |
| 4 | Route to ba_fix_fsd node |
| 5 | BA agent fixes FSD based on discrepancy details |
| 6 | Route to sa_review node |
| 7 | SA re-evaluates FSD consistency |
| 8 | SA updates discrepancyFound in state |
| 9 | Route back to feedback_check (loop) |

**Termination — No Discrepancy:**

| Step | Action |
|------|--------|
| 1a | discrepancyFound = false |
| 1b | Route to security_review_tdd (exit loop) |

**Termination — Max Iterations:**

| Step | Action |
|------|--------|
| 2a | feedbackIterations >= 5 |
| 2b | Pipeline status = "paused" |
| 2c | Route to security_review_tdd (exit with warning) |

#### 3.2.4 Business Rules

| ID | Rule |
|----|------|
| BR-06 | SM routes based on currentPhase; default is "requirements" |
| BR-07 | Phase order: requirements → specification → design → test_planning → implementation → user_guide → testing → deployment |
| BR-08 | Each agent node has exactly one verify node following it |
| BR-09 | Verify node max attempts = 2 (configurable via maxVerifyAttempts) |
| BR-10 | Feedback loop max iterations = 5 (configurable via maxFeedbackIterations) |
| BR-11 | Quality gate pauses pipeline until user decision |
| BR-12 | Verify node fail-open: internal errors treated as pass |
| BR-13 | Security review nodes are mandatory between agent and quality gate for specification, design, and implementation phases |

---

### 3.3 Feature: Checkpointing and Resume

**Source:** BRD Story 3

#### 3.3.1 Use Case: UC-04 — Persist and Resume Pipeline

| Field | Value |
|-------|-------|
| Actor | System / Developer |
| Precondition | Pipeline executing with valid threadId |
| Trigger | Any node transition (automatic) / User selects resume |

**Main Flow (Persist):**

| Step | Action |
|------|--------|
| 1 | LangGraph runtime calls checkpointer.put() after each node |
| 2 | Checkpointer serializes state to JSON |
| 3 | Writes to tmp file (.json.tmp) |
| 4 | Atomic rename to final path (.json) |
| 5 | Preserves createdAt from original file if exists |

**Main Flow (Resume):**

| Step | Action |
|------|--------|
| 1 | User calls LangGraphEngine.resume(threadId) |
| 2 | Checkpointer.getTuple() loads JSON file |
| 3 | Graph.invoke(null, config) resumes from checkpoint |
| 4 | Execution continues from last completed node |

**Exception Flow — Corrupt File (EF-3):**

| Step | Action |
|------|--------|
| 2a | JSON.parse fails |
| 2b | getTuple returns undefined |
| 2c | Engine emits NO_CHECKPOINT error to webview |

#### 3.3.2 Business Rules

| ID | Rule |
|----|------|
| BR-14 | Checkpoint file path: .vscode/kiro-pipeline-state/{threadId}.json |
| BR-15 | Writes must be atomic (tmp + rename) |
| BR-16 | Cleanup removes pipelines older than maxAgeDays (default 7) |
| BR-17 | Multiple threads can be persisted simultaneously |

#### 3.3.3 Data Specifications

**Checkpoint File Schema:**

| Field | Type | Description |
|-------|------|-------------|
| version | number | Schema version (currently 1) |
| schemaVersion | string | Semantic version "1.0.0" |
| graphCheckpoint | Checkpoint | LangGraph internal checkpoint |
| state | object | Sanitized metadata |
| createdAt | string | ISO timestamp of first creation |
| lastModified | string | ISO timestamp of last update |
| pendingWrites | array | Buffered writes (optional) |

---

### 3.4 Feature: Chat Subgraph (ReAct Agent)

**Source:** BRD Story 12

#### 3.4.1 Use Case: UC-05 — ReAct Agent Conversation

| Field | Value |
|-------|-------|
| Actor | Developer |
| Precondition | Intent classified as "chat" |
| Trigger | Chat subgraph invoked |

**Main Flow:**

| Step | Action |
|------|--------|
| 1 | fetch_tools node discovers available MCP tools |
| 2 | agent_step node sends messages to LLM with tool schemas |
| 3 | LLM responds with either text or tool_use |
| 4 | If tool_use: execute_tools node calls MCP tools |
| 5 | Tool results appended to agent scratchpad |
| 6 | Route back to agent_step (loop) |
| 7 | If text: route to verify_response |
| 8 | verify_response checks completeness |
| 9 | If complete, route to END |

**Alternative Flow — Hallucination Grade (AF-5):**

| Step | Action |
|------|--------|
| 9a | For small models (contextWindow < threshold) |
| 9b | After verify_response passes, route to hallucination_grader |
| 9c | Grader checks if response is grounded in tool results |
| 9d | If hallucinated, route back to agent_step |

**Exception Flow — Max Iterations (EF-4):**

| Step | Action |
|------|--------|
| 6a | agentIterations >= 25 |
| 6b | Route to synthesize node |
| 6c | Synthesize generates best-effort response from scratchpad |

#### 3.4.2 Business Rules

| ID | Rule |
|----|------|
| BR-18 | Max agent iterations = 25 |
| BR-19 | Steering rules loaded from .kiro/steering/ at graph build time |
| BR-20 | Chat history capped at 200 messages (sliding window, oldest removed) |
| BR-21 | Hallucination grading enabled only for small context window models |
| BR-22 | Context budget injected into state if provider reports window size |

---

### 3.5 Feature: Hotfix Pipeline

**Source:** BRD Story 8

#### 3.5.1 Use Case: UC-06 — Hotfix Fast-Track

**Main Flow:**

| Step | Action |
|------|--------|
| 1 | analyze_bug: LLM identifies root cause and fix approach |
| 2 | dev_fix: DEV node implements the fix |
| 3 | qa_verify: QA node verifies the fix |
| 4 | If pass, route to deploy_hotfix |
| 5 | deploy_hotfix: DevOps deploys patch |

**Alternative Flow — Fix Fails QA (AF-6):**

| Step | Action |
|------|--------|
| 3a | QA verification fails (pipelineStatus = "failed") |
| 3b | If retryCount["dev_fix"] < 3, route back to dev_fix |
| 3c | If >= 3, route to END (escalate) |

#### 3.5.2 Business Rules

| ID | Rule |
|----|------|
| BR-23 | Hotfix max fix attempts = 3 |
| BR-24 | No documentation phases in hotfix pipeline |
| BR-25 | No quality gates in hotfix (speed over ceremony) |

---

### 3.6 Feature: Streaming and Events

**Source:** BRD Story 13

#### 3.6.1 Business Rules

| ID | Rule |
|----|------|
| BR-26 | StreamHandler emits events via onEvent callback |
| BR-27 | Event types: token, status, progress, complete, error, retry, verify, strategy_switch, human_intervention_required |
| BR-28 | Each event includes nodeId and streamId for correlation |
| BR-29 | Multiple active streams must not interfere |

#### 3.6.2 Event Schema

| Event Type | Payload |
|-----------|---------|
| token | { nodeId, token, streamId } |
| status | { nodeId, status: active/completed/failed, streamId } |
| complete | { nodeId, durationMs, streamId } |
| error | { nodeId, message, streamId } |
| retry | { nodeId, attempt, maxRetries, delayMs, reason, streamId } |
| verify | { nodeId, passed, feedback, attempt, streamId } |
| strategy_switch | { nodeId, from, to, reason, streamId } |

---

## 4. State Model

### 4.1 Pipeline State Diagram

![State Diagram](diagrams/state-pipeline.png)

### 4.2 PipelineStatus Transitions

| From | To | Trigger |
|------|-----|---------|
| idle | running | Engine.invoke() called |
| running | paused | Quality gate reached / strategy exhausted |
| paused | running | User approves |
| paused | cancelled | User rejects |
| running | completed | All phases done (END reached) |
| running | failed | Non-recoverable error after max retries |
| cancelled | - | Terminal state |
| completed | - | Terminal state |
| failed | - | Terminal state |

### 4.3 PipelineState Channels

| Channel | Type | Reducer | Default |
|---------|------|---------|---------|
| ticketKey | string | replace | "" |
| threadId | string | replace | "" |
| currentPhase | SDLCPhase | replace | "requirements" |
| intent | PipelineIntent | replace | "chat" |
| pipelineStatus | PipelineStatus | replace | "idle" |
| documents | Record<string, DocumentState> | replace | {} |
| agentOutputs | AgentOutput[] | replace | [] |
| chatHistory | ChatMessage[] | append + cap(200) | [] |
| errors | PipelineError[] | replace | [] |
| retryCount | Record<string, number> | replace | {} |
| feedbackIterations | number | replace | 0 |
| maxFeedbackIterations | number | replace | 5 |
| discrepancyFound | boolean | replace | false |
| verifyPassed | boolean | replace | true |
| verifyFeedback | string | null | replace | null |
| verifyAttempts | Record<string, number> | merge | {} |
| maxVerifyAttempts | number | replace | 2 |
| activeStrategy | Record<string, string> | merge | {} |
| strategyHistory | StrategyEvent[] | append + cap(20) | [] |
| approvalRequired | boolean | replace | false |
| approvalDecision | ApprovalDecision | null | replace | null |
| pendingApprovals | QualityGateCheckpoint[] | replace | [] |
| qualityGateResults | Record<string, QualityGateResult> | merge | {} |
| toolCalls | LlmToolCall[] | null | replace | null |
| toolResults | array | append | [] |
| agentScratchpad | LlmMessage[] | replace | [] |
| agentIterations | number | replace | 0 |
| maxContextTokens | number | replace | 0 |

---

## 5. Integration Requirements

### 5.1 MCP Bridge Integration

The McpBridge provides tool calling capability to all nodes. Every BaseNode has `callMcp(toolName, args)` which delegates to `mcpBridge.callTool()` with a 60s timeout.

### 5.2 LLM Provider Integration

LlmProvider interface supports:
- `chat(messages, options)` — synchronous completion
- `chatStream(messages, options)` — async generator of tokens
- `isAvailable()` — health check
- `getContextWindow()` — reports model context size

### 5.3 VS Code Extension Integration

- Singleton LangGraphEngine created during extension activation
- Chat Panel webview sends messages to engine
- Engine streams events back to webview via onEvent callback
- Checkpointer uses workspace root for state directory

---

## 6. Error Handling

| Error Scenario | Handling |
|----------------|----------|
| Node timeout (300s) | Error thrown, caught by BaseNode.run(), retry with backoff |
| Tool call timeout (60s) | Error thrown within node execution, propagates to retry |
| LLM unavailable | NonRecoverableError → immediate failure (no retry) |
| Checkpoint write failure | Error logged, execution continues (state may not persist) |
| Verify node internal error | Fail-open: treated as pass (BR-12) |
| Max retries exhausted | PipelineError created, status = "failed" |

---

## 7. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | SDLC Graph Sequence | [sequence-sdlc.png](diagrams/sequence-sdlc.png) | [sequence-sdlc.drawio](diagrams/sequence-sdlc.drawio) |
| 3 | Pipeline State Diagram | [state-pipeline.png](diagrams/state-pipeline.png) | [state-pipeline.drawio](diagrams/state-pipeline.drawio) |
