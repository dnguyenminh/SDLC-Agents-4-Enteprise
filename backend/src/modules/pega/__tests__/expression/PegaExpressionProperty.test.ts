import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { ExpressionParser } from '../../expression/ExpressionParser.js';
import { PegaExpressionEvaluator } from '../../expression/PegaExpressionEvaluator.js';
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';
import type {
  BinaryOpNode,
  ConstantNode,
  ExprNode,
  FunctionCallNode,
  ReferenceNode,
  UnaryOpNode,
} from '../../expression/expressionTypes.js';

const isSimpleString = (s: string): boolean =>
  !s.includes('"') && !s.includes("'") && !s.includes('\\') && !s.includes('\n') && !s.includes('\t');

// `true`/`false` lex as TRUE/FALSE constants, so they cannot be bare identifiers.
const RESERVED = new Set(['true', 'false']);
const isValidIdentifier = (s: string): boolean => /^[a-zA-Z_]\w*$/.test(s) && !RESERVED.has(s);

const evaluator = new PegaExpressionEvaluator();

/** ANTLR entry point: never throws, always returns a node (ErrorExpr on failure). */
const parse = (src: string): ExprNode => ExpressionParser.parseExpression(src);

describe('Parser properties (ANTLR)', () => {

  it('never throws for arbitrary input', () => {
    fc.assert(fc.property(fc.string({ maxLength: 40 }), (src) => {
      expect(() => parse(src)).not.toThrow();
    }));
  });

  it('parses .identifier to a relative Reference with one segment', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 15 }).filter(isValidIdentifier),
      (name) => {
        const ast = parse(`.${name}`);
        expect(ast.kind).toBe('Reference');
        const ref = ast as ReferenceNode;
        expect(ref.scope).toBe('relative');
        expect(ref.segments.map(s => s.name)).toEqual([name]);
      }
    ));
  });

  it('parses chained property ref .a.b.c to a Reference with all segments', () => {
    fc.assert(fc.property(
      fc.array(fc.string({ minLength: 1, maxLength: 8 }).filter(isValidIdentifier), { minLength: 2, maxLength: 5 }),
      (parts) => {
        const ast = parse('.' + parts.join('.'));
        expect(ast.kind).toBe('Reference');
        expect((ast as ReferenceNode).segments.map(s => s.name)).toEqual(parts);
      }
    ));
  });

  it('parses number literal to an INTEGER Constant with correct value', () => {
    fc.assert(fc.property(fc.nat({ max: 999999 }), (n) => {
      const ast = parse(String(n));
      expect(ast.kind).toBe('Constant');
      const c = ast as ConstantNode;
      expect(c.type).toBe('INTEGER');
      expect(c.value).toBe(n);
    }));
  });

  it('parses string literal to a QUOTED_STRING Constant with unquoted value', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 10 }).filter(isSimpleString),
      (s) => {
        const ast = parse(`"${s}"`);
        expect(ast.kind).toBe('Constant');
        const c = ast as ConstantNode;
        expect(c.type).toBe('QUOTED_STRING');
        expect(c.value).toBe(s);
      }
    ));
  });

  it('parses boolean literals to TRUE/FALSE Constants', () => {
    fc.assert(fc.property(fc.boolean(), (b) => {
      const ast = parse(String(b));
      expect(ast.kind).toBe('Constant');
      expect((ast as ConstantNode).type).toBe(b ? 'TRUE' : 'FALSE');
    }));
  });

  it('parses comparison .a = .b to a BinaryOp with = on two References', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 10 }).filter(isValidIdentifier),
      fc.string({ minLength: 1, maxLength: 10 }).filter(isValidIdentifier),
      (left, right) => {
        const ast = parse(`.${left} = .${right}`);
        expect(ast.kind).toBe('BinaryOp');
        const bin = ast as BinaryOpNode;
        expect(bin.op).toBe('=');
        expect(bin.left.kind).toBe('Reference');
        expect(bin.right.kind).toBe('Reference');
      }
    ));
  });

  it('parses .NOT. .a > 5 with unary binding tighter than comparison (Java precedence)', () => {
    const ast = parse('.NOT. .Amount > 5');
    expect(ast.kind).toBe('BinaryOp');
    const bin = ast as BinaryOpNode;
    expect(bin.op).toBe('>');
    expect(bin.left.kind).toBe('UnaryOp');
    expect((bin.left as UnaryOpNode).op).toBe('!');
    expect(bin.right.kind).toBe('Constant');
    expect((bin.right as ConstantNode).value).toBe(5);
  });

  it('parses .AND./.OR./.NOT./.ISNULL Pega keywords without producing ErrorExpr', () => {
    const forms = ['.a .AND. .b', '.a .OR. .b', '.NOT. .a', '.ISNULL .a'];
    for (const src of forms) {
      expect(parse(src).kind).not.toBe('ErrorExpr');
    }
  });

  it('parses parenthesized expression maintaining BinaryOp structure', () => {
    const withoutParens = parse('.Amount > 5 .AND. .Priority = "High"');
    const withParens = parse('.Amount > 5 .AND. (.Priority = "High")');
    for (const ast of [withoutParens, withParens]) {
      expect(ast.kind).toBe('BinaryOp');
      const b = ast as BinaryOpNode;
      expect(b.op).toBe('&&');
      expect(b.left.kind).toBe('BinaryOp');
      expect(b.right.kind).toBe('BinaryOp');
    }
  });

  it('parses function call @name(...) to a FunctionCall with correct name and arity', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 12 }).filter(isValidIdentifier),
      fc.array(fc.nat({ max: 99 }), { minLength: 0, maxLength: 4 }),
      (name, args) => {
        const argStr = args.length > 0 ? args.map(String).join(', ') : '';
        const ast = parse(`@${name}(${argStr})`);
        expect(ast.kind).toBe('FunctionCall');
        const fn = ast as FunctionCallNode;
        expect(fn.name).toBe(name);
        expect(fn.library).toBeNull();
        expect(fn.ruleset).toBeNull();
        expect(fn.args.length).toBe(args.length);
      }
    ));
  });
});

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

describe('ClipboardContext properties', () => {

  it('resolves single-part property preserving value across all primitive types', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 10 }).filter(isSimpleString),
      fc.integer({ min: -999, max: 999 }),
      fc.boolean(),
      (textVal, numVal, boolVal) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            TextProp: textVal,
            NumProp: numVal,
            BoolProp: boolVal,
          },
        });
        expect(ctx.resolve(['TextProp']).text).toBe(textVal);
        expect(ctx.resolve(['TextProp']).type).toBe('Text');
        expect(ctx.resolve(['NumProp']).number).toBe(numVal);
        expect(ctx.resolve(['NumProp']).type).toBe('Number');
        expect(ctx.resolve(['BoolProp']).boolean).toBe(boolVal);
        expect(ctx.resolve(['BoolProp']).type).toBe('Boolean');
      }
    ));
  });

  it('resolves nested page property via chained paths', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 0, maxLength: 8 }).filter(isSimpleString),
      fc.string({ minLength: 0, maxLength: 8 }).filter(isSimpleString),
      fc.string({ minLength: 1, maxLength: 8 }).filter(isValidIdentifier),
      fc.string({ minLength: 1, maxLength: 8 }).filter(isValidIdentifier),
      (innerVal, outerVal, innerProp, outerProp) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            [outerProp]: {
              [innerProp]: { type: 'Text', value: innerVal },
            },
            Other: { type: 'Text', value: outerVal },
          },
        });
        const nested = ctx.resolve([outerProp, innerProp]);
        expect(nested.text).toBe(innerVal);
        expect(nested.type).toBe('Text');
        const top = ctx.resolve(['Other']);
        expect(top.text).toBe(outerVal);
      }
    ));
  });

  it('resolves absolute vs relative paths consistently', () => {
    fc.assert(fc.property(
      fc.string({ minLength: 1, maxLength: 8 }).filter(isSimpleString),
      fc.string({ minLength: 1, maxLength: 8 }).filter(isValidIdentifier),
      (propValue, propName) => {
        const ctx = new PegaClipboardContext({
          pyWorkPage: {
            [propName]: { type: 'Text', value: propValue },
          },
        });
        const relative = ctx.resolve([propName]);
        const absolute = ctx.resolve(['pyWorkPage', propName]);
        expect(relative.text).toBe(propValue);
        expect(absolute.text).toBe(propValue);
        expect(relative.text).toBe(absolute.text);
      }
    ));
  });
});
