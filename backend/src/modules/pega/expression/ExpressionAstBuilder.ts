/**
 * SA4E-233 — ExpressionAstBuilder.ts
 *
 * Visitor that converts the ANTLR parse tree (PegaExpr grammar) into the project's
 * typed expression AST nodes (from expressionNodes.ts). Ported from the standalone
 * tool's `astBuilder.js`. Keeping the AST shape stable means downstream consumers are
 * unaffected by the parser choice.
 *
 * The generated visitor is generic over a single Result type. Because segment selectors
 * yield `Subscript` (not `ExprNode`), the visitor Result is the union `AstResult`; helper
 * methods narrow the union at each use-site to keep the AST factories fully typed.
 */
import type { ParseTree } from 'antlr4';
import PegaExprVisitor from './generated/PegaExprVisitor.js';
import type {
  ExprEntryContext, ParenExprContext, FuncExprContext, RefExprContext, ConstExprContext,
  PlaceholderExprContext, UnaryExprContext, MulExprContext, AddExprContext, RelExprContext,
  EqExprContext, AndExprContext, OrExprContext, TernaryExprContext, QualifiedFuncContext,
  LibraryFuncContext, SimpleFuncContext, RulesetIdentContext, CurrentRefContext, PageRefContext,
  RelativeRefContext, BareRefContext, ParamPageRefContext, SegmentContext, ExprListContext,
  IndexSelContext, KeySelContext, SymbolicSelContext, ExprSelContext, AppendSelContext,
  IntConstContext, LongConstContext, DoubleConstContext, StringConstContext, CharConstContext,
  TrueConstContext, FalseConstContext, AngleConstContext,
} from './generated/PegaExprParser.js';
import {
  BinaryOp, UnaryOp, Ternary, FunctionCall, Reference, RefSegment, Subscript,
  Constant, ConstantType, Placeholder,
} from './expressionNodes.js';
import type { ExprNode, PageParam, Subscript as SubscriptNode } from './expressionTypes.js';

/** Visitor result union: expression nodes plus the subscript nodes selectors produce. */
type AstResult = ExprNode | SubscriptNode;

/** Strip surrounding quotes from a STRING/CHAR lexeme and keep the inner text. */
function unquote(text: string): string {
  return text.length >= 2 ? text.slice(1, -1) : text;
}

/**
 * ANTLR visitor producing typed expression AST nodes. Implemented methods override the
 * optional visitor hooks the generated base declares.
 */
export class ExpressionAstBuilder extends PegaExprVisitor<AstResult> {
  /** Visit a child parse tree and assert it produced an expression (not a subscript). */
  private expr(tree: ParseTree): ExprNode {
    return this.visit(tree) as ExprNode;
  }

  /* ---- entry / passthrough ---- */
  visitExprEntry = (ctx: ExprEntryContext): AstResult => this.visit(ctx.expr());
  visitParenExpr = (ctx: ParenExprContext): AstResult => this.visit(ctx.expr());
  visitFuncExpr = (ctx: FuncExprContext): AstResult => this.visit(ctx.function_());
  visitRefExpr = (ctx: RefExprContext): AstResult => this.visit(ctx.reference());
  visitConstExpr = (ctx: ConstExprContext): AstResult => this.visit(ctx.constant());
  visitPlaceholderExpr = (ctx: PlaceholderExprContext): AstResult =>
    Placeholder(ctx.PLACEHOLDER().getText().slice(1, -1));

  /* ---- operators ---- */
  visitUnaryExpr = (ctx: UnaryExprContext): AstResult => UnaryOp(ctx._op.text, this.expr(ctx.expr()));
  visitMulExpr = (ctx: MulExprContext): AstResult => this.bin(ctx._op.text, ctx.expr(0), ctx.expr(1));
  visitAddExpr = (ctx: AddExprContext): AstResult => this.bin(ctx._op.text, ctx.expr(0), ctx.expr(1));
  visitRelExpr = (ctx: RelExprContext): AstResult => this.bin(ctx._op.text, ctx.expr(0), ctx.expr(1));
  visitEqExpr = (ctx: EqExprContext): AstResult => this.bin(ctx._op.text, ctx.expr(0), ctx.expr(1));
  visitAndExpr = (ctx: AndExprContext): AstResult => this.bin('&&', ctx.expr(0), ctx.expr(1));
  visitOrExpr = (ctx: OrExprContext): AstResult => this.bin('||', ctx.expr(0), ctx.expr(1));
  visitTernaryExpr = (ctx: TernaryExprContext): AstResult =>
    Ternary(this.expr(ctx.expr(0)), this.expr(ctx.expr(1)), this.expr(ctx.expr(2)));

  /** Build a binary operation node from two operand parse trees. */
  private bin(op: string, l: ParseTree, r: ParseTree): ExprNode {
    return BinaryOp(op, this.expr(l), this.expr(r));
  }

  /* ---- functions ---- */
  visitQualifiedFunc = (ctx: QualifiedFuncContext): AstResult =>
    FunctionCall(this.rulesetName(ctx.rulesetIdent()), ctx._library.text, ctx._fname.text, this.args(ctx.exprList()));
  visitLibraryFunc = (ctx: LibraryFuncContext): AstResult =>
    FunctionCall(null, ctx._library.text, ctx._fname.text, this.args(ctx.exprList()));
  visitSimpleFunc = (ctx: SimpleFuncContext): AstResult =>
    FunctionCall(null, null, ctx._fname.text, this.args(ctx.exprList()));

  /** Map an optional exprList context to an array of AST argument nodes. */
  private args(list: ExprListContext | null): ExprNode[] {
    return list ? list.expr_list().map((e) => this.expr(e)) : [];
  }
  /** Reassemble a hyphenated ruleset name (ID ('-' ID)*). */
  private rulesetName(ctx: RulesetIdentContext): string {
    return ctx.ID_list().map((t) => t.getText()).join('-');
  }

  /* ---- references ---- */
  visitCurrentRef = (ctx: CurrentRefContext): AstResult =>
    Reference('current', ctx.ANGLE().getText(), this.segments(ctx.segment_list()));
  visitPageRef = (ctx: PageRefContext): AstResult =>
    Reference('page', ctx.ID().getText(), this.segments(ctx.segment_list()));
  visitRelativeRef = (ctx: RelativeRefContext): AstResult =>
    Reference('relative', null, this.segments(ctx.segment_list()));
  visitBareRef = (ctx: BareRefContext): AstResult => Reference('bare', ctx.ID().getText(), []);
  visitParamPageRef = (ctx: ParamPageRefContext): AstResult => {
    const pp = ctx.paramPage();
    const params: PageParam[] = pp.keyedParam_list().map((kp) => ({ key: kp.ID().getText(), value: this.expr(kp.expr()) }));
    return Reference('paramPage', pp.ID().getText(), this.segments(ctx.segment_list()), params);
  };
  /** Convert a list of segment contexts into RefSegment nodes. */
  private segments(list: SegmentContext[]): ReturnType<typeof RefSegment>[] {
    return (list || []).map((s) => this.buildSegment(s));
  }
  /** Build a single RefSegment, visiting its optional selector as a subscript. */
  private buildSegment(ctx: SegmentContext): ReturnType<typeof RefSegment> {
    const sel = ctx.selector();
    return RefSegment(ctx.ID().getText(), sel ? (this.visit(sel) as SubscriptNode) : null);
  }

  /* ---- selectors (produce Subscript nodes) ---- */
  visitIndexSel = (ctx: IndexSelContext): AstResult => Subscript('index', parseInt(ctx.INT().getText(), 10));
  visitKeySel = (ctx: KeySelContext): AstResult => Subscript('key', ctx.ID().getText());
  visitSymbolicSel = (ctx: SymbolicSelContext): AstResult => {
    const sym = ctx.ANGLE().getText();
    const e = ctx.expr();
    return Subscript('symbolic', e ? { symbol: sym, expr: this.expr(e) } : sym);
  };
  visitExprSel = (ctx: ExprSelContext): AstResult => Subscript('expr', this.expr(ctx.expr()));
  visitAppendSel = (_ctx: AppendSelContext): AstResult => Subscript('append', '');

  /* ---- constants ---- */
  visitIntConst = (ctx: IntConstContext): AstResult => {
    const raw = ctx.INT().getText();
    return Constant(ConstantType.INTEGER, parseInt(raw, 10), raw);
  };
  visitLongConst = (ctx: LongConstContext): AstResult => {
    const raw = ctx.LONG().getText();
    return Constant(ConstantType.LONG, raw, raw);
  };
  visitDoubleConst = (ctx: DoubleConstContext): AstResult => {
    const raw = ctx.DOUBLE().getText();
    return Constant(ConstantType.DOUBLE, parseFloat(raw), raw);
  };
  visitStringConst = (ctx: StringConstContext): AstResult => {
    const raw = ctx.STRING().getText();
    return Constant(ConstantType.STRING, unquote(raw), raw);
  };
  visitCharConst = (ctx: CharConstContext): AstResult => {
    const raw = ctx.CHAR().getText();
    return Constant(ConstantType.CHAR, unquote(raw), raw);
  };
  visitTrueConst = (_ctx: TrueConstContext): AstResult => Constant(ConstantType.TRUE, true, 'true');
  visitFalseConst = (_ctx: FalseConstContext): AstResult => Constant(ConstantType.FALSE, false, 'false');
  visitAngleConst = (ctx: AngleConstContext): AstResult => {
    const raw = ctx.ANGLE().getText();
    return Constant(ConstantType.ANGLE, raw, raw);
  };
}
