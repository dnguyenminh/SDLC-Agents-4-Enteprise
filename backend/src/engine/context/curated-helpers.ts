import Database from 'better-sqlite3';
import { SymbolResolver } from '../graph/symbol-resolver.js';
import { GraphTraverser } from '../graph/traverser.js';
import { QueryLayer } from '../query/query-layer.js';
import { QueryAnalysis } from './types.js';
import { BudgetAllocator, AllocatedResult } from './budget-allocator.js';
import { ContextSection, ContextItem } from './types.js';

export async function searchCode(
  analysis: { ftsQuery: string; symbolCandidates: string[] },
  queryLayer: QueryLayer,
  resolver: SymbolResolver,
  projectId?: string
): Promise<{ source: string; results: any[] }> {
  try {
    const ftsResults = queryLayer.searchCode(projectId, analysis.ftsQuery, 30);

    const symbolResults: any[] = [];
    for (const candidate of analysis.symbolCandidates.slice(0, 5)) {
      const resolved = resolver.resolve(candidate);
      for (const sym of resolved.slice(0, 3)) {
        symbolResults.push({
          id: sym.id, name: sym.name, kind: sym.kind,
          file: sym.filePath, line: sym.line, signature: null
        });
      }
    }

    const combined = miniRRF(
      ftsResults.map(r => ({
        id: undefined, name: r.name, kind: r.kind, file: r.filePath,
        line: r.startLine, signature: r.signature, source_code: null
      })),
      symbolResults
    );

    return { source: 'code', results: combined.slice(0, 20) };
  } catch {
    return { source: 'code', results: [] };
  }
}

export async function searchMemory(
  analysis: { ftsQuery: string; keywords: string[] },
  db: Database.Database,
  projectId?: string
): Promise<{ source: string; results: any[] }> {
  try {
    // SA4E-41 §6.4: fail-closed — never search the shared KB without a tenant scope.
    if (!projectId) return { source: 'memory', results: [] };
    const query = analysis.keywords.slice(0, 5).join(' ');
    // Scope KB results to the tenant's project_id (mirrors the memory IsolationLayer).
    const rows = db.prepare(`
      SELECT id, content, summary, type, tags, created_at
      FROM knowledge_entries
      WHERE project_id = ?
        AND id IN (
          SELECT rowid FROM knowledge_fts WHERE knowledge_fts MATCH ?
        )
      ORDER BY created_at DESC
      LIMIT 10
    `).all(projectId, query) as any[];

    return {
      source: 'memory',
      results: rows.map(r => ({
        id: r.id,
        name: r.summary || r.content?.substring(0, 50) || 'entry',
        kind: r.type || 'memory',
        content: r.summary || r.content?.substring(0, 200),
        file: undefined, line: undefined
      }))
    };
  } catch {
    return { source: 'memory', results: [] };
  }
}

export async function expandGraph(topSymbols: any[], traverser: GraphTraverser): Promise<{ source: string; results: any[] }> {
  const expanded: any[] = [];
  const seen = new Set<string>();

  for (const symbol of topSymbols) {
    try {
      const startNode = traverser.resolveNode(symbol.name);
      if (!startNode) continue;

      const results = traverser.traverse(startNode, {
        edgeTypes: ['calls', 'imports', 'inherits'],
        nodeTypes: [],
        direction: 'both',
        maxDepth: 1,
        maxResults: 5
      });

      for (const r of results) {
        const key = `${r.node.name}:${r.node.filePath}`;
        if (seen.has(key)) continue;
        seen.add(key);

        expanded.push({
          id: r.node.id, name: r.node.name, kind: r.node.kind,
          file: r.node.filePath, line: r.node.startLine,
          relationship: `${r.edgeType} ${symbol.name}`
        });
      }
    } catch { /* skip */ }
  }

  return { source: 'graph', results: expanded };
}

export function miniRRF(listA: any[], listB: any[]): any[] {
  const k = 60;
  const scores = new Map<string, { score: number; item: any }>();

  for (let i = 0; i < listA.length; i++) {
    const key = listA[i].name + ':' + (listA[i].file || '');
    scores.set(key, { score: 1 / (k + i), item: listA[i] });
  }

  for (let i = 0; i < listB.length; i++) {
    const key = listB[i].name + ':' + (listB[i].file || '');
    if (scores.has(key)) {
      scores.get(key)!.score += 1 / (k + i);
    } else {
      scores.set(key, { score: 1 / (k + i), item: listB[i] });
    }
  }

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(e => e.item);
}

export function formatSections(allocated: AllocatedResult[]): ContextSection[] {
  const bySource = new Map<string, ContextItem[]>();

  for (const item of allocated) {
    const source = (item.sources?.[0] || 'code') as 'code' | 'memory' | 'graph';
    if (!bySource.has(source)) bySource.set(source, []);

    bySource.get(source)!.push({
      name: item.name, kind: item.kind, file: item.file, line: item.line,
      relevance: item.relevance_score, detail: item.detail,
      content: item.content, relationship: item.relationship
    });
  }

  const sections: ContextSection[] = [];
  const titleMap: Record<string, string> = {
    code: 'Code Symbols', memory: 'Knowledge Base', graph: 'Related (Graph)'
  };

  for (const [source, items] of bySource) {
    sections.push({
      title: titleMap[source] || source,
      source: source as 'code' | 'memory' | 'graph',
      items
    });
  }

  return sections;
}
