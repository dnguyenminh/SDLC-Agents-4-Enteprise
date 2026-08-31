/*
 * PegaExpr.g4 — SA4E-233 — An independently authored ANTLR4 grammar for the Pega
 * expression language, used to parse expressions found inside rule instances (When
 * conditions, Data Transform values, Decision Table cells, Declare Expressions, etc.).
 *
 * This grammar is written from scratch based on observed expression syntax and the
 * documented operator set / precedence. It is NOT copied from Pega's own grammar;
 * only the language it recognizes (a factual interface) is shared.
 *
 * Operator precedence, tightest to loosest (matches observed Pega behaviour):
 *   unary (- + !)          prefix
 *   * / %                  multiplicative
 *   + -                    additive (+ doubles as string concat)
 *   < > <= >=              relational
 *   == != <> ^= ~= =       equality / like
 *   &&                     logical and
 *   ||                     logical or
 *   ?:                     ternary (right-associative)
 *
 * Alternatives are labelled (# Label) so the generated visitor can map each to a
 * typed AST node without inspecting token positions.
 */
grammar PegaExpr;

/* ===================== Parser rules ===================== */

// Entry point: a single expression consuming all input.
exprEntry : expr EOF ;

expr
    : function                                             # FuncExpr
    | reference                                            # RefExpr
    | constant                                             # ConstExpr
    | '(' expr ')'                                         # ParenExpr
    | PLACEHOLDER                                          # PlaceholderExpr
    | op=('-' | '+' | '!' | '=') expr                      # UnaryExpr
    | expr op=('*' | '/' | '%') expr                       # MulExpr
    | expr op=('+' | '-') expr                             # AddExpr
    | expr op=('<' | '>' | '<=' | '>=') expr               # RelExpr
    | expr op=('==' | '!=' | '<>' | '^=' | '~=' | '=') expr # EqExpr
    | expr '&&' expr                                       # AndExpr
    | expr '||' expr                                       # OrExpr
    | <assoc=right> expr '?' expr ':' expr                 # TernaryExpr
    ;

exprList : expr (',' expr)* ;

// Function calls:
//   @(RulesetName:LibraryName).funcName(args)
//   @LibraryName.funcName(args)
//   @funcName(args)
function
    : '@' '(' rulesetIdent ':' library=ID ')' '.' fname=ID '(' exprList? ')'  # QualifiedFunc
    | '@' library=ID '.' fname=ID '(' exprList? ')'                            # LibraryFunc
    | '@' fname=ID '(' exprList? ')'                                           # SimpleFunc
    ;

// Ruleset names may contain hyphens (e.g. Pega-RULES).
rulesetIdent : ID ('-' ID)* ;

// Property references:
//   .a.b            relative to the step/primary page
//   Page.a.b        rooted at a named page or scope keyword (Param, Local, Primary, ...)
//   Page            a bare page/scope identifier
//   <current>.a     current-page prefix
reference
    : ANGLE segment+          # CurrentRef      // <current>.x.y
    | paramPage segment*      # ParamPageRef    // D_Page[k:v].x.y  (data page with keys)
    | ID segment+             # PageRef         // Page.x.y  (ID = page / scope keyword)
    | segment+                # RelativeRef     // .x.y
    | ID                      # BareRef         // Page
    ;

// Parameterized (keyed) page name: D_Page[Key:value, Key2:value2]
paramPage : ID '[' keyedParam (',' keyedParam)* ']' ;
keyedParam : ID ':' expr ;

// A single dotted segment, optionally subscripted with parentheses: .name  or  .name(selector)
segment : '.' ID ( '(' selector ')' )? ;

selector
    : INT               # IndexSel      // .list(1)
    | ID                # KeySel        // .group(key)
    | ANGLE expr?       # SymbolicSel   // .list(<APPEND>) or .list(<insert> expr)
    | expr              # ExprSel       // .list(.idx + 1)
    |                   # AppendSel     // .list()
    ;

constant
    : INT       # IntConst
    | LONG      # LongConst
    | DOUBLE    # DoubleConst
    | STRING    # StringConst
    | CHAR      # CharConst
    | TRUE      # TrueConst
    | FALSE     # FalseConst
    | ANGLE     # AngleConst    // e.g. a standalone <current> used as a value
    ;

/* ===================== Lexer rules ===================== */

TRUE  : 'true' ;
FALSE : 'false' ;

// Multi-char operators must precede single-char ones for correct maximal munch.
LE      : '<=' ;
GE      : '>=' ;
EQ      : '==' ;
NE      : '!=' ;
NE2     : '<>' ;
LIKE    : '^=' ;
FUZZY   : '~=' ;
AND     : '&&' ;
OR      : '||' ;

LPAREN  : '(' ;
RPAREN  : ')' ;
LBRACK  : '[' ;
RBRACK  : ']' ;
DOT     : '.' ;
COMMA   : ',' ;
AT      : '@' ;
COLON   : ':' ;
LT      : '<' ;
GT      : '>' ;
ASGN_EQ : '=' ;
NOT     : '!' ;
QUESTION: '?' ;
PLUS    : '+' ;
MINUS   : '-' ;
STAR    : '*' ;
SLASH   : '/' ;
PERCENT : '%' ;

// Angle-bracketed identifier: <current>, <APPEND>, <insert>, ...
ANGLE : '<' [A-Za-z_$] [A-Za-z0-9_$]* '>' ;

// Curly placeholder used in function signature templates, e.g. {lValue}, {comparator}.
// These appear where an argument value would go in a template signature.
PLACEHOLDER : '{' [A-Za-z_$] [A-Za-z0-9_$]* '}' ;

// Double-quoted string with escapes.
STRING : '"' ( ESC | ~["\\] )* '"' ;
// Single-quoted char literal.
CHAR   : '\'' ( ESC | ~['\\] ) '\'' ;
fragment ESC : '\\' ( ["'\\bfnrt] | UNICODE ) ;
fragment UNICODE : 'u' HEX HEX HEX HEX ;
fragment HEX : [0-9A-Fa-f] ;

// Identifier: letters, digits, _, $ (broad, XML-name-like). Also allows '@baseclass'
// style by permitting a leading '@' inside a dotted class literal handled at parse time.
ID : [A-Za-z_$] [A-Za-z0-9_$]* ;

DOUBLE : DIGITS '.' DIGITS? EXP? FSUF?
       | '.' DIGITS EXP? FSUF?
       | DIGITS EXP FSUF?
       | DIGITS FSUF ;
LONG   : DIGITS [Ll] ;
INT    : DIGITS ;
fragment DIGITS : [0-9]+ ;
fragment EXP : [Ee] [+-]? DIGITS ;
fragment FSUF : [DdFf] ;

WS : [ \t\r\n\f]+ -> skip ;
