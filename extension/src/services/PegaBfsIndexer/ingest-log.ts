/**
 * Ingest logging helpers for the BFS indexer — surface backend rejections and
 * network failures with enough rule identity for individual retry.
 */

import type { PegaStreamIngester } from "../PegaStreamIngester";
import type { LogFn } from "./types";

type IngestSingleRuleResult = Awaited<ReturnType<PegaStreamIngester["ingestSingleRule"]>>;

/**
 * Backend answered but did NOT store the rule. ingestSingleRule is silent on
 * success (to avoid per-rule log spam across thousands of rules) — surface only
 * backend-reported NON-success so a silently-rejected ingest is visible instead
 * of looking like "nothing happened".
 */
export function logIngestRejection(
  log: LogFn, result: IngestSingleRuleResult,
  ruleJson: Record<string, unknown>, sourceFile?: string,
): void {
  const pzInsKey = String(ruleJson.pzInsKey ?? ruleJson.insKey ?? '');
  const pxObjClass = String(ruleJson.pxObjClass ?? '');
  const pyRuleName = String(ruleJson.pyRuleName ?? '');
  const icon = result.reason === 'checksum_match' ? 'ℹ️' : '⚠️';
  const suffix = sourceFile && icon === '⚠️' ? ` | file=${sourceFile}` : '';
  log(`[Pega Ingester] ${icon} Backend did not store rule (status=${result.status}, ruleId=${result.ruleId ?? 'none'}${result.reason ? `, reason=${result.reason}` : ''}) insKey=${pzInsKey} pxObjClass=${pxObjClass} pyRuleName=${pyRuleName}${suffix}`);
}

/**
 * Ingest POST crashed. undici reports generic "fetch failed"; the real cause
 * (ECONNREFUSED, 401, body-too-large…) lives in err.cause — surface it or the
 * failure is un-diagnosable from the log alone. Include the rule identity so
 * the failed rule can be re-ingested individually (Pega Ingester panel).
 */
export function logIngestCrash(
  log: LogFn, err: any, ruleJson: Record<string, unknown>, sourceFile?: string,
): void {
  const cause = err?.cause ? ` (cause: ${err.cause.message ?? err.cause})` : "";
  const pzInsKey = String(ruleJson.pzInsKey ?? ruleJson.insKey ?? '');
  const pxObjClass = String(ruleJson.pxObjClass ?? '');
  const pyRuleName = String(ruleJson.pyRuleName ?? '');
  log(`[Pega Ingester] ❌ Ingest POST failed (skipping): ${err.message}${cause} | insKey=${pzInsKey} pxObjClass=${pxObjClass} pyRuleName=${pyRuleName}${sourceFile ? ` | file=${sourceFile}` : ""}`);
}
