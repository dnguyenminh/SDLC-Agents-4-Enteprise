/**
 * SA4E-169 — data types for the Enrichment Dashboard webview.
 */

/** Data point for the throughput chart. */
export interface ChartDataPoint {
  time: string;
  completed: number;
  failed: number;
  timestamp: number;
}

/** Full status snapshot passed to the webview. */
export interface DashboardData {
  state: string;
  projectId: string | null;
  totalRules: number;
  completedRules: number;
  failedRules: number;
  pendingRules: number;
  processingRules: number;
  percent: number;
  activeTasks: Array<{ source: string }>;
  recentFailures: Array<{ symbolName: string; error: string; taskId: number }>;
  chartData: ChartDataPoint[];
  ratePerSec: number;
  etaSeconds: number | null;
  maxConcurrency: number;
  activeConcurrency: number;
}
