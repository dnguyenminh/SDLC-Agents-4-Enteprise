/**
 * astBuilder.ts — Visitor that converts the ANTLR parse tree (PegaExpr grammar) into the
 * project's expression AST nodes (from nodes.js). This keeps the AST shape stable so all
 * downstream builders/emitters are unaffected by the parser swap.
 *
 * The base class `PegaExprVisitor` is ANTLR-generated JavaScript (kept as .js). Its parse-tree
 * context parameters (`ctx`) are the untyped generated-code boundary, so they are typed `any`
 * here — that is the only place `any` appears in this port. Everything the visitor RETURNS is
 * a precisely-typed expression AST node.
 */

import PegaExprVisitor from "./generated/PegaExprVisitor.js";
import {
  BinaryOp, UnaryOp, Ternary, FunctionCall, Reference, RefSegment, Subscript,
  Constant, ConstantType, Placeholder,
} from "./nodes.js";
import type {
  ExprNode, ReferenceNode, RefSegmentNode, SubscriptNode, KeyedPageParam,
} from "./nodes.js";

/** ANTLR parse-tree context node — untyped generated-code boundary. */
type Ctx = any;

/** Strip surrounding quotes from a STRING/CHAR lexeme and keep the inner text. */
function unquote(text: string): string {
  if (text.length >= 2) return text.slice(1, -1);
  return text;
}

export class AstBuilder extends PegaExprVisitor {
  /* ---- entry / passthrough ---- */
  visitExprEntry(ctx: Ctx): ExprNode {
    return this.visit(ctx.expr());
  }
  visitParenExpr(ctx: Ctx): ExprNode {
    return this.visit(ctx.expr());
  }
  visitFuncExpr(ctx: Ctx): ExprNode {
    // ANTLR JS renames the 'function' rule accessor to 'function_' (reserved word).
    return this.visit(ctx.function_());
  }
  visitRefExpr(ctx: Ctx): ExprNode {
    return this.visit(ctx.reference());
  }
  visitConstExpr(ctx: Ctx): ExprNode {
    return this.visit(ctx.constant());
  }
  visitPlaceholderExpr(ctx: Ctx): ExprNode {
    // {name} template placeholder — strip the braces.
    const raw: string = ctx.PLACEHOLDER().getText();
    return Placeholder(raw.slice(1, -1));
  }

  /* ---- operators ---- */
  visitUnaryExpr(ctx: Ctx): ExprNode {
    return UnaryOp(ctx.op.text, this.visit(ctx.expr()));
  }
  binary(ctx: Ctx): ExprNode {
    // ctx.expr() returns an array of two operands for binary rules.
    const kids = ctx.expr();
    return BinaryOp(ctx.op.text, this.visit(kids[0]), this.visit(kids[1]));
  }
  visitMulExpr(ctx: Ctx): ExprNode { return this.binary(ctx); }
  visitAddExpr(ctx: Ctx): ExprNode { return this.binary(ctx); }
  visitRelExpr(ctx: Ctx): ExprNode { return this.binary(ctx); }
  visitEqExpr(ctx: Ctx): ExprNode { return this.binary(ctx); }
  visitAndExpr(ctx: Ctx): ExprNode {
    const k = ctx.expr();
    return BinaryOp("&&", this.visit(k[0]), this.visit(k[1]));
  }
  visitOrExpr(ctx: Ctx): ExprNode {
    const k = ctx.expr();
    return BinaryOp("||", this.visit(k[0]), this.visit(k[1]));
  }
  visitTernaryExpr(ctx: Ctx): ExprNode {
    const k = ctx.expr();
    return Ternary(this.visit(k[0]), this.visit(k[1]), this.visit(k[2]));
  }

  /* ---- functions ---- */
  visitQualifiedFunc(ctx: Ctx): ExprNode {
    const ruleset: string = this.visit(ctx.rulesetIdent());
    const library: string = ctx.library.text;
    const name: string = ctx.fname.text;
    return FunctionCall(ruleset, library, name, this._args(ctx), false);
  }
  visitLibraryInstanceFunc(ctx: Ctx): ExprNode {
    // @Lib().method(args) — library-instance call; treat like a library-qualified function.
    return FunctionCall(null, ctx.library.text, ctx.fname.text, this._args(ctx), false);
  }
  visitLibraryFunc(ctx: Ctx): ExprNode {
    return FunctionCall(null, ctx.library.text, ctx.fname.text, this._args(ctx), false);
  }
  visitSimpleFunc(ctx: Ctx): ExprNode {
    return FunctionCall(null, null, ctx.fname.text, this._args(ctx), false);
  }
  visitLegacyLibraryFunc(ctx: Ctx): ExprNode {
    // @@Library.fn(args) — legacy direct library-function (deprecated=true).
    return FunctionCall(null, ctx.library.text, ctx.fname.text, this._args(ctx), true);
  }
  visitLegacySimpleFunc(ctx: Ctx): ExprNode {
    // @@fn(args) — legacy direct function (deprecated=true).
    return FunctionCall(null, null, ctx.fname.text, this._args(ctx), true);
  }
  visitBareFunc(ctx: Ctx): ExprNode {
    // fn(args) — bare call with no '@' prefix, e.g. a nested call inside another call's args.
    return FunctionCall(null, null, ctx.fname.text, this._args(ctx), false);
  }
  _args(ctx: Ctx): ExprNode[] {
    const list = ctx.exprList();
    if (!list) return [];
    return list.expr().map((e: Ctx) => this.visit(e));
  }
  visitRulesetIdent(ctx: Ctx): string {
    // ID ('-' ID)* — reassemble hyphenated ruleset name.
    return ctx.ID().map((t: Ctx) => t.getText()).join("-");
  }

  /* ---- references ---- */
  visitCurrentRef(ctx: Ctx): ExprNode {
    return Reference("current", ctx.ANGLE().getText(), this._segments(ctx));
  }
  visitPageRef(ctx: Ctx): ExprNode {
    return Reference("page", ctx.ID().getText(), this._segments(ctx));
  }
  visitRelativeRef(ctx: Ctx): ExprNode {
    return Reference("relative", null, this._segments(ctx));
  }
  visitBareRef(ctx: Ctx): ExprNode {
    return Reference("bare", ctx.ID().getText(), []);
  }
  visitParamPageRef(ctx: Ctx): ExprNode {
    // paramPage segment* — a keyed data-page reference like D_Page[k:v].seg
    const pp = ctx.paramPage();
    const page: string = pp.ID().getText();
    const params: KeyedPageParam[] = pp.keyedParam().map((kp: Ctx) => ({
      key: kp.ID().getText(),
      value: this.visit(kp.expr()),
    }));
    const ref: ReferenceNode = Reference("paramPage", page, this._segments(ctx));
    ref.pageParams = params;
    return ref;
  }
  _segments(ctx: Ctx): RefSegmentNode[] {
    return (ctx.segment() || []).map((s: Ctx) => this.visit(s));
  }
  visitSegment(ctx: Ctx): RefSegmentNode {
    const name: string = ctx.ID().getText();
    const sel = ctx.selector();
    return RefSegment(name, sel ? this.visit(sel) : null);
  }

  /* ---- selectors ---- */
  visitIndexSel(ctx: Ctx): SubscriptNode {
    return Subscript("index", parseInt(ctx.INT().getText(), 10));
  }
  visitKeySel(ctx: Ctx): SubscriptNode {
    return Subscript("key", ctx.ID().getText());
  }
  visitSymbolicSel(ctx: Ctx): SubscriptNode {
    const sym: string = ctx.ANGLE().getText();
    const e = ctx.expr();
    return Subscript("symbolic", e ? { symbol: sym, expr: this.visit(e) } : sym);
  }
  visitExprSel(ctx: Ctx): SubscriptNode {
    return Subscript("expr", this.visit(ctx.expr()));
  }
  visitAppendSel(_ctx: Ctx): SubscriptNode {
    return Subscript("append", "");
  }

  /* ---- constants ---- */
  visitIntConst(ctx: Ctx): ExprNode {
    const raw: string = ctx.INT().getText();
    return Constant(ConstantType.INTEGER, parseInt(raw, 10), raw);
  }
  visitLongConst(ctx: Ctx): ExprNode {
    const raw: string = ctx.LONG().getText();
    return Constant(ConstantType.LONG, raw, raw);
  }
  visitDoubleConst(ctx: Ctx): ExprNode {
    const raw: string = ctx.DOUBLE().getText();
    return Constant(ConstantType.DOUBLE, parseFloat(raw), raw);
  }
  visitStringConst(ctx: Ctx): ExprNode {
    const raw: string = ctx.STRING().getText();
    return Constant(ConstantType.STRING, unquote(raw), raw);
  }
  visitCharConst(ctx: Ctx): ExprNode {
    const raw: string = ctx.CHAR().getText();
    return Constant(ConstantType.CHAR, unquote(raw), raw);
  }
  visitTrueConst(_ctx: Ctx): ExprNode {
    return Constant(ConstantType.TRUE, true, "true");
  }
  visitFalseConst(_ctx: Ctx): ExprNode {
    return Constant(ConstantType.FALSE, false, "false");
  }
  visitAngleConst(ctx: Ctx): ExprNode {
    const raw: string = ctx.ANGLE().getText();
    return Constant(ConstantType.ANGLE, raw, raw);
  }
}
