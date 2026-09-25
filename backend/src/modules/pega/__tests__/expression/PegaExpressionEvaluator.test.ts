import { describe, it, expect } from 'vitest';
import { PegaExpressionEvaluator } from '../../expression/PegaExpressionEvaluator.js';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';

describe('PegaExpressionEvaluator', () => {
  const context = new PegaClipboardContext({
    pyWorkPage: {
      Status: { type: 'Text', value: 'Open' },
      Amount: { type: 'Number', value: 150.5 },
      Customer: {
        Name: { type: 'Text', value: 'John Doe' },
      },
      Priority: { type: 'Text', value: 'High' },
      Count: { type: 'Number', value: 0 },
    },
  });

  const evaluator = new PegaExpressionEvaluator();

  it('evaluates property reference .Status', () => {
    const r = evaluator.evaluate('.Status', context);
    expect(r.value.text).toBe('Open');
  });

  it('evaluates string equality true', () => {
    const r = evaluator.evaluate('.Status = "Open"', context);
    expect(r.value.boolean).toBe(true);
  });

  it('evaluates string equality false', () => {
    const r = evaluator.evaluate('.Status = "Closed"', context);
    expect(r.value.boolean).toBe(false);
  });

  it('evaluates numeric comparison .Amount > 100', () => {
    const r = evaluator.evaluate('.Amount > 100', context);
    expect(r.value.boolean).toBe(true);
  });

  it('evaluates compound AND true', () => {
    const r = evaluator.evaluate('.Status = "Open" && .Amount > 100', context);
    expect(r.value.boolean).toBe(true);
  });

  it('evaluates compound AND false', () => {
    const r = evaluator.evaluate('.Status = "Open" && .Amount > 200', context);
    expect(r.value.boolean).toBe(false);
  });

  it('evaluates @upper() function', () => {
    const r = evaluator.evaluate('@upper(.Customer.Name)', context);
    expect(r.value.text).toBe('JOHN DOE');
  });

  it('evaluates @lower() function', () => {
    const r = evaluator.evaluate('@lower(.Customer.Name)', context);
    expect(r.value.text).toBe('john doe');
  });

  it('evaluates @round() function', () => {
    const r = evaluator.evaluate('@round(.Amount)', context);
    expect(r.value.number).toBe(151);
  });

  it('evaluates @IsNull on existing property', () => {
    const r = evaluator.evaluate('@IsNull(.Amount)', context);
    expect(r.value.boolean).toBe(false);
  });

  it('evaluates @IsNull(false) via function form', () => {
    const r = evaluator.evaluate('@IsNull(.Amount)', context);
    expect(r.value.boolean).toBe(false);
  });

  it('evaluates NOT operator (!) on a comparison', () => {
    const r = evaluator.evaluate('!(.Count = 5)', context);
    expect(r.value.boolean).toBe(true);
  });

  it('evaluates @If with true condition', () => {
    const r = evaluator.evaluate('@If(.Priority = "High", "URGENT", "NORMAL")', context);
    expect(r.value.text).toBe('URGENT');
  });

  it('evaluates @If with false condition', () => {
    const r = evaluator.evaluate('@If(.Priority = "Low", "URGENT", "NORMAL")', context);
    expect(r.value.text).toBe('NORMAL');
  });

  it('evaluates @Length()', () => {
    const r = evaluator.evaluate('@Length(.Customer.Name)', context);
    expect(r.value.number).toBe(8);
  });

  it('evaluates @Concat()', () => {
    const r = evaluator.evaluate('@Concat(.Customer.Name, " (", .Status, ")")', context);
    expect(r.value.text).toBe('John Doe (Open)');
  });

  it('evaluates @Substring()', () => {
    const r = evaluator.evaluate('@Substring(.Customer.Name, 0, 4)', context);
    expect(r.value.text).toBe('John');
  });

  it('throws on unknown function', () => {
    expect(() => evaluator.evaluate('@evilFunc(.Amount)', context)).toThrow();
  });

  it('provides trace when requested', () => {
    const r = evaluator.evaluate('.Status = "Open"', context, true);
    expect(r.trace.length).toBeGreaterThan(0);
  });
});
