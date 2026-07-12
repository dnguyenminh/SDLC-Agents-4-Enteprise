# .kiro → OpenCode Conversion Guide

## Mapping Table

| Kiro Concept | OpenCode Equivalent |
|---|---|
| `.kiro/steering/*.md` (always-on) | `AGENTS.md` (root project instructions) |
| `.kiro/steering/*.md` (fileMatch) | `.opencode/skills/*/SKILL.md` (agent skills) |
| `.kiro/agents/*.md` (with YAML frontmatter) | `.opencode/agents/*.md` (subagents) |
| `.kiro/agents/*.json` (metadata) | `opencode.json` `agent.{}` section |
| `.kiro/hooks/*.json` | ❌ Not supported natively. Use `opencode.json` `hooks` section if available, otherwise rules in AGENTS.md |
| `.kiro/settings/mcp.json` | MCP servers in `opencode.json` via `mcpServers` |
| `invokeSubAgent` | Task tool (primary agents delegate to subagents) |
| `find_tools` / `execute_dynamic_tool` | MCP tools via tool description discovery |
| Draw.io diagrams | Native markdown diagrams or Mermaid |

## Key Differences

| Feature | Kiro | OpenCode |
|---|---|---|
| Multi-agent orchestration | `invokeSubAgent` | Task tool (primary → subagent) |
| Event hooks | `.kiro/hooks/*.json` | Not supported natively |
| Tool discovery | `find_tools` semantic search | Tool descriptions in system prompt |
| MCP integration | `.kiro/settings/mcp.json` | `opencode.json` `mcpServers` |
| Subagent model | Separate context window | Subagent runs in own session |
| Steering/rules | Per-file steering docs | Skills (SKILL.md) + AGENTS.md |
| Welcome message | JSON metadata | Not supported |
| Keyboard shortcut | JSON metadata | Not supported |

## Coverage

| Category | Coverage |
|---|---|
| **Agents** (10 agents: BA, SM, SA, TA, DEV, QA, DevOps, Security, UI, UI/UX) | ✅ Full — `.opencode/agents/*.md` |
| **Steering** (35+ rule files) | ✅ Full — `AGENTS.md` (always-on) + `.opencode/skills/` (focused) |
| **Hooks** (event-driven) | ❌ Partial — documented as rules in AGENTS.md |
| **MCP config** | ✅ Full — `opencode.json` `mcpServers` |
