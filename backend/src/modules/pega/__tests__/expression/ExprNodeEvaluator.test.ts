/**
 * ExprNodeEvaluator.test.ts — Direct tests for evaluating POC ExprNode trees to PegValue.
 * Covers operator semantics, references, ternary, functions, and error paths that the
 * evaluator owns (parsing is covered separately in PegaExprParser.test.ts).
 */
import { describe, it, expect } from 'vitest';
import { parseExpression } from '../../expression/pega-expr/parser.js';
import { ExprNodeEvaluator } from '../../expression/ExprNodeEvaluator.js';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';

const ctx = new PegaClipboardContext(
  {
    pyWorkPage: {
      Amount: { type: 'Number', value: 150 },
      Qty: { type: 'Number', value: 3 },
      Status: { type: 'Text', value: 'Open' },
      Name: { type: 'Text', value: 'john' },
    },
  },
  'pyWorkPage',
);
const ev = new ExprNodeEvaluator();
const run = (expr: string) => ev.eval(parseExpression(expr), ctx);

describe('ExprNodeEvaluator — arithmetic', () => {
  it('addition', () => expect(run('.Amount + 50').number).toBe(200));
  it('multiplication', () => expect(run('.Amount * 2').number).toBe(300));
  it('subtraction', () => expect(run('.Amount - .Qty').number).toBe(147));
  it('string concat when non-numeric +', () => expect(run('.Name + "-x"').text).toBe('john-x'));
  it('division by zero throws', () => expect(() => run('.Amount / 0')).toThrow(/Division by zero/));
  it('modulo by zero throws', () => expect(() => run('.Amount % 0')).toThrow(/Modulo by zero/));
});

describe('ExprNodeEvaluator — comparison + logical', () => {
  it('gt true', () => expect(run('.Amount > 100').boolean).toBe(true));
  it('eq with = operator', () => expect(run('.Status = "Open"').boolean).toBe(true));
  it('neq with <>', () => expect(run('.Status <> "Closed"').boolean).toBe(true));
  it('and', () => expect(run('.Amount > 100 && .Status = "Open"').boolean).toBe(true));
  it('or short-circuit', () => expect(run('.Status = "Closed" || .Amount == 150').boolean).toBe(true));
  it('contains ^=', () => expect(run('.Status ^= "pe"').boolean).toBe(true));
});

describe('ExprNodeEvaluator — ternary + unary', () => {
  it('ternary true branch', () => expect(run('.Amount > 100 ? "big" : "small"').text).toBe('big'));
  it('ternary false branch', () => expect(run('.Amount < 100 ? "big" : "small"').text).toBe('small'));
  it('unary not', () => expect(run('!(.Amount = 1)').boolean).toBe(true));
  it('unary minus', () => expect(run('-.Qty').number).toBe(-3));
});

describe('ExprNodeEvaluator — functions', () => {
  it('@upper', () => expect(run('@upper(.Name)').text).toBe('JOHN'));
  it('@round with decimals', () => expect(run('@round(3.14159, 2)').number).toBe(3.14));
  it('@If picks branch', () => expect(run('@If(.Amount > 100, "H", "L")').text).toBe('H'));
  it('non-whitelisted function throws', () => expect(() => run('@evilFunc(1)')).toThrow(/not in whitelist/));
});

describe('ExprNodeEvaluator — error paths', () => {
  it('ErrorExpr throws a clear message', () => {
    expect(() => ev.eval(parseExpression('((('), ctx)).toThrow(/Cannot evaluate unparsed/);
  });
  it('missing property throws', () => {
    expect(() => run('.DoesNotExist')).toThrow(/not found/);
  });
});
