/**
 * Integration Tests — Ingest Flow (Task 9)
 * Tests full handleIngestFile flow: md → direct, binary + no tool → unconvertible,
 * binary + mock gateway → convert + ingest.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleIngestFile } from '../../dispatchers/crud.js';
import { ConvertToolResolver } from '../ConvertToolResolver.js';
import { NullOrchestrationGateway, type OrchestrationGateway, type ToolDescriptor } from '../OrchestrationGateway.js';
import { makeTempDb, type TempDb } from '../../../../__tests__/sa4e-testkit.js';

let ctx: TempDb;
let tmpDir: string;

beforeEach(() => {
  ctx = makeTempDb();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ingest-it-'));
});

afterEach(() => {
  ctx.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('handleIngestFile — Integration', () => {
  it('markdown file → direct ingest (no resolver needed)', async () => {
    const mdFile = path.join(tmpDir, 'test.md');
    fs.writeFileSync(mdFile, '# Hello\n\nWorld content here.');

    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: mdFile });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ingested');
    expect(parsed.entries).toBeGreaterThan(0);
  });

  it('text file → direct ingest', async () => {
    const txtFile = path.join(tmpDir, 'data.txt');
    fs.writeFileSync(txtFile, 'Plain text content for testing.');

    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: txtFile });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ingested');
    expect(parsed.entries).toBeGreaterThan(0);
  });

  it('binary file + no resolver → unconvertible (no-tool)', async () => {
    const docxFile = path.join(tmpDir, 'doc.docx');
    fs.writeFileSync(docxFile, Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: docxFile });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('unconvertible');
    expect(parsed.reason).toBe('no-tool');
  });

  it('binary file + NullGateway resolver → unconvertible (no-tool)', async () => {
    const pdfFile = path.join(tmpDir, 'file.pdf');
    fs.writeFileSync(pdfFile, Buffer.from('%PDF-1.4'));

    const resolver = new ConvertToolResolver(new NullOrchestrationGateway());
    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: pdfFile }, resolver);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('unconvertible');
    expect(parsed.reason).toBe('no-tool');
  });

  it('binary file + mock gateway with tool → convert + ingest', async () => {
    const docxFile = path.join(tmpDir, 'report.docx');
    fs.writeFileSync(docxFile, Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const mockGateway: OrchestrationGateway = {
      async findTools(): Promise<ToolDescriptor[]> {
        return [{ name: 'convert_docx_to_md', description: 'Convert DOCX to markdown' }];
      },
      async executeDynamicTool(): Promise<string> {
        return '# Converted Report\n\nThis is the converted markdown content.';
      },
    };

    const resolver = new ConvertToolResolver(mockGateway);
    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: docxFile }, resolver);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ingested');
    expect(parsed.entries).toBeGreaterThan(0);
  });

  it('binary file + gateway convert fails → unconvertible (convert-failed)', async () => {
    const xlsFile = path.join(tmpDir, 'data.xlsx');
    fs.writeFileSync(xlsFile, Buffer.from([0x50, 0x4b, 0x03, 0x04]));

    const failGateway: OrchestrationGateway = {
      async findTools(): Promise<ToolDescriptor[]> {
        return [{ name: 'convert_xls', description: 'Convert XLS' }];
      },
      async executeDynamicTool(): Promise<string> {
        throw new Error('Conversion service unavailable');
      },
    };

    const resolver = new ConvertToolResolver(failGateway);
    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, { file_path: xlsFile }, resolver);
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('unconvertible');
    expect(parsed.reason).toBe('convert-failed');
  });

  it('binary + content provided → backward-compat direct ingest', async () => {
    const docxFile = path.join(tmpDir, 'legacy.docx');
    fs.writeFileSync(docxFile, Buffer.from([0x50, 0x4b]));

    const result = await handleIngestFile(ctx.engine, undefined, tmpDir, {
      file_path: docxFile,
      content: '# Pre-converted\n\nClient already converted this.',
    });
    const parsed = JSON.parse(result);
    expect(parsed.status).toBe('ingested');
    expect(parsed.entries).toBeGreaterThan(0);
  });
});
