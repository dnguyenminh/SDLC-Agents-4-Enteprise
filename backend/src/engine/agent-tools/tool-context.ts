/**
 * SA4E-420 — Session pinning + compact DSL contracts for the 4 core tools
 * (16K Doc §7 + §4). Every tool receives the session pin
 * {repository_id, commit_id, index_snapshot_id} — prevents chat drift.
 */

import { randomUUID } from 'node:crypto';
import type { SnapshotRetrievalService } from '../retrieval/snapshot-retrieval.js';

export interface SessionPin {
  repository_id: string;
  commit_id: string;
  index_snapshot_id: string;
}

export interface ToolResult<T> {
  resultId: string;
  summary: string;
  dsl: string;
  data: T;
  evidenceIds: string[];
  truncated: boolean;
  nextPageCursor?: string;
  budgetUsedTokens: number;
}

/**
 * Validate the session pin: snapshot exists + READY, belongs to the pinned
 * repository, and is built on the pinned commit (no mid-conversation drift).
 */
export async function assertSessionPin(
  retrieval: SnapshotRetrievalService,
  pin: SessionPin,
): Promise<void> {
  const info = await retrieval.pinOrThrow(pin.index_snapshot_id, pin.repository_id);
  if (info.commitId !== pin.commit_id) {
    throw new Error(
      `PIN_COMMIT_MISMATCH: snapshot ${pin.index_snapshot_id} is on commit ${info.commitId}, pinned ${pin.commit_id}`,
    );
  }
}

export function dslHeader(what: string, count: number, budgetTokens: number): string {
  return `[FOUND ${count} ${what} | BUDGET_USED: ${budgetTokens} tokens]`;
}

export function newResultId(): string {
  return randomUUID();
}

export function estimateTokens(text: string): number {
  return Math.ceil((text ?? '').length / 4);
}

/** Args for search_symbols (16K Doc §7). */
export interface SearchSymbolsArgs {
  query: string;
  kind?: string;
  path_filter?: string;
  limit?: number;
  offset?: number;
}

/** One ranked symbol hit in search_symbols results. */
export interface SymbolEntry {
  symbolId: string;
  chunkId: string;
  name: string;
  kind: string;
  signature: string;
  filePath: string;
  startLine: number;
  endLine: number;
  bodyTokens: number;
}
