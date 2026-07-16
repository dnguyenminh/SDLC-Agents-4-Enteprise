/**
 * SA4E-42 — per-event re-index metrics (BR-11 observability).
 */
export interface ReindexResult {
  server: string;
  upserted: number;
  removed: number;
  elapsedMs: number;
}
