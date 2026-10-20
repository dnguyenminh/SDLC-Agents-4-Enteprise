import { describe, it, expect, beforeEach } from 'vitest';
import { PegaRuleUnderstandingService } from '../../understanding/PegaRuleUnderstandingService.js';
import { PegaMetaModelRegistry } from '../../metamodel/PegaMetaModelRegistry.js';
import {
  ACTIVITY_FIXTURE,
  DATA_TRANSFORM_FIXTURE,
  DECISION_TABLE_FIXTURE,
  FLOW_FIXTURE,
  UNKNOWN_RULE_FIXTURE,
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

  // ── Basic Rule Types ──────────────────────────────────────────────────

  describe('Understanding basic rule types', () => {
    it('Understand Activity — returns correct pxObjClass, name, className, fqn', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.pxObjClass).toBe('Rule-Obj-Activity');
      expect(u.name).toBe('CalculateOrderTotal');
      expect(u.className).toBe('Work-Order');
      expect(u.fqn).toBe('Rule-Obj-Activity:Work-Order:CalculateOrderTotal');
    });

    it('Understand DataTransform — returns correct summary', async () => {
      const u = await service.understand(DATA_TRANSFORM_FIXTURE);
      expect(u.pxObjClass).toBe('Rule-Obj-Model');
      expect(u.name).toBe('InitializeOrderData');
      expect(u.semantics.summary).toContain('data transform');
    });

    it('Understand DecisionTable — returns conditions and results', async () => {
      const u = await service.understand(DECISION_TABLE_FIXTURE);
      expect(u.pxObjClass).toBe('Rule-Declare-DecisionTable');
      expect(u.semantics.conditions.length).toBeGreaterThanOrEqual(1);
      expect(u.semantics.summary).toContain('DetermineDiscountTable');
    });

    it('Understand Flow — returns route description', async () => {
      const u = await service.understand(FLOW_FIXTURE);
      expect(u.pxObjClass).toBe('Rule-Obj-Flow');
      expect(u.name).toBe('OrderProcessingFlow');
      expect(u.semantics.summary).toContain('starts at');
    });
  });

  // ── Schema Integration ────────────────────────────────────────────────

  describe('Schema integration', () => {
    it('Schema field documentation is included in result', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.schema.fieldDocs).toBeTruthy();
      expect(u.schema.fieldDocs.length).toBeGreaterThan(0);
      expect(u.schema.fieldDocs).toContain('Rule Type:');
      expect(u.schema.fieldDocs).toContain('Fields:');
    });

    it('Inferred flag is false for known types, true for unknown types', async () => {
      const known = await service.understand(ACTIVITY_FIXTURE);
      expect(known.schema.inferred).toBe(false);

      const unknown = await service.understand(UNKNOWN_RULE_FIXTURE);
      expect(unknown.schema.inferred).toBe(true);
    });

    it('ensureSchema is called and inferred schemas are available as classDefinition', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.schema.classDefinition).toBeDefined();
      expect(u.schema.classDefinition.pxObjClass).toBe('Rule-Obj-Activity');
      expect(Array.isArray(u.schema.classDefinition.properties)).toBe(true);
    });
  });

  // ── Semantic Analysis Integration ────────────────────────────────────

  describe('Semantic analysis integration', () => {
    it('Semantic summary is included in result', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.semantics.summary).toBeTruthy();
      expect(u.semantics.summary).toContain('Calculate Order Total');
    });

    it('Semantic intent is included in result', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.semantics.intent).toBeTruthy();
    });

    it('Side effects are included in result', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.semantics.sideEffects.length).toBeGreaterThan(0);
      const sets = u.semantics.sideEffects.filter(s => s.type === 'page_update');
      expect(sets.length).toBeGreaterThanOrEqual(2);
    });

    it('Data flow is included in result', async () => {
      const u = await service.understand(DATA_TRANSFORM_FIXTURE);
      expect(u.semantics.dataFlow.length).toBeGreaterThan(0);
      const dataEntry = u.semantics.dataFlow[0];
      expect(dataEntry.input).toBeDefined();
      expect(dataEntry.output).toBeDefined();
    });
  });

  // ── Reference Integration ────────────────────────────────────────────

  describe('Reference integration', () => {
    it('Dependencies from ReferenceExtractor are included', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.dependencies.length).toBeGreaterThan(0);
      const calls = u.dependencies.filter(d => d.relation === 'calls');
      expect(calls.length).toBeGreaterThanOrEqual(1);
      expect(calls.some(d => d.name === 'CalculateDiscount')).toBe(true);
    });

    it('Empty dependencies when rule has no references', async () => {
      const simpleRule = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Order',
        pyActivityName: 'NoOpActivity',
        steps: [] as never[],
      };
      const u = await service.understand(simpleRule);
      expect(u.dependencies).toBeDefined();
      expect(Array.isArray(u.dependencies)).toBe(true);
    });
  });
});
