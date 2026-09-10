/**
 * ExprNodeValidator.test.ts — Tests for whitelist + depth validation over ExprNode trees.
 */
import { describe, it, expect } from 'vitest';
import { parseExpression } from '../../expression/pega-expr/parser.js';
import { ExprNodeValidator } from '../../expression/ExprNodeValidator.js';

const validator = new ExprNodeValidator();
const validate = (expr: string) => validator.validate(parseExpression(expr));

describe('ExprNodeValidator — whitelist', () => {
  it('allows whitelisted function', () => {
    const r = validate('@upper("x")');
    expect(r.valid).toBe(true);
  });

  it('rejects non-whitelisted function', () => {
    const r = validate('@evilFunc(1)');
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('FUNCTION_NOT_ALLOWED');
  });

  it('rejects non-whitelisted nested inside whitelisted', () => {
    const r = validate('@upper(@evil("x"))');
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('FUNCTION_NOT_ALLOWED');
  });

  it('rejects legacy @@ function not in whitelist', () => {
    const r = validate('@@pxDivide(1, 2)');
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('FUNCTION_NOT_ALLOWED');
  });

  it('passes expressions with no function calls', () => {
    expect(validate('.a > 1 && .b < 2').valid).toBe(true);
  });
});

describe('ExprNodeValidator — depth', () => {
  it('rejects pathologically deep nesting', () => {
    // Build deeply nested parentheses/unary to exceed MAX_DEPTH (100).
    const deep = '!'.repeat(150) + '.flag';
    const r = validate(deep);
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.code === 'MAX_DEPTH_EXCEEDED')).toBe(true);
  });
});
