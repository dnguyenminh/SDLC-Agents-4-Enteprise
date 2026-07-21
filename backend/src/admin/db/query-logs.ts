/**
 * admin/db/query-logs.ts — KB search query performance logging.
 * SA4E-50: All functions are async; use getAdminAdapter() for multi-DB support.
 */

import { getAdminAdapter } from './core.js';

/** Ensure the query_logs table and required columns exist (lazy-init). */
async function ensureTable(): Promise<void> {
  const adapter = getAdminAdapter();
  await adapter.execAsync(`
    CREATE TABLE IF NOT EXISTS query_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      response_time_ms INTEGER NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      user_id TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_query_logs_timestamp ON query_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_query_logs_user_id ON query_logs(user_id);
  `);
}

/**
 * Record a KB search query with timing and result count.
 * @param query - The search string
 * @param responseTimeMs - Time to complete the search in ms
 * @param resultCount - Number of results returned
 * @param userId - User who performed the search
 */
export async function recordQueryLog(
  query: string,
  responseTimeMs: number,
  resultCount: number,
  userId = '',
): Promise<void> {
  await ensureTable();
  const adapter = getAdminAdapter();
  await adapter.runAsync(
    'INSERT INTO query_logs (query, timestamp, response_time_ms, result_count, user_id) VALUES (?, ?, ?, ?, ?)',
    [query, new Date().toISOString(), responseTimeMs, resultCount, userId],
  );
}

/**
 * Aggregate daily query counts for the analytics chart.
 * @param days - Number of past days to include
 * @param userId - Optional user scope filter
 */
export async function getQueryLogs(
  days = 14,
  userId?: string,
): Promise<{ date: string; queries: number; avgResponseTime: number }[]> {
  await ensureTable();
  const adapter = getAdminAdapter();
  const since = new Date(Date.now() - days * 86400000).toISOString();

  let sql = `
    SELECT substr(timestamp, 1, 10) as date,
           COUNT(*) as queries,
           CAST(AVG(response_time_ms) AS INTEGER) as avg_response_time
    FROM query_logs
    WHERE timestamp >= ?`;
  const params: unknown[] = [since];

  if (userId) { sql += ' AND user_id = ?'; params.push(userId); }
  sql += ' GROUP BY substr(timestamp, 1, 10) ORDER BY date ASC';

  const rows = await adapter.allAsync<{ date: string; queries: number; avg_response_time: number }>(
    sql, params,
  );
  return rows.map(r => ({ date: r.date, queries: r.queries, avgResponseTime: r.avg_response_time }));
}

/**
 * Overall query statistics summary.
 * @param userId - Optional user scope filter
 */
export async function getQueryLogStats(
  userId?: string,
): Promise<{ totalQueries: number; avgResponseTime: number; queriesLast24h: number }> {
  await ensureTable();
  const adapter = getAdminAdapter();
  const userFilter = userId ? ' WHERE user_id = ?' : '';
  const totalParams = userId ? [userId] : [];

  const total = await adapter.getAsync<{ cnt: number; avg: number }>(
    `SELECT COUNT(*) as cnt, CAST(AVG(response_time_ms) AS INTEGER) as avg FROM query_logs${userFilter}`,
    totalParams,
  );

  const since24h = new Date(Date.now() - 86400000).toISOString();
  const last24hParams: unknown[] = userId ? [since24h, userId] : [since24h];
  const userAnd = userId ? ' AND user_id = ?' : '';
  const last24h = await adapter.getAsync<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM query_logs WHERE timestamp >= ?${userAnd}`,
    last24hParams,
  );

  return {
    totalQueries: total?.cnt ?? 0,
    avgResponseTime: total?.avg ?? 0,
    queriesLast24h: last24h?.cnt ?? 0,
  };
}
