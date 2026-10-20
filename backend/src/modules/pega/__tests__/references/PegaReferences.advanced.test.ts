import { describe, it, expect } from 'vitest';
import { PegaReferenceExtractor } from '../../references/PegaReferenceExtractor.js';
import { PegaImpactAnalyzer } from '../../references/PegaImpactAnalyzer.js';

describe('ImpactAnalyzer advanced scenarios', () => {
  const extractor = new PegaReferenceExtractor();
  const analyzer = new PegaImpactAnalyzer(extractor);

  it('analyzeChange with no dependents has local scope', () => {
    const graph = extractor.buildGraph([
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'Standalone', steps: [] },
    ]);
    const analysis = analyzer.analyzeChange('Standalone', graph);
    expect(analysis.directDependents).toEqual([]);
    expect(analysis.indirectDependents).toEqual([]);
    expect(analysis.impactScope).toBe('local');
  });

  it('analyzeChange on unknown rule returns safe defaults', () => {
    const graph = extractor.buildGraph([]);
    const analysis = analyzer.analyzeChange('NonExistent', graph);
    expect(analysis.ruleName).toBe('NonExistent');
    expect(analysis.risk).toBe('low');
    expect(analysis.impactScope).toBe('local');
  });

  it('toDot handles optional edges', () => {
    const graph = extractor.buildGraph([
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'Main', steps: [{ pyMethod: 'Call', pyMethodParameters: 'App.Sub' }] },
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'Sub', pyWhenCondition: 'OptionalWhen', steps: [] },
    ]);
    const dot = analyzer.toDot(graph);
    expect(dot).toContain('->');
  });

  it('impact scope escalates with multiple types', () => {
    const rules = [
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'Central', steps: [{ pyMethod: 'Call', pyMethodParameters: 'App.Util' }] },
      { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'App', pyActivityName: 'Util', steps: [] },
    ];
    const graph = extractor.buildGraph(rules);
    const analysis = analyzer.analyzeChange('Util', graph);
    expect(analysis.directDependents).toContain('Central');
  });
});
