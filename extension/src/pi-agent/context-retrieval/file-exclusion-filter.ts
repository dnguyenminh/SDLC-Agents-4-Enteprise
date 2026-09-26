import * as fs from 'fs';
import { EXCLUDED_DIRS } from './types';
import type { DirEntry, DirPage, IFileLister } from './types';

export function isExcludedPath(filePath: string, excludedDirs: readonly string[] = EXCLUDED_DIRS): boolean {
  const segments = (filePath ?? '').split(/[\\/]+/).filter(Boolean);
  return segments.some((segment) =>
    excludedDirs.some((dir) => dir.toLowerCase() === segment.toLowerCase())
  );
}

export function filterExcludedPaths(paths: string[], excludedDirs?: readonly string[]): string[] {
  return (paths ?? []).filter((p) => !isExcludedPath(p, excludedDirs));
}

export class FsDirLister implements IFileLister {
  listDir(dir: string, cursor: number, pageSize: number): DirPage {
    let entries: DirEntry[];
    try {
      entries = fs
        .readdirSync(dir, { withFileTypes: true })
        .map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
        .sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return { entries: [] };
    }
    const page = entries.slice(cursor, cursor + pageSize);
    if (page.length === 0) return { entries: [] };
    const next = cursor + pageSize;
    return next < entries.length ? { entries: page, nextCursor: next } : { entries: page };
  }
}
