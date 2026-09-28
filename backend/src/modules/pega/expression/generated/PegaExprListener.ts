// Generated from C:/projects/kiro/SDLC-Agents-4-Enterprise/backend/src/modules/pega/expression/grammar/PegaExpr.g4 by ANTLR 4.13.2

import {ParseTreeListener} from "antlr4";


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
 * This interface defines a complete listener for a parse tree produced by
 * `PegaExprParser`.
 */
export default class PegaExprListener extends ParseTreeListener {
	/**
	 * Enter a parse tree produced by `PegaExprParser.exprEntry`.
	 * @param ctx the parse tree
	 */
	enterExprEntry?: (ctx: ExprEntryContext) => void;
	/**
	 * Exit a parse tree produced by `PegaExprParser.exprEntry`.
	 * @param ctx the parse tree
	 */
	exitExprEntry?: (ctx: ExprEntryContext) => void;
	/**
	 * Enter a parse tree produced by the `MulExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterMulExpr?: (ctx: MulExprContext) => void;
	/**
	 * Exit a parse tree produced by the `MulExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitMulExpr?: (ctx: MulExprContext) => void;
	/**
	 * Enter a parse tree produced by the `AndExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterAndExpr?: (ctx: AndExprContext) => void;
	/**
	 * Exit a parse tree produced by the `AndExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitAndExpr?: (ctx: AndExprContext) => void;
	/**
	 * Enter a parse tree produced by the `ConstExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterConstExpr?: (ctx: ConstExprContext) => void;
	/**
	 * Exit a parse tree produced by the `ConstExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitConstExpr?: (ctx: ConstExprContext) => void;
	/**
	 * Enter a parse tree produced by the `RelExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterRelExpr?: (ctx: RelExprContext) => void;
	/**
	 * Exit a parse tree produced by the `RelExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitRelExpr?: (ctx: RelExprContext) => void;
	/**
	 * Enter a parse tree produced by the `AddExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterAddExpr?: (ctx: AddExprContext) => void;
	/**
	 * Exit a parse tree produced by the `AddExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitAddExpr?: (ctx: AddExprContext) => void;
	/**
	 * Enter a parse tree produced by the `FuncExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterFuncExpr?: (ctx: FuncExprContext) => void;
	/**
	 * Exit a parse tree produced by the `FuncExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitFuncExpr?: (ctx: FuncExprContext) => void;
	/**
	 * Enter a parse tree produced by the `UnaryExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterUnaryExpr?: (ctx: UnaryExprContext) => void;
	/**
	 * Exit a parse tree produced by the `UnaryExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitUnaryExpr?: (ctx: UnaryExprContext) => void;
	/**
	 * Enter a parse tree produced by the `PlaceholderExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterPlaceholderExpr?: (ctx: PlaceholderExprContext) => void;
	/**
	 * Exit a parse tree produced by the `PlaceholderExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitPlaceholderExpr?: (ctx: PlaceholderExprContext) => void;
	/**
	 * Enter a parse tree produced by the `OrExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterOrExpr?: (ctx: OrExprContext) => void;
	/**
	 * Exit a parse tree produced by the `OrExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitOrExpr?: (ctx: OrExprContext) => void;
	/**
	 * Enter a parse tree produced by the `EqExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterEqExpr?: (ctx: EqExprContext) => void;
	/**
	 * Exit a parse tree produced by the `EqExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitEqExpr?: (ctx: EqExprContext) => void;
	/**
	 * Enter a parse tree produced by the `ParenExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterParenExpr?: (ctx: ParenExprContext) => void;
	/**
	 * Exit a parse tree produced by the `ParenExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitParenExpr?: (ctx: ParenExprContext) => void;
	/**
	 * Enter a parse tree produced by the `RefExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterRefExpr?: (ctx: RefExprContext) => void;
	/**
	 * Exit a parse tree produced by the `RefExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitRefExpr?: (ctx: RefExprContext) => void;
	/**
	 * Enter a parse tree produced by the `TernaryExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	enterTernaryExpr?: (ctx: TernaryExprContext) => void;
	/**
	 * Exit a parse tree produced by the `TernaryExpr`
	 * labeled alternative in `PegaExprParser.expr`.
	 * @param ctx the parse tree
	 */
	exitTernaryExpr?: (ctx: TernaryExprContext) => void;
	/**
	 * Enter a parse tree produced by `PegaExprParser.exprList`.
	 * @param ctx the parse tree
	 */
	enterExprList?: (ctx: ExprListContext) => void;
	/**
	 * Exit a parse tree produced by `PegaExprParser.exprList`.
	 * @param ctx the parse tree
	 */
	exitExprList?: (ctx: ExprListContext) => void;
	/**
	 * Enter a parse tree produced by the `QualifiedFunc`
	 * labeled alternative in `PegaExprParser.function`.
	 * @param ctx the parse tree
	 */
	enterQualifiedFunc?: (ctx: QualifiedFuncContext) => void;
	/**
	 * Exit a parse tree produced by the `QualifiedFunc`
	 * labeled alternative in `PegaExprParser.function`.
	 * @param ctx the parse tree
	 */
	exitQualifiedFunc?: (ctx: QualifiedFuncContext) => void;
	/**
	 * Enter a parse tree produced by the `LibraryFunc`
	 * labeled alternative in `PegaExprParser.function`.
	 * @param ctx the parse tree
	 */
	enterLibraryFunc?: (ctx: LibraryFuncContext) => void;
	/**
	 * Exit a parse tree produced by the `LibraryFunc`
	 * labeled alternative in `PegaExprParser.function`.
	 * @param ctx the parse tree
	 */
	exitLibraryFunc?: (ctx: LibraryFuncContext) => void;
	/**
	 * Enter a parse tree produced by the `SimpleFunc`
	 * labeled alternative in `PegaExprParser.function`.
	 * @param ctx the parse tree
	 */
	enterSimpleFunc?: (ctx: SimpleFuncContext) => void;
	/**
	 * Exit a parse tree produced by the `SimpleFunc`
	 * labeled alternative in `PegaExprParser.function`.
	 * @param ctx the parse tree
	 */
	exitSimpleFunc?: (ctx: SimpleFuncContext) => void;
	/**
	 * Enter a parse tree produced by `PegaExprParser.rulesetIdent`.
	 * @param ctx the parse tree
	 */
	enterRulesetIdent?: (ctx: RulesetIdentContext) => void;
	/**
	 * Exit a parse tree produced by `PegaExprParser.rulesetIdent`.
	 * @param ctx the parse tree
	 */
	exitRulesetIdent?: (ctx: RulesetIdentContext) => void;
	/**
	 * Enter a parse tree produced by the `CurrentRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	enterCurrentRef?: (ctx: CurrentRefContext) => void;
	/**
	 * Exit a parse tree produced by the `CurrentRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	exitCurrentRef?: (ctx: CurrentRefContext) => void;
	/**
	 * Enter a parse tree produced by the `ParamPageRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	enterParamPageRef?: (ctx: ParamPageRefContext) => void;
	/**
	 * Exit a parse tree produced by the `ParamPageRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	exitParamPageRef?: (ctx: ParamPageRefContext) => void;
	/**
	 * Enter a parse tree produced by the `PageRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	enterPageRef?: (ctx: PageRefContext) => void;
	/**
	 * Exit a parse tree produced by the `PageRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	exitPageRef?: (ctx: PageRefContext) => void;
	/**
	 * Enter a parse tree produced by the `RelativeRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	enterRelativeRef?: (ctx: RelativeRefContext) => void;
	/**
	 * Exit a parse tree produced by the `RelativeRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	exitRelativeRef?: (ctx: RelativeRefContext) => void;
	/**
	 * Enter a parse tree produced by the `BareRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	enterBareRef?: (ctx: BareRefContext) => void;
	/**
	 * Exit a parse tree produced by the `BareRef`
	 * labeled alternative in `PegaExprParser.reference`.
	 * @param ctx the parse tree
	 */
	exitBareRef?: (ctx: BareRefContext) => void;
	/**
	 * Enter a parse tree produced by `PegaExprParser.paramPage`.
	 * @param ctx the parse tree
	 */
	enterParamPage?: (ctx: ParamPageContext) => void;
	/**
	 * Exit a parse tree produced by `PegaExprParser.paramPage`.
	 * @param ctx the parse tree
	 */
	exitParamPage?: (ctx: ParamPageContext) => void;
	/**
	 * Enter a parse tree produced by `PegaExprParser.keyedParam`.
	 * @param ctx the parse tree
	 */
	enterKeyedParam?: (ctx: KeyedParamContext) => void;
	/**
	 * Exit a parse tree produced by `PegaExprParser.keyedParam`.
	 * @param ctx the parse tree
	 */
	exitKeyedParam?: (ctx: KeyedParamContext) => void;
	/**
	 * Enter a parse tree produced by `PegaExprParser.segment`.
	 * @param ctx the parse tree
	 */
	enterSegment?: (ctx: SegmentContext) => void;
	/**
	 * Exit a parse tree produced by `PegaExprParser.segment`.
	 * @param ctx the parse tree
	 */
	exitSegment?: (ctx: SegmentContext) => void;
	/**
	 * Enter a parse tree produced by the `IndexSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	enterIndexSel?: (ctx: IndexSelContext) => void;
	/**
	 * Exit a parse tree produced by the `IndexSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	exitIndexSel?: (ctx: IndexSelContext) => void;
	/**
	 * Enter a parse tree produced by the `KeySel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	enterKeySel?: (ctx: KeySelContext) => void;
	/**
	 * Exit a parse tree produced by the `KeySel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	exitKeySel?: (ctx: KeySelContext) => void;
	/**
	 * Enter a parse tree produced by the `SymbolicSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	enterSymbolicSel?: (ctx: SymbolicSelContext) => void;
	/**
	 * Exit a parse tree produced by the `SymbolicSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	exitSymbolicSel?: (ctx: SymbolicSelContext) => void;
	/**
	 * Enter a parse tree produced by the `ExprSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	enterExprSel?: (ctx: ExprSelContext) => void;
	/**
	 * Exit a parse tree produced by the `ExprSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	exitExprSel?: (ctx: ExprSelContext) => void;
	/**
	 * Enter a parse tree produced by the `AppendSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	enterAppendSel?: (ctx: AppendSelContext) => void;
	/**
	 * Exit a parse tree produced by the `AppendSel`
	 * labeled alternative in `PegaExprParser.selector`.
	 * @param ctx the parse tree
	 */
	exitAppendSel?: (ctx: AppendSelContext) => void;
	/**
	 * Enter a parse tree produced by the `IntConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	enterIntConst?: (ctx: IntConstContext) => void;
	/**
	 * Exit a parse tree produced by the `IntConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	exitIntConst?: (ctx: IntConstContext) => void;
	/**
	 * Enter a parse tree produced by the `LongConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	enterLongConst?: (ctx: LongConstContext) => void;
	/**
	 * Exit a parse tree produced by the `LongConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	exitLongConst?: (ctx: LongConstContext) => void;
	/**
	 * Enter a parse tree produced by the `DoubleConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	enterDoubleConst?: (ctx: DoubleConstContext) => void;
	/**
	 * Exit a parse tree produced by the `DoubleConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	exitDoubleConst?: (ctx: DoubleConstContext) => void;
	/**
	 * Enter a parse tree produced by the `StringConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	enterStringConst?: (ctx: StringConstContext) => void;
	/**
	 * Exit a parse tree produced by the `StringConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	exitStringConst?: (ctx: StringConstContext) => void;
	/**
	 * Enter a parse tree produced by the `CharConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	enterCharConst?: (ctx: CharConstContext) => void;
	/**
	 * Exit a parse tree produced by the `CharConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	exitCharConst?: (ctx: CharConstContext) => void;
	/**
	 * Enter a parse tree produced by the `TrueConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	enterTrueConst?: (ctx: TrueConstContext) => void;
	/**
	 * Exit a parse tree produced by the `TrueConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	exitTrueConst?: (ctx: TrueConstContext) => void;
	/**
	 * Enter a parse tree produced by the `FalseConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	enterFalseConst?: (ctx: FalseConstContext) => void;
	/**
	 * Exit a parse tree produced by the `FalseConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	exitFalseConst?: (ctx: FalseConstContext) => void;
	/**
	 * Enter a parse tree produced by the `AngleConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	enterAngleConst?: (ctx: AngleConstContext) => void;
	/**
	 * Exit a parse tree produced by the `AngleConst`
	 * labeled alternative in `PegaExprParser.constant`.
	 * @param ctx the parse tree
	 */
	exitAngleConst?: (ctx: AngleConstContext) => void;
}

