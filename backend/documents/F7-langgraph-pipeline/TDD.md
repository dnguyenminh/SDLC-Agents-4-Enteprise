# Technical Design Document (TDD)

## SA4E — F7: LangGraph SDLC Pipeline

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F7 |
| Title | LangGraph SDLC Pipeline |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-01-27 |
| Status | Draft |
| Related FSD | documents/F7-langgraph-pipeline/FSD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-27 | SA Agent | Initial TDD — multi-graph architecture design |

---

## 1. Architecture Overview

### 1.1 Architecture Diagram

![Architecture](diagrams/architecture.png)

### 1.2 Design Philosophy

The LangGraph SDLC Pipeline follows a multi-graph router pattern with:

1. Single entry point — LangGraphEngine (singleton) receives all input
2. Intent-first routing — Router graph classifies before delegating
3. Lazy subgraph loading — Zero startup cost for unused pipelines
4. Uniform state model — All subgraphs share PipelineAnnotation state
5. Self-correction loop — verify, retry, strategy switch pattern
6. Crash-safe persistence — Atomic checkpoint writes with resume capability

### 1.3 Technology Stack

| Layer | Technology |
|-------|-----------|
| Graph Framework | @langchain/langgraph (StateGraph, END, Annotation) |
| Runtime | Node.js (VS Code extension host) |
| Language | TypeScript (strict mode) |
| State Persistence | JSON files (filesystem) |
| LLM Integration | LlmProvider interface (Anthropic/OpenAI/local) |
| Tool Calling | MCP Protocol via McpBridge |
| Event Streaming | Callback-based (ChatExtToWebviewMessage) |

---

## 2. Component Design

### 2.1 Component Diagram

![Component](diagrams/component.png)

### 2.2 Module Structure

```
backend/extension/src/langgraph/
├── index.ts                    # Public API exports
├── langgraph-engine.ts         # Singleton orchestrator
├── graph-builder.ts            # Entry point — builds router graph
├── state.ts                    # PipelineAnnotation (state schema)
├── state-types.ts              # Type definitions
├── edges.ts                    # SDLC edge routing functions
├── edges-feedback.ts           # Feedback loop + verify routing
├── mcp-bridge.ts               # MCP tool calling adapter
├── stream-handler.ts           # Event emission to webview
├── checkpointer.ts             # WorkspaceCheckpointer (BaseCheckpointSaver)
├── checkpointer-helpers.ts     # Cleanup, sanitization utilities
├── llm-provider.ts             # LLM abstraction interface
├── tool-registry.ts            # MCP tool discovery + schema caching
├── steering-loader.ts          # .kiro/steering/ file loading
├── context-budget.ts           # Token budget calculation
├── config/
│   ├── verify-criteria.ts      # Per-phase verification rules
│   └── alternate-strategies.ts # Fallback strategy definitions
├── errors/
│   └── non-recoverable-error.ts
├── router/
│   ├── router-graph.ts         # Top-level router graph
│   ├── intent-classifier.ts    # Regex + LLM classification
│   └── router-state.ts         # IntentClassification interface
├── graphs/
│   ├── GraphFactory.ts         # Factory for all graphs
│   ├── sdlc-graph.ts           # Full SDLC pipeline
│   ├── sdlc-node-factory.ts    # Creates SDLC node instances
│   ├── hotfix-graph.ts         # Bug fix fast-track
│   ├── code-review-graph.ts    # PR review pipeline
│   ├── docs-graph.ts           # Document generation
│   ├── security-audit-graph.ts # Security scanning
│   ├── chat-graph.ts           # ReAct agent loop
│   ├── chat-graph-nodes.ts     # Chat-specific node functions
│   ├── verify-node.ts          # Chat response verification
│   ├── verify-prompt.ts        # Verify prompt template
│   ├── rag-grader-nodes.ts     # Corrective RAG grading
│   └── rag-grader-prompts.ts   # RAG grading prompts
├── nodes/
│   ├── base-node.ts            # Abstract base with retry, timeout, LLM
│   ├── sm-node.ts              # Scrum Master routing
│   ├── ba-node.ts              # Business Analyst
│   ├── ta-node.ts              # Technical Analyst
│   ├── sa-node.ts              # Solution Architect
│   ├── qa-node.ts              # Quality Assurance
│   ├── dev-node.ts             # Developer
│   ├── devops-node.ts          # DevOps
│   ├── ui-node.ts              # UI Designer
│   ├── security-node.ts        # Security Reviewer
│   ├── feedback-node.ts        # BA-SA feedback loop controller
│   ├── verify-node.ts          # Output quality verification
│   ├── approval-node.ts        # Quality gate (pause + criteria)
│   ├── workspace-file-ops.ts   # File read/write/export utilities
│   ├── jira-helpers.ts         # Jira tool call wrappers
│   ├── hook-helpers.ts         # Pre/post hook execution
│   └── agent-prompt-loader.ts  # Dynamic prompt loading
└── __tests__/                  # Unit and integration tests
```

---

## 3. Class Design

### 3.1 LangGraphEngine

```typescript
class LangGraphEngine {
  private graph: CompiledGraph | null;
  private checkpointer: WorkspaceCheckpointer;
  private streamHandler: StreamHandler;
  private mcpBridge: McpBridge;
  private llmProvider: LlmProvider | undefined;
  private hookEngine: HookEngine;
  private activeThread: string | null;
  private cancelled: boolean;
  private chatHistoryByTab: Map<string, ChatMessage[]>;
  
  constructor(mcpManager, workspaceRoot, onEvent, llmProvider?);
  
  async invoke(ticketKey, phase, chatInput, intent?): Promise<void>;
  async invokeChat(chatInput: string): Promise<void>;
  async resume(threadId: string): Promise<void>;
  async handleApproval(decision, feedback?): Promise<void>;
  cancel(): void;
  setLlmProvider(provider): void;
  setChatHistory(history, tabId?): void;
  getChatHistory(): ChatMessage[];
  switchActiveTab(tabId: string): void;
  listPersistedPipelines(): PersistedPipelineInfo[];
  getCurrentNodeStates(): PipelineGraphNode[];
  dispose(): void;
  
  private async ensureGraph(): Promise<CompiledGraph>;
}
```

### 3.2 BaseNode (Abstract)

```typescript
abstract class BaseNode {
  static readonly MAX_RETRIES = 2;
  
  constructor(nodeId, mcpBridge, streamHandler, llmProvider?);
  abstract execute(state: PipelineState): Promise<Partial<PipelineState>>;
  async run(state: PipelineState): Promise<Partial<PipelineState>>;
  
  protected async callLlm(system, user, options?): Promise<string>;
  protected async *callLlmStream(system, user, state, options?): AsyncGenerator<string>;
  protected async callLlmStreamFull(system, user, state, options?): Promise<string>;
  protected async isLlmAvailable(): Promise<boolean>;
  protected async callMcp(toolName, args): Promise<string>;
  protected callDynamicTool(toolName, args): Promise<string>;
  protected async discoverTools(query, threshold?, topK?): Promise<string>;
  
  protected readWorkspaceFile(path): Promise<string>;
  protected writeWorkspaceFile(path, content): Promise<void>;
  protected appendWorkspaceFile(path, content): Promise<void>;
  protected exportDocx(markdown, name): Promise<string>;
  protected exportDrawioPng(drawioPath): Promise<string>;
  protected getWorkspaceRoot(): string;
  protected readCodeIntelligence(module?): Promise<string>;
  
  protected getJiraIssue(key): Promise<string>;
  protected getJiraIssueFields(key, fields): Promise<string>;
  protected searchJira(jql): Promise<string>;
  protected getJiraIssueRecursive(key, depth?, max?): Promise<string>;
  
  protected kbSearch(query, limit?, scope?): Promise<string>;
  protected async kbIngest(content, type, source, tags, scope?): Promise<void>;
  protected async kbIngestFile(filePath, type?, scope?): Promise<void>;
  
  protected loadAgentPrompt(name, fallback): Promise<string>;
  protected async runAgentWorkflow(agentName, state, vars?): Promise<any>;
  
  private withTimeout<T>(promise, ms): Promise<T>;
  private buildFailureState(state, error, retryCount): Partial<PipelineState>;
  private sleep(ms: number): Promise<void>;
}
```

### 3.3 VerifyNode

```typescript
class VerifyNode extends BaseNode {
  private targetNodeId: string;
  
  constructor(nodeId, targetNodeId, mcpBridge, streamHandler, llmProvider?);
  async execute(state): Promise<Partial<PipelineState>>;
  private async evaluateOutput(output, criteria, state): Promise<{passed, feedback}>;
  private parseVerifyResponse(response): {passed, feedback};
  private buildVerifyPass(state): Partial<PipelineState>;
  private buildVerifyFailure(state, feedback): Partial<PipelineState>;
  private getLastAgentOutput(state): AgentOutput | null;
}
```

### 3.4 ApprovalNode

```typescript
class ApprovalNode extends BaseNode {
  private phase: SDLCPhase;
  static PHASE_CRITERIA: Record<string, {gateId, criteria: string[]}>;
  
  constructor(nodeId, phase, mcpBridge, streamHandler, llmProvider?);
  async execute(state): Promise<Partial<PipelineState>>;
}
```

### 3.5 FeedbackNode

```typescript
class FeedbackNode extends BaseNode {
  async execute(state): Promise<Partial<PipelineState>>;
  // Checks discrepancyFound + feedbackIterations
  // Routes to ba_fix_fsd or exits loop
}
```

### 3.6 WorkspaceCheckpointer

```typescript
class WorkspaceCheckpointer extends BaseCheckpointSaver {
  private stateDir: string;
  
  constructor(workspaceRoot: string);
  async getTuple(config): Promise<CheckpointTuple | undefined>;
  async put(config, checkpoint, metadata, newVersions): Promise<RunnableConfig>;
  async putWrites(config, writes, taskId): Promise<void>;
  async *list(config, options?): AsyncGenerator<CheckpointTuple>;
  async deleteThread(threadId): Promise<void>;
  async delete(config): Promise<void>;
  listPersistedPipelines(): PersistedPipelineInfo[];
  cleanup(maxAgeDays?: number): void;
  private ensureDir(): void;
}
```

---

## 4. Routing Design

### 4.1 Edge Functions

| Function | Source Node | Routing Logic |
|----------|-------------|---------------|
| routeFromSm | sm | Maps currentPhase to agent node |
| routeAfterVerify(target, next) | verify_* | pass: next, fail+retry: target, fail+max: strategy_switch |
| routeAfterQualityGate | quality_gate_* | approve: sm, reject: END, revise: agent |
| routeAfterFeedbackCheck | feedback_check | no discrepancy: security_review_tdd, discrepancy: ba_fix_fsd |
| routeAfterBaFixFsd | ba_fix_fsd | sa_review (or END on failure) |
| routeAfterSaReview | sa_review | feedback_check (loop back) |
| routeAfterStrategySwitch | strategy_switch | agent with alternate OR END (paused) |
| routeByIntent | classify_intent | intent to subgraph node name |

### 4.2 SDLC Node Sequence per Phase

| Phase | Node Sequence |
|-------|--------------|
| requirements | sm -> ba_brd -> verify_ba_brd -> quality_gate_requirements |
| specification | sm -> ba_fsd -> verify_ba_fsd -> ta_enrich -> security_review_fsd -> quality_gate_specification |
| design | sm -> sa_tdd -> verify_sa_tdd -> feedback_check -> [loop] -> security_review_tdd -> quality_gate_design |
| test_planning | sm -> qa_plan -> verify_qa_plan -> quality_gate_test_planning |
| implementation | sm -> dev_code -> verify_dev_code -> security_review_code -> quality_gate_implementation |
| user_guide | sm -> dev_ug -> verify_dev_ug -> ba_review_ug -> qa_verify_ug -> ug_join -> quality_gate_user_guide |
| testing | sm -> qa_test -> quality_gate_testing |
| deployment | sm -> devops_deploy -> quality_gate_deployment |

---

## 5. Data Flow

### 5.1 State Mutation Pattern

Each node receives full PipelineState and returns Partial<PipelineState>. LangGraph merges the partial result using defined reducers (replace, append, merge).

### 5.2 Key Reducers

| Channel | Reducer | Behavior |
|---------|---------|----------|
| chatHistory | append + cap(200) | New messages appended, oldest trimmed |
| strategyHistory | append + cap(20) | Strategy events accumulated |
| toolResults | append | Tool results accumulated |
| qualityGateResults | merge (spread) | Results merged by key |
| verifyAttempts | merge (spread) | Attempt counts merged by node |
| activeStrategy | merge (spread) | Active strategies merged |
| All others | replace | Last write wins |

### 5.3 Checkpoint Data Flow

```
Node execution -> LangGraph runtime -> checkpointer.put()
  -> serialize to JSON -> write .tmp -> rename to .json

Resume -> checkpointer.getTuple() -> parse JSON
  -> graph.invoke(null, config) -> continue from last node
```

---

## 6. Error Handling Design

### 6.1 Retry Strategy

BaseNode.run() implements retry with exponential backoff: delays of 1s, 2s. Max 2 retries. NonRecoverableError bypasses retry and fails immediately.

### 6.2 Error Propagation

| Error Type | Node Behavior | Graph Behavior |
|-----------|---------------|----------------|
| Timeout (300s) | Throw | Caught by retry loop |
| LLM failure | NonRecoverableError | Immediate failure state |
| Tool call failure | Throw | Caught by retry loop |
| Verify internal error | Catch, return pass | Continue pipeline (fail-open) |
| Checkpoint write error | Log warning | Execution continues |

### 6.3 Strategy Switch Flow

Agent fails verify (attempt 1) -> retry agent -> fails verify (attempt 2) -> strategy_switch node activates. If alternate configured AND not tried: switch strategy, reset attempts. If alternate fails or not configured: emit human_intervention_required, pause.

---

## 7. Security Design

### 7.1 Prompt Injection Defense

- Steering rules loaded from trusted workspace files only (.kiro/steering/)
- System prompts assembled server-side (not user-modifiable)
- User input placed in "user" message role only
- Tool schemas are static from MCP server discovery

### 7.2 Checkpoint Security

- Stored in workspace-local .vscode/ directory
- No sensitive data (keys, tokens) in checkpoint state
- Automatic cleanup prevents unbounded disk usage
- Atomic writes prevent corruption

### 7.3 MCP Tool Safety

- All tool calls via McpBridge with 60s timeout
- Tool results treated as untrusted data
- No shell execution from tool results without validation

---

## 8. Performance Considerations

### 8.1 Lazy Loading

Subgraphs imported dynamically (await import()) on first use. Compiled graphs cached in subgraphCache Map. Startup only compiles Router Graph.

### 8.2 Token Budgeting

- Chat history capped at 200 messages
- Context budget tracked in state (maxContextTokens)
- Large tool results truncated before LLM feed

### 8.3 Checkpoint Size

- Typical: 10-50KB JSON
- sanitizeMetadata() strips non-serializable fields
- No function references stored

---

## 9. Implementation Checklist

### 9.1 All Files Exist

All source files for F7 are already implemented in `backend/extension/src/langgraph/`. This TDD documents the existing architecture for future maintenance and extension.

### 9.2 Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Multi-graph over monolithic | Separation of concerns; lazy loading; independent testing |
| Regex-first intent classification | < 100ms latency; LLM only for ambiguous cases |
| Fail-open verify nodes | Pipeline progress > strict verification in error cases |
| JSON file checkpoints | Simple, no external DB required, workspace-portable |
| Callback-based streaming | Matches VS Code webview message protocol |
| Max iteration limits everywhere | Prevents infinite loops (feedback: 5, verify: 2, chat: 25) |

---

## 10. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
