/**
 * Compact event persistence to the Backend KB (SA4E-182, EF-03).
 * Non-blocking, best-effort — KB failure is acceptable.
 */

import type { CompactEvent, CompactMethod, CompactTrigger, ChatMessage } from '../types';
import type { ContextManagerReader, KnowledgeClient } from './contracts';

/** Persist compact event to KB (non-blocking, best-effort). */
export function persistCompactEventAsync(
  deps: { knowledgeClient: KnowledgeClient | null; contextManager: ContextManagerReader },
  threadId: string,
  trigger: CompactTrigger,
  method: CompactMethod,
  before: { tokenCount: number },
  chatHistory: ChatMessage[],
  summary: string
): void {
  if (!deps.knowledgeClient) return;
  const event: CompactEvent = {
    id: crypto.randomUUID(),
    threadId,
    trigger,
    method,
    beforeTokens: before.tokenCount,
    afterTokens: deps.contextManager.getState().tokenCount,
    beforeMessageCount: chatHistory.length,
    summary,
    createdAt: new Date().toISOString(),
  };
  writeCompactEvent(deps.knowledgeClient, event).catch(() => {
    // Non-blocking: KB failure is acceptable (EF-03)
  });
}

/** Write compact event to KB thread */
async function writeCompactEvent(knowledgeClient: KnowledgeClient, event: CompactEvent): Promise<void> {
  await knowledgeClient.createMessage(event.threadId, {
    role: 'system',
    content: JSON.stringify({ type: 'compact_event', ...event }),
    agent_id: 'compact-service',
  });
}
