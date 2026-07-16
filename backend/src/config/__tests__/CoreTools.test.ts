/**
 * UT-01..05 — CoreTools.resolveCoreToolNames unit tests (SA4E-18).
 * Technique: mutate the exported CORE_TOOLS array contents (reference type)
 * to exercise valid/empty/dup/invalid/unknown allowlist scenarios, then
 * restore the original contents after each test.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CORE_TOOLS, META_TOOLS, resolveCoreToolNames } from '../CoreTools.js';

const META = [...META_TOOLS];
let original: string[];

function setCore(entries: string[]): void {
  (CORE_TOOLS as string[]).length = 0;
  (CORE_TOOLS as string[]).push(...entries);
}

beforeEach(() => { original = [...CORE_TOOLS]; });
afterEach(() => { setCore(original); });

describe('CoreTools.resolveCoreToolNames', () => {
  it('UT-01: valid CORE set resolves to exactly 10 names', () => {
    const set = resolveCoreToolNames();
    expect(set).toBeInstanceOf(Set);
    expect(set.size).toBe(10);
    for (const name of [
      'mem_search', 'mem_ingest', 'mem_ingest_file', 'code_search',
      'get_curated_context', 'find_tools', 'execute_dynamic_tool', 'orchestration_status',
      'drawio_export_png', 'drawio_auto_layout',
    ]) {
      expect(set.has(name)).toBe(true);
    }
  });

  it('UT-02: empty CORE_TOOLS falls back to META_TOOLS only (BR-03/EF-1)', () => {
    setCore([]);
    const logger = { warn: vi.fn() } as any;
    const set = resolveCoreToolNames(logger);
    expect([...set].sort()).toEqual([...META].sort());
    expect(set.size).toBe(3);
  });

  it('UT-03: duplicate entries are de-duplicated (BR-08)', () => {
    setCore(['mem_search', 'mem_search', 'find_tools']);
    const set = resolveCoreToolNames();
    expect([...set].filter(n => n === 'mem_search')).toHaveLength(1);
    for (const m of META) expect(set.has(m)).toBe(true);
  });

  it('UT-04: invalid entries (empty/whitespace) ignored with warning (BR-05)', () => {
    setCore(['', '   ', 'mem_search']);
    const logger = { warn: vi.fn() } as any;
    const set = resolveCoreToolNames(logger);
    expect(set.has('')).toBe(false);
    expect(set.has('   ')).toBe(false);
    expect(set.has('mem_search')).toBe(true);
    for (const m of META) expect(set.has(m)).toBe(true);
    expect(logger.warn).toHaveBeenCalled();
    const calls = logger.warn.mock.calls.map((c: any[]) => JSON.stringify(c));
    expect(calls.some((s: string) => s.includes('BR-05'))).toBe(true);
  });

  it('UT-05: unknown name is kept in the resolved set (registry-agnostic, BR-04)', () => {
    setCore(['mem_search', 'not_a_real_tool']);
    const set = resolveCoreToolNames();
    expect(set.has('not_a_real_tool')).toBe(true);
    expect(set.has('mem_search')).toBe(true);
    for (const m of META) expect(set.has(m)).toBe(true);
  });
});
