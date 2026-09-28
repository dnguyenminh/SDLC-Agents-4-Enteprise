# User Guide (UG)

## Pi Extensions — SA4E-316: Register custom tools via Pi Extensions (bridge MCP wrapper tools)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-316 |
| Title | Register custom tools via Pi Extensions (bridge MCP wrapper tools) |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related BRD | BRD-v1.0-SA4E-316.md |
| Related FSD | FSD-v1.0-SA4E-316.md |
| Related TDD | TDD-v1.0-SA4E-316.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-25 | DEV Agent | Initial document |

---

## 1. Introduction

### 1.1 Purpose

This guide describes how to use and configure the Pi Extensions MCP Bridge for SA4E-316. The extension registers custom tools for Pi Coding Agent, bridging existing MCP wrapper tools running on port 9181 into Pi agent sessions for direct invocation.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| Pi Agent Developer | How to create and load extensions |
| Pi Agent User | Which tools are available and how to invoke |
| System Administrator | How to configure extension paths and MCP wrapper |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| Pi SDK @earendil-works/pi-coding-agent | latest | Yes |
| MCP Wrapper Server | running on 9181 | Yes |
| Node.js | 18+ | Yes |
| TypeBox/Zod | latest | Yes |

---

## 2. Getting Started

### 2.1 Quick Start

```bash
# Step 1: Ensure MCP wrapper is running
# Verify MCP wrapper responds on port 9181
curl -X POST http://127.0.0.1:9181/mcp -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}'

# Step 2: Configure extension path
# Add extension path to Pi agent configuration
# extensions.additionalExtensionPaths = [".pi/extensions"]

# Step 3: Place extension file
# extension/src/pi-agent/extensions/mcp-bridge-extension.ts

# Step 4: Start Pi session
# Tools should appear in session.getActiveToolNames()
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js | 18 | 20+ |
| Memory | 512 MB | 1 GB |
| Disk | 100 MB | 500 MB |
| OS | Windows/Linux/macOS | Windows |

### 2.3 Configuration Methods

| Method | Priority | Best For |
|--------|----------|----------|
| Extension file | 1 | Tool registration |
| Environment variables | 2 | MCP endpoint override |

---

## 3. Configuration

### 3.1 Configuration Reference

#### MCP Wrapper Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| mcp.baseUrl | string | http://127.0.0.1:9181/mcp | MCP wrapper endpoint |
| extension.toolValidation | boolean | true | Enable schema validation |

### 3.2 Configuration Examples

#### Minimal Configuration

```typescript
// mcp-bridge-extension.ts
export default function({ pi }) {
  pi.registerTool({
    name: 'jira_get_issue',
    label: 'Jira Get Issue',
    description: 'Fetch a Jira issue by key',
    parameters: { type: 'object', properties: { issue_key: { type: 'string' } }, required: ['issue_key'] },
    execute: async (id, params) => { /* proxy to MCP */ }
  });
}
```

---

## 4. Usage

### 4.1 Register Custom Tools

**Description:** Extension registers tools that proxy to MCP wrapper.

**How to use:**
```typescript
import mcpBridgeExtension from './extensions/mcp-bridge-extension';
mcpBridgeExtension({ pi });
```

**Example:**
```typescript
// Tools registered: jira_get_issue, mem_search, mem_ingest, code_search, execute_dynamic_tool
const toolNames = session.getActiveToolNames();
console.log(toolNames); // ['jira_get_issue', 'mem_search', ...]
```

### 4.2 Invoke Registered Tool

**Description:** Invoke tool with parameters, result returned from MCP.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| issue_key | string | Yes | Jira issue key |

**Example:**
```typescript
const result = await tool.execute('id', { issue_key: 'SA4E-316' });
// Result: { content: [{ type: 'text', text: '{"key":"SA4E-316",...}' }] }
```

**Expected Output:**
```json
{
  "content": [{ "type": "text", "text": "{\"key\":\"SA4E-316\"}" }],
  "details": { "toolName": "jira_get_issue", "success": true }
}
```

### 4.3 Error Handling

If MCP wrapper is unreachable, tool returns structured error:

```json
{
  "content": [{ "type": "text", "text": "Error invoking jira_get_issue: MCP wrapper unavailable" }],
  "details": { "error": "mcp_error", "toolName": "jira_get_issue" }
}
```

---

## 5. Administration

### 5.1 Adding Extension Path

**Steps:**
1. Configure DefaultResourceLoader with `additionalExtensionPaths`
2. Place extension file in configured path
3. Restart Pi session
4. Verify tools in `session.getActiveToolNames()`

### 5.2 Monitoring Health

Check MCP wrapper health:
```bash
curl http://127.0.0.1:9181/mcp
```

Check extension loaded:
```typescript
console.log(session.getActiveToolNames().includes('jira_get_issue'));
```

---

## 6. Troubleshooting

### 6.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | Tool not appearing in session | Extension not discovered | Verify extension path configured in DefaultResourceLoader |
| 2 | MCP wrapper unavailable error | Server down or port blocked | Start MCP wrapper on port 9181 |
| 3 | Validation failed error | Invalid parameters | Check schema, provide required fields |

### 6.2 Error Codes

| Code | Message | Description | Action |
|------|---------|-------------|--------|
| MCP_UNREACHABLE | MCP wrapper unavailable | Network error to 9181 | Start MCP wrapper |
| VALIDATION_FAILED | Validation failed | Schema mismatch | Fix parameters |
| DUPLICATE_TOOL | Tool name already exists | Duplicate registration | Use unique tool name |

### 6.3 Logs

| Log Location | Content | Useful For |
|-------------|---------|------------|
| stdout | [Pi Extension] Registered tool | Verify registration |
| stdout | [Pi Extension] Failed to register tool | Debug errors |

---

## 7. API Reference

### 7.1 jira_get_issue

| Attribute | Value |
|-----------|-------|
| Name | jira_get_issue |
| Description | Fetch a Jira issue by key |

**Input Schema:**
```json
{
  "type": "object",
  "properties": { "issue_key": { "type": "string" } },
  "required": ["issue_key"]
}
```

**Example Request:**
```json
{ "issue_key": "SA4E-316" }
```

**Example Response:**
```json
{ "content": [{ "type": "text", "text": "{\"key\":\"SA4E-316\"}" }] }
```

### 7.2 mem_search

| Attribute | Value |
|-----------|-------|
| Name | mem_search |
| Description | Search knowledge base memory |

**Input Schema:**
```json
{
  "type": "object",
  "properties": { "query": { "type": "string" }, "limit": { "type": "number" } },
  "required": ["query"]
}
```

---

## 8. Appendix

### 8.1 Glossary

| Term | Definition |
|------|------------|
| Pi Extension | Plugin loaded by Pi Coding Agent to register tools |
| MCP Wrapper | Proxy server exposing tools on port 9181 |
| pi.registerTool | Pi SDK API to register custom tool |

### 8.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-316/BRD.md |
| FSD | documents/SA4E-316/FSD.md |
| TDD | documents/SA4E-316/TDD.md |
