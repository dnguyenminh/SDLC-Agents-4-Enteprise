import type { NormalizedToolCall } from '../types/executor.types.js';

export function normalizeToolCall(rawCall: {
  id?: string;
  tool_use_id?: string;
  name?: string;
  tool_name?: string;
  arguments?: Record<string, unknown>;
  input?: Record<string, unknown>;
}): NormalizedToolCall {
  const id = rawCall.id || rawCall.tool_use_id || `tc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const name = rawCall.name || rawCall.tool_name || 'unknown_tool';
  const args = rawCall.arguments || rawCall.input || {};
  return { id, name, arguments: args };
}
