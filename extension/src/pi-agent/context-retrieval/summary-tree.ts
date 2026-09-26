import * as path from 'path';
import { isExcludedPath } from './file-exclusion-filter';
import type { TokenCounter } from './token-counter';
import type { DirPage, IFileLister } from './types';

export interface SummaryTreeOptions {
  maxDepth?: number;
  maxTokens?: number;
  filesPerDir?: number;
  pageSize?: number;
}

interface TreeState {
  lines: string[];
  tokens: number;
  maxTokens: number;
  maxDepth: number;
  filesPerDir: number;
  pageSize: number;
}

interface TreeDeps {
  lister: IFileLister;
  counter: TokenCounter;
}

export class SummaryTreeBuilder {
  constructor(private readonly deps: TreeDeps) {}

  build(rootDir: string, options: SummaryTreeOptions = {}): { text: string; tokens: number } {
    const state: TreeState = {
      lines: [],
      tokens: 0,
      maxTokens: options.maxTokens ?? 1500,
      maxDepth: options.maxDepth ?? 3,
      filesPerDir: options.filesPerDir ?? 8,
      pageSize: options.pageSize ?? 100,
    };
    this.walk(rootDir, 0, '', state);
    return { text: state.lines.join('\n'), tokens: state.tokens };
  }

  private walk(dir: string, depth: number, indent: string, state: TreeState): void {
    if (depth > state.maxDepth || state.tokens >= state.maxTokens) return;
    const page = this.collectEntries(dir, state);
    state.lines.push(this.formatLine(dir, page.files, page.dirs, indent, state));
    state.tokens = this.deps.counter.estimate(state.lines.join('\n'));
    for (const sub of page.dirs) {
      if (state.tokens >= state.maxTokens) return;
      this.walk(path.join(dir, sub), depth + 1, `${indent}  `, state);
    }
  }

  private collectEntries(dir: string, state: TreeState): { files: string[]; dirs: string[] } {
    const files: string[] = [];
    const dirs: string[] = [];
    let cursor = 0;
    for (;;) {
      const page: DirPage = this.deps.lister.listDir(dir, cursor, state.pageSize);
      for (const entry of page.entries) {
        if (isExcludedPath(entry.name)) continue;
        if (entry.isDirectory) dirs.push(entry.name);
        else files.push(entry.name);
      }
      if (page.nextCursor === undefined) break;
      cursor = page.nextCursor;
    }
    return { files, dirs };
  }

  private formatLine(dir: string, files: string[], dirs: string[], indent: string, state: TreeState): string {
    const label = `${indent}${path.basename(dir) || dir}/ (${files.length} files)`;
    if (files.length === 0) return label;
    const shown = files.slice(0, state.filesPerDir).join(', ');
    const extra = files.length > state.filesPerDir ? ` (+${files.length - state.filesPerDir} more)` : '';
    return `${label}: ${shown}${extra}`;
  }
}
