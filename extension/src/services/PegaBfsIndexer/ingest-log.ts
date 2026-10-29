/**
 * Ingest logging helpers for the BFS indexer — surface backend rejections and
 * network failures with enough rule identity for individual retry.
 */

import type { PegaStreamIngester, IngestRejectedError } from "../PegaStreamIngester";
import type { LogFn } from "./types";
import { describeFetchError } from "../../utils/http-client-utils";

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
  log: LogFn, err: any, ruleJson: Record<string, unknown>, backendUrl: string, sourceFile?: string,
): void {
  const detail = describeFetchError(err);
  // Log the FULL target URL (host:port + path), not just the relative path, so a
  // UND_ERR_SOCKET / ECONNREFUSED is traceable to the exact backend the request
  // went to — loopback vs a misconfigured/remote sdlcAgents.backend.url.
  const endpoint = `${backendUrl}/api/v1/pega/ingest-rule`;
  const pzInsKey = String(ruleJson.pzInsKey ?? ruleJson.insKey ?? '');
  const pxObjClass = String(ruleJson.pxObjClass ?? '');
  const pyRuleName = String(ruleJson.pyRuleName ?? '');
  log(`[Pega Ingester] ❌ Ingest POST failed (skipping): ${detail} | endpoint=${endpoint} | insKey=${pzInsKey} pxObjClass=${pxObjClass} pyRuleName=${pyRuleName}${sourceFile ? ` | file=${sourceFile}` : ""}`);
}

/**
 * Backend returned a CLASSIFIED failure envelope (code + category + retryable).
 * Unlike logIngestCrash (opaque network failure), here the server told us the
 * exact cause — surface it verbatim so the operator never needs the server log.
 * `retryable=true` is flagged so a transient fault reads differently from a
 * permanent skip.
 */
export function logIngestClassified(
  log: LogFn, err: IngestRejectedError, ruleJson: Record<string, unknown>, sourceFile?: string,
): void {
  const pzInsKey = String(ruleJson.pzInsKey ?? ruleJson.insKey ?? '');
  const pxObjClass = String(ruleJson.pxObjClass ?? '');
  const pyRuleName = String(ruleJson.pyRuleName ?? '');
  const icon = err.retryable ? '🔁' : '❌';
  const verdict = err.retryable ? 'transient (retryable)' : 'permanent (skipped)';
  log(`[Pega Ingester] ${icon} Backend rejected rule — ${verdict} | code=${err.code} category=${err.category} errorName=${err.errorName} httpStatus=${err.httpStatus} | reason="${err.message}" | insKey=${pzInsKey} pxObjClass=${pxObjClass} pyRuleName=${pyRuleName}${sourceFile ? ` | file=${sourceFile}` : ""}`);
}
