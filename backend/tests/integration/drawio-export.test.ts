/**
 * Integration Tests — drawio_export_png tool.
 * Tests the backend tool directly without HTTP server or extension.
 * Requires draw.io CLI installed on the system.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  handleDrawioExportPng,
  detectRenderer,
  resetRendererCache,
} from '../../src/engine/tools/drawio-export-png.js';

const SAMPLE_DRAWIO = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram name="Page-1" id="test">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Hello" style="rounded=1;" vertex="1" parent="1">
          <mxGeometry x="120" y="60" width="120" height="60" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

let tmpWorkspace: string;

describe('drawio_export_png — Integration', () => {
  beforeAll(() => {
    tmpWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-test-'));
  });

  afterAll(() => {
    fs.rmSync(tmpWorkspace, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetRendererCache();
  });

  it('TC-01: detectRenderer finds draw.io CLI', () => {
    const renderer = detectRenderer();
    expect(renderer).toBe('drawio-cli');
  });

  it('TC-02: exports a valid .drawio to PNG', async () => {
    const drawioPath = path.join(tmpWorkspace, 'test-diagram.drawio');
    fs.writeFileSync(drawioPath, SAMPLE_DRAWIO, 'utf-8');

    const result = await handleDrawioExportPng(
      { file_path: 'test-diagram.drawio' },
      tmpWorkspace
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.renderer).toBe('drawio-cli');
    expect(parsed.file_path).toBe('test-diagram.png');
    expect(parsed.size_bytes).toBeGreaterThan(0);

    // Verify file exists on disk
    const pngPath = path.join(tmpWorkspace, 'test-diagram.png');
    expect(fs.existsSync(pngPath)).toBe(true);
    expect(fs.statSync(pngPath).size).toBeGreaterThan(100);
  }, 30000);

  it('TC-03: exports with absolute path', async () => {
    const drawioPath = path.join(tmpWorkspace, 'abs-test.drawio');
    fs.writeFileSync(drawioPath, SAMPLE_DRAWIO, 'utf-8');

    const result = await handleDrawioExportPng(
      { file_path: drawioPath },
      tmpWorkspace
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.size_bytes).toBeGreaterThan(0);
  }, 30000);

  it('TC-04: returns error for missing file', async () => {
    const result = await handleDrawioExportPng(
      { file_path: 'nonexistent.drawio' },
      tmpWorkspace
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('not found');
  });

  it('TC-05: returns error for non-.drawio file', async () => {
    const txtPath = path.join(tmpWorkspace, 'not-drawio.txt');
    fs.writeFileSync(txtPath, 'hello', 'utf-8');

    const result = await handleDrawioExportPng(
      { file_path: 'not-drawio.txt' },
      tmpWorkspace
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('.drawio');
  });

  it('TC-06: returns error for missing file_path arg', async () => {
    const result = await handleDrawioExportPng({}, tmpWorkspace);

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('file_path');
  });

  it('TC-07: exports file in subdirectory', async () => {
    const subDir = path.join(tmpWorkspace, 'diagrams');
    fs.mkdirSync(subDir, { recursive: true });
    const drawioPath = path.join(subDir, 'sub-diagram.drawio');
    fs.writeFileSync(drawioPath, SAMPLE_DRAWIO, 'utf-8');

    const result = await handleDrawioExportPng(
      { file_path: 'diagrams/sub-diagram.drawio' },
      tmpWorkspace
    );

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.file_path).toBe('diagrams/sub-diagram.png');

    const pngPath = path.join(subDir, 'sub-diagram.png');
    expect(fs.existsSync(pngPath)).toBe(true);
  }, 30000);
});
