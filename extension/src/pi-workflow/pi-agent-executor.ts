import { PiProvider, PiStreamChunk } from './pi-provider';
import { logger, Logger } from '../logger';

export interface ExecuteTurnInput {
  ticketKey: string;
  sessionId: string;
  agentId: string;
  messages: Array<{ role: string; content: string }>;
  tools?: unknown[];
}

export interface NormalizedToolCall {
  toolUseId: string;
  toolName: string;
  input: unknown;
}

export interface PiAgentExecutionResult {
  ticketKey: string;
  sessionId: string;
  agentId: string;
  messages: Array<{ role: string; content: string }>;
  toolCalls: NormalizedToolCall[];
  streamChunks: PiStreamChunk[];
  error?: { code: string; message: string };
  piSessionId?: string;
  toolCallCount?: number;
}

export interface IPiAgentExecutor {
  execute(piState: any, userInput: any): Promise<any>;
}

export class PiAgentExecutor implements IPiAgentExecutor {
  private readonly log: Logger;
  private static readonly TICKET_REGEX = /^[A-Z0-9]+-\d+$/;

  constructor(private provider?: PiProvider, loggerInstance?: Logger) {
    this.log = loggerInstance ?? logger;
  }

  async execute(piState: any, userInput: any): Promise<any> {
    const input: ExecuteTurnInput = {
      ticketKey: piState.ticket ?? piState.ticketKey ?? 'UNKNOWN-0',
      sessionId: piState.sessionId ?? piState.piSessionId ?? '',
      agentId: piState.agentId ?? piState.currentAgentId ?? 'default',
      messages: Array.isArray(userInput?.messages) ? userInput.messages : [{ role: 'user', content: String(userInput ?? '') }],
      tools: piState.tools ?? [],
    };
    const result = await this.executeTurn(input);
    return {
      ...piState,
      ...result,
      toolCalls: result.toolCalls?.length ?? 0,
      metadata: { ...piState.metadata, needsApproval: (result.toolCalls?.length ?? 0) > 0 },
      sessionId: result.sessionId,
      phase: piState.phase,
      status: result.error ? 'error' : 'running',
    };
  }

  async executeTurn(input: ExecuteTurnInput): Promise<PiAgentExecutionResult> {
    const start = Date.now();
    this.log.info('PiAgentExecutor.executeTurn.start', {
      ticketKey: input.ticketKey,
      agentId: input.agentId,
      sessionId: input.sessionId,
    });

    const validation = this.validateInput(input);
    if (!validation.valid) {
      return this.buildErrorResult(input, 'INVALID_INPUT', validation.message!);
    }

    try {
      let result: Omit<PiAgentExecutionResult, 'piSessionId'>;
      if (this.provider) {
        await this.provider.createAgent(input.agentId, input.tools);
        result = await this.runStream(input);
      } else {
        result = {
          ticketKey: input.ticketKey,
          sessionId: input.sessionId,
          agentId: input.agentId,
          messages: input.messages,
          toolCalls: [],
          streamChunks: [],
          toolCallCount: 0,
        };
      }
      const duration = Date.now() - start;
      this.log.info('PiAgentExecutor.executeTurn.success', {
        ticketKey: input.ticketKey,
        agentId: input.agentId,
        durationMs: duration,
        toolCallCount: result.toolCalls.length,
      });
      return { ...result, piSessionId: (this.provider as any)?.getPiSessionId?.() };
    } catch (e) {
      const duration = Date.now() - start;
      const msg = e instanceof Error ? e.message : String(e);
      const code = msg.toLowerCase().includes('timeout') ? 'PI_TIMEOUT' : 'PI_ERROR';
      this.log.error('PiAgentExecutor.executeTurn.error', {
        ticketKey: input.ticketKey,
        agentId: input.agentId,
        durationMs: duration,
        error: msg,
      });
      return this.buildErrorResult(input, code, msg);
    }
  }

  private validateInput(input: ExecuteTurnInput) {
    if (!PiAgentExecutor.TICKET_REGEX.test(input.ticketKey)) {
      return { valid: false, message: 'ticketKey must match [A-Z0-9]+-\\d+' };
    }
    if (!input.sessionId || input.sessionId.trim() === '') {
      return { valid: false, message: 'sessionId non-empty' };
    }
    if (!Array.isArray(input.messages) || input.messages.length === 0) {
      return { valid: false, message: 'messages non-empty array' };
    }
    return { valid: true };
  }

  private async runStream(input: ExecuteTurnInput): Promise<Omit<PiAgentExecutionResult, 'piSessionId'>> {
    const streamChunks: PiStreamChunk[] = [];
    const toolCalls: NormalizedToolCall[] = [];
    const updatedMessages = [...input.messages];

    const inputPayload = { agentId: input.agentId, messages: input.messages, tools: input.tools };

    if (this.provider) {
      for await (const chunk of this.provider.stream(inputPayload)) {
        streamChunks.push(chunk);
        if (chunk.type === 'tool_use' && chunk.toolCall) {
          const normalized = this.normalizeToolUse(chunk.toolCall);
          if (normalized) toolCalls.push(normalized);
        }
        if (chunk.type === 'text' && chunk.content) {
          updatedMessages.push({ role: 'assistant', content: chunk.content });
        }
      }
    }

    return {
      ticketKey: input.ticketKey,
      sessionId: input.sessionId,
      agentId: input.agentId,
      messages: updatedMessages,
      toolCalls,
      streamChunks,
      toolCallCount: toolCalls.length,
    };
  }

  private normalizeToolUse(toolCall: { id: string; name: string; arguments: Record<string, unknown> }): NormalizedToolCall | null {
    if (!toolCall.id || !toolCall.name) {
      this.log.warn('PiAgentExecutor.normalizeToolUse.invalid', { toolCall });
      return null;
    }
    return {
      toolUseId: String(toolCall.id),
      toolName: String(toolCall.name),
      input: toolCall.arguments,
    };
  }

  private buildErrorResult(input: ExecuteTurnInput, code: string, message: string): PiAgentExecutionResult {
    return {
      ticketKey: input.ticketKey,
      sessionId: input.sessionId,
      agentId: input.agentId,
      messages: input.messages,
      toolCalls: [],
      streamChunks: [],
      error: { code, message },
      toolCallCount: 0,
    };
  }
}
