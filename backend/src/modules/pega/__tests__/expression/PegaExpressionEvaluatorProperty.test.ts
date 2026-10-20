import { describe, it, expect } from 'vitest';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';
import { fc, isSimpleString, isValidIdentifier, evaluator } from './helpers.js';

describe('Evaluator properties', () => {

  it('evaluates property reference to the value stored in clipboard', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 10 }).filter(isSimpleString),
      fc.string({ minLength: 1, maxLength: 10 }).filter(isValidIdentifier),
      (propValue, propName) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            [propName]: { type: 'Text', value: propValue },
          },
        });
        const result = evaluator.evaluate(`.${propName}`, ctx);
        expect(result.value.text).toBe(propValue);
        expect(result.value.type).toBe('Text');
      }
    ));
  });

  it('evaluates @upper(@lower(x)) preserving length', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 20 }).filter(isSimpleString),
      (s) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            Name: { type: 'Text', value: s },
          },
        });
        const lowerResult = evaluator.evaluate('@lower(.Name)', ctx);
        const upperResult = evaluator.evaluate('@upper(.Name)', ctx);
        expect(lowerResult.value.text).toBe(s.toLowerCase());
        expect(upperResult.value.text).toBe(s.toUpperCase());

        const doubleUpper = evaluator.evaluate('@upper(@lower(.Name))', ctx);
        const doubleLower = evaluator.evaluate('@lower(@upper(.Name))', ctx);
        expect(doubleUpper.value.text.length).toBe(s.length);
        expect(doubleLower.value.text.length).toBe(s.length);
        expect(doubleUpper.value.text).toBe(s.toUpperCase());
        expect(doubleLower.value.text).toBe(s.toLowerCase());

        expect(doubleUpper.value.text).toBe(upperResult.value.text);
        expect(doubleLower.value.text).toBe(lowerResult.value.text);
      }
    ));
  });

  it('evaluates @If(trueCondition, valA, valB) to valA', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 10 }).filter(isSimpleString),
      fc.string({ minLength: 0, maxLength: 10 }).filter(isSimpleString),
      (a, b) => {
        const ctx = new PegaClipboardContext({ pyWorkPage: {} });
        const result = evaluator.evaluate(`@If(true, "${a}", "${b}")`, ctx);
        expect(result.value.text).toBe(a);
      }
    ));
  });

  it('evaluates @If(falseCondition, valA, valB) to valB', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 10 }).filter(isSimpleString),
      fc.string({ minLength: 0, maxLength: 10 }).filter(isSimpleString),
      (a, b) => {
        const ctx = new PegaClipboardContext({ pyWorkPage: {} });
        const result = evaluator.evaluate(`@If(false, "${a}", "${b}")`, ctx);
        expect(result.value.text).toBe(b);
      }
    ));
  });

  it('evaluates @Concat(a, b) to a + b', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 8 }).filter(isSimpleString),
      fc.string({ minLength: 0, maxLength: 8 }).filter(isSimpleString),
      (a, b) => {
        const ctx = new PegaClipboardContext({ pyWorkPage: {} });
        const result = evaluator.evaluate(`@Concat("${a}", "${b}")`, ctx);
        expect(result.value.text).toBe(a + b);
        expect(result.value.type).toBe('Text');
      }
    ));
  });

  it('evaluates .ISNULL correctly: null value returns true, non-null returns false', () => {
    fc.assert(fc.property(
      fc.boolean(),
      fc.string({ minLength: 0, maxLength: 8 }).filter(isSimpleString),
      (hasValue, propValue) => {
        const propData = hasValue
          ? { type: 'Text', value: propValue }
          : null;
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            TestProp: propData as any,
          },
        });
        const result = evaluator.evaluate('.ISNULL .TestProp', ctx);
        expect(result.value.boolean).toBe(!hasValue);
        expect(result.value.type).toBe('Boolean');
      }
    ));
  });

  it('evaluates @round preserving integer identity', () => {
    fc.assert(fc.property(
      fc.integer({ min: -9999, max: 9999 }),
      (n) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            Value: { type: 'Number', value: n },
          },
        });
        const result = evaluator.evaluate('@round(.Value)', ctx);
        expect(result.value.number).toBe(n);
        expect(result.value.type).toBe('Number');
      }
    ));
  });

  it('evaluates @Length matching string length', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 30 }).filter(isSimpleString),
      (s) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            TextVal: { type: 'Text', value: s },
          },
        });
        const result = evaluator.evaluate('@Length(.TextVal)', ctx);
        expect(result.value.number).toBe(s.length);
      }
    ));
  });

  it('evaluates numeric comparison operators correctly', () => {
    fc.assert(fc.property(
      fc.integer({ min: -100, max: 100 }),
      fc.integer({ min: -100, max: 100 }),
      (a, b) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            A: { type: 'Number', value: a },
            B: { type: 'Number', value: b },
          },
        });
        expect(evaluator.evaluate('.A = .B', ctx).value.boolean).toBe(a === b);
        expect(evaluator.evaluate('.A <> .B', ctx).value.boolean).toBe(a !== b);
        expect(evaluator.evaluate('.A > .B', ctx).value.boolean).toBe(a > b);
        expect(evaluator.evaluate('.A < .B', ctx).value.boolean).toBe(a < b);
        expect(evaluator.evaluate('.A >= .B', ctx).value.boolean).toBe(a >= b);
        expect(evaluator.evaluate('.A <= .B', ctx).value.boolean).toBe(a <= b);
      }
    ));
  });
});
