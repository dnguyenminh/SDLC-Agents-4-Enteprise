/**
 * SA4E-233 — ExpressionParser.test.ts
 *
 * Vitest port of the standalone tool's parser tests:
 *   - 13 real-world samples (expr.test.mjs): must parse without producing ErrorExpr.
 *   - 27 edge cases (edge.test.mjs): structural assertions on the resulting AST,
 *     including operator precedence, subscripts, function forms and round-trip stability.
 *
 * Runs in parallel to the existing hand-written parser (removal is GD2).
 */
import { describe, expect, it } from 'vitest';
import { parseExpression } from '../ExpressionParser.js';
import { exprToString } from './expressionEmit.js';
import type {
  BinaryOpNode, ConstantNode, ExprNode, FunctionCallNode, ReferenceNode, TernaryNode, UnaryOpNode,
} from '../expressionNodes.js';

/** 13 real-world samples taken from the HRv2 rule set. */
const SAMPLES: string[] = [
  '@(Pega-RULES:ExpressionEvaluators).compareTwoValues(.Employee.Salary, ">", 0)',
  '.Employee.Salary/26',
  '.pxResults(1).pyLabel',
  'Param.inputVal == ""',
  '.OfferedSalary > .Position.MaximumSalary',
  'a && b || c',
  'x ? 1 : 2',
  '@baseclass',
  '!local.hasConditionPage && @IsInPageList(".OfferedSalary", ".pxPropertyName", pyPage.pzConditionProps)',
  '.a + .b * .c - 5',
  '@(Pega-RULES:ExpressionEvaluators).compareTwoNumbers(.OfferedSalary, ">", .Position.MaximumSalary)',
  '.list(<APPEND>).x',
  '.DentalPlan.EmployeeCost',
];

describe('SA4E-233 parseExpression — real-world samples', () => {
  it.each(SAMPLES)('parses without error: %s', (src) => {
    expect(parseExpression(src).kind).not.toBe('ErrorExpr');
  });
});

// Narrowing helpers keep each assertion readable and fully typed.
const asBinary = (n: ExprNode): BinaryOpNode => n as BinaryOpNode;
const asUnary = (n: ExprNode): UnaryOpNode => n as UnaryOpNode;
const asTernary = (n: ExprNode): TernaryNode => n as TernaryNode;
const asRef = (n: ExprNode): ReferenceNode => n as ReferenceNode;
const asConst = (n: ExprNode): ConstantNode => n as ConstantNode;
const asFunc = (n: ExprNode): FunctionCallNode => n as FunctionCallNode;

describe('SA4E-233 parseExpression — numeric literal disambiguation', () => {
  it('INT 26', () => {
    const a = asConst(parseExpression('26'));
    expect(a.kind === 'Constant' && a.type === 'INTEGER' && a.value === 26).toBe(true);
  });
  it('DOUBLE 1.5', () => {
    const a = asConst(parseExpression('1.5'));
    expect(a.kind === 'Constant' && a.type === 'DOUBLE' && a.value === 1.5).toBe(true);
  });
  it('leading-dot double .5', () => {
    const a = asBinary(parseExpression('.5 + 1'));
    expect(a.kind === 'BinaryOp' && asConst(a.left).type === 'DOUBLE').toBe(true);
  });
  it('LONG 100L', () => {
    const a = asConst(parseExpression('100L'));
    expect(a.kind === 'Constant' && a.type === 'LONG').toBe(true);
  });
  it('exponent 1e3', () => {
    const a = asConst(parseExpression('1e3'));
    expect(a.kind === 'Constant' && a.type === 'DOUBLE').toBe(true);
  });
});

describe('SA4E-233 parseExpression — reference vs double disambiguation', () => {
  it('relative .Employee', () => {
    const a = asRef(parseExpression('.Employee'));
    expect(a.kind === 'Reference' && a.scope === 'relative' && a.segments[0].name === 'Employee').toBe(true);
  });
  it('three segments .a.b.c', () => {
    expect(asRef(parseExpression('.a.b.c')).segments.length).toBe(3);
  });
});

describe('SA4E-233 parseExpression — operator precedence', () => {
  it('1 + 2*3 => +(1, *(2,3))', () => {
    const a = asBinary(parseExpression('1 + 2 * 3'));
    expect(a.op === '+' && asBinary(a.right).op === '*').toBe(true);
  });
  it('and of two relationals', () => {
    const a = asBinary(parseExpression('a > 1 && b < 2'));
    expect(a.op === '&&' && asBinary(a.left).op === '>' && asBinary(a.right).op === '<').toBe(true);
  });
  it('|| of two &&', () => {
    const a = asBinary(parseExpression('a && b || c && d'));
    expect(a.op === '||' && asBinary(a.left).op === '&&' && asBinary(a.right).op === '&&').toBe(true);
  });
  it('ternary right-assoc', () => {
    const a = asTernary(parseExpression('a ? b : c ? d : e'));
    expect(a.kind === 'Ternary' && a.whenFalse.kind === 'Ternary').toBe(true);
  });
  it('unary not', () => {
    const a = asUnary(parseExpression('!.flag'));
    expect(a.kind === 'UnaryOp' && a.op === '!').toBe(true);
  });
  it('unary minus binds tighter than +', () => {
    const a = asBinary(parseExpression('-.x + 1'));
    expect(a.op === '+' && a.left.kind === 'UnaryOp').toBe(true);
  });
});

describe('SA4E-233 parseExpression — function forms', () => {
  it('@foo()', () => {
    const a = asFunc(parseExpression('@foo()'));
    expect(a.kind === 'FunctionCall' && a.library === null && a.ruleset === null && a.args.length === 0).toBe(true);
  });
  it('@Lib.foo(1)', () => {
    const a = asFunc(parseExpression('@Lib.foo(1)'));
    expect(a.library === 'Lib' && a.name === 'foo' && a.args.length === 1).toBe(true);
  });
  it('@(RS-A:Lib).foo(.x, 2)', () => {
    const a = asFunc(parseExpression('@(RS-A:Lib).foo(.x, 2)'));
    expect(a.ruleset === 'RS-A' && a.library === 'Lib' && a.args.length === 2).toBe(true);
  });
});

describe('SA4E-233 parseExpression — subscripts', () => {
  it('index subscript', () => {
    expect(asRef(parseExpression('.list(1)')).segments[0].subscript?.subType).toBe('index');
  });
  it('expr subscript', () => {
    expect(asRef(parseExpression('.list(.i + 1)')).segments[0].subscript?.subType).toBe('expr');
  });
  it('append subscript', () => {
    expect(asRef(parseExpression('.list()')).segments[0].subscript?.subType).toBe('append');
  });
  it('symbolic subscript', () => {
    expect(asRef(parseExpression('.g(<APPEND>)')).segments[0].subscript?.subType).toBe('symbolic');
  });
});

describe('SA4E-233 parseExpression — data page + legacy + placeholders', () => {
  it('paramPage ref', () => {
    const a = asRef(parseExpression('D_Page[ID:.x].pxResults'));
    expect(a.scope === 'paramPage' && a.pageParams?.[0].key === 'ID' && a.segments[0].name === 'pxResults').toBe(true);
  });
  it('unary = prefix (legacy when)', () => {
    const a = asUnary(parseExpression('= (@(Pega-RULES:ExpressionEvaluators).compareTwoValues(.Employee.Salary, ">", 0))'));
    expect(a.kind === 'UnaryOp' && a.op === '=' && a.operand.kind === 'FunctionCall').toBe(true);
  });
  it('placeholder args', () => {
    const a = asFunc(parseExpression('@(Pega-RULES:ExpressionEvaluators).compareTwoValues({lValue}, "{comparator}", {rValue})'));
    expect(a.kind === 'FunctionCall' && a.args[0].kind === 'Placeholder' && (a.args[0] as { name: string }).name === 'lValue').toBe(true);
  });
  it('bare placeholder', () => {
    const a = parseExpression('{lValue}');
    expect(a.kind === 'Placeholder' && (a as { name: string }).name === 'lValue').toBe(true);
  });
});

describe('SA4E-233 parseExpression — round-trip stability', () => {
  const roundTrip = [
    '.Employee.Salary/26',
    '@(Pega-RULES:ExpressionEvaluators).compareTwoValues(.Remote, "=", false)',
    'a && b || c',
  ];
  it.each(roundTrip)('parse→render→parse is stable: %s', (src) => {
    const once = exprToString(parseExpression(src));
    const twice = exprToString(parseExpression(once));
    expect(once).toBe(twice);
  });
});
