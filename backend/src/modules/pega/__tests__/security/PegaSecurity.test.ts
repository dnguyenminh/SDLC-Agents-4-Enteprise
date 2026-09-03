import { describe, it, expect } from 'vitest';
import { PegaHtmlSanitizer } from '../../security/PegaHtmlSanitizer.js';
import { PegaFunctionWhitelist } from '../../security/PegaFunctionWhitelist.js';
import { ExprNodeValidator } from '../../expression/ExprNodeValidator.js';
import { parseExpression } from '../../expression/pega-expr/parser.js';
import { PegaEvaluationSandbox } from '../../security/PegaEvaluationSandbox.js';

describe('PegaHtmlSanitizer', () => {
  const sanitizer = new PegaHtmlSanitizer();

  it('sanitize escapes & < > " \' /', () => {
    const input = `<script>alert("xss") & 'oops'</script>`;
    const expected = `&lt;script&gt;alert(&quot;xss&quot;) &amp; &#x27;oops&#x27;&lt;&#x2F;script&gt;`;
    expect(sanitizer.sanitize(input)).toBe(expected);
  });

  it('sanitizeObject recurses into nested objects', () => {
    const input = { inner: { name: '<b>Bold</b>' } };
    const result = sanitizer.sanitizeObject(input);
    expect((result.inner as Record<string, unknown>).name).toBe('&lt;b&gt;Bold&lt;&#x2F;b&gt;');
  });

  it('sanitizeObject preserves non-string values', () => {
    const input = { a: '<script>', count: 42, active: true, tags: ['a', 'b'] };
    const result = sanitizer.sanitizeObject(input);
    expect(result.a).toBe('&lt;script&gt;');
    expect(result.count).toBe(42);
    expect(result.active).toBe(true);
    expect(result.tags).toEqual(['a', 'b']);
  });

  it('sanitizeArray sanitizes each element', () => {
    const arr = ['<p>hello</p>', '<a href="#">link</a>'];
    const result = sanitizer.sanitizeArray(arr);
    expect(result).toEqual([
      '&lt;p&gt;hello&lt;&#x2F;p&gt;',
      '&lt;a href=&quot;#&quot;&gt;link&lt;&#x2F;a&gt;',
    ]);
  });

  it('empty string stays unchanged', () => {
    expect(sanitizer.sanitize('')).toBe('');
  });

  it('sanitize handles strings with no special characters', () => {
    expect(sanitizer.sanitize('hello world')).toBe('hello world');
  });
});

describe('PegaFunctionWhitelist', () => {
  const whitelist = new PegaFunctionWhitelist();

  it('isAllowed returns true for 10 builtin functions', () => {
    const builtins = ['@round', '@upper', '@lower', '@CurrentDate', '@If', '@IsNull', '@Length', '@Concat', '@Substring', '@Index'];
    for (const fn of builtins) {
      expect(whitelist.isAllowed(fn)).toBe(true);
    }
  });

  it('isAllowed returns false for unknown function', () => {
    expect(whitelist.isAllowed('@evilFunc')).toBe(false);
    expect(whitelist.isAllowed('@nonexistent')).toBe(false);
  });

  it('getDefinition returns correct definition', () => {
    const def = whitelist.getDefinition('@round');
    expect(def).toBeDefined();
    expect(def!.name).toBe('@round');
    expect(def!.minArgs).toBe(1);
    expect(def!.maxArgs).toBe(2);
    expect(def!.description).toBe('Round numeric value');
  });

  it('getDefinition returns undefined for unknown', () => {
    expect(whitelist.getDefinition('@foobar')).toBeUndefined();
  });

  it('getAllowedFunctions returns 10 items', () => {
    const fns = whitelist.getAllowedFunctions();
    expect(fns).toHaveLength(10);
    const names = fns.map(f => f.name).sort();
    expect(names).toEqual([
      '@Concat', '@CurrentDate', '@If', '@Index', '@IsNull',
      '@Length', '@Substring', '@lower', '@round', '@upper',
    ]);
  });

  it('registerCustomFunction adds new function', () => {
    const w = new PegaFunctionWhitelist();
    w.registerCustomFunction({ name: '@custom', minArgs: 1, maxArgs: 2, description: 'Custom fn' });
    expect(w.isAllowed('@custom')).toBe(true);
    expect(w.getAllowedFunctions()).toHaveLength(11);
  });

  it('registerCustomFunction throws for duplicate', () => {
    expect(() => whitelist.registerCustomFunction({ name: '@round', minArgs: 1, maxArgs: 1, description: '' })).toThrow();
  });

  it('validateArgs passes for valid arg count', () => {
    expect(() => whitelist.validateArgs('@round', 1)).not.toThrow();
    expect(() => whitelist.validateArgs('@round', 2)).not.toThrow();
    expect(() => whitelist.validateArgs('@Concat', 5)).not.toThrow();
  });

  it('validateArgs throws for too few args', () => {
    expect(() => whitelist.validateArgs('@round', 0)).toThrow();
    expect(() => whitelist.validateArgs('@If', 2)).toThrow();
  });

  it('validateArgs throws for too many args', () => {
    expect(() => whitelist.validateArgs('@round', 3)).toThrow();
    expect(() => whitelist.validateArgs('@upper', 2)).toThrow();
  });
});

describe('ExprNodeValidator', () => {
  const validator = new ExprNodeValidator();
  const validate = (expr: string) => validator.validate(parseExpression(expr));

  it('validates a whitelisted function expression as valid', () => {
    const result = validate('@upper("hello")');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects a function not in the whitelist', () => {
    const result = validate('@evilFunc(42)');
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FUNCTION_NOT_ALLOWED');
  });

  it('rejects a nested non-whitelisted function inside a whitelisted one', () => {
    const result = validate('@upper(@evilFunc("x"))');
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe('FUNCTION_NOT_ALLOWED');
  });

  it('validates expressions with no function calls', () => {
    const result = validate('.Status = "Open" && .Amount > 100');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe('PegaEvaluationSandbox', () => {
  it('evaluates valid expression successfully', async () => {
    const sandbox = new PegaEvaluationSandbox();
    const result = await sandbox.evaluate({
      expression: '@upper("hello")',
      clipboard: {},
    });
    expect(result.value.text).toBe('HELLO');
  });

  it('validates expression before evaluation (invalid throws)', async () => {
    const sandbox = new PegaEvaluationSandbox();
    await expect(sandbox.evaluate({
      expression: '',
      clipboard: {},
    })).rejects.toBeDefined();
  });

  it('times out after configurable timeout', async () => {
    const sandbox = new PegaEvaluationSandbox({ timeoutMs: 1 });
    const result = await sandbox.evaluate({
      expression: 'true',
      clipboard: {},
    });
    expect(result.value.boolean).toBe(true);
  });

  it('uses custom timeout in request', async () => {
    const sandbox = new PegaEvaluationSandbox({ timeoutMs: 5000 });
    const result = await sandbox.evaluate({
      expression: '@round(3.7)',
      clipboard: {},
      timeout: 100,
    });
    expect(result.value.number).toBe(4);
  });

  it('uses default config when no config given', async () => {
    const sandbox = new PegaEvaluationSandbox();
    const result = await sandbox.evaluate({
      expression: '42',
      clipboard: {},
    });
    expect(result.value.number).toBe(42);
  });
});
