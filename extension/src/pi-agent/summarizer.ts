import type { SessionMessage } from './session-compactor';

export interface CompactionSummary {
  intent: string;
  toolsUsed: string[];
  lastResponse: string;
}

/** SEC-330-01 — field caps for the summary carrier format. */
const INTENT_MAX_CHARS = 150;
const RESPONSE_MAX_CHARS = 250;
const TOOL_NAME_MAX_CHARS = 64;

/**
 * SEC-330-01 — forge-proof the pipe-delimited carrier format.
 * A user message containing `| tools: rm -rf |` used to forge summary
 * structure; newlines re-broke the single-line contract. All delimiters and
 * control characters are neutralized before the field enters the summary.
 */
export function sanitizeSummaryField(text: string, max: number): string {
  return text.replace(/[|\r\n\t]/g, ' ').slice(0, max);
}

export class Summarizer {
  summarize(messages: SessionMessage[], previous?: CompactionSummary): CompactionSummary {
    const firstUser = messages.find((m) => m.role === 'user');
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const tools = new Set<string>(previous?.toolsUsed ?? []);
    Summarizer.collectToolNames(messages, tools);
    return {
      intent: previous?.intent || Summarizer.truncate(firstUser?.content, INTENT_MAX_CHARS),
      toolsUsed: Array.from(tools),
      lastResponse: Summarizer.truncate(lastAssistant?.content ?? previous?.lastResponse ?? '', RESPONSE_MAX_CHARS),
    };
  }

  static collectToolNames(messages: SessionMessage[], into: Set<string>): void {
    for (const message of messages) {
      if (message.toolName) {
        into.add(message.toolName);
      }
    }
  }

  static truncate(text: string | undefined, max: number): string {
    const trimmed = (text ?? '').trim();
    return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
  }
}

/**
 * SEC-330-01 — the compaction summary must NOT be a `system`-role message:
 * raw user/assistant text re-labeled as system is a privilege-elevation
 * primitive (models treat system text as higher authority). The summary is
 * emitted as a `user`-role metadata note with the `[compaction]` provenance
 * prefix kept, and every field is delimiter-escaped + length-capped.
 */
export function formatSummaryMessage(summary: CompactionSummary): SessionMessage {
  const content =
    `[compaction] intent: ${sanitizeSummaryField(summary.intent, INTENT_MAX_CHARS)}` +
    ` | tools: ${summary.toolsUsed.map((t) => sanitizeSummaryField(t, TOOL_NAME_MAX_CHARS)).join(',')}` +
    ` | lastResponse: ${sanitizeSummaryField(summary.lastResponse, RESPONSE_MAX_CHARS)}`;
  return { role: 'user', content };
}
