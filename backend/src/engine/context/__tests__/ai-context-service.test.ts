/**
 * AIContextService unit tests — orchestration, budget enforcement, not-found path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { AIContextService } from '../ai-context-service.js';
import type { AIContextParams } from '../types.js';

type RowGetter = (sql: string, args: unknown[]) => unknown;
type RowAller = (sql: string, args: unknown[]) => unknown[];

function makeAdapter(get?: RowGetter, all?: RowAller) {
  return {
    getAsync: async (sql: string, args: unknown[] = []) => (get ? get(sql, args) : undefined),
    allAsync: async (sql: string, args: unknown[] = []) => (all ? all(sql, args) : []),
    prepare: (sql: string) => ({
      get: (...args: unknown[]) => (get ? get(sql, args) : undefined),
      all: (...args: unknown[]) => (all ? all(sql, args) : []),
    }),
  };
}

const SYMBOL = {
  id: 1,
  name: 'fetchUser',
  kind: 'function',
  filePath: 'src/fetch-user.ts',
  line: 10,
  parentSymbolId: null,
};

let workspace: string;

beforeEach(() => {
  workspace = path.join(os.tmpdir(), `sa4e-ai-context-${Date.now()}-${Math.random()}`);
});

function buildService(db: any, resolver: any, callGraph: any) {
  return new AIContextService(db, resolver, callGraph, workspace);
}

describe('AIContextService.getContext', () => {
  it('returns a not-found response with suggestions when resolution fails', async () => {
    const resolver = { resolve: vi.fn(async () => []), suggest: vi.fn(async () => ['nearMatch']) };
    const callGraph = { findCallers: vi.fn(), findCallees: vi.fn() };
    const service = buildService(makeAdapter(), resolver, callGraph);

    const res = await service.getContext({ symbol: 'missing', intent: 'explain', token_budget: 1000 });
    expect(res.symbol).toBe('missing');
    expect(res.kind).toBe('unknown');
    expect(res.context.error).toContain('missing');
    expect(res.context.suggestions).toEqual(['nearMatch']);
    expect(res.metadata.budget_used).toBe(0);
    expect(res.metadata.budget_total).toBe(1000);
    expect(resolver.suggest).toHaveBeenCalled();
  });

  it('assembles db-backed and graph-backed sections for the explain intent', async () => {
    const db = makeAdapter(
      (sql) => (sql.includes('doc_comment') ? { doc_comment: 'Loads a user by id.' } : undefined),
      (sql) => {
        if (sql.includes('parent_symbol_id')) return [{ name: 'siblingFn', kind: 'function', signature: 'siblingFn()', line: 20 }];
        if (sql.includes('r.kind = \'imports\'')) return [{ name: 'lodash', file_path: 'node_modules/lodash' }];
        if (sql.includes('type_alias')) return [{ name: 'UserDTO', kind: 'interface', signature: 'UserDTO', file: 'src/types.ts' }];
        return [];
      },
    );
    const resolver = { resolve: vi.fn(async () => [SYMBOL]), suggest: vi.fn(async () => []) };
    const callGraph = {
      findCallers: vi.fn(async () => ({ results: [] })),
      findCallees: vi.fn(async () => ({ results: [] })),
    };
    const service = buildService(db, resolver, callGraph);

    const res = await service.getContext({ symbol: 'fetchUser', intent: 'explain', token_budget: 4000 });
    expect(res.symbol).toBe('fetchUser');
    expect(res.file_path).toBe('src/fetch-user.ts');
    expect(res.kind).toBe('function');
    expect(res.intent).toBe('explain');
    expect(res.context.doc_comment).toBe('Loads a user by id.');
    expect(res.context.siblings).toEqual([{ name: 'siblingFn', kind: 'function', signature: 'siblingFn()', line: 20 }]);
    expect(res.context.imports).toEqual(['lodash']);
    expect(res.context.type_definitions).toEqual([{ name: 'UserDTO', kind: 'interface', signature: 'UserDTO', file: 'src/types.ts' }]);
    expect(res.metadata.sections_included).toEqual(expect.arrayContaining(['doc_comment', 'siblings', 'imports', 'type_definitions']));
    expect(res.metadata.sections_included[0]).toBe('doc_comment');
    expect(res.metadata.sections_omitted).toEqual([]);
    expect(res.metadata.budget_used).toBeGreaterThan(0);
    expect(res.metadata.budget_total).toBe(4000);
  });

  it('omits remaining sections once the budget is exhausted', async () => {
    const db = makeAdapter(
      (sql) => (sql.includes('doc_comment') ? { doc_comment: 'x'.repeat(10000) } : undefined),
      () => [{ name: 'siblingFn' }],
    );
    const resolver = { resolve: vi.fn(async () => [SYMBOL]), suggest: vi.fn(async () => []) };
    const callGraph = {
      findCallers: vi.fn(async () => ({ results: [] })),
      findCallees: vi.fn(async () => ({ results: [] })),
    };
    const service = buildService(db, resolver, callGraph);

    const res = await service.getContext({ symbol: 'fetchUser', intent: 'explain', token_budget: 800 });
    expect(res.context.doc_comment).toContain('(truncated)');
    expect(res.context.doc_comment_truncated).toBe(true);
    expect(res.metadata.sections_included).toEqual(['doc_comment']);
    expect(res.metadata.sections_omitted).toEqual(['siblings', 'imports', 'callers', 'callees', 'type_definitions']);
    expect(res.metadata.budget_used).toBe(800);
  });

  it('defaults intent and budget when parameters are omitted', async () => {
    const db = makeAdapter(
      (sql) => (sql.includes('doc_comment') ? { doc_comment: 'short' } : undefined),
      () => [],
    );
    const resolver = { resolve: vi.fn(async () => [SYMBOL]), suggest: vi.fn(async () => []) };
    const callGraph = {
      findCallers: vi.fn(async () => ({ results: [] })),
      findCallees: vi.fn(async () => ({ results: [] })),
    };
    const service = buildService(db, resolver, callGraph);

    const res = await service.getContext({ symbol: 'fetchUser' } as AIContextParams);
    expect(res.intent).toBe('explain');
    expect(res.metadata.budget_total).toBe(4000);
  });
});