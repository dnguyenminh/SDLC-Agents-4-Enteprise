import * as path from 'path';
import { isExcludedPath } from './file-exclusion-filter';
import { EXCLUDED_DIRS } from './types';
import type { DirEntry, IFileLister } from './types';

export interface FileScanOptions {
  maxFiles?: number;
  pageSize?: number;
  maxDepth?: number;
}

interface ScanState {
  files: string[];
  maxFiles: number;
  pageSize: number;
  maxDepth: number;
}

interface QueueNode {
  dir: string;
  depth: number;
}

export class FileScanner {
  constructor(
    private readonly lister: IFileLister,
    private readonly excludedDirs: readonly string[] = EXCLUDED_DIRS
  ) {}

  listSourceFiles(rootDir: string, options: FileScanOptions = {}): string[] {
    const state: ScanState = {
      files: [],
      maxFiles: options.maxFiles ?? 500,
      pageSize: options.pageSize ?? 100,
      maxDepth: options.maxDepth ?? 12,
    };
    const queue: QueueNode[] = [{ dir: rootDir, depth: 0 }];
    while (queue.length > 0 && state.files.length < state.maxFiles) {
      const node = queue.shift()!;
      if (node.depth <= state.maxDepth) this.scanDir(node, state, queue);
    }
    return state.files.slice(0, state.maxFiles);
  }

  private scanDir(node: QueueNode, state: ScanState, queue: QueueNode[]): void {
    let cursor = 0;
    while (state.files.length < state.maxFiles) {
      const page = this.lister.listDir(node.dir, cursor, state.pageSize);
      this.collectEntries(node, page, state, queue);
      if (page.nextCursor === undefined) return;
      cursor = page.nextCursor;
    }
  }

  private collectEntries(node: QueueNode, page: { entries: DirEntry[] }, state: ScanState, queue: QueueNode[]): void {
    for (const entry of page.entries) {
      if (state.files.length >= state.maxFiles) return;
      const fullPath = path.join(node.dir, entry.name);
      if (isExcludedPath(fullPath, this.excludedDirs)) continue;
      if (entry.isDirectory) queue.push({ dir: fullPath, depth: node.depth + 1 });
      else state.files.push(fullPath);
    }
  }
}
