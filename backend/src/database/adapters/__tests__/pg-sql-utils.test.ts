/**
 * Unit tests for pg-sql-utils — placeholder translation (literal-safe),
 * INSERT target parsing, and identifier quoting (SQLi guard).
 */

import { describe, it, expect } from 'vitest';
import { parseInsertTarget, quoteIdentifier, translatePlaceholders } from '../pg-sql-utils.js';

describe('translatePlaceholders', () => {
  it('replaces ? outside string literals', () => {
    expect(translatePlaceholders('INSERT INTO t (a, b) VALUES (?, ?)'))
      .toBe('INSERT INTO t (a, b) VALUES ($1, $2)');
  });

  it('keeps ? inside single-quoted literals', () => {
    expect(translatePlaceholders("UPDATE t SET note = 'a?b' WHERE id = ?"))
      .toBe("UPDATE t SET note = 'a?b' WHERE id = $1");
  });

  it("treats '' doubling as the literal escape and resumes translation after", () => {
    expect(translatePlaceholders("UPDATE t SET note = 'a?b''c?d' WHERE id = ?"))
      .toBe("UPDATE t SET note = 'a?b''c?d' WHERE id = $1");
  });

  it('leaves SQL without placeholders untouched', () => {
    expect(translatePlaceholders("SELECT 'what?' FROM t")).toBe("SELECT 'what?' FROM t");
  });
});

describe('parseInsertTarget', () => {
  it('parses a bare table name', () => {
    expect(parseInsertTarget('INSERT INTO users (name) VALUES (?)'))
      .toEqual({ key: 'users', schema: 'public', table: 'users' });
  });

  it('lowercases bare identifiers (PG semantics)', () => {
    expect(parseInsertTarget('INSERT INTO Files (path) VALUES (?)'))
      .toEqual({ key: 'files', schema: 'public', table: 'files' });
  });

  it('splits a bare schema-qualified name', () => {
    expect(parseInsertTarget('INSERT INTO app.files (path) VALUES (?)'))
      .toEqual({ key: 'app.files', schema: 'app', table: 'files' });
  });

  it('parses a quoted table name', () => {
    expect(parseInsertTarget('INSERT INTO "Users" (name) VALUES (?)'))
      .toEqual({ key: '"Users"', schema: 'public', table: 'Users' });
  });

  it('returns null for unparsable targets', () => {
    expect(parseInsertTarget('UPDATE t SET a = 1')).toBeNull();
    expect(parseInsertTarget('INSERT SELECT 1')).toBeNull();
  });
});

describe('quoteIdentifier', () => {
  it('quotes a safe plain name', () => {
    expect(quoteIdentifier('users')).toBe('"users"');
  });

  it('quotes a schema-qualified name', () => {
    expect(quoteIdentifier('app.files')).toBe('"app"."files"');
  });

  it('allows quoted identifiers with special characters', () => {
    expect(quoteIdentifier('"my-table"')).toBe('"my-table"');
  });

  it('rejects injection payloads', () => {
    expect(() => quoteIdentifier('users; DROP TABLE users')).toThrow('Unsafe table identifier');
    expect(() => quoteIdentifier('users"--')).toThrow('Unsafe table identifier');
    expect(() => quoteIdentifier('')).toThrow('Empty table identifier');
  });
});
