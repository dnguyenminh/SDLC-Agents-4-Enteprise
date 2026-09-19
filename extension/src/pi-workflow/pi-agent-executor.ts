import type { IPiProvider } from './pi-provider.js';
import type { ExecuteTurnInput, PiAgentExecutionResult, NormalizedToolCall, StreamChunk } from './types/executor.types.js';
import { normalizeToolCall } from './utils/tool-normalizer.js';

const TICKET_KEY_REGEX = /^[A-Z0-9]+-\d+$/i;

function validateInput(input: ExecuteTurnInput): string | null {
  if (!input || !input.ticketKey || !TICKET_KEY_REGEX.test(input.ticketKey)) {
    return 'ticketKey is required and must be in format KEY-123';
  }
  if (!input.sessionId || input.sessionId.trim() === '') {
    return 'sessionId is required and cannot be empty';
  }
  if (!input.agentId || input.agentId.trim() === '') {
    return 'agentId is required and cannot be empty';
  }
  if (!input.messages || !Array.isArray(input.messages) || input.messages.length === 0) {
    return 'messages is required and must not be empty';
  }
  return null;
}

function buildErrorResult(input: ExecuteTurnInput, code: string, message: string): PiAgentExecutionResult {
  return {
    ticketKey: input?.ticketKey || '',
    sessionId: input?.sessionId || '',
    agentId: input?.agentId || '',
    messages: input?.messages || [],
    toolCalls: [],
    streamChunks: [],
    error: { code, message },
  };
}

export class PiAgentExecutor {
  constructor(private provider: IPiProvider) {}

  async executeTurn(input: ExecuteTurnInput): Promise<PiAgentExecutionResult> {
    const validationError = validateInput(input);
    if (validationError) {
      return buildErrorResult(input, 'INVALID_INPUT', validationError);
    }

    const toolCalls: NormalizedToolCall[] = [];
    const streamChunks: StreamChunk[] = [];
    const updatedMessages = [...input.messages];

    try {
      await this.provider.createAgent(input.agentId, input.tools);
      const prompt = input.messages[input.messages.length - 1].content;
      let responseText = '';

      for await (const chunk of this.provider.stream({ prompt })) {
        streamChunks.push(chunk as StreamChunk);
        if (chunk.type === 'text' && chunk.content) {
          responseText += chunk.content;
        } else if (chunk.type === 'tool_call' && chunk.toolCall) {
          toolCalls.push(normalizeToolCall(chunk.toolCall as any));
        } else if (chunk.type === 'error' && chunk.error) {
          return {
            ticketKey: input.ticketKey,
            sessionId: input.sessionId,
            agentId: input.agentId,
            messages: updatedMessages,
            toolCalls,
            streamChunks,
            error: { code: 'PI_EXECUTION_ERROR', message: chunk.error },
          };
        }
      }

      if (responseText) {
        updatedMessages.push({ role: 'assistant', content: responseText });
      }

      return {
        ticketKey: input.ticketKey,
        sessionId: input.sessionId,
        agentId: input.agentId,
        messages: updatedMessages,
        toolCalls,
        streamChunks,
        piSessionId: input.sessionId,
        toolCallCount: toolCalls.length,
      };
    } catch (err: any) {
      return buildErrorResult(input, err?.code || 'PI_EXECUTION_ERROR', err?.message || String(err));
    }
  }
}
