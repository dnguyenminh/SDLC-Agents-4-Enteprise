/**
 * SA4E-169 — document head (meta + stylesheet) and body markup fragments
 * for the Enrichment Dashboard webview. Concatenation of the fragments is
 * byte-identical to the original single-template HTML.
 */
import type { DashboardData } from './types';

/**
 * Whether the "Retry All" button may be shown. SA4E-338 rev B: the backend scopes
 * retry to the X-Project-Id header, so retry only makes sense with a real project.
 * Hidden when there are no failures OR when the dashboard is unscoped (projectId
 * null/empty — rendered as "all"), matching the extension-side guard that blocks a
 * retry without a resolved project id.
 */
function canRetry(data: DashboardData): boolean {
  const pid = (data.projectId || '').trim();
  return data.failedRules > 0 && pid.length > 0;
}

/** Document head: meta tags + the full stylesheet. */
export function headFragment(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Enrichment Dashboard</title>
<style>
  body {
    font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #cccccc);
    padding: 16px;
    margin: 0;
  }
  .header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
  .header h2 { margin: 0; font-size: 16px; }
  .state-badge {
    padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase;
  }
  .state-running { background: #2d7d32; color: #fff; }
  .state-error { background: #c62828; color: #fff; }
  .state-complete { background: #1565c0; color: #fff; }
  .state-idle { background: #555; color: #ccc; }
  .stats {
    display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 8px; margin-bottom: 16px;
  }
  .stat-card {
    background: var(--vscode-editorWidget-background, #252526);
    border: 1px solid var(--vscode-editorWidget-border, #454545);
    border-radius: 6px; padding: 10px; text-align: center;
  }
  .stat-value { font-size: 22px; font-weight: 700; transition: opacity 0.3s ease; }
  .stat-label { font-size: 11px; opacity: 0.7; margin-top: 2px; }
  .progress-bar {
    width: 100%; height: 8px; background: #333; border-radius: 4px; overflow: hidden; margin-bottom: 16px;
  }
  .progress-fill { height: 100%; border-radius: 4px; transition: width 0.5s ease; }
  .progress-ok { background: linear-gradient(90deg, #43a047, #66bb6a); }
  .progress-warn { background: linear-gradient(90deg, #f57c00, #ffa726); }
  .chart-container { margin-bottom: 16px; position: relative; }
  .chart-container h3 { font-size: 13px; margin: 0 0 8px; opacity: 0.8; }
  svg.chart { width: 100%; height: 120px; background: var(--vscode-editorWidget-background, #252526); border-radius: 6px; }
  .chart-tooltip {
    position: absolute; padding: 4px 8px; background: #333; color: #fff; font-size: 11px;
    border-radius: 4px; pointer-events: none; display: none; white-space: nowrap;
  }
  .tasks-section { margin-top: 12px; }
  .tasks-section h3 { font-size: 13px; margin: 0 0 8px; opacity: 0.8; }
  .tasks-list { height: 120px; overflow-y: auto; overflow-x: hidden; }
  .task-item {
    font-family: var(--vscode-editor-font-family, monospace); font-size: 12px;
    padding: 4px 8px; background: var(--vscode-editorWidget-background, #252526);
    border-radius: 4px; margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    opacity: 1; transition: opacity 0.3s ease;
  }
  .task-item::before { content: '⚡ '; }
  .failure-item {
    font-family: var(--vscode-editor-font-family, monospace); font-size: 11px;
    padding: 6px 8px; background: var(--vscode-editorWidget-background, #252526);
    border-left: 3px solid #f57c00; border-radius: 4px; margin-bottom: 4px;
  }
  .failure-symbol { font-weight: 600; color: #f57c00; }
  .failure-error { opacity: 0.8; margin-top: 2px; }
  .retry-btn {
    margin-top: 6px; padding: 3px 10px; font-size: 11px; cursor: pointer;
    background: #f57c00; color: #fff; border: none; border-radius: 3px;
  }
  .retry-btn:hover { background: #e65100; }
  .retry-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .eta { font-size: 12px; opacity: 0.8; margin-bottom: 12px; transition: opacity 0.3s ease; }
  svg .bar { transition: height 0.4s ease, y 0.4s ease; }
</style>
</head>
`;
}

/** Body markup: header, progress bar, stats, chart placeholder, lists. */
export function bodyFragment(data: DashboardData): string {
  return `<body>
  <div class="header">
    <h2>LLM Enrichment</h2>
    <span class="state-badge state-${data.state}" id="badge">${data.state}</span>
  </div>
  <div style="font-size: 11px; color: #888; margin: 4px 0 8px 0;" id="projectInfo">
    Project: <span id="projectId">${(data as any).projectId || 'all'}</span>
  </div>

  <div class="progress-bar">
    <div class="progress-fill ${data.failedRules > 0 ? 'progress-warn' : 'progress-ok'}"
         id="progressFill" style="width: ${data.percent}%"></div>
  </div>

  <div id="eta" class="eta"></div>

  <div class="stats">
    <div class="stat-card"><div class="stat-value" id="completed">${data.completedRules}</div><div class="stat-label">Completed</div></div>
    <div class="stat-card"><div class="stat-value" id="pending">${data.pendingRules}</div><div class="stat-label">Pending</div></div>
    <div class="stat-card"><div class="stat-value" id="processing">${data.processingRules}</div><div class="stat-label">Processing</div></div>
    <div class="stat-card"><div class="stat-value" id="failed">${data.failedRules}</div><div class="stat-label">Failed</div><button id="retryBtn" class="retry-btn" style="display:${canRetry(data) ? 'inline-block' : 'none'}">↻ Retry All</button></div>
    <div class="stat-card"><div class="stat-value" id="rate">0.0</div><div class="stat-label">items/sec</div></div>
    <div class="stat-card"><div class="stat-value" id="total">${data.totalRules}</div><div class="stat-label">Total</div></div>
  </div>

  <div class="chart-container">
    <h3>Throughput (last 60s)</h3>
    <svg class="chart" id="chart" viewBox="0 0 600 120" preserveAspectRatio="none"></svg>
    <div class="chart-tooltip" id="tooltip"></div>
  </div>

  <div class="tasks-section">
    <h3>Currently Processing</h3>
    <div id="tasksList" class="tasks-list"></div>
  </div>

  <div class="tasks-section" id="failuresSection" style="display:${data.failedRules > 0 ? 'block' : 'none'}">
    <h3 style="color:#f57c00">Recent Failures (${data.failedRules})</h3>
    <div id="failuresList" class="tasks-list"></div>
  </div>

`;
}
