import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { executeLocalTool, wrapToolArguments, getLocalToolDefinitions } from '../backend-local-tools';

const TMP_DIR = path.join(__dirname, '.tmp-local-tools');

describe('Backend Local Tools (E2E Tests)', () => {
  // Ensure a clean tmp directory before all tests
  beforeAll(() => {
    if (fs.existsSync(TMP_DIR)) {
      fs.rmSync(TMP_DIR, { recursive: true, force: true });
    }
    fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  // Cleanup after all tests
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

    it('TC-04: Should return error for missing file_path', async () => {
      const result = await executeLocalTool('stream_write_file', {
        content: 'Hello',
        mode: 'write'
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid arguments');
    });
  });

  describe('embed_image', () => {
    it('TC-05: Should inline a local PNG image as base64 data URI', async () => {
      // Create a dummy image
      const imgPath = path.join(TMP_DIR, 'dummy.png');
      fs.writeFileSync(imgPath, Buffer.from('dummy-image-data'));
      
      // Create a markdown file referencing it
      const mdPath = path.join(TMP_DIR, 'doc.md');
      fs.writeFileSync(mdPath, 'Check this image: ![Alt Text](dummy.png "Title")');

      const result = await executeLocalTool('embed_image', {
        file_path: mdPath
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('Embedded 1 image(s)');

      // Verify the generated file
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

      const result = await executeLocalTool('embed_image', {
        file_path: mdPath
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('skipped 2');

      const outPath = path.join(TMP_DIR, 'remote-embedded.md');
      const outContent = fs.readFileSync(outPath, 'utf-8');
      expect(outContent).toBe(content); // Should be unchanged
    });

    it('TC-07: Should skip missing local images without crashing', async () => {
      const mdPath = path.join(TMP_DIR, 'missing.md');
      const content = '![Missing](not-found.png)';
      fs.writeFileSync(mdPath, content);

      const result = await executeLocalTool('embed_image', {
        file_path: mdPath
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain('skipped 1');

      const outPath = path.join(TMP_DIR, 'missing-embedded.md');
      const outContent = fs.readFileSync(outPath, 'utf-8');
      expect(outContent).toBe(content); // Unchanged due to missing file
    });
  });

  describe('wrapToolArguments (mem_ingest_file)', () => {
    it('TC-08: Should auto-read file content into args', () => {
      const filePath = path.join(TMP_DIR, 'ingest.txt');
      fs.writeFileSync(filePath, 'Data to ingest');

      const args = wrapToolArguments('mem_ingest_file', { file_path: filePath });
      expect(args.file_path).toBe(filePath);
      expect(args.content).toBe('Data to ingest'); // Injected content
    });

    it('TC-09: Should throw error if file to ingest does not exist', () => {
      expect(() => {
        wrapToolArguments('mem_ingest_file', { file_path: '/non/existent/file.txt' });
      }).toThrow(/Failed to read local file/);
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
