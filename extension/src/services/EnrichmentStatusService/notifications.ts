/**
 * Enrichment completion notifications (BR-06: once per enrichment cycle).
 * Extracted from EnrichmentStatusService; output channel is injected.
 */

import * as vscode from 'vscode';
import type { EnrichmentStatusResponse } from '../enrichment-status-schema';

/** Show one-time completion/error notification. */
export function showCompletionNotification(
  response: EnrichmentStatusResponse, outputChannel: vscode.OutputChannel,
): void {
  if (response.failedRules === 0) {
    const msg = 'Enrichment complete: ' + response.totalRules + ' rules enriched. KB is ready.';
    vscode.window.showInformationMessage(msg);
  } else {
    const msg = 'Enrichment complete: ' + response.completedRules + '/' + response.totalRules + ' rules enriched. ' + response.failedRules + ' rules failed.';
    vscode.window.showWarningMessage(msg, 'Retry Failed', 'Show Details').then((action) => {
      if (action === 'Show Details') { outputChannel.show(); }
      if (action === 'Retry Failed') { vscode.commands.executeCommand('sa4e.retryFailedEnrichment'); }
    });
  }
}
