/**
 * SA4E-107: Symbol context loading (extracted from CodeEnrichmentHandler).
 * Reads symbol metadata, body text, child members and existing pseudo code
 * from the database to build the SymbolContext for enrichment prompts.
 */

import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { CodeEnrichmentPayload, SymbolContext } from './types.js';

/** Load the full symbol context (metadata + body + children + prior pseudo code). */
export async function loadSymbolContext(
  adapter: DatabaseAdapter,
  payload: CodeEnrichmentPayload,
): Promise<SymbolContext> {
  const sym = await adapter.getAsync<{
    name: string; kind: string; signature: string | null;
    doc_comment: string | null; parent_symbol: string | null;
  }>(
    'SELECT name, kind, signature, doc_comment, parent_symbol FROM symbols WHERE id = ?',
    [payload.symbolId],
  );
  if (!sym) throw new Error(`symbol_not_found: ${payload.symbolId}`);
  // filePath comes from the task payload (already relative_path) — grounds metadata prompts.

  const bodyText = await loadBodyText(adapter, payload.symbolId);
  const childMembers = await loadChildMembers(adapter, payload.symbolId);
  const existingPseudoCode = await loadExistingPseudoCode(adapter, payload.symbolId);

  return {
    name: sym.name,
    kind: sym.kind,
    signature: sym.signature,
    docComment: sym.doc_comment,
    bodyText,
    childMembers,
    existingPseudoCode,
    // SA4E-106: Pega class from payload or parent_symbol; ruleset from payload
    pegaClass: payload.pegaClass || sym.parent_symbol || undefined,
    pegaRuleset: payload.pegaRuleset || undefined,
    // Metadata grounding: owning object/component + source file path.
    parentSymbol: sym.parent_symbol || undefined,
    filePath: payload.filePath || undefined,
  };
}

/** Body text lives in body_embeddings (chunk 0) as raw UTF-8. */
async function loadBodyText(adapter: DatabaseAdapter, symbolId: number): Promise<string | null> {
  const row = await adapter.getAsync<{ embedding: Buffer }>(
    'SELECT embedding FROM body_embeddings WHERE symbol_id = ? AND chunk_index = 0',
    [symbolId],
  );
  if (!row?.embedding) return null;
  return Buffer.from(row.embedding).toString('utf-8');
}

/** Immediate child symbols ("kind:name"), capped at 30 to bound prompt size. */
async function loadChildMembers(adapter: DatabaseAdapter, symbolId: number): Promise<string[] | null> {
  const rows = await adapter.allAsync<{ name: string; kind: string }>(
    'SELECT name, kind FROM symbols WHERE parent_symbol_id = ? LIMIT 30',
    [symbolId],
  );
  if (rows.length === 0) return null;
  return rows.map(r => `${r.kind}:${r.name}`);
}

/** Previously generated pseudo code (used for iterative refinement). */
async function loadExistingPseudoCode(adapter: DatabaseAdapter, symbolId: number): Promise<string | null> {
  const row = await adapter.getAsync<{ pseudo_code: string | null }>(
    'SELECT pseudo_code FROM symbols WHERE id = ?', [symbolId],
  );
  return row?.pseudo_code ?? null;
}
