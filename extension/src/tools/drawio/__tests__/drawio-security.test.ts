/**
 * SA4E-406 — security regressions:
 *   H1: unterminated <mxCell> must not trigger quadratic rescans (parse + malformed scan)
 *   M3: input caps (bytes before first read, cell pre-pass) with actionable errors
 *   M2: symlink guard on the drawio pre-parse gate
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDrawioXml } from '../drawio-parser';
import { findMalformedTags } from '../drawio-xml-sanitize';
import { preflight, countCellTags } from '../drawio-preflight';
import { checkSymlinkGuardForPath } from '../../../backend-local-tools/fs-guards';

const cell = (id: string): string =>
  `<mxCell id="${id}" value="${id}" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="10" y="10" width="120" height="60" as="geometry"/></mxCell>`;

describe('SA4E-406 (H1) quadratic scan', () => {
  it('parses a 1 MB file with an unterminated mxCell in bounded time', () => {
    const cells = Array.from({ length: 4000 }, (_, i) => cell(`n${i}`)).join('');
    const xml = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}<mxCell id="broken" value="unterminated`;
    const started = Date.now();
    const graph = parseDrawioXml(xml);
    const elapsed = Date.now() - started;
    expect(graph.nodes.length).toBeGreaterThan(3900); // cells before the junk still parse
    expect(elapsed).toBeLessThan(3000); // the old lazy regex took ~77 s per 2 MB
  });

  it('computes malformed-tag lines without re-scanning the prefix per tag', () => {
    const broken = Array.from({ length: 3000 }, (_, i) => `<mxCell id="b${i}" value="x`).join('\n');
    const started = Date.now();
    const bad = findMalformedTags(broken);
    expect(bad.length).toBe(3000);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(bad[10].line).toBe(11); // line numbers stay correct
  });
});

describe('SA4E-406 (M3) input caps', () => {
  it('counts cell tags cheaply', () => {
    expect(countCellTags(`${cell('a')}${cell('b')}`)).toBe(2);
    expect(countCellTags('no cells here')).toBe(0);
  });

  it('refuses a file over the byte cap before parsing it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-cap-'));
    try {
      const big = path.join(dir, 'big.drawio');
      fs.writeFileSync(big, '<mxGraphModel>' + 'x'.repeat(26 * 1024 * 1024) + '</mxGraphModel>');
      const out = preflight(big, dir, 'big.drawio');
      expect('error' in out && out.error).toContain('File too large');
      expect('error' in out && out.error).toContain('Split');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('refuses a diagram over the cell pre-pass cap with an actionable message', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dio-cap2-'));
    try {
      const many = path.join(dir, 'many.drawio');
      fs.writeFileSync(many, `<mxGraphModel><root>${Array.from({ length: 10_001 }, (_, i) => cell(`n${i}`)).join('')}</root></mxGraphModel>`);
      const out = preflight(many, dir, 'many.drawio');
      expect('error' in out && out.error).toContain('too complex');
      expect('error' in out && out.error).toContain('10000');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('SA4E-406 (M2) symlink guard on the pre-parse gate', () => {
  it('rejects a path whose parent realpath escapes the workspace root', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dio-root-')));
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dio-out-')));
    try {
      const file = path.join(outside, 'x.drawio');
      fs.writeFileSync(file, '<mxGraphModel/>');
      const out = preflight(file, root, 'x.drawio');
      expect('error' in out && out.error).toContain('PATH_REJECTED_OUTSIDE_WORKSPACE');
      // Direct guard form agrees
      expect(checkSymlinkGuardForPath(file, root, 'x.drawio')).toContain('PATH_REJECTED_OUTSIDE_WORKSPACE');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('runs a clean file inside the root through the gate', () => {
    const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dio-ok-')));
    try {
      const file = path.join(root, 'ok.drawio');
      fs.writeFileSync(file, '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>');
      const out = preflight(file, root, 'ok.drawio');
      expect('xml' in out).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
