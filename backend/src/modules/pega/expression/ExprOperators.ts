/**
 * ExprOperators.ts — Pure operator semantics for the expression evaluator.
 * Maps POC operator lexemes (op: string) to PegValue results. Kept separate from the
 * evaluator (SRP) so operator behaviour is independently testable.
 *
 * Operator coverage matches the PegaExpr grammar:
 *   logical:     &&  ||
 *   equality:    ==  !=  <>  =        (= and == both mean equality here)
 *   like/fuzzy:  ^=  ~=               (string contains / case-insensitive equality)
 *   relational:  >  <  >=  <=
 *   arithmetic:  +  -  *  /  %        (+ doubles as string concat when non-numeric)
 *   unary:       !  -  +
 */

import { PegValue, PegExpressionError } from './PegaExpressionAst.js';

/** True when both values are numeric-comparable (avoids "10" > "9" string surprises). */
function bothNumeric(l: PegValue, r: PegValue): boolean {
  return l.type === 'Number' && r.type === 'Number';
}

/** Equality by textual value (mirrors the previous hand-written EQ semantics). */
function equals(l: PegValue, r: PegValue): boolean {
  return l.text === r.text;
}

/**
 * Apply a binary operator to two evaluated operands.
 * @param op Operator lexeme from the AST
 * @param l Left operand value
 * @param r Right operand value
 * @returns Result value
 * @throws PegExpressionError for an unsupported operator
 */
export function applyBinaryOp(op: string, l: PegValue, r: PegValue): PegValue {
  switch (op) {
    case '&&': return PegValue.bool(l.boolean && r.boolean);
    case '||': return PegValue.bool(l.boolean || r.boolean);
    case '==': case '=': return PegValue.bool(equals(l, r));
    case '!=': case '<>': return PegValue.bool(!equals(l, r));
    case '^=': return PegValue.bool(l.text.includes(r.text));
    case '~=': return PegValue.bool(l.text.toLowerCase() === r.text.toLowerCase());
    case '>': return PegValue.bool(l.number > r.number);
    case '<': return PegValue.bool(l.number < r.number);
    case '>=': return PegValue.bool(l.number >= r.number);
    case '<=': return PegValue.bool(l.number <= r.number);
    case '+': return applyPlus(l, r);
    case '-': return PegValue.number(l.number - r.number);
    case '*': return PegValue.number(l.number * r.number);
    case '/': return applyDivide(l, r);
    case '%': return applyModulo(l, r);
    default:
      throw new PegExpressionError(`Unsupported binary operator '${op}'`, 'UNSUPPORTED_OPERATOR');
  }
}

/** '+' is numeric addition when both sides are numbers, else string concatenation. */
function applyPlus(l: PegValue, r: PegValue): PegValue {
  if (bothNumeric(l, r)) return PegValue.number(l.number + r.number);
  return PegValue.text(l.text + r.text);
}

/** Division guarding against divide-by-zero (fail loudly rather than emit Infinity). */
function applyDivide(l: PegValue, r: PegValue): PegValue {
  if (r.number === 0) throw new PegExpressionError('Division by zero', 'DIVISION_BY_ZERO');
  return PegValue.number(l.number / r.number);
}

/** Modulo guarding against divide-by-zero. */
function applyModulo(l: PegValue, r: PegValue): PegValue {
  if (r.number === 0) throw new PegExpressionError('Modulo by zero', 'DIVISION_BY_ZERO');
  return PegValue.number(l.number % r.number);
}

/**
 * Apply a unary prefix operator to an evaluated operand.
 * @param op Unary operator lexeme ('!', '-', '+', '=')
 * @param v Operand value
 * @returns Result value
 * @throws PegExpressionError for an unsupported operator
 */
export function applyUnaryOp(op: string, v: PegValue): PegValue {
  switch (op) {
    case '!': return PegValue.bool(!v.boolean);
    case '-': return PegValue.number(-v.number);
    case '+': return PegValue.number(v.number);
    case '=': return v; // leading '=' prefix (Pega formula marker) — value unchanged
    default:
      throw new PegExpressionError(`Unsupported unary operator '${op}'`, 'UNSUPPORTED_OPERATOR');
  }
}
