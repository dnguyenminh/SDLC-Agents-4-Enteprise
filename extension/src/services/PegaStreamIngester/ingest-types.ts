/**
 * Type contracts for the Pega NDJSON stream ingester (SA4E-94, SA4E-156).
 */

/** Result returned by backend after job completes */
export interface StreamIngestResult {
  stored: number;
  totalRulesInDb?: number;
  totalKbEntriesInDb?: number;
  totalGraphNodesInDb?: number;
  nextBatch?: Array<{ insKey: string; pxObjClass: string; pyClassName: string; pyRuleName: string }>;
}

/** Metadata line sent as first NDJSON record */
export interface StreamMetadata {
  __meta: true;
  projectId: string;
  checksums: Record<string, string>;
  versions: Record<string, string>;
  visitedKeys: string[];
}

/** Job status response from GET /pega/jobs/:id */
export interface JobStatusResponse {
  data: {
    status: 'processing' | 'done' | 'failed';
    progress: { processed: number; total: number };
    result: StreamIngestResult | null;
    error: string | null;
  } | null;
  error: { code: string; message: string } | null;
}

/** SA4E-156: Response from POST /api/v1/pega/ingest-rule */
export interface IngestSingleRuleResult {
  status: string;
  ruleId?: number;
  unresolvedDependencies: Array<{ insKey?: string | null; ruleType: string; className: string; ruleName: string }>;
  reason?: string;
}

/** SA4E-156: Full envelope from POST /api/v1/pega/ingest-rule */
export interface IngestSingleRuleResponse {
  data: IngestSingleRuleResult | null;
  error: { code: string; message: string } | null;
}

export type LogFn = (msg: string) => void;

/** Polling interval in milliseconds */
export const POLL_INTERVAL_MS = 3_000;
