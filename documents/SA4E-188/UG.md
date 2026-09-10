# User Guide (UG)

## SDLC-Agents-4-Enterprise — SA4E-188: Skill Auto-Activation — Auto-invoke skills, /slash-command mapping, preload

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-188 |
| Title | Skill Auto-Activation — Auto-invoke skills, /slash-command mapping, preload |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-08-30 |
| Status | Draft |
| Related BRD | documents/SA4E-188/BRD.md |
| Related FSD | documents/SA4E-188/FSD.md |
| Related TDD | documents/SA4E-188/TDD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-30 | DEV Agent | Initial user guide for Skill Auto-Activation |

---

## 1. Introduction

### 1.1 Purpose

This guide explains how to use the **Skill Auto-Activation** feature shipped with the SDLC-Agents-4-Enterprise VS Code / Kiro extension. It covers three capabilities delivered by ticket SA4E-188:

1. **Auto-activation** — relevant skills are detected automatically from your message and surfaced in the chat.
2. **Slash-command mapping** — every skill under `.code-intel/skills/` becomes a `/<skill-id>` entry in the chat slash menu.
3. **Skill preloading** — skills listed in an agent's frontmatter are injected into the agent system prompt at compile time (see dependency SA4E-181 agentic config).

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| End User (Developer in VS Code/Kiro) | How to trigger and discover skills in chat |
| Agent Author | How to register a skill so it appears in the menu and auto-activates |
| System Administrator | How to enable/disable the feature via feature flag |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| Visual Studio Code or Kiro IDE | 1.85+ | Yes |
| SDLC-Agents-4-Enterprise extension | Latest | Yes |
| Skills directory `.code-intel/skills/` | — | Yes (auto-discovered from workspace) |

---

## 2. Getting Started

> This feature is bundled inside the extension. No separate download step is required beyond installing/updating the extension from the marketplace or `.vsix`.

### 2.1 Quick Start

1. Open your workspace in VS Code / Kiro with the SDLC-Agents-4-Enterprise extension active.
2. Ensure a skill exists: `your-workspace/.code-intel/skills/<skill-id>/SKILL.md`.
3. Open the Chat panel.
4. On panel load, the extension scans `.code-intel/skills/` and pushes the skill list to the chat (event `chat:skillsLoaded`).
5. Type `/` in the chat input — the slash menu now lists every discovered skill.
6. (Optional) Reference a skill by name in a message; if the matcher detects a keyword match, the skill is auto-activated and a notification is shown.

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| VS Code / Kiro | 1.85 | Latest stable |
| Node.js (extension host) | 20.x | 20.x LTS |
| OS | Windows / macOS / Linux | Windows / macOS / Linux |

### 2.3 Distribution Formats

| Format | How to Get | Use Case |
|--------|-----------|----------|
| VS Code Extension (.vsix) | Internal marketplace / build artifact | Standard install |
| Source build | Repo `extension/` folder | Development & contribution |

### 2.4 Configuration Methods

The feature can be toggled via a feature flag. Precedence: environment variable > extension setting > default.

| Method | Priority | Best For |
|--------|----------|----------|
| Environment variable `SKILL_AUTO_ACTIVATION_ENABLED` | High | CI / forced override |
| Extension setting (if exposed) | Medium | Per-user toggle |
| Default (enabled) | Low | Out-of-box behavior |

### 2.5 Verify Configuration

- Check 1 (skill discovery): open Chat panel, type `/` — skill IDs from `.code-intel/skills/` appear in the menu.
- Check 2 (extension logs): Developer Tools → Extension Host console should show `[ChatStateManager] sendSkillsInfo: N skills` (N > 0 when skills exist).
- Check 3 (auto-activation): send a message containing a skill keyword; a skill-activation notification appears.
- Common issues:

| Symptom | Cause | Fix |
|---------|-------|-----|
| No skills in slash menu | `.code-intel/skills/` missing or empty | Create `<id>/SKILL.md` under the workspace `.code-intel/skills/` |
| Skill shown without description | `SKILL.md` frontmatter missing `description:` | Add `description: "..."` to frontmatter |

---

## 3. Configuration

### 3.1 Configuration File

No dedicated config file is required. Skill registration is **file-based**: the extension reads the live workspace folder `.code-intel/skills/`. Each sub-directory is one skill.

### 3.2 Configuration Reference

#### Feature Flag

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `SKILL_AUTO_ACTIVATION_ENABLED` | boolean (env) | enabled | Master switch for skill auto-activation |

#### Skill Registration (per skill)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `<skill-id>/SKILL.md` (file) | markdown | required | Skill definition; frontmatter `description` is used in the slash menu |
| `description` (frontmatter) | string | "" | Human-readable description shown in slash menu; parsed via `description: "..."` |

### 3.3 Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `SKILL_AUTO_ACTIVATION_ENABLED` | Enables/disables auto-activation | No | `true` |

### 3.4 Configuration Examples

#### Register a new skill

```
your-workspace/
└── .code-intel/
    └── skills/
        └── my-skill/
            └── SKILL.md
```

`SKILL.md`:

```markdown
---
description: "My custom skill — does something useful"
---

# My Skill

Usage instructions for the skill body...
```

After saving, the extension's file watcher hot-reloads the skill list and re-broadcasts `chat:skillsLoaded` (debounced 300ms).

---

## 4. Usage

### 4.1 Discover & invoke a skill via slash menu

**Description:** Every skill under `.code-intel/skills/` is registered as a `/<skill-id>` slash command.

**How to use:**

```
Type "/" in the chat input, then select the skill from the menu (or type "/<skill-id> ").
```

**Parameters:** None — the slash command directly invokes the corresponding skill.

**Example:**

```
/browser-harness scrape https://example.com
```

**Expected Output:** The `browser-harness` skill is invoked directly, equivalent to selecting it from the menu.

### 4.2 Auto-activation from message keywords

**Description:** When you send a message, the extension matches your text against skill descriptions and, if a confident match is found, auto-activates the skill and notifies you.

**How to use:**

```
Send a natural-language message that mentions a skill's purpose, e.g. "use browser to scrape the page".
```

**Example:**

```
scrape website https://example.com and extract the title
```

**Expected Output:** `browser-harness` skill is auto-activated and a notification is shown to the user (per BRD Story 1 / R6).

### 4.3 Preload skills into an agent (authoring)

**Description:** Agent authors list skills in agent frontmatter so their `SKILL.md` content is injected into the agent system prompt at graph compile time.

**How to use:** Add a `skills:` list to the agent's frontmatter (see dependency SA4E-181).

```yaml
---
name: my-agent
skills:
  - browser-harness
  - drawio
---
```

**Expected Output:** At compile time, the listed `SKILL.md` contents are available in the agent's system prompt (BRD Story 3 / R9).

---

## 5. User Interface Guide

### 5.1 Screen Overview

| # | Screen | Path | Purpose |
|---|--------|------|---------|
| 1 | Chat Panel | Extension Chat view | Where skills are discovered and invoked |

### 5.2 Chat Panel — Slash Menu

**Key Elements:**

| # | Element | Type | Description |
|---|---------|------|-------------|
| 1 | Slash trigger `/` | Input trigger | Opens the slash command menu |
| 2 | Skill entry | Menu item | One entry per discovered skill (`<id>` + `description`) |
| 3 | Activation notification | Toast/banner | Shown when a skill is auto-activated |

**User Actions:**

| Action | Steps | Expected Result |
|--------|-------|-----------------|
| Invoke skill | 1. Type `/` 2. Pick skill | Skill invoked directly |
| Auto-activate | 1. Send keyword-rich message | Skill auto-activated + notification |

---

## 6. Administration

### 6.1 Adding a New Skill

1. Create `your-workspace/.code-intel/skills/<skill-id>/SKILL.md`.
2. Add frontmatter with a `description:` field.
3. Save — the file watcher hot-reloads the list automatically (no restart needed).

### 6.2 Monitoring Health

- Extension Host console logs: `[ChatStateManager] sendSkillsInfo: N skills` on each broadcast.
- File-watcher logs: `[ChatStateManager] skills files changed — reloading skills` on hot-reload.

### 6.3 Hot-Reload Configuration

The extension watches `.code-intel/skills/**/*.md`. Create/change/delete triggers a debounced (300ms) re-broadcast of `chat:skillsLoaded` to the webview — no manual reload required.

---

## 7. Troubleshooting

### 7.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | Slash menu empty | Skills folder missing/empty | Create `.code-intel/skills/<id>/SKILL.md` |
| 2 | Skill has blank description | Missing `description:` in frontmatter | Add `description: "..."` |
| 3 | Auto-activation not firing | Message lacks matching keywords | Use clearer skill-related wording |
| 4 | Hot-reload not picking up change | File saved outside workspace root | Ensure path is inside the opened workspace |

### 7.2 Error Codes

No dedicated error codes; failures are logged at debug level and fail silently (the chat remains usable).

### 7.3 Logs

| Log Location | Content | Useful For |
|--------------|---------|------------|
| VS Code Extension Host console | `sendSkillsInfo`, watcher events | Verifying skill discovery & hot-reload |

### 7.4 FAQ

**Q: Do I need to restart the editor after adding a skill?**
A: No — the skills directory is watched and hot-reloaded.

**Q: Where do skill descriptions come from?**
A: Parsed from the `description:` field in each skill's `SKILL.md` frontmatter.

**Q: Can I disable auto-activation?**
A: Yes, via the `SKILL_AUTO_ACTIVATION_ENABLED` feature flag.

---

## 8. API Reference

> Note: The TDD records a `POST /skill/match` endpoint for server-side skill matching. As of this release the extension-side implementation delivers skill discovery and slash-menu registration via the `chat:skillsLoaded` webview event; the `/skill/match` HTTP endpoint is documented in the design but not yet implemented in code (see STATUS.json note). Client integration uses the event contract below.

### 8.1 Webview Event: `chat:skillsLoaded`

| Attribute | Value |
|-----------|-------|
| Name | chat:skillsLoaded |
| Direction | Extension Host → Webview |
| Purpose | Push dynamically discovered skill list to the chat slash menu |

**Payload Schema:**

```json
{
  "type": "chat:skillsLoaded",
  "skills": [
    { "id": "browser-harness", "label": "browser-harness", "description": "Browser automation CLI for AI agents" }
  ]
}
```

**Consumer:** Webview `InputAreaIntegration.setupSkillsListener` → `slashController.setSkillAgents(skills)`.

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| Skill | Reusable agent capability defined in `SKILL.md` |
| Auto-activation | Automatic skill selection based on message context |
| Preload | Inject skill content into agent system prompt at compile time |
| Slash menu | Chat input autocomplete triggered by `/` |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-188/BRD.md |
| FSD | documents/SA4E-188/FSD.md |
| TDD | documents/SA4E-188/TDD.md |

### 9.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|---------------|---------------|-----------------|
| Extension 1.0 | SA4E-188 | Initial skill auto-activation release |
