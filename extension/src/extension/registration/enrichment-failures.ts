/**
 * Enrichment failure-detail printing (SA4E-157).
 * Extracted from extension.ts (BR-18 file-size limit).
 */
import * as vscode from "vscode";
import type { IndexerHttpClient } from "../../services/IndexerHttpClient";

/**
 * Fetch and print the full list of FAILED enrichment tasks to the Output channel.
 * Surfaces every failed rule/symbol (bounded by the server's limit) with its error,
 * so users can diagnose ingest problems that the 10-item status tooltip hides.
 * Non-fatal: logs a notice and returns on any transport/validation failure.
 */
export async function printEnrichmentFailures(
  client: IndexerHttpClient,
  outputChannel: vscode.OutputChannel,
  token: string | undefined,
): Promise<void> {
  const { EnrichmentFailuresResponseSchema } = await import('../../services/enrichment-status-schema');
  const resp = await client.getEnrichmentFailures(200, token);
  if (!resp.ok) {
    outputChannel.appendLine('Failures: ⚠️ could not fetch failure details.');
    return;
  }
  const parsed = EnrichmentFailuresResponseSchema.safeParse(JSON.parse(resp.body));
  if (!parsed.success) {
    outputChannel.appendLine('Failures: ⚠️ unexpected response shape.');
    return;
  }
  const { failures, count } = parsed.data;
  outputChannel.appendLine(`Failed tasks (${count}):`);
  for (const f of failures) { outputChannel.appendLine(formatFailureLine(f)); }
}

/** Format a single failed-task line: source, retry count, timestamp, and error. */
function formatFailureLine(
  f: import('../../services/enrichment-status-schema').EnrichmentFailure,
): string {
  const when = f.completedAt ? ` @ ${f.completedAt}` : '';
  const retries = f.retryCount > 0 ? ` (retries: ${f.retryCount})` : '';
  const err = f.error ? f.error.replace(/\s+/g, ' ').trim() : 'Unknown error';
  return `  • ${f.source}${retries}${when}\n      ${err}`;
}
