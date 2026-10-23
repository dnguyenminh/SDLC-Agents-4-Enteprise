# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-370: Custom Agents — real file-defined agent personas wired into the chat engine (identity, role scoping, per-tab sessions)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-370 |
| Title | Custom Agents — real file-defined agent personas wired into the chat engine (identity, role scoping, per-tab sessions) |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-370.docx |
| Related FSD | documents/SA4E-370/FSD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | QA Agent | Initiate document — auto-generated from FSD use cases, business rules, and SECURITY-ASSESSMENT |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-009 | 9 | High |
| Functional — Alternative Flows | TC-100 to TC-104 | 5 | High |
| Functional — Exception/Error Flows | TC-200 to TC-205 | 6 | High |
| Business Rule Validation | TC-300 to TC-319 | 20 | High |
| Boundary & Negative Testing | TC-400 to TC-409 | 10 | Medium |
| UI/UX Testing | TC-500 to TC-504 | 5 | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-604 | 5 | Medium |
| Integration Testing | TC-700 to TC-702 | 3 | High |
| Regression Testing | TC-800 to TC-804 | 5 | Medium |
| **Total** | **TC-001 to TC-804** | **68** | |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Parse v2 agent file with all fields (TC-S1-01)

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-01, FR-02; UC-1; BR-S1-01, BR-S1-02 |
| **Preconditions** | Extension running; test workspace has `.code-intel/agents/qa-agent.md` with v2 frontmatter (name, description, role, phase, model) + persona body |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Extension starts / watcher triggers discovery of `.code-intel/agents/` | Directory read successfully |
| 2 | Parser reads `qa-agent.md` and parses YAML frontmatter + body | AgentInfo v2 returned: id="qa-agent", name, description, role, phase, model, personaBody populated |
| 3 | `chat:agentsLoaded` emitted to webview | Webview receives agent list with v2 fields |
| 4 | Agent appears in slash menu | Slash menu shows "QA Agent" with description |

**Test Data:** `.code-intel/agents/qa-agent.md` with frontmatter `{name: "QA Agent", description: "Quality engineering agent", role: "qa-agent", phase: "testing", model: "gpt-4o-mini"}` and body `"You are the QA agent..."`

**Postconditions:** Agent `qa-agent` available in agent list for selection.

---

### TC-002: Parse v1 agent file (backward compatibility) (TC-S1-02)

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-03; UC-1; BR-S1-01, BR-S1-02 |
| **Preconditions** | Test workspace has `.code-intel/agents/legacy-agent.md` with v1 format (name + description only) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser reads `legacy-agent.md` | File loaded without error |
| 2 | Parser constructs AgentInfo v2 | role=undefined, phase=undefined, model=undefined, personaBody=body content, name=filename fallback |
| 3 | `chat:agentsLoaded` includes legacy agent | Legacy agent appears in agent list |
| 4 | Legacy agent selectable | Selection succeeds with default role fallback |

**Test Data:** `.code-intel/agents/legacy-agent.md` with frontmatter `{name: "Legacy Agent", description: "Old agent"}` and body `"You are a legacy agent."`

**Postconditions:** v1 agent file loads successfully with safe defaults.

---

### TC-003: Hot-reload updates agent list (TC-S1-04)

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-04; UC-1; BR-S1-03 |
| **Preconditions** | Extension running; agent `qa-agent.md` exists; file watcher active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Modify `qa-agent.md` (e.g., change description) while extension running | File watcher detects change |
| 2 | Watcher triggers re-parse of agent files | `chat:agentsLoaded` re-emitted within 2s |
| 3 | Webview slash menu updates | Updated description reflected in menu |
| 4 | Extended fields (role, phase, model) propagate | New field values present in re-emitted AgentInfo |

**Test Data:** Edit `qa-agent.md` description from "Quality engineering agent" to "Updated QA agent".

**Postconditions:** Agent list on webview reflects updated file within 2s (NFR: hot-reload < 2s).

---

### TC-004: Select agent wires persona + role (TC-S2-01)

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-05, FR-06, FR-07, FR-08; UC-2, UC-3 |
| **Preconditions** | Agent `qa-agent` in agent list; tab-1 open with session |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User selects `qa-agent` in slash menu for tab-1 | Webview sends `chat:selectAgent {tabId: "tab-1", agentId: "qa-agent"}` |
| 2 | Adapter loads and parses agent file | AgentInfo v2 obtained |
| 3 | PersonaBody injected into session context via governance layers | Persona present in session context (passed budget gate, auto-chunk, TurnBudgetGuard, context pipeline) |
| 4 | SessionHostOptions.role/phase set from agent definition | role="qa-agent", phase="testing" (not hardcoded 'sm-agent') |
| 5 | Role-scoped loadout/skills/steering applied | buildSessionToolLoadout, applyScopedSkills, scopedSteering reflect qa-agent role |
| 6 | `chat:agentSwitched` emitted with success=true | Badge updates to "QA Agent"; indicator shows success |
| 7 | Next turn in tab-1 runs with persona + role-scoped engine | Engine uses persona as system prompt; tools scoped to role |

**Test Data:** tabId="tab-1", agentId="qa-agent", personaBody="You are the QA agent..."

**Postconditions:** tab-1 session wired with qa-agent persona + role; subsequent turns use persona + role-scoped engine.

---

### TC-005: Two tabs = two sessions (TC-S3-01)

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-09, FR-10; UC-3; BR-S3-01, BR-S3-02 |
| **Preconditions** | Extension running; two tabs open (tab-1, tab-2) in same workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open Tab A (tab-1) and Tab B (tab-2) | Registry creates 2 sessions keyed workspaceRoot+tab-1 and workspaceRoot+tab-2 |
| 2 | Send prompt in Tab A | Turn runs on Tab A's session only |
| 3 | Send prompt in Tab B | Turn runs on Tab B's session only |
| 4 | Check token accounting per tab | tabTokenUsage independent per tab (no shared counter) |
| 5 | Check compaction per tab | context-compaction uses actual tabId, not "default" |

**Test Data:** tab-1, tab-2; workspaceRoot="/test-workspace"

**Postconditions:** Two independent sessions; history and token accounting isolated per tab.

---

### TC-006: Badge shows correct agent per tab (TC-S4-01)

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-11; UC-4; BR-S4-01 |
| **Preconditions** | Tab-1 wired to qa-agent; Tab-2 wired to dev-agent |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View Tab A | Badge shows "QA Agent" |
| 2 | View Tab B | Badge shows "Dev Agent" |
| 3 | Switch Tab A to dev-agent | Tab A badge updates to "Dev Agent" after AGENT_SWITCHED success |

**Test Data:** Tab A agentId="qa-agent", Tab B agentId="dev-agent"

**Postconditions:** Badge reflects active agent per tab; distinct agents on different tabs.

---

### TC-007: AGENT_SWITCHED only after wiring (TC-S2-03)

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-11; UC-2; BR-S2-01 |
| **Preconditions** | Agent selected for tab; wiring in progress |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Initiate agent switch | Switch indicator shows "switching" (spinner) |
| 2 | Wiring completes (persona + role/phase + loadout applied) | `chat:agentSwitched` emitted with success=true |
| 3 | Indicator updates | Success checkmark shown; badge updated |
| 4 | Verify no AGENT_SWITCHED before step 2 | No premature success message |

**Test Data:** tabId="tab-1", agentId="qa-agent"

**Postconditions:** Truthful wiring state; AGENT_SWITCHED only after successful wiring.

---

### TC-008: Cosmetic prefix retired (TC-S2-04)

| Field | Value |
|-------|-------|
| **ID** | TC-008 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-05, FR-06; BR-S2-02 |
| **Preconditions** | Agent wired to tab; user sends prompt |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | User sends prompt in tab with active agent | Prompt sent to engine |
| 2 | Inspect prompt sent to LLM engine | No `[Agent: X]` prefix; persona injected as system prompt instead |
| 3 | Verify persona used as system prompt | Engine context includes personaBody as system prompt content |

**Test Data:** Prompt="What is 2+2?"; agentId="qa-agent"

**Postconditions:** Cosmetic prefix mechanism retired; persona drives the turn.

---

### TC-009: Fail-open on role scoping error (TC-S2-05)

| Field | Value |
|-------|-------|
| **ID** | TC-009 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-08; BR-07; UC-3 |
| **Preconditions** | Agent with role causing loadout error; tab session exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agent whose role triggers buildSessionToolLoadout error | Error caught by fail-open logic |
| 2 | System falls back to base loadout | Base loadout used; turn continues |
| 3 | Warning logged | Warning message logged for maintainer |
| 4 | Turn succeeds | No crash; response returned to tab |

**Test Data:** agentId with invalid role configuration

**Postconditions:** Fail-open behavior; turn continues with base loadout, no crash.

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: Invalid role falls back to default (TC-S1-05, AF-3)

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | FR-02; AF-3; F03 (role validation) |
| **Preconditions** | Agent file with role="unknown-role" not in SA4E-355 matrix |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser reads agent with invalid role | role set to undefined |
| 2 | Warning logged | Warning message logged |
| 3 | Wiring uses default role | Default role applied; no crash |

**Test Data:** agent `.md` with frontmatter `{role: "unknown-role"}`

**Postconditions:** Agent loads with default role fallback; warning logged.

---

### TC-101: Invalid model falls back to default (TC-S1-06, AF-4)

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | FR-02, FR-13; AF-4; F03; BR-03 |
| **Preconditions** | Agent file with model="unsupported-model" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser reads agent with invalid model | model set to undefined |
| 2 | Warning logged | Warning message logged |
| 3 | Wiring uses default model | Default model applied; override ignored |

**Test Data:** agent `.md` with frontmatter `{model: "unsupported-model"}`

**Postconditions:** Agent loads with default model; warning logged.

---

### TC-102: Budget gate rejects large persona (TC-S2-02, AF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | FR-06; BR-01, BR-02; F05 |
| **Preconditions** | Agent with oversized personaBody exceeding budget gate |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agent with oversized persona | `runSessionBudgetGate` evaluates persona injection |
| 2 | Budget gate rejects | REJECT with PI_CONTEXT_BUDGET_EXCEEDED |
| 3 | `chat:agentSwitched` emitted with success=false | Error message: "Agent persona too large for context budget" |
| 4 | Current agent retained | Previous agent stays active; badge unchanged |

**Test Data:** personaBody > budget limit (e.g., 50KB+ persona)

**Postconditions:** Budget gate enforced; current agent retained; error reported.

---

### TC-103: Compaction uses tabId not "default" (TC-S3-02)

| Field | Value |
|-------|-------|
| **ID** | TC-103 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | FR-10; BR-S3-02 |
| **Preconditions** | Tab with active session; context filling up |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fill context in tab A until compaction threshold | context-compaction triggered |
| 2 | Inspect compaction key | Uses tabId="tab-A", not "default" |
| 3 | Verify tab B compaction independent | tab B uses its own tabId for compaction |

**Test Data:** tabId="tab-A", tabId="tab-B"

**Postconditions:** Per-tab compaction using real tabId; no "default" hardcode.

---

### TC-104: Switch indicator truthfulness (TC-S4-02)

| Field | Value |
|-------|-------|
| **ID** | TC-104 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | FR-11; BR-S4-02 |
| **Preconditions** | Agent switch initiated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start agent switch | Indicator: idle → switching |
| 2 | During wiring (steps 4-10 of selectAgent) | Indicator stays "switching" (spinner visible) |
| 3 | On success=true | Indicator: switching → success (checkmark) |
| 4 | On failure | Indicator: switching → error; badge unchanged |

**Test Data:** tabId="tab-1", agentId="qa-agent"

**Postconditions:** Indicator accurately reflects wiring state; no false success before wiring complete.

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: Invalid YAML frontmatter (TC-S1-03, AF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FR-02; AF-1; F06 (YAML safety); BR-04 |
| **Preconditions** | Agent file with broken YAML frontmatter |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser reads agent with invalid YAML frontmatter | YAML parse fails |
| 2 | File skipped | File excluded from agent list |
| 3 | Diagnostic logged | Error logged with filePath |
| 4 | Other agents loaded | Discovery continues; no crash |

**Test Data:** `.md` file with broken YAML (e.g., unclosed quotes, invalid indentation)

**Postconditions:** Invalid file skipped; other agents unaffected; no crash.

---

### TC-201: Agent file not found / read error (TC-S2-01, AF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FR-05; AF-1; F02 |
| **Preconditions** | agentId references non-existent file |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agentId for missing file | File read fails |
| 2 | Current agent retained | Previous agent stays active |
| 3 | `chat:agentSwitched` emitted with success=false | Error message: "Failed to load agent: file not found" |
| 4 | Badge unchanged | Badge shows previous agent |

**Test Data:** agentId="non-existent-agent"

**Postconditions:** Graceful failure; current agent retained; error reported.

---

### TC-202: Session for tabId does not exist (TC-S2-01, EF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FR-09; EF-1 |
| **Preconditions** | tabId with no existing session |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agent for tab with no session | Registry creates new session |
| 2 | Session created with agent's role/phase | Session initialized with workspaceRoot+tabId key |
| 3 | Wiring continues normally | Persona injected, loadout applied |

**Test Data:** tabId="new-tab", agentId="qa-agent"

**Postconditions:** New session created for tab; wiring proceeds.

---

### TC-203: Tab close disposes session (TC-S3-03, AF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FR-09; BR-S3-03; F01 |
| **Preconditions** | Tab B open with active session; Tab A open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Close Tab B | Registry disposes session for workspaceRoot+tab-B |
| 2 | Session removed from registry | getOrCreateSession returns undefined / creates new on next access |
| 3 | Token accounting cleaned up | No memory leak for tab B |
| 4 | Tab A unaffected | Tab A session continues normally |

**Test Data:** tabId="tab-B" closed; tabId="tab-A" remains

**Postconditions:** Tab B session disposed cleanly; Tab A unaffected.

---

### TC-204: No leak between tabs (TC-S3-04)

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FR-09, FR-10; BR-05; F01 |
| **Preconditions** | Tab A and Tab B with independent sessions |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A uses 50k tokens; Tab B uses 10k tokens | Accounting independent |
| 2 | Check Tab B budget gate | Tab B's gate based on its own 10k usage |
| 3 | Check Tab A history | Tab A history not visible in Tab B |
| 4 | Switch between tabs | No history cross-contamination |

**Test Data:** tabId="tab-A" (50k tokens), tabId="tab-B" (10k tokens)

**Postconditions:** Zero history/token leak between tabs.

---

### TC-205: History tagged with agent (TC-S4-03)

| Field | Value |
|-------|-------|
| **ID** | TC-205 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | FR-12; BR-S4-03 |
| **Preconditions** | Turn executed in tab with wired agent |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send prompt in tab with qa-agent | Turn executed |
| 2 | Inspect history entry | agentId="qa-agent", agentRole="qa-agent" present |
| 3 | Switch to dev-agent; send another prompt | New entry tagged agentId="dev-agent" |

**Test Data:** tabId="tab-1", agentId sequence: qa-agent → dev-agent

**Postconditions:** Each history entry tagged with driving agent identity.

---

## 4. Business Rule Validation

### TC-300: BR-01 Persona injection through governance layers

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-01; FR-06 |
| **Preconditions** | Agent wired to tab; personaBody present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inject personaBody into session context | Passes through all 4 layers in sequence |
| 2 | Layer 1: Static budget gate `runSessionBudgetGate` | Evaluated; REJECT if PI_CONTEXT_BUDGET_EXCEEDED |
| 3 | Layer 2: Auto-chunk (`turn-executor.ts`) | Applied if needed |
| 4 | Layer 3: TurnBudgetGuard | Check passed |
| 5 | Layer 4: Context pipeline 8-stage | Applied |

**Test Data:** personaBody="You are the QA agent..."

**Postconditions:** Persona injection passes through all governance layers; no bypass.

---

### TC-301: BR-02 Persona token cost in budget gate

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-02; FR-06 |
| **Preconditions** | Agent with personaBody exceeding token budget |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agent with oversized persona | Budget gate evaluates persona token cost |
| 2 | Persona cost counted in static budget gate | Token cost included in calculation |
| 3 | Budget exceeded → REJECT | PI_CONTEXT_BUDGET_EXCEEDED returned |
| 4 | No silent governance lowering | Current agent retained; error reported |

**Test Data:** personaBody sized to exceed budget

**Postconditions:** Persona token cost enforced; no silent bypass.

---

### TC-302: BR-03 Model override invalid → fallback

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-03; FR-02, FR-13 |
| **Preconditions** | Agent with model="unsupported-model" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser reads agent with invalid model | model set to undefined |
| 2 | Warning logged | Warning message logged |
| 3 | Wiring uses default model | Default model applied |
| 4 | No crash | Agent loads successfully |

**Test Data:** agent `.md` with frontmatter `{model: "unsupported-model"}`

**Postconditions:** Invalid model fallback works; warning logged.

---

### TC-303: BR-04 Parser fail-safe

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-04; FR-02 |
| **Preconditions** | Invalid agent file |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser encounters invalid file | File skipped |
| 2 | Diagnostic logged | Error logged; no crash |
| 3 | Agent discovery continues | Other agents loaded |
| 4 | Extension does not crash | Extension stable |

**Test Data:** Multiple agent files, one invalid

**Postconditions:** Fail-safe parsing; no crash; other agents unaffected.

---

### TC-304: BR-05 No leak between tabs

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-05; FR-09, FR-10; F01 |
| **Preconditions** | Two tabs with independent sessions |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A sends prompts; Tab B sends prompts | Independent sessions |
| 2 | Verify token accounting separate | No shared counter |
| 3 | Verify history separate | No cross-tab history visibility |
| 4 | Close Tab A | Tab B unaffected |

**Test Data:** tabId="tab-A", tabId="tab-B"

**Postconditions:** Zero leak between tabs (history + token accounting).

---

### TC-305: BR-06 Core tools never dropped

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-06; FR-08 |
| **Preconditions** | Role-scoped loadout applied |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Apply role-scoped tool loadout | buildSessionToolLoadout executed |
| 2 | Verify core tools present | Base allowlist tools (loadout.ts:29) never dropped |
| 3 | Verify budget gate can count | Core tools present for budget counting |

**Test Data:** role="qa-agent"

**Postconditions:** Core tools never dropped by role filter.

---

### TC-306: BR-07 Fail-open role scoping error

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-07; FR-08; F08 |
| **Preconditions** | Agent role causing loadout error |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | buildSessionToolLoadout throws | Error caught |
| 2 | Fallback to base loadout | Base loadout used |
| 3 | Warning logged | Warning for maintainer |
| 4 | Turn continues | No crash; response returned |

**Test Data:** agent with role causing loadout error

**Postconditions:** Fail-open; turn continues with base loadout.

---

### TC-307: BR-S1-01 Agent id unique

| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-S1-01; FR-01 |
| **Preconditions** | Multiple agent files in workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser assigns id = filename without extension | id derived from filename |
| 2 | Check uniqueness across files | No duplicate ids |
| 3 | Duplicate id detected | Second file with same id skipped or logged |

**Test Data:** agent files with distinct filenames

**Postconditions:** Agent ids unique within workspace.

---

### TC-308: BR-S1-02 personaBody = body content

| Field | Value |
|-------|-------|
| **ID** | TC-308 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-S1-02; FR-01 |
| **Preconditions** | Agent file with frontmatter + body |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser extracts body after frontmatter | personaBody = full markdown body |
| 2 | personaBody used as system prompt | Injected as system prompt content |

**Test Data:** agent `.md` with body "You are the QA agent..."

**Postconditions:** personaBody correctly set to markdown body content.

---

### TC-309: BR-S1-03 Hot-reload propagates extended fields

| Field | Value |
|-------|-------|
| **ID** | TC-309 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-S1-03; FR-04 |
| **Preconditions** | Agent file modified with new extended fields |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Modify agent file (add role, phase, model) | Watcher detects change |
| 2 | `chat:agentsLoaded` re-emitted | Updated AgentInfo with new fields |
| 3 | Extended fields present | role, phase, model, personaBody all updated |

**Test Data:** agent file with updated extended fields

**Postconditions:** Hot-reload propagates all extended fields.

---

### TC-310: BR-S2-01 AGENT_SWITCHED only after wiring

| Field | Value |
|-------|-------|
| **ID** | TC-310 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-S2-01; FR-11 |
| **Preconditions** | Agent switch in progress |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Initiate agent switch | Wiring steps 4-10 execute |
| 2 | Verify no AGENT_SWITCHED during wiring | Message not emitted before completion |
| 3 | Wiring completes | AGENT_SWITCHED emitted with success=true |
| 4 | On failure | AGENT_SWITCHED emitted with success=false |

**Test Data:** tabId="tab-1", agentId="qa-agent"

**Postconditions:** AGENT_SWITCHED only emitted after wiring complete.

---

### TC-311: BR-S2-02 Cosmetic prefix retired

| Field | Value |
|-------|-------|
| **ID** | TC-311 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-S2-02; FR-05, FR-06 |
| **Preconditions** | Agent wired; prompt sent |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send prompt in tab with active agent | Prompt to engine |
| 2 | Inspect prompt | No `[Agent: X]` prefix |
| 3 | Verify persona as system prompt | Persona drives the turn |

**Test Data:** Prompt="test"; agentId="qa-agent"

**Postconditions:** Cosmetic prefix mechanism retired.

---

### TC-312: BR-S2-03 SessionHostOptions.role/phase from agent def

| Field | Value |
|-------|-------|
| **ID** | TC-312 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-S2-03; FR-07 |
| **Preconditions** | Agent with role/phase defined |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agent with role="qa-agent", phase="testing" | SessionHostOptions.role="qa-agent" |
| 2 | Verify not hardcoded 'sm-agent' | role/phase from agent definition |
| 3 | Role-scoped engine effective | Loadout/skills/steering reflect role |

**Test Data:** agentId="qa-agent"

**Postconditions:** SessionHostOptions.role/phase from agent definition, not hardcoded.

---

### TC-313: BR-S3-01 Registry key = workspaceRoot+tabId

| Field | Value |
|-------|-------|
| **ID** | TC-313 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-S3-01; FR-09; F01 |
| **Preconditions** | Tab open in workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Registry computes sessionKey | sessionKey = workspaceRoot + tabId |
| 2 | Verify composite key format | e.g., "/ws-root+tab-1" |
| 3 | Two tabs different keys | workspaceRoot+tab-1 ≠ workspaceRoot+tab-2 |

**Test Data:** workspaceRoot="/test-workspace", tabId="tab-1"

**Postconditions:** Registry keyed by workspaceRoot+tabId.

---

### TC-314: BR-S3-02 tabId never "default"

| Field | Value |
|-------|-------|
| **ID** | TC-314 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-S3-02; FR-10 |
| **Preconditions** | Session creation for tab |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session for tab | tabId provided by ChatPanel |
| 2 | Verify tabId ≠ "default" | Real tabId used |
| 3 | Compaction uses real tabId | No "default" hardcode |

**Test Data:** tabId="tab-1" (not "default")

**Postconditions:** tabId always valid; never "default".

---

### TC-315: BR-S3-03 Session dispose on tab close

| Field | Value |
|-------|-------|
| **ID** | TC-315 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-S3-03; FR-09; F01 |
| **Preconditions** | Tab with active session |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Close tab | session.dispose() called |
| 2 | History cleaned up | History cleared |
| 3 | Token accounting cleaned up | No leak |
| 4 | Registry entry removed | Session no longer in registry |

**Test Data:** tabId="tab-1"

**Postconditions:** Session disposed cleanly on tab close.

---

### TC-316: BR-S3-04 Design shared with SA4E-369 D1

| Field | Value |
|-------|-------|
| **ID** | TC-316 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-S3-04; S3 = D1 locked rule |
| **Preconditions** | S3 and SA4E-369 D1 design docs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compare S3 design with SA4E-369 D1 | Single implementation |
| 2 | Verify no duplicate spec/code | Design ONCE |
| 3 | SA4E-369 references S3 | Dual consumption |

**Test Data:** Design documents

**Postconditions:** Single per-tab session design shared between epics.

---

### TC-317: BR-S4-01 Badge reflects wired agent

| Field | Value |
|-------|-------|
| **ID** | TC-317 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-S4-01; FR-11 |
| **Preconditions** | Tab wired to agent |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View tab badge | Shows active agent name |
| 2 | Verify not pending agent | Badge reflects wired (not switching) agent |
| 3 | Switch agent | Badge updates after AGENT_SWITCHED success |

**Test Data:** tabId="tab-1", agentId="qa-agent"

**Postconditions:** Badge reflects currently wired agent per tab.

---

### TC-318: BR-S4-02 AGENT_SWITCHED only after wiring

| Field | Value |
|-------|-------|
| **ID** | TC-318 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-S4-02; FR-11 |
| **Preconditions** | Agent switch in progress |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Initiate switch | Indicator: switching |
| 2 | Wiring in progress | No AGENT_SWITCHED success |
| 3 | Wiring complete | AGENT_SWITCHED success=true |
| 4 | Badge updated | Only after success |

**Test Data:** tabId="tab-1"

**Postconditions:** Truthful switch indicator; AGENT_SWITCHED after wiring only.

---

### TC-319: BR-S4-03 History tagged with agentId

| Field | Value |
|-------|-------|
| **ID** | TC-319 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-S4-03; FR-12 |
| **Preconditions** | Turn executed in tab |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send prompt | Turn recorded |
| 2 | Inspect history entry | agentId + agentRole present |
| 3 | Switch agent; send another | New entry tagged with new agent |

**Test Data:** tabId="tab-1"

**Postconditions:** History entries tagged with driving agent identity.

---

## 5. Boundary & Negative Testing

### TC-400: Oversized personaBody (F05 — prompt injection via persona)

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-06; F05 (prompt injection); BR-02 |
| **Preconditions** | Agent with oversized personaBody |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agent with personaBody exceeding budget | Budget gate evaluates |
| 2 | Budget gate rejects | PI_CONTEXT_BUDGET_EXCEEDED |
| 3 | Current agent retained | No persona injection beyond budget |

**Test Data:** personaBody > budget limit

**Postconditions:** Oversized persona rejected; current agent retained.

---

### TC-401: Malicious prompt injection payload (F05)

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-06; F05 (prompt injection) |
| **Preconditions** | Agent with malicious personaBody (exfiltration instructions) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agent with malicious persona | Persona injected via governance layers |
| 2 | Verify persona passes budget gate | Token cost counted |
| 3 | Verify no code execution from persona | Persona treated as text only (read+parse only) |
| 4 | Turn executes with persona | LLM responds; no data exfiltration via agent file |

**Test Data:** personaBody with injection patterns (e.g., "ignore previous instructions", "send data to external")

**Postconditions:** Malicious persona contained within governance; no code execution.

---

### TC-402: ReDoS via crafted YAML frontmatter (F06)

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-02; F06 (YAML safety); BR-04 |
| **Preconditions** | Agent file with crafted YAML frontmatter (ReDoS pattern) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser reads crafted YAML frontmatter | YAML parsing bounded; no hang |
| 2 | File skipped if invalid | Diagnostic logged |
| 3 | Other agents loaded | Discovery continues |
| 4 | Extension responsive | No denial of service |

**Test Data:** YAML frontmatter with catastrophic backtracking pattern

**Postconditions:** ReDoS protected; no hang; other agents unaffected.

---

### TC-403: Malformed YAML bypass (F06)

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-02; F06 (YAML bypass); BR-04 |
| **Preconditions** | Agent file with multiple --- sections / nested delimiters |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser reads malformed YAML | Frontmatter parse handled safely |
| 2 | File skipped or warning | No frontmatter bypass |
| 3 | Body extracted safely | personaBody set correctly or empty |

**Test Data:** YAML with multiple `---` sections

**Postconditions:** Malformed YAML handled safely; no bypass.

---

### TC-404: Crafted role fallback behavior (F03)

| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-02; F03 (role validation); BR-07 |
| **Preconditions** | Agent with crafted/invalid role |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agent with crafted role | Role validated against SA4E-355 matrix |
| 2 | Invalid role → fallback | Default role applied; warning logged |
| 3 | No privilege escalation | No broader loadout than intended |
| 4 | Turn succeeds | Fail-open to base loadout |

**TestData:** agent `.md` with crafted role string

**Postconditions:** Crafted role does not escalate privileges; fallback to default.

---

### TC-405: agentId authorization — invalid agent not selectable (F02)

| Field | Value |
|-------|-------|
| **ID** | TC-405 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-05; F02 (agentId authorization) |
| **Preconditions** | agentId not in current agent list |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select agentId not in agentList | Validation fails |
| 2 | `chat:agentSwitched` success=false | Error: agent not found |
| 3 | Current agent retained | Previous agent stays active |

**Test Data:** agentId="fake-agent"

**Postconditions:** Invalid agentId rejected; current agent retained.

---

### TC-406: Fail-open privilege — role scoping error doesn't elevate (F08)

| Field | Value |
|-------|-------|
| **ID** | TC-406 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-08; F08 (fail-open privilege); BR-07 |
| **Preconditions** | Agent role causing loadout error |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | buildSessionToolLoadout throws | Error caught |
| 2 | Fallback to base loadout | Base loadout (not elevated) |
| 3 | Verify no extra tools | No additional capabilities granted |
| 4 | Turn succeeds | No crash |

**Test Data:** agent with role causing loadout error

**Postconditions:** Fail-open does not elevate privileges; base loadout only.

---

### TC-407: Boundary — ≥ 10 concurrent tabs (scalability)

| Field | Value |
|-------|-------|
| **ID** | TC-407 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-09, FR-10; NFR Scalability |
| **Preconditions** | Extension running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open 10 tabs concurrently | 10 sessions created |
| 2 | Send prompt in each tab | All turns execute |
| 3 | Verify no degradation | Performance acceptable |
| 4 | Close all tabs | All sessions disposed cleanly |

**Test Data:** tab-1 through tab-10

**Postconditions:** ≥ 10 concurrent tabs supported; clean dispose.

---

### TC-408: Boundary — empty agent file body

| Field | Value |
|-------|-------|
| **ID** | TC-408 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-01; BR-S1-02 |
| **Preconditions** | Agent file with empty body |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Parser reads agent with empty body | personaBody = empty string |
| 2 | Warning logged | Warning for empty persona |
| 3 | Agent loads | No crash |

**Test Data:** agent `.md` with frontmatter only, no body

**Postconditions:** Empty body handled gracefully.

---

### TC-409: Boundary — tabId = "default" rejected

| Field | Value |
|-------|-------|
| **ID** | TC-409 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | FR-10; BR-S3-02 |
| **Preconditions** | Session creation with tabId="default" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt session with tabId="default" | Rejected or normalized |
| 2 | Valid tabId required | Real tabId enforced |
| 3 | Compaction uses real tabId | No "default" hardcode |

**Test Data:** tabId="default"

**Postconditions:** tabId="default" not accepted; real tabId required.

---

## 6. UI/UX Testing

### TC-500: Badge shows correct agent per tab (UI)

| Field | Value |
|-------|-------|
| **ID** | TC-500 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FR-11; TC-S4-01; BR-S4-01 |
| **Preconditions** | Tab-1: qa-agent; Tab-2: dev-agent |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View Tab A | Badge: "QA Agent" |
| 2 | View Tab B | Badge: "Dev Agent" |
| 3 | Verify distinct badges | Badges differ per tab |

**Test Data:** Two tabs with different agents

**Postconditions:** Badge reflects active agent per tab; distinct per tab.

---

### TC-501: Switch indicator truthfulness (UI)

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FR-11; TC-S4-02; BR-S4-02 |
| **Preconditions** | Agent switch initiated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start switch | Indicator: switching (spinner) |
| 2 | During wiring | Indicator stays switching |
| 3 | On success | Indicator: success (checkmark) |
| 4 | On failure | Indicator: error; badge unchanged |

**Test Data:** tabId="tab-1", agentId="qa-agent"

**Postconditions:** Indicator accurately reflects wiring state.

---

### TC-502: Agent name/description rendered as text only (XSS — F13 residual)

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FR-02; F13 (webview XSS residual) |
| **Preconditions** | Agent with HTML/JS in name or description |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Agent name contains `<script>` | Rendered as text, not executed |
| 2 | Agent description contains HTML | Rendered as text (no innerHTML) |
| 3 | No XSS execution | No script execution in webview |

**TestData:** agent name="<script>alert(1)</script>"

**Postconditions:** Agent name/description rendered as text only; no XSS.

---

### TC-503: History agent tag visible (UI)

| Field | Value |
|-------|-------|
| **ID** | TC-503 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FR-12; TC-S4-03; BR-S4-03 |
| **Preconditions** | Turn executed in tab with wired agent |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send prompt in tab with qa-agent | Turn recorded |
| 2 | View history | Entry shows agent icon/name "QA Agent" |
| 3 | Verify per-entry agent tag | Each entry tagged with driving agent |

**Test Data:** tabId="tab-1", agentId="qa-agent"

**Postconditions:** History entries visibly tagged with driving agent.

---

### TC-504: Error toast on switch failure (UI)

| Field | Value |
|-------|-------|
| **ID** | TC-504 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FR-05; FR-11 |
| **Preconditions** | Agent switch failure |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger switch failure (e.g., invalid agent) | `chat:agentSwitched` success=false |
| 2 | Error toast shown | Toast with error message |
| 3 | Toast dismissible | User can dismiss |
| 4 | Badge unchanged | Previous agent badge retained |

**Test Data:** agentId="non-existent-agent"

**Postconditions:** Error toast shown; badge unchanged; dismissible.

---

## 7. Non-Functional Testing — Performance & Security

### TC-600: Agent switch latency < 500ms (performance)

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance; FR-05, FR-06 |
| **Preconditions** | Extension running; agent available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Initiate agent switch | Start timer |
| 2 | Wiring completes (persona + role + loadout) | Stop timer |
| 3 | Measure latency | < 500ms from select to AGENT_SWITCHED |

**Acceptance Criteria:** Agent switch wiring < 500ms perceived (BRD §6, FSD §8).

**Test Data:** tabId="tab-1", agentId="qa-agent"

**Postconditions:** Latency measured and within target.

---

### TC-601: Hot-reload propagate < 2s (performance)

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance; FR-04 |
| **Preconditions** | Agent file exists; watcher active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Modify agent file | Start timer |
| 2 | `chat:agentsLoaded` emitted | Stop timer |
| 3 | Measure latency | < 2s from file change to webview update |

**Acceptance Criteria:** Hot-reload propagate < 2s (BRD §6, FSD §8).

**Test Data:** agent `.md` file modification

**Postconditions:** Hot-reload latency within target.

---

### TC-602: Audit trail — security events logged (F16)

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | F16 (audit trail); TDD §7.6; FSD §7.3 |
| **Preconditions** | Extension running with logging enabled |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Perform agent switch | Log: tabId, agentId, success, timestamp |
| 2 | Trigger budget gate reject | Log: tabId, agentId, tokenCount, limit, timestamp |
| 3 | Trigger agent file parse error | Log: filePath, error, timestamp |
| 4 | Create/dispose session | Log: sessionKey, tabId, timestamp |

**Test Data:** tabId="tab-1", agentId="qa-agent"

**Postconditions:** All security events logged with required fields.

---

### TC-603: Session isolation security (F01)

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | FR-09, FR-10; F01 (session isolation); BR-05 |
| **Preconditions** | Two tabs with independent sessions |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A sends sensitive prompt | Tab A session only |
| 2 | Tab B cannot access Tab A history | Session key isolation enforced |
| 3 | Token accounting separate | No shared counter |

**Test Data:** tabId="tab-A", tabId="tab-B"

**Postconditions:** Per-tab session isolation enforced; no cross-tab access.

---

### TC-604: agentId authorization security (F02)

| Field | Value |
|-------|-------|
| **ID** | TC-604 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | FR-05; F02 (agentId authorization) |
| **Preconditions** | agentId not in agent list |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Select unauthorized agentId | Authorization check fails |
| 2 | `chat:agentSwitched` success=false | Error returned |
| 3 | Current agent retained | No unauthorized agent activation |

**Test Data:** agentId="unauthorized-agent"

**Postconditions:** Only valid agents selectable; unauthorized rejected.

---

## 8. Integration Testing

### TC-700: Full agent switch wiring integration

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FR-05, FR-06, FR-07, FR-08, FR-11; UC-2 |
| **Preconditions** | Extension built; agent files pre-seeded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send `chat:selectAgent` via message protocol | Adapter receives |
| 2 | Adapter loads + parses agent file | AgentInfo v2 |
| 3 | Persona injected through governance layers | All 4 layers applied |
| 4 | SessionHostOptions.role/phase set | From agent definition |
| 5 | Role-scoped loadout/skills/steering applied | buildSessionToolLoadout, applyScopedSkills, scopedSteering |
| 6 | `chat:agentSwitched` emitted success=true | End-to-end wiring complete |
| 7 | Next turn uses persona + role-scoped engine | Engine behavior verified |

**Test Data:** tabId="tab-1", agentId="qa-agent"

**Postconditions:** Full selectAgent wiring integration verified end-to-end.

---

### TC-701: Per-tab session lifecycle integration

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FR-09, FR-10; UC-3 |
| **Preconditions** | Multiple tabs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open tab A | Session created key=wsRoot+tab-A |
| 2 | Open tab B | Session created key=wsRoot+tab-B |
| 3 | Send prompts in both tabs | Independent turns |
| 4 | Close tab B | Session disposed; tab A unaffected |

**Test Data:** tab-A, tab-B

**Postconditions:** Per-tab session lifecycle integration verified.

---

### TC-702: Hot-reload integration (file change → agentsLoaded → webview)

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FR-04; UC-1 |
| **Preconditions** | File watcher active; agent file exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Modify agent file | Watcher detects change |
| 2 | Re-parse agent files | Updated AgentInfo |
| 3 | `chat:agentsLoaded` emitted | Webview receives update |
| 4 | Slash menu reflects change | Updated agent list |

**Test Data:** agent `.md` modification

**Postconditions:** Hot-reload integration verified end-to-end.

---

## 9. Regression Testing

### TC-800: TC-REG-01 Regression: role-scope-wiring tests

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | O6 (zero regression); FSD §11 TC-REG-01 |
| **Preconditions** | Existing test suite available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `role-scope-wiring.test.ts` | All tests pass |
| 2 | Verify no regressions | Role scoping still functional |

**Test Data:** Existing test suite

**Postconditions:** role-scope-wiring tests green.

---

### TC-801: TC-REG-02 Regression: tool-loadout-roles tests

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | O6 (zero regression); FSD §11 TC-REG-02 |
| **Preconditions** | Existing test suite available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `tool-loadout-roles.test.ts` | All tests pass |
| 2 | Verify tool loadout roles intact | No regression |

**Test Data:** Existing test suite

**Postconditions:** tool-loadout-roles tests green.

---

### TC-802: TC-REG-03 Regression: context-governance tests

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | O6 (zero regression); FSD §11 TC-REG-03 |
| **Preconditions** | Existing test suite available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `context-governance.*` tests | All tests pass |
| 2 | Verify governance layers intact | Budget gate, auto-chunk, pipeline functional |

**Test Data:** Existing test suite

**Postconditions:** context-governance tests green.

---

### TC-803: TC-REG-04 Regression: auto-chunk tests

| Field | Value |
|-------|-------|
| **ID** | TC-803 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | O6 (zero regression); FSD §11 TC-REG-04 |
| **Preconditions** | Existing test suite available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run auto-chunk tests | All tests pass |
| 2 | Verify auto-chunk functional | No regression |

**Test Data:** Existing test suite

**Postconditions:** auto-chunk tests green.

---

### TC-804: TC-REG-05 Regression: session routing tests

| Field | Value |
|-------|-------|
| **ID** | TC-804 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | O6 (zero regression); FSD §11 TC-REG-05 |
| **Preconditions** | Existing test suite available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run session routing tests | All tests pass |
| 2 | Verify session routing intact | No regression |

**Test Data:** Existing test suite

**Postconditions:** session routing tests green.

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| FR-01 Persona body semantics | FSD 3.1 | TC-001, TC-307, TC-308 | ✅ |
| FR-02 Extended frontmatter | FSD 3.1 | TC-001, TC-100, TC-101, TC-302 | ✅ |
| FR-03 Backward compatibility | FSD 3.1 | TC-002, TC-200, TC-303 | ✅ |
| FR-04 Hot-reload | FSD 3.1 | TC-003, TC-309, TC-702 | ✅ |
| FR-05 Real selectAgent | FSD 3.2 | TC-004, TC-201, TC-405, TC-504, TC-700 | ✅ |
| FR-06 Persona injection | FSD 3.2 | TC-004, TC-102, TC-300, TC-301, TC-400, TC-401 | ✅ |
| FR-07 Role/phase from definition | FSD 3.2 | TC-004, TC-312 | ✅ |
| FR-08 Role-scoped engine | FSD 3.2 | TC-004, TC-009, TC-305, TC-306, TC-406 | ✅ |
| FR-09 Per-tab session | FSD 3.3 | TC-005, TC-202, TC-203, TC-313, TC-315, TC-701 | ✅ |
| FR-10 Per-tab budget/compaction | FSD 3.3 | TC-005, TC-103, TC-204, TC-314, TC-407, TC-409 | ✅ |
| FR-11 UI truthfulness | FSD 3.4 | TC-006, TC-007, TC-104, TC-317, TC-318, TC-500, TC-501 | ✅ |
| FR-12 Per-agent conversation identity | FSD 3.4 | TC-205, TC-319, TC-503 | ✅ |
| FR-13 Model override | FSD 3.1, 3.2 | TC-101, TC-302 | ✅ |
| BR-01 Governance layers | BRD §5.2 | TC-300, TC-400 | ✅ |
| BR-02 Persona token cost | BRD §5.2 | TC-301, TC-102 | ✅ |
| BR-03 Model override invalid | BRD §5.2 | TC-101, TC-302 | ✅ |
| BR-04 Parser fail-safe | BRD §5.2 | TC-200, TC-303 | ✅ |
| BR-05 No leak between tabs | BRD §5.2 | TC-204, TC-304, TC-603 | ✅ |
| BR-06 Core tools never dropped | BRD §5.2 | TC-305 | ✅ |
| BR-07 Fail-open | BRD §5.2 | TC-009, TC-306, TC-100, TC-404 | ✅ |
| BR-S1-01 Agent id unique | FSD 3.1.3 | TC-307 | ✅ |
| BR-S1-02 personaBody = body | FSD 3.1.3 | TC-308, TC-408 | ✅ |
| BR-S1-03 Hot-reload extended fields | FSD 3.1.3 | TC-309 | ✅ |
| BR-S2-01 AGENT_SWITCHED after wiring | FSD 3.2.3 | TC-007, TC-310 | ✅ |
| BR-S2-02 Cosmetic prefix retired | FSD 3.2.3 | TC-008, TC-311 | ✅ |
| BR-S2-03 SessionHostOptions from agent def | FSD 3.2.3 | TC-312 | ✅ |
| BR-S3-01 Registry key workspaceRoot+tabId | FSD 3.3.3 | TC-313 | ✅ |
| BR-S3-02 tabId never "default" | FSD 3.3.3 | TC-314, TC-409 | ✅ |
| BR-S3-03 Session dispose on tab close | FSD 3.3.3 | TC-203, TC-315 | ✅ |
| BR-S3-04 Design shared SA4E-369 D1 | FSD 3.3.3 | TC-316 | ✅ |
| BR-S4-01 Badge reflects wired agent | FSD 3.4.3 | TC-006, TC-317, TC-500 | ✅ |
| BR-S4-02 AGENT_SWITCHED after wiring | FSD 3.4.3 | TC-007, TC-318, TC-501 | ✅ |
| BR-S4-03 History tagged agentId | FSD 3.4.3 | TC-205, TC-319, TC-503 | ✅ |
| Security F01 Session isolation | SECURITY-ASSESSMENT | TC-203, TC-204, TC-304, TC-603 | ✅ |
| Security F02 agentId authorization | SECURITY-ASSESSMENT | TC-405, TC-604 | ✅ |
| Security F03 Role validation | SECURITY-ASSESSMENT | TC-100, TC-101, TC-302, TC-404 | ✅ |
| Security F05 Prompt injection | SECURITY-ASSESSMENT | TC-102, TC-400, TC-401 | ✅ |
| Security F06 YAML safety | SECURITY-ASSESSMENT | TC-200, TC-402, TC-403 | ✅ |
| Security F08 Fail-open privilege | SECURITY-ASSESSMENT | TC-009, TC-306, TC-406 | ✅ |
| Security F16 Audit trail | SECURITY-ASSESSMENT | TC-602 | ✅ |
| Regression REG-01 | FSD §11 | TC-800 | ✅ |
| Regression REG-02 | FSD §11 | TC-801 | ✅ |
| Regression REG-03 | FSD §11 | TC-802 | ✅ |
| Regression REG-04 | FSD §11 | TC-803 | ✅ |
| Regression REG-05 | FSD §11 | TC-804 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Functional Requirements (FR-01 to FR-13) | 13 | 13 | 100% |
| Business Rules | 19 | 19 | 100% |
| Security Findings (F01, F02, F03, F05, F06, F08, F16) | 7 | 7 | 100% |
| Regression Suites (REG-01 to REG-05) | 5 | 5 | 100% |
| **Overall** | **44** | **44** | **100%** |

---

## 11. Appendix

### Test Data Setup

Agent fixtures pre-seeded in test workspace `.code-intel/agents/`:

| File | Format | Fields |
|------|--------|--------|
| qa-agent.md | v2 | name, description, role, phase, model, personaBody |
| dev-agent.md | v2 | name, description, role, phase, personaBody |
| legacy-agent.md | v1 | name, description, body |
| invalid-agent.md | invalid | Broken YAML frontmatter |
| oversized-agent.md | v2 | Oversized personaBody (> budget) |
| malicious-agent.md | v2 | Malicious personaBody (injection patterns) |

### Environment Configuration

- vitest configured for UT/IT
- Playwright configured for E2E-UI (Chromium)
- VS Code Extension Host for SIT
- Mock LLM provider (no real API calls)
- Temp directories for workspace roots

### Automation Candidates

| Test Case | Level | Automation |
|-----------|-------|------------|
| TC-001 to TC-009 | UT/IT | Automated (vitest) |
| TC-100 to TC-104 | UT/IT | Automated (vitest) |
| TC-200 to TC-205 | UT/IT | Automated (vitest) |
| TC-300 to TC-319 | UT/IT | Automated (vitest) |
| TC-400 to TC-409 | UT/IT | Automated (vitest) |
| TC-500 to TC-504 | E2E-UI | Automated (Playwright) |
| TC-600 to TC-604 | IT/SIT | Automated + Manual |
| TC-700 to TC-702 | IT | Automated (vitest) |
| TC-800 to TC-804 | IT | Automated (vitest) |

### Notes

- SIT reserved for visual/UX/timing tests not automatable (badge rendering, indicator timing, XSS render verification).
- All security findings mapped to dedicated test cases.
- RTM shows 100% coverage of FRs, Business Rules, Security Findings, and Regression suites.



