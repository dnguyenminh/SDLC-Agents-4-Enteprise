/**
 * SA4E-418 — Repository Map ranking math (16K Doc §6). Pure functions, no IO.
 *
 * Weight:  W(A → B, s) = Multiplier(s) × √freq(A, s) × ln(N / (df(s) + 1))
 *   - Multiplier(s): ×10 term in query; ×2 identifier-ish length ≥ 8;
 *     ×0.2 term belongs to a test/ file.
 * Ranking: personalized PageRank (alpha = 0.85, dangling mass follows the
 * personalization vector). Packing: binary-search the ranked line prefix that
 * fits the token budget (estimate ≈ 1 token / 4 chars, 16K Doc §4).
 */

export const PAGE_RANK_ALPHA = 0.85;
export const PAGE_RANK_TOLERANCE = 1e-9;
export const PAGE_RANK_MAX_ITER = 60;
/** Token estimate heuristic (16K Doc §4 budgeting). */
export const CHARS_PER_TOKEN = 4;

export interface FileGraphInput {
  /** file path → list of symbol names defined in that file. */
  symbolNamesByFile: Map<string, string[]>;
  /** directed edges (fromFile → toFile) induced by code relationships. */
  edges: Array<{ fromFile: string; toFile: string; symbolName: string }>;
  query?: string;
}

/** Split CamelCase / snake_case / kebab-case identifiers into lowercase terms. */
export function tokenizeIdentifier(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((t) => t.length > 0)
    .map((t) => t.toLowerCase());
}

/** Multiplier(s) per 16K Doc §6. */
export function multiplierFor(term: string, queryTerms: ReadonlySet<string>, filePath: string): number {
  if (queryTerms.has(term)) return 10;
  if (/(^|\/)(tests?|__tests__)\//i.test(filePath) || /\.test\.|\.spec\./i.test(filePath)) return 0.2;
  return term.length >= 8 ? 2 : 1;
}

/** W(A → B, s) = m(s) × √freq(A, s) × ln(N / (df(s) + 1)) */
export function termWeight(freqInA: number, df: number, totalFiles: number, multiplier: number): number {
  if (freqInA <= 0 || totalFiles <= 0) return 0;
  const idf = Math.log(totalFiles / (df + 1));
  if (idf <= 0) return 0;
  return multiplier * Math.sqrt(freqInA) * idf;
}

export interface WeightedGraph {
  nodes: string[];
  /** adjacency: from → Array<{ to, weight }> */
  edges: Map<string, Array<{ to: string; weight: number }>>;
  /** out-degree total weight per node (for normalization). */
  outWeight: Map<string, number>;
}

/**
 * Build the file-level weighted graph from symbol terms + relationships.
 * freq(A, s) = number of edges from A whose target symbol carries term s
 * (reference multiplicity). df(s) = files DECLARING symbols with term s.
 * Edge A→B accumulates Σ_s W over the target symbol's terms.
 */
export function buildFileGraph(input: FileGraphInput): WeightedGraph {
  const nodes = [...input.symbolNamesByFile.keys()].sort();
  const N = nodes.length;
  const queryTerms = new Set(
    (input.query ? tokenizeIdentifier(input.query) : []).filter((t) => t.length >= 3),
  );

  // declaration df: file declares a symbol containing the term (test files excluded)
  const df = new Map<string, number>();
  for (const file of nodes) {
    const inTest = /(^|\/)(tests?|__tests__)\//i.test(file) || /\.test\.|\.spec\./i.test(file);
    if (inTest) continue;
    const terms = new Set((input.symbolNamesByFile.get(file) ?? []).flatMap((n) => tokenizeIdentifier(n)).filter((t) => t.length >= 3));
    for (const term of terms) df.set(term, (df.get(term) ?? 0) + 1);
  }

  // reference freq: freq(A, s) = edges from A targeting symbols with term s
  // pair terms = terms of the TARGET symbol's name (the referenced symbol)
  const freq = new Map<string, Map<string, number>>(); // fromFile → term → count
  const pairTerms = new Map<string, { toFile: string; terms: Set<string> }>(); // "from\nto" → pair
  for (const edge of input.edges) {
    if (edge.fromFile === edge.toFile) continue;
    if (!input.symbolNamesByFile.has(edge.fromFile) || !input.symbolNamesByFile.has(edge.toFile)) continue;
    const key = `${edge.fromFile}\n${edge.toFile}`;
    if (pairTerms.has(key)) continue;
    const terms = new Set(tokenizeIdentifier(edge.symbolName).filter((t) => t.length >= 3));
    pairTerms.set(key, { toFile: edge.toFile, terms });
    const f = freq.get(edge.fromFile) ?? new Map<string, number>();
    for (const term of terms) f.set(term, (f.get(term) ?? 0) + 1);
    freq.set(edge.fromFile, f);
  }

  const edges = new Map<string, Map<string, number>>();
  for (const [key, pair] of pairTerms) {
    const from = key.split('\n')[0];
    let w = 0;
    for (const term of pair.terms) {
      const freqA = freq.get(from)?.get(term) ?? 0;
      const dfT = df.get(term) ?? 0;
      w += termWeight(freqA, dfT, N, multiplierFor(term, queryTerms, from));
    }
    if (w <= 0) continue;
    const m = edges.get(from) ?? new Map<string, number>();
    m.set(pair.toFile, (m.get(pair.toFile) ?? 0) + w);
    edges.set(from, m);
  }

  const outWeight = new Map<string, number>();
  const resultEdges = new Map<string, Array<{ to: string; weight: number }>>();
  for (const from of nodes) {
    const m = edges.get(from);
    if (!m || m.size === 0) continue;
    const list = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([to, weight]) => ({ to, weight }));
    resultEdges.set(from, list);
    outWeight.set(from, list.reduce((sum, e) => sum + e.weight, 0));
  }
  return { nodes, edges: resultEdges, outWeight };
}

/**
 * Personalized PageRank: personal vector normalized to Σ=1 internally.
 * Dangling mass is redistributed along the personalization vector.
 */
export function personalizedPageRank(
  graph: WeightedGraph,
  personal: Map<string, number>,
  alpha = PAGE_RANK_ALPHA,
): Map<string, number> {
  const nodes = graph.nodes;
  if (nodes.length === 0) return new Map();
  const pSum = [...personal.values()].reduce((a, b) => a + b, 0) || 1;
  const personalNorm = new Map<string, number>();
  for (const n of nodes) personalNorm.set(n, (personal.get(n) ?? 0) / pSum);

  let rank = new Map(nodes.map((n) => [n, personalNorm.get(n) ?? 0]));
  for (let iter = 0; iter < PAGE_RANK_MAX_ITER; iter++) {
    let dangling = 0;
    for (const n of nodes) {
      if (!graph.outWeight.has(n)) dangling += rank.get(n) ?? 0;
    }
    const next = new Map<string, number>();
    for (const n of nodes) {
      next.set(n, (1 - alpha) * (personalNorm.get(n) ?? 0) + alpha * dangling * (personalNorm.get(n) ?? 0));
    }
    for (const [from, list] of graph.edges) {
      const ow = graph.outWeight.get(from) ?? 0;
      if (ow === 0) continue;
      const share = alpha * ((rank.get(from) ?? 0) / ow);
      for (const { to, weight } of list) {
        next.set(to, (next.get(to) ?? 0) + share * weight);
      }
    }
    let delta = 0;
    for (const n of nodes) delta += Math.abs((next.get(n) ?? 0) - (rank.get(n) ?? 0));
    rank = next;
    if (delta < PAGE_RANK_TOLERANCE) break;
  }
  return rank;
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Binary-search the largest prefix of `lines` whose token estimate ≤ budget. */
export function packWithinBudget(lines: string[], tokenBudget: number): string[] {
  if (lines.length === 0 || tokenBudget <= 0) return [];
  const fits = (count: number) => estimateTokens(lines.slice(0, count).join('\n')) <= tokenBudget;
  if (!fits(1)) return [];
  let lo = 1;
  let hi = lines.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi + 1) / 2);
    if (fits(mid)) lo = mid;
    else hi = mid - 1;
    if (lo === hi) break;
  }
  return lines.slice(0, lo);
}
