/**
 * SA4E-225 — Unit tests for new language symbol-extraction patterns (part 1).
 * Covers STC TC-001..TC-005: Scala, C, C++, C#, Ruby extraction.
 * Split from sa4e-225-language-extraction.test.ts to keep each file under
 * the CI line-count gate (<=200 lines). No logic changed — tests only relocated.
 */

import { describe, it, expect } from 'vitest';
import { extractSymbols } from '../signature-extractor.js';
import { kindsOf, has } from './sa4e-225.helpers.js';

// ---------------------------------------------------------------------------
// TC-001 — Scala
// ---------------------------------------------------------------------------
describe('TC-001 Scala symbol extraction', () => {
  const src = [
    'package com.ex',
    'object MyObj {',
    '  trait Animal',
    '  case class Cat(name: String)',
    '  sealed class Base',
    '  def greet(): Unit = {}',
    '  val answer = 42',
    '  var counter = 0',
    '}',
  ].join('\n');

  it('extracts all Scala constructs (>=5 distinct kinds)', () => {
    const syms = extractSymbols(src, 'scala');
    const kinds = kindsOf(syms);
    for (const k of ['module', 'trait', 'class', 'function', 'constant', 'variable']) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(has(syms, 'MyObj', 'module')).toBe(true);
    expect(has(syms, 'Animal', 'trait')).toBe(true);
    expect(has(syms, 'Cat', 'class')).toBe(true);
    expect(has(syms, 'Base', 'class')).toBe(true);
    expect(has(syms, 'greet', 'function')).toBe(true);
    expect(has(syms, 'answer', 'constant')).toBe(true);
    expect(has(syms, 'counter', 'variable')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-002 — C
// ---------------------------------------------------------------------------
describe('TC-002 C symbol extraction', () => {
  const src = [
    'struct Point { int x; int y; };',
    'enum Color { RED, GREEN };',
    'typedef unsigned long size_t;',
    '#define MAX(a,b) ((a)>(b)?(a):(b))',
    '#define VERSION 3',
    'int globalVar = 5;',
  ].join('\n');

  it('extracts C symbols (>=5 distinct kinds)', () => {
    const syms = extractSymbols(src, 'c');
    const kinds = kindsOf(syms);
    for (const k of ['struct', 'enum', 'type', 'function', 'constant', 'variable']) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(has(syms, 'Point', 'struct')).toBe(true);
    expect(has(syms, 'Color', 'enum')).toBe(true);
    expect(has(syms, 'size_t', 'type')).toBe(true);
    expect(has(syms, 'MAX', 'function')).toBe(true);
    expect(has(syms, 'VERSION', 'constant')).toBe(true);
    expect(has(syms, 'globalVar', 'variable')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-003 — C++
// ---------------------------------------------------------------------------
describe('TC-003 C++ symbol extraction', () => {
  const src = [
    'namespace myns {',
    'class Widget { };',
    'struct Point { };',
    'int add(int a, int b);',
    'enum Status { OK, ERR };',
    'using IntVec = std::vector<int>;',
    '}',
    'template<typename T> class Container { };',
  ].join('\n');

  it('extracts C++ symbols (>=5 distinct kinds)', () => {
    const syms = extractSymbols(src, 'cpp');
    const kinds = kindsOf(syms);
    for (const k of ['namespace', 'class', 'struct', 'function', 'enum', 'type']) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(has(syms, 'myns', 'namespace')).toBe(true);
    expect(has(syms, 'Widget', 'class')).toBe(true);
    expect(has(syms, 'Point', 'struct')).toBe(true);
    expect(has(syms, 'add', 'function')).toBe(true);
    expect(has(syms, 'Status', 'enum')).toBe(true);
    expect(has(syms, 'IntVec', 'type')).toBe(true);
    expect(has(syms, 'Container', 'class')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-004 — C#
// ---------------------------------------------------------------------------
describe('TC-004 C# symbol extraction', () => {
  const src = [
    'public class Calculator { }',
    'public interface IShape { }',
    'public struct Point { }',
    'public enum Color { Red, Green }',
    'public delegate void Handler();',
    'public void Compute() { }',
    'public int Value { get; set; }',
    'public event EventHandler Clicked;',
  ].join('\n');

  it('extracts C# symbols (>=5 distinct kinds, actually 7)', () => {
    const syms = extractSymbols(src, 'csharp');
    const kinds = kindsOf(syms);
    for (const k of ['class', 'interface', 'struct', 'enum', 'type', 'method', 'variable']) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(has(syms, 'Calculator', 'class')).toBe(true);
    expect(has(syms, 'IShape', 'interface')).toBe(true);
    expect(has(syms, 'Point', 'struct')).toBe(true);
    expect(has(syms, 'Color', 'enum')).toBe(true);
    expect(has(syms, 'Handler', 'type')).toBe(true);
    expect(has(syms, 'Compute', 'method')).toBe(true);
    expect(has(syms, 'Value', 'variable')).toBe(true);
    expect(has(syms, 'Clicked', 'variable')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-005 — Ruby
// ---------------------------------------------------------------------------
describe('TC-005 Ruby symbol extraction', () => {
  const src = [
    'class User',
    '  module Helper',
    '    def greet',
    '    end',
    '    CONSTANT = 10',
    '    @name = "x"',
    '    $global = 1',
    '    attr_accessor :age',
    '  end',
    'end',
  ].join('\n');

  it('extracts Ruby symbols (>=5 distinct kinds)', () => {
    const syms = extractSymbols(src, 'ruby');
    const kinds = kindsOf(syms);
    for (const k of ['class', 'module', 'function', 'constant', 'variable']) {
      expect(kinds.has(k)).toBe(true);
    }
    expect(has(syms, 'User', 'class')).toBe(true);
    expect(has(syms, 'Helper', 'module')).toBe(true);
    expect(has(syms, 'greet', 'function')).toBe(true);
    expect(has(syms, 'CONSTANT', 'constant')).toBe(true);
    expect(has(syms, '@name', 'variable')).toBe(true);
    expect(has(syms, '$global', 'variable')).toBe(true);
    expect(has(syms, 'age', 'variable')).toBe(true);
  });
});
