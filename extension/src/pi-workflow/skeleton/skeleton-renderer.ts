/**
 * SA4E-360 — pure skeleton rendering with the SEC-360-02 global incremental
 * budget (render each file with maxTokens = cap − measuredSoFar) and the
 * SEC-360-01/07 hygiene passes (redact + strip BEFORE signature trimming).
 *
 * The renderer composes the shipped SymbolOutlineExtractor (BR-360-05 — no new
 * engine): extractOutline enforces its per-file bound with TokenCounter.estimate,
 * which is ALWAYS ≥ estimateTokenCount (chars/4), so a file rendered within
 * `remaining` can never push the authoritative chars/4 measurement past cap.
 */
import { estimateTokenCount } from '../../pi-agent/prompt-compressor.js';
import type { SearchCandidate } from '../../pi-agent/context-retrieval/types.js';
import { trimSignature } from '../../pi-agent/context-retrieval/symbol-outline-extractor.js';
import { sanitizeCodeText } from './secret-redaction.js';
import type { SkeletonPart } from './skeleton-types.js';

/** One corpus file to render (symbols grouped per file from the batched query). */
export interface CorpusFile {
  filePath: string;
  module: string;
  symbols: readonly SearchCandidate[];
}

export interface RenderCorpusDeps {
  /** Per-file renderer — production binds SymbolOutlineExtractor.extractOutline. */
  renderFile: (filePath: string, symbols: readonly SearchCandidate[], maxTokens: number) => string;
  /** Authoritative estimator — production binds the shipped estimateTokenCount. */
  measure: (text: string) => number;
}

export interface RenderCorpusResult {
  content: string;
  tokens: number;
  parts: SkeletonPart[];
  /** Cumulative measuredSoFar after each rendered file (PBT-10 boundary oracle). */
  boundaryTokens: Map<string, number>;
  rendered: number;
  /** True when files were left out because the global budget was exhausted. */
  overflow: boolean;
}

/** Applies redaction + control-char strip to one indexed symbol (SEC-360-01 #4). */
export function sanitizeCandidate(candidate: SearchCandidate): SearchCandidate {
  return {
    ...candidate,
    name: sanitizeCodeText(candidate.name),
    signature: candidate.signature ? sanitizeCodeText(candidate.signature) : undefined,
    docComment: undefined, // never render doc comments (SEC-360-01 vector 3)
  };
}

/** Normalized signature line: sanitize FIRST, then the shipped 120-char trim (UT-32).
 * A whitespace-only input collapses to a single space (SIG-05) instead of ''. */
export function sanitizeSignatureLine(signature: string): string {
  if (!signature) return signature;
  const out = trimSignature(sanitizeCodeText(signature));
  return out === '' ? ' ' : out;
}

/**
 * RAW_HEAD degradation rung: sanitize the head text, THEN trim to the token
 * budget line-by-line — no partial secret can survive at a trim boundary (UT-33).
 */
export function sanitizeRawHead(
  head: string,
  maxTokens: number,
  measure: (text: string) => number = estimateTokenCount
): string {
  const safe = sanitizeCodeText(head);
  const lines = safe.split('\n');
  while (lines.length > 0 && measure(lines.join('\n')) > maxTokens) lines.pop();
  return lines.join('\n');
}

/**
 * Renders the corpus file-by-file under the global cap. Files render in the
 * given order (module-priority order decided by the provider); once
 * measuredSoFar reaches cap, remaining files are skipped (overflow = true).
 */
export function renderCorpusWithGlobalBudget(
  files: readonly CorpusFile[],
  cap: number,
  deps: RenderCorpusDeps
): RenderCorpusResult {
  const parts: SkeletonPart[] = [];
  const boundaryTokens = new Map<string, number>();
  let measuredSoFar = 0;
  for (const file of files) {
    const remaining = cap - measuredSoFar;
    if (remaining <= 0) break; // global cap full — later files self-skip (SEC-360-02 #1)
    // remaining-1 headroom: extractOutline bounds with TokenCounter.estimate (≥ chars/4),
    // so the authoritative measure of its output stays < remaining (PBT-10 boundary).
    const outline = deps.renderFile(file.filePath, file.symbols.map(sanitizeCandidate), Math.max(1, remaining - 1));
    const tokens = deps.measure(outline);
    if (!outline || tokens > remaining) continue; // would overshoot the boundary — skip
    measuredSoFar += tokens;
    boundaryTokens.set(file.filePath, measuredSoFar);
    parts.push({ filePath: file.filePath, module: file.module, content: outline });
  }
  const content = parts.map((p) => p.content).join('\n');
  const tokens = deps.measure(content);
  return {
    content,
    tokens,
    parts,
    boundaryTokens,
    rendered: parts.length,
    overflow: parts.length < files.length,
  };
}
