/**
 * SA4E-360 — code_symbol_locate thin tool tests (TDD task T3).
 * Registration + JSON envelope + AF-4 classMethods enrichment + tenant passthrough.
 */
import { describe, it, expect, vi } from 'vitest';
import { registerCodeLocate, handleCodeLocate, CODE_LOCATE_TOOL_DEFINITION } from '../code-locate.js';

function register() {
  const server = { tool: vi.fn() };
  const queryLayer = {
    locateSymbol: vi.fn(async () => []),
    listClassMethods: vi.fn(async () => []),
  };
  registerCodeLocate(server as never, queryLayer as never);
  const [name, , schema, handler] = (server.tool as ReturnType<typeof vi.fn>).mock.calls[0];
  return { name, schema, handler, queryLayer };
}

describe('code_symbol_locate (SA4E-360 T3 thin tool)', () => {
  it('registers with the TDD §4.2 input schema', () => {
    const { name, schema } = register();
    expect(name).toBe('code_symbol_locate');
    expect(schema.class).toBeDefined();
    expect(schema.method).toBeDefined();
    expect(schema.limit).toBeDefined();
    expect(schema.__projectId).toBeDefined();
    expect(CODE_LOCATE_TOOL_DEFINITION.inputSchema.required).toEqual(['class', 'method']);
  });

  it('emits a compact JSON envelope with rows on exact match', async () => {
    const { handler, queryLayer } = register();
    (queryLayer.locateSymbol as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: 'create', kind: 'method', signature: 'create(root, locator)', filePath: 'a.ts', startLine: 40, endLine: 88, lineCount: 120, parentSymbol: 'ReadMethodTool' },
    ]);
    const out = await handler({ class: 'ReadMethodTool', method: 'create', limit: 25, __projectId: 'p1' });
    const parsed = JSON.parse(out.content[0].text);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ name: 'create', startLine: 40, endLine: 88, lineCount: 120 });
    expect(parsed.classMethods).toBeUndefined();
    expect(queryLayer.locateSymbol).toHaveBeenCalledWith('p1', 'ReadMethodTool', 'create', 25);
  });

  it('enriches with classMethods when the class matches but the method does not (AF-4)', async () => {
    const { handler, queryLayer } = register();
    (queryLayer.locateSymbol as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (queryLayer.listClassMethods as ReturnType<typeof vi.fn>).mockResolvedValue(['extractOutline', 'extractChunk']);
    const out = await handler({ class: 'SymbolOutlineExtractor', method: 'missingMethod' });
    const parsed = JSON.parse(out.content[0].text);
    expect(parsed.rows).toEqual([]);
    expect(parsed.classMethods).toEqual(['extractOutline', 'extractChunk']);
  });

  it('omits classMethods when the class itself is unknown (RM-08)', async () => {
    const { handler, queryLayer } = register();
    (queryLayer.locateSymbol as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (queryLayer.listClassMethods as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const out = await handler({ class: 'Ghost', method: 'x' });
    const parsed = JSON.parse(out.content[0].text);
    expect(parsed).toEqual({ rows: [] });
  });

  it('returns a structured error for missing arguments (never throws)', async () => {
    const { handler } = register();
    const out = await handler({});
    expect(JSON.parse(out.content[0].text).error).toContain('required');
  });

  it('handleCodeLocate stays a pure string function (dispatch path)', async () => {
    const queryLayer = {
      locateSymbol: vi.fn(async () => [{ name: 'build', kind: 'method', filePath: 'x.ts', startLine: 1, endLine: 2, lineCount: 9 }]),
      listClassMethods: vi.fn(async () => []),
    };
    const text = await handleCodeLocate({ class: 'C', method: 'build' }, queryLayer as never, 'tenant');
    expect(JSON.parse(text).rows).toHaveLength(1);
    expect(queryLayer.locateSymbol).toHaveBeenCalledWith('tenant', 'C', 'build', 25);
  });
});
