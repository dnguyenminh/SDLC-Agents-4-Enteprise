/**
 * Enrichment status service bootstrap (SA4E-157) — creates the polling
 * service, starts it on authentication, and registers the related commands.
 * Extracted from extension.ts initializeWorkspace (BR-18 file-size limit).
 */
import * as vscode from "vscode";
import { runtime } from "./state";
import { registerEnrichmentCommands } from "./enrichment-commands";

/**
 * Create + start the EnrichmentStatusService and register its commands.
 * Non-fatal: any init failure is logged to the output channel only.
 */
export async function registerEnrichmentFeatures(
  context: vscode.ExtensionContext,
  backendUrl: string,
  outputChannel: vscode.OutputChannel,
): Promise<void> {
  try {
    const { IndexerHttpClient } = await import('../../services/IndexerHttpClient');
    const { EnrichmentStatusService } = await import('../../services/EnrichmentStatusService');
    const enrichmentClient = new IndexerHttpClient(backendUrl);
    const enrichmentService = new EnrichmentStatusService(
      enrichmentClient,
      () => runtime.authManager?.getTokenSync(),
      outputChannel,
    );
    // Only start polling after user authenticates (enrichment data is per-user)
    if (runtime.authManager?.isAuthenticated) {
      enrichmentService.start();
    }
    runtime.authManager?.onStateChange((state) => {
      if (state === "AUTHENTICATED") { enrichmentService.start(); }
    });
    context.subscriptions.push(enrichmentService);
    // Show KB ingest status (index/parse progress + LLM enrichment) in Output.
    // Indexing is asynchronous: /api/index/source only uploads; the server then
    // parses (index/progress) and enriches via LLM (enrichment/status) in the
    // background. This command lets the user poll both halves on demand.
    registerEnrichmentCommands({ context, enrichmentClient, enrichmentService, outputChannel }, backendUrl);
  } catch (err) {
    outputChannel.appendLine(`[EnrichmentStatus] Init failed: ${(err as Error).message}`);
  }
}
