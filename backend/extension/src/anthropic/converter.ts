import {
  KiroQResponse,
  KiroQToolUseBlock,
  SSEEvent,
  ContentBlockStartEvent,
} from './types';
import { logger } from '../logger';

/**
 * Convert a Kiro Q API response into a sequence of SSE events.
 *
 * CRITICAL (BR-1): The tool_use_id from the API response MUST be passed
 * through UNCHANGED. No new ID generation, no mapping, no transformation.
 */
export function convertResponseToSSEEvents(response: KiroQResponse): SSEEvent[] {
  const events: SSEEvent[] = [];

  response.content.forEach((block, index) => {
    if (block.type === 'tool_use') {
      // FIX: Use block.id directly - DO NOT generate new ID
      // OLD (buggy): id: generateToolUseId()  <- REMOVED
      // NEW (fixed): id: block.id             <- PASSTHROUGH

      logger.trace('tool_use_id passthrough', {
        originalId: block.id,
        toolName: block.name,
        blockIndex: index,
      });

      const startEvent: ContentBlockStartEvent = {
        type: 'content_block_start',
        index,
        content_block: {
          type: 'tool_use',
          id: block.id,        // PASSTHROUGH (BR-1)
          name: block.name,
          input: {},
        },
      };
      events.push(startEvent);

      // Stream tool input as delta
      events.push({
        type: 'content_block_delta',
        index,
        delta: {
          type: 'input_json_delta',
          partial_json: JSON.stringify(block.input),
        },
      });

      events.push({ type: 'content_block_stop', index });
    } else if (block.type === 'text') {
      events.push({
        type: 'content_block_start',
        index,
        content_block: { type: 'text' },
      });

      events.push({
        type: 'content_block_delta',
        index,
        delta: { type: 'text_delta', text: block.text },
      });

      events.push({ type: 'content_block_stop', index });
    }
  });

  events.push({ type: 'message_stop' });
  return events;
}

/**
 * Extract tool_use_ids from a Kiro Q response for history storage.
 * Returns the SAME ids that will be streamed to the client.
 *
 * CRITICAL (BR-2): These ids must EXACTLY match what convertResponseToSSEEvents produces.
 */
export function extractToolUseIds(response: KiroQResponse): string[] {
  return response.content
    .filter((block): block is KiroQToolUseBlock => block.type === 'tool_use')
    .map(block => block.id);  // Direct passthrough, no transformation
}

/**
 * Validate a tool_use_id format (BR-3).
 * Pattern: tooluse_[A-Za-z0-9]+
 */
export function validateToolUseId(id: unknown): id is string {
  if (typeof id !== 'string' || id.length === 0) {
    return false;
  }
  return /^tooluse_[A-Za-z0-9]+$/.test(id);
}
