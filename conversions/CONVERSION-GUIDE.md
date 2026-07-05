# .kiro → Multi-Platform Conversion Guide

## Mapping Table

| Kiro Concept | Claude Code | GitHub Copilot | Antigravity |
|---|---|---|---|
| `.kiro/steering/*.md` (always) | `CLAUDE.md` + `.claude/rules/*.md` | `.github/copilot-instructions.md` + `.github/instructions/*.instructions.md` | `AGENTS.md` + `GEMINI.md` |
| `.kiro/steering/*.md` (fileMatch) | `.claude/rules/*.md` with `paths:` frontmatter | `.github/instructions/*.instructions.md` with `applyTo:` | Subfolder `AGENTS.md` files |
| `.kiro/agents/*.md` (sub-agents) | `.claude/agents/*.md` (subagents) | `.github/agents/*.md` (custom agents) | Skills (`skills/<name>/SKILL.md`) + subagents |
| `.kiro/hooks/*.json` | `.claude/hooks.json` (hooks) | `.github/hooks/*.json` (hooks v1) | `.agents/hooks.json` (PreToolUse/PostToolUse/Stop) |
| `.kiro/settings/mcp.json` | `.claude/mcp.json` | MCP via VS Code settings | `mcp.json` or `settings.json` |

## Key Differences

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

| Feature | Claude Code | Copilot | Antigravity |
|---|---|---|---|
| Multi-agent orchestration | Subagents | Custom agents + agent tool | Skills + subagents |
| Event hooks | hooks.json | .github/hooks/*.json | .agents/hooks.json |
| MCP integration | Native | Native (agent + repo level) | Native |
| File-conditional rules | paths: | applyTo: | Subfolder AGENTS.md |
| SDLC pipeline (BA-SA-QA-DEV) | Subagent delegation | Agent delegation | Skill + subagent delegation |

## Recommendations

1. **Claude Code** — Closest equivalent (~90% coverage). Subagents + hooks + rules reproduce pipeline well
2. **GitHub Copilot** — Strong match (~85%). Custom agents + hooks + instructions. Full SDLC possible
3. **Antigravity** — Strong match (~85%). Skills + hooks + GEMINI.md + subagents. Full SDLC possible
