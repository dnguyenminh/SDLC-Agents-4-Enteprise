import { describe, it, expect } from 'vitest';
import { TaskDecomposer } from '../../task-decomposer';

function files(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `src/file${i}.ts`);
}

describe('TaskDecomposer.decompose', () => {
  const decomposer = new TaskDecomposer();

  it('TC-001: splits files into batches of 20', () => {
    const batches = decomposer.decompose('explain architecture', files(45));
    expect(batches).toHaveLength(3);
    expect(batches[0].files).toHaveLength(20);
    expect(batches[1].files).toHaveLength(20);
    expect(batches[2].files).toHaveLength(5);
    batches.forEach((batch) => {
      expect(batch.maxTokens).toBe(4000);
      expect(batch.subQuery).toContain('explain architecture');
    });
  });

  it('TC-001: every file is covered exactly once across batches', () => {
    const input = files(50);
    const batches = decomposer.decompose('query', input);
    const all = batches.flatMap((batch) => batch.files);
    expect(all).toHaveLength(50);
    expect(new Set(all).size).toBe(50);
  });

  it('TC-704: duplicate files are removed before batching', () => {
    const input = [
      'src/a.ts',
      'src/A.ts'.toLowerCase(),
      'src\\a.ts',
      'src/b.ts',
    ];
    const batches = decomposer.decompose('query', input);
    const all = batches.flatMap((batch) => batch.files);
    expect(all).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('DECOMPOSE_FAIL: falls back to a single batch on invalid batchSize', () => {
    const batches = decomposer.decompose('query', files(30), { batchSize: 0 });
    expect(batches).toHaveLength(1);
    expect(batches[0].id).toBe('batch-1');
    expect(batches[0].files).toHaveLength(30);
  });

  it('DECOMPOSE_FAIL: falls back to a single batch when files is null', () => {
    const batches = decomposer.decompose('query', null as any);
    expect(batches).toHaveLength(1);
    expect(batches[0].files).toEqual([]);
  });

  it('returns empty list when there are no files', () => {
    expect(decomposer.decompose('query', [])).toEqual([]);
  });

  it('respects custom batchSize', () => {
    const batches = decomposer.decompose('query', files(10), { batchSize: 4 });
    expect(batches.map((b) => b.files.length)).toEqual([4, 4, 2]);
  });

  it('NFR: decomposition of 5000 files completes under 200ms', () => {
    const input = files(5000);
    const started = Date.now();
    decomposer.decompose('explain architecture', input);
    expect(Date.now() - started).toBeLessThan(200);
  });
});
