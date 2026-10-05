/**
 * SA4E-338 Task E — AstDigestBuilder raw fallback tests.
 *
 * Verifies: when AST parser fails (unparsable rule JSON), fallback to raw
 * text outline extraction (section headers + body summary), digestSource='raw',
 * never throw.
 */

import { describe, it, expect, vi } from 'vitest';
import { AstDigestBuilder, type DigestResult } from '../../../modules/pega/AstDigestBuilder.js';
import { PegaRuleAstParser } from '../../../modules/pega/PegaRuleAstParser.js';

describe('AstDigestBuilder (Task E — raw fallback)', () => {
  describe('valid rule JSON → source=ast', () => {
    it('builds AST digest for Activity rule', () => {
      const builder = new AstDigestBuilder();
      const result = builder.build({
        pxObjClass: 'Rule-Obj-Activity',
        pyClassName: 'Work-Cover-Jira',
        pyActivityName: 'ResolveTicket',
        pySteps: [{ pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'X.Y' }],
      });
      expect(result.source).toBe('ast');
      expect(result.ast).not.toBeNull();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.fallbackReason).toBeUndefined();
    });

    it('builds AST digest for Data Transform rule', () => {
      const builder = new AstDigestBuilder();
      const result = builder.build({
        pxObjClass: 'Rule-Obj-Model',
        pyClassName: 'W',
        pyModelName: 'M',
        pyProperties: [{ pyActionName: 'Set', pyTarget: '.x' }],
      });
      expect(result.source).toBe('ast');
      expect(result.ast).not.toBeNull();
    });

    it('builds AST digest for Decision Table rule', () => {
      const builder = new AstDigestBuilder();
      const result = builder.build({
        pxObjClass: 'Rule-Obj-DecisionTable',
        pyClassName: 'W',
        pyRuleName: 'D',
        pyDecisionRules: [{ pyCondition: 'C1', pyResult: 'R1' }],
      });
      expect(result.source).toBe('ast');
      expect(result.ast).not.toBeNull();
    });
  });

  describe('unparsable rule JSON → source=raw-fallback, never throw', () => {
    it('fallback when parser throws (malformed rule)', () => {
      const builder = new AstDigestBuilder();
      // Mock the parser to throw on parse
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('Unexpected token } in JSON at position 42');
      });
      try {
        const result = builder.build({ broken: true } as Record<string, unknown>);
        expect(result.source).toBe('raw-fallback');
        expect(result.ast).toBeNull();
        expect(result.text.length).toBeGreaterThan(0);
        expect(result.fallbackReason).toBe('Unexpected token } in JSON at position 42');
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('fallback when parser throws (circular reference)', () => {
      const builder = new AstDigestBuilder();
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('Converting circular structure to JSON');
      });
      try {
        const circular: Record<string, unknown> = { pxObjClass: 'Rule-Obj-Activity' };
        (circular as any).self = circular;
        const result = builder.build(circular);
        expect(result.source).toBe('raw-fallback');
        expect(result.ast).toBeNull();
        expect(result.text.length).toBeGreaterThan(0);
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('fallback when parser throws (missing required fields)', () => {
      const builder = new AstDigestBuilder();
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('missing pxObjClass');
      });
      try {
        const result = builder.build({ foo: 'bar' } as Record<string, unknown>);
        expect(result.source).toBe('raw-fallback');
        expect(result.ast).toBeNull();
        expect(result.text.length).toBeGreaterThan(0);
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('never throws on completely empty object', () => {
      const builder = new AstDigestBuilder();
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('empty rule');
      });
      try {
        expect(() => builder.build({})).not.toThrow();
        const result = builder.build({});
        expect(result.source).toBe('raw-fallback');
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('never throws on deeply nested invalid JSON', () => {
      const builder = new AstDigestBuilder();
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('nested too deep');
      });
      try {
        expect(() => builder.build({ pxObjClass: 'Rule-Obj-Activity', pyClassName: 'W', pyActivityName: 'A', steps: [{ broken: { nested: { deep: { object: Array(10000).fill('x') } } } }] })).not.toThrow();
        const result = builder.build({ pxObjClass: 'Rule-Obj-Activity', pyClassName: 'W', pyActivityName: 'A', steps: [{ broken: { nested: { deep: { object: Array(10000).fill('x') } } } }] });
        expect(result.source).toBe('raw-fallback');
      } finally {
        parseSpy.mockRestore();
      }
    });
  });

  describe('raw outline structure', () => {
    it('contains section headers (RULE TYPE, CLASS, NAME)', () => {
      const builder = new AstDigestBuilder();
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('forced fallback');
      });
      try {
        const result = builder.build({ pxObjClass: 'Rule-Obj-Activity', pyClassName: 'W', pyActivityName: 'A' });
        expect(result.text).toContain('RULE TYPE:');
        expect(result.text).toContain('CLASS:');
        expect(result.text).toContain('NAME:');
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('contains STEP section for activity rules', () => {
      const builder = new AstDigestBuilder();
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('forced fallback');
      });
      try {
        const result = builder.build({
          pxObjClass: 'Rule-Obj-Activity',
          pyClassName: 'W',
          pyActivityName: 'A',
          pySteps: [{ pyStepNum: '1', pyMethod: 'Call', pyMethodParameters: 'X' }],
        });
        expect(result.text).toContain('STEPS');
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('contains BODY section in raw fallback', () => {
      const builder = new AstDigestBuilder();
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('forced fallback');
      });
      try {
        const result = builder.build({ foo: 'bar' });
        expect(result.text).toContain('BODY');
      } finally {
        parseSpy.mockRestore();
      }
    });

    it('raw outline length is bounded', () => {
      const builder = new AstDigestBuilder();
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('forced fallback');
      });
      try {
        const hugeObj: Record<string, unknown> = {};
        for (let i = 0; i < 100; i++) {
          hugeObj[`key${i}`] = 'x'.repeat(1000);
        }
        const result = builder.build(hugeObj);
        // Should be capped, not a massive dump
        expect(result.text.length).toBeLessThan(100_000);
      } finally {
        parseSpy.mockRestore();
      }
    });
  });

  describe('DigestResult interface', () => {
    it('has required fields', () => {
      const builder = new AstDigestBuilder();
      const parseSpy = vi.spyOn(PegaRuleAstParser.prototype, 'parse').mockImplementation(() => {
        throw new Error('forced fallback');
      });
      try {
        const result: DigestResult = builder.build({ pxObjClass: 'Rule-Obj-Activity', pyClassName: 'W', pyActivityName: 'A' });
        expect(result).toHaveProperty('text');
        expect(result).toHaveProperty('ast');
        expect(result).toHaveProperty('source');
        expect(['ast', 'raw-fallback']).toContain(result.source);
      } finally {
        parseSpy.mockRestore();
      }
    });
  });
});
