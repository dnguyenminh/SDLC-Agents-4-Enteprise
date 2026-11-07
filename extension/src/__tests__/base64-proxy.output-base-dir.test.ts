/**
 * SA4E-394 SEC-03 (CWE-283) — proxyOutput write-back must validate the I-7
 * re-resolve against the per-call base_dir, not the default workspace root.
 *
 * Regression: with a VS Code workspace open (default root = main worktree) and
 * base_dir = a registered sibling worktree, every drawio_export_png /
 * embed_image write-back failed with PROXY_WRITE_FAILED because the second
 * containment ran against the wrong root. Under cwd_fallback the second
 * containment silently disappeared (STC TC-703 covers the local-tool path;
 * this file adds the proxyOutput base_dir variant the report requested).
 *
 * Under vitest require("vscode") is unavailable, so the allowlist mirror
 * falls back to MCP_WORKSPACE_ROOTS (base-dir-resolution readEnvRoots).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
vi.mock('vscode', () => ({ workspace: {} }));
import * as fs from 'fs';
import * as path from 'path';
import { Base64ProxyService } from '../services/Base64ProxyService';

const BASE = path.join(__dirname, '.tmp-output-base-dir');
const DEFAULT = path.join(BASE, 'main'); // default (open) workspace root
const WTB = path.join(BASE, 'wt-b'); // registered base_dir target
const OUTSIDE = path.join(BASE, 'outside'); // NOT registered
const ALLOWLIST_MSG = 'PATH_REJECTED_OUTSIDE_ALLOWLIST';

function pngResult(name: string): { content: Array<{ type: string; text: string }> } {
  return {
    content: [{ type: 'text', text: JSON.stringify({ output_base64: Buffer.from(name).toString('base64') }) }],
  };
}

beforeAll(() => {
  fs.mkdirSync(path.join(DEFAULT, 'img'), { recursive: true });
  fs.mkdirSync(path.join(WTB, 'out'), { recursive: true });
  fs.mkdirSync(OUTSIDE, { recursive: true });
  process.env.MCP_WORKSPACE_ROOTS = [DEFAULT, WTB].join(path.delimiter);
});

afterAll(() => {
  delete process.env.MCP_WORKSPACE_ROOTS;
  fs.rmSync(BASE, { recursive: true, force: true });
});

// STC: TC-703 S-variant — proxyOutput with base_dir != default root
describe('SEC-03 — proxyOutput write-back honors per-call base_dir', () => {
  let service: Base64ProxyService;

  beforeAll(() => {
    // Production wiring — the open VS Code workspace root is the default root.
    service = new Base64ProxyService(() => DEFAULT);
  });

  it('write-back from file_path next to a base_dir source lands inside the worktree', () => {
    const src = path.join(WTB, 'src.drawio');
    const result = service.proxyOutput('drawio_export_png', { file_path: src, base_dir: WTB }, pngResult('WTB-PNG'));
    const expected = path.join(WTB, 'src.png');
    expect(fs.existsSync(expected)).toBe(true);
    expect(fs.readFileSync(expected).toString()).toBe('WTB-PNG');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.file_path).toBe(expected);
    expect(parsed.output_base64).toBeUndefined();
  });

  it('explicit output_path resolves against base_dir (not the default root)', () => {
    const result = service.proxyOutput(
      'embed_image',
      { output_path: 'out/result.png', base_dir: WTB },
      pngResult('OUT-PNG'),
    );
    const expected = path.join(WTB, 'out', 'result.png');
    expect(fs.existsSync(expected)).toBe(true);
    expect(JSON.parse(result.content[0].text).file_path).toBe(expected);
  });

  it('unregistered base_dir fails closed — PROXY_WRITE_FAILED, nothing written (BR-23)', () => {
    // wrapper mode (file_path present) so resolution failures surface as a
    // tool error result instead of silently returning the bytes.
    const result = service.proxyOutput(
      'drawio_export_png',
      { file_path: path.join(DEFAULT, 'img', 'legacy.drawio'), output_path: path.join(OUTSIDE, 'evil.png'), base_dir: OUTSIDE },
      pngResult('EVIL'),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('PROXY_WRITE_FAILED');
    expect(fs.existsSync(path.join(OUTSIDE, 'evil.png'))).toBe(false);
  });

  it('non-string base_dir fails closed (pickBaseDir INVALID sentinel, no write)', () => {
    const result = service.proxyOutput(
      'drawio_export_png',
      { file_path: path.join(DEFAULT, 'img', 'legacy.drawio'), output_path: 'out/bad.png', base_dir: 42 },
      pngResult('BAD'),
    );
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('PROXY_WRITE_FAILED');
    expect(fs.existsSync(path.join(WTB, 'out', 'bad.png'))).toBe(false);
    expect(fs.existsSync(path.join(DEFAULT, 'out', 'bad.png'))).toBe(false);
  });

  it('base_dir omitted keeps the default-root write-back (legacy regression guard)', () => {
    const result = service.proxyOutput(
      'drawio_export_png',
      { file_path: path.join(DEFAULT, 'img', 'legacy.drawio') },
      pngResult('LEGACY'),
    );
    const expected = path.join(DEFAULT, 'img', 'legacy.png');
    expect(fs.existsSync(expected)).toBe(true);
    expect(JSON.parse(result.content[0].text).file_path).toBe(expected);
  });
});
