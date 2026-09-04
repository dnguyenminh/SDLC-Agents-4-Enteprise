/**
 * PegaResolutionResolver.ts — SA4E-237 (GD5). Classifies a staged rule reference against the
 * set of symbols indexed for a project.
 *
 * Resolution model (ported/adapted from the POC resolve/rules.ts, driven by the symbols table
 * rather than in-memory RuleAst since the backend does not persist raw rule JSON):
 *   - resolved   : exactly one indexed symbol matches (type + name), selected by class specificity.
 *   - ambiguous  : multiple candidates remain that differ by ruleset/version/circumstance —
 *                  cannot pick without runtime context.
 *   - external   : no candidate of that type+name is indexed (lives in a non-exported ruleset).
 *                  This is NOT an error — reported distinctly so it is never flagged as a bug.
 *   - unresolved : reserved for genuinely broken references; with a dataset-only view we treat
 *                  "not present" as external, so unresolved is only used defensively.
 *
 * Class specificity uses Pega PATTERN inheritance (strip trailing '-' segments) computed from
 * the FQN class token — the dominant mechanism, and the only one derivable without Rule-Obj-Class
 * definitions (which are not queryable post-index).
 */

import { parseFqn } from '../pega-mapping.js';

/** A candidate indexed symbol (from the symbols table). */
export interface SymbolCandidate {
  symbolId: number;
  fqn: string;
  pxObjClass: string;
  pyClassName: string;
  pyRuleName: string;
}

/** Outcome of resolving one reference. */
export interface ResolvedRef {
  status: 'resolved' | 'external' | 'unresolved' | 'ambiguous';
  targetSymbolId: number | null;
  detail: string;
}

/**
 * Index of all indexed symbols for a project, keyed for O(1) reference lookup by type+name.
 * Built once per resolution pass.
 */
export class SymbolIndex {
  /** key `${pxObjClass}\u0000${pyRuleName.toLowerCase()}` -> candidates */
  private byTypeName = new Map<string, SymbolCandidate[]>();

  /** Build the index from all Pega symbols in a project. */
  static build(candidates: SymbolCandidate[]): SymbolIndex {
    const idx = new SymbolIndex();
    for (const c of candidates) {
      const key = SymbolIndex.key(c.pxObjClass, c.pyRuleName);
      const list = idx.byTypeName.get(key);
      if (list) list.push(c);
      else idx.byTypeName.set(key, [c]);
    }
    return idx;
  }

  private static key(pxObjClass: string, ruleName: string): string {
    return `${pxObjClass}\u0000${(ruleName || '').toLowerCase()}`;
  }

  /** All candidates matching a rule type + name (any class/ruleset). */
  candidates(pxObjClass: string, ruleName: string): SymbolCandidate[] {
    return this.byTypeName.get(SymbolIndex.key(pxObjClass, ruleName)) ?? [];
  }
}

/**
 * Compute the first pattern parent by stripping the last '-' segment.
 * Mirrors ClassMapImpl.getFirstPossiblePatternParent (POC dictionary.patternParent).
 * @param className Class name
 */
function patternParent(className: string): string | null {
  const dash = className.lastIndexOf('-');
  if (dash === -1) return null;
  if (dash === className.length - 1) return className.slice(0, dash); // trailing dash
  return className.slice(0, dash + 1); // keep trailing dash (e.g. "MyCo-HR-")
}

/**
 * Ordered pattern-ancestor chain for a class (most specific first), terminating implicitly at
 * the root. Directed inheritance (pyDerivesFrom) is unavailable post-index, so pattern-only.
 * @param className Leaf class
 */
function patternChain(className: string): string[] {
  const chain: string[] = [];
  let c: string | null = className;
  const seen = new Set<string>();
  while (c && !seen.has(c)) {
    chain.push(c);
    seen.add(c);
    c = patternParent(c);
  }
  return chain;
}

/**
 * Resolve a single reference (target type/class/name) against the symbol index.
 * @param targetFqn Target FQN (type:class:name:ruleset:version; ruleset/version may be '-')
 * @param fromClass Applies-to class of the referencing rule (leaf context for specificity)
 * @param index Project symbol index
 */
export function resolveOneRef(targetFqn: string, fromClass: string, index: SymbolIndex): ResolvedRef {
  const t = parseFqn(targetFqn);
  const candidates = index.candidates(t.pxObjClass, t.pyRuleName);

  if (candidates.length === 0) {
    return { status: 'external', targetSymbolId: null, detail: 'not present in dataset (non-exported ruleset)' };
  }
  if (candidates.length === 1) {
    return { status: 'resolved', targetSymbolId: candidates[0].symbolId, detail: '' };
  }

  // Multiple candidates: rank by class specificity. Leaf = referenced class if given, else source class.
  const leaf = t.pyClassName && t.pyClassName !== '-' ? t.pyClassName : fromClass;
  const chain = patternChain(leaf);
  const rank = new Map<string, number>(chain.map((c, i) => [c, i])); // 0 = most specific

  let bestRank = Infinity;
  for (const c of candidates) {
    const r = rank.has(c.pyClassName) ? rank.get(c.pyClassName)! : Infinity;
    if (r < bestRank) bestRank = r;
  }
  const best = candidates.filter(
    (c) => (rank.has(c.pyClassName) ? rank.get(c.pyClassName)! : Infinity) === bestRank,
  );

  if (best.length === 1) {
    return { status: 'resolved', targetSymbolId: best[0].symbolId, detail: 'selected by class specificity' };
  }
  return {
    status: 'ambiguous',
    targetSymbolId: null,
    detail: `${best.length} candidates differ by ruleset/version/circumstance (needs runtime context)`,
  };
}
