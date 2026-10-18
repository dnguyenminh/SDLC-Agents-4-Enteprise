/**
 * EnrichmentStatusBarView — renders enrichment status on the StatusBarItem (BR-05).
 * Extracted view collaborator of EnrichmentStatusService; owns the item lifecycle.
 */

import * as vscode from 'vscode';
import type { EnrichmentStatusResponse } from '../enrichment-status-schema';
import { buildSparkline, computeSparklineEta } from './sparkline';

export class EnrichmentStatusBarView {
  private readonly statusBarItem: vscode.StatusBarItem;

  constructor() {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    // Do NOT show until start() is called (requires auth)
    this.updateStatusBarIdle();
  }

  dispose(): void {
    this.statusBarItem.dispose();
  }

  /** Show the status bar item (called from start() — requires auth). */
  show(): void {
    this.statusBarItem.show();
  }

  /** Update StatusBarItem text/tooltip per BR-05. */
  update(response: EnrichmentStatusResponse, buffer: number[], sparklineIndex: number): void {
    switch (response.state) {
      case 'running':
        this.updateRunning(response, buffer, sparklineIndex);
        break;
      case 'error':
        this.updateError(response);
        break;
      default:
        this.updateStatusBarIdle();
        break;
    }
  }

  private updateRunning(
    response: EnrichmentStatusResponse, buffer: number[], sparklineIndex: number,
  ): void {
    this.statusBarItem.text = '$(sync~spin) Enriching: ' + response.completedRules + '/' + response.totalRules + ' (' + response.percent + '%)';
    this.statusBarItem.tooltip = this.buildRunningMarkdownTooltip(response, buffer, sparklineIndex);
    this.statusBarItem.command = 'sa4e.showEnrichmentStatus';
    this.statusBarItem.color = undefined;
  }

  private updateError(response: EnrichmentStatusResponse): void {
    this.statusBarItem.text = '$(warning) KB: ' + response.failedRules + ' failed';
    const md = new vscode.MarkdownString(this.buildFailureLines(response).join('\n'));
    md.isTrusted = true;
    this.statusBarItem.tooltip = md;
    this.statusBarItem.command = 'sa4e.showEnrichmentFailures';
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
  }

  private buildFailureLines(response: EnrichmentStatusResponse): string[] {
    const failureLines: string[] = [];
    failureLines.push('**Enrichment completed with errors**');
    failureLines.push('');
    failureLines.push(`${response.failedRules} rules failed`);
    failureLines.push('');
    if (response.recentFailures && response.recentFailures.length > 0) {
      failureLines.push('**Recent failures:**');
      for (const f of response.recentFailures.slice(0, 10)) {
        const name = f.symbolName || `task-${f.taskId}`;
        const err = f.error ? f.error.slice(0, 200) : 'Unknown error';
        failureLines.push(`- \`${name}\`: ${err}`);
      }
      if (response.failedRules > response.recentFailures.length) {
        failureLines.push(`…and ${response.failedRules - response.recentFailures.length} more`);
      }
    }
    failureLines.push('');
    failureLines.push('Click to view detailed failures in Output Channel');
    return failureLines;
  }

  private updateStatusBarIdle(): void {
    this.statusBarItem.text = '$(database) KB: Ready';
    // Click opens the on-demand KB ingest status report (index/parse + enrichment).
    this.statusBarItem.tooltip = 'Knowledge Base enrichment is idle — click to view ingest status';
    this.statusBarItem.command = 'sdlcAgents.showIndexStatus';
    this.statusBarItem.color = undefined;
  }

  /** Degrade the status bar to offline (EF-1: repeated poll failures). */
  markOffline(): void {
    this.statusBarItem.text = '$(warning) KB: Offline';
    this.statusBarItem.tooltip = 'Cannot reach backend';
    this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
  }

  private buildRunningMarkdownTooltip(
    r: EnrichmentStatusResponse, buffer: number[], sparklineIndex: number,
  ): vscode.MarkdownString {
    const lines: string[] = [];
    lines.push('**LLM Enrichment in progress**');
    lines.push('');
    this.pushElapsedLine(lines, r);
    // ETA based on actual throughput (items/s from sparkline)
    const remaining = r.totalRules - r.completedRules - r.failedRules;
    const etaStr = computeSparklineEta(buffer, sparklineIndex, remaining);
    if (etaStr) { lines.push('ETA: ~' + etaStr + ' remaining (' + remaining + ' items left)'); }
    if (r.failedRules > 0) { lines.push('Failed: ' + r.failedRules); }
    lines.push('Progress: ' + r.completedRules + '/' + r.totalRules + ' (' + r.percent + '%)');

    // Sparkline: throughput over last 60s
    const sparkline = buildSparkline(buffer, sparklineIndex);
    if (sparkline) { lines.push(''); lines.push('`' + sparkline + '`'); }

    // Active tasks
    this.pushActiveTaskLines(lines, r);

    const md = new vscode.MarkdownString(lines.join('\n\n'));
    md.isTrusted = true;
    return md;
  }

  /** Elapsed-time line for the running tooltip (when startAt is parseable). */
  private pushElapsedLine(lines: string[], r: EnrichmentStatusResponse): void {
    if (r.startedAt) {
      const startDate = new Date(r.startedAt);
      if (!isNaN(startDate.getTime())) {
        const elapsed = Date.now() - startDate.getTime();
        const mins = Math.floor(elapsed / 60000);
        const hrs = Math.floor(mins / 60);
        const elapsedStr = hrs > 0 ? `${hrs}h ${mins % 60}m` : `${mins}m`;
        lines.push('Running: ' + elapsedStr);
      }
    }
  }

  /** Active-task lines for the running tooltip. */
  private pushActiveTaskLines(lines: string[], r: EnrichmentStatusResponse): void {
    const activeTasks = r.activeTasks;
    if (activeTasks && activeTasks.length > 0) {
      lines.push('');
      lines.push('**Processing:**');
      for (const task of activeTasks.slice(0, 5)) {
        const shortSource = task.source.length > 45 ? '…' + task.source.slice(-43) : task.source;
        lines.push('- ⚡ `' + shortSource + '`');
      }
    }
  }
}
