/**
 * SA4E-419 — chunker tests: skeleton/body separation, embed-text no-body rule,
 * token counts, external signature-only, retrieved-context budget (§5 + §4).
 */

import { describe, it, expect } from 'vitest';
import {
  assembleRetrievedContext,
  chunkFile,
  embeddingText,
  type ChunkSymbolInput,
} from '../ast-chunker.js';

const SOURCE = [
  'import { OrderDto } from "./dto";',
  'export class PaymentService {',
  '  /** Thực hiện trừ tiền. */',
  '  processTransaction(order: OrderDto): Receipt {',
  '    const validated = validator.validate(order);',
  '    return stripe.charge(validated);',
  '  }',
  '  cancel(id: string): void {',
  '    history.push(id);',
  '  }',
  '}',
].join('\n');

const SYMBOLS: ChunkSymbolInput[] = [
  { id: 'sym-class', name: 'PaymentService', kind: 'class', signature: 'class PaymentService', docComment: null,
    startLine: 2, endLine: 11, parentId: null, sfrId: 'f1', isExternal: false },
  { id: 'sym-proc', name: 'processTransaction', kind: 'method', signature: 'processTransaction(order: OrderDto): Receipt',
    docComment: 'Thực hiện trừ tiền, gọi cổng thanh toán và lưu lịch sử.', startLine: 4, endLine: 7,
    parentId: 'sym-class', sfrId: 'f1', isExternal: false },
  { id: 'sym-cancel', name: 'cancel', kind: 'method', signature: 'cancel(id: string): void', docComment: null,
    startLine: 8, endLine: 10, parentId: 'sym-class', sfrId: 'f1', isExternal: false },
];

const DEPS = new Map([
  ['sym-proc', { imports: ['OrderDto'], calls: ['Validator#validate', 'StripeClient#charge'], refs_types: ['OrderDto', 'Receipt'] }],
  ['sym-cancel', { imports: [], calls: ['History#push'], refs_types: [] }],
]);

function chunks() {
  return chunkFile({ filePath: 'src/service/PaymentService.java', source: SOURCE, symbols: SYMBOLS, depsBySymbolId: DEPS });
}

describe('SA4E-419 AST chunker — skeleton/body separation', () => {
  it('produces 1 skeleton (class) + 2 body (methods) chunks', () => {
    const cs = chunks();
    expect(cs.filter((c) => c.type === 'SKELETON')).toHaveLength(1);
    expect(cs.filter((c) => c.type === 'BODY')).toHaveLength(2);
    const skeleton = cs.find((c) => c.type === 'SKELETON')!;
    expect(skeleton.skeleton).toContain('class PaymentService {');
    expect(skeleton.skeleton).toContain('processTransaction(order: OrderDto): Receipt;');
    expect(skeleton.skeleton).not.toContain('stripe.charge');
  });

  it('body chunk carries the full method source slice + rng', () => {
    const proc = chunks().find((c) => c.name === 'processTransaction' && c.type === 'BODY')!;
    expect(proc.body).toContain('validator.validate(order)');
    expect(proc.body).toContain('stripe.charge(validated)');
    expect(proc.rng).toEqual([4, 7]);
    expect(proc.id).toBe('PaymentService#processTransaction');
  });

  it('dependency subgraph attached per chunk (imports/calls/refs_types)', () => {
    const proc = chunks().find((c) => c.name === 'processTransaction')!;
    expect(proc.deps.imports).toEqual(['OrderDto']);
    expect(proc.deps.calls).toEqual(['Validator#validate', 'StripeClient#charge']);
    expect(proc.deps.refs_types).toEqual(['OrderDto', 'Receipt']);
  });

  it('token counts tracked per chunk (sig/skeleton/body)', () => {
    const proc = chunks().find((c) => c.name === 'processTransaction' && c.type === 'BODY')!;
    expect(proc.tokens.sig_tokens).toBeGreaterThan(0);
    expect(proc.tokens.body_tokens).toBeGreaterThan(0);
    const skeleton = chunks().find((c) => c.type === 'SKELETON')!;
    expect(skeleton.tokens.skeleton_tokens).toBeGreaterThan(0);
    expect(skeleton.tokens.body_tokens).toBe(0); // skeleton hides bodies
  });

  it('external symbols: signature-only chunk, no body (AC)', () => {
    const ext: ChunkSymbolInput = {
      id: 'ext-stripe', name: 'StripeClient', kind: 'interface', signature: 'interface StripeClient',
      docComment: null, startLine: 0, endLine: 0, parentId: null, sfrId: null, isExternal: true,
    };
    const cs = chunkFile({ filePath: '<external>', source: '', symbols: [ext], depsBySymbolId: new Map() });
    expect(cs).toHaveLength(1);
    expect(cs[0].type).toBe('EXTERNAL_SIGNATURE');
    expect(cs[0].body).toBe('');
    expect(cs[0].skeleton).toBe('interface StripeClient;');
  });

  it('embeddingText = [fp]+[sig]+[doc]+[deps.calls] — body NEVER included (AC)', () => {
    const proc = chunks().find((c) => c.name === 'processTransaction' && c.type === 'BODY')!;
    const text = embeddingText(proc);
    expect(text).toContain('src/service/PaymentService.java');
    expect(text).toContain('processTransaction(order: OrderDto): Receipt');
    expect(text).toContain('Thực hiện trừ tiền');
    expect(text).toContain('calls: Validator#validate, StripeClient#charge');
    expect(text).not.toContain('stripe.charge(validated)'); // body excluded
    expect(text).not.toContain('const validated');
  });
});

describe('SA4E-419 retrieved-context budget (~8,000 tokens, §4)', () => {
  it('assembles skeleton + bodies within budget; overflow truncated', () => {
    const many: ChunkSymbolInput[] = Array.from({ length: 40 }, (_, i) => ({
      id: `m${i}`, name: `method${i}`, kind: 'method', signature: `method${i}(a: string): void`,
      docComment: null, startLine: i * 10 + 1, endLine: i * 10 + 9, parentId: 'cls', sfrId: 'f1', isExternal: false,
    }));
    const bigSource = Array.from({ length: 400 }, (_, i) => `line ${i} = ${'payload'.repeat(3)}`).join('\n');
    const cs = chunkFile({ filePath: 'src/big.ts', source: bigSource, symbols: many, depsBySymbolId: new Map() });
    const ranked = [...cs, ...cs, ...cs, ...cs]; // ×4 to force budget overflow at 8,000 tokens
    const ctx = assembleRetrievedContext(ranked, 8000);
    expect(ctx.tokens).toBeLessThanOrEqual(8000);
    expect(ctx.truncated).toBe(true);
    expect(ctx.includedChunkIds.length).toBeGreaterThan(0);
    expect(ctx.includedChunkIds.length).toBeLessThan(ranked.length);
    const tight = assembleRetrievedContext(ranked, 50);
    expect(tight.tokens).toBeLessThanOrEqual(50);
    expect(tight.includedChunkIds).toHaveLength(0);
  });
});
