import { describe, it, expect, beforeAll } from 'vitest';
import { PegaMetaModelLoader, PegaMetaModelCompiler, PegaMetaModelService } from '../../metamodel/index.js';
import { PegaParserRegistry } from '../../strategies/PegaParserRegistry.js';
import { setupMetaModel, schemasDir } from './helpers.js';

describe('PegaMetaModelCompiler', () => {
  let loader: PegaMetaModelLoader;
  let compiler: PegaMetaModelCompiler;

  beforeAll(async () => {
    ({ loader, compiler } = await setupMetaModel());
  });

  // ---------------------------------------------------------------------------
  // Test 7: Integration: PegaParserRegistry uses compiled strategy for a class
  // ---------------------------------------------------------------------------
  describe('Test 7: PegaParserRegistry integration', () => {
    it('PegaParserRegistry uses compiled strategy for a class', () => {
      const parserRegistry = new PegaParserRegistry();

      // Compile and register strategies for connect classes
      const connectDef = loader.getClass('Rule-Connect-REST');
      expect(connectDef).toBeDefined();
      const strategy = compiler.compileStrategy(connectDef!);
      parserRegistry.registerStrategy(strategy);

      // Now parse via registry - the compiled strategy should match
      const sampleRest = {
        pxObjClass: 'Rule-Connect-REST',
        pyClassName: 'Work-Cover',
        pyRuleName: 'IntegrationTest',
        pyLabel: 'Integration Test',
        pyRuleset: 'TestApp',
        pyRulesetVersion: '01-01-01',
        pyEndpointURL: 'https://api.example.com/v1',
        pyAuthProfile: 'TestAuth',
      };

      const result = parserRegistry.parse(sampleRest);
      expect(result.symbol.ruleType).toBe('Rule-Connect-REST');
      expect(result.symbol.name).toBe('IntegrationTest');
      expect(result.symbol.className).toBe('Work-Cover');
      expect(result.symbol.ruleset).toBe('TestApp');

      // Should have at least the auth profile dependency
      expect(result.dependencies.some(d => d.ruleName === 'TestAuth' && d.ruleType === 'Rule-Connect-AuthProfile')).toBe(true);
    });

    it('fallback strategy is used when no compiled strategy matches', () => {
      const parserRegistry = new PegaParserRegistry();
      const result = parserRegistry.parse({
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Test',
        pyActivityName: 'FallbackActivity',
      });
      expect(result.symbol.ruleType).toBe('Rule-Obj-Activity');
      expect(result.symbol.name).toBe('FallbackActivity');
    });
  });

  // ---------------------------------------------------------------------------
  // Test 8: PegaMetaModelService.initialize() loads + compiles + registers
  // ---------------------------------------------------------------------------
  describe('Test 8: PegaMetaModelService initialization', () => {
    it('initialize loads schemas, compiles strategies, and registers them in one call', async () => {
      const service = new PegaMetaModelService();

      expect(service.isInitialized()).toBe(false);

      // Initialize uses the singleton registry
      await service.initialize(schemasDir);

      expect(service.isInitialized()).toBe(true);

      // Should be usable for parsing via the service's parser registry
      const parserRegistry = service.getRegistry();

      // Parse an activity
      const activityResult = parserRegistry.parse({
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Order',
        pyRuleName: 'ServiceTest',
        pyRuleset: 'Test',
      });
      expect(activityResult.symbol.ruleType).toBe('Rule-Obj-Activity');
      expect(activityResult.symbol.name).toBe('ServiceTest');

      // Parse a connect REST
      const connectResult = parserRegistry.parse({
        pxObjClass: 'Rule-Connect-REST',
        pyClassName: 'Work-Order',
        pyRuleName: 'ServiceConnect',
        pyEndpointURL: 'https://api.example.com',
        pyAuthProfile: 'MyAuth',
      });
      expect(connectResult.symbol.ruleType).toBe('Rule-Connect-REST');

      // Should detect reference dependencies
      const authDep = connectResult.dependencies.find(d => d.ruleName === 'MyAuth');
      expect(authDep).toBeDefined();
    });

    it('idempotent: multiple initialize calls do not reinitialize', async () => {
      const service = new PegaMetaModelService();
      await service.initialize(schemasDir);
      expect(service.isInitialized()).toBe(true);

      // Second call should be a no-op
      await service.initialize(schemasDir);
      expect(service.isInitialized()).toBe(true);
    });
  });
});
