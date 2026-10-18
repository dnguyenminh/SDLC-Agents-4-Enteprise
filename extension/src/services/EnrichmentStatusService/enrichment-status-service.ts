/**
 * SA4E-157 — Enrichment Status Polling Service.
 * Polls backend for enrichment progress, manages state transitions,
 * drives StatusBarItem display + completion notifications.
 */

import * as vscode from 'vscode';
import type { IndexerHttpClient } from '../IndexerHttpClient';
import { EnrichmentStatusResponseSchema } from '../enrichment-status-schema';
import type { EnrichmentStatusResponse, EnrichmentState } from '../enrichment-status-schema';
import { buildDashboardData as toDashboardData } from './sparkline';
import { EnrichmentStatusBarView } from './status-view';
import { showCompletionNotification } from './notifications';

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
  private readonly view: EnrichmentStatusBarView;

  constructor(
    private readonly httpClient: IndexerHttpClient,
    private readonly tokenProvider: () => string | undefined,
    outputChannel: vscode.OutputChannel,
  ) {
    this.outputChannel = outputChannel;
    this.view = new EnrichmentStatusBarView();
  }

  /** Start polling (called after user authenticates). Polls immediately, then on interval. */
  start(): void {
    this.view.show();
    this.executePoll(); // Immediate first poll — don't wait 30s
    this.schedulePoll(this.currentInterval);
  }

  /** Dispose timer + StatusBarItem (BR-11: no orphan intervals). */
  dispose(): void {
    this.clearTimer();
    this.view.dispose();
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

      const data = this.parseStatusBody(body);
      if (!data) { return null; }

      this.log('[EnrichmentPoll] OK state=' + data.state + ' pending=' + data.pendingRules + ' failed=' + data.failedRules);
      this.consecutiveFailures = 0;
      this.processResponse(data);
      return data;
    } catch (err: any) {
      this.log('[EnrichmentPoll] EXCEPTION: ' + err.message);
      this.handlePollFailure(err.message);
      return null;
    }
  }

  /** Parse + validate the poll body; logs and returns null when invalid. */
  private parseStatusBody(body: string): EnrichmentStatusResponse | null {
    const parsed = EnrichmentStatusResponseSchema.safeParse(JSON.parse(body));
    if (!parsed.success) {
      this.log('[EnrichmentPoll] Zod FAIL: ' + parsed.error.message);
      return null;
    }
    return parsed.data;
  }

  /** Process a successful response — detect transitions, update UI. */
  private processResponse(response: EnrichmentStatusResponse): void {
    this.previousState = this.currentState;
    this.currentState = response.state;

    this.updateSparkline(response);

    if (this.previousState !== this.currentState) {
      this.handleStateTransition(this.previousState, this.currentState, response);
      this.adjustInterval(this.currentState);
    }

    this.view.update(response, this.sparklineBuffer, this.sparklineIndex);
    // SA4E-169: Auto-update dashboard panel if open
    this.updateDashboardPanel(response);
  }

  /** Update sparkline: track completions delta per poll interval */
  private updateSparkline(response: EnrichmentStatusResponse): void {
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
        showCompletionNotification(response, this.outputChannel);
      }
    }

    // Reset notification tracking when new cycle starts
    if (curr === 'running' && prev !== 'running') {
      this.lastNotifiedState = null;
    }
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
      this.view.markOffline();
    }
  }

  private log(msg: string): void {
    this.outputChannel.appendLine('[Enrichment] ' + msg);
  }

  /** SA4E-169: Build DashboardData for WebView panel from current status + sparkline history. */
  buildDashboardData(response: EnrichmentStatusResponse): import('../../panels/enrichment-dashboard-panel').DashboardData {
    return toDashboardData(response, this.sparklineBuffer, this.sparklineIndex);
  }

  /** SA4E-169: Push update to open dashboard panel (called after each poll). */
  private async updateDashboardPanel(response: EnrichmentStatusResponse): Promise<void> {
    try {
      const { getEnrichmentPanel, updatePanel } = await import('../../panels/enrichment-dashboard-panel');
      const panel = getEnrichmentPanel();
      if (panel) { updatePanel(panel, this.buildDashboardData(response)); }
    } catch { /* panel module not loaded yet — skip */ }
  }
}
