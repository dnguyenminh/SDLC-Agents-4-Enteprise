import { describe, it, expect } from 'vitest';
import { PegaMiscParser } from '../../misc/PegaMiscParser.js';
import { PegaParserRegistry } from '../../strategies/PegaParserRegistry.js';
import { registerMiscParsers } from '../../misc/index.js';

describe('PegaMiscParser', () => {
  const parser = new PegaMiscParser();

  // ─── Group 12: supports() for all prefixes + round-trip + missing fields

  describe('supports() for all prefixes + round-trip + missing fields', () => {
    it('returns true for all misc rule type prefixes', () => {
      expect(parser.supports('Rule-Obj-MapValue')).toBe(true);
      expect(parser.supports('Rule-Obj-FieldValue')).toBe(true);
      expect(parser.supports('Rule-Obj-CaseType')).toBe(true);
      expect(parser.supports('Rule-Obj-Stage')).toBe(true);
      expect(parser.supports('Rule-Obj-ServiceLevel')).toBe(true);
      expect(parser.supports('Rule-Obj-Report-Definition')).toBe(true);
      expect(parser.supports('Rule-Circumstance-Date')).toBe(true);
      expect(parser.supports('Rule-Circumstance-Property')).toBe(true);
      expect(parser.supports('Rule-Agent-Queue')).toBe(true);
      expect(parser.supports('Rule-Agent-JobScheduler')).toBe(true);
      expect(parser.supports('Rule-Corr-Email')).toBe(true);
      expect(parser.supports('Rule-Corr-Letter')).toBe(true);
      expect(parser.supports('Rule-File-Binary')).toBe(true);
      expect(parser.supports('Rule-File-Text')).toBe(true);
      expect(parser.supports('Rule-Edit-Validate')).toBe(true);
      expect(parser.supports('Rule-Test-AutoTest')).toBe(true);
      expect(parser.supports('Rule-Utility-Script')).toBe(true);
      expect(parser.supports('Rule-Message')).toBe(true);
      expect(parser.supports('Rule-Stream')).toBe(true);
      expect(parser.supports('Rule-Shortcut')).toBe(true);
    });

    it('returns false for unrelated rule types', () => {
      expect(parser.supports('Rule-Obj-Activity')).toBe(false);
      expect(parser.supports('Rule-Obj-Model')).toBe(false);
      expect(parser.supports('Rule-Connect-REST')).toBe(false);
      expect(parser.supports('Rule-Access-')).toBe(false);
      expect(parser.supports('')).toBe(false);
    });

    it('round-trips MapValue -> same fields', () => {
      const original = {
        pxObjClass: 'Rule-Obj-MapValue',
        pyRuleName: 'RoundTripMap',
        pySourceProperty: '.Source.Field',
        pyTargetProperty: '.Target.Field',
        pyMapRuleSet: 'MappingRules',
      };

      const typed = parser.parseMapValue(original);
      expect(typed.pxObjClass).toBe('Rule-Obj-MapValue');
      expect(typed.pyName).toBe('RoundTripMap');
      expect(typed.pySourceProperty).toBe('.Source.Field');
      expect(typed.pyTargetProperty).toBe('.Target.Field');
      expect(typed.pyMapRuleSet).toBe('MappingRules');
    });

    it('handles empty JSON for parse()', () => {
      const json = { pxObjClass: 'Rule-Obj-CaseType' };

      const result = parser.parse(json);
      expect(result.symbol.name).toBe('');
      expect(result.symbol.fqn).toBe('Rule-Obj-CaseType:@baseclass:');
      expect(result.dependencies).toHaveLength(0);
    });
  });

  // ─── Registry integration ──────────────────────────────────────────────

  describe('Registry integration', () => {
    it('registers and parses via PegaParserRegistry', () => {
      const registry = new PegaParserRegistry();
      registerMiscParsers(registry);

      const json = {
        pxObjClass: 'Rule-Obj-MapValue',
        pyRuleName: 'RegistryMap',
        pySourceProperty: '.Source',
        pyTargetProperty: '.Target',
      };

      const result = registry.parse(json);
      expect(result.symbol.ruleType).toBe('Rule-Obj-MapValue');
      expect(result.symbol.name).toBe('RegistryMap');
      expect(result.symbol.logicSummary).toContain('RegistryMap');
    });

    it('handles Rule-Stream with groups', () => {
      const json = {
        pxObjClass: 'Rule-Stream',
        pyRuleName: 'OrderStream',
        pyDataSource: 'Data-Order',
        pyGroups: ['GroupA', 'GroupB'],
      };

      const typed = parser.parseStream(json);
      expect(typed.pyName).toBe('OrderStream');
      expect(typed.pyDataSource).toBe('Data-Order');
      expect(typed.pyGroups).toEqual(['GroupA', 'GroupB']);
    });

    it('parses Shortcut, Message, and missing types', () => {
      const shortcut = parser.parseShortcut({
        pxObjClass: 'Rule-Shortcut',
        pyRuleName: 'QuickNav',
        pyTarget: 'Rule-Obj-CaseType MyCase',
      });
      expect(shortcut.pyName).toBe('QuickNav');
      expect(shortcut.pyTarget).toBe('Rule-Obj-CaseType MyCase');

      const msg = parser.parseMessage({
        pxObjClass: 'Rule-Message',
        pyRuleName: 'WelcomeMsg',
        pyText: 'Welcome to the system',
      });
      expect(msg.pyName).toBe('WelcomeMsg');
      expect(msg.pyText).toBe('Welcome to the system');
    });
  });
});
