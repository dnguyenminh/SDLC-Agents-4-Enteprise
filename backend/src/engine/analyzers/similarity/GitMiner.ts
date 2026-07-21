/**
 * KSA-168: Git Miner — Semantic search over git commit history.
 * Parses git log, stores commit metadata, enables text-based search.
 * SA4E-41: commits are stamped with project_id and search is tenant-scoped (fail-closed).
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { GitCommit, GitCommitResult, GitIndexSummary } from './types.js';
import { parseGitLog, getLastIndexedHash } from './GitLogParser.js';
import { buildCodeScopeFilter, requireProjectId } from '../../query/code-intel-isolation.js';

export class GitMiner {
  private adapter: DatabaseAdapter;
  private repoPath: string;
  private maxCommits: number;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 tenant scope. indexHistory requires it (write);
   *   search/getSummary are fail-closed when it is missing.
   */
  constructor(adapter: DatabaseAdapter, repoPath: string, maxCommits: number = 10000, projectId?: string) {
    this.adapter = adapter;
    this.repoPath = repoPath;
    this.maxCommits = maxCommits;
    this.projectId = projectId;
    this.ensureSchema();
  }

  indexHistory(force: boolean = false): GitIndexSummary {
    // Writes must fail loudly when there is no tenant context.
    const pid = requireProjectId(this.projectId);
    const lastHash = force ? null : getLastIndexedHash(this.adapter, pid);
    const commits = parseGitLog(lastHash, this.repoPath, this.maxCommits);
    if (commits.length === 0) return this.getSummary();
    const insert = this.adapter.prepare(`
      INSERT OR IGNORE INTO git_commits (project_id, hash, author, date, message, files_changed, insertions, deletions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.adapter.transaction(() => {
      for (const commit of commits) {
        insert.run(
          pid, commit.hash, commit.author, commit.date, commit.message,
          JSON.stringify(commit.filesChanged), commit.insertions, commit.deletions
        );
      }
    });
    this.recordIndexMeta(pid, commits[0].hash);
    return this.getSummary();
  }

  private recordIndexMeta(pid: string, lastHash: string): void {
    this.adapter.prepare(
      `INSERT OR REPLACE INTO git_index_meta (project_id, key, value) VALUES (?, 'last_indexed_hash', ?)`
    ).run(pid, lastHash);
    this.adapter.prepare(
      `INSERT OR REPLACE INTO git_index_meta (project_id, key, value) VALUES (?, 'last_indexed_at', datetime('now'))`
    ).run(pid);
  }

  search(query: string, options: { author?: string; file?: string; limit?: number; since?: string } = {}): GitCommitResult[] {
    const limit = options.limit ?? 10;
    const scope = buildCodeScopeFilter(this.projectId, 'git_commits'); // fail-closed
    let sql = `SELECT hash, author, date, message, files_changed, insertions, deletions FROM git_commits WHERE ${scope.clause}`;
    const params: unknown[] = [...scope.params];
    if (query) {
      sql += ` AND (message LIKE ? OR files_changed LIKE ?)`;
      params.push(`%${query}%`, `%${query}%`);
    }
    if (options.author) { sql += ` AND author LIKE ?`; params.push(`%${options.author}%`); }
    if (options.file) { sql += ` AND files_changed LIKE ?`; params.push(`%${options.file}%`); }
    if (options.since) { sql += ` AND date >= ?`; params.push(options.since); }
    sql += ` ORDER BY date DESC LIMIT ?`;
    params.push(limit);
    const rows = this.adapter.prepare(sql).all(...params) as Array<{
      hash: string; author: string; date: string; message: string;
      files_changed: string; insertions: number; deletions: number;
    }>;
    return rows.map((row, idx) => ({
      hash: row.hash, author: row.author, date: row.date, message: row.message,
      filesChanged: JSON.parse(row.files_changed), insertions: row.insertions,
      deletions: row.deletions, score: 1.0 - (idx * 0.05),
    }));
  }

  getSummary(): GitIndexSummary {
    if (!this.projectId) {
      return { totalCommits: 0, indexed: 0, lastHash: null, lastIndexedAt: null };
    }
    const countRow = this.adapter.prepare(
      `SELECT COUNT(*) as count FROM git_commits WHERE project_id = ?`
    ).get(this.projectId) as { count: number };
    const meta = (key: string) => (this.adapter.prepare(
      `SELECT value FROM git_index_meta WHERE key = ? AND project_id = ?`
    ).get(key, this.projectId) as { value: string } | undefined)?.value ?? null;
    return {
      totalCommits: countRow.count, indexed: countRow.count,
      lastHash: meta('last_indexed_hash'), lastIndexedAt: meta('last_indexed_at'),
    };
  }

  private ensureSchema(): void {
    this.adapter.exec(`
      CREATE TABLE IF NOT EXISTS git_commits (
        project_id TEXT NOT NULL DEFAULT '',
        hash TEXT NOT NULL,
        author TEXT NOT NULL,
        date TEXT NOT NULL,
        message TEXT NOT NULL,
        files_changed TEXT NOT NULL DEFAULT '[]',
        insertions INTEGER DEFAULT 0,
        deletions INTEGER DEFAULT 0,
        PRIMARY KEY (project_id, hash)
      );
      CREATE INDEX IF NOT EXISTS idx_git_date ON git_commits(date);
      CREATE INDEX IF NOT EXISTS idx_git_author ON git_commits(author);
      CREATE INDEX IF NOT EXISTS idx_git_project ON git_commits(project_id);
      CREATE TABLE IF NOT EXISTS git_index_meta (
        project_id TEXT NOT NULL DEFAULT '',
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        PRIMARY KEY (project_id, key)
      );
    `);
    this.migrateLegacyGitSchema();
  }

  /** Add project_id to pre-SA4E-41 git tables when missing (idempotent). */
  private migrateLegacyGitSchema(): void {
    const cols = this.adapter.all<{ name: string }>('PRAGMA table_info(git_commits)');
    if (!cols.some(c => c.name === 'project_id')) {
      this.adapter.exec(`ALTER TABLE git_commits ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
    }
    const metaCols = this.adapter.all<{ name: string }>('PRAGMA table_info(git_index_meta)');
    if (!metaCols.some(c => c.name === 'project_id')) {
      this.adapter.exec(`ALTER TABLE git_index_meta ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
    }
  }
}
