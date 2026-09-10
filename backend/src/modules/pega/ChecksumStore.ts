/**
 * SA4E-241 — ChecksumStore. Backend-side checksum state (NT-4/NT-5).
 * Responsibilities (SRP): query which of a given checksum set already exist in a
 * project's `files.content_hash`, scoped to the AUTHENTICATED identity project.
 *
 * ⛔ This store NEVER computes a checksum (NT-4) — it only stores/compares.
 * The single comparison key is `content_hash` (NT-3/NT-5), used uniformly for
 * Pega rules, code and documents.
 */
import type { QueryDatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

/** Max checksums per SQL statement — avoids "too many SQL variables" limits. */
const QUERY_BATCH = 900;

/**
 * ChecksumStore — lookup/store checksums in `files.content_hash` per project.
 * DIP: depends on the QueryDatabaseAdapter abstraction (cross-engine).
 */
export class ChecksumStore {
  constructor(private readonly db: QueryDatabaseAdapter) {}

  /**
   * Return the subset of `checksums` that already exist in the project.
   * Scope is the authenticated `projectId` (caller MUST pass identity, never body).
   * @param projectId - Authenticated identity project id (scope, NT-3 unique-in-project)
   * @param checksums - Candidate checksums to test for existence
   * @returns Checksums present in `files.content_hash` for this project (deduped)
   */
  async findExisting(projectId: string, checksums: string[]): Promise<string[]> {
    if (!projectId || checksums.length === 0) { return []; }
    const found = new Set<string>();
    for (const batch of chunk(checksums, QUERY_BATCH)) {
      const rows = await this.queryBatch(projectId, batch);
      for (const r of rows) { if (r.content_hash) { found.add(r.content_hash); } }
    }
    return [...found];
  }

  /**
   * Query one batch of checksums. Placeholders are generated positionally so the
   * same SQL runs on SQLite (`?`) and Postgres (`$n` normalized upstream).
   * SQL is fully parameterized (no interpolation of values) — no SQL injection.
   */
  private async queryBatch(projectId: string, batch: string[]): Promise<Array<{ content_hash: string }>> {
    const placeholders = batch.map((_, i) => `$${i + 2}`).join(', ');
    const sql =
      `SELECT content_hash FROM files WHERE project_id = $1 AND content_hash IN (${placeholders})`;
    return this.db.allAsync<{ content_hash: string }>(sql, [projectId, ...batch]);
  }
}

/** Split an array into fixed-size chunks (last chunk may be smaller). */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) { out.push(arr.slice(i, i + size)); }
  return out;
}
