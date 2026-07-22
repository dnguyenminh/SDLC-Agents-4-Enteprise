/**
 * KSA-168: Git Miner — Semantic search over git commit history.
 * Parses git log, stores commit metadata, enables text-based search.
 * SA4E-41: commits are stamped with project_id and search is tenant-scoped (fail-closed).
 */
import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import { DialectHelper } from '../../../database/dialect/DialectHelper.js';
import type { GitCommit, GitCommitResult, GitIndexSummary } from './types.js';
import { parseGitLog, getLastIndexedHash } from './GitLogParser.js';
import { buildCodeScopeFilter, requireProjectId } from '../../query/code-intel-isolation.js';

export class GitMiner {
  private adapter: DatabaseAdapter;
  private dialect: DialectHelper;
  private repoPath: string;
  private maxCommits: number;
  private projectId: string | undefined;
  private initialized: Promise<void>;

  /**
   * @param projectId  SA4E-41 tenant scope. indexHistory requires it (write);
   *   search/getSummary are fail-closed when it is missing.
   */
  constructor(adapter: DatabaseAdapter, repoPath: string, maxCommits: number = 10000, projectId?: string) {
    this.adapter = adapter;
    this.dialect = new DialectHelper(adapter.getEngine());
    this.repoPath = repoPath;
    this.maxCommits = maxCommits;
    this.projectId = projectId;
    this.initialized = this.ensureSchema();
  }

  async indexHistory(force: boolean = false): Promise<GitIndexSummary> {
    await this.initialized;
    // Writes must fail loudly when there is no tenant context.
    const pid = requireProjectId(this.projectId);
    const lastHash = force ? null : await getLastIndexedHash(this.adapter, pid);
    const commits = parseGitLog(lastHash, this.repoPath, this.maxCommits);
    if (commits.length === 0) return this.getSummary();
    const insertSql = this.dialect.insertIgnore(
      'git_commits',
      ['project_id', 'hash', 'author', 'date', 'message', 'files_changed', 'insertions', 'deletions'],
      'project_id, hash',
    );
    await this.adapter.transactionAsync(async () => {
      for (const commit of commits) {
        await this.adapter.runAsync(insertSql, [
          pid, commit.hash, commit.author, commit.date, commit.message,
          JSON.stringify(commit.filesChanged), commit.insertions, commit.deletions,
        ]);
      }
    });
    await this.recordIndexMeta(pid, commits[0].hash);
    return this.getSummary();
  }

  private async recordIndexMeta(pid: string, lastHash: string): Promise<void> {
    const metaColumns = ['project_id', 'key', 'value'];
    const metaUpsert = this.dialect.upsert('git_index_meta', metaColumns, 'project_id, key', ['value']);
    await this.adapter.runAsync(metaUpsert, [pid, 'last_indexed_hash', lastHash]);
    // For last_indexed_at, use engine-appropriate NOW() expression
    const nowSql = this.adapter.getEngine() === 'sqlite'
      ? `INSERT OR REPLACE INTO git_index_meta (project_id, key, value) VALUES (?, 'last_indexed_at', datetime('now'))`
      : `INSERT INTO git_index_meta (project_id, key, value) VALUES (?, 'last_indexed_at', NOW()) ON CONFLICT (project_id, key) DO UPDATE SET value = EXCLUDED.value`;
    await this.adapter.runAsync(nowSql, [pid]);
  }

  async search(query: string, options: { author?: string; file?: string; limit?: number; since?: string } = {}): Promise<GitCommitResult[]> {
    await this.initialized;
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
    const rows = await this.adapter.allAsync<{
      hash: string; author: string; date: string; message: string;
      files_changed: string; insertions: number; deletions: number;
    }>(sql, params);
    return rows.map((row, idx) => ({
      hash: row.hash, author: row.author, date: row.date, message: row.message,
      filesChanged: JSON.parse(row.files_changed), insertions: row.insertions,
      deletions: row.deletions, score: 1.0 - (idx * 0.05),
    }));
  }

  async getSummary(): Promise<GitIndexSummary> {
    await this.initialized;
    if (!this.projectId) {
      return { totalCommits: 0, indexed: 0, lastHash: null, lastIndexedAt: null };
    }
    const countRow = await this.adapter.getAsync<{ count: number }>(
      `SELECT COUNT(*) as count FROM git_commits WHERE project_id = ?`,
      [this.projectId],
    );
    const meta = async (key: string) => {
      const row = await this.adapter.getAsync<{ value: string }>(
        `SELECT value FROM git_index_meta WHERE key = ? AND project_id = ?`,
        [key, this.projectId],
      );
      return row?.value ?? null;
    };
    return {
      totalCommits: countRow?.count ?? 0, indexed: countRow?.count ?? 0,
      lastHash: await meta('last_indexed_hash'), lastIndexedAt: await meta('last_indexed_at'),
    };
  }

  /** Create git tables if they don't exist (async, cross-engine). */
  private async ensureSchema(): Promise<void> {
    await this.adapter.execAsync(`
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
    await this.migrateLegacyGitSchema();
  }

  /** Add project_id to pre-SA4E-41 git tables when missing (idempotent, async). */
  private async migrateLegacyGitSchema(): Promise<void> {
    const colQuery = this.dialect.columnExistsQuery('git_commits');
    const cols = await this.adapter.allAsync<{ name: string }>(colQuery);
    if (!cols.some(c => c.name === 'project_id')) {
      await this.adapter.execAsync(`ALTER TABLE git_commits ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
    }
    const metaColQuery = this.dialect.columnExistsQuery('git_index_meta');
    const metaCols = await this.adapter.allAsync<{ name: string }>(metaColQuery);
    if (!metaCols.some(c => c.name === 'project_id')) {
      await this.adapter.execAsync(`ALTER TABLE git_index_meta ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
    }
  }
}
