import { getAdminDb } from './core.js';

function initQueryLogsTable(): void {
  const d = getAdminDb();
  d.exec(`
    CREATE TABLE IF NOT EXISTS query_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      response_time_ms INTEGER NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      user_id TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_query_logs_timestamp ON query_logs(timestamp);
  `);
  try {
    d.exec(`ALTER TABLE query_logs ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`);
  } catch { /* column already exists */ }
  d.exec(`CREATE INDEX IF NOT EXISTS idx_query_logs_user_id ON query_logs(user_id);`);
}

export function recordQueryLog(query: string, responseTimeMs: number, resultCount: number, userId: string = ''): void {
  const d = getAdminDb();
  initQueryLogsTable();
  d.prepare('INSERT INTO query_logs (query, timestamp, response_time_ms, result_count, user_id) VALUES (?, ?, ?, ?, ?)').run(
    query, new Date().toISOString(), responseTimeMs, resultCount, userId
  );
}

export function getQueryLogs(days = 14, userId?: string): { date: string; queries: number; avgResponseTime: number }[] {
  const d = getAdminDb();
  initQueryLogsTable();
  const since = new Date(Date.now() - days * 86400000).toISOString();
  let sql = `
    SELECT
      substr(timestamp, 1, 10) as date,
      COUNT(*) as queries,
      CAST(AVG(response_time_ms) AS INTEGER) as avg_response_time
    FROM query_logs
    WHERE timestamp >= ?`;
  const params: any[] = [since];
  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  sql += `
    GROUP BY substr(timestamp, 1, 10)
    ORDER BY date ASC`;
  const rows = d.prepare(sql).all(...params) as { date: string; queries: number; avg_response_time: number }[];
  return rows.map(r => ({ date: r.date, queries: r.queries, avgResponseTime: r.avg_response_time }));
}

export function getQueryLogStats(userId?: string): { totalQueries: number; avgResponseTime: number; queriesLast24h: number } {
  const d = getAdminDb();
  initQueryLogsTable();
  const userFilter = userId ? ' WHERE user_id = ?' : '';
  const userFilterAnd = userId ? ' AND user_id = ?' : '';
  const totalParams = userId ? [userId] : [];
  const total = d.prepare(`SELECT COUNT(*) as cnt, CAST(AVG(response_time_ms) AS INTEGER) as avg FROM query_logs${userFilter}`).get(...totalParams) as { cnt: number; avg: number };
  const since24h = new Date(Date.now() - 86400000).toISOString();
  const last24hParams = userId ? [since24h, userId] : [since24h];
  const last24h = (d.prepare(`SELECT COUNT(*) as cnt FROM query_logs WHERE timestamp >= ?${userFilterAnd}`).get(...last24hParams) as { cnt: number }).cnt;
  return { totalQueries: total.cnt || 0, avgResponseTime: total.avg || 0, queriesLast24h: last24h || 0 };
}
