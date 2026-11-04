---
name: mcp-server-patterns
description: "MCP Server development patterns. Use when creating MCP tools, child servers, or orchestrator integration."
---

# mcp-server-patterns

Patterns for building MCP (Model Context Protocol) servers and tools in this project.

## Architecture Overview

```
Orchestrator (main server)
├── Core tools (mem_search, code_search, find_tools, etc.)
├── Child servers (Atlassian, Pega, etc.) — separate processes
└── Tool Router — dispatches calls to handlers
```

- **Core tools**: registered directly on main MCP server, always visible
- **Child server tools**: hidden by default, discovered via `find_tools`, executed via `execute_dynamic_tool`
- **Transport**: Streamable HTTP at `/mcp` endpoint

## Registering a Tool (Core)

Tools are registered via module's `getToolDefinitions()` + `getToolHandlers()`:

```typescript
// In your module
getToolDefinitions(): ToolDefinition[] {
  return [{
    name: 'my_tool',
    description: 'What it does',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', default: 10 }
      },
      required: ['query']
    },
    category: 'my-module'
  }];
}

getToolHandlers(): Map<string, ToolHandler> {
  const handlers = new Map();
  handlers.set('my_tool', async (args) => {
    const parsed = MyToolSchema.safeParse(args);
    if (!parsed.success) return { content: [{ type: 'text', text: `Error: ${parsed.error.message}` }], isError: true };
    const result = await this.service.execute(parsed.data);
    return { content: [{ type: 'text', text: JSON.stringify(result) }], isError: false };
  });
  return handlers;
}
```

## Child MCP Server Pattern

For external integrations, create a child server:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const server = new McpServer({ name: 'my-child', version: '1.0.0' });

server.registerTool('my_tool', {
  description: 'Tool description',
  inputSchema: MyZodSchema
}, async (args) => {
  const parsed = MyZodSchema.safeParse(args);
  if (!parsed.success) return createErrorResult('VALIDATION', parsed.error.message);
  return createSuccessResult({ data });
});
```

## Tool Result Pattern

```typescript
// Success
return { content: [{ type: 'text', text: JSON.stringify(data) }], isError: false };

// Error  
return { content: [{ type: 'text', text: JSON.stringify({ error: msg }) }], isError: true };
```

## Zod Schema for Tool Input

```typescript
export const MyToolSchema = z.object({
  issue_key: z.string().regex(/^[A-Z]+-\d+$/),
  fields: z.record(z.unknown()),  // Object type, NOT string
  limit: z.number().int().min(1).max(100).default(20),
});
```

**Critical**: `z.record(z.unknown())` means callers pass **object**, not JSON string.

## Notification Broadcasting (OCP)

```typescript
const NOTIFICATION_PATTERNS: Array<{ test: (name: string) => boolean; method: string }> = [
  { test: (n) => n.includes('ingest'), method: 'kb_entry_added' },
  { test: (n) => n.includes('delete'), method: 'kb_entry_deleted' },
];
```

## Tool Discovery (Tiered Visibility)

- `tools/list` → only CORE tools
- `find_tools(query)` → semantic search all tools
- `execute_dynamic_tool(name, args)` → execute discovered tool

## Testing MCP Tools

```typescript
describe('my_tool', () => {
  it('returns results', async () => {
    const handler = module.getToolHandlers().get('my_tool');
    const result = await handler({ query: 'test', limit: 5 });
    expect(result.isError).toBe(false);
  });
});
```

## Anti-Patterns

| ❌ Don't | ✅ Do |
|----------|------|
| Return plain strings | Return `{ content, isError }` |
| Use `z.any()` for params | Define precise Zod schemas |
| Hardcode tool routing | Use handler Map (OCP) |
| Call child tools directly | Use `execute_dynamic_tool` |
| Expose all tools in list | Use tiered visibility |
| Pass fields as JSON string | Pass objects to Zod schemas |
