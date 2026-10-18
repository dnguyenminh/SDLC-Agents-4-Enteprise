/**
 * SA4E-169 — client-side script for the Enrichment Dashboard webview
 * (SVG throughput chart, task/failure lists, retry button wiring).
 * The fragment is byte-identical to the original inline template script,
 * including the document closing tags.
 */
import type { DashboardData } from './types';

/** Full <script> block plus </body></html> closing tags. */
export function scriptFragment(data: DashboardData): string {
  return `<script>
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
