/**
 * Visitor that converts the ANTLR PegaExpr parse tree into typed ExprNode values.
 * This is the only parse-tree-to-AST adapter in the Pega expression module.
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

type AstResult = ExprNode | SubscriptNode;

const UNARY_OPERATORS: Readonly<Record<string, string>> = {
  '.NOT.': '!',
  '.ISNULL': 'ISNULL',
};

function unquote(text: string): string {
  return text.length >= 2 ? text.slice(1, -1) : text;
}

/** ANTLR visitor producing JSON-serializable expression nodes. */
export class ExpressionAstBuilder extends PegaExprVisitor<AstResult> {
  private expr(tree: ParseTree): ExprNode {
    return this.visit(tree) as ExprNode;
  }

  visitExprEntry = (ctx: ExprEntryContext): AstResult => this.visit(ctx.expr());
  visitParenExpr = (ctx: ParenExprContext): AstResult => this.visit(ctx.expr());
  visitFuncExpr = (ctx: FuncExprContext): AstResult => this.visit(ctx.function_());
  visitRefExpr = (ctx: RefExprContext): AstResult => this.visit(ctx.reference());
  visitConstExpr = (ctx: ConstExprContext): AstResult => this.visit(ctx.constant());
  visitPlaceholderExpr = (ctx: PlaceholderExprContext): AstResult =>
    Placeholder(ctx.PLACEHOLDER().getText().slice(1, -1));

  visitUnaryExpr = (ctx: UnaryExprContext): AstResult =>
    UnaryOp(UNARY_OPERATORS[ctx._op.text] ?? ctx._op.text, this.expr(ctx.expr()));
  visitMulExpr = (ctx: MulExprContext): AstResult => this.bin(ctx._op.text, ctx.expr(0), ctx.expr(1));
  visitAddExpr = (ctx: AddExprContext): AstResult => this.bin(ctx._op.text, ctx.expr(0), ctx.expr(1));
  visitRelExpr = (ctx: RelExprContext): AstResult => this.bin(ctx._op.text, ctx.expr(0), ctx.expr(1));
  visitEqExpr = (ctx: EqExprContext): AstResult => this.bin(ctx._op.text, ctx.expr(0), ctx.expr(1));
  visitAndExpr = (ctx: AndExprContext): AstResult => this.bin('&&', ctx.expr(0), ctx.expr(1));
  visitOrExpr = (ctx: OrExprContext): AstResult => this.bin('||', ctx.expr(0), ctx.expr(1));
  visitTernaryExpr = (ctx: TernaryExprContext): AstResult =>
    Ternary(this.expr(ctx.expr(0)), this.expr(ctx.expr(1)), this.expr(ctx.expr(2)));

  private bin(op: string, left: ParseTree, right: ParseTree): ExprNode {
    return BinaryOp(op, this.expr(left), this.expr(right));
  }

  visitQualifiedFunc = (ctx: QualifiedFuncContext): AstResult =>
    FunctionCall(this.rulesetName(ctx.rulesetIdent()), ctx._library.text, ctx._fname.text, this.args(ctx.exprList()));
  visitLibraryFunc = (ctx: LibraryFuncContext): AstResult =>
    FunctionCall(null, ctx._library.text, ctx._fname.text, this.args(ctx.exprList()));
  visitSimpleFunc = (ctx: SimpleFuncContext): AstResult =>
    FunctionCall(null, null, ctx._fname.text, this.args(ctx.exprList()));

  private args(list: ExprListContext | null): ExprNode[] {
    return list ? list.expr_list().map((expression) => this.expr(expression)) : [];
  }

  private rulesetName(ctx: RulesetIdentContext): string {
    return ctx.ID_list().map((token) => token.getText()).join('-');
  }

  visitCurrentRef = (ctx: CurrentRefContext): AstResult =>
    Reference('current', ctx.ANGLE().getText(), this.segments(ctx.segment_list()));
  visitPageRef = (ctx: PageRefContext): AstResult =>
    Reference('page', ctx.ID().getText(), this.segments(ctx.segment_list()));
  visitRelativeRef = (ctx: RelativeRefContext): AstResult =>
    Reference('relative', null, this.segments(ctx.segment_list()));
  visitBareRef = (ctx: BareRefContext): AstResult => Reference('bare', ctx.ID().getText(), []);
  visitParamPageRef = (ctx: ParamPageRefContext): AstResult => {
    const page = ctx.paramPage();
    const params: PageParam[] = page.keyedParam_list().map((param) => ({
      key: param.ID().getText(), value: this.expr(param.expr()),
    }));
    return Reference('paramPage', page.ID().getText(), this.segments(ctx.segment_list()), params);
  };

  private segments(list: SegmentContext[]): ReturnType<typeof RefSegment>[] {
    return (list || []).map((segment) => this.buildSegment(segment));
  }

  private buildSegment(ctx: SegmentContext): ReturnType<typeof RefSegment> {
    const selector = ctx.selector();
    return RefSegment(
      ctx.ID().getText(),
      selector ? (this.visit(selector) as SubscriptNode) : null,
    );
  }

  visitIndexSel = (ctx: IndexSelContext): AstResult =>
    Subscript('index', parseInt(ctx.INT().getText(), 10));
  visitKeySel = (ctx: KeySelContext): AstResult => Subscript('key', ctx.ID().getText());
  visitSymbolicSel = (ctx: SymbolicSelContext): AstResult => {
    const symbol = ctx.ANGLE().getText();
    const expression = ctx.expr();
    return Subscript(
      'symbolic',
      expression ? { symbol, expr: this.expr(expression) } : symbol,
    );
  };
  visitExprSel = (ctx: ExprSelContext): AstResult => Subscript('expr', this.expr(ctx.expr()));
  visitAppendSel = (_ctx: AppendSelContext): AstResult => Subscript('append', '');

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
