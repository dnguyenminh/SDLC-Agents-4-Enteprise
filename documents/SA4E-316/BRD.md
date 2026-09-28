# Business Requirements Document (BRD)

## Pi Extensions — SA4E-316: Register custom tools via Pi Extensions (bridge MCP wrapper tools)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-316 |
| Title | Register custom tools via Pi Extensions (bridge MCP wrapper tools) |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-24 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | To be assigned – SM | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-24 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-316 and linked tickets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

Register custom tools for Pi session via Pi Extensions system using `pi.registerTool`. Expose MCP wrapper tools of the project (Jira, KB/mem, code intelligence, drawio, docx export – running on port 9181) into Pi agent for direct invocation.

Pi has no built-in tools for Jira/KB. Custom tools are registered via extension file `export default (pi) => { pi.registerTool(...) }` . Extensions auto-discover from `<cwd>/.pi/extensions` and `~/.pi/agent/extensions`, or added via `additionalExtensionPaths` / `extensionFactories` of DefaultResourceLoader (SA4E-315).

### 1.2 Out of Scope

- Implementing new MCP wrapper services; only bridging existing services.
- Modifying Pi core SDK.
- Creating UI for tool management.
- To be confirmed with stakeholders for custom tool security policies beyond schema validation.

### 1.3 Preliminary Requirement

- MCP wrapper server running on port 9181 accessible.
- Pi SDK `@earendil-works/pi-coding-agent` available.
- Extension loading mechanism configured per SA4E-315.
- TypeBox/Zod validation library available for schema validation.

---

## 2. Business Requirements

### 2.1 High Level Process Map

Pi Agent starts → ResourceLoader loads extensions → Extensions register tools via `pi.registerTool` → Tools appear in `session.getActiveToolNames()` → Agent invokes tool → Extension proxy calls MCP wrapper at 9181 → Result returned to Pi agent.

![Use Case Diagram](diagrams/use-case.png)
*[Edit in draw.io](diagrams/use-case.drawio)*

![Business Flow](diagrams/business-flow.png)
*[Edit in draw.io](diagrams/business-flow.drawio)*

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a Pi Agent Developer, I want to register custom tools via Pi Extensions so that Pi agent can call MCP wrapper tools directly | MUST HAVE | SA4E-316 |
| 2 | As a Pi Agent User, I want registered tools to appear in session tool list so that I know which tools are available | MUST HAVE | SA4E-316 |
| 3 | As a Pi Agent Operator, I want tool invocation errors to be reported clearly so that failures are not swallowed | SHOULD HAVE | SA4E-316 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** Extension file exported as default function receives Pi ExtensionAPI instance.

**Step 2:** Extension calls `pi.registerTool({...})` for each required tool with name, label, description, parameters schema, execute handler.

**Step 3:** ResourceLoader discovers extensions from configured paths/factories and executes registration at session start.

**Step 4:** Tools become active; `session.getActiveToolNames()` returns registered names.

**Step 5:** Pi agent invokes tool with parameters → execute handler calls MCP wrapper (`callMcpWrapper`) via port 9181.

**Step 6:** Wrapper returns result or error → handler returns `{content:[{type:'text',text:JSON.stringify(res)}], details:{}}` or propagates error.

> **Note:** Schema validation must be performed via TypeBox/Zod before execution.

---

#### STORY 1: Register custom tools via Pi Extensions

> As a Pi Agent Developer, I want to register custom tools via Pi Extensions so that Pi agent can call MCP wrapper tools directly

**Requirement Details:**

1. Extension must register at minimum tools: `jira_*`, `mem_search`/`mem_ingest`, `code_search`, `execute_dynamic_tool` proxy.
2. Registration uses `export default function (pi: ExtensionAPI) { pi.registerTool({...}) }`.
3. Execute handler proxies to MCP wrapper at 9181 using `callMcpWrapper`.
4. Tool schemas validated using TypeBox/Zod.

**Data Fields (if applicable):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| name | string | Yes | Tool identifier | jira_get_issue |
| label | string | Yes | Human readable name | Jira Get Issue |
| description | string | Yes | Tool purpose | Fetch a Jira issue by key |
| parameters | object | Yes | TypeBox/Zod schema | {issue_key:string} |
| execute | function | Yes | Handler proxying to MCP | async (_id,params)=>... |

**Acceptance Criteria:**

1. Extension registers at least tools: jira_*, mem_search/mem_ingest, code_search, execute_dynamic_tool proxy
2. Tools appear in `session.getActiveToolNames()`
3. Agent can call tool and receive result from MCP wrapper 9181
4. Errors from wrapper are reported clearly (no exception swallowing)
5. Tool schemas validate with TypeBox/zod

**UI Specifications (if applicable):**

N/A – Extension registration is code-level.

**Validation Rules (if applicable):**

- Tool name must be unique within session.
- Parameters schema must validate before execution; invalid input returns error.
- Execute handler must return `content` array with type `text`.

**Error Handling (if applicable):**

- MCP wrapper unreachable: return error message with details, do not swallow.
- Invalid parameters: return validation error to Pi agent.
- Exception in handler: log and return structured error.

---

#### STORY 2: Tools visible in session

> As a Pi Agent User, I want registered tools to appear in session tool list so that I know which tools are available

**Requirement Details:**

1. After extension load, `session.getActiveToolNames()` includes registered tool names.
2. Tool metadata (label, description) accessible via Pi API.

**Acceptance Criteria:**

1. `session.getActiveToolNames()` returns all registered custom tools.
2. Tool list updates dynamically when extensions reload.

---

#### STORY 3: Clear error reporting

> As a Pi Agent Operator, I want tool invocation errors to be reported clearly so that failures are not swallowed

**Requirement Details:**

1. Execute handler must propagate errors from MCP wrapper.
2. Error messages must be human readable and contain cause.

**Acceptance Criteria:**

1. Errors from wrapper are returned to Pi agent without swallowing.
2. Error details include tool name and original error message.

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Extension loading mechanism | System | SA4E-315 | additionalExtensionPaths / extensionFactories of DefaultResourceLoader |
| MCP Wrapper Server | Infrastructure | N/A | Tools running on port 9181 |
| Pi SDK | External | N/A | `@earendil-works/pi-coding-agent` |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter | Duc Nguyen Minh | Requirement owner | Jira SA4E-316 |
| BA Agent | BA Agent | Document requirements | SA4E-316 |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Tool registration fails due to path misconfiguration | High | Medium | Validate extension discovery paths, log registration |
| Schema mismatch between Pi and MCP | Medium | Medium | Use shared TypeBox schemas, unit test validation |
| MCP wrapper unavailable | High | Low | Health check before registration, graceful error |
| Exceptions swallowed | Medium | Medium | Wrap execute with try/catch and explicit error return |

### 5.2 Assumptions

- MCP wrapper 9181 already implements all listed tools.
- Pi Extension API stable and supports `pi.registerTool`.
- Extensions can access network to call MCP wrapper.

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Tool invocation latency | Should be < 2s including MCP roundtrip |
| Security | Input validation | Schemas validated via TypeBox/Zod |
| Scalability | Tool count | Support registration of >50 tools per session |
| Availability | Extension load | Must load successfully on session start |

> No specific non-functional requirements identified beyond above.

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-316 | Register custom tools via Pi Extensions (bridge MCP wrapper tools) | In Progress | Task | Main ticket |
| SA4E-315 | Extension loading via additionalExtensionPaths / extensionFactories | N/A | Task | Relates to |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Pi Extension | Plugin loaded by Pi Coding Agent to register tools/commands |
| MCP Wrapper | Proxy server exposing tools on port 9181 |
| pi.registerTool | Pi SDK API to register a custom tool |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Pi SDK Docs | https://pi.dev/docs/latest/sdk |
| Example Extension | examples/sdk/06-extensions.ts |

## Diagram Index

| Diagram | File |
|---------|------|
| Use Case Diagram | diagrams/use-case.drawio / diagrams/use-case.png |
| Business Flow / Swimlane | diagrams/business-flow.drawio / diagrams/business-flow.png |
