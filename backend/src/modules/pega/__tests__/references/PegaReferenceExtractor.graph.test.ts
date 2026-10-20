import { describe, it, expect } from 'vitest';
import { PegaReferenceExtractor } from '../../references/PegaReferenceExtractor.js';

describe('PegaReferenceExtractor', () => {
  const extractor = new PegaReferenceExtractor();

  describe('buildGraph', () => {
    it('builds nodes and edges from multiple rules', () => {
      const rules = [
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Work-Cover-Jira', pyActivityName: 'MainFlow', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Work-Cover-Jira.SubFlow' }] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Work-Cover-Jira', pyActivityName: 'SubFlow', steps: [] },
      ];
      const graph = extractor.buildGraph(rules);
      expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
      expect(graph.edges.length).toBeGreaterThanOrEqual(1);
      expect(graph.edges[0].source).toContain('MainFlow');
      expect(graph.edges[0].target).toContain('SubFlow');
    });
  });

  describe('findCycles', () => {
    it('detects a simple cycle between two rules', () => {
      const rules = [
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'A', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.B' }] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'B', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.A' }] },
      ];
      const graph = extractor.buildGraph(rules);
      const cycles = extractor.findCycles(graph);
      expect(cycles.length).toBeGreaterThanOrEqual(1);
      expect(cycles[0].length).toBeGreaterThanOrEqual(2);
    });
    it('detects a longer cycle with three rules', () => {
      const rules = [
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'X', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.Y' }] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Y', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.Z' }] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Z', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.X' }] },
      ];
      const graph = extractor.buildGraph(rules);
      const cycles = extractor.findCycles(graph);
      expect(cycles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('calculateDepth', () => {
    it('calculates depth for a deeply nested rule', () => {
      const rules = [
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Root', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.Level1' }] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Level1', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.Level2' }] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Level2', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.Level3' }] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Level3', steps: [] },
      ];
      const graph = extractor.buildGraph(rules);
      const depth = extractor.calculateDepth('Root', graph);
      expect(depth).toBe(3);
    });
  });

  describe('findOrphans', () => {
    it('finds rules not referenced by anything', () => {
      const rules = [
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Called', steps: [] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Caller', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.Called' }] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Orphaned', steps: [] },
      ];
      const graph = extractor.buildGraph(rules);
      const orphans = extractor.findOrphans(graph);
      expect(orphans).toContain('Orphaned');
      expect(orphans).toContain('Caller');
      expect(orphans).not.toContain('Called');
    });
  });

  describe('getDependents', () => {
    it('finds rules that depend on a specific rule', () => {
      const rules = [
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'SharedUtil', steps: [] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Alpha', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.SharedUtil' }] },
        { pxObjClass: 'Rule-Obj-Activity', pyClassName: 'Test', pyActivityName: 'Beta', steps: [{ pyMethod: 'Call', pyMethodParameters: 'Test.SharedUtil' }] },
      ];
      const graph = extractor.buildGraph(rules);
      const dependents = extractor.getDependents('SharedUtil', graph);
      expect(dependents).toContain('Alpha');
      expect(dependents).toContain('Beta');
      expect(dependents).not.toContain('SharedUtil');
    });
  });
});
