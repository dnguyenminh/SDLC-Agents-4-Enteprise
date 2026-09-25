import type { PegaClipboardContext } from './PegaClipboardContext.js';

export type ValueType = 'Text' | 'Number' | 'Boolean' | 'Null' | 'Page' | 'PageList';

export class PegValue {
  constructor(
    public readonly type: ValueType,
    public readonly value: unknown,
  ) {}

  get text(): string {
    if (this.type === 'Null') return '';
    if (this.type === 'Number') return String(this.value);
    if (this.type === 'Boolean') return this.value ? 'true' : 'false';
    return String(this.value ?? '');
  }

  get number(): number {
    if (this.type === 'Number') return this.value as number;
    if (this.type === 'Text') {
      const n = Number(this.value);
      return isNaN(n) ? 0 : n;
    }
    return 0;
  }

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
  static page(name: string, ctx: PegaClipboardContext): PegValue { return new PegValue('Page', { name, ctx }); }
  static pageList(items: PegValue[]): PegValue { return new PegValue('PageList', items); }
}

/** Whitelisted builtin function registry, keyed by canonical name (`@round`, `@Lib.fn`, ...). */
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

  static isWhitelisted(name: string): boolean {
    return this.whitelist.has(name);
  }

  static call(name: string, args: PegValue[]): PegValue {
    const fn = this.whitelist.get(name);
    if (!fn) {
      throw new PegExpressionError("Function '" + name + "' is not in whitelist", 'FUNCTION_NOT_ALLOWED', 0, 0);
    }
    return fn(args);
  }
}

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
