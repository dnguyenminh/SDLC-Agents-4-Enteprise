import { logger } from '../logger';
import { BudgetCalculator } from './context-budget';

export const COMPACT_USAGE_THRESHOLD = 0.95;
export const WARN_USAGE_THRESHOLD = 0.85;
export const COMPACT_TARGET_USAGE = 0.70;
export const COMPACTION_TIME_BUDGET_MS = 300;
export const QUALITY_RETENTION_FLOOR = 0.9;
export const RECENT_MESSAGES_KEPT = 2;

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
}

export interface CompactionSummary {
  intent: string;
  toolsUsed: string[];
  lastResponse: string;
}

export type CompactionAction = 'compact' | 'warn' | 'none';

export interface CompactableSession {
  modelId: string;
  contextWindow: number;
  usage: number;
  messages: SessionMessage[];
  summary?: CompactionSummary;
}

export interface CompactionResult {
  session: CompactableSession;
  action: CompactionAction;
  summary?: CompactionSummary;
  tokensSaved: number;
  usageAfter: number;
  latencyMs: number;
  qualityScore: number;
  truncated: boolean;
}

export class SessionMonitor {
  static shouldCompact(usage: number): CompactionAction {
    if (typeof usage !== 'number' || !Number.isFinite(usage)) {
      return 'none';
    }
    if (usage >= COMPACT_USAGE_THRESHOLD) {
      return 'compact';
    }
    return usage >= WARN_USAGE_THRESHOLD ? 'warn' : 'none';
  }
}

export class Summarizer {
  summarize(messages: SessionMessage[], previous?: CompactionSummary): CompactionSummary {
    const firstUser = messages.find((m) => m.role === 'user');
    const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
    const tools = new Set<string>(previous?.toolsUsed ?? []);
    Summarizer.collectToolNames(messages, tools);
    return {
      intent: previous?.intent || Summarizer.truncate(firstUser?.content, 150),
      toolsUsed: Array.from(tools),
      lastResponse: Summarizer.truncate(lastAssistant?.content ?? previous?.lastResponse ?? '', 250),
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

export function formatSummaryMessage(summary: CompactionSummary): SessionMessage {
  return {
    role: 'system',
    content: `[compaction] intent: ${summary.intent} | tools: ${summary.toolsUsed.join(',')} | lastResponse: ${summary.lastResponse}`,
  };
}

export class SessionCompactor {
  private readonly summarizer = new Summarizer();

  compact(session: CompactableSession): CompactionResult {
    const started = performance.now();
    const action = SessionMonitor.shouldCompact(session.usage);
    if (action !== 'compact') {
      if (action === 'warn') {
        logger.warn('Session usage warning - approaching compaction threshold', {
          modelId: session.modelId,
          usage: session.usage,
        });
      }
      return SessionCompactor.noopResult(session, action, started);
    }
    try {
      return this.compactNow(session, started);
    } catch (err) {
      logger.warn('COMPACT_FAIL - truncating session', {
        modelId: session.modelId,
        error: (err as Error).message,
      });
      return SessionCompactor.truncateResult(session, started);
    }
  }

  private compactNow(session: CompactableSession, started: number): CompactionResult {
    const summary = this.summarizer.summarize(session.messages, session.summary);
    const originalTokens = SessionCompactor.countTokens(session.messages);
    const kept: SessionMessage[] = [
      formatSummaryMessage(summary),
      ...session.messages.slice(-RECENT_MESSAGES_KEPT),
    ];
    const keptTokens = SessionCompactor.countTokens(kept);
    const usageAfter = SessionCompactor.estimateUsageAfter(session, keptTokens, originalTokens);
    return {
      session: { ...session, messages: kept, summary, usage: usageAfter },
      action: 'compact',
      summary,
      tokensSaved: Math.max(0, originalTokens - keptTokens),
      usageAfter,
      latencyMs: performance.now() - started,
      qualityScore: SessionCompactor.qualityScore(summary, session),
      truncated: false,
    };
  }

  static countTokens(messages: SessionMessage[]): number {
    return messages.reduce((sum, m) => sum + BudgetCalculator.estimateTokens(m.content.length), 0);
  }

  private static estimateUsageAfter(session: CompactableSession, keptTokens: number, originalTokens: number): number {
    if (originalTokens <= 0) {
      return Math.min(session.usage, 1);
    }
    return Math.min(1, Math.max(0, session.usage * (keptTokens / originalTokens)));
  }

  private static qualityScore(summary: CompactionSummary, session: CompactableSession): number {
    const checks: boolean[] = [];
    const hasUser = session.messages.some((m) => m.role === 'user') || !!session.summary?.intent;
    if (hasUser) {
      checks.push(summary.intent.length > 0);
    }
    if (session.messages.some((m) => m.toolName) || (session.summary?.toolsUsed.length ?? 0) > 0) {
      checks.push(summary.toolsUsed.length > 0);
    }
    const hasAssistant = session.messages.some((m) => m.role === 'assistant') || !!session.summary?.lastResponse;
    if (hasAssistant) {
      checks.push(summary.lastResponse.length > 0);
    }
    if (checks.length === 0) {
      return 1;
    }
    return checks.filter(Boolean).length / checks.length;
  }

  private static noopResult(session: CompactableSession, action: CompactionAction, started: number): CompactionResult {
    return {
      session,
      action,
      tokensSaved: 0,
      usageAfter: session.usage,
      latencyMs: performance.now() - started,
      qualityScore: 1,
      truncated: false,
    };
  }

  private static truncateResult(session: CompactableSession, started: number): CompactionResult {
    const kept = session.messages.slice(-RECENT_MESSAGES_KEPT);
    return {
      session: { ...session, messages: kept },
      action: 'compact',
      tokensSaved: 0,
      usageAfter: Math.min(session.usage, 1),
      latencyMs: performance.now() - started,
      qualityScore: 0,
      truncated: true,
    };
  }
}
