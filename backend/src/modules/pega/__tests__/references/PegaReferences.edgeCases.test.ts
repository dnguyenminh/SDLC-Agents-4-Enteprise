import { describe, it, expect } from 'vitest';
import { PegaReferenceExtractor, extractPegaName } from '../../references/PegaReferenceExtractor.js';

describe('Edge cases', () => {
  const extractor = new PegaReferenceExtractor();

  it('empty rule returns empty references', () => {
    const deps = extractor.extractFromRule({});
    expect(deps).toEqual([]);
  });

  it('handles malformed JSON gracefully', () => {
    const deps = extractor.extractFromRule(null as unknown as Record<string, unknown>);
    expect(deps).toEqual([]);
  });

  it('partial JSON does not throw', () => {
    const deps = extractor.extractFromRule({ pxObjClass: 'Rule-Obj-Activity' } as Record<string, unknown>);
    expect(Array.isArray(deps)).toBe(true);
  });

  it('auto-detects reference fields using naming conventions', () => {
    const json = {
      pxObjClass: 'Rule-Connect-REST',
      pyClassName: 'App',
      pyRuleName: 'MyConnector',
      pyCustomTransform: 'MapData',
      pyMyCondition: 'CheckFlag',
      pyTargetClass: 'App-Class',
    };
    const deps = extractor.extractFromRule(json);
    expect(deps.some(d => d.name === 'MapData' && d.type === 'Rule-Obj-Model')).toBe(true);
    expect(deps.some(d => d.name === 'CheckFlag' && d.type === 'Rule-Obj-When')).toBe(true);
    expect(deps.some(d => d.name === 'App-Class' && d.type === 'Rule-Obj-Class')).toBe(true);
  });

  it('deduplicates references', () => {
    const json = {
      pxObjClass: 'Rule-Obj-Activity',
      pyClassName: 'Test',
      pyActivityName: 'DupCheck',
      pyMethodParameters: 'Test.Foo',
      steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.Foo' }],
    };
    const deps = extractor.extractFromRule(json);
    const fooRefs = deps.filter(d => d.name === 'Foo');
    expect(fooRefs.length).toBe(1);
  });

  it('pxRuleReferences are extracted', () => {
    const json = {
      pxObjClass: 'Rule-Decision-Strategy',
      pyClassName: 'App',
      pyName: 'TestStrategy',
      pxRuleReferences: [
        { pxRuleObjClass: 'Rule-Obj-Activity', pyRuleName: 'RefActivity' },
        { pxRuleObjClass: 'Rule-Obj-When', pyRuleName: 'RefWhen' },
      ],
    };
    const deps = extractor.extractFromRule(json);
    expect(deps.some(d => d.name === 'RefActivity' && d.type === 'Rule-Obj-Activity')).toBe(true);
    expect(deps.some(d => d.name === 'RefWhen' && d.type === 'Rule-Obj-When')).toBe(true);
  });

  it('extractPegaName helper works', () => {
    expect(extractPegaName({ pyActivityName: 'TestActivity' })).toBe('TestActivity');
    expect(extractPegaName({ pyRuleName: 'MyRule', pyLabel: 'Label' })).toBe('MyRule');
    expect(extractPegaName({})).toBe('Unnamed');
  });

  it('buildGraph with no rules returns empty graph', () => {
    const graph = extractor.buildGraph([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
