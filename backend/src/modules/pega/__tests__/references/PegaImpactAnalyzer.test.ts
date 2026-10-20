import { describe, it, expect } from 'vitest';
import { PegaReferenceExtractor } from '../../references/PegaReferenceExtractor.js';
import { PegaImpactAnalyzer } from '../../references/PegaImpactAnalyzer.js';
import type { DependencyGraph } from '../../references/PegaReferenceExtractor.js';

describe('PegaImpactAnalyzer', () => {
  const extractor = new PegaReferenceExtractor();
  const analyzer = new PegaImpactAnalyzer(extractor);

  function buildSampleGraph(): DependencyGraph {
    return extractor.buildGraph([
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'TopFlow', steps: [{ pyMethod: 'Call', pyMethodParameters: 'App.MiddleFlow' }] },
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'MiddleFlow', steps: [{ pyMethod: 'Call', pyMethodParameters: 'App.BottomFlow' }] },
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'BottomFlow', steps: [{ pyMethod: 'Call', pyMethodParameters: 'App.LeafUtil' }] },
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'LeafUtil', steps: [] },
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'IndependentFlow', steps: [] },
    ]);
  }

  it('analyzeChange with one dependent', () => {
    const graph = buildSampleGraph();
    const analysis = analyzer.analyzeChange('LeafUtil', graph);
    expect(analysis.directDependents).toContain('BottomFlow');
    expect(analysis.directDependents.length).toBe(1);
  });

  it('analyzeChange with transitive dependents', () => {
    const graph = buildSampleGraph();
    const analysis = analyzer.analyzeChange('LeafUtil', graph);
    expect(analysis.indirectDependents.length).toBeGreaterThanOrEqual(2);
    expect(analysis.indirectDependents).toContain('MiddleFlow');
    expect(analysis.indirectDependents).toContain('TopFlow');
  });

  it('assigns correct risk level', () => {
    const graph = buildSampleGraph();
    const analysis = analyzer.analyzeChange('TopFlow', graph);
    expect(['low', 'medium', 'high']).toContain(analysis.risk);
    expect(analysis.impactScope).toMatch(/^(local|module|crossModule|system)$/);
  });

  it('analyzeBatch analyzes multiple rules', () => {
    const graph = buildSampleGraph();
    const results = analyzer.analyzeBatch(['TopFlow', 'LeafUtil'], graph);
    expect(results.size).toBe(2);
    expect(results.has('TopFlow')).toBe(true);
    expect(results.has('LeafUtil')).toBe(true);
  });

  it('suggests tests based on impact', () => {
    const graph = buildSampleGraph();
    const analysis = analyzer.analyzeChange('LeafUtil', graph);
    const tests = analyzer.suggestTests(analysis, graph.nodes.map(n => n.name));
    expect(tests.length).toBeGreaterThanOrEqual(1);
    expect(tests.some(t => t.includes('LeafUtil'))).toBe(true);
  });

  it('suggests rule-type-specific tests', () => {
    const graph = extractor.buildGraph([
      { pxObjClass: 'Rule-Obj-When', pyClassName: 'App', pyWhenCondition: 'IsActive', pyRuleName: 'IsActive' },
    ]);
    const analysis = analyzer.analyzeChange('IsActive', graph);
    const tests = analyzer.suggestTests(analysis, graph.nodes.map(n => n.name));
    expect(tests.some(t => t.toLowerCase().includes('condition') || t.toLowerCase().includes('evaluates'))).toBe(true);
  });

  it('toDot generates valid DOT format', () => {
    const graph = buildSampleGraph();
    const dot = analyzer.toDot(graph);
    expect(dot).toContain('digraph PegaDependencies');
    expect(dot).toContain('->');
    expect(dot).toContain('rankdir=LR');
    expect(dot.endsWith('}')).toBe(true);
    for (const node of graph.nodes) {
      expect(dot).toContain(node.name);
    }
  });
});
