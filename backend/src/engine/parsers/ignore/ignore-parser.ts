/**
 * KSA-169: Ignore Parser — Parse .codeintelignore files (gitignore syntax).
 * Supports glob patterns, negation (!), and directory markers (/).
 */

import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';

const logger = pino({ name: 'ignore-parser' });

export interface IgnorePattern {
  pattern: string;
  regex: RegExp;
  isNegation: boolean;
  isDirectory: boolean;
  sourceFile: string;
}

export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/', '.git/', 'build/', 'dist/', 'target/',
  '__pycache__/', '.pytest_cache/', '*.min.js', '*.bundle.js',
  '.gradle/', '.idea/', '.vscode/', '*.pyc', '*.class',
  '*.o', '*.so', '.code-intel/', 'coverage/', '.next/', '.nuxt/',
];

export class IgnoreParser {
  private patterns: IgnorePattern[] = [];

  constructor() {
    this.addPatterns(DEFAULT_IGNORE_PATTERNS, '<defaults>');
  }

  parseFile(filePath: string): void {
    try {
      if (!fs.existsSync(filePath)) return;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n')
        .map(l => l.trim())
        .filter(l => l && !l.startsWith('#'));
      this.addPatterns(lines, filePath);
    } catch (err) {
      logger.error({ err }, `[ignore-parser] Failed to parse ${filePath}:`);
    }
  }

  shouldIgnore(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/');
    let ignored = false;
    for (const pattern of this.patterns) {
      if (pattern.regex.test(normalizedPath)) {
        ignored = !pattern.isNegation;
      }
    }
    return ignored;
  }

  getPatterns(): IgnorePattern[] {
    return [...this.patterns];
  }

  addPatterns(patterns: string[], sourceFile: string): void {
    for (const raw of patterns) {
      const parsed = this.parsePattern(raw, sourceFile);
      if (parsed) this.patterns.push(parsed);
    }
  }

  private parsePattern(raw: string, sourceFile: string): IgnorePattern | null {
    let pattern = raw.trim();
    if (!pattern || pattern.startsWith('#')) return null;

    const isNegation = pattern.startsWith('!');
    if (isNegation) pattern = pattern.slice(1);

    const isDirectory = pattern.endsWith('/');
    if (isDirectory) pattern = pattern.slice(0, -1);

    const regex = this.globToRegex(pattern, isDirectory);
    return { pattern: raw, regex, isNegation, isDirectory, sourceFile };
  }

  private globToRegex(pattern: string, isDirectory: boolean): RegExp {
    let regexStr = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '[^/]')
      .replace(/\{\{GLOBSTAR\}\}/g, '.*');

    if (!pattern.startsWith('/')) {
      regexStr = `(^|/)${regexStr}`;
    } else {
      regexStr = `^${regexStr.slice(2)}`;
    }

    if (isDirectory) {
      regexStr = `${regexStr}(/|$)`;
    } else {
      regexStr = `${regexStr}($|/)`;
    }

    return new RegExp(regexStr);
  }
}

export function createIgnoreParser(workspace: string): IgnoreParser {
  const parser = new IgnoreParser();
  parser.parseFile(path.join(workspace, '.codeintelignore'));
  const gitignore = path.join(workspace, '.gitignore');
  if (fs.existsSync(gitignore)) {
    parser.parseFile(gitignore);
  }
  return parser;
}
