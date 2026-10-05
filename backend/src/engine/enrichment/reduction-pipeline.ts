/**
 * ReductionPipeline — SA4E-338 Plan D (UC-4, BR-02/08/09/10/11/13/18).
 *
 * Structural chunking by AST sections → map (summarize each chunk) →
 * tree reduce (merge summaries recursively) → BudgetError fail-fast.
 */

import { chunkedReduce, type ChunkedReduceOptions } from '../../modules/memory/llm/chunked-reduce.js';
import { estimateTokens } from '../context/token-budget-manager.js';
import type { WindowInfo } from '../../modules/memory/llm/context-window.js';
import { isContextLengthError } from '../../modules/memory/llm/error-classifier.js';
import type { LLMService } from '../../modules/memory/llm/LLMService.js';

const MAX_CHUNKS_PER_RULE = 32;
const MAX_REDUCE_ROUNDS = 3;
const CHUNK_BACKOFF_BASE = 200;

export interface AstNode {
  id: string;
  type: string;
  content: string;
  children?: AstNode[];
  logicNode?: boolean;
}

export interface MapReduceReport {
  trigger: 'proactive_over_budget' | 'context_length_error';
  strategy: string;
  chunks: Array<{ section: string; tokens: number; status: 'ok' | 'failed'; attempts: number }>;
  reduceRounds: number;
  chunksCompacted: number;
  tokensFreed: number;
  pinnedLogicIntact: boolean;
  boundsHit?: { chunksTried?: number; roundsTried?: number };
  budgetError?: { message: string; context: Record<string, unknown> };
}

export interface ReductionOutcome {
  kind: 'success' | 'budget_error';
  text?: string;
  report: MapReduceReport;
  error?: BudgetError;
}

export class BudgetError extends Error {
  report: MapReduceReport;
  roundsTried: number;
  chunksTried: number;

  constructor(message: string, report: MapReduceReport, roundsTried: number, chunksTried: number) {
    super(message);
    this.name = 'BudgetError';
    this.report = report;
    this.roundsTried = roundsTried;
    this.chunksTried = chunksTried;
  }

  attachReport(report: MapReduceReport): BudgetError {
    this.report = report;
    return this;
  }
}

interface Chunk {
  sections: AstNode[];
  tokens: number;
  logicNodeIds: string[];
  status: 'pending' | 'ok' | 'failed';
  attempts: number;
}

function newChunk(): Chunk {
  return { sections: [], tokens: 0, logicNodeIds: [], status: 'pending', attempts: 0 };
}

function estimateNodeTokens(node: AstNode): number {
  return estimateTokens(node.content || node.type);
}

function isLogicNode(node: AstNode): boolean {
  return node.logicNode === true
    || /step|action|condition|expression|decision|row/i.test(node.type);
}

function verifyPinnedCoverage(ast: AstNode, chunks: Chunk[]): boolean {
  const logicIds = collectLogicNodeIds(ast);
  if (logicIds.length === 0) return true;
  const covered = new Set<string>();
  for (const chunk of chunks) {
    for (const id of chunk.logicNodeIds) {
      covered.add(id);
    }
  }
  return logicIds.every((id) => covered.has(id));
}

function collectLogicNodeIds(node: AstNode): string[] {
  const ids: string[] = [];
  if (isLogicNode(node)) ids.push(node.id);
  for (const child of node.children ?? []) {
    ids.push(...collectLogicNodeIds(child));
  }
  return ids;
}

function chunkByAstSections(ast: AstNode, budget: number): Chunk[] {
  const chunks: Chunk[] = [];
  let cur = newChunk();

  for (const child of ast.children ?? []) {
    const t = estimateNodeTokens(child);
    if (cur.sections.length > 0 && cur.tokens + t > budget) {
      chunks.push(cur);
      cur = newChunk();
    }
    cur.sections.push(child);
    cur.tokens += t;
    if (isLogicNode(child)) cur.logicNodeIds.push(child.id);
  }
  if (cur.sections.length) chunks.push(cur);

  if (chunks.length > MAX_CHUNKS_PER_RULE) {
    return chunks.slice(0, MAX_CHUNKS_PER_RULE);
  }
  return chunks;
}

function renderChunkSection(nodes: AstNode[]): string {
  return nodes.map((n) => `--- ${n.type} ---\n${n.content}`).join('\n');
}

function fallbackSectionSummary(chunk: Chunk): string {
  const types = chunk.sections.map((s) => s.type).join(', ') || 'unknown';
  return `[fallback] section(${types}) could not be summarized`;
}

function buildChunkPrompt(chunk: Chunk, budget: number): string {
  const sectionText = renderChunkSection(chunk.sections);
  return `Summarize the following rule section (keep logic intact, ≤${budget} tokens):\n${sectionText}`;
}

function mergeSummaries(results: string[]): string {
  return results.filter(Boolean).join('\n---\n');
}

function backoff(attempt: number): Promise<void> {
  return new Promise((r) => setTimeout(r, CHUNK_BACKOFF_BASE * 2 ** attempt));
}

export interface ReductionCtx {
  llm: LLMService;
  budget: number;
  trigger: 'proactive_over_budget' | 'context_length_error';
  ast: AstNode;
  digest: string;
}

export async function reduce(
  ast: AstNode,
  digest: string,
  trigger: ReductionCtx['trigger'],
  budget: number,
  ctx: ReductionCtx,
): Promise<ReductionOutcome> {
  const report: MapReduceReport = {
    trigger,
    strategy: 'ast_sections_map_reduce',
    chunks: [],
    reduceRounds: 0,
    chunksCompacted: 0,
    tokensFreed: 0,
    pinnedLogicIntact: false,
  };

  try {
    const chunks = chunkByAstSections(ast, budget);
    if (chunks.length > MAX_CHUNKS_PER_RULE) {
      report.boundsHit = { chunksTried: chunks.length };
    }

    const pinnedOk = verifyPinnedCoverage(ast, chunks);
    report.pinnedLogicIntact = pinnedOk;
    if (!pinnedOk) {
      throw new BudgetError(
        'pinned logic missing from all chunks — aborting reduction (ERR-11)',
        report,
        report.reduceRounds,
        chunks.length,
      );
    }

    // Map phase — per-chunk summarize via chunkedReduce
    const mapResults: string[] = [];
    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];
      let chunkOk = false;

      for (let attempt = 0; attempt <= 2; attempt++) {
        chunk.attempts++;
        try {
          const prompt = buildChunkPrompt(chunk, budget);
          const resp = await ctx.llm.complete([
            { role: 'system', content: 'Summarize this Pega rule section. Keep all logic intact.' },
            { role: 'user', content: prompt },
          ]);
          chunk.status = 'ok';
          mapResults.push(resp.content);
          chunkOk = true;
          break;
        } catch (err) {
          if (isContextLengthError(err) && attempt === 0) {
            const sub = splitChunkChildren(chunk);
            if (sub.length > 1) {
              const subChunks: Chunk[] = sub.map((s) => ({
                sections: s,
                tokens: estimateTokens(renderChunkSection(s)),
                logicNodeIds: s.filter((n) => isLogicNode(n)).map((n) => n.id),
                status: 'pending',
                attempts: 0,
              }));
              const subResults: string[] = [];
              for (const sc of subChunks) {
                try {
                  const r = await ctx.llm.complete([
                    { role: 'system', content: 'Summarize this Pega rule section.' },
                    { role: 'user', content: buildChunkPrompt(sc, budget) },
                  ]);
                  sc.status = 'ok';
                  subResults.push(r.content);
                } catch {
                  sc.status = 'failed';
                  subResults.push(fallbackSectionSummary(sc));
                }
              }
              chunk.status = 'ok';
              report.chunks.push({
                section: chunk.sections[0]?.type ?? '?',
                tokens: chunk.tokens,
                status: 'ok',
                attempts: chunk.attempts,
              });
              mapResults.push(mergeSummaries(subResults));
              break;
            }
          }

          if (isAuthError(err)) {
            throw err;
          }

          if (attempt >= 2) {
            chunk.status = 'failed';
            mapResults.push(fallbackSectionSummary(chunk));
            break;
          }
          await backoff(attempt);
        }
      }

      report.chunks.push({
        section: chunk.sections[0]?.type ?? '?',
        tokens: chunk.tokens,
        status: chunk.status === 'failed' ? 'failed' : 'ok',
        attempts: chunk.attempts,
      });
    }

    let merged = mergeSummaries(mapResults);

    // Tree reduce while merged > budget
    while (estimateTokens(merged) > budget) {
      if (++report.reduceRounds > MAX_REDUCE_ROUNDS) {
        report.budgetError = {
          message: `still over budget after ${report.reduceRounds - 1} rounds — strategy: ast_sections_map_reduce`,
          context: { chunks: chunks.length, strategy: 'ast_sections_map_reduce' },
        };
        throw new BudgetError(
          report.budgetError.message,
          report,
          report.reduceRounds - 1,
          chunks.length,
        );
      }
      merged = await reduceStep(merged, budget, ctx);
    }

    report.tokensFreed = estimateTokens(digest) - estimateTokens(merged);
    report.chunksCompacted = report.chunks.filter((c) => c.status === 'ok').length;

    return { kind: 'success', text: merged, report };
  } catch (err) {
    if (err instanceof BudgetError) {
      return { kind: 'budget_error', error: err, report };
    }
    throw err;
  }
}

async function reduceStep(
  summaries: string,
  budget: number,
  ctx: ReductionCtx,
): Promise<string> {
  const parts = summaries.split('\n---\n');
  if (parts.length <= 1) return summaries;

  const pairs: string[] = [];
  for (let i = 0; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      pairs.push(`Merge these two summaries:\n1. ${parts[i]}\n2. ${parts[i + 1]}`);
    } else {
      pairs.push(parts[i]);
    }
  }

  const results: string[] = [];
  for (const pair of pairs) {
    try {
      const resp = await ctx.llm.complete([
        { role: 'system', content: 'Merge the summaries below concisely, preserving all logic.' },
        { role: 'user', content: pair },
      ]);
      results.push(resp.content);
    } catch {
      results.push(pair);
    }
  }
  return results.join('\n---\n');
}

function splitChunkChildren(chunk: Chunk): AstNode[][] {
  const result: AstNode[][] = [];
  for (const section of chunk.sections) {
    if (section.children && section.children.length > 1 && isLogicNode(section)) {
      for (const child of section.children) {
        result.push([child]);
      }
    } else {
      result.push([section]);
    }
  }
  return result.length > 1 ? result : [[chunk.sections[0] ?? { id: 'atomic', type: 'unknown', content: '', logicNode: true }]];
}

function isAuthError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, any>;
  if (e.status === 401 || e.status === 403) return true;
  const body = e.providerBody ?? e.message ?? '';
  if (typeof body === 'string' && /invalid.?api.?key|unauthorized|forbidden/i.test(body)) return true;
  return false;
}
