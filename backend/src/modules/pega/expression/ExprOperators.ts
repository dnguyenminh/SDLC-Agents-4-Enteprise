/** Pure runtime semantics for Pega expression operators. */
import { PegValue, PegExpressionError } from './PegaExpressionAst.js';

function isNumericPair(left: PegValue, right: PegValue): boolean {
  return left.type === 'Number' && right.type === 'Number';
}

function applyAddition(left: PegValue, right: PegValue): PegValue {
  if (isNumericPair(left, right)) return PegValue.number(left.number + right.number);
  return PegValue.text(left.text + right.text);
}

function applyDivision(left: PegValue, right: PegValue): PegValue {
  if (right.number === 0) throw new PegExpressionError('Division by zero', 'DIVISION_BY_ZERO');
  return PegValue.number(left.number / right.number);
}

function applyModulo(left: PegValue, right: PegValue): PegValue {
  if (right.number === 0) throw new PegExpressionError('Modulo by zero', 'DIVISION_BY_ZERO');
  return PegValue.number(left.number % right.number);
}

export function applyBinaryOp(op: string, left: PegValue, right: PegValue): PegValue {
  switch (op) {
    case '&&': return PegValue.bool(left.boolean && right.boolean);
    case '||': return PegValue.bool(left.boolean || right.boolean);
    case '=': case '==': return PegValue.bool(left.text === right.text);
    case '<>': case '!=': return PegValue.bool(left.text !== right.text);
    case '^=': return PegValue.bool(left.text.includes(right.text));
    case '~=': return PegValue.bool(left.text.toLowerCase() === right.text.toLowerCase());
    case '>': return PegValue.bool(left.number > right.number);
    case '<': return PegValue.bool(left.number < right.number);
    case '>=': return PegValue.bool(left.number >= right.number);
    case '<=': return PegValue.bool(left.number <= right.number);
    case '+': return applyAddition(left, right);
    case '-': return PegValue.number(left.number - right.number);
    case '*': return PegValue.number(left.number * right.number);
    case '/': return applyDivision(left, right);
    case '%': return applyModulo(left, right);
    default: throw new PegExpressionError(`Unsupported binary operator '${op}'`, 'UNSUPPORTED_OPERATOR');
  }
}

export function applyUnaryOp(op: string, value: PegValue): PegValue {
  switch (op) {
    case '!': case '.NOT.': return PegValue.bool(!value.boolean);
    case 'ISNULL': case '.ISNULL': return PegValue.bool(value.type === 'Null');
    case '-': return PegValue.number(-value.number);
    case '+': return PegValue.number(value.number);
    case '=': return value;
    default: throw new PegExpressionError(`Unsupported unary operator '${op}'`, 'UNSUPPORTED_OPERATOR');
  }
}
