import { describe, it, expect, beforeAll, vi } from 'vitest';
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }]
  }
}));
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { executeLocalTool } from '../backend-local-tools';
import { TMP_DIR } from './backend-local-tools.fixtures';

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
