/**
 * SA4E-169 — Enrichment Dashboard WebView Panel.
 * Shows real-time enrichment progress with SVG chart, active tasks, and status info.
 * Click status bar → opens this panel. Auto-refreshes every 5s when running.
 */

import * as vscode from 'vscode';

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

let currentPanel: vscode.WebviewPanel | undefined;

/** Open or reveal the Enrichment Dashboard panel. Singleton pattern. */
export function openEnrichmentDashboard(
  extensionUri: vscode.Uri,
  initialData: DashboardData,
): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Two);
    updatePanel(currentPanel, initialData);
    return currentPanel;
  }

  currentPanel = vscode.window.createWebviewPanel(
    'sa4e.enrichmentDashboard',
    'Enrichment Dashboard',
    vscode.ViewColumn.Two,
    { enableScripts: true, retainContextWhenHidden: true },
  );

  currentPanel.webview.html = buildHtml(initialData);

  currentPanel.onDidDispose(() => { currentPanel = undefined; });

  currentPanel.webview.onDidReceiveMessage(async (message) => {
    if (message.type === 'retryFailed') {
      try {
        await vscode.commands.executeCommand('sa4e.retryFailedEnrichment');
        currentPanel?.webview.postMessage({ type: 'retryResult', success: true, count: -1 });
      } catch (err: any) {
        currentPanel?.webview.postMessage({ type: 'retryResult', success: false, count: 0 });
      }
    }
  });

  return currentPanel;
}

/** Update existing panel with new data (called every poll cycle). */
export function updatePanel(panel: vscode.WebviewPanel, data: DashboardData): void {
  panel.webview.postMessage({ type: 'update', data });
}

/** Get current panel reference (for periodic updates). */
export function getEnrichmentPanel(): vscode.WebviewPanel | undefined {
  return currentPanel;
}

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

/** Build full HTML for the webview with embedded SVG chart + JS. */
function buildHtml(data: DashboardData): string {
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
<body>
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

<script>
const vscode = acquireVsCodeApi();
let chartData = ${JSON.stringify(data.chartData)};
let maxConc = ${data.maxConcurrency || 20};

function renderChart(data, maxConc) {
  const svg = document.getElementById('chart');
  const tooltip = document.getElementById('tooltip');
  if (!data.length) { svg.innerHTML = '<text x="300" y="60" text-anchor="middle" fill="#666" font-size="12">Collecting data...</text>'; return; }

  const max = Math.max(maxConc || 1, ...data.map(d => d.completed), 1);
  const w = 600, h = 120, padL = 35, padR = 5, padT = 5, padB = 15;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;
  const barW = Math.max(2, chartW / data.length - 2);

  let html = '';
  // Y-axis grid lines (0, 25%, 50%, 75%, 100% of max)
  for (let i = 0; i <= 4; i++) {
    const y = padT + chartH - (chartH * i / 4);
    const val = Math.round(max * i / 4);
    html += '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y + '" stroke="#444" stroke-width="0.5" stroke-dasharray="2,3"/>';
    html += '<text x="' + (padL - 4) + '" y="' + (y + 3) + '" text-anchor="end" fill="#888" font-size="9">' + val + '</text>';
  }
  // Max concurrency reference line
  if (maxConc > 0) {
    const maxY = padT + chartH - (chartH * Math.min(maxConc, max) / max);
    html += '<line x1="' + padL + '" y1="' + maxY + '" x2="' + (w - padR) + '" y2="' + maxY + '" stroke="#f57c00" stroke-width="1" stroke-dasharray="4,2"/>';
    html += '<text x="' + (w - padR - 2) + '" y="' + (maxY - 3) + '" text-anchor="end" fill="#f57c00" font-size="9">max=' + maxConc + '</text>';
  }
  // Bars
  data.forEach((d, i) => {
    const barH = (d.completed / max) * chartH;
    const x = padL + i * (chartW / data.length);
    const y = padT + chartH - barH;
    const color = d.failed > 0 ? '#f57c00' : '#43a047';
    html += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH + '" fill="' + color + '" rx="1" '
      + 'data-time="' + d.time + '" data-completed="' + d.completed + '" data-failed="' + d.failed + '" class="bar"/>';
  });
  svg.innerHTML = html;

  svg.querySelectorAll('.bar').forEach(bar => {
    bar.addEventListener('mouseenter', (e) => {
      const t = bar.getAttribute('data-time');
      const c = bar.getAttribute('data-completed');
      const f = bar.getAttribute('data-failed');
      tooltip.textContent = t + ' — ' + c + ' done' + (parseInt(f) > 0 ? ', ' + f + ' failed' : '');
      tooltip.style.display = 'block';
      tooltip.style.left = (e.offsetX + 10) + 'px';
      tooltip.style.top = (e.offsetY - 25) + 'px';
    });
    bar.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
  });
}

function renderTasks(tasks) {
  const el = document.getElementById('tasksList');
  if (!tasks || !tasks.length) { el.innerHTML = '<div style="opacity:0.5;font-size:12px">No active tasks</div>'; return; }
  el.innerHTML = tasks.map(t => '<div class="task-item">' + t.source + '</div>').join('');
}

function renderFailures(failures) {
  const section = document.getElementById('failuresSection');
  const el = document.getElementById('failuresList');
  if (!failures || !failures.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  el.innerHTML = failures.map(f =>
    '<div class="failure-item"><div class="failure-symbol">' + f.symbolName + '</div><div class="failure-error">' + f.error + '</div></div>'
  ).join('');
}

function formatEta(seconds) {
  if (!seconds || seconds <= 0) return '';
  if (seconds > 3600) return 'ETA: ~' + Math.round(seconds / 3600) + 'h remaining';
  if (seconds > 60) return 'ETA: ~' + Math.round(seconds / 60) + ' min remaining';
  return 'ETA: ~' + Math.round(seconds) + 's remaining';
}

function update(d) {
  document.getElementById('badge').textContent = d.state;
  document.getElementById('badge').className = 'state-badge state-' + d.state;
  document.getElementById('progressFill').style.width = d.percent + '%';
  document.getElementById('completed').textContent = d.completedRules;
  document.getElementById('pending').textContent = d.pendingRules;
  document.getElementById('processing').textContent = d.processingRules;
  document.getElementById('failed').textContent = d.failedRules;
  // SA4E-338 rev B: retry needs a real project scope (X-Project-Id). Hide when
  // unscoped ("all") so the user can't trigger a 403.
  const dPid = (d.projectId || '').trim();
  const canRetry = d.failedRules > 0 && dPid.length > 0;
  document.getElementById('projectId').textContent = dPid || 'all';
  document.getElementById('retryBtn').style.display = canRetry ? 'inline-block' : 'none';
  document.getElementById('total').textContent = d.totalRules;
  document.getElementById('rate').textContent = d.ratePerSec.toFixed(1);
  document.getElementById('eta').textContent = formatEta(d.etaSeconds);
  chartData = d.chartData;
  maxConc = d.maxConcurrency || maxConc;
  renderChart(chartData, maxConc);
  renderTasks(d.activeTasks);
  renderFailures(d.recentFailures);
}

// Initial render
renderChart(chartData, maxConc);
renderTasks(${JSON.stringify(data.activeTasks)});
renderFailures(${JSON.stringify(data.recentFailures || [])});
document.getElementById('rate').textContent = '${data.ratePerSec.toFixed(1)}';
document.getElementById('eta').textContent = formatEta(${data.etaSeconds ?? 'null'});

// Listen for updates from extension
window.addEventListener('message', (event) => {
  if (event.data.type === 'update') { update(event.data.data); }
  if (event.data.type === 'retryResult') {
    const btn = document.getElementById('retryBtn');
    btn.textContent = event.data.success ? '✓ Retried ' + event.data.count : '✗ Failed';
    btn.disabled = false;
    setTimeout(() => { btn.textContent = '↻ Retry All'; }, 3000);
  }
});

// Retry button click
document.getElementById('retryBtn').addEventListener('click', () => {
  const btn = document.getElementById('retryBtn');
  btn.disabled = true;
  btn.textContent = '⏳ Retrying...';
  vscode.postMessage({ type: 'retryFailed' });
});
</script>
</body>
</html>`;
}
