# User Guide (UG)

## SA4E-370 — Custom Agents — real file-defined agent personas wired into the chat engine (identity, role scoping, per-tab sessions)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-370 |
| Title | Custom Agents — real file-defined agent personas wired into the chat engine (identity, role scoping, per-tab sessions) |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-23 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-370.docx |
| Related FSD | FSD-v1.0-SA4E-370.docx |
| Related TDD | TDD-v1.0-SA4E-370.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-23 | DEV Agent | Initial document |

---

## 1. Introduction

### 1.1 Purpose

This User Guide explains how to define custom agents with real personas, switch agents per chat tab, and understand per-tab session isolation and UI truthfulness in the SDLC Agents 4 Enterprise VS Code extension. It is for extension users who operate the chatbox and extension developers who author agent definition files.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| Extension User | How to switch agents in chatbox, understand badges and session isolation |
| Extension Developer | How to author `.code-intel/agents/*.md` files with persona body and v2 frontmatter |
| Extension Maintainer | How to troubleshoot agent wiring, budget gate rejects, and hot-reload |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| VS Code Extension | SDLC Agents 4 Enterprise | Yes |
| Workspace | Any | Yes |

---

## 2. Getting Started

### 2.1 Quick Start

```bash
# 1. Ensure workspace has .code-intel/agents/ folder
# The extension creates it on first run

# 2. Create an agent file
# .code-intel/agents/qa-agent.md

# 3. Open VS Code, open a chat tab, use slash menu to select agent
# Agent badge updates per tab

# 4. Verify
# Badge shows selected agent name, switch indicator shows success
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| VS Code | 1.100+ | Latest |
| Memory | 512MB | 1GB+ |
| OS | Windows/macOS/Linux | - |

---

## 3. Configuration

### 3.1 Configuration File

Agent definitions live in the workspace:

```
.code-intel/agents/<agent-id>.md
```

Format: Markdown with YAML frontmatter.

### 3.2 Configuration Reference

#### Agent Definition v2

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| name | string | required | Display name shown in slash menu and badge |
| description | string | required | Short description shown in slash menu |
| role | string | - | Role used for tool loadout/skills/steering scoping |
| phase | string | - | Default pipeline phase for session |
| model | string | - | Optional model override for session |
| body (persona) | markdown | required | System prompt content injected as persona |

#### Frontmatter Example

```yaml
---
name: QA Agent
description: Quality engineering agent
role: qa-agent
phase: testing
model: gpt-4o-mini
---

You are the QA agent. You focus on test planning, test cases, and quality gates.
You must follow the SDLC quality standards and report findings clearly.
```

### 3.3 Environment Variables

No environment variables are required for custom agents.

---

## 4. Usage

### 4.1 Define a Custom Agent

**Description:** Create a markdown file in `.code-intel/agents/` with frontmatter v2 and persona body.

**How to use:**

1. Create file `.code-intel/agents/<agent-id>.md`
2. Add YAML frontmatter with `name`, `description`, optional `role`, `phase`, `model`
3. Write persona body after frontmatter
4. Save file — hot-reload updates agent list within ~2s

**Example:**

```markdown
---
name: Dev Agent
description: Developer agent for implementation
role: dev-agent
phase: implementation
---

You are the Developer agent. Implement code from TDD, write tests, follow SOLID.
```

**Expected Result:** Agent appears in slash menu, can be selected per tab.

### 4.2 Switch Agent in Chatbox

**Description:** Change the active agent for a tab via slash menu.

**Steps:**

1. Open chat tab
2. Type `/` to open slash menu
3. Select "Agents"
4. Choose agent from list
5. Switch indicator shows "switching..." then success checkmark

**Result:** Session wires persona + role/phase; badge updates; history tagged with agent.

**Business Error Scenarios:**

- Agent file read error → keep current agent, error toast
- Persona too large for budget → switch fails with "Context budget exceeded"
- Invalid role → fallback to default role with warning

### 4.3 Per-Tab Session Isolation

**Description:** Each chat tab has independent session, history, token budget, and compaction.

**Behavior:**

- Tab A with QA Agent does not affect Tab B with Dev Agent
- Token accounting and compaction are per-tab
- Closing a tab disposes its session

**User Action:** Open multiple tabs, select different agents per tab; badges remain distinct.

---

## 5. User Interface Guide

### 5.1 Screen Overview

| # | Screen | URL / Path | Purpose |
|---|--------|-----------|---------|
| 1 | Chat Tab | Chat Panel | Primary chat interaction |
| 2 | Slash Menu | Chat Input / | Agent selection |

### 5.2 Chat Tab with Agent Badge

**Key Elements:**

| # | Element | Type | Description |
|---|---------|------|-------------|
| 1 | Tab Agent Badge | Badge | Shows active agent name for this tab |
| 2 | Switch Indicator | Indicator | Shows idle / switching / success / error |
| 3 | Slash Menu Agent List | List | Shows name + description from agent files |

**User Actions:**

| Action | Steps | Expected Result |
|--------|-------|-----------------|
| Switch agent | 1. Open slash menu 2. Select agent | Badge updates, indicator shows success |
| Verify isolation | 1. Open second tab 2. Select different agent | Each tab keeps its own badge and history |

---

## 6. Administration

### 6.1 Add a New Agent

1. Create `.code-intel/agents/<id>.md` with valid frontmatter and persona body
2. Save file — watcher triggers hot-reload
3. Verify agent appears in slash menu
4. Select agent in tab to wire persona + role

### 6.2 Monitor Health

Check Output panel → Extension logs for:
- `agentsLoaded` messages
- `AGENT_SWITCHED` success/failure
- Budget gate rejections `PI_CONTEXT_BUDGET_EXCEEDED`

### 6.3 Hot-Reload Configuration

No configuration needed. File changes propagate automatically. Invalid YAML → file skipped, diagnostic logged, no crash.

---

## 7. Troubleshooting

### 7.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | Agent not appearing in slash menu | File invalid YAML or missing frontmatter | Fix frontmatter, ensure `name` and `description` present |
| 2 | Switch indicator stuck on switching | Agent file read error or budget gate reject | Check logs for parse error; shorten persona body |
| 3 | Badge shows wrong agent | AGENT_SWITCHED not received | Reload chat panel, verify wiring succeeded |
| 4 | Tabs share history | Registry key not per-tab | Verify extension updated to SA4E-370; restart VS Code |
| 5 | Persona not influencing responses | Agent selected but wiring failed | Check switch indicator for error; persona injected through governance only |

### 7.2 Error Codes

| Code | Message | Description | Action |
|------|---------|-------------|--------|
| PI_CONTEXT_BUDGET_EXCEEDED | Context budget exceeded | Persona + context too large | Shorten persona body |
| PI_MODEL_UNRESOLVED | Model not found | Invalid model override | Remove or correct `model` field |

### 7.3 Logs

| Log Location | Content | Useful For |
|-------------|---------|------------|
| VS Code Output → Extension Log | Agent discovery, selectAgent wiring, budget gate | Debug agent switch failures |

### 7.4 FAQ

**Q: Do I need to restart VS Code after creating an agent file?**
A: No. Hot-reload updates agent list within ~2s.

**Q: Can old agent files without role/phase still work?**
A: Yes. v1 files with only `name` and `description` are backward compatible; role/phase fall back to defaults.

**Q: Does switching agent affect other tabs?**
A: No. Each tab has its own session and agent identity.

**Q: Where is persona used?**
A: Persona body is injected as system prompt content through governance layers; it does not appear as a text prefix.

---

## 8. API Reference

No external API. Agent wiring uses internal VS Code message protocol:

- `chat:selectAgent` — Webview → Extension
- `chat:agentsLoaded` — Extension → Webview
- `chat:agentSwitched` — Extension → Webview

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| Agent Persona | Markdown body of agent .md, injected as system prompt |
| AgentInfo v2 | Parsed structure with id, name, description, role, phase, model, personaBody |
| Per-tab Session | Independent AgentSession per chat tab, key workspaceRoot+tabId |
| UI Truthfulness | Badge and indicator reflect actual wired agent, not pending |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-370/BRD.md |
| FSD | documents/SA4E-370/FSD.md |
| TDD | documents/SA4E-370/TDD.md |

### 9.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|----------------|----------------|------------------|
| 1.0 | v2 frontmatter | Initial release |
