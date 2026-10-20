import { describe, it, expect, beforeEach } from 'vitest';
import { PegaRuleUnderstandingService } from '../../understanding/PegaRuleUnderstandingService.js';
import { PegaMetaModelRegistry } from '../../metamodel/PegaMetaModelRegistry.js';
import {
  ACTIVITY_FIXTURE,
  SIMPLE_RULE_FIXTURE,
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

  // ── Simulation ────────────────────────────────────────────────────────

  describe('Simulation', () => {
    it('Simulation result is included when options.simulate is true', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE, { simulate: true });
      expect(u.simulation).not.toBeNull();
      expect(u.simulation!.result).not.toBeNull();
    });

    it('Simulation is null when options.simulate is false (default)', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.simulation).toBeNull();
    });

    it('Simulation works with custom input', async () => {
      const customInput = {
        pyWorkPage: {
          pyTotal: 1000,
          pyCustomerTier: 'Gold',
        },
      };
      const u = await service.understand(ACTIVITY_FIXTURE, {
        simulate: true,
        simulateInput: customInput,
      });
      expect(u.simulation).not.toBeNull();
      expect(u.simulation!.input).toEqual(customInput);
    });
  });

  // ── Prompt Context ────────────────────────────────────────────────────

  describe('Prompt context', () => {
    it('toPromptContext includes rule identity line', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.promptContext).toContain('Rule Understanding');
      expect(u.promptContext).toContain('CalculateOrderTotal');
    });

    it('toPromptContext includes schema section', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.promptContext).toContain('Schema');
      expect(u.promptContext).toContain('Rule Type:');
    });

    it('toPromptContext includes semantic analysis section', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.promptContext).toContain('Semantic Analysis');
      expect(u.promptContext).toContain('Summary:');
    });

    it('toPromptContext includes dependencies section', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.promptContext).toContain('Dependencies');
      expect(u.promptContext).toContain('CalculateDiscount');
    });

    it('toPromptContext includes simulation section (when present)', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE, { simulate: true });
      expect(u.promptContext).toContain('Simulation');
      expect(u.promptContext).toContain('Step');
    });

    it('toPromptContext excludes simulation section (when absent)', async () => {
      const u = await service.understand(ACTIVITY_FIXTURE);
      expect(u.promptContext).not.toContain('Simulation');
    });

    it('toPromptContext is non-empty string', async () => {
      const u = await service.understand(SIMPLE_RULE_FIXTURE);
      expect(u.promptContext).toBeTruthy();
      expect(u.promptContext.length).toBeGreaterThan(50);
    });
  });
});
