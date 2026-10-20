import { describe, it, expect, beforeEach } from 'vitest';
import { PegaRuleUnderstandingService } from '../../understanding/PegaRuleUnderstandingService.js';
import { PegaMetaModelRegistry } from '../../metamodel/PegaMetaModelRegistry.js';
import {
  ACTIVITY_FIXTURE,
  DATA_TRANSFORM_FIXTURE,
  DECISION_TABLE_FIXTURE,
  FLOW_FIXTURE,
  makeUniqueUnknownFixture,
  createService,
  schemasDir,
} from './fixtures.js';

describe('PegaRuleUnderstandingService', () => {
  let service: PegaRuleUnderstandingService;

  beforeEach(async () => {
    const registry = PegaMetaModelRegistry.getInstance();
    if (!registry.isKnownClass('@baseclass')) {
      await registry.initialize(schemasDir);
    }
    service = createService();
  });

  // ── Edge Cases (simulation, inference and error handling) ─────────────

  describe('Edge cases', () => {
    it('Simulation trace contains step entries', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE, { simulate: true });
      expect(u.simulation).not.toBeNull();
      expect(u.simulation!.trace.length).toBeGreaterThan(0);
      expect(u.simulation!.trace[0].step).toBeDefined();
      expect(u.simulation!.trace[0].action).toBeDefined();
    });

    it('Simulation with DataTransform produces trace', async () => {
      const u = await service.understand(DATA_TRANSFORM_FIXTURE, { simulate: true });
      expect(u.simulation).not.toBeNull();
      expect(u.simulation!.trace.length).toBeGreaterThan(0);
      const startTrace = u.simulation!.trace.find(t => t.action === 'start');
      expect(startTrace).toBeDefined();
      expect(startTrace!.detail).toContain('InitializeOrderData');
    });

    it('Simulation with DecisionTable produces trace', async () => {
      const u = await service.understand(DECISION_TABLE_FIXTURE, { simulate: true });
      expect(u.simulation).not.toBeNull();
      expect(u.simulation!.trace.length).toBeGreaterThan(0);
    });

    it('Simulation with Flow produces trace', async () => {
      const u = await service.understand(FLOW_FIXTURE, { simulate: true });
      expect(u.simulation).not.toBeNull();
      expect(u.simulation!.trace.length).toBeGreaterThan(0);
    });

    it('Unknown rule type still builds complete understanding', async () => {
      const fixture = makeUniqueUnknownFixture();
      const u = await service.understand(fixture);
      expect(u.schema.inferred).toBe(true);
      expect(u.schema.fieldDocs).toBeTruthy();
      expect(u.semantics.summary).toBeTruthy();
      expect(u.dependencies).toBeDefined();
    });

    it('toPromptContext handles simulation with errors', async () => {
      const broken = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Test',
        pyActivityName: 'BrokenRule',
        steps: [
          { pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'Work-Test.NonExistent' },
        ],
      };
      const u = await service.understand(broken, { simulate: true });
      expect(u.simulation).not.toBeNull();
      expect(u.promptContext).toContain('Simulation');
    });
  });
});
