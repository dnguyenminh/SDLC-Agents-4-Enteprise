import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }]
  }
}));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool, getLocalToolDefinitions } from '../backend-local-tools';
import { Base64ProxyService } from '../services/Base64ProxyService';

const TMP_DIR = path.join(__dirname, '.tmp-local-tools');

describe('Backend Local Tools (E2E Tests)', () => {
  beforeAll(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  describe('stream_write_file', () => {
    it('TC-01: Should create a new file and parent directories (mode: write)', async () => {
      const nestedPath = path.join(TMP_DIR, 'nested', 'test1.txt');
      const result = await executeLocalTool('stream_write_file', {
        file_path: nestedPath,
        content: 'Hello World',
        mode: 'write'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Wrote file:');
      const fileContent = fs.readFileSync(nestedPath, 'utf-8');
      expect(fileContent).toBe('Hello World');
    });

    it('TC-02: Should overwrite an existing file (mode: write)', async () => {
      const filePath = path.join(TMP_DIR, 'test2.txt');
      fs.writeFileSync(filePath, 'Old Content');
      const result = await executeLocalTool('stream_write_file', {
        file_path: filePath,
        content: 'New Content',
        mode: 'write'
      });

      expect(result.isError).toBe(false);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('New Content');
    });

    it('TC-03: Should append to an existing file (mode: append)', async () => {
      const filePath = path.join(TMP_DIR, 'test3.txt');
      fs.writeFileSync(filePath, 'Line 1\n');
      const result = await executeLocalTool('stream_write_file', {
        file_path: filePath,
        content: 'Line 2',
        mode: 'append'
      });

      expect(result.isError).toBe(false);
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      expect(fileContent).toBe('Line 1\nLine 2');
    });

    it('TC-04: Should return PATH_EMPTY for missing file_path (SA4E-356 AD-12)', async () => {
      // PathResolver is the single validation point for file_path — the legacy
      // "'file_path' and 'content' required." text for a missing path is
      // intentionally replaced by PATH_EMPTY (E-4).
      const result = await executeLocalTool('stream_write_file', {
        content: 'Hello',
        mode: 'write'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('PATH_EMPTY:');
    });

    it('TC-05: Should write via absolute path (handler runs in cwd_fallback under vitest)', async () => {
      // NOTE: require("vscode") cannot see the vitest alias mock, so handlers
      // always run with rootSource=cwd_fallback here; workspace-relative
      // resolution is covered in services/__tests__/path-resolver.test.ts.
      // An absolute path passes through (DISC-1) and writes normally.
      const absPath = path.join(TMP_DIR, 'tc05-abs.txt');
      const result = await executeLocalTool('stream_write_file', {
        file_path: absPath,
        content: 'Absolute content',
        mode: 'write'
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Wrote file:');
      const fileContent = fs.readFileSync(absPath, 'utf-8');
      expect(fileContent).toBe('Absolute content');
    });

    it('TC-06: Should reject relative path with PATH_NO_WORKSPACE when no workspace (BR-06b)', async () => {
      // Same require-mock note as TC-05: no workspace is visible here, so a
      // relative path must fail loud (BR-06b) instead of landing in the Kiro
      // install dir.
      const result = await executeLocalTool('stream_write_file', {
        file_path: 'rel-test-unit.txt',
        content: 'Unit test content',
        mode: 'write'
      });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('PATH_NO_WORKSPACE:');
    });

    // SA4E-356 DISC-1 (BA-acked behavior change): with no workspace visible
    // (always the case under vitest — see TC-05 note), containment does NOT
    // apply on cwd_fallback, so an absolute path outside process.cwd() passes
    // through and writes normally. Unit-level containment is covered in
    // services/__tests__/path-resolver.test.ts (T3/T3b, 100% branches).
    it('TC-07: Absolute path outside cwd passes on fallback (DISC-1)', async () => {
      const outsidePath = path.resolve(process.cwd(), '..', 'sa4e-tc07-outside-workspace.txt');
      try {
        const result = await executeLocalTool('stream_write_file', {
          file_path: outsidePath,
          content: 'Fallback passthrough',
          mode: 'write'
        });

        expect(result.isError).toBe(false);
        expect(result.content[0].text).toContain('Wrote file:');
        expect(fs.readFileSync(outsidePath, 'utf-8')).toBe('Fallback passthrough');
      } finally {
        if (fs.existsSync(outsidePath)) fs.unlinkSync(outsidePath);
      }
    });
  });

  describe('embed_image', () => {
    it('TC-05: Should inline a local PNG image as base64 data URI', async () => {
      const imgPath = path.join(TMP_DIR, 'dummy.png');
      fs.writeFileSync(imgPath, Buffer.from('dummy-image-data'));
      const mdPath = path.join(TMP_DIR, 'doc.md');
      fs.writeFileSync(mdPath, 'Check this image: ![Alt Text](dummy.png "Title")');

      const result = await executeLocalTool('embed_image', { file_path: mdPath });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Embedded 1 image(s)');
      const outPath = path.join(TMP_DIR, 'doc-embedded.md');
      expect(fs.existsSync(outPath)).toBe(true);
      const outContent = fs.readFileSync(outPath, 'utf-8');
      const base64Data = Buffer.from('dummy-image-data').toString('base64');
      expect(outContent).toContain(`![Alt Text](data:image/png;base64,${base64Data} "Title")`);
    });

    it('TC-06: Should skip remote URLs and data URIs', async () => {
      const mdPath = path.join(TMP_DIR, 'remote.md');
      const content = '![Remote](http://example.com/img.png) ![Data](data:image/jpeg;base64,123)';
      fs.writeFileSync(mdPath, content);
      const result = await executeLocalTool('embed_image', { file_path: mdPath });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('skipped 2');
      const outPath = path.join(TMP_DIR, 'remote-embedded.md');
      const outContent = fs.readFileSync(outPath, 'utf-8');
      expect(outContent).toBe(content);
    });

    it('TC-07: Should skip missing local images without crashing', async () => {
      const mdPath = path.join(TMP_DIR, 'missing.md');
      const content = '![Missing](not-found.png)';
      fs.writeFileSync(mdPath, content);
      const result = await executeLocalTool('embed_image', { file_path: mdPath });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('skipped 1');
      const outPath = path.join(TMP_DIR, 'missing-embedded.md');
      const outContent = fs.readFileSync(outPath, 'utf-8');
      expect(outContent).toBe(content);
    });
  });

  describe('getLocalToolDefinitions', () => {
    it('TC-10: Should return schemas for local tools', () => {
      const defs = getLocalToolDefinitions();
      expect(defs.length).toBe(2);
      expect(defs.map(d => d.name)).toEqual(['stream_write_file', 'embed_image']);
    });
  });

  describe('Unknown Tool Fallback', () => {
    it('TC-11: Should return an error for unknown local tools', async () => {
      const result = await executeLocalTool('unknown_tool', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Local tool 'unknown_tool' not implemented");
    });
  });
});

describe('Base64ProxyService', () => {
  let service: Base64ProxyService;

  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
    service = new Base64ProxyService();
    service.detectFromToolList([
      {
        name: 'drawio_export_png',
        description: 'Export drawio to PNG. Returns output_base64 field.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            content_base64: { type: 'string', description: 'Base64 file content' },
          },
          required: ['content_base64'],
        },
      },
      {
        name: 'mem_ingest_file',
        description: 'Ingest a file into memory.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            content_base64: { type: 'string', description: 'Base64 encoded file content' },
          },
          required: ['content_base64'],
        },
      },
      {
        name: 'code_search',
        description: 'Search code in the project.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
        },
      },
    ]);
  });

  afterAll(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
  });

  it('TC-12: Should auto-detect input proxy tools from schema', () => {
    expect(service.needsInputProxy('drawio_export_png')).toBe(true);
    expect(service.needsInputProxy('mem_ingest_file')).toBe(true);
    expect(service.needsInputProxy('code_search')).toBe(false);
  });

  it('TC-13: Should auto-detect output proxy tools from description', () => {
    expect(service.needsOutputProxy('drawio_export_png')).toBe(true);
    expect(service.needsOutputProxy('mem_ingest_file')).toBe(false);
    expect(service.needsOutputProxy('code_search')).toBe(false);
  });

  it('TC-14: proxyInput reads file and injects content_base64', () => {
    const filePath = path.join(TMP_DIR, 'proxy-input.txt');
    fs.writeFileSync(filePath, 'hello proxy');
    const result = service.proxyInput('drawio_export_png', { file_path: filePath });
    expect(result.content_base64).toBe(Buffer.from('hello proxy').toString('base64'));
    expect(result.file_path).toBe(filePath);
  });

  it('TC-15: proxyInput throws on missing file', () => {
    expect(() => {
      service.proxyInput('drawio_export_png', { file_path: '/nonexistent.drawio' });
    }).toThrow(/Failed to read file/);
  });

  it('TC-44: proxyInput resolves relative file_path against the workspace root (D2 regression)', () => {
    const rooted = new Base64ProxyService(TMP_DIR);
    rooted.detectFromToolList([
      {
        name: 'drawio_export_png',
        description: 'Export drawio to PNG. Returns output_base64 field.',
        inputSchema: {
          type: 'object',
          properties: { file_path: { type: 'string' }, content_base64: { type: 'string' } },
          required: ['content_base64'],
        },
      },
    ]);
    fs.writeFileSync(path.join(TMP_DIR, 'rel-input.txt'), 'relative hello');
    const result = rooted.proxyInput('drawio_export_png', { file_path: 'rel-input.txt' });
    expect(result.content_base64).toBe(Buffer.from('relative hello').toString('base64'));
    // Absolute paths stay unchanged
    const abs = path.join(TMP_DIR, 'rel-input.txt');
    const absResult = rooted.proxyInput('drawio_export_png', { file_path: abs });
    expect(absResult.file_path).toBe(abs);
    // Missing relative file reports the workspace-resolved path
    expect(() => rooted.proxyInput('drawio_export_png', { file_path: 'nope.txt' }))
      .toThrow(new RegExp(`Failed to read file ${path.join(TMP_DIR, 'nope.txt').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  });

  it('TC-45: proxyOutput resolves relative output_path against the workspace root (D2 regression)', () => {
    const rooted = new Base64ProxyService(TMP_DIR);
    rooted.detectFromToolList([
      {
        name: 'drawio_export_png',
        description: 'Export drawio to PNG. Returns output_base64 field.',
        inputSchema: {
          type: 'object',
          properties: { file_path: { type: 'string' } },
          required: [],
        },
      },
    ]);
    const b64 = Buffer.from('ROOTED-PNG').toString('base64');
    const mockResult = { content: [{ type: 'text', text: JSON.stringify({ output_base64: b64 }) }] };
    const result = rooted.proxyOutput(
      'drawio_export_png',
      { file_path: 'rel-input.drawio' },
      mockResult
    );
    const expectedOut = path.join(TMP_DIR, 'rel-input.png');
    expect(fs.existsSync(expectedOut)).toBe(true);
    expect(fs.readFileSync(expectedOut).toString()).toBe('ROOTED-PNG');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.file_path).toBe(expectedOut);
  });

  it('TC-16: proxyInput passes through if tool not in set', () => {
    const args = { query: 'test' };
    const result = service.proxyInput('code_search', args);
    expect(result).toBe(args);
  });

  it('TC-17: proxyOutput writes base64 to file', () => {
    const outPath = path.join(TMP_DIR, 'output.png');
    const b64 = Buffer.from('PNG data').toString('base64');
    const mockResult = { content: [{ type: 'text', text: JSON.stringify({ output_base64: b64 }) }] };
    const result = service.proxyOutput(
      'drawio_export_png',
      { file_path: path.join(TMP_DIR, 'input.drawio'), output_path: outPath },
      mockResult
    );
    expect(fs.existsSync(outPath)).toBe(true);
    expect(fs.readFileSync(outPath).toString()).toBe('PNG data');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.file_path).toBe(outPath);
    expect(parsed.output_base64).toBeUndefined();
  });

  it('TC-18: rewriteSchemasForLlm hides content_base64, adds output_path', () => {
    const tools = service.rewriteSchemasForLlm([
      {
        name: 'drawio_export_png',
        description: 'Export. Returns output_base64.',
        inputSchema: {
          type: 'object',
          properties: {
            file_path: { type: 'string' },
            content_base64: { type: 'string' },
          },
          required: ['content_base64'],
        },
      },
    ]);
    const schema = tools[0].inputSchema!;
    const props = schema.properties as Record<string, any>;
    expect(props.content_base64).toBeUndefined();
    expect(props.file_path).toBeDefined();
    expect(props.output_path).toBeDefined();
    expect((schema.required as string[])).toContain('file_path');
    expect((schema.required as string[])).not.toContain('content_base64');
  });

  it('TC-19: unwrapDynamicTool extracts nested toolName and arguments', () => {
    const result = service.unwrapDynamicTool({
      toolName: 'drawio_export_png',
      arguments: { file_path: '/test.drawio' },
    });
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe('drawio_export_png');
    expect(result!.innerArgs.file_path).toBe('/test.drawio');
  });

  it('TC-20: unwrapDynamicTool handles tool_name variant', () => {
    const result = service.unwrapDynamicTool({
      tool_name: 'mem_ingest_file',
      args: { file_path: '/data.txt' },
    });
    expect(result).not.toBeNull();
    expect(result!.toolName).toBe('mem_ingest_file');
    expect(result!.innerArgs.file_path).toBe('/data.txt');
  });

  it('TC-21: unwrapDynamicTool returns null for missing toolName', () => {
    const result = service.unwrapDynamicTool({ random: 'data' });
    expect(result).toBeNull();
  });
});

describe('stream_write_file SA4E-356 envelopes (STC IT-01, IT-07, UT-14)', () => {
  // STC: IT-01 — write + append via absolute paths (handler runs in
  // cwd_fallback under vitest; workspace-relative is unit-covered).
  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  it('INT-1: writes and appends with preserved success text', async () => {
    const filePath = path.join(TMP_DIR, 'int1-note.md');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    const w: any = await executeLocalTool('stream_write_file', {
      file_path: filePath, content: 'Line 1\n', mode: 'write',
    });
    expect(w.isError).toBe(false);
    expect(w.content[0].text).toContain('Wrote file:');
    const a: any = await executeLocalTool('stream_write_file', {
      file_path: filePath, content: 'Line 2', mode: 'append',
    });
    expect(a.isError).toBe(false);
    expect(a.content[0].text).toContain('Appended to:');
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('Line 1\nLine 2');
  });

  it('INT-1 alias: args.path resolves through the same helper (SEC-08b)', async () => {
    const filePath = path.join(TMP_DIR, 'int1-alias.md');
    const r: any = await executeLocalTool('stream_write_file', {
      path: filePath, content: 'alias ok', mode: 'write',
    });
    expect(r.isError).toBe(false);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('alias ok');
  });

  // STC: IT-07 — Format 1 fallback variant (fallback root + open-workspace hint).
  it('TC-ERR-01: missing file read yields Format 1 with resolved path', async () => {
    const missing = path.join(TMP_DIR, 'int1-missing.md');
    if (fs.existsSync(missing)) fs.unlinkSync(missing);
    const r: any = await executeLocalTool('embed_image', { file_path: missing });
    expect(r.isError).toBe(true);
    expect(r.content[0].text.startsWith('FILE_NOT_FOUND:')).toBe(true);
    expect(r.content[0].text).toContain(missing);
    expect(r.content[0].text).toContain('Resolved against');
  });

  // STC: UT-14 — 10 MB content cap fails loud BEFORE write; nothing created.
  it('T-size: content over 10 MB is refused before resolve/write', async () => {
    const target = path.join(TMP_DIR, 'int1-too-big.md');
    if (fs.existsSync(target)) fs.unlinkSync(target);
    const big = 'x'.repeat(10 * 1024 * 1024 + 1);
    const r: any = await executeLocalTool('stream_write_file', {
      file_path: target, content: big, mode: 'write',
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('FS_ERROR: payload too large (limit 10 MB)');
    expect(fs.existsSync(target)).toBe(false);
  });

  it('T-size: content of exactly 10 MB is accepted (boundary)', async () => {
    const target = path.join(TMP_DIR, 'int1-exact-10mb.md');
    try {
      const exact = 'y'.repeat(10 * 1024 * 1024);
      const r: any = await executeLocalTool('stream_write_file', {
        file_path: target, content: exact, mode: 'write',
      });
      expect(r.isError).toBe(false);
      expect(fs.statSync(target).size).toBe(10 * 1024 * 1024);
    } finally {
      if (fs.existsSync(target)) fs.unlinkSync(target);
    }
  });

  it('NUL file_path is rejected with PATH_INVALID (T8-ext at tool level)', async () => {
    const r: any = await executeLocalTool('stream_write_file', {
      file_path: 'a\0b.md', content: 'x', mode: 'write',
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('PATH_INVALID:');
  });
});

describe('embed_image SA4E-356 (STC IT-02, IT-09, UT-13)', () => {
  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  // STC: IT-02 — baseDir fix: refs resolve against dirname(RESOLVED input).
  it('INT-2: embeds via resolved baseDir next to the input', async () => {
    const imgPath = path.join(TMP_DIR, 'int2-img.png');
    fs.writeFileSync(imgPath, Buffer.from('int2-image-data'));
    const mdPath = path.join(TMP_DIR, 'int2-doc.md');
    fs.writeFileSync(mdPath, 'See: ![Alt](int2-img.png)');
    const r: any = await executeLocalTool('embed_image', { file_path: mdPath });
    expect(r.isError).toBe(false);
    const outPath = path.join(TMP_DIR, 'int2-doc-embedded.md');
    expect(fs.existsSync(outPath)).toBe(true);
    const out = fs.readFileSync(outPath, 'utf-8');
    expect(out).toContain(`data:image/png;base64,${Buffer.from('int2-image-data').toString('base64')}`);
  });

  it('INT-2: explicit absolute output_path is honored', async () => {
    const imgPath = path.join(TMP_DIR, 'int2b-img.png');
    fs.writeFileSync(imgPath, Buffer.from('b'));
    const mdPath = path.join(TMP_DIR, 'int2b-doc.md');
    fs.writeFileSync(mdPath, 'See: ![A](int2b-img.png)');
    const outPath = path.join(TMP_DIR, 'out', 'custom.md');
    const r: any = await executeLocalTool('embed_image', { file_path: mdPath, output_path: outPath });
    expect(r.isError).toBe(false);
    expect(fs.existsSync(outPath)).toBe(true);
  });

  it('INT-2: relative output_path is rejected on fallback (BR-06b for outputs)', async () => {
    const mdPath = path.join(TMP_DIR, 'int2c-doc.md');
    fs.writeFileSync(mdPath, 'hi');
    const r: any = await executeLocalTool('embed_image', {
      file_path: mdPath, output_path: 'out/rel.md',
    });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('PATH_NO_WORKSPACE:');
  });

  // STC: UT-13 — per-ref containment at unit level (fail-closed skip).
  // PROOF shape: the outside refs point at REAL files outside the root — a
  // skip then proves containment (not a missing-file skip).
  it('T-SEC01: outside refs are skipped verbatim, in-root refs embedded', async () => {
    const caseDir = path.join(TMP_DIR, 'sec01');
    const imgDir = path.join(caseDir, 'img');
    fs.mkdirSync(imgDir, { recursive: true });
    fs.writeFileSync(path.join(imgDir, 'a.png'), Buffer.from('inner'));
    // Real files OUTSIDE the root (TMP_DIR): absolute + relative-escape.
    const outsideAbs = path.join(os.tmpdir(), 'sa4e-356-sec01-outside.png');
    fs.writeFileSync(outsideAbs, Buffer.from('outside'));
    const escapeName = 'sa4e-356-sec01-escape.png';
    const escapeAbs = path.join(path.dirname(TMP_DIR), escapeName);
    fs.writeFileSync(escapeAbs, Buffer.from('escape'));
    try {
      const md = [
        '![ok](./img/a.png)',
        `![abs](${outsideAbs})`,
        `![esc](../../${escapeName})`,
        '![missing](./img/not-here.png)',
      ].join('\n');
      const { embedMarkdownImages } = await import('../backend-local-tools');
      const { output, embedded, skipped } = embedMarkdownImages(md, caseDir, TMP_DIR);
      expect(embedded).toBe(1);
      expect(skipped).toBe(3);
      expect(output).toContain(`![abs](${outsideAbs})`);
      expect(output).toContain(`![esc](../../${escapeName})`);
      expect(output).toContain('data:image/png;base64,');
    } finally {
      fs.unlinkSync(outsideAbs);
      fs.unlinkSync(escapeAbs);
    }
  });

  // STC: IT-09 — same expectation at tool level with a malicious markdown.
  // Handler root here is process.cwd() (fallback; TMP_DIR sits inside it), so
  // the absolute-outside ref (a REAL file in os.tmpdir) proves containment.
  it('IT-09: handler keeps outside refs verbatim and embeds in-root', async () => {
    const caseDir = path.join(TMP_DIR, 'it09');
    const imgDir = path.join(caseDir, 'img');
    fs.mkdirSync(imgDir, { recursive: true });
    fs.writeFileSync(path.join(imgDir, 'ok.png'), Buffer.from('ok-bytes'));
    const outsideAbs = path.join(os.tmpdir(), 'sa4e-356-it09-outside.png');
    fs.writeFileSync(outsideAbs, Buffer.from('outside-bytes'));
    const mdPath = path.join(caseDir, 'doc.md');
    fs.writeFileSync(
      mdPath,
      ['![ok](./img/ok.png)', `![abs](${outsideAbs})`, '![esc](../../it09-missing.png)'].join('\n'),
    );
    const r: any = await executeLocalTool('embed_image', { file_path: mdPath });
    expect(r.isError).toBe(false);
    const out = fs.readFileSync(path.join(caseDir, 'doc-embedded.md'), 'utf-8');
    expect(out).toContain('data:image/png;base64,');
    expect(out).toContain(`![abs](${outsideAbs})`);
    expect(out).toContain('![esc](../../it09-missing.png)');
    fs.unlinkSync(outsideAbs);
  });
});

describe('checkSymlinkGuard (STC IT-10 SQ-1 guard unit, SEC-03)', () => {
  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  it('passes normal in-root paths', async () => {
    const { checkSymlinkGuard } = await import('../backend-local-tools');
    const target = path.join(TMP_DIR, 'sq1-normal.md');
    fs.writeFileSync(target, 'x');
    expect(
      checkSymlinkGuard({ ok: true, resolvedPath: target, rootSource: 'workspace', rootPath: TMP_DIR }, target),
    ).toBeNull();
  });

  it('skips the guard on cwd_fallback (no boundary there)', async () => {
    const { checkSymlinkGuard } = await import('../backend-local-tools');
    expect(
      checkSymlinkGuard(
        { ok: true, resolvedPath: '/elsewhere/x.md', rootSource: 'cwd_fallback', rootPath: process.cwd() },
        '/elsewhere/x.md',
      ),
    ).toBeNull();
  });

  it('reports FS_ERROR when the parent is missing', async () => {
    const { checkSymlinkGuard } = await import('../backend-local-tools');
    const target = path.join(TMP_DIR, 'sq1-no-such-dir', 'x.md');
    const err = checkSymlinkGuard(
      { ok: true, resolvedPath: target, rootSource: 'workspace', rootPath: TMP_DIR },
      target,
    );
    expect(err).toContain('FS_ERROR: Failed to resolve parent dir');
  });

  // STC: IT-10 — symlink escape blocked, internal link passes. Graceful skip
  // when the OS/user forbids symlink creation (N-QA3).
  it('blocks symlink escapes but passes internal links (or skips gracefully)', async () => {
    const { checkSymlinkGuard } = await import('../backend-local-tools');
    const caseDir = path.join(TMP_DIR, 'sq1-links');
    const outsideDir = path.join(TMP_DIR, '..', 'sa4e-356-sq1-outside');
    try {
      fs.mkdirSync(caseDir, { recursive: true });
      fs.mkdirSync(outsideDir, { recursive: true });
      fs.writeFileSync(path.join(outsideDir, 'secret.md'), 'secret');
      fs.writeFileSync(path.join(caseDir, 'inner.md'), 'inner');
    } catch {
      console.warn('SQ-1 SKIPPED: fixture setup unavailable');
      return;
    }
    let linkOut: string;
    let linkIn: string;
    try {
      linkOut = path.join(caseDir, 'link-out');
      linkIn = path.join(caseDir, 'link-in.md');
      const type = process.platform === 'win32' ? 'junction' : undefined;
      try {
        (fs as any).symlinkSync(outsideDir, linkOut, type as any);
      } catch {
        // Junction fallback for the dir link on Windows without privilege.
        (fs as any).symlinkSync(outsideDir, linkOut, 'junction');
      }
      fs.symlinkSync(path.join(caseDir, 'inner.md'), linkIn);
    } catch (err: any) {
      console.warn(`SQ-1 SKIPPED: symlink creation unavailable (${err?.message ?? err})`);
      return;
    }
    try {
      // (a) read via outward link → blocked by the parent-realpath re-check.
      const viaOut = path.join(linkOut, 'secret.md');
      const blocked = checkSymlinkGuard(
        { ok: true, resolvedPath: viaOut, rootSource: 'workspace', rootPath: TMP_DIR },
        viaOut,
      );
      expect(blocked).toContain('PATH_REJECTED_OUTSIDE_WORKSPACE:');
      // (b) internal link → passes (node_modules/.bin-style use intact).
      const inner = fs.realpathSync(linkIn);
      expect(
        checkSymlinkGuard(
          { ok: true, resolvedPath: linkIn, rootSource: 'workspace', rootPath: TMP_DIR },
          linkIn,
        ),
      ).toBeNull();
      expect(inner.startsWith(TMP_DIR)).toBe(true);
    } finally {
      fs.rmSync(caseDir, { recursive: true, force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});

describe('Base64ProxyService SA4E-356 (provider mode + T-size)', () => {
  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  it('provider mode matches string mode (TDD §5.5 parity)', () => {
    const filePath = path.join(TMP_DIR, 'parity.txt');
    fs.writeFileSync(filePath, 'parity-bytes');
    const tools = [
      {
        name: 'drawio_export_png',
        description: 'Export drawio to PNG. Returns output_base64 field.',
        inputSchema: {
          type: 'object',
          properties: { file_path: { type: 'string' }, content_base64: { type: 'string' } },
          required: ['content_base64'],
        },
      },
    ];
    const fromString = new Base64ProxyService(TMP_DIR);
    fromString.detectFromToolList(tools);
    const fromProvider = new Base64ProxyService(() => TMP_DIR);
    fromProvider.detectFromToolList(tools);
    // Relative resolves under TMP_DIR in both modes (provider is live).
    expect(fromProvider.proxyInput('drawio_export_png', { file_path: 'parity.txt' }).content_base64)
      .toBe(fromString.proxyInput('drawio_export_png', { file_path: 'parity.txt' }).content_base64);
    expect(fromProvider.proxyInput('drawio_export_png', { file_path: filePath }).file_path).toBe(filePath);
  });

  // STC: UT-14 — 25 MB pre-read cap fails loud with a slice hint.
  it('T-size: pre-read over 25 MB is refused with FS_ERROR + hint', () => {
    const big = path.join(TMP_DIR, 'oversize.bin');
    fs.writeFileSync(big, Buffer.alloc(25 * 1024 * 1024 + 1));
    try {
      const svc = new Base64ProxyService(TMP_DIR);
      svc.detectFromToolList([
        {
          name: 'drawio_export_png',
          description: 'Export drawio to PNG. Returns output_base64 field.',
          inputSchema: {
            type: 'object',
            properties: { file_path: { type: 'string' }, content_base64: { type: 'string' } },
            required: ['content_base64'],
          },
        },
      ]);
      expect(() => svc.proxyInput('drawio_export_png', { file_path: big })).toThrow(
        /FS_ERROR: file too large for proxy pre-read \(limit 25 MB\)/,
      );
    } finally {
      fs.unlinkSync(big);
    }
  });

  it('T-size: pre-read of exactly 25 MB succeeds (boundary)', () => {
    const exact = path.join(TMP_DIR, 'exact25.bin');
    fs.writeFileSync(exact, Buffer.alloc(25 * 1024 * 1024));
    try {
      const svc = new Base64ProxyService(TMP_DIR);
      svc.detectFromToolList([
        {
          name: 'drawio_export_png',
          description: 'Export drawio to PNG. Returns output_base64 field.',
          inputSchema: {
            type: 'object',
            properties: { file_path: { type: 'string' }, content_base64: { type: 'string' } },
            required: ['content_base64'],
          },
        },
      ]);
      const out = svc.proxyInput('drawio_export_png', { file_path: exact });
      expect(typeof out.content_base64).toBe('string');
    } finally {
      fs.unlinkSync(exact);
    }
  });
});
