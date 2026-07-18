# LangGraph Module Reference

Tài liệu tham chiếu cấu trúc module LangGraph thực tế — đối chiếu với thiết kế khái niệm tại `Langgrap.md`.

---

## 1. Module Structure (Reorganized Q3 2026)

```
extension/src/langgraph/
├── index.ts              — Barrel exports (public API)
├── core/                 — Nền tảng: state, LLM, MCP, streaming, checkpoint
├── agents/               — Agent nodes: DynamicAgentNode, registry, verify/gate
├── pipeline/             — SDLC pipeline: graph, node factory, edges
├── subgraphs/            — Subgraphs: chat, docs, hotfix, code-review, security
├── engine/               — Orchestration: LangGraphEngine, chat handler
├── hooks/                — Hook lifecycle: loader, executor, emitter, filters
├── workflow/             — Workflow parser & executor từ markdown agent files
├── steering/             — Steering rules loader & injector
├── vscode/               — VS Code native tools & tool registry (MCP)
├── helpers/              — Workspace file ops & hook firing utilities
├── providers/            — LLM providers: Anthropic, OpenAI, Ollama, ONNX
├── router/               — Intent classifier & multi-graph router
├── config/               — Verify criteria & alternate strategies
├── errors/               — Non-recoverable error class
└── __tests__/            — Unit tests
```

### So sánh với Langgrap.md (thiết kế khái niệm)

| Langgrap.md | Thực tế | Ghi chú |
|---|---|---|
| `src/types.ts` | `core/state.ts` + `core/state-types.ts` | Tách riêng Annotation và type definitions |
| `src/parser.ts` | `workflow/workflow-parser.ts` + `hooks/hook-loader.ts` | Parser chia làm 2: workflow parser + hook loader |
| `src/engine.ts` (1 file) | `engine/langgraph-engine.ts` + `pipeline/sdlc-graph.ts` + `subgraphs/*` | Engine được modular hoá thành nhiều module |
| `src/run.ts` | Không có tương đương | Là script demo, không phải production code |
| 5 nodes cố định | ~30+ nodes dynamic + subgraphs | Agent-driven, registry-based |
| `KiroState` đơn giản | `PipelineAnnotation` với 30+ channels | State phức tạp hơn nhiều |

---

## 2. Core Module (`core/`)

Trái tim của hệ thống. Cung cấp state, LLM abstraction, MCP bridge, streaming, checkpointing.

| File | Export chính | Lines |
|---|---|---|
| `state.ts` | `PipelineAnnotation` (LangGraph Root), `PipelineState` | ~180 |
| `state-types.ts` | 18 type definitions: `SDLCPhase`, `ApprovalDecision`, `AgentOutput`, etc. | ~95 |
| `llm-provider.ts` | `interface LlmProvider` (unified LLM contract) | ~90 |
| `base-node.ts` | `abstract class BaseNode` (retry, LLM, MCP, hooks, workflow) | ~300 |
| `mcp-bridge.ts` | `class McpBridge` (tool call với timeout, arg interceptors) | ~160 |
| `stream-handler.ts` | `class StreamHandler` (event bridge → UI) | ~200 |
| `checkpointer.ts` | `class WorkspaceCheckpointer` (filesystem checkpoint) | ~200 |
| `context-budget.ts` | `estimateTokens()`, `buildBudgetAwareMessages()`, token pruning | ~130 |

### Key Design: `BaseNode`

BaseNode là abstract class mà tất cả agent/verify/gate nodes kế thừa. Cung cấp:

- **Retry loop**: max 2 retries, `NonRecoverableError` skip retry
- **LLM wrappers**: `callLlm()`, `callLlmStream()`, `callLlmStreamFull()`
- **MCP integration**: `callMcp()`, `callDynamicTool()`, `discoverTools()`
- **Workspace**: `readWorkspaceFile()`, `writeWorkspaceFile()`, `exportDocx()`, `exportDrawioPng()`
- **KB**: `searchKB()`, `ingestKB()`
- **Hooks**: `firePreToolUseHooks()`, `fireAgentStopHooks()`
- **Steering**: `loadSystemPromptWithSteering()` — inject rules từ `.kiro/steering/`
- **Workflow**: `runAgentWorkflow()` — execute dynamic workflow từ markdown

---

## 3. Agent System (`agents/`)

Thay thế hoàn toàn các typed agent classes cũ (`BaNode`, `TaNode`, `SaNode`, ...) bằng cơ chế **registry-driven, dynamic agent nodes + LLM-based pipeline extraction**.

| File | Export chính | Vai trò |
|---|---|---|
| `registry.ts` | `AgentRegistry`, `AgentConfig` | Scan `.kiro/agents/*.md`, parse YAML frontmatter + LLM pipeline extraction |
| `pipeline-extractor.ts` | `PipelineExtractor`, `PipelineDefinition`, `PhaseDefinition`, `AgentRelation` | LLM extract cấu trúc pipeline từ nội dung agent files |
| `dynamic-agent-node.ts` | `DynamicAgentNode extends BaseNode` | Unified agent executor cho mọi agent |
| `verify-node.ts` | `VerifyNode extends BaseNode` | Post-agent quality verification |
| `approval-node.ts` | `ApprovalNode extends BaseNode` | Phase gate approval với autonomy levels |
| `feedback-node.ts` | `FeedbackNode extends BaseNode` | BA↔SA feedback loop controller |
| `analyze-input-node.ts` | `AnalyzeInputNode extends BaseNode` | Multilingual intent classifier |
| `security-node.ts` | `SecurityNode extends BaseNode` | Security scanner (4 scan types) |
| `hotfix-verify-node.ts` | `HotfixVerifyNode extends BaseNode` | Hotfix-specific lightweight verify |

### So sánh với Langgrap.md

| Langgrap.md concept | Thực tế |
|---|---|
| `agentCoreNode` (1 node) | `DynamicAgentNode` — 1 class cho tất cả agent, config-driven |
| `smQualityGateNode` | `VerifyNode` + `ApprovalNode` — tách riêng verify và gate |
| `analyzeHumanInputNode` | `AnalyzeInputNode` — tương tự, nhưng dùng Zod structured output |
| Hardcoded pipeline | `PipelineExtractor` — LLM đọc agent `.md` content → tự động wire graph |

### Pipeline Extraction Flow

```
.kiro/agents/
├── ba-agent.md    "Bạn review dev-agent's user guide..."
├── sa-agent.md    "SA review BA's BRD, feedback loop..."
├── dev-agent.md   "Security review sau implementation..."
├── qa-agent.md   "QA verify test plans..."
├── ta-agent.md   "TA review ba-agent's FSD..."
└── devops-agent.md

       │ LLM đọc nội dung từng file (natural language)
       ▼
PipelineExtractor.extract() ──→ PipelineDefinition
  ├── phases: [{ id, order, agentIds }]     ← Thứ tự pipeline
  └── relations: [{ sourceId, targetId,     ← Quan hệ giữa agents
                     type: "reviews"|
                           "feeds_into"|
                           "verifies"
                     phaseId }]
       │
       ▼
AgentRegistry.generateInfraNodes()
  ├── verify_{phase}    (tự động từ relations)
  └── quality_gate_{phase}
       │
       ▼
sdlc-node-factory.createSdlcNodes()
  └── DynamicAgentNode | VerifyNode | ApprovalNode
```

### AgentConfig lifecycle

```
.kiro/agents/ba-agent.md
  └── YAML frontmatter: name, phase, outputDoc
       └── AgentRegistry.load() → AgentConfig[] (từ frontmatter)
            └── AgentRegistry.loadPipeline(llm) → PipelineDefinition (từ LLM)
                 ├── generateInfraNodes() → verify + gate nodes
                 └── getPhases() / getRelations() dùng pipeline definition
                      └── sdlc-node-factory.createSdlcNodes()
                           └── new DynamicAgentNode(config)
                                └── đọc prompt từ file.md, gọi LLM, viết output doc
```

---

## 4. SDLC Pipeline (`pipeline/`)

### Dynamic Pipeline Wiring (PipelineDefinition-driven)

| File | Export | Vai trò |
|---|---|---|
| `sdlc-graph.ts` | `buildSdlcSubgraph()` | Build SDLC graph **dynamically từ PipelineDefinition** |
| `sdlc-node-factory.ts` | `createSdlcNodes()`, `interface SdlcNodes` | Factory tạo nodes từ registry |
| `edges.ts` | 15+ routing functions + `QUALITY_GATE_TARGETS` | Edge routing cho pipeline |
| `edges-feedback.ts` | `routeAfterFeedbackCheck()`, `routeAfterVerify()`, ... | Feedback loop routing (KSA-233) |

### Pipeline flow (dynamically generated)

**Trước đây (hardcoded):** 114 dòng code cho 8 phase blocks (line 109-222 của sdlc-graph.ts cũ)

**Hiện tại (dynamic):**
```
PipelineDefinition.phases (sorted by order)
  │
  for each phase:
  │
  ├── addNode(agentIds[0])
  ├── addNode(verify_{phase.id})      ← tự sinh từ registry
  ├── addNode(quality_gate_{phase.id}) ← tự sinh từ registry
  │
  ├── agent → verify → [security_review?] → [cross-review from relations?] → gate
  │
  └── gate → routeAfterQualityGate → next phase agent | analyze_input | END

PipelineDefinition.relations:
  ├── "reviews" (type) → cross-review node sau verify
  ├── "feeds_into" → xác định thứ tự phase
  └── "verifies" → verification relationship
```

Ví dụ với `.kiro/agents/*.md` hiện tại, LLM extract ra:
```
Phases (inferred order):
  1. requirements → ba-agent
  2. specification → ba-agent (write FSD), ta-agent (review + security)
  3. design → sa-agent (TDD, feedback loop với BA)
  4. test_planning → qa-agent
  5. implementation → dev-agent (code + security)
  6. user_guide → dev-agent (write UG), ba-agent (review), qa-agent (review)
  7. testing → qa-agent
  8. deployment → devops-agent

Relations (inferred):
  ta-agent reviews ba-agent @ specification
  ba-agent reviews dev-agent @ user_guide
  ba-agent ↔ sa-agent feedback loop @ design
  sa-agent → security_review @ design
  dev-agent → security_review @ implementation
```

**Lưu ý:** Design phase (BA↔SA feedback) và User Guide phase (multi-agent review) vẫn có special handling trong code vì pattern quá phức tạp để LLM generate chính xác.

### So sánh với Langgrap.md

| Langgrap.md | Thực tế |
|---|---|
| Single linear graph | Dynamic pipeline từ LLM extraction |
| Fixed 5 nodes | Số phase và agents thay đổi theo `.kiro/agents/*.md` |
| Hardcoded routing | Graph wiring từ `PipelineDefinition.phases` + `relations` |
| 1 retry attempt | max 2 retries + circuit breaker |

---

## 5. Subgraphs (`subgraphs/`)

6 subgraphs được router graph triệu gọi động (lazy import).

| Subgraph | Builder | Nodes | Mục đích |
|---|---|---|---|
| **chat** | `buildChatSubgraph()` | fetch_tools → agent_step → execute_tools → verify_response | Free-form Chat ReAct loop |
| **hotfix** | `buildHotfixSubgraph()` | analyze_bug → dev_fix → hotfix_verify → deploy_hotfix | Bug fix fast-track |
| **code-review** | `buildCodeReviewSubgraph()` | fetch_context → security_scan → quality_review → report | PR review |
| **docs** | `buildDocsSubgraph()` | detect_doc_type → [ba/dev/devops] → qa_verify_docs | Doc generation |
| **security-audit** | `buildSecurityAuditSubgraph()` | 3 parallel scans → join → report | Security audit |
| **sdlc** | `buildSdlcSubgraph()` | Full 8-phase pipeline | Main SDLC lifecycle |

### Key feature: Corrective RAG (chat subgraph)

Cho small models (context ≤ 32K): hallucination grader + retrieve evaluator.
```
agent_step → [tool_use] → execute_tools → agent_step (loop)
           → [text] → verify_response → [COMPLETE] → end
                                        → [INCOMPLETE] → agent_step (retry)
                                        → [TOOL_NEEDED] → execute_tools
```

---

## 6. Engine (`engine/`)

| File | Export | Vai trò |
|---|---|---|
| `langgraph-engine.ts` | `class LangGraphEngine` | Singleton orchestrator — invoke, resume, approve, chat |
| `engine-chat-handler.ts` | `executeChat()` | Chat execution với tab history management |

### Pipeline extraction trigger

Pipeline extraction xảy ra **lazily** tại `ensureGraph()`:

```
LangGraphEngine constructor
  └── agentRegistry.load(workspaceRoot)     ← đọc frontmatter .md files

LangGraphEngine.ensureGraph() (lazy, first invoke)
  └── agentRegistry.loadPipeline(workspaceRoot, llmProvider)  ← LLM extract
       └── PipelineExtractor.extract(agentFiles, llm) → PipelineDefinition
            └── generateInfraNodes() → verify + gate nodes
  └── buildPipelineGraph(mcpBridge, ...)   ← build graph với pipeline đã extract
```

Nếu LLM provider chưa set, fallback dùng frontmatter phase từ `load()`.

### LangGraphEngine API

```typescript
class LangGraphEngine {
  invoke(initialState)           // Start pipeline (triggers ensureGraph)
  resume(threadId)               // Resume from checkpoint
  handleApproval(threadId, decision) // Process human approval
  submitFeedback(threadId, text) // Submit NL feedback
  invokeChat(tabId, message)     // Free-form chat
  cancel(threadId)               // Cancel execution
  setLlmProvider(provider)       // Switch LLM provider
  getCurrentNodeStates()         // Get node definitions (visualization)
  listPersistedPipelines()       // List saved pipelines
  dispose()                      // Cleanup
}
```

---

## 7. Hooks System (`hooks/`)

6 files implementing the full hook lifecycle:

```
.hook file (JSON) → loadHooks() → cache → firePreToolUse() / firePostToolUse()
                                              ↓
                                         HookExecutor.execute()
                                              ↓
                                         askAgent (LLM) | runCommand (shell)
                                              ↓
                                         HookResult → emitHookFired() (→ UI)
```

### Hook execution pipeline

```
Node execution → firePreToolUseHooks()
                  ↓
              [hooks modify params or deny execution]
                  ↓
              Tool execution (MCP / VS Code)
                  ↓
              fireFileHooks() (if file created/edited)
                  ↓
              fireAgentStopHooks()
```

---

## 8. Workflow System (`workflow/`)

Executes agent workflows defined in `.kiro/agents/*.md` markdown:

```
.kiro/agents/ba-agent.md
  └── parseAgentWorkflow() → ParsedWorkflow { steps, skills }
       └── WorkflowExecutor.run() → iterate steps → executeAction()
            ├── read_template | read_file
            ├── fetch_jira | fetch_jira_recursive
            ├── kb_search | kb_ingest | kb_ingest_file
            ├── read_code_intelligence
            ├── generate_llm (LLM call)
            ├── write_file | append_file
            ├── export_docx | export_drawio_png
            ├── exec_shell | exec_git
            ├── discover_tools
            └── load_skill
```

---

## 9. Routing & Intent Classification (`router/`)

```
User input → classifyIntent()
              ├── Regex fast-path (9 patterns): "hotfix", "review", "security"...
              └── LLM fallback (if confidence < 0.8)
                   ↓
              IntentClassification { intent, confidence, source }
                   ↓
              buildRouterGraph() → route to subgraph:
                   ├── "sdlc" → buildSdlcSubgraph()
                   ├── "hotfix" → buildHotfixSubgraph()
                   ├── "code_review" → buildCodeReviewSubgraph()
                   ├── "docs" → buildDocsSubgraph()
                   ├── "security_audit" → buildSecurityAuditSubgraph()
                   └── "chat" → buildChatSubgraph()
```

---

## 10. LLM Providers (`providers/`)

9 files implementing unified `LlmProvider` interface.

| Provider | Class | Backend |
|---|---|---|
| Anthropic | `AnthropicProvider` | `@anthropic-ai/sdk` (Messages API) |
| OpenAI | `OpenAIProvider` | `fetch()` (Chat Completions API) |
| Ollama | `OllamaProvider` | `/api/chat` (local) |
| ONNX | `OnnxProvider` | `onnxruntime-node` (CPU) |

Provider registry: 140+ provider definitions (`provider-registry.ts`).

---

## 11. Steering Rules (`steering/`)

Dynamic rule injection từ `.kiro/steering/*.md`:

```
.kiro/steering/code-standards.md
  └── YAML frontmatter: targets, inclusion, fileMatchPattern
       └── loadSteeringRules() → filter by target + inclusion
            └── injectSteering() → append to base prompt (capped 4000 chars)
```

---

## 12. Data Flow Diagram

```
                          ┌──────────────┐
                          │  User Input   │
                          └──────┬───────┘
                                 ▼
                          ┌──────────────┐
                          │    Router     │─── regex/LLM intent classification
                          │ (router/)     │
                          └──────┬───────┘
                                 ▼ intent
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
      ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
      │  SDLC Graph  │  │  Subgraphs   │  │  Chat Graph  │
      │ (pipeline/)  │  │ (subgraphs/) │  │ (subgraphs/) │
      └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
             ▼                 ▼                  ▼
      ┌─────────────────────────────────────────────┐
      │              LangGraphEngine                │
      │  ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
      │  │  MCP    │ │  Stream  │ │  Checkpoint  │  │
      │  │  Bridge │ │  Handler │ │  (core/)     │  │
      │  └────┬────┘ └────┬─────┘ └──────┬──────┘  │
      └───────┼───────────┼──────────────┼─────────┘
              ▼           ▼              ▼
      ┌──────────────────────────────────────┐
      │         VS Code / Extension          │
      │  Chat Panel │ Webviews │ File System │
      └──────────────────────────────────────┘
```

---

## 13. Dependencies Graph

```
providers/ → core/ → agents/ + config/ + steering/
                       ↓
               pipeline/ + subgraphs/
                       ↓
                  router/
                       ↓
                  engine/
```

Module `core/` là nền tảng — hầu như mọi module khác đều phụ thuộc vào nó. Module `engine/` nằm ở tầng cao nhất, orchestrate toàn bộ system.

---

## 14. Key Differences from Original Langgrap.md Design

| Aspect | Langgrap.md (Conceptual) | Actual (Current) |
|---|---|---|
| **Nodes** | 5 fixed nodes | ~30+ dynamic nodes from registry |
| **State** | Simple Annotation (10 fields) | Complex Annotation (30+ channels) |
| **Graph** | Single linear flow | Multi-graph: router → subgraphs |
| **Agents** | Monolithic `agentCoreNode` | DynamicAgentNode per agent type |
| **Pipeline** | Not described | LLM-extracted from agent `.md` files |
| **Phase order** | Not described | Dynamic from `PipelineDefinition` (LLM) |
| **Inter-agent relations** | Not described | `AgentRelation[]` extracted by LLM |
| **Verify/gate nodes** | Hardcoded | Auto-generated from pipeline definition |
| **Tools** | 2 MCP tools | Dynamic MCP + VS Code native tools |
| **Hooks** | No explicit hook system | Full hook lifecycle engine |
| **Quality** | Basic gate with retry count | VerifyNode + ApprovalNode + criteria |
| **LLM** | Ollama only | 4 provider families (140+ models) |
| **Routing** | Simple conditional edges | 15+ routing functions + intent classifier |
| **Persistence** | MemorySaver only | Filesystem checkpointing |
