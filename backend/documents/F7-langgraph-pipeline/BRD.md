# Business Requirements Document (BRD)

## SA4E — F7: LangGraph SDLC Pipeline

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F7 |
| Title | LangGraph SDLC Pipeline |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-01-27 |
| Status | Draft |
| Pattern | AI Agent System + Plugin (VS Code Extension) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-01-27 | BA Agent | Initial document — F7 LangGraph SDLC Pipeline |

---

## 1. Introduction

### 1.1 Scope

Implement a multi-graph state machine architecture for orchestrating the complete SDLC workflow within the VS Code extension. The system uses LangGraph (from LangChain) to model each workflow type as a directed graph with typed state, conditional edges, and checkpointing. Multiple graph types handle different workflow intents: full SDLC pipeline, hotfix fast-track, code review, documentation generation, security audit, and free-form chat.

### 1.2 Out of Scope

- External CI/CD integration (covered by DevOps tooling)
- Custom graph definition by end-users (predefined graphs only)
- Multi-workspace pipeline coordination
- Real-time collaborative editing of graph state

### 1.3 Preliminary Requirements

- LangGraph library (`@langchain/langgraph`) installed
- MCP server infrastructure operational (for tool calling)
- LLM provider configured (Anthropic/OpenAI/local)
- VS Code extension activation context available

---

## 2. Business Requirements

### 2.1 High Level Process Map

The LangGraph SDLC Pipeline provides intelligent workflow orchestration for software development. Users interact via chat or ticket commands. The system classifies intent, routes to the appropriate graph, executes nodes sequentially with quality verification, and pauses for user approval at defined gates.

**End-to-End Flow:**

1. User provides input (ticket key, chat message, or command)
2. Router Graph classifies intent and selects subgraph
3. Subgraph executes: node → verify → quality gate → next node
4. At each quality gate, execution pauses for user approval
5. User approves → pipeline advances; rejects → pipeline ends; revises → node re-executes
6. Checkpointer persists state at each node transition
7. Pipeline can be resumed from any checkpoint across sessions

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories

| # | Story / Use Case | Priority | Category |
|---|-----------------|----------|----------|
| 1 | Full SDLC Pipeline Execution | MUST HAVE | Core |
| 2 | Intent Classification and Graph Routing | MUST HAVE | Core |
| 3 | Checkpointing and Resume | MUST HAVE | Core |
| 4 | Quality Gate Approval Flow | MUST HAVE | Core |
| 5 | BA-SA Feedback Loop | MUST HAVE | Core |
| 6 | Self-Correction with Verify Nodes | MUST HAVE | Core |
| 7 | Strategy Switch on Verify Failure | SHOULD HAVE | Resilience |
| 8 | Hotfix Fast-Track Pipeline | SHOULD HAVE | Workflow |
| 9 | Code Review Pipeline | SHOULD HAVE | Workflow |
| 10 | Documentation Generation Pipeline | SHOULD HAVE | Workflow |
| 11 | Security Audit Pipeline | SHOULD HAVE | Workflow |
| 12 | Free-form Chat with ReAct Agent | MUST HAVE | Core |
| 13 | Streaming Token Output | MUST HAVE | UX |
| 14 | Pipeline Visualization | COULD HAVE | UX |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** User enters a command or message in the chat panel (e.g., "KSA-123" or "fix bug in auth module")

**Step 2:** LangGraphEngine receives the input, creates initial state with thread ID

**Step 3:** Router Graph classify_intent node determines intent via regex patterns (fast path) or LLM fallback

**Step 4:** Router delegates to the appropriate subgraph (sdlc, hotfix, code_review, docs, security_audit, chat)

**Step 5:** Subgraph executes nodes in sequence. Each agent node (BA, SA, DEV, QA, DevOps) invokes tools via MCP Bridge

**Step 6:** After each agent node, a Verify Node validates output quality against configurable criteria

**Step 7:** If verify passes, advance to quality gate. If fails, retry agent (max 2 attempts) or switch strategy

**Step 8:** Quality Gate pauses pipeline, presents criteria to user. User approves/rejects/revises

**Step 9:** Pipeline advances to next phase or terminates based on user decision

**Step 10:** State is checkpointed at every node transition for resume capability

---

#### STORY 1: Full SDLC Pipeline Execution

> As a developer, I want the system to orchestrate the full SDLC workflow (requirements, specification, design, test planning, implementation, user guide, testing, deployment) so that all phases are automated with quality verification.

**Requirement Details:**

1. SDLC graph defines nodes for each phase: sm, ba_brd, verify_ba_brd, quality_gate_requirements, ba_fsd, verify_ba_fsd, ta_enrich, security_review_fsd, quality_gate_specification, sa_tdd, verify_sa_tdd, feedback_check, ba_fix_fsd, sa_review, security_review_tdd, quality_gate_design, qa_plan, verify_qa_plan, quality_gate_test_planning, dev_code, verify_dev_code, security_review_code, quality_gate_implementation, dev_ug, verify_dev_ug, ba_review_ug, qa_verify_ug, ug_join, quality_gate_user_guide, qa_test, quality_gate_testing, devops_deploy, quality_gate_deployment
2. SM (Scrum Master) node routes to the correct phase node based on currentPhase state
3. Each phase produces documents (BRD, FSD, TDD, STP, STC, UG, DPG, RLN) or code
4. All documents are written to workspace filesystem via MCP tools
5. Pipeline supports starting from any phase (resume capability)

**Acceptance Criteria:**

1. Pipeline executes all 8 SDLC phases in correct order
2. Each phase node invokes the appropriate sub-agent (BA, TA, SA, QA, DEV, DevOps)
3. Pipeline pauses at each quality gate for user approval
4. Pipeline can be started at any phase by setting currentPhase in initial state
5. All node transitions are checkpointed

---

#### STORY 2: Intent Classification and Graph Routing

> As a user, I want the system to automatically detect my intent from natural language input so that it routes to the correct workflow without manual selection.

**Requirement Details:**

1. Two-tier classification: fast regex patterns then LLM fallback for ambiguous inputs
2. Six intent categories: sdlc, hotfix, code_review, docs, security_audit, chat
3. Regex rules have confidence scores (0.0-1.0), threshold at 0.7 for fast-path acceptance
4. LLM classification used when regex confidence is below threshold
5. Subgraphs are lazy-loaded (imported only when first needed) for zero startup impact

**Acceptance Criteria:**

1. Ticket key patterns (e.g., "KSA-123") classify as sdlc with confidence >= 0.95
2. "fix bug" / "hotfix" keywords classify as hotfix with confidence >= 0.9
3. Ambiguous inputs fall through to LLM classification
4. Classification completes in < 100ms for regex path
5. Subgraph loading adds zero overhead until intent is determined

---

#### STORY 3: Checkpointing and Resume

> As a developer, I want pipeline execution to persist state to disk so that I can resume interrupted pipelines across VS Code sessions.

**Requirement Details:**

1. WorkspaceCheckpointer extends LangGraph BaseCheckpointSaver
2. State persisted as JSON files in .vscode/kiro-pipeline-state/{threadId}.json
3. Atomic writes using tmp file + rename pattern for crash safety
4. Checkpoint includes full pipeline state, graph checkpoint, and metadata
5. Automatic cleanup of pipelines older than configurable max age
6. listPersistedPipelines() returns all saved pipelines for resume prompt

**Acceptance Criteria:**

1. Pipeline state survives VS Code restart
2. Resume produces identical behavior to uninterrupted execution
3. Corrupt checkpoint files are handled gracefully (no crash)
4. Old checkpoints are cleaned up automatically (default: 7 days)
5. Multiple pipelines can be persisted simultaneously

---

#### STORY 4: Quality Gate Approval Flow

> As a team lead, I want the pipeline to pause at quality gates and present verification criteria so that I can approve, reject, or request revisions before advancing.

**Requirement Details:**

1. ApprovalNode is parameterized per phase with specific criteria from shared-quality-gates.md
2. Quality gate emits QualityGateCheckpoint with criteria list and summary
3. Pipeline status changes to paused and approvalRequired = true
4. User responds with approve, reject, or revise
5. On approve SM node advances to next phase
6. On reject pipeline ends
7. On revise pipeline routes back to the agent node for that phase

**Acceptance Criteria:**

1. Each SDLC phase has its own quality gate with phase-specific criteria
2. Pipeline halts execution until user provides approval decision
3. Approval decision updates state and resumes execution correctly
4. Quality gate criteria match the shared-quality-gates.md definitions
5. Multiple pending approvals are tracked in pendingApprovals array

---

#### STORY 5: BA-SA Feedback Loop

> As a solution architect, I want the system to automatically detect discrepancies between FSD and TDD and trigger a feedback loop so that documents stay consistent.

**Requirement Details:**

1. FeedbackNode checks discrepancyFound state flag after SA produces TDD
2. If discrepancy found, route to ba_fix_fsd node
3. BA fixes FSD, then sa_review re-evaluates, then feedback_check node again
4. Loop continues until no discrepancy or max iterations (5) reached
5. At max iterations, pipeline pauses and escalates to user

**Acceptance Criteria:**

1. Feedback loop detects discrepancies between FSD and TDD
2. BA node correctly fixes FSD based on discrepancy report
3. SA node re-validates consistency after BA fix
4. Loop terminates after max 5 iterations
5. Iteration count is tracked in state (feedbackIterations)
6. User is notified when max iterations reached

---

#### STORY 6: Self-Correction with Verify Nodes

> As a quality engineer, I want each agent output to be automatically verified against quality criteria so that low-quality outputs are caught and corrected.

**Requirement Details:**

1. VerifyNode placed after every agent node in the SDLC graph
2. Loads verification criteria from config/verify-criteria.ts for the current phase
3. Uses LLM to evaluate agent output against criteria (pass/fail + feedback)
4. If pass, advance to next node
5. If fail, retry the agent node (max 2 attempts from maxVerifyAttempts)
6. If still fails after max attempts, route to strategy_switch
7. Fail-open policy: if VerifyNode itself errors, treat as pass (BR-12)

**Acceptance Criteria:**

1. Every agent node has a corresponding verify node
2. Verify criteria are loaded from configuration (not hardcoded in node)
3. Failed verification routes back to agent for retry
4. Max retry attempts prevents infinite loops
5. VerifyNode errors do not block pipeline (fail-open)
6. Verification feedback is passed to agent on retry (state.verifyFeedback)

---

#### STORY 7: Strategy Switch on Verify Failure

> As a system, I want to automatically try an alternate strategy when the primary approach fails verification so that pipeline resilience is maximized.

**Requirement Details:**

1. When an agent fails verification after max attempts, strategy_switch node activates
2. Checks if an alternate strategy is configured for that node in config/alternate-strategies.ts
3. If alternate exists and not yet tried, switch strategy, reset verify attempts, re-route to agent
4. If alternate also fails or not configured, emit human_intervention_required event, pause pipeline
5. Strategy history tracked in strategyHistory array

**Acceptance Criteria:**

1. Strategy switch triggers only after max verify attempts exhausted
2. Alternate strategy is correctly applied to the agent node
3. Verify attempts reset when switching strategies
4. Pipeline pauses if all strategies exhausted
5. Strategy history captures all switches with timestamps and reasons

---

#### STORY 8: Hotfix Fast-Track Pipeline

> As a developer, I want an abbreviated pipeline for urgent bug fixes so that hotfixes can be deployed without full SDLC ceremony.

**Requirement Details:**

1. Hotfix graph: start -> analyze_bug -> dev_fix -> qa_verify -> [pass?] -> deploy_hotfix -> end
2. analyze_bug uses LLM to identify root cause, affected components, and fix approach
3. Dev-QA loop: max 3 attempts before escalation
4. On QA pass, deploy directly (no documentation phases)
5. On QA fail after max attempts, pipeline ends (escalate)

**Acceptance Criteria:**

1. Hotfix pipeline completes in significantly fewer steps than full SDLC
2. Bug analysis provides actionable root cause hypothesis
3. Fix-verify loop works correctly with attempt tracking
4. Successful fix is deployed without documentation phases
5. Max attempts prevent infinite fix loops

---

#### STORY 9: Code Review Pipeline

> As a developer, I want automated code review with security scanning so that PR quality is assessed before merge.

**Requirement Details:**

1. Code Review graph: start -> fetch_context -> security_scan -> quality_review -> report -> end
2. Fetches PR/diff context via MCP tools
3. SecurityNode scans for vulnerabilities
4. QaNode assesses code quality
5. Report node consolidates findings using LLM

**Acceptance Criteria:**

1. Review pipeline fetches code context from workspace
2. Security scan identifies common vulnerability patterns
3. Quality review assesses code style, complexity, test coverage
4. Consolidated report is generated in markdown format
5. Pipeline completes without requiring user approval gates

---

#### STORY 10: Documentation Generation Pipeline

> As a team, I want a dedicated pipeline for generating specific document types so that documentation can be produced independently of the full SDLC.

**Requirement Details:**

1. Docs graph: start -> detect_doc_type -> [BA|DEV|DevOps] -> qa_verify_docs -> end
2. Auto-detects document type from user request (BRD/FSD -> BA, UG -> DEV, DPG/RLN -> DevOps)
3. Routes to appropriate agent node
4. QA verifies generated documentation

**Acceptance Criteria:**

1. Document type detection correctly classifies BA/DEV/DevOps documents
2. Correct agent is invoked for each document type
3. QA verification is applied to all generated documents
4. Pipeline works standalone (no SDLC context required)

---

#### STORY 11: Security Audit Pipeline

> As a security engineer, I want a comprehensive security audit pipeline so that vulnerabilities across dependencies, code, and configuration are systematically identified.

**Requirement Details:**

1. Security Audit graph: start -> scan_dependencies -> scan_code_patterns -> scan_config -> generate_report -> end
2. Three scan phases: dependency vulnerabilities, code patterns, configuration
3. LLM generates consolidated Security Assessment Report with OWASP categorization
4. Findings categorized by severity (Critical, High, Medium, Low)

**Acceptance Criteria:**

1. Dependency scan identifies known CVEs
2. Code pattern scan identifies security anti-patterns
3. Configuration scan checks for misconfigurations
4. Report includes severity-categorized findings with remediation recommendations
5. Pipeline executes sequentially (each scan feeds into next)

---

#### STORY 12: Free-form Chat with ReAct Agent

> As a developer, I want to have natural conversation with the AI assistant using a ReAct agent loop so that it can use workspace tools to answer my questions.

**Requirement Details:**

1. Chat graph: start -> fetch_tools -> agent_step -> [tool_use?] -> execute_tools -> agent_step (loop) -> verify_response -> end
2. ReAct pattern: agent decides whether to call tools or respond with text
3. Tool registry discovers available MCP tools at session start
4. Max 25 agent iterations (circuit breaker)
5. Steering rules injected into system prompt from .kiro/steering/ files
6. Optional hallucination grader for small models (Corrective RAG)
7. Context budget awareness: adapts message history to fit within model limits

**Acceptance Criteria:**

1. Chat agent can call workspace tools (read_file, list_directory, search_text)
2. Agent loop terminates within 25 iterations
3. Tool results are fed back to agent for next iteration
4. Steering rules are correctly loaded and injected
5. Response verification catches incomplete or off-topic answers
6. Hallucination grader activates for small context window models

---

#### STORY 13: Streaming Token Output

> As a user, I want to see tokens streaming in real-time as the agent generates output so that the experience feels responsive.

**Requirement Details:**

1. StreamHandler emits events: token, status, progress, complete, error, retry, verify, strategy_switch, human_intervention_required
2. Events sent to webview via onEvent callback
3. Each node reports its status (active, completed, failed) during execution
4. Stream events include currentStreamId for associating events with pipeline runs

**Acceptance Criteria:**

1. Tokens appear in chat UI as they are generated (no buffering)
2. Node status changes are reflected in real-time
3. Error and retry events are displayed to user
4. Multiple concurrent streams do not interfere with each other

---

#### STORY 14: Pipeline Visualization

> As a user, I want to see a visual graph of the pipeline showing node states so that I can understand where execution is and what has completed.

**Requirement Details:**

1. getCurrentNodeStates() returns array of PipelineGraphNode with id, label, status, phase
2. Node statuses: idle, active, completed, failed, skipped
3. Webview renders graph visualization based on node states
4. Updates in real-time as pipeline progresses

**Acceptance Criteria:**

1. All SDLC nodes are represented in visualization
2. Node status updates reflect actual execution state
3. Visualization updates without full page refresh
4. Failed/skipped nodes are visually distinct

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| @langchain/langgraph | Library | State machine graph framework |
| @langchain/core | Library | Core LangChain abstractions (RunnableConfig) |
| MCP Server Infrastructure | System | Tool calling bridge for agent nodes |
| LLM Provider | External | AI model for agent execution and verification |
| VS Code Extension API | Platform | Workspace filesystem, webview panels |
| Checkpointer Storage | Infrastructure | .vscode/kiro-pipeline-state/ directory |

---

## 4. Stakeholders

| Role | Responsibility |
|------|----------------|
| Developer | Uses pipeline for SDLC automation, chat interaction |
| Team Lead | Approves quality gates, reviews generated documents |
| QA Engineer | Uses test planning pipeline, reviews test coverage |
| DevOps | Uses deployment pipeline, reviews deployment guides |
| Product Owner | Approves business requirements documents |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| LLM unavailable during pipeline execution | High | Medium | Fail-open for verify nodes; queue and retry for agent nodes |
| Checkpoint corruption after crash | Medium | Low | Atomic write pattern (tmp + rename); graceful degradation |
| Infinite loops in feedback/verify cycles | High | Low | Max iteration limits (5 feedback, 2 verify, 25 chat) |
| MCP tool timeout during agent execution | Medium | Medium | 60s per-tool timeout; 300s per-node timeout; retry with backoff |
| Context window exceeded in chat agent | Medium | Medium | Context budget tracking; message history truncation (last 200) |

### 5.2 Assumptions

- LLM provider is configured and accessible during pipeline runs
- Workspace filesystem is writable for checkpoint persistence
- MCP server starts successfully with extension activation
- Users understand the approval flow (approve/reject/revise semantics)
- Network connectivity for LLM API calls is generally available

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Node execution timeout | 300s max per node; 60s per tool call |
| Performance | Chat agent iteration limit | Max 25 iterations per conversation turn |
| Performance | Intent classification latency | Less than 100ms for regex path; less than 3s for LLM path |
| Performance | Subgraph lazy loading | Zero activation impact for unused pipelines |
| Reliability | Checkpoint persistence | Atomic writes, crash-safe, survives VS Code restart |
| Reliability | Retry logic | Exponential backoff, max 2 retries per node |
| Reliability | Fail-open verification | VerifyNode errors do not block pipeline |
| Scalability | Concurrent pipelines | Multiple threads can be checkpointed simultaneously |
| Scalability | Chat history | Capped at 200 messages (sliding window) |
| Security | Prompt injection resistance | Steering rules sanitized before injection |
| Usability | Streaming feedback | Real-time token streaming to chat UI |
| Usability | Resume prompt | Lists all persisted pipelines on startup |

---

## 7. Appendix

### Glossary

| Term | Definition |
|------|------------|
| StateGraph | LangGraph construct defining nodes, edges, and state schema |
| Annotation | LangGraph typed state channel with optional reducer |
| Checkpoint | Serialized graph state at a point in execution |
| Quality Gate | Pause point requiring user approval to proceed |
| Verify Node | Post-agent node that validates output quality |
| Strategy Switch | Fallback mechanism when primary approach fails |
| ReAct | Agent pattern: Reason, Act, Observe, loop |
| MCP Bridge | Adapter between graph nodes and MCP tool servers |
| Intent Classification | NLP step routing user input to appropriate subgraph |

### Use Case Diagram

![Use Case](diagrams/use-case.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
