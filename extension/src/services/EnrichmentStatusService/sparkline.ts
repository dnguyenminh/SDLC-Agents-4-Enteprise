/**
 * Sparkline throughput helpers for the enrichment status display
 * (SA4E-157/169). Pure functions over the 12-slot ring buffer
 * (12 slots × 5s = last 60s).
 */

import type { EnrichmentStatusResponse } from '../enrichment-status-schema';
import type { DashboardData } from '../../panels/enrichment-dashboard-panel';

/** Build sparkline using Unicode block chars from ring buffer. */
export function buildSparkline(buffer: number[], sparklineIndex: number): string | null {
  const blocks = ' ▁▂▃▄▅▆▇█';
  const filled = Math.min(sparklineIndex, 12);
  if (filled < 2) return null;
  // Get ordered values (oldest → newest)
  const values: number[] = [];
  for (let i = 0; i < filled; i++) {
    const idx = (sparklineIndex - filled + i) % 12;
    values.push(buffer[idx < 0 ? idx + 12 : idx]);
  }
  const max = Math.max(...values, 1);
  const chart = values.map((v) => blocks[Math.round((v / max) * 8)]).join('');
  const totalInWindow = values.reduce((a, b) => a + b, 0);
  const avgPerSec = (totalInWindow / (filled * 5)).toFixed(1);
  return chart + ' ' + avgPerSec + '/s';
}

/** Estimate remaining time from recent throughput (sparkline data). */
export function computeSparklineEta(
  buffer: number[], sparklineIndex: number, remainingTasks: number,
): string | null {
  const filled = Math.min(sparklineIndex, 12);
  if (filled < 2 || remainingTasks <= 0) return null;
  const values: number[] = [];
  for (let i = 0; i < filled; i++) {
    const idx = (sparklineIndex - filled + i) % 12;
    values.push(buffer[idx < 0 ? idx + 12 : idx]);
  }
  const totalInWindow = values.reduce((a, b) => a + b, 0);
  if (totalInWindow === 0) return null;
  const ratePerSec = totalInWindow / (filled * 5);
  const secondsLeft = remainingTasks / ratePerSec;
  if (secondsLeft > 3600) return Math.round(secondsLeft / 3600) + 'h';
  if (secondsLeft > 60) return Math.round(secondsLeft / 60) + ' min';
  return Math.round(secondsLeft) + 's';
}

/** Chart points sampled from the ring buffer (oldest → newest). */
function buildSparklineChartData(
  buffer: number[], sparklineIndex: number,
): Array<{ time: string; completed: number; failed: number; timestamp: number }> {
  const filled = Math.min(sparklineIndex, 12);
  const chartData: Array<{ time: string; completed: number; failed: number; timestamp: number }> = [];
  const now = Date.now();
  for (let i = 0; i < filled; i++) {
    const idx = (sparklineIndex - filled + i) % 12;
    const buffIdx = idx < 0 ? idx + 12 : idx;
    const ageMs = (filled - i) * 5000;
    const ts = now - ageMs;
    chartData.push({
      time: new Date(ts).toLocaleTimeString(),
      completed: buffer[buffIdx],
      failed: 0,
      timestamp: ts,
    });
  }
  return chartData;
}

/** SA4E-169: Build DashboardData for WebView panel from current status + sparkline history. */
export function buildDashboardData(
  response: EnrichmentStatusResponse, buffer: number[], sparklineIndex: number,
): DashboardData {
  const filled = Math.min(sparklineIndex, 12);
  const chartData = buildSparklineChartData(buffer, sparklineIndex);
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
