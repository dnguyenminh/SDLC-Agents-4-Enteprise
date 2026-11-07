/**
 * SA4E-394 SEC-02 (CWE-78) — buildRunCommand must quote the resolved host path
 * for the shell it runs through (cmd.exe on win32, /bin/bash otherwise; docker
 * exec runs `bash -c`). Agent-writable workspace-directory names may contain
 * shell metacharacters, so an unquoted path splits/injects into the command
 * string (SECURITY-ASSESSMENT §SEC-02; hardening requirement: "workspace
 * dir named `a;id > pwned;` and one containing spaces").
 */
import { describe, it, expect } from 'vitest';
import { quoteForShell, buildRunCommand } from '../command-builders.js';

describe('SEC-02 — quoteForShell (POSIX bash)', () => {
  const METACHARS = ['$', '`', ';', '&', '|', '(', ')', '"', "'", '%', '!', ' ', '{', '}'];

  it('single-quotes every metacharacter so the string stays one token', () => {
    for (const c of METACHARS) {
      const out = quoteForShell(`a${c}b`, 'linux');
      expect(out[0], `metachar ${JSON.stringify(c)} → ${out}`).toBe("'");
      expect(out[out.length - 1]).toBe("'");
    }
  });

  it('escapes an embedded single quote with the \'\'' + ' sequence', () => {
    expect(quoteForShell("a'b", 'linux')).toBe(`'a'\\''b'`);
    expect(quoteForShell("x;id > pwned;'y", 'linux')).toBe(`'x;id > pwned;'\\''y'`);
  });

  it('keeps the classic injection payloads literal', () => {
    expect(quoteForShell('/ws/a;id > pwned;', 'linux')).toBe(`'/ws/a;id > pwned;'`);
    expect(quoteForShell('/ws/a $(id) b', 'linux')).toBe(`'/ws/a $(id) b'`);
    const backtick = String.fromCharCode('`'.charCodeAt(0));
    expect(quoteForShell(`/ws/a ${backtick}id${backtick} b`, 'linux')).toBe(`'/ws/a ${backtick}id${backtick} b'`);
  });
});

describe('SEC-02 — quoteForShell (cmd.exe, win32)', () => {
  const METACHARS = ['$', '`', ';', '&', '|', '(', ')', "'", '%', '!', ' '];

  it('double-quotes every metacharacter', () => {
    for (const c of METACHARS) {
      const out = quoteForShell(`a${c}b`, 'win32');
      expect(out).toBe(`"a${c}b"`);
    }
  });

  it('paths with spaces stay one command argument', () => {
    expect(quoteForShell('C:\\Users\\John Doe\\wt\\script.js', 'win32'))
      .toBe('"C:\\Users\\John Doe\\wt\\script.js"');
  });
});

describe('SEC-02 — buildRunCommand integration with the runtimes', () => {
  /** Host-platform quoting — buildRunCommand resolves the shell from process.platform. */
  const q = (f: string): string => quoteForShell(f);

  it('quotes the file for node/python/tsx/sh runtimes (host platform)', () => {
    expect(buildRunCommand('python', '/wt/x;id > pwned;.py', ['--flag']))
      .toBe(`python3 ${q('/wt/x;id > pwned;.py')} --flag`);
    expect(buildRunCommand('node', '/wt/a&b.js', []))
      .toBe(`node ${q('/wt/a&b.js')}`);
    expect(buildRunCommand('tsx', '/wt/a|%b.ts', []))
      .toBe(`npx tsx ${q('/wt/a|%b.ts')}`);
    expect(buildRunCommand('sh', '/wt/a;b.sh', []))
      .toBe(`bash ${q('/wt/a;b.sh')}`);
  });

  it('quotes the .java target AND derived class name', () => {
    expect(buildRunCommand('java', '/wt/x;y.java', []))
      .toBe(`javac ${q('/wt/x;y.java')} && java ${q('x;y')}`);
  });

  it('gradle runtime (no file target) is unchanged', () => {
    expect(buildRunCommand('java', '/wt/build.gradle', ['--tests', 'A'])).toBe('gradle run --tests A');
  });

  it('quoted path stays substring-transparent for executor captures (TC-314 S1/S3 contract)', () => {
    // The per-tool matrix asserts the executed command CONTAINS the resolved
    // host path; quoting must not mangle the path itself.
    const host = process.platform === 'win32' ? 'C:\\ws\\a b\\script.py' : '/ws/a b/script.py';
    expect(buildRunCommand('python', host, [])).toContain(host);
  });
});
