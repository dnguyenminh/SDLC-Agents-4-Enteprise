import { describe, it, expect } from 'vitest';
import type {
  BinaryOpNode,
  ConstantNode,
  FunctionCallNode,
  ReferenceNode,
  UnaryOpNode,
} from '../../expression/expressionTypes.js';
import { fc, isSimpleString, isValidIdentifier, parse } from './helpers.js';

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
