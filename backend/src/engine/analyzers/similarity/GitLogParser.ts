import { execSync } from 'child_process';
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import pino from 'pino';
import type { GitCommit } from './types.js';

const logger = pino({ name: 'git-miner' });

export function parseGitLog(sinceHash: string | null, repoPath: string, maxCommits: number): GitCommit[] {
  try {
    let cmd = `git log --format="%H|%an|%aI|%s" --numstat`;
    if (sinceHash) {
      cmd += ` ${sinceHash}..HEAD`;
    } else {
      cmd += ` -n ${maxCommits}`;
    }
    const output = execSync(cmd, {
      cwd: repoPath, encoding: 'utf-8', maxBuffer: 50 * 1024 * 1024, timeout: 30000,
    });
    return parseLogOutput(output);
  } catch (err) {
    logger.error({ err }, '[git-miner] Failed to parse git log:');
    return [];
  }
}

export function parseLogOutput(output: string): GitCommit[] {
  const commits: GitCommit[] = [];
  const lines = output.split('\n');
  let current: GitCommit | null = null;
  for (const line of lines) {
    if (!line.trim()) {
      if (current) { commits.push(current); current = null; }
      continue;
    }
    const headerMatch = line.match(/^([0-9a-f]{40})\|(.+?)\|(.+?)\|(.+)$/);
    if (headerMatch) {
      if (current) commits.push(current);
      current = {
        hash: headerMatch[1], author: headerMatch[2], date: headerMatch[3],
        message: headerMatch[4], filesChanged: [], insertions: 0, deletions: 0,
      };
      continue;
    }
    if (current) {
      const statMatch = line.match(/^(\d+|-)\t(\d+|-)\t(.+)$/);
      if (statMatch) {
        const ins = statMatch[1] === '-' ? 0 : parseInt(statMatch[1], 10);
        const del = statMatch[2] === '-' ? 0 : parseInt(statMatch[2], 10);
        current.insertions += ins;
        current.deletions += del;
        current.filesChanged.push(statMatch[3]);
      }
    }
  }
  if (current) commits.push(current);
  return commits;
}

export function getLastIndexedHash(adapter: DatabaseAdapter, projectId?: string): string | null {
  try {
    // SA4E-41: scope the incremental checkpoint per tenant.
    const row = adapter.prepare(
      `SELECT value FROM git_index_meta WHERE key = 'last_indexed_hash' AND project_id = ?`
    ).get(projectId ?? '') as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}
