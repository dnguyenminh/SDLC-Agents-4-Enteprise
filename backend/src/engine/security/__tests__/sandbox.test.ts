/**
 * SA4E-417 — Sandbox tests (16K Doc §13).
 * AC: tool arg validation schema for the 4 core tools; no shell concat;
 * workspace escape rejection; container limits; network policy.
 */

import { describe, it, expect } from 'vitest';
import { validateToolArgs, SHELL_METACHARS } from '../tool-schemas.js';
import {
  buildArgVector,
  validateContainerLimits,
  DEFAULT_CONTAINER_LIMITS,
  DEFAULT_NETWORK_POLICY,
  isRegistryAllowed,
  SandboxViolationError,
} from '../sandbox.js';

describe('SA4E-417 tool arg schemas (4 core tools)', () => {
  it('search_symbols: valid args pass; shell metachars rejected', () => {
    const ok = validateToolArgs('search_symbols', { query: 'login handler', limit: 10 });
    expect(ok.valid).toBe(true);
    expect(ok.sanitized.limit).toBe(10);
    const bad = validateToolArgs('search_symbols', { query: 'x; rm -rf /' });
    expect(bad.valid).toBe(false);
    expect(bad.errors[0]).toMatch(/shell metacharacters/);
  });

  it('get_file_skeleton: relative path required, absolute + traversal rejected', () => {
    expect(validateToolArgs('get_file_skeleton', { file_path: 'src/auth.ts' }).valid).toBe(true);
    const abs = validateToolArgs('get_file_skeleton', { file_path: 'C:/Windows/x.ts' });
    expect(abs.valid).toBe(false);
    expect(abs.errors[0]).toMatch(/absolute/);
    const trav = validateToolArgs('get_file_skeleton', { file_path: 'src/../../etc/passwd' });
    expect(trav.valid).toBe(false);
  });

  it('read_code_block: line ranges bounded, types enforced', () => {
    expect(validateToolArgs('read_code_block', { file_path: 'src/a.ts', start_line: 0, end_line: 50 }).valid).toBe(true);
    const notNumber = validateToolArgs('read_code_block', { file_path: 'src/a.ts', start_line: 'abc', end_line: 10 });
    expect(notNumber.valid).toBe(false);
    const overMax = validateToolArgs('read_code_block', { file_path: 'src/a.ts', start_line: 2_000_001, end_line: 2_000_002 });
    expect(overMax.valid).toBe(false);
  });

  it('query_call_graph: identifier + bounded depth/cap', () => {
    expect(validateToolArgs('query_call_graph', { symbol_id: 'sym-abc:1', max_depth: 3, node_cap: 50 }).valid).toBe(true);
    const badId = validateToolArgs('query_call_graph', { symbol_id: 'id; drop' });
    expect(badId.valid).toBe(false);
    const deep = validateToolArgs('query_call_graph', { symbol_id: 'sym', max_depth: 99 });
    expect(deep.valid).toBe(false);
  });

  it('unknown tool rejected', () => {
    const r = validateToolArgs('delete_everything', {});
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/UNKNOWN_TOOL/);
  });

  it('shell metachar set covers the dangerous characters', () => {
    for (const ch of [';', '&', '|', '`', '$', '>', '<']) {
      expect(SHELL_METACHARS.test(ch), ch).toBe(true);
    }
  });
});

describe('SA4E-417 sandbox — no shell concat, container limits, network', () => {
  it('buildArgVector returns structured argv with -- separator (never a shell string)', () => {
    const cmd = buildArgVector('git', ['diff', 'HEAD', 'src/auth.ts'], 1);
    expect(cmd).toEqual({ executable: 'git', args: ['diff', '--', 'HEAD', 'src/auth.ts'] });
    expect(Array.isArray(cmd.args)).toBe(true);
  });

  it('rejects metacharacters in executable or args', () => {
    expect(() => buildArgVector('git; rm -rf /', [])).toThrow(SandboxViolationError);
    expect(() => buildArgVector('git', ['$(whoami)'])).toThrow(SandboxViolationError);
  });

  it('container limits: defaults bounded, violations listed (AC)', () => {
    expect(validateContainerLimits(DEFAULT_CONTAINER_LIMITS)).toEqual([]);
    const violations = validateContainerLimits({ rootless: false, memoryMB: 16384, cpuPercent: 200, diskMB: 99999, pids: 10000 });
    expect(violations.length).toBeGreaterThanOrEqual(5);
    expect(violations.some((v) => v.includes('rootless'))).toBe(true);
    expect(violations.some((v) => v.includes('memoryMB'))).toBe(true);
  });

  it('network denied by default; only allowlisted registries when enabled', () => {
    expect(isRegistryAllowed(DEFAULT_NETWORK_POLICY, 'registry.npmjs.org')).toBe(false); // allowNetwork=false
    const open: typeof DEFAULT_NETWORK_POLICY = { ...DEFAULT_NETWORK_POLICY, allowNetwork: true };
    expect(isRegistryAllowed(open, 'registry.npmjs.org')).toBe(true);
    expect(isRegistryAllowed(open, 'evil.example.com')).toBe(false);
    expect(isRegistryAllowed(open, 'sub.registry-1.docker.io')).toBe(true);
  });
});
