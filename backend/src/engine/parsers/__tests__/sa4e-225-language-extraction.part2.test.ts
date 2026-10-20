/**
 * SA4E-225 — Unit tests for new language symbol-extraction patterns (part 2).
 * Covers STC TC-006..TC-010: PHP, Swift, Bash, PowerShell, .ps1 indexing gate.
 * Split from sa4e-225-language-extraction.test.ts to keep each file under
 * the CI line-count gate (<=200 lines). No logic changed — tests only relocated.
 */

import { describe, it, expect } from 'vitest';
import { extractSymbols } from '../signature-extractor.js';
import { DEFAULT_EXTENSIONS } from '../../../config/index.js';
import { FALLBACK_EXTENSIONS } from '../../indexer/project-type/resolver.js';
import { kindsOf, has } from './sa4e-225.helpers.js';

// ---------------------------------------------------------------------------
// TC-006 — PHP
// ---------------------------------------------------------------------------
describe('TC-006 PHP symbol extraction', () => {
  const src = [
    '<?php',
    'namespace App\\Model;',
    'class User { }',
    'interface Repository { }',
    'trait Timestamps { }',
    'public function make() { }',
    'function helper() { }',
    'abstract class Base { }',
  ].join('\n');

  it('extracts PHP symbols (>=5 distinct kinds)', () => {
    const syms = extractSymbols(src, 'php');
    const kinds = kindsOf(syms);
    for (const k of ['namespace', 'class', 'interface', 'trait', 'method', 'function']) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(has(syms, 'App\\Model', 'namespace')).toBe(true);
    expect(has(syms, 'User', 'class')).toBe(true);
    expect(has(syms, 'Repository', 'interface')).toBe(true);
    expect(has(syms, 'Timestamps', 'trait')).toBe(true);
    expect(has(syms, 'make', 'method')).toBe(true);
    expect(has(syms, 'helper', 'function')).toBe(true);
    expect(has(syms, 'Base', 'class')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-007 — Swift
// ---------------------------------------------------------------------------
describe('TC-007 Swift symbol extraction', () => {
  const src = [
    'public class Foo { }',
    'struct Bar { }',
    'protocol Baz { }',
    'enum Dir { case up }',
    'func run() { }',
    'extension Qux { }',
    'actor ActorX { }',
    'var count = 0',
  ].join('\n');

  it('extracts Swift symbols (>=5 distinct kinds)', () => {
    const syms = extractSymbols(src, 'swift');
    const kinds = kindsOf(syms);
    for (const k of ['class', 'struct', 'interface', 'enum', 'function', 'variable']) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(has(syms, 'Foo', 'class')).toBe(true);
    expect(has(syms, 'Bar', 'struct')).toBe(true);
    expect(has(syms, 'Baz', 'interface')).toBe(true);
    expect(has(syms, 'Dir', 'enum')).toBe(true);
    expect(has(syms, 'run', 'function')).toBe(true);
    expect(has(syms, 'Qux', 'class')).toBe(true);
    expect(has(syms, 'ActorX', 'class')).toBe(true);
    expect(has(syms, 'count', 'variable')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-008 — Bash (deviated: >=3 distinct kinds)
// ---------------------------------------------------------------------------
describe('TC-008 Bash symbol extraction', () => {
  const src = [
    'function deploy() { echo hi; }',
    'start() { echo go; }',
    'export NAME="x"',
    'readonly MAX=10',
    'local tmp=1',
  ].join('\n');

  it('extracts Bash symbols (>=3 distinct kinds — approved deviation)', () => {
    const syms = extractSymbols(src, 'bash');
    const kinds = kindsOf(syms);
    for (const k of ['function', 'variable', 'constant']) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(has(syms, 'deploy', 'function')).toBe(true);
    expect(has(syms, 'start', 'function')).toBe(true);
    expect(has(syms, 'NAME', 'variable')).toBe(true);
    expect(has(syms, 'tmp', 'variable')).toBe(true);
    expect(has(syms, 'MAX', 'constant')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-009 — PowerShell (deviated: >=4 distinct kinds)
// ---------------------------------------------------------------------------
describe('TC-009 PowerShell symbol extraction', () => {
  const src = [
    'function Get-Data { param($Path) }',
    'class Person { [string]$Name }',
    '$config = @{}',
    'Set-Variable -Name Max -Option Constant',
  ].join('\n');

  it('extracts PowerShell symbols (>=4 distinct kinds — approved deviation)', () => {
    const syms = extractSymbols(src, 'powershell');
    const kinds = kindsOf(syms);
    for (const k of ['function', 'class', 'variable', 'constant']) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(has(syms, 'Get-Data', 'function')).toBe(true);
    expect(has(syms, 'Person', 'class')).toBe(true);
    expect(has(syms, 'config', 'variable')).toBe(true);
    expect(has(syms, 'Path', 'variable')).toBe(true);
    expect(has(syms, 'Max', 'constant')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-010 — .ps1 no longer skipped (DEFAULT_EXTENSIONS + FALLBACK_EXTENSIONS)
// ---------------------------------------------------------------------------
describe('TC-010 PowerShell .ps1 indexing gate', () => {
  it('DEFAULT_EXTENSIONS contains .ps1', () => {
    expect(DEFAULT_EXTENSIONS).toContain('.ps1');
  });

  it('FALLBACK_EXTENSIONS contains .ps1', () => {
    expect(FALLBACK_EXTENSIONS).toContain('.ps1');
  });

  it('a .ps1 file path passes the extension gate', () => {
    expect(DEFAULT_EXTENSIONS.includes('.ps1')).toBe(true);
    const sample = 'function Get-Data { param($Path) }\nclass Person { }\n$config = @{}\nSet-Variable -Name Max -Option Constant';
    const syms = extractSymbols(sample, 'powershell');
    const kinds = kindsOf(syms);
    expect(kinds.has('function')).toBe(true);
    expect(kinds.has('class')).toBe(true);
    expect(kinds.has('variable')).toBe(true);
    expect(kinds.has('constant')).toBe(true);
  });
});
