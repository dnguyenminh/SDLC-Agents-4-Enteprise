/**
 * KSA-165: SQL Injection Matcher — 4 patterns for SQL injection detection.
 */

import { PatternMatcher } from '../PatternMatcher.js';
import type { InjectionPattern } from '../../types/index.js';

export class SQLInjectionMatcher extends PatternMatcher {
  readonly category = 'sql_injection';
  readonly patterns: InjectionPattern[] = [
    {
      id: 1,
      name: 'String Concatenation in SQL Query',
      category: 'sql_injection',
      cwe: 'CWE-89',
      severity: 'Critical',
      sinkPatterns: ['query(', 'execute(', 'raw(', 'knex.raw', 'sequelize.query', 'db.run(', 'cursor.execute'],
      dangerousOps: ['concat', 'template_literal', 'format_string'],
      safePatterns: ['?', '$1', '%s', 'prepare', 'parameterize'],
      description: 'Use parameterized queries instead of string concatenation. Example: db.query("SELECT * FROM users WHERE id = ?", [userId])',
    },
    {
      id: 2,
      name: 'Template Literal in SQL Query',
      category: 'sql_injection',
      cwe: 'CWE-89',
      severity: 'Critical',
      sinkPatterns: ['query(', 'execute(', 'raw(', 'knex.raw', 'sequelize.query'],
      dangerousOps: ['template_literal'],
      safePatterns: ['?', '$1', 'tagged_template', 'sql`'],
      description: 'Use tagged template literals (e.g., sql`...`) or parameterized queries instead of plain template literals.',
    },
    {
      id: 3,
      name: 'Dynamic Table/Column Name in SQL',
      category: 'sql_injection',
      cwe: 'CWE-89',
      severity: 'High',
      sinkPatterns: ['query(', 'execute(', 'raw('],
      dangerousOps: ['concat', 'template_literal', 'format_string'],
      safePatterns: ['whitelist', 'allowedColumns', 'allowedTables', 'includes('],
      description: 'Validate table/column names against a whitelist. Parameterized queries cannot protect identifiers.',
    },
    {
      id: 4,
      name: 'ORM Raw Query with User Input',
      category: 'sql_injection',
      cwe: 'CWE-89',
      severity: 'High',
      sinkPatterns: ['raw(', 'rawQuery(', 'literal(', '$queryRaw'],
      dangerousOps: ['concat', 'template_literal', 'format_string', 'pass_through'],
      safePatterns: ['bind', 'replacements', 'Prisma.sql'],
      description: 'Use ORM binding parameters: Model.rawQuery("... WHERE id = ?", { replacements: [id] })',
    },
  ];
}