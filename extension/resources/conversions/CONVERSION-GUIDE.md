# .kiro → Multi-Platform Conversion Guide

## Mapping Table

| Kiro Concept | Claude Code | GitHub Copilot | Antigravity | Codex (OpenAI) |
|---|---|---|---|---|
| `.kiro/steering/*.md` (always) | `CLAUDE.md` + `.claude/rules/*.md` | `.github/copilot-instructions.md` + `.github/instructions/*.instructions.md` | `AGENTS.md` + `GEMINI.md` | Root `AGENTS.md` |
| `.kiro/steering/*.md` (fileMatch) | `.claude/rules/*.md` with `paths:` frontmatter | `.github/instructions/*.instructions.md` with `applyTo:` | Subfolder `AGENTS.md` files | Subdirectory `AGENTS.md` files |
| `.kiro/agents/*.md` (sub-agents) | `.claude/agents/*.md` (subagents) | `.github/agents/*.md` (custom agents) | Skills (`skills/<name>/SKILL.md`) + subagents | Agent role sections in `agents/*.md` (no native subagent) |
| `.kiro/hooks/*.json` | `.claude/hooks.json` (hooks) | `.github/hooks/*.json` (hooks v1) | `.agents/hooks.json` (PreToolUse/PostToolUse/Stop) | ❌ Not supported natively |
| `.kiro/settings/mcp.json` | `.claude/mcp.json` | MCP via VS Code settings | `mcp.json` or `settings.json` | `codex.json` or env var or noted in AGENTS.md |

## Key Differences

### Codex (OpenAI)
- **Partial match** (~70% coverage). AGENTS.md + subdirectory scoping, no native hooks or subagents
- Root `AGENTS.md` = always-on project instructions (equivalent to all "always" steering combined)
- Subdirectory `AGENTS.md` = scoped instructions for specific areas
- No native subagent concept — agents described as "roles/personas" within instructions
- No hook system — lifecycle events not supported natively
- MCP config via `codex.json`, environment variables, or documented in AGENTS.md
- 32KB default limit per AGENTS.md file — keep focused, detail in subdirectory files

### Claude Code
- **Best match** — supports subagents, hooks, rules, MCP natively
- `CLAUDE.md` = always-on root instructions (equivalent to all "always" steering combined)
- `.claude/rules/*.md` = modular rules with optional `paths:` for file-matching
- `.claude/agents/*.md` = subagents with own context window (closest to Kiro agents)
- Hooks via `.claude/hooks.json` (pre/post command, file events)

### GitHub Copilot
- **Full match** — supports agents, hooks, instructions, MCP
- `.github/copilot-instructions.md` = single always-on file
- `.github/instructions/*.instructions.md` = conditional rules with `applyTo:` glob
- `.github/agents/*.md` = custom agents with YAML frontmatter (tools, MCP, description)
- `.github/hooks/*.json` = lifecycle hooks (preToolUse, postToolUse, agentStop, userPromptSubmitted, subagentStart/Stop)
- `AGENTS.md` at root = cross-tool standard (also supported)
- Supports sub-agent delegation via `agent` tool alias

### Antigravity (Google)
- **Full match** — AGENTS.md + GEMINI.md + Skills + Hooks + Subagents
- `AGENTS.md` = cross-tool standard, project root instructions
- `GEMINI.md` = Gemini-specific system prompt instructions
- Skills (`skills/<name>/SKILL.md`) = structured capabilities with supporting files
- `.agents/hooks.json` = lifecycle hooks (PreToolUse, PostToolUse, PreInvocation, PostInvocation, Stop)
- Subagents via `define_subagent`/`invoke_subagent` tools
- Subfolder `AGENTS.md` = directory-scoped instructions

## Limitations

| Feature | Claude Code | Copilot | Antigravity | Codex |
|---|---|---|---|---|
| Multi-agent orchestration | Subagents | Custom agents + agent tool | Skills + subagents | Roles in AGENTS.md (no native subagent) |
| Event hooks | hooks.json | .github/hooks/*.json | .agents/hooks.json | ❌ Not supported |
| MCP integration | Native | Native (agent + repo level) | Native | Via env/config or AGENTS.md |
| File-conditional rules | paths: | applyTo: | Subfolder AGENTS.md | Subfolder AGENTS.md |
| SDLC pipeline (BA-SA-QA-DEV) | Subagent delegation | Agent delegation | Skill + subagent delegation | Role instructions (manual coordination) |

## Recommendations

1. **Claude Code** — Closest equivalent (~90% coverage). Subagents + hooks + rules reproduce pipeline well
2. **GitHub Copilot** — Strong match (~85%). Custom agents + hooks + instructions. Full SDLC possible
3. **Antigravity** — Strong match (~85%). Skills + hooks + GEMINI.md + subagents. Full SDLC possible
4. **Codex (OpenAI)** — Partial match (~70%). AGENTS.md + subdirectory scoping works for instructions, but no hooks or native subagents limits automation
