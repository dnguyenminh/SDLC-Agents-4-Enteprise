/**
 * SA4E-225 — Unit tests for new language symbol-extraction patterns (part 3).
 * Covers STC TC-011..TC-015: regression, ReDoS (C1), size guard (C2),
 * Swift spacing (C4), and the <=200 line maintainability rule (AC-5).
 * Split from sa4e-225-language-extraction.test.ts to keep each file under
 * the CI line-count gate (<=200 lines). No logic changed — tests only relocated.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { extractSymbols, type ExtractedSymbol } from '../signature-extractor.js';
import { LANGUAGE_PATTERNS } from '../languages/index.js';
import { has } from './sa4e-225.helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// TC-011 — No regression for existing tree-sitter languages
// ---------------------------------------------------------------------------
describe('TC-011 Regression — existing languages unaffected', () => {
  it('LANGUAGE_PATTERNS routes all 16 languages (no silent fallback)', () => {
    for (const id of [
      'typescript', 'javascript', 'kotlin', 'python', 'java', 'go', 'rust', 'apex',
      'scala', 'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'bash', 'powershell',
    ]) {
      expect(LANGUAGE_PATTERNS[id]).toBeDefined();
      expect(LANGUAGE_PATTERNS[id].length).toBeGreaterThan(0);
    }
  });

  it('existing languages still extract expected kinds', () => {
    expect(has(extractSymbols('export function foo() {}\nexport class Bar {}', 'typescript'), 'foo', 'function')).toBe(true);
    expect(has(extractSymbols("def run():\n    pass\nclass Model:\n    pass", 'python'), 'Model', 'class')).toBe(true);
    expect(has(extractSymbols('func (s *Server) Handle() {}\ntype Config struct{}', 'go'), 'Config', 'struct')).toBe(true);
    expect(has(extractSymbols('pub fn main() {}\npub struct Point{}', 'rust'), 'main', 'function')).toBe(true);
    expect(has(extractSymbols('private fun surface() {}\ninternal class Repo {}', 'kotlin'), 'Repo', 'class')).toBe(true);
    expect(has(extractSymbols('public class Main {\n  public static void run(String[] args) {}\n}', 'java'), 'run', 'function')).toBe(true);
    expect(has(extractSymbols('public class Acc {}\npublic interface IH {}', 'apex'), 'Acc', 'class')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-012 — ReDoS regression (C1): degenerate long line per new language
// ---------------------------------------------------------------------------
describe('TC-012 ReDoS regression (C1)', () => {
  const langs = ['scala', 'c', 'cpp', 'csharp', 'ruby', 'php', 'swift', 'bash', 'powershell'];
  for (const lang of langs) {
    it(`extractSymbols completes in bounded time for ${lang} on a 100k-char line`, () => {
      const degenerate = 'a'.repeat(100_000) + '(';
      const start = performance.now();
      let result: ExtractedSymbol[] = [];
      expect(() => {
        result = extractSymbols(degenerate, lang);
      }).not.toThrow();
      const elapsed = performance.now() - start;
      expect(Array.isArray(result)).toBe(true);
      // Bounded — must not hang / catastrophically backtrack (< 1500ms).
      expect(elapsed).toBeLessThan(1500);
    });
  }
});

// ---------------------------------------------------------------------------
// TC-013 — Per-line / file size guard before matchAll (C2)
// ---------------------------------------------------------------------------
describe('TC-013 Size guard (C2)', () => {
  it('a 5MB single line is processed in bounded time and drops oversized content', () => {
    const huge = 'x'.repeat(5_000_000);
    const start = performance.now();
    const syms = extractSymbols(huge, 'csharp');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
    // The giant line is blanked by the guard, so no symbols are produced from it.
    expect(syms).toHaveLength(0);
  });

  it('a symbol on an oversized line is dropped by the guard', () => {
    const oversized = 'class ' + 'A'.repeat(9000); // single line > 8192 chars
    const syms = extractSymbols(oversized, 'scala');
    expect(syms).toHaveLength(0);
  });

  it('normal-sized content is unaffected by the guard', () => {
    const syms = extractSymbols('public class Foo { }', 'csharp');
    expect(has(syms, 'Foo', 'class')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-014 — Swift modifier spacing (C4)
// ---------------------------------------------------------------------------
describe('TC-014 Swift modifier spacing (C4)', () => {
  it('public class Foo matches (modifier + space required)', () => {
    const syms = extractSymbols('public class Foo { }', 'swift');
    expect(has(syms, 'Foo', 'class')).toBe(true);
  });

  it('private struct Bar matches', () => {
    const syms = extractSymbols('private struct Bar { }', 'swift');
    expect(has(syms, 'Bar', 'struct')).toBe(true);
  });

  it('open func baz matches', () => {
    const syms = extractSymbols('open func baz() { }', 'swift');
    expect(has(syms, 'baz', 'function')).toBe(true);
  });

  it('publicclass Foo (no space) does NOT falsely match', () => {
    const syms = extractSymbols('publicclass Foo { }', 'swift');
    expect(has(syms, 'Foo', 'class')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-015 — Source file <= 200 lines (AC-5)
// ---------------------------------------------------------------------------
describe('TC-015 Maintainability — files <= 200 lines', () => {
  const files = [
    '../signature-extractor.ts',
    '../languages/index.ts',
    '../languages/builtin.ts',
    '../languages/scala.ts',
    '../languages/c.ts',
    '../languages/cpp.ts',
    '../languages/csharp.ts',
    '../languages/ruby.ts',
    '../languages/php.ts',
    '../languages/swift.ts',
    '../languages/bash.ts',
    '../languages/powershell.ts',
    '../tree-sitter-indexer.ts',
    '../../indexer/project-type/resolver.ts',
    // NOTE: config/index.ts is a pre-existing 210-line file (out of SA4E-225 scope to
    // refactor/split); it is excluded from the strict <=200 check by design (TDD §5.5).
  ];

  for (const f of files) {
    it(`${f} is <= 200 lines`, () => {
      const p = path.resolve(__dirname, f);
      const lines = fs.readFileSync(p, 'utf-8').split('\n').length;
      expect(lines).toBeLessThanOrEqual(200);
    });
  }
});
