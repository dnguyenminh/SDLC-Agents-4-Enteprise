import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface FileMetaInfo {
  fileCreatedAt?: string;
  fileAuthor?: string;
  fileVersion?: string;
}

function isGitRepo(workspaceRoot: string): boolean {
  try {
    const gitDir = path.join(workspaceRoot, '.git');
    return fs.existsSync(gitDir);
  } catch {
    return false;
  }
}

function execGit(args: string[], cwd: string): string | null {
  try {
    return execSync(`git ${args.join(' ')}`, { cwd, encoding: 'utf-8', timeout: 30000, maxBuffer: 50 * 1024 * 1024 });
  } catch {
    return null;
  }
}

function extractFileCreationFromGitLog(workspaceRoot: string): Record<string, { fileCreatedAt: string; fileAuthor: string }> {
  const result: Record<string, { fileCreatedAt: string; fileAuthor: string }> = {};
  const output = execGit(['log', '--all', '--diff-filter=A', '--format=%H|%aI|%an', '--name-only', '--reverse'], workspaceRoot);
  if (!output) return result;

  let currentDate = '';
  let currentAuthor = '';
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pipeIdx = trimmed.indexOf('|');
    if (pipeIdx > 0 && trimmed.length > pipeIdx + 1) {
      const datePart = trimmed.substring(pipeIdx + 1);
      const authorPipeIdx = datePart.indexOf('|');
      if (authorPipeIdx > 0) {
        currentDate = datePart.substring(0, authorPipeIdx);
        currentAuthor = datePart.substring(authorPipeIdx + 1);
      } else {
        currentDate = datePart;
        currentAuthor = '';
      }
    } else if (currentDate) {
      const normalizedPath = trimmed.replace(/\\/g, '/');
      if (!result[normalizedPath]) {
        result[normalizedPath] = { fileCreatedAt: currentDate, fileAuthor: currentAuthor };
      }
    }
  }
  return result;
}

function extractRepoVersion(workspaceRoot: string): string | undefined {
  const output = execGit(['describe', '--tags', '--always', '--dirty'], workspaceRoot);
  return output?.trim() || undefined;
}

export function collectFileMetas(workspaceRoot: string): { fileMetas: Map<string, FileMetaInfo>; repoVersion: string | undefined } {
  const fileMetas = new Map<string, FileMetaInfo>();
  let repoVersion: string | undefined;

  if (!isGitRepo(workspaceRoot)) {
    return { fileMetas, repoVersion: undefined };
  }

  try {
    const creationMap = extractFileCreationFromGitLog(workspaceRoot);
    for (const [relPath, info] of Object.entries(creationMap)) {
      fileMetas.set(relPath, { fileCreatedAt: info.fileCreatedAt, fileAuthor: info.fileAuthor });
    }
    repoVersion = extractRepoVersion(workspaceRoot);
  } catch {
    // git failed entirely, fall back below
  }

  return { fileMetas, repoVersion };
}

export function getFileMetaFallback(filePath: string): FileMetaInfo {
  try {
    const stat = fs.statSync(filePath);
    return { fileCreatedAt: stat.birthtime?.toISOString() };
  } catch {
    return {};
  }
}
