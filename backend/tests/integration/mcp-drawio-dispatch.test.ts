/**
 * Integration Tests — execute_dynamic_tool dispatching to drawio_export_png.
 * Verifies the full MCP tool dispatch path using in-memory transport.
 * Extension is NOT involved — this tests backend-only logic.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import pino from 'pino';
import { ModuleRegistry } from '../../src/modules/ModuleRegistry.js';
import { connectMcp, type McpHarness } from '../../src/__tests__/sa4e-testkit.js';
import {
  handleDrawioExportPng,
  DRAWIO_EXPORT_PNG_DEFINITION,
  resetRendererCache,
} from '../../src/engine/tools/drawio-export-png.js';
import type { IModule, ModuleStatus } from '../../src/types/module.js';
import type { ToolHandler, ToolDefinition } from '../../src/types/tool.js';

const SAMPLE_DRAWIO = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram name="Page-1" id="mcp-test">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="MCP Test" style="rounded=1;" vertex="1" parent="1">
          <mxGeometry x="100" y="50" width="140" height="70" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

const logger = pino({ level: 'silent' });

let tmpWorkspace: string;
let harness: McpHarness;
let registry: ModuleRegistry;

/** Lightweight stub for CodeIntelModule with real drawio handler. */
class CodeIntelStub implements IModule {
  readonly name = 'codeIntel';
  private _status: ModuleStatus = 'ready';
  constructor(private workspace: string) {}
  get status(): ModuleStatus { return this._status; }
  async initialize() {}
  async shutdown() {}
  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    handlers.set('drawio_export_png', async (args) => {
      const result = await handleDrawioExportPng(args, this.workspace);
      return { content: [{ type: 'text', text: result }], isError: false };
    });
    return handlers;
  }
  getToolDefinitions(): ToolDefinition[] {
    return [{ ...DRAWIO_EXPORT_PNG_DEFINITION, category: 'code' }];
  }
}

/** Lightweight stub for OrchestrationModule with real dispatch logic. */
class OrchestrationStub implements IModule {
  readonly name = 'orchestration';
  private _status: ModuleStatus = 'ready';
  constructor(private reg: ModuleRegistry) {}
  get status(): ModuleStatus { return this._status; }
  async initialize() {}
  async shutdown() {}
  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    handlers.set('execute_dynamic_tool', async (args) => {
      const toolName = (args as any).toolName || (args as any).tool_name;
      const toolArgs = (args as any).arguments || {};
      const allHandlers = this.reg.getToolHandlers();
      const handler = allHandlers.get(toolName);
      if (!handler) {
        return {
          content: [{ type: 'text', text: `Tool ${toolName} not found` }],
          isError: true,
        };
      }
      return handler(toolArgs);
    });
    return handlers;
  }
  getToolDefinitions(): ToolDefinition[] {
    return [{
      name: 'execute_dynamic_tool',
      description: 'Execute a dynamically discovered tool',
      inputSchema: {
        type: 'object',
        properties: {
          toolName: { type: 'string' },
          arguments: { type: 'object' },
        },
        required: ['toolName', 'arguments'],
      },
      category: 'orchestration',
    }];
  }
}

describe('MCP dispatch: execute_dynamic_tool → drawio_export_png', () => {
  beforeAll(async () => {
    tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mcp-drawio-'));
    process.env.CODE_INTEL_WORKSPACE = tmpWorkspace;

    registry = new ModuleRegistry(logger);
    registry.register(new CodeIntelStub(tmpWorkspace));
    registry.register(new OrchestrationStub(registry));

    harness = await connectMcp(registry);
  }, 15000);

  afterAll(async () => {
    await harness?.close();
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetRendererCache();
  });

  it.skip('TC-MCP-01: dispatches drawio_export_png successfully', async () => {
    const { isExportPngAvailable } = await import('../../src/engine/tools/drawio-export-png.js');
    if (!isExportPngAvailable()) { return; }

    const contentB64 = Buffer.from(SAMPLE_DRAWIO).toString('base64');
    const result = await harness.client.callTool({
      name: 'execute_dynamic_tool',
      arguments: {
        toolName: 'drawio_export_png',
        arguments: { content_base64: contentB64, file_path: 'mcp-test.drawio' },
      },
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as any[])[0]?.text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(true);
    expect(parsed.renderer).toBe('drawio-cli');
    expect(parsed.size_bytes).toBeGreaterThan(0);
  }, 30000);

  it('TC-MCP-02: returns error for missing content_base64', async () => {
    const result = await harness.client.callTool({
      name: 'execute_dynamic_tool',
      arguments: {
        toolName: 'drawio_export_png',
        arguments: { file_path: 'nonexistent.drawio' },
      },
    });

    const text = (result.content as any[])[0]?.text;
    const parsed = JSON.parse(text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('content_base64 is required');
  });

  it('TC-MCP-03: returns error for unknown tool', async () => {
    const result = await harness.client.callTool({
      name: 'execute_dynamic_tool',
      arguments: {
        toolName: 'nonexistent_tool',
        arguments: {},
      },
    });

    expect(result.isError).toBe(true);
    const text = (result.content as any[])[0]?.text;
    expect(text).toContain('not found');
  });
});
