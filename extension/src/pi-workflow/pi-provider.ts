/**
 * Pi Provider — SA4E-290
 * Abstraction layer for @earendil-works/pi-agent-core SDK
 * Implements provider contract compatible with existing LLM provider interface
 */

export interface PiProviderConfig {
  transportType: 'WebSocket' | 'HTTP';
  sessionId?: string;
  baseUrl?: string;
}

export interface PiInput {
  agentId: string;
  messages: Array<{ role: string; content: string }>;
  tools?: unknown[];
}

export interface PiStreamChunk {
  type: 'text' | 'tool_use' | 'done';
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  result: unknown;
  isError?: boolean;
}

/** Minimal PiAgent type from SDK */
export interface PiAgent {
  sessionId: string;
  id: string;
  stream(input: PiInput): AsyncIterable<PiStreamChunk>;
  handleToolUse(toolCall: ToolCall): Promise<ToolResult>;
}

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

export class PiInitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PiInitError';
  }
}

/**
 * Pi Provider Interface
 * Compatible with existing LLM provider contract
 */
export interface PiProvider {
  readonly providerName: 'PiProvider';
  initialize(config: PiProviderConfig): Promise<void>;
  createAgent(agentId: string, tools?: unknown[]): Promise<PiAgent>;
  stream(input: PiInput): AsyncIterable<PiStreamChunk>;
  handleToolUse(toolCall: ToolCall): Promise<ToolResult>;
}

/**
 * Implementation stub for Pi Provider
 * Uses dynamic import to avoid hard dependency at module load time
 */
export class PiProviderImpl implements PiProvider {
  readonly providerName = 'PiProvider' as const;
  private config?: PiProviderConfig;
  private agent?: PiAgent;
  private piSessionId?: string;

  async initialize(config: PiProviderConfig): Promise<void> {
    if (!config || !config.transportType) {
      throw new ConfigurationError('Pi Provider configuration missing transportType');
    }
    if (!['WebSocket', 'HTTP'].includes(config.transportType)) {
      throw new ConfigurationError(`Invalid transport type: ${config.transportType}. Must be WebSocket or HTTP`);
    }
    this.config = config;

    try {
      const mod = await import('@earendil-works/pi-agent-core');
      const PiAgent = (mod as any).PiAgent || (mod as any).default?.PiAgent;
      if (!PiAgent) throw new Error('PiAgent export not found');
      const sessionId = config.sessionId ?? `pi_sess_${Date.now()}`;
      this.piSessionId = sessionId;
      // Store SDK class for real agent creation
      (this as any).PiAgentClass = PiAgent;
    } catch (err) {
      console.warn('[PiProvider] SDK not available, using stub. Error:', err);
      const sessionId = config.sessionId ?? `pi_sess_stub_${Date.now()}`;
      this.piSessionId = sessionId;
      (this as any).PiAgentClass = null;
    }
  }

  async createAgent(agentId: string, tools?: unknown[]): Promise<PiAgent> {
    if (!this.config) {
      throw new ConfigurationError('Pi Provider not initialized');
    }
    if (!agentId || agentId.trim() === '') {
      throw new ConfigurationError('agentId must be non-empty');
    }

    const PiAgentClass = (this as any).PiAgentClass;
    if (PiAgentClass) {
      try {
        const agent = await PiAgentClass.create({
          agentId,
          transport: this.config.transportType,
          baseUrl: this.config.baseUrl,
          sessionId: this.piSessionId,
          tools,
        });
        this.agent = agent as unknown as PiAgent;
        return this.agent;
      } catch (e) {
        console.warn('[PiProvider] SDK agent creation failed, falling back to stub', e);
      }
    }

    const agent: PiAgent = {
      sessionId: this.piSessionId ?? 'pi_sess_unknown',
      id: agentId,
      async *stream(input: PiInput) {
        yield { type: 'text', content: 'PiAgent stub response' };
        yield { type: 'done' };
      },
      async handleToolUse(toolCall: ToolCall): Promise<ToolResult> {
        return { toolCallId: toolCall.id, result: { stub: true } };
      },
    };
    this.agent = agent;
    return agent;
  }

  async *stream(input: PiInput): AsyncIterable<PiStreamChunk> {
    if (!this.agent) {
      throw new PiInitError('Agent not created');
    }
    yield* this.agent.stream(input);
  }

  async handleToolUse(toolCall: ToolCall): Promise<ToolResult> {
    if (!this.agent) {
      throw new PiInitError('Agent not created');
    }
    return this.agent.handleToolUse(toolCall);
  }

  getPiSessionId(): string | undefined {
    return this.piSessionId;
  }
}

/**
 * Factory for creating Pi Provider instance
 */
export function createPiProvider(): PiProviderImpl {
  return new PiProviderImpl();
}
