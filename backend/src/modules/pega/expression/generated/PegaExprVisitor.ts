// Generated from C:/projects/kiro/SDLC-Agents-4-Enterprise/backend/src/modules/pega/expression/grammar/PegaExpr.g4 by ANTLR 4.13.2

import {ParseTreeVisitor} from 'antlr4';


import { ExprEntryContext } from "./PegaExprParser.js";
import { MulExprContext } from "./PegaExprParser.js";
import { AndExprContext } from "./PegaExprParser.js";
import { ConstExprContext } from "./PegaExprParser.js";
import { RelExprContext } from "./PegaExprParser.js";
import { AddExprContext } from "./PegaExprParser.js";
import { FuncExprContext } from "./PegaExprParser.js";
import { UnaryExprContext } from "./PegaExprParser.js";
import { PlaceholderExprContext } from "./PegaExprParser.js";
import { OrExprContext } from "./PegaExprParser.js";
import { EqExprContext } from "./PegaExprParser.js";
import { ParenExprContext } from "./PegaExprParser.js";
import { RefExprContext } from "./PegaExprParser.js";
import { TernaryExprContext } from "./PegaExprParser.js";
import { ExprListContext } from "./PegaExprParser.js";
import { QualifiedFuncContext } from "./PegaExprParser.js";
import { LibraryFuncContext } from "./PegaExprParser.js";
import { SimpleFuncContext } from "./PegaExprParser.js";
import { RulesetIdentContext } from "./PegaExprParser.js";
import { CurrentRefContext } from "./PegaExprParser.js";
import { ParamPageRefContext } from "./PegaExprParser.js";
import { PageRefContext } from "./PegaExprParser.js";
import { RelativeRefContext } from "./PegaExprParser.js";
import { BareRefContext } from "./PegaExprParser.js";
import { ParamPageContext } from "./PegaExprParser.js";
import { KeyedParamContext } from "./PegaExprParser.js";
import { SegmentContext } from "./PegaExprParser.js";
import { IndexSelContext } from "./PegaExprParser.js";
import { KeySelContext } from "./PegaExprParser.js";
import { SymbolicSelContext } from "./PegaExprParser.js";
import { ExprSelContext } from "./PegaExprParser.js";
import { AppendSelContext } from "./PegaExprParser.js";
import { IntConstContext } from "./PegaExprParser.js";
import { LongConstContext } from "./PegaExprParser.js";
import { DoubleConstContext } from "./PegaExprParser.js";
import { StringConstContext } from "./PegaExprParser.js";
import { CharConstContext } from "./PegaExprParser.js";
import { TrueConstContext } from "./PegaExprParser.js";
import { FalseConstContext } from "./PegaExprParser.js";
import { AngleConstContext } from "./PegaExprParser.js";


/**
 * This interface defines a complete generic visitor for a parse tree produced
 * by `PegaExprParser`.
 *
 * @param <Result> The return type of the visit operation. Use `void` for
 * operations with no return type.
 */
export default class PegaExprVisitor<Result> extends ParseTreeVisitor<Result> {
	/**
	 * Visit a parse tree produced by `PegaExprParser.exprEntry`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitExprEntry?: (ctx: ExprEntryContext) => Result;
	/**
	 * Visit a parse tree produced by the `MulExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitMulExpr?: (ctx: MulExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `AndExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAndExpr?: (ctx: AndExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `ConstExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitConstExpr?: (ctx: ConstExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `RelExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitRelExpr?: (ctx: RelExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `AddExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAddExpr?: (ctx: AddExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `FuncExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitFuncExpr?: (ctx: FuncExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `UnaryExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitUnaryExpr?: (ctx: UnaryExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `PlaceholderExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPlaceholderExpr?: (ctx: PlaceholderExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `OrExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitOrExpr?: (ctx: OrExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `EqExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitEqExpr?: (ctx: EqExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `ParenExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitParenExpr?: (ctx: ParenExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `RefExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitRefExpr?: (ctx: RefExprContext) => Result;
	/**
	 * Visit a parse tree produced by the `TernaryExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTernaryExpr?: (ctx: TernaryExprContext) => Result;
	/**
	 * Visit a parse tree produced by `PegaExprParser.exprList`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitExprList?: (ctx: ExprListContext) => Result;
	/**
	 * Visit a parse tree produced by the `QualifiedFunc`
	 * labeled alternative in `PegaExprParser.function`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitQualifiedFunc?: (ctx: QualifiedFuncContext) => Result;
	/**
	 * Visit a parse tree produced by the `LibraryFunc`
	 * labeled alternative in `PegaExprParser.function`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitLibraryFunc?: (ctx: LibraryFuncContext) => Result;
	/**
	 * Visit a parse tree produced by the `SimpleFunc`
	 * labeled alternative in `PegaExprParser.function`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSimpleFunc?: (ctx: SimpleFuncContext) => Result;
	/**
	 * Visit a parse tree produced by `PegaExprParser.rulesetIdent`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitRulesetIdent?: (ctx: RulesetIdentContext) => Result;
	/**
	 * Visit a parse tree produced by the `CurrentRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCurrentRef?: (ctx: CurrentRefContext) => Result;
	/**
	 * Visit a parse tree produced by the `ParamPageRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitParamPageRef?: (ctx: ParamPageRefContext) => Result;
	/**
	 * Visit a parse tree produced by the `PageRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitPageRef?: (ctx: PageRefContext) => Result;
	/**
	 * Visit a parse tree produced by the `RelativeRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitRelativeRef?: (ctx: RelativeRefContext) => Result;
	/**
	 * Visit a parse tree produced by the `BareRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitBareRef?: (ctx: BareRefContext) => Result;
	/**
	 * Visit a parse tree produced by `PegaExprParser.paramPage`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitParamPage?: (ctx: ParamPageContext) => Result;
	/**
	 * Visit a parse tree produced by `PegaExprParser.keyedParam`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitKeyedParam?: (ctx: KeyedParamContext) => Result;
	/**
	 * Visit a parse tree produced by `PegaExprParser.segment`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSegment?: (ctx: SegmentContext) => Result;
	/**
	 * Visit a parse tree produced by the `IndexSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitIndexSel?: (ctx: IndexSelContext) => Result;
	/**
	 * Visit a parse tree produced by the `KeySel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitKeySel?: (ctx: KeySelContext) => Result;
	/**
	 * Visit a parse tree produced by the `SymbolicSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitSymbolicSel?: (ctx: SymbolicSelContext) => Result;
	/**
	 * Visit a parse tree produced by the `ExprSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitExprSel?: (ctx: ExprSelContext) => Result;
	/**
	 * Visit a parse tree produced by the `AppendSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAppendSel?: (ctx: AppendSelContext) => Result;
	/**
	 * Visit a parse tree produced by the `IntConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitIntConst?: (ctx: IntConstContext) => Result;
	/**
	 * Visit a parse tree produced by the `LongConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitLongConst?: (ctx: LongConstContext) => Result;
	/**
	 * Visit a parse tree produced by the `DoubleConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitDoubleConst?: (ctx: DoubleConstContext) => Result;
	/**
	 * Visit a parse tree produced by the `StringConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitStringConst?: (ctx: StringConstContext) => Result;
	/**
	 * Visit a parse tree produced by the `CharConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitCharConst?: (ctx: CharConstContext) => Result;
	/**
	 * Visit a parse tree produced by the `TrueConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitTrueConst?: (ctx: TrueConstContext) => Result;
	/**
	 * Visit a parse tree produced by the `FalseConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitFalseConst?: (ctx: FalseConstContext) => Result;
	/**
	 * Visit a parse tree produced by the `AngleConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 * @return the visitor result
	 */
	visitAngleConst?: (ctx: AngleConstContext) => Result;
}

