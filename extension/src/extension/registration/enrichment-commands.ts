/**
 * Enrichment command registrations (SA4E-157/160/169/338).
 * Extracted from extension.ts (BR-18 file-size limit) — identical handlers,
 * same command IDs, same messages.
 */
import * as vscode from "vscode";
import type { IndexerHttpClient } from "../../services/IndexerHttpClient";
import type { EnrichmentStatusService } from "../../services/EnrichmentStatusService";
import { getProjectId } from "./project-id";
import { runtime } from "./state";
import { printEnrichmentFailures } from "./enrichment-failures";

export interface EnrichmentCommandCtx {
  context: vscode.ExtensionContext;
  enrichmentClient: IndexerHttpClient;
  enrichmentService: EnrichmentStatusService;
  outputChannel: vscode.OutputChannel;
}

/** Register all KB-ingest/enrichment commands (SA4E-157/160/169). */
export function registerEnrichmentCommands(ctx: EnrichmentCommandCtx, backendUrl: string): void {
  ctx.context.subscriptions.push(
    vscode.commands.registerCommand('sdlcAgents.showIndexStatus', () => showIndexStatus(ctx))
  );
  ctx.context.subscriptions.push(
    vscode.commands.registerCommand('sa4e.showEnrichmentStatus', () => showEnrichmentStatus(ctx))
  );
  ctx.context.subscriptions.push(
    vscode.commands.registerCommand('sa4e.retryFailedEnrichment', async () => {
      await retryFailedEnrichment(ctx, backendUrl);
    })
  );
  ctx.context.subscriptions.push(
    vscode.commands.registerCommand('sa4e.showEnrichmentFailures', async () => {
      await showEnrichmentFailures(ctx);
    })
  );
}

/** KB Ingest Status — index/parse progress + LLM enrichment + failure detail. */
async function showIndexStatus(ctx: EnrichmentCommandCtx): Promise<void> {
  const token = runtime.authManager?.getTokenSync();
  ctx.outputChannel.show(true);
  ctx.outputChannel.appendLine(`\n=== KB Ingest Status @ ${new Date().toLocaleTimeString()} ===`);

  // 1. Code index / parse progress (synchronous phase on the server)
  try {
    const prog = await ctx.enrichmentClient.getIndexProgress(token);
    if (!prog.ok) {
      ctx.outputChannel.appendLine(`Index progress: ⚠️ unreachable (verify server is running)`);
    } else {
      try {
        const p = JSON.parse(prog.body);
        const phase = p.phase ?? p.status ?? 'idle';
        const pct = typeof p.percentage === 'number' ? ` ${p.percentage}%` : '';
        const counts = (typeof p.current === 'number' && typeof p.total === 'number')
          ? ` (${p.current}/${p.total} files)` : '';
        const cur = p.currentFile ? ` — ${p.currentFile}` : '';
        ctx.outputChannel.appendLine(`Index parse: ${phase}${pct}${counts}${cur}`);
      } catch {
        ctx.outputChannel.appendLine(`Index parse: ${prog.body.slice(0, 300)}`);
      }
    }
  } catch (err: any) {
    ctx.outputChannel.appendLine(`Index progress error: ${err?.message ?? String(err)}`);
  }

  // 2. LLM enrichment status (async KB ingest phase)
  const status = await ctx.enrichmentService.pollNow();
  if (!status) {
    ctx.outputChannel.appendLine('Enrichment: ⚠️ unreachable or no data yet.');
    vscode.window.showWarningMessage('KB ingest status partially available — see Output > Kiro.');
    return;
  }
  ctx.outputChannel.appendLine(
    `Enrichment: ${status.state} — ${status.completedRules}/${status.totalRules}` +
    ` (${status.percent}%), pending ${status.pendingRules}, failed ${status.failedRules}`,
  );

  // 3. Full failure detail (every failed rule/symbol, not just the latest 10).
  if (status.failedRules > 0) {
    await printEnrichmentFailures(ctx.enrichmentClient, ctx.outputChannel, token);
  }

  vscode.window.showInformationMessage(
    `KB ingest — enrichment ${status.state}: ${status.completedRules}/${status.totalRules} (${status.percent}%). See Output > Kiro.`,
  );
}

/** Open the Enrichment Dashboard WebView panel (SA4E-169). */
async function showEnrichmentStatus(ctx: EnrichmentCommandCtx): Promise<void> {
  const status = await ctx.enrichmentService.pollNow();
  if (!status) {
    vscode.window.showErrorMessage('Cannot reach backend. Verify server is running.');
    return;
  }
  const { openEnrichmentDashboard } = await import('../../panels/enrichment-dashboard-panel');
  openEnrichmentDashboard(ctx.context.extensionUri, ctx.enrichmentService.buildDashboardData(status));
}

/**
 * SA4E-160: Retry failed enrichment tasks command.
 * SA4E-338 rev B: the backend admin-gates this route and scopes it to the
 * X-Project-Id header. Guard client-side so the user gets a clear message
 * instead of a raw 401/403: require a login token (→ CONFIG_EDIT check) and a
 * resolved project id (no project = nothing to scope the retry to).
 */
async function retryFailedEnrichment(ctx: EnrichmentCommandCtx, backendUrl: string): Promise<void> {
  try {
    const token = runtime.authManager?.getTokenSync() || '';
    if (!token) {
      vscode.window.showWarningMessage('Please sign in before retrying enrichment — this action requires an authenticated admin (CONFIG_EDIT).');
      return;
    }
    const projectId = getProjectId();
    if (!projectId) {
      vscode.window.showWarningMessage('Retry All is unavailable without an active project. Open a workspace/project, then try again.');
      return;
    }
    const res = await fetch(`${backendUrl}/api/v1/enrichment/retry-failed`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Project-Id': projectId,
      },
    });
    if (res.status === 401) {
      vscode.window.showErrorMessage('Retry failed: session expired. Please sign in again.');
      return;
    }
    if (res.status === 403) {
      vscode.window.showErrorMessage('Retry failed: your account lacks the required permission (CONFIG_EDIT).');
      return;
    }
    if (!res.ok) {
      vscode.window.showErrorMessage(`Retry failed: HTTP ${res.status}`);
      return;
    }
    const json = (await res.json()) as any;
    const count = json.data?.resetCount ?? 0;
    vscode.window.showInformationMessage(`${count} failed tasks queued for retry. Enrichment will resume shortly.`);
    await ctx.enrichmentService.pollNow();
    return;
  } catch (err: any) {
    vscode.window.showErrorMessage(`Retry failed: ${err.message}`);
  }
}

/** Show enrichment failures details command (SA4E-157). */
async function showEnrichmentFailures(ctx: EnrichmentCommandCtx): Promise<void> {
  try {
    const status = await ctx.enrichmentService.pollNow();
    if (!status) {
      vscode.window.showErrorMessage('Cannot reach backend for enrichment status.');
      return;
    }
    const output = vscode.window.createOutputChannel('Kiro Enrichment Failures');
    output.clear();
    output.appendLine(`Enrichment state: ${status.state}`);
    output.appendLine(`Total: ${status.totalRules}, Completed: ${status.completedRules}, Failed: ${status.failedRules}`);
    output.appendLine('');
    if (status.recentFailures && status.recentFailures.length > 0) {
      output.appendLine(JSON.stringify(status.recentFailures, null, 2));
    } else {
      output.appendLine('No recent failures recorded.');
    }
    output.show(true);
    vscode.window.showInformationMessage('Enrichment failures logged to Output > Kiro Enrichment Failures', 'Retry Failed').then((selection) => {
      if (selection === 'Retry Failed') {
        vscode.commands.executeCommand('sa4e.retryFailedEnrichment');
      }
    });
  } catch (err: any) {
    vscode.window.showErrorMessage(`Failed to fetch failures: ${err.message}`);
  }
}
