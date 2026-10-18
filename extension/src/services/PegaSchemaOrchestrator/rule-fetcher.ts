/**
 * Harness RuleForm fetch for schema orchestration (SA4E-214).
 */

import type { PegaHttpClient } from '../PegaHttpClient';

/** Fetch harness RuleForm JSON from Pega server via extension HTTP client. */
export async function fetchHarnessRuleForm(
  pegaClient: PegaHttpClient,
  ruleType: string,
  log: (msg: string) => void,
): Promise<Record<string, unknown> | null> {
  try {
    const harnessName = `${ruleType.replace(/^Rule-/, '')}RuleForm`;
    const result = await pegaClient.queryRuleByTriple(
      'Rule-HTML-Harness', ruleType, harnessName,
    );
    return result || null;
  } catch (err: any) {
    log(`[Schema] ⚠️ Harness fetch failed for ${ruleType}: ${err.message}`);
    return null;
  }
}
