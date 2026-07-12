# MCP Configuration for Codex

> Converted from .kiro/ format for OpenAI Codex CLI

## Overview

This project uses MCP (Model Context Protocol) servers for dynamic tool access.
Codex CLI does not have native MCP config files — configure via environment or AGENTS.md instructions.

## MCP Servers

### Code Intelligence Server

- **URL**: `http://127.0.0.1:9181/mcp`
- **Purpose**: Code indexing, semantic search, project analysis
- **Tools**: code_search, find_tools, execute_dynamic_tool, agent_log, mem_search, mem_ingest

## Configuration Methods

### Method 1: Environment Variable

```bash
export CODEX_MCP_SERVERS='[
  {"name": "code-intelligence", "url": "http://127.0.0.1:9181/mcp"}
]'
```

### Method 2: codex.json (if supported by your Codex version)

```json
{
  "mcpServers": {
    "code-intelligence": {
      "url": "http://127.0.0.1:9181/mcp"
    }
  }
}
```

### Method 3: Reference in AGENTS.md

Include MCP server URLs in the root AGENTS.md so the agent knows where to connect.
The Dynamic Tool Execution Pattern (find_tools → execute_dynamic_tool) handles tool discovery.

## Tool Discovery Pattern

Since Codex doesn't natively manage MCP tool routing, all agents use:

1. `find_tools(query: "...", threshold: 0.3, top_k: 5)` — discover available tools
2. `execute_dynamic_tool(tool_name: "...", arguments: {...})` — execute discovered tool

Never hardcode tool names. Always discover first.

## Starting MCP Servers

```bash
# Start code-intelligence server
cd backend && npm run start:mcp

# Start atlassian server (separate terminal)
cd mcp-servers/atlassian && npm start
```
