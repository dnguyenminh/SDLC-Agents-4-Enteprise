import { describe, it, expect, beforeAll, vi } from 'vitest';
vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: process.cwd() } }]
  }
}));
import * as fs from 'fs';
import * as path from 'path';
import { Base64ProxyService } from '../services/Base64ProxyService';
import { TMP_DIR, DRAWIO_INPUT_TOOL } from './backend-local-tools.fixtures';

describe('Base64ProxyService SA4E-356 (provider mode + T-size)', () => {
  beforeAll(() => {
    if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
  });

  it('provider mode matches string mode (TDD §5.5 parity)', () => {
    const filePath = path.join(TMP_DIR, 'parity.txt');
    fs.writeFileSync(filePath, 'parity-bytes');
    const tools = [DRAWIO_INPUT_TOOL];
    const fromString = new Base64ProxyService(TMP_DIR);
    fromString.detectFromToolList([...tools]);
    const fromProvider = new Base64ProxyService(() => TMP_DIR);
    fromProvider.detectFromToolList([...tools]);
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
      svc.detectFromToolList([{ ...DRAWIO_INPUT_TOOL }]);
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
      svc.detectFromToolList([{ ...DRAWIO_INPUT_TOOL }]);
      const out = svc.proxyInput('drawio_export_png', { file_path: exact });
      expect(typeof out.content_base64).toBe('string');
    } finally {
      fs.unlinkSync(exact);
    }
  });
});
