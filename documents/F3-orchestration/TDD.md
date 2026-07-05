# Technical Design Document (TDD)

## SA4E Orchestration — F3-ORCHESTRATION

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F3-ORCHESTRATION |
| Title | Orchestration Module — Technical Design |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related FSD | FSD-v1-F3-ORCHESTRATION.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initial TDD — architecture design from source |

---

## 1. Architecture Overview

### 1.1 High-Level Architecture

The Orchestration module follows a **Gateway + Proxy** pattern with two main components:

1. **OrchestrationModule** — IModule implementation, exposes 4 MCP tools, coordinates tool discovery and execution routing
2. **McpClientManager** — Manages lifecycle of child MCP server connections, proxies tool calls

![Architecture](diagrams/architecture.png)

### 1.2 Design Principles

| Principle | Application |
|-----------|-------------|
| Single Responsibility | OrchestrationModule=tool registration, McpClientManager=connection lifecycle |
| Strategy Pattern | Transport selection (HTTP, SSE, stdio) based on config |
| Facade Pattern | execute_dynamic_tool hides routing complexity from agents |
| Fail-Fast + Graceful | Connection timeout=10s (fail fast), continue startup (graceful) |
| Open/Closed | New servers added via config (no code changes) |

### 1.3 Key Design Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Vector search over keyword search | Natural language queries from agents — "search jira" matches "jira_search" |
| 2 | Child server priority over internal | Avoids accidentally routing to wrong handler on name collision |
| 3 | 10s connection timeout | Balance between slow server startup and blocking system init |
| 4 | Promise.allSettled for connections | One failed server doesn't block others |
| 5 | In-memory toolsToServer Map | O(1) routing lookup, no DB query on every execute |
| 6 | Full table scan for similarity | <200 tools total, vector index overkill, scan is fast enough |
| 7 | No automatic reconnection (current) | Simplicity; reconnection logic deferred to future iteration |

---

## 2. Component Design

### 2.1 Component Diagram

![Component](diagrams/component.png)

### 2.2 Module Structure

```
backend/src/modules/orchestration/
├── OrchestrationModule.ts    # IModule impl, tool handlers
└── McpClientManager.ts       # Child server connection manager
```

### 2.3 Class Design

#### OrchestrationModule

```typescript
class OrchestrationModule implements IModule {
  readonly name = 'orchestration';
  private _status: ModuleStatus;           // 'initializing' | 'ready' | 'stopped'
  private logger: Logger;                   // pino child logger
  private registry?: ModuleRegistry;        // For fallback tool routing
  private clientManager: McpClientManager;  // Child server manager

  // IModule lifecycle
  async initialize(): Promise<void>;       // Calls clientManager.initializeAll()
  async shutdown(): Promise<void>;         // Calls clientManager.shutdownAll()

  // Tool registration
  getToolHandlers(): Map<string, ToolHandler>;    // 4 tool handlers
  getToolDefinitions(): ToolDefinition[];          // 4 tool schemas
}
```

#### McpClientManager

```typescript
class McpClientManager {
  private clients: Map<string, Client>;           // serverName → MCP Client
  private toolsToServer: Map<string, string>;     // toolName → serverName
  private proxiedTools: ToolDefinition[];         // All tools from child servers
  private logger: Logger;

  // Lifecycle
  async initializeAll(): Promise<void>;           // Read config, connect all
  async shutdownAll(): Promise<void>;             // Close all clients

  // Routing
  ownsTool(toolName: string): boolean;            // Check if tool belongs to child
  async executeTool(toolName: string, args: any): Promise<any>;  // Proxy call
  getProxiedTools(): ToolDefinition[];            // List all proxied tools
}
```

---

## 3. Detailed Design

### 3.1 find_tools Implementation

```typescript
// Pseudocode for find_tools handler
async function findTools(args: { query: string, threshold?: number, top_k?: number }) {
  const limit = args.top_k || 5;

  // 1. Get MemoryModule DB access
  const memoryModule = registry.getModule('memory') as MemoryModule;
  const db = memoryModule.getEngine().getDb();

  // 2. Generate query embedding
  const queryVector = await EmbeddingService.getInstance().generateEmbedding(args.query);

  // 3. Load all tools from DB
  const rows = db.prepare('SELECT * FROM mcp_tools').all();

  // 4. Score each tool
  const scored = rows.map(row => ({
    name: row.name,
    description: row.description,
    schema: JSON.parse(row.schema_json),
    score: EmbeddingService.getInstance().cosineSimilarity(
      queryVector,
      Float32ArrayFromBlob(row.vector)
    )
  }));

  // 5. Sort and filter
  scored.sort((a, b) => b.score - a.score);
  return { tools: scored.slice(0, limit), query: args.query };
}
```

**Complexity:** O(n) where n = number of tools (max ~200). Full scan acceptable.

### 3.2 execute_dynamic_tool Implementation

```typescript
async function executeDynamicTool(args: { toolName?: string, tool_name?: string, arguments: any }) {
  const toolName = args.toolName || args.tool_name;
  const toolArgs = args.arguments || {};

  // Route 1: Child server owns this tool
  if (clientManager.ownsTool(toolName)) {
    try {
      return await clientManager.executeTool(toolName, toolArgs);
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Error proxying tool ${toolName}: ${err.message}` }] };
    }
  }

  // Route 2: Internal module handler
  const allHandlers = registry.getToolHandlers();
  const handler = allHandlers.get(toolName);
  if (handler) {
    try {
      return await handler(toolArgs);
    } catch (err) {
      logger.error({ err, toolName, toolArgs }, 'Failed to execute dynamic tool');
      return { isError: true, content: [{ type: 'text', text: `Error executing tool ${toolName}: ${err.message}` }] };
    }
  }

  // Route 3: Not found
  return { isError: true, content: [{ type: 'text', text: `Tool ${toolName} not found or not ready.` }] };
}
```

### 3.3 McpClientManager.initializeAll()

```typescript
async function initializeAll() {
  const configPath = path.resolve(workspacePath, cfg.dataDir, cfg.orchestrationConfigPath);
  if (!fs.existsSync(configPath)) {
    logger.warn('orchestration.json not found, skipping child servers');
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const servers = config.mcpServers || {};

  const connectPromises = Object.entries(servers).map(async ([serverName, serverConfig]) => {
    if (serverConfig.disabled) { logger.info({ serverName }, 'Skipping disabled'); return; }
    if (serverName === 'code-intelligence') { return; } // Skip self

    try {
      const client = new Client({ name: 'code-intel-orchestrator', version: '1.0.0' }, { capabilities: {} });
      const transport = selectTransport(serverConfig);
      if (!transport) { logger.warn({ serverName }, 'Unknown transport'); return; }

      // Connect with 10s timeout
      await Promise.race([
        client.connect(transport),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Connection timeout')), 10000))
      ]);

      this.clients.set(serverName, client);

      // Fetch tools
      const { tools } = await client.listTools();
      for (const tool of tools) {
        this.toolsToServer.set(tool.name, serverName);
        this.proxiedTools.push({ name: tool.name, description: tool.description || '', category: serverName, inputSchema: tool.inputSchema });
      }
      logger.info({ serverName, toolCount: tools.length }, 'Imported tools');
    } catch (err) {
      logger.error({ err: err.message, serverName }, 'Failed to connect');
    }
  });

  await Promise.allSettled(connectPromises);
}
```

### 3.4 Transport Selection Strategy

```typescript
function selectTransport(cfg: ServerConfig): Transport | null {
  if (cfg.type === 'httpStream' || cfg.transportType === 'httpStream') {
    return new StreamableHTTPClientTransport(new URL(cfg.url));
  }
  if (cfg.type === 'sse' || cfg.transportType === 'sse') {
    return new SSEClientTransport(new URL(cfg.url));
  }
  if (cfg.command) {
    return new StdioClientTransport({
      command: cfg.command,
      args: cfg.args || [],
      env: { ...process.env, ...(cfg.env || {}) }
    });
  }
  return null;
}
```

---

## 4. Error Handling Design

### 4.1 Error Categories

| Category | Handling | User Visibility |
|----------|----------|-----------------|
| Connection timeout | Log, skip server, continue | orchestration_status shows "disconnected" |
| Config missing | Log warn, no child servers | Module still ready (internal tools work) |
| Config parse error | Log error, no child servers | Module still ready |
| Tool not found | Return isError=true | Agent sees error message |
| Child server error | Catch, wrap, return isError=true | Agent sees "Error proxying" |
| Internal handler error | Catch, log, return isError=true | Agent sees "Error executing" |
| Embedding failed | Log, return empty | Agent sees empty tools list |
| DB access failed | Log, return empty | Agent sees empty tools list |

### 4.2 Error Response Format

All errors follow consistent MCP format:

```typescript
{
  content: [{ type: 'text', text: `Error context: ${error.message}` }],
  isError: true
}
```

---

## 5. Security Design

### 5.1 Threat Model

| Threat | Mitigation |
|--------|-----------|
| Malicious child server | Tools only accessible via explicit config; no auto-discovery |
| Argument injection | Arguments passed as-is (child server responsible for validation) |
| Tool name spoofing | toolsToServer mapping fixed at startup; no dynamic registration |
| Config tampering | orchestration.json is local file, protected by OS permissions |
| Excessive tool calls | toggle_tool allows disabling costly/dangerous tools |
| Information leakage | Error messages show tool name + generic error (no stack traces) |

### 5.2 Tool Isolation

- Each tool call is independent — no shared state between calls
- Child server failures don't crash OrchestrationModule
- One tool's timeout doesn't affect other tools

---

## 6. Performance Design

### 6.1 Startup Optimization

- All server connections run in **parallel** (Promise.allSettled)
- Failed connections don't block others (10s timeout each)
- Module reports "ready" as soon as initializeAll settles

### 6.2 Runtime Optimization

| Operation | Optimization | Expected Perf |
|-----------|-------------|---------------|
| find_tools | Full scan (n≤200) faster than index overhead | <100ms |
| execute routing | HashMap lookup (O(1)) | <1ms |
| Tool execution | Direct proxy, no transformation | Network bound |
| Embedding | Singleton ONNX, model pre-loaded | <50ms |

### 6.3 Memory Footprint

| Component | Estimated Size |
|-----------|---------------|
| clients Map (10 servers) | ~50KB |
| toolsToServer Map (200 tools) | ~10KB |
| proxiedTools array (200 items) | ~100KB |
| Total overhead | ~200KB |

---

## 7. Implementation Checklist

### 7.1 Files (Existing)

| # | File | Status | Description |
|---|------|--------|-------------|
| 1 | `backend/src/modules/orchestration/OrchestrationModule.ts` | EXISTS | Main module (4 tool handlers) |
| 2 | `backend/src/modules/orchestration/McpClientManager.ts` | EXISTS | Child server lifecycle |
| 3 | `.code-intel/orchestration.json` | EXISTS | Default child server config |
| 4 | `backend/tests/integration/mcp-tools.test.ts` | EXISTS | Integration tests |
| 5 | `backend/src/modules/orchestration/McpConfigRoutes.ts` | **CREATE** | REST API routes for config CRUD |
| 6 | `backend/src/modules/orchestration/McpConfigService.ts` | **CREATE** | Config file read/write/validate |

### 7.2 Improvement Opportunities

| # | Area | Current State | Improvement |
|---|------|---------------|-------------|
| 1 | orchestration_status | Returns static `{servers:[], status:'ready'}` | Return actual McpClientManager state |
| 2 | toggle_tool | Returns string, no persistence | Maintain disabled set, filter in find/execute |
| 3 | Reconnection | None | Periodic health check (30s interval) |
| 4 | Execution timeout | None | Promise.race with 30s on executeTool |
| 5 | Schema validation | None | Validate args against inputSchema before routing |
| 6 | **Config Persistence** | **None (read-only)** | **REST API for CRUD + atomic write** |

### 7.3 New Classes — MCP Config Persistence

#### McpConfigService

```typescript
class McpConfigService {
  constructor(configPath: string, clientManager: McpClientManager);

  async listServers(): Promise<ServerInfo[]>;
  async getServer(name: string): Promise<ServerConfig | null>;
  async addServer(config: ServerConfig): Promise<ServerInfo>;
  async updateServer(name: string, config: Partial<ServerConfig>): Promise<ServerInfo>;
  async removeServer(name: string): Promise<{ removed: string; tools_removed: number }>;
  async reconnectServer(name: string): Promise<ServerInfo>;

  private readConfig(): OrchestrationConfig;
  private writeConfig(config: OrchestrationConfig): void;  // atomic: tmp + rename
  private validateConfig(config: ServerConfig): ValidationError[];
}
```

#### McpConfigRoutes (Hono router)

```typescript
const mcpConfigRoutes = new Hono();

mcpConfigRoutes.get('/api/mcp-servers', listHandler);
mcpConfigRoutes.get('/api/mcp-servers/:name', getHandler);
mcpConfigRoutes.post('/api/mcp-servers', addHandler);
mcpConfigRoutes.put('/api/mcp-servers/:name', updateHandler);
mcpConfigRoutes.delete('/api/mcp-servers/:name', removeHandler);
mcpConfigRoutes.post('/api/mcp-servers/:name/reconnect', reconnectHandler);
```

**Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| REST API (not MCP tool) | Config is admin operation, not agent operation |
| Atomic file write | Prevent corruption on crash |
| Reconnect after save | Config change takes effect immediately |
| "code-intelligence" reserved | Prevent recursive self-connection |

### 7.4 Module Dependencies

| Module | Type | Required For |
|--------|------|--------------|
| MemoryModule (F1) | Runtime | DB access for mcp_tools vector search |
| EmbeddingService | Runtime | Query embedding generation |
| ModuleRegistry | Runtime | Internal tool handler fallback |
| BackendConfig | Startup | Workspace path, data directory |
| Hono App | Runtime | HTTP route registration for config API |

---

## 8. Testing Strategy

### 8.1 Unit Tests

| Test | Scope |
|------|-------|
| Transport selection | Config → correct transport class |
| Tool routing logic | ownsTool priority, fallback, not-found |
| find_tools scoring | Vectors → correct ranking |
| Parameter compat | toolName and tool_name both work |
| Disabled/self skip | disabled=true skipped, "code-intelligence" skipped |

### 8.2 Integration Tests

| Test | Scope |
|------|-------|
| End-to-end find_tools | Real ONNX model + mcp_tools table |
| execute via child | Mock child MCP server |
| Connection timeout | Unresponsive server (>10s) |
| Mixed startup | Some connect, some fail |

### 8.3 AI Agent Pattern Tests

| Test | Scope |
|------|-------|
| Discovery reliability | Consistent results for same query |
| Token efficiency | Response within budget |
| Graceful fallback | Child down → structured error |
| Two-step pattern | find_tools → execute end-to-end |

---

## 9. Appendix

### 9.1 Configuration Reference

```json
{
  "mcpServers": {
    "<server-name>": {
      "url": "http://host:port/mcp",
      "type": "httpStream|sse",
      "transportType": "httpStream|sse",
      "command": "npx",
      "args": ["package-name"],
      "env": { "KEY": "VALUE" },
      "disabled": false,
      "autoApprove": ["tool1", "tool2"]
    }
  }
}
```

### 9.2 Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
