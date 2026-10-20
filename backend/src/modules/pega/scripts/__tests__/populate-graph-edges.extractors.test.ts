/**
 * SA4E-87 — Tests for edge extractors used by the populate-graph-edges
 * script. Verifies edge extraction from Pega rule JSON.
 */

import { describe, it, expect } from 'vitest';
import {
  FlowEdgeExtractor,
  ActivityEdgeExtractor,
  ClassEdgeExtractor,
  BelongsToExtractor,
  DataTransformEdgeExtractor,
  DecisionTableEdgeExtractor,
} from '../edge-extractors.js';

describe('Edge Extractors', () => {
  describe('FlowEdgeExtractor', () => {
    const extractor = new FlowEdgeExtractor();

    it('supports Rule-Obj-Flow', () => {
      expect(extractor.supports('Rule-Obj-Flow')).toBe(true);
      expect(extractor.supports('Rule-Obj-Activity')).toBe(false);
    });

    it('extracts CALLS edges from flow shapes', () => {
      const flow = {
        pxObjClass: 'Rule-Obj-Flow',
        pyClassName: 'Work-Claim',
        pyFlowName: 'ProcessClaim',
        pyShapes: [
          { pyActivityName: 'ValidateData' },
          { pyFlowActionName: 'SubmitAction' },
          { pySomeOtherField: 'ignored' },
        ],
      };
      const edges = extractor.extract(flow);
      expect(edges).toHaveLength(2);
      expect(edges[0].label).toBe('CALLS');
      expect(edges[0].sourceId).toContain('Flow');
      expect(edges[0].targetId).toContain('ValidateData');
    });

    it('returns empty for flow without shapes', () => {
      const flow = { pxObjClass: 'Rule-Obj-Flow', pyFlowName: 'Empty' };
      expect(extractor.extract(flow)).toHaveLength(0);
    });
  });

  describe('ActivityEdgeExtractor', () => {
    const extractor = new ActivityEdgeExtractor();

    it('extracts CALLS from Call steps', () => {
      const activity = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Cover',
        pyActivityName: 'MainProcess',
        steps: [
          { pyMethod: 'Call', pyMethodParameters: 'Work-Cover.SubProcess' },
          { pyMethod: 'Branch', pyMethodParameters: 'HandleError' },
        ],
      };
      const edges = extractor.extract(activity);
      const calls = edges.filter(e => e.label === 'CALLS');
      expect(calls).toHaveLength(2);
      expect(calls[0].targetId).toContain('SubProcess');
      expect(calls[1].targetId).toContain('HandleError');
    });

    it('extracts USES from Property-Set steps', () => {
      const activity = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Cover',
        pyActivityName: 'SetStatus',
        steps: [
          { pyMethod: 'Property-Set', pyMethodParameters: '.pyStatusWork' },
        ],
      };
      const edges = extractor.extract(activity);
      const uses = edges.filter(e => e.label === 'USES');
      expect(uses).toHaveLength(1);
      expect(uses[0].targetId).toContain('pyStatusWork');
    });
  });

  describe('ClassEdgeExtractor', () => {
    const extractor = new ClassEdgeExtractor();

    it('extracts INHERITS from pySuperClass', () => {
      const cls = {
        pxObjClass: 'Rule-Obj-Class',
        pyClassName: 'Work-Claim-Auto',
        pySuperClass: 'Work-Claim',
      };
      const edges = extractor.extract(cls);
      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('INHERITS');
      expect(edges[0].targetId).toContain('Work-Claim');
    });

    it('ignores @baseclass parent', () => {
      const cls = {
        pxObjClass: 'Rule-Obj-Class',
        pyClassName: 'Work-Root',
        pySuperClass: '@baseclass',
      };
      expect(extractor.extract(cls)).toHaveLength(0);
    });
  });

  describe('BelongsToExtractor', () => {
    const extractor = new BelongsToExtractor();

    it('extracts BELONGS_TO for rule with class', () => {
      const rule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Claim',
        pyRuleName: 'ProcessData',
      };
      const edges = extractor.extract(rule);
      expect(edges).toHaveLength(1);
      expect(edges[0].label).toBe('BELONGS_TO');
      expect(edges[0].targetId).toContain('Work-Claim');
    });

    it('skips rules with @baseclass', () => {
      const rule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: '@baseclass',
        pyRuleName: 'GenericActivity',
      };
      expect(extractor.extract(rule)).toHaveLength(0);
    });
  });

  describe('DataTransformEdgeExtractor', () => {
    const extractor = new DataTransformEdgeExtractor();

    it('extracts READS and WRITES from actions', () => {
      const dt = {
        pxObjClass: 'Rule-Obj-Model',
        pyClassName: 'Work-Claim',
        pyModelName: 'MapData',
        pyActions: [
          { pyTarget: '.pyDescription', pySource: '.pyInputData' },
          { pyTarget: '.pyStatus' },
        ],
      };
      const edges = extractor.extract(dt);
      const writes = edges.filter(e => e.label === 'WRITES');
      const reads = edges.filter(e => e.label === 'READS');
      expect(writes).toHaveLength(2);
      expect(reads).toHaveLength(1);
    });
  });

  describe('DecisionTableEdgeExtractor', () => {
    const extractor = new DecisionTableEdgeExtractor();

    it('extracts EVALUATES from condition columns', () => {
      const dt = {
        pxObjClass: 'Rule-Decision-Table',
        pyClassName: 'Work-Claim',
        pyRuleName: 'EligibilityCheck',
        pyConditions: [
          { pyProperty: '.pyAge' },
          { pyColumnProperty: '.pyIncome' },
        ],
      };
      const edges = extractor.extract(dt);
      expect(edges).toHaveLength(2);
      expect(edges[0].label).toBe('EVALUATES');
      expect(edges[0].targetId).toContain('pyAge');
    });
  });
});
