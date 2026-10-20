/**
 * Shared helpers for SA4E-225 language extraction tests.
 * Split from sa4e-225-language-extraction.test.ts to keep each file under
 * the CI line-count gate (<=200 lines). No logic changed — helpers relocated.
 */
import type { ExtractedSymbol } from '../signature-extractor.js';

export function kindsOf(syms: ExtractedSymbol[]): Set<string> {
  return new Set(syms.map((s) => s.kind));
}

export function has(syms: ExtractedSymbol[], name: string, kind: string): boolean {
  return syms.some((s) => s.name === name && s.kind === kind);
}
