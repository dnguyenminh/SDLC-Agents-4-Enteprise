import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { ModuleRegistry } from '../modules/ModuleRegistry.js';
import type { Logger } from 'pino';
import pino from 'pino';
import { resolveCoreToolNames } from '../config/CoreTools.js';
import { trackToolUsage } from './toolUsageTracker.js';

const connectedTransports = new Set<any>();
const log = pino({ name: 'mcp-server' });

export function getMcpServer(registry: ModuleRegistry, logger: Logger): Server {
  const server = new Server({
    name: 'kiro-backend-mcp',
    version: '1.0.0',
  }, {
    capabilities: {
      tools: {}
    }
  });

  // Register tools from the registry
  const tools = registry.getAllToolDefinitions();
  const handlers = registry.getToolHandlers();

  // Resolve CORE allowlist once (SA4E-18); warn on unmatched core names (BR-04).
  const coreNames = resolveCoreToolNames(logger);
  const registered = new Set(tools.map(t => t.name));
  for (const name of coreNames) {
    if (!registered.has(name)) {
      logger.warn({ name }, 'CORE_TOOLS name has no registered tool — skipped (BR-04)');
    }
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const filtered = tools.filter(t => coreNames.has(t.name)); // BR-01
    return {
      tools: filtered.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema || { type: 'object', properties: {} }
      }))
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const handler = handlers.get(name);
    
    if (!handler) {
      return {
        content: [{ type: 'text', text: `Error: Unknown tool ${name}` }],
        isError: true,
      };
    }

    try {
      const result = await handler(args || {});
      
      // Track usage + auto-emit notifications for KB changes
      if (!result.isError) {
        trackToolUsage(registry, logger, name); // BR-07/BR-12: count only success
        if (name.includes('ingest') || name.includes('create')) {
          broadcastNotification('kb_entry_added', { tool: name });
        } else if (name.includes('update') || name.includes('modify')) {
          broadcastNotification('kb_entry_updated', { tool: name });
        } else if (name.includes('delete') || name.includes('remove')) {
          broadcastNotification('kb_entry_deleted', { tool: name });
        } else if (name.includes('tag')) {
          broadcastNotification('tag_created', { tool: name });
        }
      }
      
      return result as any;
    } catch (err: any) {
      logger.error({ err, tool: name }, 'Error executing MCP tool');
      return {
        content: [{ type: 'text', text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export function broadcastNotification(method: string, params?: any) {
  for (const transport of connectedTransports) {
    try {
      transport.send({
        jsonrpc: '2.0',
        method: `notifications/${method}`,
        params,
      });
    } catch (err) {
      log.warn({ err }, 'Failed to send broadcast notification to transport');
    }
  }
}

export function registerTransport(transport: any) {
  connectedTransports.add(transport);
  transport.onclose = () => {
    connectedTransports.delete(transport);
  };
}
