import { describe, it, expect, beforeEach } from 'vitest';
import { PegaRuleUnderstandingService } from '../../understanding/PegaRuleUnderstandingService.js';
import { PegaMetaModelRegistry } from '../../metamodel/PegaMetaModelRegistry.js';
import {
  ACTIVITY_FIXTURE,
  DATA_TRANSFORM_FIXTURE,
  DECISION_TABLE_FIXTURE,
  EMPTY_JSON,
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

  // ── Edge Cases ─────────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('Understand handles empty JSON gracefully', async () => {
      const u = await service.understand(EMPTY_JSON);
      expect(u).toBeDefined();
      expect(u.pxObjClass).toBe('Rule-Obj-Activity');
      expect(u.name).toBe('Unnamed');
      expect(u.fqn).toBe('Rule-Obj-Activity:@baseclass:Unnamed');
    });

    it('Understand handles unknown rule type (triggers inference)', async () => {
      const fixture = makeUniqueUnknownFixture();
      const u = await service.understand(fixture);
      expect(u.schema.inferred).toBe(true);
      expect(u.schema.classDefinition.properties.length).toBeGreaterThan(0);
      const hasThreshold = u.schema.classDefinition.properties.some(
        p => p.name === 'pyThreshold',
      );
      expect(hasThreshold).toBe(true);
    });

    it('Understand handles missing pxObjClass (uses default)', async () => {
      const noClass = {
        pyClassName: 'Work-Order',
        pyRuleName: 'DefaultRule',
        pyLabel: 'Default Label',
      };
      const u = await service.understand(noClass);
      expect(u.pxObjClass).toBe('Rule-Obj-Activity');
      expect(u.name).toBe('DefaultRule');
    });

    it('Integration: understand → toPromptContext → LLM-ready string', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      const ctx = u.promptContext;
      expect(ctx).toContain('╔');
      expect(ctx).toContain('║');
      expect(ctx).toContain('╚');
      expect(ctx).toContain('Schema');
      expect(ctx).toContain('Semantic Analysis');
      expect(ctx).toContain('Dependencies');
      expect(u.schema.fieldDocs.length).toBeGreaterThan(0);
    });

    it('Integration: multiple understands do not interfere', async () => {
      const u1 = await service.understand(ACTIVITY_FIXTURE);
      const u2 = await service.understand(DATA_TRANSFORM_FIXTURE);
      expect(u1.name).toBe('CalculateOrderTotal');
      expect(u2.name).toBe('InitializeOrderData');
      expect(u1.fqn).not.toBe(u2.fqn);
      expect(u1.semantics.summary).toContain('activity');
      expect(u2.semantics.summary).toContain('data transform');
    });

    it('toPromptContext formatting includes box-drawing characters for identity', async () => {
      const ctx = service.toPromptContext({
        pxObjClass: 'Rule-Obj-Activity',
        name: 'TestRule',
        className: 'Work-Test',
        fqn: 'Rule-Obj-Activity:Work-Test:TestRule',
        schema: {
          classDefinition: { pxObjClass: 'Rule-Obj-Activity', properties: [], children: [] },
          fieldDocs: 'Rule Type: Rule-Obj-Activity\nFields:\n  pyTest (string, optional) — Test field',
          inferred: false,
        },
        semantics: {
          summary: 'Test summary',
          intent: 'Test intent',
          sideEffects: [],
          dataFlow: [],
          conditions: [],
        },
        dependencies: [],
        dependencyGraph: '',
        simulation: null,
        promptContext: '',
      });
      expect(ctx.startsWith('╔')).toBe(true);
      expect(ctx).toContain('║');
      expect(ctx).toContain('╚');
      expect(ctx).toContain('║  Rule Understanding: TestRule');
      expect(ctx).toContain('║  Type: Rule-Obj-Activity');
      expect(ctx).toContain('║  Class: Work-Test');
    });

    it('dependencyGraph text representation is non-empty when deps exist', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.dependencyGraph.length).toBeGreaterThan(0);
      expect(u.dependencyGraph).toContain('CalculateDiscount');
    });

    it('dependencyGraph empty when no deps present', async () => {
      const noDeps = {
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Order',
        pyActivityName: 'EmptyActivity',
        pyLabel: 'Empty',
      };
      const u = await service.understand(noDeps);
      expect(u.dependencyGraph).toBe('');
    });

    it('toPromptContext includes dependency graph in dependencies section', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.promptContext).toContain('Graph:');
    });

    it('toPromptContext conditions section shown when conditions exist', async () => {
      const u = await service.understand(DECISION_TABLE_FIXTURE);
      if (u.semantics.conditions.length > 0) {
        expect(u.promptContext).toContain('Conditions:');
        expect(u.promptContext).toContain('WHEN');
      }
    });
  });
});
