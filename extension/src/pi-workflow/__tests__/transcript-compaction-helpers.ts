/**
 * Shared message builders + accessors for the transcript-compaction suites
 * (SA4E-355 TA review condition #2, commit 70a0a90).
 */
import type { Message } from '@earendil-works/pi-ai';

export const systemMsg = (content: string): Message =>
  ({ role: 'system', content, timestamp: 0 }) as Message;
export const userMsg = (text: string): Message =>
  ({ role: 'user', content: text, timestamp: 0 }) as Message;
export const asstText = (text: string): Message =>
  ({ role: 'assistant', content: [{ type: 'text', text }], timestamp: 0 }) as Message;
export const asstToolCall = (id: string): Message =>
  ({ role: 'assistant', content: [{ type: 'toolCall', id, name: 'read', arguments: { path: 'a' } }], timestamp: 0 }) as Message;
export const toolResult = (toolCallId: string, text: string): Message =>
  ({ role: 'toolResult', toolCallId, toolName: 'read', content: [{ type: 'text', text }], isError: false, timestamp: 0 }) as Message;

/** A text payload of exactly `tokens` tokens under the wire heuristic (chars/3). */
export const textOfTokens = (tokens: number): string => 'x'.repeat(tokens * 3);

/** One tool unit (assistant toolCall + its result) of ~5+`tokens` tokens. */
export const toolUnit = (id: string, tokens: number): Message[] =>
  [asstToolCall(id), toolResult(id, textOfTokens(tokens))];

/** Compressible payload: HTML comment + Tip boilerplate + an Example wall are strippable. */
export const compressible = (wallChars: number): string =>
  `Intro.\n\n<!-- internal note -->\n\nTip: boilerplate\n\nExample:\n${'e'.repeat(wallChars)}\n\n# Restored\n\nkeep me`;

export const resultIdsOf = (messages: Message[]): string[] =>
  messages
    .filter((m) => (m as { role?: string }).role === 'toolResult')
    .map((m) => (m as { toolCallId?: string }).toolCallId);

export const callIdsOf = (messages: Message[]): string[] =>
  messages
    .filter((m) => (m as { role?: string }).role === 'assistant')
    .flatMap((m) => ((m as { content?: Array<{ type?: string; id?: string }> }).content ?? []))
    .filter((b) => b.type === 'toolCall')
    .map((b) => b.id);

export const rolesOf = (messages: Message[]): string[] =>
  messages.map((m) => (m as { role?: string }).role);
