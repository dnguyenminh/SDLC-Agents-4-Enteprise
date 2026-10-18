import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }]
  }
}));
import * as fs from 'fs';
import * as path from 'path';
import { executeLocalTool, getLocalToolDefinitions } from '../backend-local-tools';
import { TMP_DIR } from './backend-local-tools.fixtures';

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
