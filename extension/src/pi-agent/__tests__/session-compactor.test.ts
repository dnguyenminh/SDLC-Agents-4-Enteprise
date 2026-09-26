import { describe, it, expect } from 'vitest';
import {
  COMPACT_TARGET_USAGE,
  CompactableSession,
  CompactionResult,
  RECENT_MESSAGES_KEPT,
  SessionCompactor,
  SessionMessage,
  SessionMonitor,
  Summarizer,
} from '../session-compactor';

// STC: TC-001 / TC-701 — Auto-compact at >=95% usage
// STC: TC-002 — Warn at >=85% usage
// STC: TC-003 / TC-702 — Summarize intent/tools/last response
// STC: TC-101 — 20-turn dialogue no intent loss
// FSD 12.2 — COMPACT_FAIL -> truncate; FSD 12.5 — compaction <300ms, quality >=90%

const msg = (role: SessionMessage['role'], content: string, toolName?: string): SessionMessage => ({
  role,
  content,
  toolName,
});

const buildSession = (messages: SessionMessage[], usage = 0.96): CompactableSession => ({
  modelId: 'llama3.1',
  contextWindow: 8192,
  usage,
  messages,
});

const twentyTurns = (): SessionMessage[] => {
  const messages: SessionMessage[] = [msg('user', 'Help me refactor the auth module')];
  for (let i = 1; i <= 19; i++) {
    messages.push(i % 2 === 1 ? msg('assistant', `Step ${i} of the refactoring plan`) : msg('user', `Continue with step ${i}`));
  }
  return messages;
};

describe('SessionMonitor', () => {
  it('TC-001: usage >=95% triggers compact', () => {
    expect(SessionMonitor.shouldCompact(0.95)).toBe('compact');
    expect(SessionMonitor.shouldCompact(0.99)).toBe('compact');
  });

  it('TC-002: usage >=85% and <95% warns', () => {
    expect(SessionMonitor.shouldCompact(0.85)).toBe('warn');
    expect(SessionMonitor.shouldCompact(0.90)).toBe('warn');
  });

  it('usage below 85% takes no action', () => {
    expect(SessionMonitor.shouldCompact(0.849)).toBe('none');
    expect(SessionMonitor.shouldCompact(Number.NaN)).toBe('none');
  });
});

describe('SessionCompactor', () => {
  const compactor = new SessionCompactor();

  it('TC-001/TC-701: compacts session at 96% usage', () => {
    const long = (text: string) => `${text} ${'conversation detail '.repeat(40)}`;
    const session = buildSession([
      msg('user', long('Original task intent')),
      msg('assistant', long('Intermediate answer')),
      msg('user', long('Follow up')),
      msg('assistant', long('Latest answer')),
    ]);
    const result = compactor.compact(session);
    expect(result.action).toBe('compact');
    expect(result.truncated).toBe(false);
    expect(result.tokensSaved).toBeGreaterThan(0);
    expect(result.session.messages).toHaveLength(1 + RECENT_MESSAGES_KEPT);
    expect(result.usageAfter).toBeLessThan(COMPACT_TARGET_USAGE + 0.01);
  });

  it('TC-002: 86% usage issues no compaction', () => {
    const session = buildSession([msg('user', 'hi')], 0.86);
    const result = compactor.compact(session);
    expect(result.action).toBe('warn');
    expect(result.session.messages).toHaveLength(1);
  });

  it('TC-003/TC-702: summary captures intent, tools and last response', () => {
    const session = buildSession([
      msg('user', 'Deploy the service'),
      msg('tool', 'tool output', 'deploy_tool'),
      msg('assistant', 'Deployment finished'),
    ]);
    const result = compactor.compact(session);
    expect(result.summary?.intent).toBe('Deploy the service');
    expect(result.summary?.toolsUsed).toContain('deploy_tool');
    expect(result.summary?.lastResponse).toBe('Deployment finished');
    expect(result.session.messages[0].content).toContain('[compaction] intent: Deploy the service');
  });

  it('TC-101: 20-turn dialogue compacts without intent loss, quality >=90%', () => {
    const result = compactor.compact(buildSession(twentyTurns()));
    expect(result.summary?.intent).toBe('Help me refactor the auth module');
    expect(result.qualityScore).toBeGreaterThanOrEqual(0.9);
    expect(result.session.messages).toHaveLength(1 + RECENT_MESSAGES_KEPT);
  });

  it('re-compaction preserves the original intent via merged summary', () => {
    const first = compactor.compact(buildSession(twentyTurns()));
    const second = compactor.compact({ ...first.session, usage: 0.96, messages: [...first.session.messages, msg('user', 'And also add tests')] });
    expect(second.summary?.intent).toBe('Help me refactor the auth module');
    expect(second.summary?.toolsUsed).toEqual(first.summary?.toolsUsed);
  });

  it('COMPACT_FAIL: falls back to truncation without throwing', () => {
    const evil = {
      role: 'user',
      get content(): string {
        throw new Error('unreadable message');
      },
    } as unknown as SessionMessage;
    const result = compactor.compact(buildSession([evil, msg('assistant', 'ok')]));
    expect(result.truncated).toBe(true);
    expect(result.qualityScore).toBe(0);
    expect(result.session.messages).toHaveLength(2);
  });

  it('FSD 12.5: compaction completes under 300ms', () => {
    const result: CompactionResult = compactor.compact(buildSession(twentyTurns()));
    expect(result.latencyMs).toBeLessThan(300);
  });
});

describe('Summarizer', () => {
  it('truncates long fields for small context windows', () => {
    const long = 'x'.repeat(500);
    const summary = new Summarizer().summarize([msg('user', long), msg('assistant', long)]);
    expect(summary.intent.length).toBeLessThanOrEqual(151);
    expect(summary.lastResponse.length).toBeLessThanOrEqual(251);
  });
});
