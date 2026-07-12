/**
 * KSA-168: Git Miner — Semantic search over git commit history.
 * Parses git log, stores commit metadata, enables text-based search.
 */
import Database from 'better-sqlite3';
import type { GitCommit, GitCommitResult, GitIndexSummary } from './types.js';
import { parseGitLog, getLastIndexedHash } from './GitLogParser.js';

export class GitMiner {
  private db: Database.Database;
  private repoPath: string;
  private maxCommits: number;

  constructor(db: Database.Database, repoPath: string, maxCommits: number = 10000) {
    this.db = db;
    this.repoPath = repoPath;
    this.maxCommits = maxCommits;
    this.ensureSchema();
  }

  indexHistory(force: boolean = false): GitIndexSummary {
    const lastHash = force ? null : getLastIndexedHash(this.db);
    const commits = parseGitLog(lastHash, this.repoPath, this.maxCommits);
    if (commits.length === 0) return this.getSummary();
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO git_commits (hash, author, date, message, files_changed, insertions, deletions)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const transaction = this.db.transaction((items: GitCommit[]) => {
      for (const commit of items) {
        insert.run(
          commit.hash, commit.author, commit.date, commit.message,
          JSON.stringify(commit.filesChanged), commit.insertions, commit.deletions
        );
      }
    });
    transaction(commits);
    if (commits.length > 0) {
      this.db.prepare(
        `INSERT OR REPLACE INTO git_index_meta (key, value) VALUES ('last_indexed_hash', ?)`
      ).run(commits[0].hash);
      this.db.prepare(
        `INSERT OR REPLACE INTO git_index_meta (key, value) VALUES ('last_indexed_at', datetime('now'))`
      ).run();
    }
    return this.getSummary();
  }

  search(query: string, options: { author?: string; file?: string; limit?: number; since?: string } = {}): GitCommitResult[] {
    const limit = options.limit ?? 10;
    let sql = `SELECT hash, author, date, message, files_changed, insertions, deletions FROM git_commits WHERE 1=1`;
    const params: unknown[] = [];
    if (query) {
      sql += ` AND (message LIKE ? OR files_changed LIKE ?)`;
      params.push(`%${query}%`, `%${query}%`);
    }
    if (options.author) { sql += ` AND author LIKE ?`; params.push(`%${options.author}%`); }
    if (options.file) { sql += ` AND files_changed LIKE ?`; params.push(`%${options.file}%`); }
    if (options.since) { sql += ` AND date >= ?`; params.push(options.since); }
    sql += ` ORDER BY date DESC LIMIT ?`;
    params.push(limit);
    const rows = this.db.prepare(sql).all(...params) as Array<{
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
    const countRow = this.db.prepare('SELECT COUNT(*) as count FROM git_commits').get() as { count: number };
    const lastHashRow = this.db.prepare(
      `SELECT value FROM git_index_meta WHERE key = 'last_indexed_hash'`
    ).get() as { value: string } | undefined;
    const lastTimeRow = this.db.prepare(
      `SELECT value FROM git_index_meta WHERE key = 'last_indexed_at'`
    ).get() as { value: string } | undefined;
    return {
      totalCommits: countRow.count, indexed: countRow.count,
      lastHash: lastHashRow?.value ?? null, lastIndexedAt: lastTimeRow?.value ?? null,
    };
  }

  private ensureSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS git_commits (
        hash TEXT PRIMARY KEY,
        author TEXT NOT NULL,
        date TEXT NOT NULL,
        message TEXT NOT NULL,
        files_changed TEXT NOT NULL DEFAULT '[]',
        insertions INTEGER DEFAULT 0,
        deletions INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_git_date ON git_commits(date);
      CREATE INDEX IF NOT EXISTS idx_git_author ON git_commits(author);
      CREATE TABLE IF NOT EXISTS git_index_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }
}
