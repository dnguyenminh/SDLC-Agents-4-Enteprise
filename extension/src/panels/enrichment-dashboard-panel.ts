/**
 * SA4E-169 — Enrichment Dashboard WebView Panel.
 * Shows real-time enrichment progress with SVG chart, active tasks, and status info.
 * Click status bar → opens this panel. Auto-refreshes every 5s when running.
 *
 * BR-18: implementation lives in ./enrichment-dashboard/* — this file is the
 * stable public façade (same import path and symbols as before the split).
 */
export { openEnrichmentDashboard, updatePanel, getEnrichmentPanel } from './enrichment-dashboard-panel/panel';
export type { ChartDataPoint, DashboardData } from './enrichment-dashboard-panel/types';
