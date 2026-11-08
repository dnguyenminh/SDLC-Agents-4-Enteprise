/**
 * SA4E-419 — Zero-Fat ASTCodeChunk builder (16K Doc §5).
 *
 * Parent (skeleton): class/interface + fields + signatures, body hidden `{...}`.
 * Child (body): full source slice + location + dependency subgraph.
 * External libs: signature-only (no body).
 * EMBED ONLY: [fp] + [sig] + [doc] + [deps.calls] — NEVER the body (§5 noise rule).
 */

export interface ChunkSymbolInput {
  id: string;
  name: string;
  kind: string;
  signature: string | null;
  docComment: string | null;
  startLine: number;
  endLine: number;
  parentId: string | null;
  /** V6 source_file_revision id — null for external declarations. */
  sfrId: string | null;
  /** true for external-library declarations — signature-only, no body. */
  isExternal: boolean;
}

export interface ChunkDeps {
  imports: string[];
  calls: string[];
  refs_types: string[];
}

export interface ASTCodeChunk {
  id: string;
  fp: string;
  type: 'SKELETON' | 'BODY' | 'EXTERNAL_SIGNATURE';
  name: string;
  parent_id: string | null;
  rng: [number, number];
  sig: string;
  doc: string | null;
  skeleton: string;
  body: string;
  deps: ChunkDeps;
  tokens: { sig_tokens: number; skeleton_tokens: number; body_tokens: number };
  /** DB linkage (V6 FKs) — not part of the zero-fat payload. */
  symbol_id: string;
  sfr_id: string | null;
}

export interface FileChunkInput {
  filePath: string;
  source: string;
  symbols: ChunkSymbolInput[];
  /** resolved dependency names per symbol id (from symbol_relationship). */
  depsBySymbolId: Map<string, ChunkDeps>;
}

export function estimateTokens(text: string): number {
  return Math.ceil((text ?? '').length / 4);
}

const EXTERNAL_KINDS = new Set(['interface', 'type', 'class']);

/** Container symbol (class/interface/struct...) that owns children. */
function isContainer(kind: string): boolean {
  return ['class', 'interface', 'struct', 'enum', 'trait'].includes(kind);
}

/** Skeleton text: container header + children signatures, body hidden. */
function renderSkeleton(sym: ChunkSymbolInput, children: ChunkSymbolInput[]): string {
  const header = `${sym.kind} ${sym.name} {`;
  if (children.length === 0) return `${header} ... }`;
  const lines = children.map((c) => `  ${c.signature ?? `${c.kind} ${c.name}`};`);
  return [header, ...lines, '}'].join('\n');
}

/** Build all chunks for ONE file: skeleton (containers) + body (leaf code). */
export function chunkFile(input: FileChunkInput): ASTCodeChunk[] {
  const srcLines = input.source.split('\n');
  const bodySlice = (start: number, end: number) =>
    srcLines.slice(Math.max(0, start - 1), end).join('\n');

  const byId = new Map(input.symbols.map((s) => [s.id, s]));
  const childrenOf = new Map<string, ChunkSymbolInput[]>();
  const topLevel: ChunkSymbolInput[] = [];
  for (const s of input.symbols) {
    if (s.parentId && byId.has(s.parentId)) {
      const list = childrenOf.get(s.parentId) ?? [];
      list.push(s);
      childrenOf.set(s.parentId, list);
    } else {
      topLevel.push(s);
    }
  }

  const chunks: ASTCodeChunk[] = [];
  const depsOf = (sym: ChunkSymbolInput): ChunkDeps =>
    input.depsBySymbolId.get(sym.id) ?? { imports: [], calls: [], refs_types: [] };

  const mkChunk = (
    sym: ChunkSymbolInput,
    type: ASTCodeChunk['type'],
    skeleton: string,
    body: string,
    parentName: string | null,
  ): ASTCodeChunk => {
    const sig = sym.signature ?? `${sym.kind} ${sym.name}`;
    return {
      id: parentName ? `${parentName}#${sym.name}` : sym.name,
      fp: input.filePath,
      type,
      name: sym.name,
      parent_id: sym.parentId,
      rng: [sym.startLine, sym.endLine],
      sig,
      doc: sym.docComment,
      skeleton,
      body,
      deps: depsOf(sym),
      tokens: {
        sig_tokens: estimateTokens(sig),
        skeleton_tokens: estimateTokens(skeleton),
        body_tokens: estimateTokens(body),
      },
      symbol_id: sym.id,
      sfr_id: sym.sfrId,
    };
  };

  for (const sym of topLevel) {
    if (sym.isExternal) {
      // External libs: signature-only, no body (AC).
      chunks.push(mkChunk(sym, 'EXTERNAL_SIGNATURE', `${sym.kind} ${sym.name};`, '', null));
      continue;
    }
    if (isContainer(sym.kind)) {
      const children = childrenOf.get(sym.id) ?? [];
      const skeleton = renderSkeleton(sym, children);
      chunks.push(mkChunk(sym, 'SKELETON', skeleton, '', null));
      for (const child of children) {
        if (child.isExternal) continue;
        const body = child.endLine >= child.startLine ? bodySlice(child.startLine, child.endLine) : '';
        chunks.push(mkChunk(child, 'BODY', '', body, sym.name));
      }
      continue;
    }
    // top-level function/variable: own body chunk
    const body = sym.endLine >= sym.startLine ? bodySlice(sym.startLine, sym.endLine) : '';
    chunks.push(mkChunk(sym, 'BODY', '', body, null));
  }
  return chunks;
}

/**
 * THE embedding input — [fp] + [sig] + [doc] + [deps.calls] only (§5).
 * Body is deliberately excluded to reduce semantic noise from local vars.
 */
export function embeddingText(chunk: ASTCodeChunk): string {
  const calls = chunk.deps.calls.length > 0 ? `\ncalls: ${chunk.deps.calls.join(', ')}` : '';
  return `${chunk.fp}\n${chunk.sig}\n${chunk.doc ?? ''}${calls}`;
}

/** Retrieved-context assembly with ~8,000-token budget (16K Doc §4). */
export interface RetrievedContext {
  text: string;
  tokens: number;
  includedChunkIds: string[];
  truncated: boolean;
}

export function assembleRetrievedContext(
  ranked: ASTCodeChunk[],
  budget = 8000,
): RetrievedContext {
  const header = '[RETRIEVED_CONTEXT]';
  let used = estimateTokens(header);
  const parts: string[] = [];
  const included: string[] = [];
  let truncated = false;
  for (const chunk of ranked) {
    const block = [
      `--- ${chunk.fp} ${chunk.rng[0]}-${chunk.rng[1]} (${chunk.type}) ${chunk.id}`,
      chunk.skeleton || chunk.sig,
      chunk.type === 'BODY' ? chunk.body : '',
    ]
      .filter(Boolean)
      .join('\n');
    const cost = estimateTokens(block) + 1;
    if (used + cost > budget) {
      truncated = true;
      continue;
    }
    used += cost;
    parts.push(block);
    included.push(chunk.id);
  }
  return { text: [header, ...parts].join('\n'), tokens: used, includedChunkIds: included, truncated };
}
