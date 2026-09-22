import type { IPiProvider, PiRunInput } from './pi-provider.js';
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

    // Contract: provider.run() (real Agent) — prompt + subscribe events, not generator.
    // FIX A: forward provider/model resolved by the engine down to the provider.
    const runInput: PiRunInput = {
      prompt: input.messages[input.messages.length - 1].content,
      sessionId: input.sessionId,
      tools: input.tools as PiRunInput['tools'],
      provider: input.provider,
      model: input.model,
    };

    let runResult;
    try {
      runResult = await this.provider.run(runInput);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const code = (err && typeof err === 'object' && 'code' in err && typeof err.code === 'string') ? err.code : 'PI_EXECUTION_ERROR';
      return buildErrorResult(input, code, message);
    }

    const streamChunks: StreamChunk[] = (runResult.chunks || []) as StreamChunk[];
    const toolCalls: NormalizedToolCall[] = (runResult.toolCalls || []).map(tc => normalizeToolCall(tc));

    const updatedMessages = [...input.messages];
    if (runResult.errorMessage) {
      return {
        ticketKey: input.ticketKey,
        sessionId: input.sessionId,
        agentId: input.agentId,
        messages: updatedMessages,
        toolCalls,
        streamChunks,
        error: { code: 'PI_EXECUTION_ERROR', message: runResult.errorMessage },
      };
    }

    if (runResult.text) {
      updatedMessages.push({ role: 'assistant', content: runResult.text });
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
  }
}
