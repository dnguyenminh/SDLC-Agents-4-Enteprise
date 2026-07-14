/**
 * OrchestrationGateway — abstraction (DIP) để ConvertToolResolver gọi tool động
 * mà không phụ thuộc trực tiếp OrchestrationModule. (Design R2/NFR-2)
 */
import type { ToolHandler } from '../../../types/tool.js';

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

export interface OrchestrationGateway {
  findTools(query: string, opts?: { threshold?: number; top_k?: number }): Promise<ToolDescriptor[]>;
  executeDynamicTool(toolName: string, args: Record<string, unknown>): Promise<string>;
}

/** Gateway rỗng — luôn không có tool (dùng khi orchestration chưa sẵn sàng). */
export class NullOrchestrationGateway implements OrchestrationGateway {
  async findTools(): Promise<ToolDescriptor[]> { return []; }
  async executeDynamicTool(): Promise<string> { throw new Error('No orchestration gateway available'); }
}

interface RegistryLike { getToolHandlers(): Map<string, ToolHandler>; }

/** Adapter thực tế: gọi handler find_tools / execute_dynamic_tool qua ModuleRegistry (lazy). */
export class RegistryOrchestrationGateway implements OrchestrationGateway {
  constructor(private readonly registry: RegistryLike) {}

  async findTools(query: string, opts?: { threshold?: number; top_k?: number }): Promise<ToolDescriptor[]> {
    const handler = this.registry.getToolHandlers().get('find_tools');
    if (!handler) { return []; }
    const res = await handler({ query, threshold: opts?.threshold ?? 0.4, top_k: opts?.top_k ?? 5 });
    const text = this.firstText(res);
    if (!text) { return []; }
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed?.tools) ? parsed.tools as ToolDescriptor[] : [];
    } catch { return []; }
  }

  async executeDynamicTool(toolName: string, args: Record<string, unknown>): Promise<string> {
    const handler = this.registry.getToolHandlers().get('execute_dynamic_tool');
    if (!handler) { throw new Error('execute_dynamic_tool handler unavailable'); }
    const res = await handler({ toolName, arguments: args });
    if (res?.isError) { throw new Error(this.firstText(res) || `tool ${toolName} error`); }
    return this.firstText(res) ?? '';
  }

  private firstText(res: any): string | undefined {
    const c = res?.content;
    if (Array.isArray(c)) {
      const t = c.find((x: any) => x?.type === 'text');
      if (t && typeof t.text === 'string') { return t.text; }
    }
    return undefined;
  }
}
