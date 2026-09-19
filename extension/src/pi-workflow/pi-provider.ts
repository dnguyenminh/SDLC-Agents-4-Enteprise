import type { PiProviderConfig } from './pi-provider-config.js';

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  error?: string;
}

export interface PiInput {
  prompt: string;
  context?: Record<string, unknown>;
}

export interface PiStreamChunk {
  type: 'text' | 'tool_call' | 'error' | 'done';
  content?: string;
  toolCall?: ToolCall;
  error?: string;
}

export interface PiAgent {
  agentId: string;
  tools?: unknown[];
  sdkInstance?: unknown;
}

export interface IPiProvider {
  readonly providerName: 'PiProvider';
  initialize(config: PiProviderConfig): Promise<void>;
  createAgent(agentId: string, tools?: unknown[]): Promise<PiAgent>;
  stream(input: PiInput): AsyncIterable<PiStreamChunk>;
  handleToolUse(toolCall: ToolCall): Promise<ToolResult>;
}

export class PiProvider implements IPiProvider {
  readonly providerName = 'PiProvider' as const;
  private initialized = false;
  private config?: PiProviderConfig;
  private piSdkModule?: any;

  async initialize(config: PiProviderConfig): Promise<void> {
    if (!config || !config.transportType || !['WebSocket', 'HTTP'].includes(config.transportType)) {
      throw new Error('PI_CONFIG_INVALID: Invalid transport type');
    }
    this.config = config;
    try {
      this.piSdkModule = await import('@earendil-works/pi-agent-core').catch(() => null);
    } catch {
      this.piSdkModule = null;
    }
    this.initialized = true;
  }

  async createAgent(agentId: string, tools?: unknown[]): Promise<PiAgent> {
    if (!this.initialized) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }
    if (!agentId || agentId.trim() === '') {
      throw new Error('PI_AGENT_CREATE_FAILED: agentId is required');
    }

    let sdkInstance: unknown = null;
    if (this.piSdkModule && typeof this.piSdkModule.createPiAgent === 'function') {
      sdkInstance = await this.piSdkModule.createPiAgent({
        agentId,
        tools,
        transport: this.config?.transportType,
        baseUrl: this.config?.baseUrl
      });
    }

    return { agentId, tools, sdkInstance };
  }

  async *stream(input: PiInput): AsyncIterable<PiStreamChunk> {
    if (!this.initialized) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }

    if (this.piSdkModule && typeof this.piSdkModule.stream === 'function') {
      const sdkStream = this.piSdkModule.stream({ prompt: input.prompt, context: input.context });
      for await (const chunk of sdkStream) {
        yield chunk as PiStreamChunk;
      }
      return;
    }

    yield { type: 'text', content: `Echo: ${input.prompt}` };
    yield { type: 'done' };
  }

  async handleToolUse(toolCall: ToolCall): Promise<ToolResult> {
    if (!this.initialized) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }

    if (this.piSdkModule && typeof this.piSdkModule.executeTool === 'function') {
      return await this.piSdkModule.executeTool(toolCall);
    }

    return {
      toolCallId: toolCall.id,
      result: { executed: true, tool: toolCall.name }
    };
  }
}
