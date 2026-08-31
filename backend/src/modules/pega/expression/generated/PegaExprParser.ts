// Generated from C:/projects/kiro/SDLC-Agents-4-Enterprise/backend/src/modules/pega/expression/grammar/PegaExpr.g4 by ANTLR 4.13.2
// noinspection ES6UnusedImports,JSUnusedGlobalSymbols,JSUnusedLocalSymbols

import {
	ATN,
	ATNDeserializer, DecisionState, DFA, FailedPredicateException,
	RecognitionException, NoViableAltException, BailErrorStrategy,
	Parser, ParserATNSimulator,
	RuleContext, ParserRuleContext, PredictionMode, PredictionContextCache,
	TerminalNode, RuleNode,
	Token, TokenStream,
	Interval, IntervalSet
} from 'antlr4';
import PegaExprListener from "./PegaExprListener.js";
import PegaExprVisitor from "./PegaExprVisitor.js";

// for running tests with parameters, TODO: discuss strategy for typed parameters in CI
// eslint-disable-next-line no-unused-vars
type int = number;

export default class PegaExprParser extends Parser {
	public static readonly TRUE = 1;
	public static readonly FALSE = 2;
	public static readonly LE = 3;
	public static readonly GE = 4;
	public static readonly EQ = 5;
	public static readonly NE = 6;
	public static readonly NE2 = 7;
	public static readonly LIKE = 8;
	public static readonly FUZZY = 9;
	public static readonly AND = 10;
	public static readonly OR = 11;
	public static readonly LPAREN = 12;
	public static readonly RPAREN = 13;
	public static readonly LBRACK = 14;
	public static readonly RBRACK = 15;
	public static readonly DOT = 16;
	public static readonly COMMA = 17;
	public static readonly AT = 18;
	public static readonly COLON = 19;
	public static readonly LT = 20;
	public static readonly GT = 21;
	public static readonly ASGN_EQ = 22;
	public static readonly NOT = 23;
	public static readonly QUESTION = 24;
	public static readonly PLUS = 25;
	public static readonly MINUS = 26;
	public static readonly STAR = 27;
	public static readonly SLASH = 28;
	public static readonly PERCENT = 29;
	public static readonly ANGLE = 30;
	public static readonly PLACEHOLDER = 31;
	public static readonly STRING = 32;
	public static readonly CHAR = 33;
	public static readonly ID = 34;
	public static readonly DOUBLE = 35;
	public static readonly LONG = 36;
	public static readonly INT = 37;
	public static readonly WS = 38;
	public static override readonly EOF = Token.EOF;
	public static readonly RULE_exprEntry = 0;
	public static readonly RULE_expr = 1;
	public static readonly RULE_exprList = 2;
	public static readonly RULE_function = 3;
	public static readonly RULE_rulesetIdent = 4;
	public static readonly RULE_reference = 5;
	public static readonly RULE_paramPage = 6;
	public static readonly RULE_keyedParam = 7;
	public static readonly RULE_segment = 8;
	public static readonly RULE_selector = 9;
	public static readonly RULE_constant = 10;
	public static readonly literalNames: (string | null)[] = [ null, "'true'", 
                                                            "'false'", "'<='", 
                                                            "'>='", "'=='", 
                                                            "'!='", "'<>'", 
                                                            "'^='", "'~='", 
                                                            "'&&'", "'||'", 
                                                            "'('", "')'", 
                                                            "'['", "']'", 
                                                            "'.'", "','", 
                                                            "'@'", "':'", 
                                                            "'<'", "'>'", 
                                                            "'='", "'!'", 
                                                            "'?'", "'+'", 
                                                            "'-'", "'*'", 
                                                            "'/'", "'%'" ];
	public static readonly symbolicNames: (string | null)[] = [ null, "TRUE", 
                                                             "FALSE", "LE", 
                                                             "GE", "EQ", 
                                                             "NE", "NE2", 
                                                             "LIKE", "FUZZY", 
                                                             "AND", "OR", 
                                                             "LPAREN", "RPAREN", 
                                                             "LBRACK", "RBRACK", 
                                                             "DOT", "COMMA", 
                                                             "AT", "COLON", 
                                                             "LT", "GT", 
                                                             "ASGN_EQ", 
                                                             "NOT", "QUESTION", 
                                                             "PLUS", "MINUS", 
                                                             "STAR", "SLASH", 
                                                             "PERCENT", 
                                                             "ANGLE", "PLACEHOLDER", 
                                                             "STRING", "CHAR", 
                                                             "ID", "DOUBLE", 
                                                             "LONG", "INT", 
                                                             "WS" ];
	// tslint:disable:no-trailing-whitespace
	public static readonly ruleNames: string[] = [
		"exprEntry", "expr", "exprList", "function", "rulesetIdent", "reference", 
		"paramPage", "keyedParam", "segment", "selector", "constant",
	];
	public get grammarFileName(): string { return "PegaExpr.g4"; }
	public get literalNames(): (string | null)[] { return PegaExprParser.literalNames; }
	public get symbolicNames(): (string | null)[] { return PegaExprParser.symbolicNames; }
	public get ruleNames(): string[] { return PegaExprParser.ruleNames; }
	public get serializedATN(): number[] { return PegaExprParser._serializedATN; }

	protected createFailedPredicateException(predicate?: string, message?: string): FailedPredicateException {
		return new FailedPredicateException(this, predicate, message);
	}

	constructor(input: TokenStream) {
		super(input);
		this._interp = new ParserATNSimulator(this, PegaExprParser._ATN, PegaExprParser.DecisionsToDFA, new PredictionContextCache());
	}
	// @RuleVersion(0)
	public exprEntry(): ExprEntryContext {
		let localctx: ExprEntryContext = new ExprEntryContext(this, this._ctx, this.state);
		this.enterRule(localctx, 0, PegaExprParser.RULE_exprEntry);
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 22;
			this.expr(0);
			this.state = 23;
			this.match(PegaExprParser.EOF);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}

	public expr(): ExprContext;
	public expr(_p: number): ExprContext;
	// @RuleVersion(0)
	public expr(_p?: number): ExprContext {
		if (_p === undefined) {
			_p = 0;
		}

		let _parentctx: ParserRuleContext = this._ctx;
		let _parentState: number = this.state;
		let localctx: ExprContext = new ExprContext(this, this._ctx, _parentState);
		let _prevctx: ExprContext = localctx;
		let _startState: number = 2;
		this.enterRecursionRule(localctx, 2, PegaExprParser.RULE_expr, _p);
		let _la: number;
		try {
			let _alt: number;
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 36;
			this._errHandler.sync(this);
			switch ( this._interp.adaptivePredict(this._input, 0, this._ctx) ) {
			case 1:
				{
				localctx = new FuncExprContext(this, localctx);
				this._ctx = localctx;
				_prevctx = localctx;

				this.state = 26;
				this.function_();
				}
				break;
			case 2:
				{
				localctx = new RefExprContext(this, localctx);
				this._ctx = localctx;
				_prevctx = localctx;
				this.state = 27;
				this.reference();
				}
				break;
			case 3:
				{
				localctx = new ConstExprContext(this, localctx);
				this._ctx = localctx;
				_prevctx = localctx;
				this.state = 28;
				this.constant();
				}
				break;
			case 4:
				{
				localctx = new ParenExprContext(this, localctx);
				this._ctx = localctx;
				_prevctx = localctx;
				this.state = 29;
				this.match(PegaExprParser.LPAREN);
				this.state = 30;
				this.expr(0);
				this.state = 31;
				this.match(PegaExprParser.RPAREN);
				}
				break;
			case 5:
				{
				localctx = new PlaceholderExprContext(this, localctx);
				this._ctx = localctx;
				_prevctx = localctx;
				this.state = 33;
				this.match(PegaExprParser.PLACEHOLDER);
				}
				break;
			case 6:
				{
				localctx = new UnaryExprContext(this, localctx);
				this._ctx = localctx;
				_prevctx = localctx;
				this.state = 34;
				(localctx as UnaryExprContext)._op = this._input.LT(1);
				_la = this._input.LA(1);
				if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 113246208) !== 0))) {
				    (localctx as UnaryExprContext)._op = this._errHandler.recoverInline(this);
				}
				else {
					this._errHandler.reportMatch(this);
				    this.consume();
				}
				this.state = 35;
				this.expr(8);
				}
				break;
			}
			this._ctx.stop = this._input.LT(-1);
			this.state = 64;
			this._errHandler.sync(this);
			_alt = this._interp.adaptivePredict(this._input, 2, this._ctx);
			while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
				if (_alt === 1) {
					if (this._parseListeners != null) {
						this.triggerExitRuleEvent();
					}
					_prevctx = localctx;
					{
					this.state = 62;
					this._errHandler.sync(this);
					switch ( this._interp.adaptivePredict(this._input, 1, this._ctx) ) {
					case 1:
						{
						localctx = new MulExprContext(this, new ExprContext(this, _parentctx, _parentState));
						this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
						this.state = 38;
						if (!(this.precpred(this._ctx, 7))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 7)");
						}
						this.state = 39;
						(localctx as MulExprContext)._op = this._input.LT(1);
						_la = this._input.LA(1);
						if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 939524096) !== 0))) {
						    (localctx as MulExprContext)._op = this._errHandler.recoverInline(this);
						}
						else {
							this._errHandler.reportMatch(this);
						    this.consume();
						}
						this.state = 40;
						this.expr(8);
						}
						break;
					case 2:
						{
						localctx = new AddExprContext(this, new ExprContext(this, _parentctx, _parentState));
						this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
						this.state = 41;
						if (!(this.precpred(this._ctx, 6))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 6)");
						}
						this.state = 42;
						(localctx as AddExprContext)._op = this._input.LT(1);
						_la = this._input.LA(1);
						if(!(_la===25 || _la===26)) {
						    (localctx as AddExprContext)._op = this._errHandler.recoverInline(this);
						}
						else {
							this._errHandler.reportMatch(this);
						    this.consume();
						}
						this.state = 43;
						this.expr(7);
						}
						break;
					case 3:
						{
						localctx = new RelExprContext(this, new ExprContext(this, _parentctx, _parentState));
						this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
						this.state = 44;
						if (!(this.precpred(this._ctx, 5))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 5)");
						}
						this.state = 45;
						(localctx as RelExprContext)._op = this._input.LT(1);
						_la = this._input.LA(1);
						if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 3145752) !== 0))) {
						    (localctx as RelExprContext)._op = this._errHandler.recoverInline(this);
						}
						else {
							this._errHandler.reportMatch(this);
						    this.consume();
						}
						this.state = 46;
						this.expr(6);
						}
						break;
					case 4:
						{
						localctx = new EqExprContext(this, new ExprContext(this, _parentctx, _parentState));
						this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
						this.state = 47;
						if (!(this.precpred(this._ctx, 4))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 4)");
						}
						this.state = 48;
						(localctx as EqExprContext)._op = this._input.LT(1);
						_la = this._input.LA(1);
						if(!((((_la) & ~0x1F) === 0 && ((1 << _la) & 4195296) !== 0))) {
						    (localctx as EqExprContext)._op = this._errHandler.recoverInline(this);
						}
						else {
							this._errHandler.reportMatch(this);
						    this.consume();
						}
						this.state = 49;
						this.expr(5);
						}
						break;
					case 5:
						{
						localctx = new AndExprContext(this, new ExprContext(this, _parentctx, _parentState));
						this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
						this.state = 50;
						if (!(this.precpred(this._ctx, 3))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 3)");
						}
						this.state = 51;
						this.match(PegaExprParser.AND);
						this.state = 52;
						this.expr(4);
						}
						break;
					case 6:
						{
						localctx = new OrExprContext(this, new ExprContext(this, _parentctx, _parentState));
						this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
						this.state = 53;
						if (!(this.precpred(this._ctx, 2))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 2)");
						}
						this.state = 54;
						this.match(PegaExprParser.OR);
						this.state = 55;
						this.expr(3);
						}
						break;
					case 7:
						{
						localctx = new TernaryExprContext(this, new ExprContext(this, _parentctx, _parentState));
						this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
						this.state = 56;
						if (!(this.precpred(this._ctx, 1))) {
							throw this.createFailedPredicateException("this.precpred(this._ctx, 1)");
						}
						this.state = 57;
						this.match(PegaExprParser.QUESTION);
						this.state = 58;
						this.expr(0);
						this.state = 59;
						this.match(PegaExprParser.COLON);
						this.state = 60;
						this.expr(1);
						}
						break;
					}
					}
				}
				this.state = 66;
				this._errHandler.sync(this);
				_alt = this._interp.adaptivePredict(this._input, 2, this._ctx);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.unrollRecursionContexts(_parentctx);
		}
		return localctx;
	}
	// @RuleVersion(0)
	public exprList(): ExprListContext {
		let localctx: ExprListContext = new ExprListContext(this, this._ctx, this.state);
		this.enterRule(localctx, 4, PegaExprParser.RULE_exprList);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 67;
			this.expr(0);
			this.state = 72;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la===17) {
				{
				{
				this.state = 68;
				this.match(PegaExprParser.COMMA);
				this.state = 69;
				this.expr(0);
				}
				}
				this.state = 74;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public function_(): FunctionContext {
		let localctx: FunctionContext = new FunctionContext(this, this._ctx, this.state);
		this.enterRule(localctx, 6, PegaExprParser.RULE_function);
		let _la: number;
		try {
			this.state = 105;
			this._errHandler.sync(this);
			switch ( this._interp.adaptivePredict(this._input, 7, this._ctx) ) {
			case 1:
				localctx = new QualifiedFuncContext(this, localctx);
				this.enterOuterAlt(localctx, 1);
				{
				this.state = 75;
				this.match(PegaExprParser.AT);
				this.state = 76;
				this.match(PegaExprParser.LPAREN);
				this.state = 77;
				this.rulesetIdent();
				this.state = 78;
				this.match(PegaExprParser.COLON);
				this.state = 79;
				(localctx as QualifiedFuncContext)._library = this.match(PegaExprParser.ID);
				this.state = 80;
				this.match(PegaExprParser.RPAREN);
				this.state = 81;
				this.match(PegaExprParser.DOT);
				this.state = 82;
				(localctx as QualifiedFuncContext)._fname = this.match(PegaExprParser.ID);
				this.state = 83;
				this.match(PegaExprParser.LPAREN);
				this.state = 85;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
					{
					this.state = 84;
					this.exprList();
					}
				}

				this.state = 87;
				this.match(PegaExprParser.RPAREN);
				}
				break;
			case 2:
				localctx = new LibraryFuncContext(this, localctx);
				this.enterOuterAlt(localctx, 2);
				{
				this.state = 89;
				this.match(PegaExprParser.AT);
				this.state = 90;
				(localctx as LibraryFuncContext)._library = this.match(PegaExprParser.ID);
				this.state = 91;
				this.match(PegaExprParser.DOT);
				this.state = 92;
				(localctx as LibraryFuncContext)._fname = this.match(PegaExprParser.ID);
				this.state = 93;
				this.match(PegaExprParser.LPAREN);
				this.state = 95;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
					{
					this.state = 94;
					this.exprList();
					}
				}

				this.state = 97;
				this.match(PegaExprParser.RPAREN);
				}
				break;
			case 3:
				localctx = new SimpleFuncContext(this, localctx);
				this.enterOuterAlt(localctx, 3);
				{
				this.state = 98;
				this.match(PegaExprParser.AT);
				this.state = 99;
				(localctx as SimpleFuncContext)._fname = this.match(PegaExprParser.ID);
				this.state = 100;
				this.match(PegaExprParser.LPAREN);
				this.state = 102;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
					{
					this.state = 101;
					this.exprList();
					}
				}

				this.state = 104;
				this.match(PegaExprParser.RPAREN);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public rulesetIdent(): RulesetIdentContext {
		let localctx: RulesetIdentContext = new RulesetIdentContext(this, this._ctx, this.state);
		this.enterRule(localctx, 8, PegaExprParser.RULE_rulesetIdent);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 107;
			this.match(PegaExprParser.ID);
			this.state = 112;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la===26) {
				{
				{
				this.state = 108;
				this.match(PegaExprParser.MINUS);
				this.state = 109;
				this.match(PegaExprParser.ID);
				}
				}
				this.state = 114;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public reference(): ReferenceContext {
		let localctx: ReferenceContext = new ReferenceContext(this, this._ctx, this.state);
		this.enterRule(localctx, 10, PegaExprParser.RULE_reference);
		try {
			let _alt: number;
			this.state = 140;
			this._errHandler.sync(this);
			switch ( this._interp.adaptivePredict(this._input, 13, this._ctx) ) {
			case 1:
				localctx = new CurrentRefContext(this, localctx);
				this.enterOuterAlt(localctx, 1);
				{
				this.state = 115;
				this.match(PegaExprParser.ANGLE);
				this.state = 117;
				this._errHandler.sync(this);
				_alt = 1;
				do {
					switch (_alt) {
					case 1:
						{
						{
						this.state = 116;
						this.segment();
						}
						}
						break;
					default:
						throw new NoViableAltException(this);
					}
					this.state = 119;
					this._errHandler.sync(this);
					_alt = this._interp.adaptivePredict(this._input, 9, this._ctx);
				} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
				}
				break;
			case 2:
				localctx = new ParamPageRefContext(this, localctx);
				this.enterOuterAlt(localctx, 2);
				{
				this.state = 121;
				this.paramPage();
				this.state = 125;
				this._errHandler.sync(this);
				_alt = this._interp.adaptivePredict(this._input, 10, this._ctx);
				while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER) {
					if (_alt === 1) {
						{
						{
						this.state = 122;
						this.segment();
						}
						}
					}
					this.state = 127;
					this._errHandler.sync(this);
					_alt = this._interp.adaptivePredict(this._input, 10, this._ctx);
				}
				}
				break;
			case 3:
				localctx = new PageRefContext(this, localctx);
				this.enterOuterAlt(localctx, 3);
				{
				this.state = 128;
				this.match(PegaExprParser.ID);
				this.state = 130;
				this._errHandler.sync(this);
				_alt = 1;
				do {
					switch (_alt) {
					case 1:
						{
						{
						this.state = 129;
						this.segment();
						}
						}
						break;
					default:
						throw new NoViableAltException(this);
					}
					this.state = 132;
					this._errHandler.sync(this);
					_alt = this._interp.adaptivePredict(this._input, 11, this._ctx);
				} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
				}
				break;
			case 4:
				localctx = new RelativeRefContext(this, localctx);
				this.enterOuterAlt(localctx, 4);
				{
				this.state = 135;
				this._errHandler.sync(this);
				_alt = 1;
				do {
					switch (_alt) {
					case 1:
						{
						{
						this.state = 134;
						this.segment();
						}
						}
						break;
					default:
						throw new NoViableAltException(this);
					}
					this.state = 137;
					this._errHandler.sync(this);
					_alt = this._interp.adaptivePredict(this._input, 12, this._ctx);
				} while (_alt !== 2 && _alt !== ATN.INVALID_ALT_NUMBER);
				}
				break;
			case 5:
				localctx = new BareRefContext(this, localctx);
				this.enterOuterAlt(localctx, 5);
				{
				this.state = 139;
				this.match(PegaExprParser.ID);
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public paramPage(): ParamPageContext {
		let localctx: ParamPageContext = new ParamPageContext(this, this._ctx, this.state);
		this.enterRule(localctx, 12, PegaExprParser.RULE_paramPage);
		let _la: number;
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 142;
			this.match(PegaExprParser.ID);
			this.state = 143;
			this.match(PegaExprParser.LBRACK);
			this.state = 144;
			this.keyedParam();
			this.state = 149;
			this._errHandler.sync(this);
			_la = this._input.LA(1);
			while (_la===17) {
				{
				{
				this.state = 145;
				this.match(PegaExprParser.COMMA);
				this.state = 146;
				this.keyedParam();
				}
				}
				this.state = 151;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
			}
			this.state = 152;
			this.match(PegaExprParser.RBRACK);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public keyedParam(): KeyedParamContext {
		let localctx: KeyedParamContext = new KeyedParamContext(this, this._ctx, this.state);
		this.enterRule(localctx, 14, PegaExprParser.RULE_keyedParam);
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 154;
			this.match(PegaExprParser.ID);
			this.state = 155;
			this.match(PegaExprParser.COLON);
			this.state = 156;
			this.expr(0);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public segment(): SegmentContext {
		let localctx: SegmentContext = new SegmentContext(this, this._ctx, this.state);
		this.enterRule(localctx, 16, PegaExprParser.RULE_segment);
		try {
			this.enterOuterAlt(localctx, 1);
			{
			this.state = 158;
			this.match(PegaExprParser.DOT);
			this.state = 159;
			this.match(PegaExprParser.ID);
			this.state = 164;
			this._errHandler.sync(this);
			switch ( this._interp.adaptivePredict(this._input, 15, this._ctx) ) {
			case 1:
				{
				this.state = 160;
				this.match(PegaExprParser.LPAREN);
				this.state = 161;
				this.selector();
				this.state = 162;
				this.match(PegaExprParser.RPAREN);
				}
				break;
			}
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public selector(): SelectorContext {
		let localctx: SelectorContext = new SelectorContext(this, this._ctx, this.state);
		this.enterRule(localctx, 18, PegaExprParser.RULE_selector);
		let _la: number;
		try {
			this.state = 174;
			this._errHandler.sync(this);
			switch ( this._interp.adaptivePredict(this._input, 17, this._ctx) ) {
			case 1:
				localctx = new IndexSelContext(this, localctx);
				this.enterOuterAlt(localctx, 1);
				{
				this.state = 166;
				this.match(PegaExprParser.INT);
				}
				break;
			case 2:
				localctx = new KeySelContext(this, localctx);
				this.enterOuterAlt(localctx, 2);
				{
				this.state = 167;
				this.match(PegaExprParser.ID);
				}
				break;
			case 3:
				localctx = new SymbolicSelContext(this, localctx);
				this.enterOuterAlt(localctx, 3);
				{
				this.state = 168;
				this.match(PegaExprParser.ANGLE);
				this.state = 170;
				this._errHandler.sync(this);
				_la = this._input.LA(1);
				if ((((_la) & ~0x1F) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1F) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
					{
					this.state = 169;
					this.expr(0);
					}
				}

				}
				break;
			case 4:
				localctx = new ExprSelContext(this, localctx);
				this.enterOuterAlt(localctx, 4);
				{
				this.state = 172;
				this.expr(0);
				}
				break;
			case 5:
				localctx = new AppendSelContext(this, localctx);
				this.enterOuterAlt(localctx, 5);
				// tslint:disable-next-line:no-empty
				{
				}
				break;
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}
	// @RuleVersion(0)
	public constant(): ConstantContext {
		let localctx: ConstantContext = new ConstantContext(this, this._ctx, this.state);
		this.enterRule(localctx, 20, PegaExprParser.RULE_constant);
		try {
			this.state = 184;
			this._errHandler.sync(this);
			switch (this._input.LA(1)) {
			case 37:
				localctx = new IntConstContext(this, localctx);
				this.enterOuterAlt(localctx, 1);
				{
				this.state = 176;
				this.match(PegaExprParser.INT);
				}
				break;
			case 36:
				localctx = new LongConstContext(this, localctx);
				this.enterOuterAlt(localctx, 2);
				{
				this.state = 177;
				this.match(PegaExprParser.LONG);
				}
				break;
			case 35:
				localctx = new DoubleConstContext(this, localctx);
				this.enterOuterAlt(localctx, 3);
				{
				this.state = 178;
				this.match(PegaExprParser.DOUBLE);
				}
				break;
			case 32:
				localctx = new StringConstContext(this, localctx);
				this.enterOuterAlt(localctx, 4);
				{
				this.state = 179;
				this.match(PegaExprParser.STRING);
				}
				break;
			case 33:
				localctx = new CharConstContext(this, localctx);
				this.enterOuterAlt(localctx, 5);
				{
				this.state = 180;
				this.match(PegaExprParser.CHAR);
				}
				break;
			case 1:
				localctx = new TrueConstContext(this, localctx);
				this.enterOuterAlt(localctx, 6);
				{
				this.state = 181;
				this.match(PegaExprParser.TRUE);
				}
				break;
			case 2:
				localctx = new FalseConstContext(this, localctx);
				this.enterOuterAlt(localctx, 7);
				{
				this.state = 182;
				this.match(PegaExprParser.FALSE);
				}
				break;
			case 30:
				localctx = new AngleConstContext(this, localctx);
				this.enterOuterAlt(localctx, 8);
				{
				this.state = 183;
				this.match(PegaExprParser.ANGLE);
				}
				break;
			default:
				throw new NoViableAltException(this);
			}
		}
		catch (re) {
			if (re instanceof RecognitionException) {
				localctx.exception = re;
				this._errHandler.reportError(this, re);
				this._errHandler.recover(this, re);
			} else {
				throw re;
			}
		}
		finally {
			this.exitRule();
		}
		return localctx;
	}

	public sempred(localctx: RuleContext, ruleIndex: number, predIndex: number): boolean {
		switch (ruleIndex) {
		case 1:
			return this.expr_sempred(localctx as ExprContext, predIndex);
		}
		return true;
	}
	private expr_sempred(localctx: ExprContext, predIndex: number): boolean {
		switch (predIndex) {
		case 0:
			return this.precpred(this._ctx, 7);
		case 1:
			return this.precpred(this._ctx, 6);
		case 2:
			return this.precpred(this._ctx, 5);
		case 3:
			return this.precpred(this._ctx, 4);
		case 4:
			return this.precpred(this._ctx, 3);
		case 5:
			return this.precpred(this._ctx, 2);
		case 6:
			return this.precpred(this._ctx, 1);
		}
		return true;
	}

	public static readonly _serializedATN: number[] = [4,1,38,187,2,0,7,0,2,
	1,7,1,2,2,7,2,2,3,7,3,2,4,7,4,2,5,7,5,2,6,7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,
	10,7,10,1,0,1,0,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,37,
	8,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
	1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,1,63,8,1,10,1,12,1,66,9,1,1,2,1,2,1,2,5,2,
	71,8,2,10,2,12,2,74,9,2,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,3,3,86,
	8,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,3,3,96,8,3,1,3,1,3,1,3,1,3,1,3,3,3,
	103,8,3,1,3,3,3,106,8,3,1,4,1,4,1,4,5,4,111,8,4,10,4,12,4,114,9,4,1,5,1,
	5,4,5,118,8,5,11,5,12,5,119,1,5,1,5,5,5,124,8,5,10,5,12,5,127,9,5,1,5,1,
	5,4,5,131,8,5,11,5,12,5,132,1,5,4,5,136,8,5,11,5,12,5,137,1,5,3,5,141,8,
	5,1,6,1,6,1,6,1,6,1,6,5,6,148,8,6,10,6,12,6,151,9,6,1,6,1,6,1,7,1,7,1,7,
	1,7,1,8,1,8,1,8,1,8,1,8,1,8,3,8,165,8,8,1,9,1,9,1,9,1,9,3,9,171,8,9,1,9,
	1,9,3,9,175,8,9,1,10,1,10,1,10,1,10,1,10,1,10,1,10,1,10,3,10,185,8,10,1,
	10,0,1,2,11,0,2,4,6,8,10,12,14,16,18,20,0,5,2,0,22,23,25,26,1,0,27,29,1,
	0,25,26,2,0,3,4,20,21,2,0,5,9,22,22,216,0,22,1,0,0,0,2,36,1,0,0,0,4,67,
	1,0,0,0,6,105,1,0,0,0,8,107,1,0,0,0,10,140,1,0,0,0,12,142,1,0,0,0,14,154,
	1,0,0,0,16,158,1,0,0,0,18,174,1,0,0,0,20,184,1,0,0,0,22,23,3,2,1,0,23,24,
	5,0,0,1,24,1,1,0,0,0,25,26,6,1,-1,0,26,37,3,6,3,0,27,37,3,10,5,0,28,37,
	3,20,10,0,29,30,5,12,0,0,30,31,3,2,1,0,31,32,5,13,0,0,32,37,1,0,0,0,33,
	37,5,31,0,0,34,35,7,0,0,0,35,37,3,2,1,8,36,25,1,0,0,0,36,27,1,0,0,0,36,
	28,1,0,0,0,36,29,1,0,0,0,36,33,1,0,0,0,36,34,1,0,0,0,37,64,1,0,0,0,38,39,
	10,7,0,0,39,40,7,1,0,0,40,63,3,2,1,8,41,42,10,6,0,0,42,43,7,2,0,0,43,63,
	3,2,1,7,44,45,10,5,0,0,45,46,7,3,0,0,46,63,3,2,1,6,47,48,10,4,0,0,48,49,
	7,4,0,0,49,63,3,2,1,5,50,51,10,3,0,0,51,52,5,10,0,0,52,63,3,2,1,4,53,54,
	10,2,0,0,54,55,5,11,0,0,55,63,3,2,1,3,56,57,10,1,0,0,57,58,5,24,0,0,58,
	59,3,2,1,0,59,60,5,19,0,0,60,61,3,2,1,1,61,63,1,0,0,0,62,38,1,0,0,0,62,
	41,1,0,0,0,62,44,1,0,0,0,62,47,1,0,0,0,62,50,1,0,0,0,62,53,1,0,0,0,62,56,
	1,0,0,0,63,66,1,0,0,0,64,62,1,0,0,0,64,65,1,0,0,0,65,3,1,0,0,0,66,64,1,
	0,0,0,67,72,3,2,1,0,68,69,5,17,0,0,69,71,3,2,1,0,70,68,1,0,0,0,71,74,1,
	0,0,0,72,70,1,0,0,0,72,73,1,0,0,0,73,5,1,0,0,0,74,72,1,0,0,0,75,76,5,18,
	0,0,76,77,5,12,0,0,77,78,3,8,4,0,78,79,5,19,0,0,79,80,5,34,0,0,80,81,5,
	13,0,0,81,82,5,16,0,0,82,83,5,34,0,0,83,85,5,12,0,0,84,86,3,4,2,0,85,84,
	1,0,0,0,85,86,1,0,0,0,86,87,1,0,0,0,87,88,5,13,0,0,88,106,1,0,0,0,89,90,
	5,18,0,0,90,91,5,34,0,0,91,92,5,16,0,0,92,93,5,34,0,0,93,95,5,12,0,0,94,
	96,3,4,2,0,95,94,1,0,0,0,95,96,1,0,0,0,96,97,1,0,0,0,97,106,5,13,0,0,98,
	99,5,18,0,0,99,100,5,34,0,0,100,102,5,12,0,0,101,103,3,4,2,0,102,101,1,
	0,0,0,102,103,1,0,0,0,103,104,1,0,0,0,104,106,5,13,0,0,105,75,1,0,0,0,105,
	89,1,0,0,0,105,98,1,0,0,0,106,7,1,0,0,0,107,112,5,34,0,0,108,109,5,26,0,
	0,109,111,5,34,0,0,110,108,1,0,0,0,111,114,1,0,0,0,112,110,1,0,0,0,112,
	113,1,0,0,0,113,9,1,0,0,0,114,112,1,0,0,0,115,117,5,30,0,0,116,118,3,16,
	8,0,117,116,1,0,0,0,118,119,1,0,0,0,119,117,1,0,0,0,119,120,1,0,0,0,120,
	141,1,0,0,0,121,125,3,12,6,0,122,124,3,16,8,0,123,122,1,0,0,0,124,127,1,
	0,0,0,125,123,1,0,0,0,125,126,1,0,0,0,126,141,1,0,0,0,127,125,1,0,0,0,128,
	130,5,34,0,0,129,131,3,16,8,0,130,129,1,0,0,0,131,132,1,0,0,0,132,130,1,
	0,0,0,132,133,1,0,0,0,133,141,1,0,0,0,134,136,3,16,8,0,135,134,1,0,0,0,
	136,137,1,0,0,0,137,135,1,0,0,0,137,138,1,0,0,0,138,141,1,0,0,0,139,141,
	5,34,0,0,140,115,1,0,0,0,140,121,1,0,0,0,140,128,1,0,0,0,140,135,1,0,0,
	0,140,139,1,0,0,0,141,11,1,0,0,0,142,143,5,34,0,0,143,144,5,14,0,0,144,
	149,3,14,7,0,145,146,5,17,0,0,146,148,3,14,7,0,147,145,1,0,0,0,148,151,
	1,0,0,0,149,147,1,0,0,0,149,150,1,0,0,0,150,152,1,0,0,0,151,149,1,0,0,0,
	152,153,5,15,0,0,153,13,1,0,0,0,154,155,5,34,0,0,155,156,5,19,0,0,156,157,
	3,2,1,0,157,15,1,0,0,0,158,159,5,16,0,0,159,164,5,34,0,0,160,161,5,12,0,
	0,161,162,3,18,9,0,162,163,5,13,0,0,163,165,1,0,0,0,164,160,1,0,0,0,164,
	165,1,0,0,0,165,17,1,0,0,0,166,175,5,37,0,0,167,175,5,34,0,0,168,170,5,
	30,0,0,169,171,3,2,1,0,170,169,1,0,0,0,170,171,1,0,0,0,171,175,1,0,0,0,
	172,175,3,2,1,0,173,175,1,0,0,0,174,166,1,0,0,0,174,167,1,0,0,0,174,168,
	1,0,0,0,174,172,1,0,0,0,174,173,1,0,0,0,175,19,1,0,0,0,176,185,5,37,0,0,
	177,185,5,36,0,0,178,185,5,35,0,0,179,185,5,32,0,0,180,185,5,33,0,0,181,
	185,5,1,0,0,182,185,5,2,0,0,183,185,5,30,0,0,184,176,1,0,0,0,184,177,1,
	0,0,0,184,178,1,0,0,0,184,179,1,0,0,0,184,180,1,0,0,0,184,181,1,0,0,0,184,
	182,1,0,0,0,184,183,1,0,0,0,185,21,1,0,0,0,19,36,62,64,72,85,95,102,105,
	112,119,125,132,137,140,149,164,170,174,184];

	private static __ATN: ATN;
	public static get _ATN(): ATN {
		if (!PegaExprParser.__ATN) {
			PegaExprParser.__ATN = new ATNDeserializer().deserialize(PegaExprParser._serializedATN);
		}

		return PegaExprParser.__ATN;
	}


	static DecisionsToDFA = PegaExprParser._ATN.decisionToState.map( (ds: DecisionState, index: number) => new DFA(ds, index) );

}

export class ExprEntryContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public expr(): ExprContext {
		return this.getTypedRuleContext(ExprContext, 0) as ExprContext;
	}
	public EOF(): TerminalNode {
		return this.getToken(PegaExprParser.EOF, 0);
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_exprEntry;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterExprEntry) {
	 		listener.enterExprEntry(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitExprEntry) {
	 		listener.exitExprEntry(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitExprEntry) {
			return visitor.visitExprEntry(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ExprContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_expr;
	}
	public override copyFrom(ctx: ExprContext): void {
		super.copyFrom(ctx);
	}
}
export class MulExprContext extends ExprContext {
	public _op!: Token;
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public expr_list(): ExprContext[] {
		return this.getTypedRuleContexts(ExprContext) as ExprContext[];
	}
	public expr(i: number): ExprContext {
		return this.getTypedRuleContext(ExprContext, i) as ExprContext;
	}
	public STAR(): TerminalNode {
		return this.getToken(PegaExprParser.STAR, 0);
	}
	public SLASH(): TerminalNode {
		return this.getToken(PegaExprParser.SLASH, 0);
	}
	public PERCENT(): TerminalNode {
		return this.getToken(PegaExprParser.PERCENT, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterMulExpr) {
	 		listener.enterMulExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitMulExpr) {
	 		listener.exitMulExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitMulExpr) {
			return visitor.visitMulExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class AndExprContext extends ExprContext {
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public expr_list(): ExprContext[] {
		return this.getTypedRuleContexts(ExprContext) as ExprContext[];
	}
	public expr(i: number): ExprContext {
		return this.getTypedRuleContext(ExprContext, i) as ExprContext;
	}
	public AND(): TerminalNode {
		return this.getToken(PegaExprParser.AND, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterAndExpr) {
	 		listener.enterAndExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitAndExpr) {
	 		listener.exitAndExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitAndExpr) {
			return visitor.visitAndExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ConstExprContext extends ExprContext {
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public constant(): ConstantContext {
		return this.getTypedRuleContext(ConstantContext, 0) as ConstantContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterConstExpr) {
	 		listener.enterConstExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitConstExpr) {
	 		listener.exitConstExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitConstExpr) {
			return visitor.visitConstExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class RelExprContext extends ExprContext {
	public _op!: Token;
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public expr_list(): ExprContext[] {
		return this.getTypedRuleContexts(ExprContext) as ExprContext[];
	}
	public expr(i: number): ExprContext {
		return this.getTypedRuleContext(ExprContext, i) as ExprContext;
	}
	public LT(): TerminalNode {
		return this.getToken(PegaExprParser.LT, 0);
	}
	public GT(): TerminalNode {
		return this.getToken(PegaExprParser.GT, 0);
	}
	public LE(): TerminalNode {
		return this.getToken(PegaExprParser.LE, 0);
	}
	public GE(): TerminalNode {
		return this.getToken(PegaExprParser.GE, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterRelExpr) {
	 		listener.enterRelExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitRelExpr) {
	 		listener.exitRelExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitRelExpr) {
			return visitor.visitRelExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class AddExprContext extends ExprContext {
	public _op!: Token;
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public expr_list(): ExprContext[] {
		return this.getTypedRuleContexts(ExprContext) as ExprContext[];
	}
	public expr(i: number): ExprContext {
		return this.getTypedRuleContext(ExprContext, i) as ExprContext;
	}
	public PLUS(): TerminalNode {
		return this.getToken(PegaExprParser.PLUS, 0);
	}
	public MINUS(): TerminalNode {
		return this.getToken(PegaExprParser.MINUS, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterAddExpr) {
	 		listener.enterAddExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitAddExpr) {
	 		listener.exitAddExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitAddExpr) {
			return visitor.visitAddExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class FuncExprContext extends ExprContext {
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public function_(): FunctionContext {
		return this.getTypedRuleContext(FunctionContext, 0) as FunctionContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterFuncExpr) {
	 		listener.enterFuncExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitFuncExpr) {
	 		listener.exitFuncExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitFuncExpr) {
			return visitor.visitFuncExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class UnaryExprContext extends ExprContext {
	public _op!: Token;
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public expr(): ExprContext {
		return this.getTypedRuleContext(ExprContext, 0) as ExprContext;
	}
	public MINUS(): TerminalNode {
		return this.getToken(PegaExprParser.MINUS, 0);
	}
	public PLUS(): TerminalNode {
		return this.getToken(PegaExprParser.PLUS, 0);
	}
	public NOT(): TerminalNode {
		return this.getToken(PegaExprParser.NOT, 0);
	}
	public ASGN_EQ(): TerminalNode {
		return this.getToken(PegaExprParser.ASGN_EQ, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterUnaryExpr) {
	 		listener.enterUnaryExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitUnaryExpr) {
	 		listener.exitUnaryExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitUnaryExpr) {
			return visitor.visitUnaryExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class PlaceholderExprContext extends ExprContext {
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public PLACEHOLDER(): TerminalNode {
		return this.getToken(PegaExprParser.PLACEHOLDER, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterPlaceholderExpr) {
	 		listener.enterPlaceholderExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitPlaceholderExpr) {
	 		listener.exitPlaceholderExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitPlaceholderExpr) {
			return visitor.visitPlaceholderExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class OrExprContext extends ExprContext {
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public expr_list(): ExprContext[] {
		return this.getTypedRuleContexts(ExprContext) as ExprContext[];
	}
	public expr(i: number): ExprContext {
		return this.getTypedRuleContext(ExprContext, i) as ExprContext;
	}
	public OR(): TerminalNode {
		return this.getToken(PegaExprParser.OR, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterOrExpr) {
	 		listener.enterOrExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitOrExpr) {
	 		listener.exitOrExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitOrExpr) {
			return visitor.visitOrExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class EqExprContext extends ExprContext {
	public _op!: Token;
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public expr_list(): ExprContext[] {
		return this.getTypedRuleContexts(ExprContext) as ExprContext[];
	}
	public expr(i: number): ExprContext {
		return this.getTypedRuleContext(ExprContext, i) as ExprContext;
	}
	public EQ(): TerminalNode {
		return this.getToken(PegaExprParser.EQ, 0);
	}
	public NE(): TerminalNode {
		return this.getToken(PegaExprParser.NE, 0);
	}
	public NE2(): TerminalNode {
		return this.getToken(PegaExprParser.NE2, 0);
	}
	public LIKE(): TerminalNode {
		return this.getToken(PegaExprParser.LIKE, 0);
	}
	public FUZZY(): TerminalNode {
		return this.getToken(PegaExprParser.FUZZY, 0);
	}
	public ASGN_EQ(): TerminalNode {
		return this.getToken(PegaExprParser.ASGN_EQ, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterEqExpr) {
	 		listener.enterEqExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitEqExpr) {
	 		listener.exitEqExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitEqExpr) {
			return visitor.visitEqExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ParenExprContext extends ExprContext {
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public LPAREN(): TerminalNode {
		return this.getToken(PegaExprParser.LPAREN, 0);
	}
	public expr(): ExprContext {
		return this.getTypedRuleContext(ExprContext, 0) as ExprContext;
	}
	public RPAREN(): TerminalNode {
		return this.getToken(PegaExprParser.RPAREN, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterParenExpr) {
	 		listener.enterParenExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitParenExpr) {
	 		listener.exitParenExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitParenExpr) {
			return visitor.visitParenExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class RefExprContext extends ExprContext {
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public reference(): ReferenceContext {
		return this.getTypedRuleContext(ReferenceContext, 0) as ReferenceContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterRefExpr) {
	 		listener.enterRefExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitRefExpr) {
	 		listener.exitRefExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitRefExpr) {
			return visitor.visitRefExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class TernaryExprContext extends ExprContext {
	constructor(parser: PegaExprParser, ctx: ExprContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public expr_list(): ExprContext[] {
		return this.getTypedRuleContexts(ExprContext) as ExprContext[];
	}
	public expr(i: number): ExprContext {
		return this.getTypedRuleContext(ExprContext, i) as ExprContext;
	}
	public QUESTION(): TerminalNode {
		return this.getToken(PegaExprParser.QUESTION, 0);
	}
	public COLON(): TerminalNode {
		return this.getToken(PegaExprParser.COLON, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterTernaryExpr) {
	 		listener.enterTernaryExpr(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitTernaryExpr) {
	 		listener.exitTernaryExpr(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitTernaryExpr) {
			return visitor.visitTernaryExpr(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ExprListContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public expr_list(): ExprContext[] {
		return this.getTypedRuleContexts(ExprContext) as ExprContext[];
	}
	public expr(i: number): ExprContext {
		return this.getTypedRuleContext(ExprContext, i) as ExprContext;
	}
	public COMMA_list(): TerminalNode[] {
	    	return this.getTokens(PegaExprParser.COMMA);
	}
	public COMMA(i: number): TerminalNode {
		return this.getToken(PegaExprParser.COMMA, i);
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_exprList;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterExprList) {
	 		listener.enterExprList(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitExprList) {
	 		listener.exitExprList(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitExprList) {
			return visitor.visitExprList(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class FunctionContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_function;
	}
	public override copyFrom(ctx: FunctionContext): void {
		super.copyFrom(ctx);
	}
}
export class SimpleFuncContext extends FunctionContext {
	public _fname!: Token;
	constructor(parser: PegaExprParser, ctx: FunctionContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public AT(): TerminalNode {
		return this.getToken(PegaExprParser.AT, 0);
	}
	public LPAREN(): TerminalNode {
		return this.getToken(PegaExprParser.LPAREN, 0);
	}
	public RPAREN(): TerminalNode {
		return this.getToken(PegaExprParser.RPAREN, 0);
	}
	public ID(): TerminalNode {
		return this.getToken(PegaExprParser.ID, 0);
	}
	public exprList(): ExprListContext {
		return this.getTypedRuleContext(ExprListContext, 0) as ExprListContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterSimpleFunc) {
	 		listener.enterSimpleFunc(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitSimpleFunc) {
	 		listener.exitSimpleFunc(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitSimpleFunc) {
			return visitor.visitSimpleFunc(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class LibraryFuncContext extends FunctionContext {
	public _library!: Token;
	public _fname!: Token;
	constructor(parser: PegaExprParser, ctx: FunctionContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public AT(): TerminalNode {
		return this.getToken(PegaExprParser.AT, 0);
	}
	public DOT(): TerminalNode {
		return this.getToken(PegaExprParser.DOT, 0);
	}
	public LPAREN(): TerminalNode {
		return this.getToken(PegaExprParser.LPAREN, 0);
	}
	public RPAREN(): TerminalNode {
		return this.getToken(PegaExprParser.RPAREN, 0);
	}
	public ID_list(): TerminalNode[] {
	    	return this.getTokens(PegaExprParser.ID);
	}
	public ID(i: number): TerminalNode {
		return this.getToken(PegaExprParser.ID, i);
	}
	public exprList(): ExprListContext {
		return this.getTypedRuleContext(ExprListContext, 0) as ExprListContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterLibraryFunc) {
	 		listener.enterLibraryFunc(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitLibraryFunc) {
	 		listener.exitLibraryFunc(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitLibraryFunc) {
			return visitor.visitLibraryFunc(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class QualifiedFuncContext extends FunctionContext {
	public _library!: Token;
	public _fname!: Token;
	constructor(parser: PegaExprParser, ctx: FunctionContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public AT(): TerminalNode {
		return this.getToken(PegaExprParser.AT, 0);
	}
	public LPAREN_list(): TerminalNode[] {
	    	return this.getTokens(PegaExprParser.LPAREN);
	}
	public LPAREN(i: number): TerminalNode {
		return this.getToken(PegaExprParser.LPAREN, i);
	}
	public rulesetIdent(): RulesetIdentContext {
		return this.getTypedRuleContext(RulesetIdentContext, 0) as RulesetIdentContext;
	}
	public COLON(): TerminalNode {
		return this.getToken(PegaExprParser.COLON, 0);
	}
	public RPAREN_list(): TerminalNode[] {
	    	return this.getTokens(PegaExprParser.RPAREN);
	}
	public RPAREN(i: number): TerminalNode {
		return this.getToken(PegaExprParser.RPAREN, i);
	}
	public DOT(): TerminalNode {
		return this.getToken(PegaExprParser.DOT, 0);
	}
	public ID_list(): TerminalNode[] {
	    	return this.getTokens(PegaExprParser.ID);
	}
	public ID(i: number): TerminalNode {
		return this.getToken(PegaExprParser.ID, i);
	}
	public exprList(): ExprListContext {
		return this.getTypedRuleContext(ExprListContext, 0) as ExprListContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterQualifiedFunc) {
	 		listener.enterQualifiedFunc(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitQualifiedFunc) {
	 		listener.exitQualifiedFunc(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitQualifiedFunc) {
			return visitor.visitQualifiedFunc(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class RulesetIdentContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public ID_list(): TerminalNode[] {
	    	return this.getTokens(PegaExprParser.ID);
	}
	public ID(i: number): TerminalNode {
		return this.getToken(PegaExprParser.ID, i);
	}
	public MINUS_list(): TerminalNode[] {
	    	return this.getTokens(PegaExprParser.MINUS);
	}
	public MINUS(i: number): TerminalNode {
		return this.getToken(PegaExprParser.MINUS, i);
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_rulesetIdent;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterRulesetIdent) {
	 		listener.enterRulesetIdent(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitRulesetIdent) {
	 		listener.exitRulesetIdent(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitRulesetIdent) {
			return visitor.visitRulesetIdent(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ReferenceContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_reference;
	}
	public override copyFrom(ctx: ReferenceContext): void {
		super.copyFrom(ctx);
	}
}
export class CurrentRefContext extends ReferenceContext {
	constructor(parser: PegaExprParser, ctx: ReferenceContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public ANGLE(): TerminalNode {
		return this.getToken(PegaExprParser.ANGLE, 0);
	}
	public segment_list(): SegmentContext[] {
		return this.getTypedRuleContexts(SegmentContext) as SegmentContext[];
	}
	public segment(i: number): SegmentContext {
		return this.getTypedRuleContext(SegmentContext, i) as SegmentContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterCurrentRef) {
	 		listener.enterCurrentRef(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitCurrentRef) {
	 		listener.exitCurrentRef(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitCurrentRef) {
			return visitor.visitCurrentRef(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ParamPageRefContext extends ReferenceContext {
	constructor(parser: PegaExprParser, ctx: ReferenceContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public paramPage(): ParamPageContext {
		return this.getTypedRuleContext(ParamPageContext, 0) as ParamPageContext;
	}
	public segment_list(): SegmentContext[] {
		return this.getTypedRuleContexts(SegmentContext) as SegmentContext[];
	}
	public segment(i: number): SegmentContext {
		return this.getTypedRuleContext(SegmentContext, i) as SegmentContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterParamPageRef) {
	 		listener.enterParamPageRef(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitParamPageRef) {
	 		listener.exitParamPageRef(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitParamPageRef) {
			return visitor.visitParamPageRef(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class PageRefContext extends ReferenceContext {
	constructor(parser: PegaExprParser, ctx: ReferenceContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public ID(): TerminalNode {
		return this.getToken(PegaExprParser.ID, 0);
	}
	public segment_list(): SegmentContext[] {
		return this.getTypedRuleContexts(SegmentContext) as SegmentContext[];
	}
	public segment(i: number): SegmentContext {
		return this.getTypedRuleContext(SegmentContext, i) as SegmentContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterPageRef) {
	 		listener.enterPageRef(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitPageRef) {
	 		listener.exitPageRef(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitPageRef) {
			return visitor.visitPageRef(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class BareRefContext extends ReferenceContext {
	constructor(parser: PegaExprParser, ctx: ReferenceContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public ID(): TerminalNode {
		return this.getToken(PegaExprParser.ID, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterBareRef) {
	 		listener.enterBareRef(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitBareRef) {
	 		listener.exitBareRef(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitBareRef) {
			return visitor.visitBareRef(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class RelativeRefContext extends ReferenceContext {
	constructor(parser: PegaExprParser, ctx: ReferenceContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public segment_list(): SegmentContext[] {
		return this.getTypedRuleContexts(SegmentContext) as SegmentContext[];
	}
	public segment(i: number): SegmentContext {
		return this.getTypedRuleContext(SegmentContext, i) as SegmentContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterRelativeRef) {
	 		listener.enterRelativeRef(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitRelativeRef) {
	 		listener.exitRelativeRef(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitRelativeRef) {
			return visitor.visitRelativeRef(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ParamPageContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public ID(): TerminalNode {
		return this.getToken(PegaExprParser.ID, 0);
	}
	public LBRACK(): TerminalNode {
		return this.getToken(PegaExprParser.LBRACK, 0);
	}
	public keyedParam_list(): KeyedParamContext[] {
		return this.getTypedRuleContexts(KeyedParamContext) as KeyedParamContext[];
	}
	public keyedParam(i: number): KeyedParamContext {
		return this.getTypedRuleContext(KeyedParamContext, i) as KeyedParamContext;
	}
	public RBRACK(): TerminalNode {
		return this.getToken(PegaExprParser.RBRACK, 0);
	}
	public COMMA_list(): TerminalNode[] {
	    	return this.getTokens(PegaExprParser.COMMA);
	}
	public COMMA(i: number): TerminalNode {
		return this.getToken(PegaExprParser.COMMA, i);
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_paramPage;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterParamPage) {
	 		listener.enterParamPage(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitParamPage) {
	 		listener.exitParamPage(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitParamPage) {
			return visitor.visitParamPage(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class KeyedParamContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public ID(): TerminalNode {
		return this.getToken(PegaExprParser.ID, 0);
	}
	public COLON(): TerminalNode {
		return this.getToken(PegaExprParser.COLON, 0);
	}
	public expr(): ExprContext {
		return this.getTypedRuleContext(ExprContext, 0) as ExprContext;
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_keyedParam;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterKeyedParam) {
	 		listener.enterKeyedParam(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitKeyedParam) {
	 		listener.exitKeyedParam(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitKeyedParam) {
			return visitor.visitKeyedParam(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class SegmentContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
	public DOT(): TerminalNode {
		return this.getToken(PegaExprParser.DOT, 0);
	}
	public ID(): TerminalNode {
		return this.getToken(PegaExprParser.ID, 0);
	}
	public LPAREN(): TerminalNode {
		return this.getToken(PegaExprParser.LPAREN, 0);
	}
	public selector(): SelectorContext {
		return this.getTypedRuleContext(SelectorContext, 0) as SelectorContext;
	}
	public RPAREN(): TerminalNode {
		return this.getToken(PegaExprParser.RPAREN, 0);
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_segment;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterSegment) {
	 		listener.enterSegment(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitSegment) {
	 		listener.exitSegment(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitSegment) {
			return visitor.visitSegment(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class SelectorContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_selector;
	}
	public override copyFrom(ctx: SelectorContext): void {
		super.copyFrom(ctx);
	}
}
export class AppendSelContext extends SelectorContext {
	constructor(parser: PegaExprParser, ctx: SelectorContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterAppendSel) {
	 		listener.enterAppendSel(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitAppendSel) {
	 		listener.exitAppendSel(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitAppendSel) {
			return visitor.visitAppendSel(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class IndexSelContext extends SelectorContext {
	constructor(parser: PegaExprParser, ctx: SelectorContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public INT(): TerminalNode {
		return this.getToken(PegaExprParser.INT, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterIndexSel) {
	 		listener.enterIndexSel(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitIndexSel) {
	 		listener.exitIndexSel(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitIndexSel) {
			return visitor.visitIndexSel(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class ExprSelContext extends SelectorContext {
	constructor(parser: PegaExprParser, ctx: SelectorContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public expr(): ExprContext {
		return this.getTypedRuleContext(ExprContext, 0) as ExprContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterExprSel) {
	 		listener.enterExprSel(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitExprSel) {
	 		listener.exitExprSel(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitExprSel) {
			return visitor.visitExprSel(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class KeySelContext extends SelectorContext {
	constructor(parser: PegaExprParser, ctx: SelectorContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public ID(): TerminalNode {
		return this.getToken(PegaExprParser.ID, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterKeySel) {
	 		listener.enterKeySel(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitKeySel) {
	 		listener.exitKeySel(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitKeySel) {
			return visitor.visitKeySel(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class SymbolicSelContext extends SelectorContext {
	constructor(parser: PegaExprParser, ctx: SelectorContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public ANGLE(): TerminalNode {
		return this.getToken(PegaExprParser.ANGLE, 0);
	}
	public expr(): ExprContext {
		return this.getTypedRuleContext(ExprContext, 0) as ExprContext;
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterSymbolicSel) {
	 		listener.enterSymbolicSel(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitSymbolicSel) {
	 		listener.exitSymbolicSel(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitSymbolicSel) {
			return visitor.visitSymbolicSel(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}


export class ConstantContext extends ParserRuleContext {
	constructor(parser?: PegaExprParser, parent?: ParserRuleContext, invokingState?: number) {
		super(parent, invokingState);
    	this.parser = parser;
	}
    public get ruleIndex(): number {
    	return PegaExprParser.RULE_constant;
	}
	public override copyFrom(ctx: ConstantContext): void {
		super.copyFrom(ctx);
	}
}
export class CharConstContext extends ConstantContext {
	constructor(parser: PegaExprParser, ctx: ConstantContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public CHAR(): TerminalNode {
		return this.getToken(PegaExprParser.CHAR, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterCharConst) {
	 		listener.enterCharConst(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitCharConst) {
	 		listener.exitCharConst(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitCharConst) {
			return visitor.visitCharConst(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class DoubleConstContext extends ConstantContext {
	constructor(parser: PegaExprParser, ctx: ConstantContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public DOUBLE(): TerminalNode {
		return this.getToken(PegaExprParser.DOUBLE, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterDoubleConst) {
	 		listener.enterDoubleConst(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitDoubleConst) {
	 		listener.exitDoubleConst(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitDoubleConst) {
			return visitor.visitDoubleConst(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class StringConstContext extends ConstantContext {
	constructor(parser: PegaExprParser, ctx: ConstantContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public STRING(): TerminalNode {
		return this.getToken(PegaExprParser.STRING, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterStringConst) {
	 		listener.enterStringConst(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitStringConst) {
	 		listener.exitStringConst(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitStringConst) {
			return visitor.visitStringConst(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class TrueConstContext extends ConstantContext {
	constructor(parser: PegaExprParser, ctx: ConstantContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public TRUE(): TerminalNode {
		return this.getToken(PegaExprParser.TRUE, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterTrueConst) {
	 		listener.enterTrueConst(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitTrueConst) {
	 		listener.exitTrueConst(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitTrueConst) {
			return visitor.visitTrueConst(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class AngleConstContext extends ConstantContext {
	constructor(parser: PegaExprParser, ctx: ConstantContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public ANGLE(): TerminalNode {
		return this.getToken(PegaExprParser.ANGLE, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterAngleConst) {
	 		listener.enterAngleConst(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitAngleConst) {
	 		listener.exitAngleConst(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitAngleConst) {
			return visitor.visitAngleConst(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class FalseConstContext extends ConstantContext {
	constructor(parser: PegaExprParser, ctx: ConstantContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public FALSE(): TerminalNode {
		return this.getToken(PegaExprParser.FALSE, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterFalseConst) {
	 		listener.enterFalseConst(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitFalseConst) {
	 		listener.exitFalseConst(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitFalseConst) {
			return visitor.visitFalseConst(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class IntConstContext extends ConstantContext {
	constructor(parser: PegaExprParser, ctx: ConstantContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public INT(): TerminalNode {
		return this.getToken(PegaExprParser.INT, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterIntConst) {
	 		listener.enterIntConst(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitIntConst) {
	 		listener.exitIntConst(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitIntConst) {
			return visitor.visitIntConst(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
export class LongConstContext extends ConstantContext {
	constructor(parser: PegaExprParser, ctx: ConstantContext) {
		super(parser, ctx.parentCtx, ctx.invokingState);
		super.copyFrom(ctx);
	}
	public LONG(): TerminalNode {
		return this.getToken(PegaExprParser.LONG, 0);
	}
	public enterRule(listener: PegaExprListener): void {
	    if(listener.enterLongConst) {
	 		listener.enterLongConst(this);
		}
	}
	public exitRule(listener: PegaExprListener): void {
	    if(listener.exitLongConst) {
	 		listener.exitLongConst(this);
		}
	}
	// @Override
	public accept<Result>(visitor: PegaExprVisitor<Result>): Result {
		if (visitor.visitLongConst) {
			return visitor.visitLongConst(this);
		} else {
			return visitor.visitChildren(this);
		}
	}
}
