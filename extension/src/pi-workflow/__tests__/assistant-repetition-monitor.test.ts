import { describe, it, expect } from 'vitest';
import { AssistantRepetitionMonitor } from '../assistant-repetition-monitor.js';

describe('AssistantRepetitionMonitor (v1.53.7 stream breaker)', () => {
  it('trips on the UAT 17/10 degeneration (file-name pair repeated hundreds of times)', () => {
    const monitor = new AssistantRepetitionMonitor();
    const pair =
      'extension/src/panels/plan-canvas/PlanCanvasPanel.test.ts, extension/src/panels/plan-canvas/plan-canvas-renderer.test.ts, ';
    let tripped = false;
    let pushes = 0;
    // The real run emitted ~500 repetitions (~71 KB); the breaker must trip
    // within the first few KB, not after minutes of generation.
    for (let i = 0; i < 600 && !tripped; i++) {
      tripped = monitor.push(pair);
      pushes++;
    }
    expect(tripped).toBe(true);
    expect(pushes * pair.length).toBeLessThan(5_000);
  });

  it('does not trip on varied legitimate content (file lists, prose)', () => {
    const monitor = new AssistantRepetitionMonitor();
    const lines = Array.from(
      { length: 400 },
      (_, i) => `extension/src/modules/module-${i}/handler-${i}.ts — exports ${i} helpers\n`
    );
    for (const line of lines) expect(monitor.push(line)).toBe(false);
  });

  it('handles repetition split across chunk boundaries', () => {
    const monitor = new AssistantRepetitionMonitor({ unitChars: 32, minRepeats: 8 });
    const text = 'abcdefghijklmnopqrstuvwxyz012345'.repeat(50);
    let tripped = false;
    for (let i = 0; i < text.length && !tripped; i += 7) {
      tripped = monitor.push(text.slice(i, i + 7));
    }
    expect(tripped).toBe(true);
  });

  it('keeps only the tail window in memory (bounded cost)', () => {
    const monitor = new AssistantRepetitionMonitor({ windowChars: 1200 });
    for (let i = 0; i < 50; i++) monitor.push('x'.repeat(100) + i);
    expect(monitor.windowLength).toBeLessThanOrEqual(1200);
  });

  it('ignores empty deltas and stays quiet below the minimum size', () => {
    const monitor = new AssistantRepetitionMonitor();
    expect(monitor.push('')).toBe(false);
    expect(monitor.push('short')).toBe(false);
  });

  it('does not trip on a moderately long border run (non-overlapping counting)', () => {
    const monitor = new AssistantRepetitionMonitor();
    // A ~200-char box-drawing border on ONE line is legit output: 200/64 ≈ 3
    // probe hits — far below the 20-repeat threshold.
    expect(monitor.push('─'.repeat(200))).toBe(false);
    expect(monitor.push('\nnext paragraph with real content\n')).toBe(false);
  });
});
