/**
 * SA4E-157 — Enrichment Status Polling Service.
 * Polls backend for enrichment progress, manages state transitions,
 * drives StatusBarItem display + completion notifications.
 */

import * as vscode from 'vscode';
import type { IndexerHttpClient } from './IndexerHttpClient';
import { EnrichmentStatusResponseSchema } from './enrichment-status-schema';
import type { EnrichmentStatusResponse, EnrichmentState } from './enrichment-status-schema';

// BR-04: Polling intervals per state
const IDLE_INTERVAL = 30000;
const RUNNING_INTERVAL = 5000;
const ERROR_INTERVAL = 15000;
const MAX_CONSECUTIVE_FAILURES = 3;

/**
 * Polls backend enrichment status, updates VS Code StatusBarItem,
 * and shows completion/error notifications (BR-06: once per cycle).
 */
export class EnrichmentStatusService implements vscode.Disposable {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly statusBarItem: vscode.StatusBarItem;
  private currentState: EnrichmentState = 'idle';
  private previousState: EnrichmentState = 'idle';
  private lastNotifiedState: EnrichmentState | null = null;
  private consecutiveFailures = 0;
  private currentInterval = IDLE_INTERVAL;
  private readonly outputChannel: vscode.OutputChannel;
  /** Sparkline: ring buffer of completions-per-interval over last 60s (12 slots × 5s). */
  private readonly sparklineBuffer: number[] = new Array(12).fill(0);
  private sparklineIndex = 0;
  private lastCompletedCount = 0;

  constructor(
    private readonly httpClient: IndexerHttpClient,
    private readonly tokenProvider: () => string | undefined,
    outputChannel: vscode.OutputChannel,
  ) {
    this.outputChannel = outputChannel;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    // Do NOT show until start() is called (requires auth)
    this.updateStatusBarIdle();
  }

  /** Start polling (called after user authenticates). Polls immediately, then on interval. */
  start(): void {
    this.statusBarItem.show();
    this.executePoll(); // Immediate first poll — don't wait 30s
    this.schedulePoll(this.currentInterval);
  }

  /** Dispose timer + StatusBarItem (BR-11: no orphan intervals). */
  dispose(): void {
    this.clearTimer();
    this.statusBarItem.dispose();
  }

  /** Force immediate poll — used by UC-4 command handler. */
  async pollNow(): Promise<EnrichmentStatusResponse | null> {
    return this.executePoll();
  }

  private schedulePoll(intervalMs: number): void {
    this.clearTimer();
    this.currentInterval = intervalMs;
    this.timer = setInterval(() => { this.executePoll(); }, intervalMs);
  }

  private clearTimer(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  /** Execute a single poll cycle. Returns parsed response or null on failure. */
  private async executePoll(): Promise<EnrichmentStatusResponse | null> {
    try {
      const token = this.tokenProvider();
      this.log('[EnrichmentPoll] Polling... token=' + (token ? 'present' : 'NONE'));
      const { ok, body } = await this.httpClient.getEnrichmentStatus(token);
      this.log('[EnrichmentPoll] Response ok=' + ok + ' bodyLen=' + (body?.length ?? 0));

      if (!ok) {
        this.log('[EnrichmentPoll] FAIL: non-200. body=' + (body || '').slice(0, 200));
        this.handlePollFailure('Backend returned non-200');
        return null;
      }

      const parsed = EnrichmentStatusResponseSchema.safeParse(JSON.parse(body));
      if (!parsed.success) {
        this.log('[EnrichmentPoll] Zod FAIL: ' + parsed.error.message);
        return null;
      }

      this.log('[EnrichmentPoll] OK state=' + parsed.data.state + ' pending=' + parsed.data.pendingRules + ' failed=' + parsed.data.failedRules);
      this.consecutiveFailures = 0;
      this.processResponse(parsed.data);
      return parsed.data;
    } catch (err: any) {
      this.log('[EnrichmentPoll] EXCEPTION: ' + err.message);
      this.handlePollFailure(err.message);
      return null;
    }
  }

  /** Process a successful response — detect transitions, update UI. */
  private processResponse(response: EnrichmentStatusResponse): void {
    this.previousState = this.currentState;
    this.currentState = response.state;

    // Update sparkline: track completions delta per poll interval
    if (response.state === 'running') {
      const delta = Math.max(0, response.completedRules - this.lastCompletedCount);
      this.sparklineBuffer[this.sparklineIndex % 12] = delta;
      this.sparklineIndex++;
    } else if (this.previousState === 'running') {
      // Reset sparkline when leaving running state
      this.sparklineBuffer.fill(0);
      this.sparklineIndex = 0;
    }
    this.lastCompletedCount = response.completedRules;

    if (this.previousState !== this.currentState) {
      this.handleStateTransition(this.previousState, this.currentState, response);
      this.adjustInterval(this.currentState);
    }

    this.updateStatusBar(response);
    // SA4E-169: Auto-update dashboard panel if open
    this.updateDashboardPanel(response);
  }

  /** Handle state transition — show notifications (BR-06: once per cycle). */
  private handleStateTransition(
    prev: EnrichmentState, curr: EnrichmentState, response: EnrichmentStatusResponse,
  ): void {
    const msg = 'State: ' + prev + ' -> ' + curr + ' (' + response.totalRules + ' rules, ' + response.failedRules + ' failed)';
    this.log(msg);

    // BR-06: Show completion notification ONCE per enrichment cycle
    if (prev === 'running' && (curr === 'complete' || curr === 'error')) {
      if (this.lastNotifiedState !== curr) {
        this.lastNotifiedState = curr;
        this.showCompletionNotification(response);
      }
    }

    // Reset notification tracking when new cycle starts
    if (curr === 'running' && prev !== 'running') {
      this.lastNotifiedState = null;
    }
  }

  /** Show one-time completion/error notification. */
  private showCompletionNotification(response: EnrichmentStatusResponse): void {
    if (response.failedRules === 0) {
      const msg = 'Enrichment complete: ' + response.totalRules + ' rules enriched. KB is ready.';
      vscode.window.showInformationMessage(msg);
    } else {
      const msg = 'Enrichment complete: ' + response.completedRules + '/' + response.totalRules + ' rules enriched. ' + response.failedRules + ' rules failed.';
      vscode.window.showWarningMessage(msg, 'Retry Failed', 'Show Details').then((action) => {
        if (action === 'Show Details') { this.outputChannel.show(); }
        if (action === 'Retry Failed') { vscode.commands.executeCommand('sa4e.retryFailedEnrichment'); }
      });
    }
  }

  /** Update StatusBarItem text/tooltip per BR-05. */
  private updateStatusBar(response: EnrichmentStatusResponse): void {
    switch (response.state) {
      case 'running':
        this.statusBarItem.text = '$(sync~spin) Enriching: ' + response.completedRules + '/' + response.totalRules + ' (' + response.percent + '%)';
        this.statusBarItem.tooltip = this.buildRunningMarkdownTooltip(response);
        this.statusBarItem.command = 'sa4e.showEnrichmentStatus';
        this.statusBarItem.color = undefined;
        break;
      case 'error':
        this.statusBarItem.text = '$(warning) KB: ' + response.failedRules + ' failed';
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
        const md = new vscode.MarkdownString(failureLines.join('\n'));
        md.isTrusted = true;
        this.statusBarItem.tooltip = md;
        this.statusBarItem.command = 'sa4e.showEnrichmentFailures';
        this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
        break;
      default:
        this.updateStatusBarIdle();
        break;
    }
  }

  private updateStatusBarIdle(): void {
    this.statusBarItem.text = '$(database) KB: Ready';
    this.statusBarItem.tooltip = 'Knowledge Base enrichment is idle';
    this.statusBarItem.command = undefined;
    this.statusBarItem.color = undefined;
  }

  private buildRunningMarkdownTooltip(r: EnrichmentStatusResponse): vscode.MarkdownString {
    const lines: string[] = [];
    lines.push('**LLM Enrichment in progress**');
    lines.push('');
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
    // ETA based on actual throughput (items/s from sparkline)
    const remaining = r.totalRules - r.completedRules - r.failedRules;
    const etaStr = this.computeSparklineEta(remaining);
    if (etaStr) { lines.push('ETA: ~' + etaStr + ' remaining (' + remaining + ' items left)'); }
    if (r.failedRules > 0) { lines.push('Failed: ' + r.failedRules); }
    lines.push('Progress: ' + r.completedRules + '/' + r.totalRules + ' (' + r.percent + '%)');

    // Sparkline: throughput over last 60s
    const sparkline = this.buildSparkline();
    if (sparkline) { lines.push(''); lines.push('`' + sparkline + '`'); }

    // Active tasks
    const activeTasks = r.activeTasks;
    if (activeTasks && activeTasks.length > 0) {
      lines.push('');
      lines.push('**Processing:**');
      for (const task of activeTasks.slice(0, 5)) {
        const shortSource = task.source.length > 45 ? '…' + task.source.slice(-43) : task.source;
        lines.push('- ⚡ `' + shortSource + '`');
      }
    }

    const md = new vscode.MarkdownString(lines.join('\n\n'));
    md.isTrusted = true;
    return md;
  }

  /** Build sparkline using Unicode block chars from ring buffer. */
  private buildSparkline(): string | null {
    const blocks = ' ▁▂▃▄▅▆▇█';
    const filled = Math.min(this.sparklineIndex, 12);
    if (filled < 2) return null;
    // Get ordered values (oldest → newest)
    const values: number[] = [];
    for (let i = 0; i < filled; i++) {
      const idx = (this.sparklineIndex - filled + i) % 12;
      values.push(this.sparklineBuffer[idx < 0 ? idx + 12 : idx]);
    }
    const max = Math.max(...values, 1);
    const chart = values.map((v) => blocks[Math.round((v / max) * 8)]).join('');
    const totalInWindow = values.reduce((a, b) => a + b, 0);
    const avgPerSec = (totalInWindow / (filled * 5)).toFixed(1);
    return chart + ' ' + avgPerSec + '/s';
  }

  /** Estimate remaining time from recent throughput (sparkline data). */
  private computeSparklineEta(remainingTasks: number): string | null {
    const filled = Math.min(this.sparklineIndex, 12);
    if (filled < 2 || remainingTasks <= 0) return null;
    const values: number[] = [];
    for (let i = 0; i < filled; i++) {
      const idx = (this.sparklineIndex - filled + i) % 12;
      values.push(this.sparklineBuffer[idx < 0 ? idx + 12 : idx]);
    }
    const totalInWindow = values.reduce((a, b) => a + b, 0);
    if (totalInWindow === 0) return null;
    const ratePerSec = totalInWindow / (filled * 5);
    const secondsLeft = remainingTasks / ratePerSec;
    if (secondsLeft > 3600) return Math.round(secondsLeft / 3600) + 'h';
    if (secondsLeft > 60) return Math.round(secondsLeft / 60) + ' min';
    return Math.round(secondsLeft) + 's';
  }

  /** Adjust polling interval based on current state (BR-04). */
  private adjustInterval(state: EnrichmentState): void {
    const interval = state === 'running' ? RUNNING_INTERVAL
      : state === 'error' ? ERROR_INTERVAL
      : IDLE_INTERVAL;
    if (interval !== this.currentInterval) { this.schedulePoll(interval); }
  }

  /** Handle poll failure — track consecutive failures for degradation (EF-1). */
  private handlePollFailure(reason: string): void {
    this.consecutiveFailures++;
    this.log('Poll failed: ' + reason + ' (attempt ' + this.consecutiveFailures + '/' + MAX_CONSECUTIVE_FAILURES + ')');
    if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      this.statusBarItem.text = '$(warning) KB: Offline';
      this.statusBarItem.tooltip = 'Cannot reach backend';
      this.statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    }
  }

  private log(msg: string): void {
    this.outputChannel.appendLine('[Enrichment] ' + msg);
  }

  /** SA4E-169: Build DashboardData for WebView panel from current status + sparkline history. */
  buildDashboardData(response: EnrichmentStatusResponse): import('../panels/enrichment-dashboard-panel').DashboardData {
    const filled = Math.min(this.sparklineIndex, 12);
    const chartData: Array<{ time: string; completed: number; failed: number; timestamp: number }> = [];
    const now = Date.now();
    for (let i = 0; i < filled; i++) {
      const idx = (this.sparklineIndex - filled + i) % 12;
      const buffIdx = idx < 0 ? idx + 12 : idx;
      const ageMs = (filled - i) * 5000;
      const ts = now - ageMs;
      chartData.push({
        time: new Date(ts).toLocaleTimeString(),
        completed: this.sparklineBuffer[buffIdx],
        failed: 0,
        timestamp: ts,
      });
    }
    const totalInWindow = chartData.reduce((a, b) => a + b.completed, 0);
    const ratePerSec = filled > 0 ? totalInWindow / (filled * 5) : 0;
    const remaining = response.totalRules - response.completedRules - response.failedRules;
    const etaSeconds = ratePerSec > 0 ? remaining / ratePerSec : null;

    return {
      state: response.state,
      projectId: (response as any).projectId || null,
      totalRules: response.totalRules,
      completedRules: response.completedRules,
      failedRules: response.failedRules,
      pendingRules: response.pendingRules,
      processingRules: response.processingRules,
      percent: response.percent,
      activeTasks: response.activeTasks || [],
      recentFailures: (response as any).recentFailures || [],
      chartData,
      ratePerSec,
      etaSeconds,
      maxConcurrency: (response as any).maxConcurrency || 20,
      activeConcurrency: (response as any).activeConcurrency || 0,
    };
  }

  /** SA4E-169: Push update to open dashboard panel (called after each poll). */
  private async updateDashboardPanel(response: EnrichmentStatusResponse): Promise<void> {
    try {
      const { getEnrichmentPanel, updatePanel } = await import('../panels/enrichment-dashboard-panel');
      const panel = getEnrichmentPanel();
      if (panel) { updatePanel(panel, this.buildDashboardData(response)); }
    } catch { /* panel module not loaded yet — skip */ }
  }
}