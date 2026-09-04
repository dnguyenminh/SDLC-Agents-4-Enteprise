// Generated from grammar/PegaExpr.g4 by ANTLR 4.13.2
// jshint ignore: start
import antlr4 from 'antlr4';
import PegaExprListener from './PegaExprListener.js';
import PegaExprVisitor from './PegaExprVisitor.js';

const serializedATN = [4,1,38,211,2,0,7,0,2,1,7,1,2,2,7,2,2,3,7,3,2,4,7,
4,2,5,7,5,2,6,7,6,2,7,7,7,2,8,7,8,2,9,7,9,2,10,7,10,1,0,1,0,1,0,1,1,1,1,
1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,3,1,37,8,1,1,1,1,1,1,1,1,1,1,1,1,1,1,
1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,5,
1,63,8,1,10,1,12,1,66,9,1,1,2,1,2,1,2,5,2,71,8,2,10,2,12,2,74,9,2,1,3,1,
3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,3,3,86,8,3,1,3,1,3,1,3,1,3,1,3,1,3,1,3,
1,3,3,3,96,8,3,1,3,1,3,1,3,1,3,1,3,3,3,103,8,3,1,3,1,3,1,3,1,3,1,3,1,3,1,
3,1,3,3,3,113,8,3,1,3,1,3,1,3,1,3,1,3,1,3,3,3,121,8,3,1,3,1,3,1,3,1,3,3,
3,127,8,3,1,3,3,3,130,8,3,1,4,1,4,1,4,5,4,135,8,4,10,4,12,4,138,9,4,1,5,
1,5,4,5,142,8,5,11,5,12,5,143,1,5,1,5,5,5,148,8,5,10,5,12,5,151,9,5,1,5,
1,5,4,5,155,8,5,11,5,12,5,156,1,5,4,5,160,8,5,11,5,12,5,161,1,5,3,5,165,
8,5,1,6,1,6,1,6,1,6,1,6,5,6,172,8,6,10,6,12,6,175,9,6,1,6,1,6,1,7,1,7,1,
7,1,7,1,8,1,8,1,8,1,8,1,8,1,8,3,8,189,8,8,1,9,1,9,1,9,1,9,3,9,195,8,9,1,
9,1,9,3,9,199,8,9,1,10,1,10,1,10,1,10,1,10,1,10,1,10,1,10,3,10,209,8,10,
1,10,0,1,2,11,0,2,4,6,8,10,12,14,16,18,20,0,5,2,0,22,23,25,26,1,0,27,29,
1,0,25,26,2,0,3,4,20,21,2,0,5,9,22,22,246,0,22,1,0,0,0,2,36,1,0,0,0,4,67,
1,0,0,0,6,129,1,0,0,0,8,131,1,0,0,0,10,164,1,0,0,0,12,166,1,0,0,0,14,178,
1,0,0,0,16,182,1,0,0,0,18,198,1,0,0,0,20,208,1,0,0,0,22,23,3,2,1,0,23,24,
5,0,0,1,24,1,1,0,0,0,25,26,6,1,-1,0,26,37,3,6,3,0,27,37,3,10,5,0,28,37,3,
20,10,0,29,30,5,12,0,0,30,31,3,2,1,0,31,32,5,13,0,0,32,37,1,0,0,0,33,37,
5,31,0,0,34,35,7,0,0,0,35,37,3,2,1,8,36,25,1,0,0,0,36,27,1,0,0,0,36,28,1,
0,0,0,36,29,1,0,0,0,36,33,1,0,0,0,36,34,1,0,0,0,37,64,1,0,0,0,38,39,10,7,
0,0,39,40,7,1,0,0,40,63,3,2,1,8,41,42,10,6,0,0,42,43,7,2,0,0,43,63,3,2,1,
7,44,45,10,5,0,0,45,46,7,3,0,0,46,63,3,2,1,6,47,48,10,4,0,0,48,49,7,4,0,
0,49,63,3,2,1,5,50,51,10,3,0,0,51,52,5,10,0,0,52,63,3,2,1,4,53,54,10,2,0,
0,54,55,5,11,0,0,55,63,3,2,1,3,56,57,10,1,0,0,57,58,5,24,0,0,58,59,3,2,1,
0,59,60,5,19,0,0,60,61,3,2,1,1,61,63,1,0,0,0,62,38,1,0,0,0,62,41,1,0,0,0,
62,44,1,0,0,0,62,47,1,0,0,0,62,50,1,0,0,0,62,53,1,0,0,0,62,56,1,0,0,0,63,
66,1,0,0,0,64,62,1,0,0,0,64,65,1,0,0,0,65,3,1,0,0,0,66,64,1,0,0,0,67,72,
3,2,1,0,68,69,5,17,0,0,69,71,3,2,1,0,70,68,1,0,0,0,71,74,1,0,0,0,72,70,1,
0,0,0,72,73,1,0,0,0,73,5,1,0,0,0,74,72,1,0,0,0,75,76,5,18,0,0,76,77,5,12,
0,0,77,78,3,8,4,0,78,79,5,19,0,0,79,80,5,34,0,0,80,81,5,13,0,0,81,82,5,16,
0,0,82,83,5,34,0,0,83,85,5,12,0,0,84,86,3,4,2,0,85,84,1,0,0,0,85,86,1,0,
0,0,86,87,1,0,0,0,87,88,5,13,0,0,88,130,1,0,0,0,89,90,5,18,0,0,90,91,5,34,
0,0,91,92,5,16,0,0,92,93,5,34,0,0,93,95,5,12,0,0,94,96,3,4,2,0,95,94,1,0,
0,0,95,96,1,0,0,0,96,97,1,0,0,0,97,130,5,13,0,0,98,99,5,18,0,0,99,100,5,
34,0,0,100,102,5,12,0,0,101,103,3,4,2,0,102,101,1,0,0,0,102,103,1,0,0,0,
103,104,1,0,0,0,104,130,5,13,0,0,105,106,5,18,0,0,106,107,5,18,0,0,107,108,
5,34,0,0,108,109,5,16,0,0,109,110,5,34,0,0,110,112,5,12,0,0,111,113,3,4,
2,0,112,111,1,0,0,0,112,113,1,0,0,0,113,114,1,0,0,0,114,130,5,13,0,0,115,
116,5,18,0,0,116,117,5,18,0,0,117,118,5,34,0,0,118,120,5,12,0,0,119,121,
3,4,2,0,120,119,1,0,0,0,120,121,1,0,0,0,121,122,1,0,0,0,122,130,5,13,0,0,
123,124,5,34,0,0,124,126,5,12,0,0,125,127,3,4,2,0,126,125,1,0,0,0,126,127,
1,0,0,0,127,128,1,0,0,0,128,130,5,13,0,0,129,75,1,0,0,0,129,89,1,0,0,0,129,
98,1,0,0,0,129,105,1,0,0,0,129,115,1,0,0,0,129,123,1,0,0,0,130,7,1,0,0,0,
131,136,5,34,0,0,132,133,5,26,0,0,133,135,5,34,0,0,134,132,1,0,0,0,135,138,
1,0,0,0,136,134,1,0,0,0,136,137,1,0,0,0,137,9,1,0,0,0,138,136,1,0,0,0,139,
141,5,30,0,0,140,142,3,16,8,0,141,140,1,0,0,0,142,143,1,0,0,0,143,141,1,
0,0,0,143,144,1,0,0,0,144,165,1,0,0,0,145,149,3,12,6,0,146,148,3,16,8,0,
147,146,1,0,0,0,148,151,1,0,0,0,149,147,1,0,0,0,149,150,1,0,0,0,150,165,
1,0,0,0,151,149,1,0,0,0,152,154,5,34,0,0,153,155,3,16,8,0,154,153,1,0,0,
0,155,156,1,0,0,0,156,154,1,0,0,0,156,157,1,0,0,0,157,165,1,0,0,0,158,160,
3,16,8,0,159,158,1,0,0,0,160,161,1,0,0,0,161,159,1,0,0,0,161,162,1,0,0,0,
162,165,1,0,0,0,163,165,5,34,0,0,164,139,1,0,0,0,164,145,1,0,0,0,164,152,
1,0,0,0,164,159,1,0,0,0,164,163,1,0,0,0,165,11,1,0,0,0,166,167,5,34,0,0,
167,168,5,14,0,0,168,173,3,14,7,0,169,170,5,17,0,0,170,172,3,14,7,0,171,
169,1,0,0,0,172,175,1,0,0,0,173,171,1,0,0,0,173,174,1,0,0,0,174,176,1,0,
0,0,175,173,1,0,0,0,176,177,5,15,0,0,177,13,1,0,0,0,178,179,5,34,0,0,179,
180,5,19,0,0,180,181,3,2,1,0,181,15,1,0,0,0,182,183,5,16,0,0,183,188,5,34,
0,0,184,185,5,12,0,0,185,186,3,18,9,0,186,187,5,13,0,0,187,189,1,0,0,0,188,
184,1,0,0,0,188,189,1,0,0,0,189,17,1,0,0,0,190,199,5,37,0,0,191,199,5,34,
0,0,192,194,5,30,0,0,193,195,3,2,1,0,194,193,1,0,0,0,194,195,1,0,0,0,195,
199,1,0,0,0,196,199,3,2,1,0,197,199,1,0,0,0,198,190,1,0,0,0,198,191,1,0,
0,0,198,192,1,0,0,0,198,196,1,0,0,0,198,197,1,0,0,0,199,19,1,0,0,0,200,209,
5,37,0,0,201,209,5,36,0,0,202,209,5,35,0,0,203,209,5,32,0,0,204,209,5,33,
0,0,205,209,5,1,0,0,206,209,5,2,0,0,207,209,5,30,0,0,208,200,1,0,0,0,208,
201,1,0,0,0,208,202,1,0,0,0,208,203,1,0,0,0,208,204,1,0,0,0,208,205,1,0,
0,0,208,206,1,0,0,0,208,207,1,0,0,0,209,21,1,0,0,0,22,36,62,64,72,85,95,
102,112,120,126,129,136,143,149,156,161,164,173,188,194,198,208];


const atn = new antlr4.atn.ATNDeserializer().deserialize(serializedATN);

const decisionsToDFA = atn.decisionToState.map( (ds, index) => new antlr4.dfa.DFA(ds, index) );

const sharedContextCache = new antlr4.atn.PredictionContextCache();

export default class PegaExprParser extends antlr4.Parser {

    static grammarFileName = "PegaExpr.g4";
    static literalNames = [ null, "'true'", "'false'", "'<='", "'>='", "'=='", 
                            "'!='", "'<>'", "'^='", "'~='", "'&&'", "'||'", 
                            "'('", "')'", "'['", "']'", "'.'", "','", "'@'", 
                            "':'", "'<'", "'>'", "'='", "'!'", "'?'", "'+'", 
                            "'-'", "'*'", "'/'", "'%'" ];
    static symbolicNames = [ null, "TRUE", "FALSE", "LE", "GE", "EQ", "NE", 
                             "NE2", "LIKE", "FUZZY", "AND", "OR", "LPAREN", 
                             "RPAREN", "LBRACK", "RBRACK", "DOT", "COMMA", 
                             "AT", "COLON", "LT", "GT", "ASGN_EQ", "NOT", 
                             "QUESTION", "PLUS", "MINUS", "STAR", "SLASH", 
                             "PERCENT", "ANGLE", "PLACEHOLDER", "STRING", 
                             "CHAR", "ID", "DOUBLE", "LONG", "INT", "WS" ];
    static ruleNames = [ "exprEntry", "expr", "exprList", "function", "rulesetIdent", 
                         "reference", "paramPage", "keyedParam", "segment", 
                         "selector", "constant" ];

    constructor(input) {
        super(input);
        this._interp = new antlr4.atn.ParserATNSimulator(this, atn, decisionsToDFA, sharedContextCache);
        this.ruleNames = PegaExprParser.ruleNames;
        this.literalNames = PegaExprParser.literalNames;
        this.symbolicNames = PegaExprParser.symbolicNames;
    }

    sempred(localctx, ruleIndex, predIndex) {
    	switch(ruleIndex) {
    	case 1:
    	    		return this.expr_sempred(localctx, predIndex);
        default:
            throw "No predicate with index:" + ruleIndex;
       }
    }

    expr_sempred(localctx, predIndex) {
    	switch(predIndex) {
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
    		default:
    			throw "No predicate with index:" + predIndex;
    	}
    };




	exprEntry() {
	    let localctx = new ExprEntryContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 0, PegaExprParser.RULE_exprEntry);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 22;
	        this.expr(0);
	        this.state = 23;
	        this.match(PegaExprParser.EOF);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}


	expr(_p) {
		if(_p===undefined) {
		    _p = 0;
		}
	    const _parentctx = this._ctx;
	    const _parentState = this.state;
	    let localctx = new ExprContext(this, this._ctx, _parentState);
	    let _prevctx = localctx;
	    const _startState = 2;
	    this.enterRecursionRule(localctx, 2, PegaExprParser.RULE_expr, _p);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 36;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,0,this._ctx);
	        switch(la_) {
	        case 1:
	            localctx = new FuncExprContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;

	            this.state = 26;
	            this.function_();
	            break;

	        case 2:
	            localctx = new RefExprContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 27;
	            this.reference();
	            break;

	        case 3:
	            localctx = new ConstExprContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 28;
	            this.constant();
	            break;

	        case 4:
	            localctx = new ParenExprContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 29;
	            this.match(PegaExprParser.LPAREN);
	            this.state = 30;
	            this.expr(0);
	            this.state = 31;
	            this.match(PegaExprParser.RPAREN);
	            break;

	        case 5:
	            localctx = new PlaceholderExprContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 33;
	            this.match(PegaExprParser.PLACEHOLDER);
	            break;

	        case 6:
	            localctx = new UnaryExprContext(this, localctx);
	            this._ctx = localctx;
	            _prevctx = localctx;
	            this.state = 34;
	            localctx.op = this._input.LT(1);
	            _la = this._input.LA(1);
	            if(!((((_la) & ~0x1f) === 0 && ((1 << _la) & 113246208) !== 0))) {
	                localctx.op = this._errHandler.recoverInline(this);
	            }
	            else {
	            	this._errHandler.reportMatch(this);
	                this.consume();
	            }
	            this.state = 35;
	            this.expr(8);
	            break;

	        }
	        this._ctx.stop = this._input.LT(-1);
	        this.state = 64;
	        this._errHandler.sync(this);
	        var _alt = this._interp.adaptivePredict(this._input,2,this._ctx)
	        while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	            if(_alt===1) {
	                if(this._parseListeners!==null) {
	                    this.triggerExitRuleEvent();
	                }
	                _prevctx = localctx;
	                this.state = 62;
	                this._errHandler.sync(this);
	                var la_ = this._interp.adaptivePredict(this._input,1,this._ctx);
	                switch(la_) {
	                case 1:
	                    localctx = new MulExprContext(this, new ExprContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
	                    this.state = 38;
	                    if (!( this.precpred(this._ctx, 7))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 7)");
	                    }
	                    this.state = 39;
	                    localctx.op = this._input.LT(1);
	                    _la = this._input.LA(1);
	                    if(!((((_la) & ~0x1f) === 0 && ((1 << _la) & 939524096) !== 0))) {
	                        localctx.op = this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 40;
	                    this.expr(8);
	                    break;

	                case 2:
	                    localctx = new AddExprContext(this, new ExprContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
	                    this.state = 41;
	                    if (!( this.precpred(this._ctx, 6))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 6)");
	                    }
	                    this.state = 42;
	                    localctx.op = this._input.LT(1);
	                    _la = this._input.LA(1);
	                    if(!(_la===25 || _la===26)) {
	                        localctx.op = this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 43;
	                    this.expr(7);
	                    break;

	                case 3:
	                    localctx = new RelExprContext(this, new ExprContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
	                    this.state = 44;
	                    if (!( this.precpred(this._ctx, 5))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 5)");
	                    }
	                    this.state = 45;
	                    localctx.op = this._input.LT(1);
	                    _la = this._input.LA(1);
	                    if(!((((_la) & ~0x1f) === 0 && ((1 << _la) & 3145752) !== 0))) {
	                        localctx.op = this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 46;
	                    this.expr(6);
	                    break;

	                case 4:
	                    localctx = new EqExprContext(this, new ExprContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
	                    this.state = 47;
	                    if (!( this.precpred(this._ctx, 4))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 4)");
	                    }
	                    this.state = 48;
	                    localctx.op = this._input.LT(1);
	                    _la = this._input.LA(1);
	                    if(!((((_la) & ~0x1f) === 0 && ((1 << _la) & 4195296) !== 0))) {
	                        localctx.op = this._errHandler.recoverInline(this);
	                    }
	                    else {
	                    	this._errHandler.reportMatch(this);
	                        this.consume();
	                    }
	                    this.state = 49;
	                    this.expr(5);
	                    break;

	                case 5:
	                    localctx = new AndExprContext(this, new ExprContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
	                    this.state = 50;
	                    if (!( this.precpred(this._ctx, 3))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 3)");
	                    }
	                    this.state = 51;
	                    this.match(PegaExprParser.AND);
	                    this.state = 52;
	                    this.expr(4);
	                    break;

	                case 6:
	                    localctx = new OrExprContext(this, new ExprContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
	                    this.state = 53;
	                    if (!( this.precpred(this._ctx, 2))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 2)");
	                    }
	                    this.state = 54;
	                    this.match(PegaExprParser.OR);
	                    this.state = 55;
	                    this.expr(3);
	                    break;

	                case 7:
	                    localctx = new TernaryExprContext(this, new ExprContext(this, _parentctx, _parentState));
	                    this.pushNewRecursionContext(localctx, _startState, PegaExprParser.RULE_expr);
	                    this.state = 56;
	                    if (!( this.precpred(this._ctx, 1))) {
	                        throw new antlr4.error.FailedPredicateException(this, "this.precpred(this._ctx, 1)");
	                    }
	                    this.state = 57;
	                    this.match(PegaExprParser.QUESTION);
	                    this.state = 58;
	                    this.expr(0);
	                    this.state = 59;
	                    this.match(PegaExprParser.COLON);
	                    this.state = 60;
	                    this.expr(1);
	                    break;

	                } 
	            }
	            this.state = 66;
	            this._errHandler.sync(this);
	            _alt = this._interp.adaptivePredict(this._input,2,this._ctx);
	        }

	    } catch( error) {
	        if(error instanceof antlr4.error.RecognitionException) {
		        localctx.exception = error;
		        this._errHandler.reportError(this, error);
		        this._errHandler.recover(this, error);
		    } else {
		    	throw error;
		    }
	    } finally {
	        this.unrollRecursionContexts(_parentctx)
	    }
	    return localctx;
	}



	exprList() {
	    let localctx = new ExprListContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 4, PegaExprParser.RULE_exprList);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 67;
	        this.expr(0);
	        this.state = 72;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===17) {
	            this.state = 68;
	            this.match(PegaExprParser.COMMA);
	            this.state = 69;
	            this.expr(0);
	            this.state = 74;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	function_() {
	    let localctx = new FunctionContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 6, PegaExprParser.RULE_function);
	    var _la = 0;
	    try {
	        this.state = 129;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,10,this._ctx);
	        switch(la_) {
	        case 1:
	            localctx = new QualifiedFuncContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 75;
	            this.match(PegaExprParser.AT);
	            this.state = 76;
	            this.match(PegaExprParser.LPAREN);
	            this.state = 77;
	            this.rulesetIdent();
	            this.state = 78;
	            this.match(PegaExprParser.COLON);
	            this.state = 79;
	            localctx.library = this.match(PegaExprParser.ID);
	            this.state = 80;
	            this.match(PegaExprParser.RPAREN);
	            this.state = 81;
	            this.match(PegaExprParser.DOT);
	            this.state = 82;
	            localctx.fname = this.match(PegaExprParser.ID);
	            this.state = 83;
	            this.match(PegaExprParser.LPAREN);
	            this.state = 85;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
	                this.state = 84;
	                this.exprList();
	            }

	            this.state = 87;
	            this.match(PegaExprParser.RPAREN);
	            break;

	        case 2:
	            localctx = new LibraryFuncContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 89;
	            this.match(PegaExprParser.AT);
	            this.state = 90;
	            localctx.library = this.match(PegaExprParser.ID);
	            this.state = 91;
	            this.match(PegaExprParser.DOT);
	            this.state = 92;
	            localctx.fname = this.match(PegaExprParser.ID);
	            this.state = 93;
	            this.match(PegaExprParser.LPAREN);
	            this.state = 95;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
	                this.state = 94;
	                this.exprList();
	            }

	            this.state = 97;
	            this.match(PegaExprParser.RPAREN);
	            break;

	        case 3:
	            localctx = new SimpleFuncContext(this, localctx);
	            this.enterOuterAlt(localctx, 3);
	            this.state = 98;
	            this.match(PegaExprParser.AT);
	            this.state = 99;
	            localctx.fname = this.match(PegaExprParser.ID);
	            this.state = 100;
	            this.match(PegaExprParser.LPAREN);
	            this.state = 102;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
	                this.state = 101;
	                this.exprList();
	            }

	            this.state = 104;
	            this.match(PegaExprParser.RPAREN);
	            break;

	        case 4:
	            localctx = new LegacyLibraryFuncContext(this, localctx);
	            this.enterOuterAlt(localctx, 4);
	            this.state = 105;
	            this.match(PegaExprParser.AT);
	            this.state = 106;
	            this.match(PegaExprParser.AT);
	            this.state = 107;
	            localctx.library = this.match(PegaExprParser.ID);
	            this.state = 108;
	            this.match(PegaExprParser.DOT);
	            this.state = 109;
	            localctx.fname = this.match(PegaExprParser.ID);
	            this.state = 110;
	            this.match(PegaExprParser.LPAREN);
	            this.state = 112;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
	                this.state = 111;
	                this.exprList();
	            }

	            this.state = 114;
	            this.match(PegaExprParser.RPAREN);
	            break;

	        case 5:
	            localctx = new LegacySimpleFuncContext(this, localctx);
	            this.enterOuterAlt(localctx, 5);
	            this.state = 115;
	            this.match(PegaExprParser.AT);
	            this.state = 116;
	            this.match(PegaExprParser.AT);
	            this.state = 117;
	            localctx.fname = this.match(PegaExprParser.ID);
	            this.state = 118;
	            this.match(PegaExprParser.LPAREN);
	            this.state = 120;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
	                this.state = 119;
	                this.exprList();
	            }

	            this.state = 122;
	            this.match(PegaExprParser.RPAREN);
	            break;

	        case 6:
	            localctx = new BareFuncContext(this, localctx);
	            this.enterOuterAlt(localctx, 6);
	            this.state = 123;
	            localctx.fname = this.match(PegaExprParser.ID);
	            this.state = 124;
	            this.match(PegaExprParser.LPAREN);
	            this.state = 126;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
	                this.state = 125;
	                this.exprList();
	            }

	            this.state = 128;
	            this.match(PegaExprParser.RPAREN);
	            break;

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	rulesetIdent() {
	    let localctx = new RulesetIdentContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 8, PegaExprParser.RULE_rulesetIdent);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 131;
	        this.match(PegaExprParser.ID);
	        this.state = 136;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===26) {
	            this.state = 132;
	            this.match(PegaExprParser.MINUS);
	            this.state = 133;
	            this.match(PegaExprParser.ID);
	            this.state = 138;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	reference() {
	    let localctx = new ReferenceContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 10, PegaExprParser.RULE_reference);
	    try {
	        this.state = 164;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,16,this._ctx);
	        switch(la_) {
	        case 1:
	            localctx = new CurrentRefContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 139;
	            this.match(PegaExprParser.ANGLE);
	            this.state = 141; 
	            this._errHandler.sync(this);
	            var _alt = 1;
	            do {
	            	switch (_alt) {
	            	case 1:
	            		this.state = 140;
	            		this.segment();
	            		break;
	            	default:
	            		throw new antlr4.error.NoViableAltException(this);
	            	}
	            	this.state = 143; 
	            	this._errHandler.sync(this);
	            	_alt = this._interp.adaptivePredict(this._input,12, this._ctx);
	            } while ( _alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER );
	            break;

	        case 2:
	            localctx = new ParamPageRefContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 145;
	            this.paramPage();
	            this.state = 149;
	            this._errHandler.sync(this);
	            var _alt = this._interp.adaptivePredict(this._input,13,this._ctx)
	            while(_alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER) {
	                if(_alt===1) {
	                    this.state = 146;
	                    this.segment(); 
	                }
	                this.state = 151;
	                this._errHandler.sync(this);
	                _alt = this._interp.adaptivePredict(this._input,13,this._ctx);
	            }

	            break;

	        case 3:
	            localctx = new PageRefContext(this, localctx);
	            this.enterOuterAlt(localctx, 3);
	            this.state = 152;
	            this.match(PegaExprParser.ID);
	            this.state = 154; 
	            this._errHandler.sync(this);
	            var _alt = 1;
	            do {
	            	switch (_alt) {
	            	case 1:
	            		this.state = 153;
	            		this.segment();
	            		break;
	            	default:
	            		throw new antlr4.error.NoViableAltException(this);
	            	}
	            	this.state = 156; 
	            	this._errHandler.sync(this);
	            	_alt = this._interp.adaptivePredict(this._input,14, this._ctx);
	            } while ( _alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER );
	            break;

	        case 4:
	            localctx = new RelativeRefContext(this, localctx);
	            this.enterOuterAlt(localctx, 4);
	            this.state = 159; 
	            this._errHandler.sync(this);
	            var _alt = 1;
	            do {
	            	switch (_alt) {
	            	case 1:
	            		this.state = 158;
	            		this.segment();
	            		break;
	            	default:
	            		throw new antlr4.error.NoViableAltException(this);
	            	}
	            	this.state = 161; 
	            	this._errHandler.sync(this);
	            	_alt = this._interp.adaptivePredict(this._input,15, this._ctx);
	            } while ( _alt!=2 && _alt!=antlr4.atn.ATN.INVALID_ALT_NUMBER );
	            break;

	        case 5:
	            localctx = new BareRefContext(this, localctx);
	            this.enterOuterAlt(localctx, 5);
	            this.state = 163;
	            this.match(PegaExprParser.ID);
	            break;

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	paramPage() {
	    let localctx = new ParamPageContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 12, PegaExprParser.RULE_paramPage);
	    var _la = 0;
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 166;
	        this.match(PegaExprParser.ID);
	        this.state = 167;
	        this.match(PegaExprParser.LBRACK);
	        this.state = 168;
	        this.keyedParam();
	        this.state = 173;
	        this._errHandler.sync(this);
	        _la = this._input.LA(1);
	        while(_la===17) {
	            this.state = 169;
	            this.match(PegaExprParser.COMMA);
	            this.state = 170;
	            this.keyedParam();
	            this.state = 175;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	        }
	        this.state = 176;
	        this.match(PegaExprParser.RBRACK);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	keyedParam() {
	    let localctx = new KeyedParamContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 14, PegaExprParser.RULE_keyedParam);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 178;
	        this.match(PegaExprParser.ID);
	        this.state = 179;
	        this.match(PegaExprParser.COLON);
	        this.state = 180;
	        this.expr(0);
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	segment() {
	    let localctx = new SegmentContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 16, PegaExprParser.RULE_segment);
	    try {
	        this.enterOuterAlt(localctx, 1);
	        this.state = 182;
	        this.match(PegaExprParser.DOT);
	        this.state = 183;
	        this.match(PegaExprParser.ID);
	        this.state = 188;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,18,this._ctx);
	        if(la_===1) {
	            this.state = 184;
	            this.match(PegaExprParser.LPAREN);
	            this.state = 185;
	            this.selector();
	            this.state = 186;
	            this.match(PegaExprParser.RPAREN);

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	selector() {
	    let localctx = new SelectorContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 18, PegaExprParser.RULE_selector);
	    var _la = 0;
	    try {
	        this.state = 198;
	        this._errHandler.sync(this);
	        var la_ = this._interp.adaptivePredict(this._input,20,this._ctx);
	        switch(la_) {
	        case 1:
	            localctx = new IndexSelContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 190;
	            this.match(PegaExprParser.INT);
	            break;

	        case 2:
	            localctx = new KeySelContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 191;
	            this.match(PegaExprParser.ID);
	            break;

	        case 3:
	            localctx = new SymbolicSelContext(this, localctx);
	            this.enterOuterAlt(localctx, 3);
	            this.state = 192;
	            this.match(PegaExprParser.ANGLE);
	            this.state = 194;
	            this._errHandler.sync(this);
	            _la = this._input.LA(1);
	            if((((_la) & ~0x1f) === 0 && ((1 << _la) & 3334803462) !== 0) || ((((_la - 32)) & ~0x1f) === 0 && ((1 << (_la - 32)) & 63) !== 0)) {
	                this.state = 193;
	                this.expr(0);
	            }

	            break;

	        case 4:
	            localctx = new ExprSelContext(this, localctx);
	            this.enterOuterAlt(localctx, 4);
	            this.state = 196;
	            this.expr(0);
	            break;

	        case 5:
	            localctx = new AppendSelContext(this, localctx);
	            this.enterOuterAlt(localctx, 5);

	            break;

	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}



	constant() {
	    let localctx = new ConstantContext(this, this._ctx, this.state);
	    this.enterRule(localctx, 20, PegaExprParser.RULE_constant);
	    try {
	        this.state = 208;
	        this._errHandler.sync(this);
	        switch(this._input.LA(1)) {
	        case 37:
	            localctx = new IntConstContext(this, localctx);
	            this.enterOuterAlt(localctx, 1);
	            this.state = 200;
	            this.match(PegaExprParser.INT);
	            break;
	        case 36:
	            localctx = new LongConstContext(this, localctx);
	            this.enterOuterAlt(localctx, 2);
	            this.state = 201;
	            this.match(PegaExprParser.LONG);
	            break;
	        case 35:
	            localctx = new DoubleConstContext(this, localctx);
	            this.enterOuterAlt(localctx, 3);
	            this.state = 202;
	            this.match(PegaExprParser.DOUBLE);
	            break;
	        case 32:
	            localctx = new StringConstContext(this, localctx);
	            this.enterOuterAlt(localctx, 4);
	            this.state = 203;
	            this.match(PegaExprParser.STRING);
	            break;
	        case 33:
	            localctx = new CharConstContext(this, localctx);
	            this.enterOuterAlt(localctx, 5);
	            this.state = 204;
	            this.match(PegaExprParser.CHAR);
	            break;
	        case 1:
	            localctx = new TrueConstContext(this, localctx);
	            this.enterOuterAlt(localctx, 6);
	            this.state = 205;
	            this.match(PegaExprParser.TRUE);
	            break;
	        case 2:
	            localctx = new FalseConstContext(this, localctx);
	            this.enterOuterAlt(localctx, 7);
	            this.state = 206;
	            this.match(PegaExprParser.FALSE);
	            break;
	        case 30:
	            localctx = new AngleConstContext(this, localctx);
	            this.enterOuterAlt(localctx, 8);
	            this.state = 207;
	            this.match(PegaExprParser.ANGLE);
	            break;
	        default:
	            throw new antlr4.error.NoViableAltException(this);
	        }
	    } catch (re) {
	    	if(re instanceof antlr4.error.RecognitionException) {
		        localctx.exception = re;
		        this._errHandler.reportError(this, re);
		        this._errHandler.recover(this, re);
		    } else {
		    	throw re;
		    }
	    } finally {
	        this.exitRule();
	    }
	    return localctx;
	}


}

PegaExprParser.EOF = antlr4.Token.EOF;
PegaExprParser.TRUE = 1;
PegaExprParser.FALSE = 2;
PegaExprParser.LE = 3;
PegaExprParser.GE = 4;
PegaExprParser.EQ = 5;
PegaExprParser.NE = 6;
PegaExprParser.NE2 = 7;
PegaExprParser.LIKE = 8;
PegaExprParser.FUZZY = 9;
PegaExprParser.AND = 10;
PegaExprParser.OR = 11;
PegaExprParser.LPAREN = 12;
PegaExprParser.RPAREN = 13;
PegaExprParser.LBRACK = 14;
PegaExprParser.RBRACK = 15;
PegaExprParser.DOT = 16;
PegaExprParser.COMMA = 17;
PegaExprParser.AT = 18;
PegaExprParser.COLON = 19;
PegaExprParser.LT = 20;
PegaExprParser.GT = 21;
PegaExprParser.ASGN_EQ = 22;
PegaExprParser.NOT = 23;
PegaExprParser.QUESTION = 24;
PegaExprParser.PLUS = 25;
PegaExprParser.MINUS = 26;
PegaExprParser.STAR = 27;
PegaExprParser.SLASH = 28;
PegaExprParser.PERCENT = 29;
PegaExprParser.ANGLE = 30;
PegaExprParser.PLACEHOLDER = 31;
PegaExprParser.STRING = 32;
PegaExprParser.CHAR = 33;
PegaExprParser.ID = 34;
PegaExprParser.DOUBLE = 35;
PegaExprParser.LONG = 36;
PegaExprParser.INT = 37;
PegaExprParser.WS = 38;

PegaExprParser.RULE_exprEntry = 0;
PegaExprParser.RULE_expr = 1;
PegaExprParser.RULE_exprList = 2;
PegaExprParser.RULE_function = 3;
PegaExprParser.RULE_rulesetIdent = 4;
PegaExprParser.RULE_reference = 5;
PegaExprParser.RULE_paramPage = 6;
PegaExprParser.RULE_keyedParam = 7;
PegaExprParser.RULE_segment = 8;
PegaExprParser.RULE_selector = 9;
PegaExprParser.RULE_constant = 10;

class ExprEntryContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_exprEntry;
    }

	expr() {
	    return this.getTypedRuleContext(ExprContext,0);
	};

	EOF() {
	    return this.getToken(PegaExprParser.EOF, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterExprEntry(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitExprEntry(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitExprEntry(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class ExprContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_expr;
    }


	 
		copyFrom(ctx) {
			super.copyFrom(ctx);
		}

}


class MulExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        this.op = null;;
        super.copyFrom(ctx);
    }

	expr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExprContext);
	    } else {
	        return this.getTypedRuleContext(ExprContext,i);
	    }
	};

	STAR() {
	    return this.getToken(PegaExprParser.STAR, 0);
	};

	SLASH() {
	    return this.getToken(PegaExprParser.SLASH, 0);
	};

	PERCENT() {
	    return this.getToken(PegaExprParser.PERCENT, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterMulExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitMulExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitMulExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.MulExprContext = MulExprContext;

class AndExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	expr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExprContext);
	    } else {
	        return this.getTypedRuleContext(ExprContext,i);
	    }
	};

	AND() {
	    return this.getToken(PegaExprParser.AND, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterAndExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitAndExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitAndExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.AndExprContext = AndExprContext;

class ConstExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	constant() {
	    return this.getTypedRuleContext(ConstantContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterConstExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitConstExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitConstExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.ConstExprContext = ConstExprContext;

class RelExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        this.op = null;;
        super.copyFrom(ctx);
    }

	expr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExprContext);
	    } else {
	        return this.getTypedRuleContext(ExprContext,i);
	    }
	};

	LT() {
	    return this.getToken(PegaExprParser.LT, 0);
	};

	GT() {
	    return this.getToken(PegaExprParser.GT, 0);
	};

	LE() {
	    return this.getToken(PegaExprParser.LE, 0);
	};

	GE() {
	    return this.getToken(PegaExprParser.GE, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterRelExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitRelExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitRelExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.RelExprContext = RelExprContext;

class AddExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        this.op = null;;
        super.copyFrom(ctx);
    }

	expr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExprContext);
	    } else {
	        return this.getTypedRuleContext(ExprContext,i);
	    }
	};

	PLUS() {
	    return this.getToken(PegaExprParser.PLUS, 0);
	};

	MINUS() {
	    return this.getToken(PegaExprParser.MINUS, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterAddExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitAddExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitAddExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.AddExprContext = AddExprContext;

class FuncExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	function_() {
	    return this.getTypedRuleContext(FunctionContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterFuncExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitFuncExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitFuncExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.FuncExprContext = FuncExprContext;

class UnaryExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        this.op = null;;
        super.copyFrom(ctx);
    }

	expr() {
	    return this.getTypedRuleContext(ExprContext,0);
	};

	MINUS() {
	    return this.getToken(PegaExprParser.MINUS, 0);
	};

	PLUS() {
	    return this.getToken(PegaExprParser.PLUS, 0);
	};

	NOT() {
	    return this.getToken(PegaExprParser.NOT, 0);
	};

	ASGN_EQ() {
	    return this.getToken(PegaExprParser.ASGN_EQ, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterUnaryExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitUnaryExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitUnaryExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.UnaryExprContext = UnaryExprContext;

class PlaceholderExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	PLACEHOLDER() {
	    return this.getToken(PegaExprParser.PLACEHOLDER, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterPlaceholderExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitPlaceholderExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitPlaceholderExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.PlaceholderExprContext = PlaceholderExprContext;

class OrExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	expr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExprContext);
	    } else {
	        return this.getTypedRuleContext(ExprContext,i);
	    }
	};

	OR() {
	    return this.getToken(PegaExprParser.OR, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterOrExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitOrExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitOrExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.OrExprContext = OrExprContext;

class EqExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        this.op = null;;
        super.copyFrom(ctx);
    }

	expr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExprContext);
	    } else {
	        return this.getTypedRuleContext(ExprContext,i);
	    }
	};

	EQ() {
	    return this.getToken(PegaExprParser.EQ, 0);
	};

	NE() {
	    return this.getToken(PegaExprParser.NE, 0);
	};

	NE2() {
	    return this.getToken(PegaExprParser.NE2, 0);
	};

	LIKE() {
	    return this.getToken(PegaExprParser.LIKE, 0);
	};

	FUZZY() {
	    return this.getToken(PegaExprParser.FUZZY, 0);
	};

	ASGN_EQ() {
	    return this.getToken(PegaExprParser.ASGN_EQ, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterEqExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitEqExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitEqExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.EqExprContext = EqExprContext;

class ParenExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	LPAREN() {
	    return this.getToken(PegaExprParser.LPAREN, 0);
	};

	expr() {
	    return this.getTypedRuleContext(ExprContext,0);
	};

	RPAREN() {
	    return this.getToken(PegaExprParser.RPAREN, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterParenExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitParenExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitParenExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.ParenExprContext = ParenExprContext;

class RefExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	reference() {
	    return this.getTypedRuleContext(ReferenceContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterRefExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitRefExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitRefExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.RefExprContext = RefExprContext;

class TernaryExprContext extends ExprContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	expr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExprContext);
	    } else {
	        return this.getTypedRuleContext(ExprContext,i);
	    }
	};

	QUESTION() {
	    return this.getToken(PegaExprParser.QUESTION, 0);
	};

	COLON() {
	    return this.getToken(PegaExprParser.COLON, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterTernaryExpr(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitTernaryExpr(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitTernaryExpr(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.TernaryExprContext = TernaryExprContext;

class ExprListContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_exprList;
    }

	expr = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(ExprContext);
	    } else {
	        return this.getTypedRuleContext(ExprContext,i);
	    }
	};

	COMMA = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.COMMA);
	    } else {
	        return this.getToken(PegaExprParser.COMMA, i);
	    }
	};


	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterExprList(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitExprList(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitExprList(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class FunctionContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_function;
    }


	 
		copyFrom(ctx) {
			super.copyFrom(ctx);
		}

}


class SimpleFuncContext extends FunctionContext {

    constructor(parser, ctx) {
        super(parser);
        this.fname = null;;
        super.copyFrom(ctx);
    }

	AT() {
	    return this.getToken(PegaExprParser.AT, 0);
	};

	LPAREN() {
	    return this.getToken(PegaExprParser.LPAREN, 0);
	};

	RPAREN() {
	    return this.getToken(PegaExprParser.RPAREN, 0);
	};

	ID() {
	    return this.getToken(PegaExprParser.ID, 0);
	};

	exprList() {
	    return this.getTypedRuleContext(ExprListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterSimpleFunc(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitSimpleFunc(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitSimpleFunc(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.SimpleFuncContext = SimpleFuncContext;

class LibraryFuncContext extends FunctionContext {

    constructor(parser, ctx) {
        super(parser);
        this.library = null;;
        this.fname = null;;
        super.copyFrom(ctx);
    }

	AT() {
	    return this.getToken(PegaExprParser.AT, 0);
	};

	DOT() {
	    return this.getToken(PegaExprParser.DOT, 0);
	};

	LPAREN() {
	    return this.getToken(PegaExprParser.LPAREN, 0);
	};

	RPAREN() {
	    return this.getToken(PegaExprParser.RPAREN, 0);
	};

	ID = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.ID);
	    } else {
	        return this.getToken(PegaExprParser.ID, i);
	    }
	};


	exprList() {
	    return this.getTypedRuleContext(ExprListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterLibraryFunc(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitLibraryFunc(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitLibraryFunc(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.LibraryFuncContext = LibraryFuncContext;

class BareFuncContext extends FunctionContext {

    constructor(parser, ctx) {
        super(parser);
        this.fname = null;;
        super.copyFrom(ctx);
    }

	LPAREN() {
	    return this.getToken(PegaExprParser.LPAREN, 0);
	};

	RPAREN() {
	    return this.getToken(PegaExprParser.RPAREN, 0);
	};

	ID() {
	    return this.getToken(PegaExprParser.ID, 0);
	};

	exprList() {
	    return this.getTypedRuleContext(ExprListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterBareFunc(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitBareFunc(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitBareFunc(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.BareFuncContext = BareFuncContext;

class LegacyLibraryFuncContext extends FunctionContext {

    constructor(parser, ctx) {
        super(parser);
        this.library = null;;
        this.fname = null;;
        super.copyFrom(ctx);
    }

	AT = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.AT);
	    } else {
	        return this.getToken(PegaExprParser.AT, i);
	    }
	};


	DOT() {
	    return this.getToken(PegaExprParser.DOT, 0);
	};

	LPAREN() {
	    return this.getToken(PegaExprParser.LPAREN, 0);
	};

	RPAREN() {
	    return this.getToken(PegaExprParser.RPAREN, 0);
	};

	ID = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.ID);
	    } else {
	        return this.getToken(PegaExprParser.ID, i);
	    }
	};


	exprList() {
	    return this.getTypedRuleContext(ExprListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterLegacyLibraryFunc(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitLegacyLibraryFunc(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitLegacyLibraryFunc(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.LegacyLibraryFuncContext = LegacyLibraryFuncContext;

class LegacySimpleFuncContext extends FunctionContext {

    constructor(parser, ctx) {
        super(parser);
        this.fname = null;;
        super.copyFrom(ctx);
    }

	AT = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.AT);
	    } else {
	        return this.getToken(PegaExprParser.AT, i);
	    }
	};


	LPAREN() {
	    return this.getToken(PegaExprParser.LPAREN, 0);
	};

	RPAREN() {
	    return this.getToken(PegaExprParser.RPAREN, 0);
	};

	ID() {
	    return this.getToken(PegaExprParser.ID, 0);
	};

	exprList() {
	    return this.getTypedRuleContext(ExprListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterLegacySimpleFunc(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitLegacySimpleFunc(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitLegacySimpleFunc(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.LegacySimpleFuncContext = LegacySimpleFuncContext;

class QualifiedFuncContext extends FunctionContext {

    constructor(parser, ctx) {
        super(parser);
        this.library = null;;
        this.fname = null;;
        super.copyFrom(ctx);
    }

	AT() {
	    return this.getToken(PegaExprParser.AT, 0);
	};

	LPAREN = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.LPAREN);
	    } else {
	        return this.getToken(PegaExprParser.LPAREN, i);
	    }
	};


	rulesetIdent() {
	    return this.getTypedRuleContext(RulesetIdentContext,0);
	};

	COLON() {
	    return this.getToken(PegaExprParser.COLON, 0);
	};

	RPAREN = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.RPAREN);
	    } else {
	        return this.getToken(PegaExprParser.RPAREN, i);
	    }
	};


	DOT() {
	    return this.getToken(PegaExprParser.DOT, 0);
	};

	ID = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.ID);
	    } else {
	        return this.getToken(PegaExprParser.ID, i);
	    }
	};


	exprList() {
	    return this.getTypedRuleContext(ExprListContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterQualifiedFunc(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitQualifiedFunc(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitQualifiedFunc(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.QualifiedFuncContext = QualifiedFuncContext;

class RulesetIdentContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_rulesetIdent;
    }

	ID = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.ID);
	    } else {
	        return this.getToken(PegaExprParser.ID, i);
	    }
	};


	MINUS = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.MINUS);
	    } else {
	        return this.getToken(PegaExprParser.MINUS, i);
	    }
	};


	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterRulesetIdent(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitRulesetIdent(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitRulesetIdent(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class ReferenceContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_reference;
    }


	 
		copyFrom(ctx) {
			super.copyFrom(ctx);
		}

}


class CurrentRefContext extends ReferenceContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	ANGLE() {
	    return this.getToken(PegaExprParser.ANGLE, 0);
	};

	segment = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(SegmentContext);
	    } else {
	        return this.getTypedRuleContext(SegmentContext,i);
	    }
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterCurrentRef(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitCurrentRef(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitCurrentRef(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.CurrentRefContext = CurrentRefContext;

class ParamPageRefContext extends ReferenceContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	paramPage() {
	    return this.getTypedRuleContext(ParamPageContext,0);
	};

	segment = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(SegmentContext);
	    } else {
	        return this.getTypedRuleContext(SegmentContext,i);
	    }
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterParamPageRef(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitParamPageRef(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitParamPageRef(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.ParamPageRefContext = ParamPageRefContext;

class PageRefContext extends ReferenceContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	ID() {
	    return this.getToken(PegaExprParser.ID, 0);
	};

	segment = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(SegmentContext);
	    } else {
	        return this.getTypedRuleContext(SegmentContext,i);
	    }
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterPageRef(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitPageRef(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitPageRef(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.PageRefContext = PageRefContext;

class BareRefContext extends ReferenceContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	ID() {
	    return this.getToken(PegaExprParser.ID, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterBareRef(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitBareRef(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitBareRef(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.BareRefContext = BareRefContext;

class RelativeRefContext extends ReferenceContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	segment = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(SegmentContext);
	    } else {
	        return this.getTypedRuleContext(SegmentContext,i);
	    }
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterRelativeRef(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitRelativeRef(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitRelativeRef(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.RelativeRefContext = RelativeRefContext;

class ParamPageContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_paramPage;
    }

	ID() {
	    return this.getToken(PegaExprParser.ID, 0);
	};

	LBRACK() {
	    return this.getToken(PegaExprParser.LBRACK, 0);
	};

	keyedParam = function(i) {
	    if(i===undefined) {
	        i = null;
	    }
	    if(i===null) {
	        return this.getTypedRuleContexts(KeyedParamContext);
	    } else {
	        return this.getTypedRuleContext(KeyedParamContext,i);
	    }
	};

	RBRACK() {
	    return this.getToken(PegaExprParser.RBRACK, 0);
	};

	COMMA = function(i) {
		if(i===undefined) {
			i = null;
		}
	    if(i===null) {
	        return this.getTokens(PegaExprParser.COMMA);
	    } else {
	        return this.getToken(PegaExprParser.COMMA, i);
	    }
	};


	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterParamPage(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitParamPage(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitParamPage(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class KeyedParamContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_keyedParam;
    }

	ID() {
	    return this.getToken(PegaExprParser.ID, 0);
	};

	COLON() {
	    return this.getToken(PegaExprParser.COLON, 0);
	};

	expr() {
	    return this.getTypedRuleContext(ExprContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterKeyedParam(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitKeyedParam(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitKeyedParam(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class SegmentContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_segment;
    }

	DOT() {
	    return this.getToken(PegaExprParser.DOT, 0);
	};

	ID() {
	    return this.getToken(PegaExprParser.ID, 0);
	};

	LPAREN() {
	    return this.getToken(PegaExprParser.LPAREN, 0);
	};

	selector() {
	    return this.getTypedRuleContext(SelectorContext,0);
	};

	RPAREN() {
	    return this.getToken(PegaExprParser.RPAREN, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterSegment(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitSegment(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitSegment(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}



class SelectorContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_selector;
    }


	 
		copyFrom(ctx) {
			super.copyFrom(ctx);
		}

}


class AppendSelContext extends SelectorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }


	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterAppendSel(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitAppendSel(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitAppendSel(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.AppendSelContext = AppendSelContext;

class IndexSelContext extends SelectorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	INT() {
	    return this.getToken(PegaExprParser.INT, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterIndexSel(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitIndexSel(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitIndexSel(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.IndexSelContext = IndexSelContext;

class ExprSelContext extends SelectorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	expr() {
	    return this.getTypedRuleContext(ExprContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterExprSel(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitExprSel(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitExprSel(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.ExprSelContext = ExprSelContext;

class KeySelContext extends SelectorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	ID() {
	    return this.getToken(PegaExprParser.ID, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterKeySel(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitKeySel(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitKeySel(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.KeySelContext = KeySelContext;

class SymbolicSelContext extends SelectorContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	ANGLE() {
	    return this.getToken(PegaExprParser.ANGLE, 0);
	};

	expr() {
	    return this.getTypedRuleContext(ExprContext,0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterSymbolicSel(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitSymbolicSel(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitSymbolicSel(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.SymbolicSelContext = SymbolicSelContext;

class ConstantContext extends antlr4.ParserRuleContext {

    constructor(parser, parent, invokingState) {
        if(parent===undefined) {
            parent = null;
        }
        if(invokingState===undefined || invokingState===null) {
            invokingState = -1;
        }
        super(parent, invokingState);
        this.parser = parser;
        this.ruleIndex = PegaExprParser.RULE_constant;
    }


	 
		copyFrom(ctx) {
			super.copyFrom(ctx);
		}

}


class CharConstContext extends ConstantContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	CHAR() {
	    return this.getToken(PegaExprParser.CHAR, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterCharConst(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitCharConst(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitCharConst(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.CharConstContext = CharConstContext;

class DoubleConstContext extends ConstantContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	DOUBLE() {
	    return this.getToken(PegaExprParser.DOUBLE, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterDoubleConst(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitDoubleConst(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitDoubleConst(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.DoubleConstContext = DoubleConstContext;

class StringConstContext extends ConstantContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	STRING() {
	    return this.getToken(PegaExprParser.STRING, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterStringConst(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitStringConst(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitStringConst(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.StringConstContext = StringConstContext;

class TrueConstContext extends ConstantContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	TRUE() {
	    return this.getToken(PegaExprParser.TRUE, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterTrueConst(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitTrueConst(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitTrueConst(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.TrueConstContext = TrueConstContext;

class AngleConstContext extends ConstantContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	ANGLE() {
	    return this.getToken(PegaExprParser.ANGLE, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterAngleConst(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitAngleConst(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitAngleConst(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.AngleConstContext = AngleConstContext;

class FalseConstContext extends ConstantContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	FALSE() {
	    return this.getToken(PegaExprParser.FALSE, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterFalseConst(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitFalseConst(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitFalseConst(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.FalseConstContext = FalseConstContext;

class IntConstContext extends ConstantContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	INT() {
	    return this.getToken(PegaExprParser.INT, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterIntConst(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitIntConst(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitIntConst(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.IntConstContext = IntConstContext;

class LongConstContext extends ConstantContext {

    constructor(parser, ctx) {
        super(parser);
        super.copyFrom(ctx);
    }

	LONG() {
	    return this.getToken(PegaExprParser.LONG, 0);
	};

	enterRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.enterLongConst(this);
		}
	}

	exitRule(listener) {
	    if(listener instanceof PegaExprListener ) {
	        listener.exitLongConst(this);
		}
	}

	accept(visitor) {
	    if ( visitor instanceof PegaExprVisitor ) {
	        return visitor.visitLongConst(this);
	    } else {
	        return visitor.visitChildren(this);
	    }
	}


}

PegaExprParser.LongConstContext = LongConstContext;


PegaExprParser.ExprEntryContext = ExprEntryContext; 
PegaExprParser.ExprContext = ExprContext; 
PegaExprParser.ExprListContext = ExprListContext; 
PegaExprParser.FunctionContext = FunctionContext; 
PegaExprParser.RulesetIdentContext = RulesetIdentContext; 
PegaExprParser.ReferenceContext = ReferenceContext; 
PegaExprParser.ParamPageContext = ParamPageContext; 
PegaExprParser.KeyedParamContext = KeyedParamContext; 
PegaExprParser.SegmentContext = SegmentContext; 
PegaExprParser.SelectorContext = SelectorContext; 
PegaExprParser.ConstantContext = ConstantContext; 
