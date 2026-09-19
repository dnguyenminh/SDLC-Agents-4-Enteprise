import type { PiProviderConfig } from './pi-provider-config.js';
import { debugLog, debugError } from '../debug-logger.js';

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

function isTestMode(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

export class PiProvider implements IPiProvider {
  readonly providerName = 'PiProvider' as const;
  private initialized = false;
  private config?: PiProviderConfig;
  private piSdkModule?: any;
  private warnedMissingSdk = false;

  /** SEC-289-01: expose SDK availability so callers can distinguish real vs stub mode. */
  get sdkAvailable(): boolean {
    return this.piSdkModule != null;
  }

  async initialize(config: PiProviderConfig): Promise<void> {
    if (!config || !config.transportType || !['WebSocket', 'HTTP'].includes(config.transportType)) {
      throw new Error('PI_CONFIG_INVALID: Invalid transport type');
    }
    // SEC-289-01/06: allowStub is only respected in test environments, never in production
    const safeConfig: PiProviderConfig = { ...config };
    if (safeConfig.allowStub && !isTestMode()) {
      delete safeConfig.allowStub;
    }
    this.config = safeConfig;

    try {
      this.piSdkModule = await import('@earendil-works/pi-agent-core').catch(() => null);
    } catch (err) {
      debugError('[PiProvider] Failed to import @earendil-works/pi-agent-core', err as Error);
      this.piSdkModule = null;
    }
    if (!this.piSdkModule) {
      debugLog('[PiProvider] @earendil-works/pi-agent-core SDK not available — running in stub mode.');
    }
    this.initialized = true;
  }

  private warnStubFallback(): void {
    if (this.warnedMissingSdk) return;
    this.warnedMissingSdk = true;
    debugLog('[PiProvider] pi-agent-core SDK not available, falling back to stub mode. Set up @earendil-works/pi-agent-core to use real AI.');
  }

  async createAgent(agentId: string, tools?: unknown[]): Promise<PiAgent> {
    if (!this.initialized) {
      throw new Error('PI_NOT_INITIALIZED: Provider must be initialized first');
    }
    if (!agentId || agentId.trim() === '') {
      throw new Error('PI_AGENT_CREATE_FAILED: agentId is required');
    }

    if (!this.piSdkModule) {
      if (!isTestMode() && !this.config?.allowStub) {
        throw new Error('PI_SDK_UNAVAILABLE: @earendil-works/pi-agent-core is required for agent creation.');
      }
      this.warnStubFallback();
      return { agentId, tools, sdkInstance: null };
    }

    let sdkInstance: unknown = null;
    if (typeof this.piSdkModule.createPiAgent === 'function') {
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

    // SEC-289-01: fail-closed if SDK missing outside of test mode
    if (!isTestMode() && !this.config?.allowStub) {
      throw new Error('PI_SDK_UNAVAILABLE: @earendil-works/pi-agent-core is required for real agent execution.');
    }

    this.warnStubFallback();
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

    // SEC-289-01: fail-closed if SDK missing outside of test mode
    if (!isTestMode() && !this.config?.allowStub) {
      throw new Error('PI_SDK_UNAVAILABLE: @earendil-works/pi-agent-core is required for tool execution.');
    }

    this.warnStubFallback();
    return {
      toolCallId: toolCall.id,
      result: { executed: true, tool: toolCall.name }
    };
  }
}
