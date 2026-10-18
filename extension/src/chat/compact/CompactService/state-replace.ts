/**
 * Compact atomic state replacement via graph.updateState (SA4E-182, AD-03).
 */

import type { ChatMessage } from '../types';
import type { StateGraph } from './contracts';

/** Atomic state replacement via graph.updateState (AD-03) */
export async function replaceChatState(
  graph: StateGraph,
  threadId: string,
  newHistory: ChatMessage[]
): Promise<void> {
  await graph.updateState(
    { configurable: { thread_id: threadId } },
    {
      chatHistory: newHistory,
      agentScratchpad: [],
      toolCalls: null,
      toolResults: [],
      agentIterations: 0,
    }
  );
}
