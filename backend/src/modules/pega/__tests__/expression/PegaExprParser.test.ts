/**
 * PegaExprParser.test.ts — Tests for the embedded POC ANTLR parser (pega-expr/parser).
 * Ported from the standalone tool's parser tests, focused on the syntax the previous
 * hand-written parser could NOT handle: legacy '@@' functions, bare calls, subscripts,
 * ternary, data-page refs, and Report-Definition doubled-quote escaping.
 */
import { describe, it, expect } from 'vitest';
import { parseExpression } from '../../expression/pega-expr/parser.js';
import { exprToString } from '../../expression/pega-expr/exprEmit.js';
import type {
  ExprNode, BinaryOpNode, ConstantNode, FunctionCallNode, ReferenceNode, TernaryNode, UnaryOpNode,
} from '../../expression/pega-expr/nodes.js';

const asFunc = (n: ExprNode): FunctionCallNode => n as FunctionCallNode;
const asRef = (n: ExprNode): ReferenceNode => n as ReferenceNode;
const asBin = (n: ExprNode): BinaryOpNode => n as BinaryOpNode;
const asConst = (n: ExprNode): ConstantNode => n as ConstantNode;

describe('pega-expr parser — real-world samples parse without error', () => {
  const samples = [
    '@(Pega-RULES:ExpressionEvaluators).compareTwoValues(.Employee.Salary, ">", 0)',
    '.Employee.Salary/26',
    '.pxResults(1).pyLabel',
    'Param.inputVal == ""',
    '.OfferedSalary > .Position.MaximumSalary',
    'a && b || c',
    'x ? 1 : 2',
    '@baseclass',
    '.a + .b * .c - 5',
    '.list(<APPEND>).x',
  ];
  it.each(samples)('parses: %s', (src) => {
    expect(parseExpression(src).kind).not.toBe('ErrorExpr');
  });
});

describe('pega-expr parser — legacy @@ direct functions', () => {
  it('@@fn(args) parses as deprecated FunctionCall', () => {
    const a = asFunc(parseExpression('@@pxDivide(.EffortEstimate, "60")'));
    expect(a.kind).toBe('FunctionCall');
    expect(a.deprecated).toBe(true);
    expect(a.name).toBe('pxDivide');
    expect(a.library).toBeNull();
  });

  it('@@Lib.fn(args) parses as deprecated library FunctionCall', () => {
    const a = asFunc(parseExpression('@@DateTime.CurrentDateTime()'));
    expect(a.deprecated).toBe(true);
    expect(a.library).toBe('DateTime');
    expect(a.name).toBe('CurrentDateTime');
  });

  it('canonical @ forms remain non-deprecated', () => {
    expect(asFunc(parseExpression('@upper(.x)')).deprecated).toBe(false);
    expect(asFunc(parseExpression('@(RS:Lib).fn(.x)')).deprecated).toBe(false);
  });
});

describe('pega-expr parser — library-instance call @Lib().method', () => {
  it('parses @Lib().method(args) as a library FunctionCall', () => {
    const a = asFunc(parseExpression("@CIFSvcsLib().GetMaskedString(.PHONE_3,'X',3)"));
    expect(a.kind).toBe('FunctionCall');
    expect(a.library).toBe('CIFSvcsLib');
    expect(a.name).toBe('GetMaskedString');
    expect(a.args.length).toBe(3);
    expect(a.deprecated).toBe(false);
  });
});

describe('pega-expr parser — bare nested calls', () => {
  it('bare call inside another call parses', () => {
    const outer = asFunc(parseExpression('@startsWith(toUpperCase(.Name), "X")'));
    expect(outer.name).toBe('startsWith');
    expect(asFunc(outer.args[0]).name).toBe('toUpperCase');
  });
});

describe('pega-expr parser — Report Definition doubled-quote escaping', () => {
  it('literal mode keeps "" as adjacent empty strings (default)', () => {
    // Without escape mode, ""Completed"" is not a single valid argument -> ErrorExpr.
    expect(parseExpression('@@crmCaseWhen(.Status,""Completed"")').kind).toBe('ErrorExpr');
  });

  it('escape mode collapses "" to " and parses the intended literal', () => {
    const a = asFunc(parseExpression('@@crmCaseWhen(.Status,""Completed"")', { doubledQuotes: 'escape' }));
    expect(a.kind).toBe('FunctionCall');
    expect(a.deprecated).toBe(true);
    expect(asConst(a.args[1]).value).toBe('Completed');
  });
});

describe('pega-expr parser — structure + round-trip', () => {
  it('operator precedence: 1 + 2 * 3 => +(1, *(2,3))', () => {
    const a = asBin(parseExpression('1 + 2 * 3'));
    expect(a.op).toBe('+');
    expect(asBin(a.right).op).toBe('*');
  });

  it('ternary is right-associative', () => {
    const a = parseExpression('a ? b : c ? d : e') as TernaryNode;
    expect(a.kind).toBe('Ternary');
    expect((a.whenFalse as TernaryNode).kind).toBe('Ternary');
  });

  it('unary not', () => {
    expect((parseExpression('!.flag') as UnaryOpNode).op).toBe('!');
  });

  it('relative reference segments', () => {
    expect(asRef(parseExpression('.a.b.c')).segments.length).toBe(3);
  });

  it('round-trips @@ legacy prefix', () => {
    const src = '@@pxCeiling(.Amount)';
    const rt = exprToString(parseExpression(src));
    expect(exprToString(parseExpression(rt))).toBe(rt);
  });

  it('never throws — bad input yields ErrorExpr', () => {
    expect(parseExpression('@@@ bad (((').kind).toBe('ErrorExpr');
  });
});
