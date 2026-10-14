/**
 * Signature Extractor — Multi-language regex-based symbol extraction.
 * Extracts functions, classes, interfaces, and other symbols from source files.
 *
 * The per-language `PatternDef[]` sets live in ./languages (SA4E-225) so this
 * file stays a pure engine and under the 200-line maintainability limit.
 */

import { LANGUAGE_PATTERNS } from './languages/index.js';

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  signature: string;
  startLine: number;
  endLine: number;
  parentSymbol: string | null;
  visibility: string | null;
  docComment: string | null;
}

export type SymbolKind =
  | 'function' | 'class' | 'interface' | 'method'
  | 'enum' | 'type' | 'constant' | 'variable'
  | 'module' | 'namespace' | 'trait' | 'struct';

// Exported so per-language PatternDef sets (./languages/*) can type their constants.
export interface PatternDef {
  regex: RegExp;
  kind: SymbolKind;
  nameGroup: number;
  signatureGroup?: number;
}

/**
 * Security condition C2 — per-line size guard.
 * Lines longer than this are blanked before matching so that `matchAll` can never
 * be forced to scan multi-megabyte single lines (reinforces ReDoS condition C1).
 */
const MAX_LINE_LENGTH = 8192;

/** Extract symbols from source content based on language. */
export function extractSymbols(content: string, language: string): ExtractedSymbol[] {
  const patterns = getPatterns(language);
  if (!patterns.length) return [];

  const lines = content.split('\n');
  // C2 size guard: blank out oversized lines so matchAll operates on bounded input.
  const safeContent = lines
    .map((line) => (line.length > MAX_LINE_LENGTH ? '' : line))
    .join('\n');

  const symbols: ExtractedSymbol[] = [];
  for (const pattern of patterns) {
    extractWithPattern(lines, safeContent, pattern, symbols);
  }

  return deduplicateSymbols(symbols);
}

function extractWithPattern(
  lines: string[], content: string, pattern: PatternDef, symbols: ExtractedSymbol[]
): void {
  const matches = content.matchAll(new RegExp(pattern.regex, 'gm'));
  for (const match of matches) {
    if (!match.index && match.index !== 0) continue;
    const startLine = content.slice(0, match.index).split('\n').length;
    const name = match[pattern.nameGroup];
    if (!name || name.length > 100) continue;

    symbols.push({
      name,
      kind: pattern.kind,
      signature: (match[pattern.signatureGroup ?? 0] ?? match[0]).trim().slice(0, 500),
      startLine,
      endLine: estimateEndLine(lines, startLine),
      parentSymbol: null,
      visibility: extractVisibility(match[0]),
      docComment: extractDocComment(lines, startLine - 1),
    });
  }
}

function estimateEndLine(lines: string[], startLine: number): number {
  let depth = 0;
  let foundOpen = false;
  for (let i = startLine - 1; i < lines.length && i < startLine + 200; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === '{') { depth++; foundOpen = true; }
      if (ch === '}') depth--;
    }
    if (foundOpen && depth <= 0) return i + 1;
  }
  return Math.min(startLine + 1, lines.length);
}

function extractVisibility(text: string): string | null {
  if (/\bpublic\b/.test(text)) return 'public';
  if (/\bprivate\b/.test(text)) return 'private';
  if (/\bprotected\b/.test(text)) return 'protected';
  if (/\binternal\b/.test(text)) return 'internal';
  if (/\bexport\b/.test(text)) return 'export';
  return null;
}

function extractDocComment(lines: string[], lineIdx: number): string | null {
  const comments: string[] = [];
  for (let i = lineIdx - 1; i >= Math.max(0, lineIdx - 15); i--) {
    const line = lines[i].trim();
    if (line.startsWith('*') || line.startsWith('/**') || line.startsWith('///') || line.startsWith('#')) {
      comments.unshift(line.replace(/^\/\*\*|\*\/|\*|\/\/\/|#\s?/g, '').trim());
    } else if (line === '') {
      continue;
    } else {
      break;
    }
  }
  return comments.length > 0 ? comments.join(' ').slice(0, 500) : null;
}

function deduplicateSymbols(symbols: ExtractedSymbol[]): ExtractedSymbol[] {
  const seen = new Set<string>();
  return symbols.filter(s => {
    const key = `${s.name}:${s.startLine}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Single source of routing for regex-only languages (SA4E-225 §5.3). */
function getPatterns(language: string): PatternDef[] {
  return LANGUAGE_PATTERNS[language] ?? GENERIC_PATTERNS;
}

/** Fallback patterns used when no language-specific set is registered.
 * SA4E-360 (UC-360-04): export-aware and indent-tolerant so grammar-less
 * modules (e.g. Svelte) still surface their exported functions/classes. */
const GENERIC_PATTERNS: PatternDef[] = [
  { regex: /^[ \t]*(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|def|func|fn|sub)\s+(\w+)[^\n{;]*/m, kind: 'function', nameGroup: 1, signatureGroup: 0 },
  { regex: /^[ \t]*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?(?:class|struct|type)\s+(\w+)[^\n{;]*/m, kind: 'class', nameGroup: 1, signatureGroup: 0 },
];
