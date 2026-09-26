import { describe, it, expect } from 'vitest';
import {
  DEFAULT_GOLDEN_DATASET,
  EvalCase,
  EvalHarness,
  createSessionEvalRunner,
  keywordCoverage,
} from '../eval-harness';

// STC: TC-301 — Small eval >80% baseline large
// STC: TC-302 — Faithfulness + task success metrics reported
// STC: TC-102 / TC-703 / TC-704 — Eval harness runs real E2E pipeline

class InMemoryAgentSession {
  private turn = 0;

  async prompt(query: string): Promise<string> {
    this.turn += 1;
    if (query.includes('hello')) return 'Hello! How can I help you today?';
    if (query.includes('2 + 3')) return 'The result of 2 + 3 is 5.';
    if (query.includes('files')) return 'Here is the list of workspace files.';
    if (query.includes('function')) return 'function add(a: number, b: number) { return a + b; }';
    if (query.includes('intent')) return 'The intent of this conversation is to evaluate the assistant.';
    return `answer to: ${query}`;
  }

  get turns(): number {
    return this.turn;
  }
}

describe('keywordCoverage', () => {
  it('computes the fraction of expected keywords present', () => {
    expect(keywordCoverage('Hello World', ['hello'])).toBe(1);
    expect(keywordCoverage('partial match only', ['partial', 'missing'])).toBe(0.5);
    expect(keywordCoverage('anything', [])).toBe(1);
  });
});

describe('EvalHarness', () => {
  it('TC-301/TC-302: reports faithfulness and task success for a perfect runner', async () => {
    const runner = async (query: string) => {
      const map: Record<string, string> = {
        'Say hello to the user.': 'hello there',
        'What is 2 + 3? Answer with the number only.': 'the answer is 5',
        'List the files in the workspace.': 'workspace file listing',
        'Write a TypeScript function that adds two numbers.': 'function add',
        'Summarize the intent of this conversation.': 'the intent is clear',
      };
      return { answer: map[query] ?? '' };
    };
    const harness = new EvalHarness(runner, DEFAULT_GOLDEN_DATASET);
    const metrics = await harness.runEval('phi-3-mini');
    expect(metrics.total).toBe(5);
    expect(metrics.evaluated).toBe(5);
    expect(metrics.skipped).toBe(0);
    expect(metrics.faithfulness).toBe(1);
    expect(metrics.taskSuccess).toBe(1);
  });

  it('TC-302: partial coverage lowers faithfulness and task success', async () => {
    const dataset: EvalCase[] = [
      { id: 'a', query: 'q1', expectedIntent: 'x', expectedAnswerKeywords: ['alpha', 'beta'] },
      { id: 'b', query: 'q2', expectedIntent: 'y', expectedAnswerKeywords: ['gamma'] },
    ];
    const harness = new EvalHarness(
      async (query: string) => ({ answer: query === 'q1' ? 'alpha only' : 'gamma present' }),
      dataset
    );
    const metrics = await harness.runEval('phi-3-mini');
    expect(metrics.faithfulness).toBeCloseTo(0.75, 5);
    expect(metrics.taskSuccess).toBe(0.5);
  });

  it('EVAL_ERROR: failing case is skipped without failing the run', async () => {
    const dataset: EvalCase[] = [
      { id: 'ok', query: 'good', expectedIntent: 'x', expectedAnswerKeywords: ['fine'] },
      { id: 'boom', query: 'bad', expectedIntent: 'y', expectedAnswerKeywords: ['never'] },
    ];
    const harness = new EvalHarness(
      async (query: string) => {
        if (query === 'bad') throw new Error('provider timeout');
        return { answer: 'everything is fine' };
      },
      dataset
    );
    const metrics = await harness.runEval('phi-3-mini');
    expect(metrics.evaluated).toBe(1);
    expect(metrics.skipped).toBe(1);
    expect(metrics.taskSuccess).toBe(1);
  });

  it('TC-301: small model passes only above 80% of the large baseline', () => {
    const small = EvalHarness.buildMetrics('phi-3-mini', [], 0);
    small.taskSuccess = 0.9;
    const baseline = EvalHarness.buildMetrics('gpt-4o', [], 0);
    baseline.taskSuccess = 1;
    expect(EvalHarness.compareWithBaseline(small, baseline).pass).toBe(true);
    small.taskSuccess = 0.8;
    expect(EvalHarness.compareWithBaseline(small, baseline).pass).toBe(false);
  });

  it('TC-102/TC-703: runs the real session runner end to end', async () => {
    const session = new InMemoryAgentSession();
    const harness = new EvalHarness(createSessionEvalRunner(session));
    const metrics = await harness.runEval('phi-3-mini');
    expect(session.turns).toBe(5);
    expect(metrics.total).toBe(5);
    expect(metrics.taskSuccess).toBe(1);
    expect(metrics.faithfulness).toBe(1);
    expect(metrics.avgLatencyMs).toBeGreaterThanOrEqual(0);
  });

  it('aggregates tokens saved across cases', async () => {
    const dataset: EvalCase[] = [
      { id: 'a', query: 'q1', expectedIntent: 'x', expectedAnswerKeywords: ['ok'] },
      { id: 'b', query: 'q2', expectedIntent: 'y', expectedAnswerKeywords: ['ok'] },
    ];
    const harness = new EvalHarness(async () => ({ answer: 'ok', tokensSaved: 100 }), dataset);
    const metrics = await harness.runEval('phi-3-mini');
    expect(metrics.tokensSaved).toBe(200);
  });
});
