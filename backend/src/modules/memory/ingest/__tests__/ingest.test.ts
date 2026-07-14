import { describe, it, expect } from 'vitest';
import { classifyFormat, normalizeExt } from '../FormatClassifier.js';
import { ConvertToolResolver, buildQuery, selectBestTool, extractMarkdown } from '../ConvertToolResolver.js';
import type { OrchestrationGateway, ToolDescriptor } from '../OrchestrationGateway.js';
import { NullOrchestrationGateway } from '../OrchestrationGateway.js';

describe('FormatClassifier', () => {
  it('classifies markdown', () => {
    expect(classifyFormat({ filePath: 'a/BRD.md' })).toBe('markdown');
    expect(classifyFormat({ filePath: 'a/x.markdown' })).toBe('markdown');
  });
  it('classifies text formats', () => {
    for (const f of ['x.txt', 'x.csv', 'x.json', 'x.yaml', 'x.yml', 'x.xml', 'x.log']) {
      expect(classifyFormat({ filePath: f })).toBe('text');
    }
    expect(classifyFormat({ filePath: 'x.unknown', mime: 'text/plain' })).toBe('text');
  });
  it('classifies binary formats', () => {
    for (const f of ['x.docx', 'x.xlsx', 'x.xls', 'x.pdf', 'x.png', 'x.jpg']) {
      expect(classifyFormat({ filePath: f })).toBe('binary');
    }
  });
  it('normalizeExt lowercases with dot', () => {
    expect(normalizeExt('X.DOCX')).toBe('.docx');
  });
});

describe('ConvertToolResolver helpers', () => {
  it('buildQuery maps ext to query', () => {
    expect(buildQuery('.docx')).toContain('docx');
    expect(buildQuery('.xlsx')).toContain('excel');
    expect(buildQuery('.png')).toContain('image');
    expect(buildQuery('.pdf')).toContain('pdf');
  });
  it('selectBestTool prefers ext/convert match', () => {
    const tools: ToolDescriptor[] = [
      { name: 'other_tool', description: 'x' },
      { name: 'docx_to_markdown', description: 'convert docx' },
    ];
    expect(selectBestTool(tools, '.docx').name).toBe('docx_to_markdown');
  });
  it('extractMarkdown handles raw and json', () => {
    expect(extractMarkdown('# hello')).toBe('# hello');
    expect(extractMarkdown('{"markdown":"# md"}')).toBe('# md');
    expect(extractMarkdown('{"content":"c"}')).toBe('c');
  });
});

function gatewayWith(tools: ToolDescriptor[], exec: (n: string, a: any) => Promise<string>): OrchestrationGateway {
  return { findTools: async () => tools, executeDynamicTool: exec };
}

describe('ConvertToolResolver.resolve', () => {
  const req = { filePath: '/abs/x.docx', ext: '.docx' };

  it('no-tool when gateway returns empty', async () => {
    const r = new ConvertToolResolver(new NullOrchestrationGateway());
    const res = await r.resolve(req);
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.reason).toBe('no-tool'); }
  });

  it('success when tool returns markdown', async () => {
    const gw = gatewayWith([{ name: 'docx_md', description: 'convert docx' }], async () => '# converted');
    const res = await new ConvertToolResolver(gw).resolve(req);
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.markdown).toBe('# converted'); expect(res.toolName).toBe('docx_md'); }
  });

  it('convert-failed when tool throws', async () => {
    const gw = gatewayWith([{ name: 'docx_md', description: 'x' }], async () => { throw new Error('boom'); });
    const res = await new ConvertToolResolver(gw).resolve(req);
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.reason).toBe('convert-failed'); }
  });

  it('empty-result when tool returns blank', async () => {
    const gw = gatewayWith([{ name: 'docx_md', description: 'x' }], async () => '   ');
    const res = await new ConvertToolResolver(gw).resolve(req);
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.reason).toBe('empty-result'); }
  });

  it('timeout when tool exceeds limit', async () => {
    const gw = gatewayWith([{ name: 'docx_md', description: 'x' }],
      () => new Promise<string>((resolve) => setTimeout(() => resolve('# late'), 50)));
    const res = await new ConvertToolResolver(gw, 10).resolve(req);
    expect(res.ok).toBe(false);
    if (!res.ok) { expect(res.reason).toBe('timeout'); }
  });
});
