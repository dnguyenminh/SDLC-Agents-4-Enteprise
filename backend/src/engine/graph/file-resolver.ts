/**
 * KSA-155: File Resolver - resolves import paths to indexed file paths.
 * Handles relative imports, bare specifiers, and extension resolution.
 */

import * as path from 'path';
import Database from 'better-sqlite3';
import { buildCodeScopeFilter } from '../query/code-intel-isolation.js';

export class FileResolver {
  private indexedFiles: Set<string>;
  private workspaceRoot: string;
  private projectId: string | undefined;

  private static readonly EXTENSIONS = ['.ts', '.js', '.tsx', '.jsx', '.kt', '.py', '/index.ts', '/index.js'];
  private static readonly STDLIB_MODULES = new Set([
    // Node.js
    'fs', 'path', 'http', 'https', 'url', 'crypto', 'os', 'util', 'stream', 'events',
    'child_process', 'cluster', 'net', 'dns', 'tls', 'readline', 'zlib', 'buffer',
    'assert', 'querystring', 'string_decoder', 'timers', 'vm', 'worker_threads',
    // Python
    'sys', 'json', 're', 'math', 'datetime', 'collections', 'itertools',
    'functools', 'typing', 'pathlib', 'abc', 'dataclasses', 'enum', 'logging',
    'unittest', 'io', 'subprocess', 'threading', 'multiprocessing',
  ]);

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no files).
   */
  constructor(db: Database.Database, workspaceRoot: string, projectId?: string) {
    this.workspaceRoot = workspaceRoot;
    this.projectId = projectId;
    this.indexedFiles = this.loadIndexedFiles(db);
  }

  private loadIndexedFiles(db: Database.Database): Set<string> {
    const scope = buildCodeScopeFilter(this.projectId, 'files');
    const rows = db.prepare(
      `SELECT relative_path FROM files WHERE ${scope.clause}`
    ).all(...scope.params) as { relative_path: string }[];
    return new Set(rows.map(r => r.relative_path));
  }

  /** Resolve an input file path to a canonical indexed path. */
  resolveFile(input: string): string | null {
    // Exact match on relative path
    if (this.indexedFiles.has(input)) return input;

    // Try normalizing separators
    const normalized = input.replace(/\\/g, '/');
    if (this.indexedFiles.has(normalized)) return normalized;

    // Try stripping workspace root prefix
    if (input.startsWith(this.workspaceRoot)) {
      const relative = input.substring(this.workspaceRoot.length).replace(/^[/\\]/, '').replace(/\\/g, '/');
      if (this.indexedFiles.has(relative)) return relative;
    }

    // Try with extensions
    const withExt = this.findWithExtensions(normalized);
    if (withExt) return withExt;

    // Fuzzy: find by basename
    const basename = path.basename(input);
    const matches = [...this.indexedFiles].filter(f => f.endsWith(basename) || f.endsWith('/' + basename));
    if (matches.length === 1) return matches[0];

    return null;
  }

  /** Resolve an import target relative to a source file. */
  resolveImportTarget(sourceFile: string, target: string): string | null {
    if (target.startsWith('.')) {
      const dir = path.dirname(sourceFile).replace(/\\/g, '/');
      const resolved = path.posix.resolve('/' + dir, target).substring(1);
      return this.findWithExtensions(resolved);
    }

    // Try as workspace-relative path
    return this.findWithExtensions(target);
  }

  /** Check if a target is an external (non-project) dependency. */
  isExternal(target: string): boolean {
    const base = target.split('/')[0].split('.')[0];
    if (FileResolver.STDLIB_MODULES.has(base)) return true;

    // Bare specifier that doesn't start with . or /
    if (!target.startsWith('.') && !target.startsWith('/')) {
      const resolved = this.resolveImportTarget('', target);
      return resolved === null;
    }
    return false;
  }

  /** Refresh the indexed files set (call after re-indexing). */
  refresh(db: Database.Database): void {
    this.indexedFiles = this.loadIndexedFiles(db);
  }

  private findWithExtensions(basePath: string): string | null {
    // Try exact first
    if (this.indexedFiles.has(basePath)) return basePath;

    for (const ext of FileResolver.EXTENSIONS) {
      const candidate = basePath + ext;
      if (this.indexedFiles.has(candidate)) return candidate;
    }
    return null;
  }
}
