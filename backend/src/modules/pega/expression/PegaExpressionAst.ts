/**
 * PegaExpressionAst.ts — Runtime value model + builtin function registry for Pega
 * expression evaluation.
 *
 * NOTE: The self-evaluating OOP AST node classes that formerly lived here (PropertyRefNode,
 * FunctionCallNode, BinaryOpNode, ...) were removed. Parsing now produces the POC ExprNode
 * data model (expression/pega-expr/nodes.ts) and evaluation is done by ExprNodeEvaluator.
 * This file retains only the runtime primitives that both the evaluator and the decision
 * layer depend on: PegValue (tagged runtime value), PegaBuiltinFunctions (whitelisted
 * function implementations), and PegExpressionError.
 */

/** Runtime value tag for an evaluated expression result. */
export type ValueType = 'Text' | 'Number' | 'Boolean' | 'Null' | 'Page' | 'PageList';

/** A tagged runtime value produced by evaluating an expression. */
export class PegValue {
  constructor(
    public readonly type: ValueType,
    public readonly value: unknown,
  ) {}

  /** Coerce to display text. Null -> "", numbers/booleans stringified. */
  get text(): string {
    if (this.type === 'Null') return '';
    if (this.type === 'Number') return String(this.value);
    if (this.type === 'Boolean') return this.value ? 'true' : 'false';
    return String(this.value ?? '');
  }

  /** Coerce to a number (text is parsed; non-numeric -> 0). */
  get number(): number {
    if (this.type === 'Number') return this.value as number;
    if (this.type === 'Text') {
      const n = Number(this.value);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

  /** Coerce to boolean (Pega truthiness: non-empty/non-zero/non-null). */
  get boolean(): boolean {
    if (this.type === 'Boolean') return this.value as boolean;
    if (this.type === 'Null') return false;
    if (this.type === 'Number') return (this.value as number) !== 0;
    return this.value != null && this.value !== '';
  }

  static text(v: string): PegValue { return new PegValue('Text', v); }
  static number(v: number): PegValue { return new PegValue('Number', v); }
  static bool(v: boolean): PegValue { return new PegValue('Boolean', v); }
  static null(): PegValue { return new PegValue('Null', null); }
  static page(name: string, ctx: unknown): PegValue { return new PegValue('Page', { name, ctx }); }
  static pageList(items: PegValue[]): PegValue { return new PegValue('PageList', items); }
}

/**
 * Whitelisted builtin Pega functions. Deny-by-default: `call` throws for any name not in
 * the map. Keys include the leading '@' (e.g. '@upper'); callers rebuild that canonical key.
 */
export class PegaBuiltinFunctions {
  private static whitelist = new Map<string, (args: PegValue[]) => PegValue>([
    ['@round', (args) => {
      const n = args[0].number;
      const decimals = args.length > 1 ? args[1].number : 0;
      const factor = Math.pow(10, decimals);
      return PegValue.number(Math.round(n * factor) / factor);
    }],
    ['@upper', (args) => PegValue.text(args[0].text.toUpperCase())],
    ['@lower', (args) => PegValue.text(args[0].text.toLowerCase())],
    ['@CurrentDate', () => PegValue.text(new Date().toISOString())],
    ['@If', (args) => args[0].boolean ? args[1] : args[2]],
    ['@IsNull', (args) => PegValue.bool(args[0].type === 'Null')],
    ['@Length', (args) => PegValue.number(args[0].text.length)],
    ['@Concat', (args) => PegValue.text(args.map(a => a.text).join(''))],
    ['@Substring', (args) => {
      const s = args[0].text;
      const start = args[1].number;
      const len = args.length > 2 ? args[2].number : s.length;
      return PegValue.text(s.substring(start, start + len));
    }],
    ['@Index', (args) => PegValue.number(args[0].text.indexOf(args[1].text))],
  ]);

  /** True if a function name (with leading '@') is whitelisted. */
  static isWhitelisted(name: string): boolean {
    return this.whitelist.has(name);
  }

  /**
   * Invoke a whitelisted builtin.
   * @param name Canonical function key (with leading '@')
   * @param args Evaluated argument values
   * @throws PegExpressionError if the function is not whitelisted
   */
  static call(name: string, args: PegValue[]): PegValue {
    const fn = this.whitelist.get(name);
    if (!fn) {
      throw new PegExpressionError("Function '" + name + "' is not in whitelist", 'FUNCTION_NOT_ALLOWED', 0, 0);
    }
    return fn(args);
  }
}

/** Error raised during expression evaluation, carrying a machine-readable code. */
export class PegExpressionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly line?: number,
    public readonly column?: number,
  ) {
    super(message);
    this.name = 'PegExpressionError';
  }
}
