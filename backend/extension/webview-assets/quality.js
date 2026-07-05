/**
 * quality.js — Quality histogram, confidence chart, low-quality/unreliable tables.
 * Uses Canvas 2D for charts (no Chart.js dependency — CSP compatible).
 */

/* global vscode, handlePanelMessage */

function handlePanelMessage(msg) {
  if (msg.type === "qualityData") {
    renderQuality(msg);
  }
}

function renderQuality(data) {
  const loading = document.getElementById("loading");
  const content = document.getElementById("content");
  loading.style.display = "none";
  content.style.display = "block";

  renderHistogram(data.stats);
  renderConfidence(data.confidence);
  renderLowQualityTable(data.lowQuality);
  renderUnreliableTable(data.unreliable);
}

function renderHistogram(stats) {
  const canvas = document.getElementById("quality-histogram");
  if (!canvas || !stats) { return; }

  const dist = stats.distribution || {};
  const avg = stats.average || stats.avg_score || 0;
  const labels = Object.keys(dist);
  const values = Object.values(dist);

  if (labels.length === 0) {
    const parent = canvas.parentElement;
    if (parent) {
      parent.innerHTML = '<div class="card" style="text-align:center;">' +
        '<h3>Quality Overview</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">' +
        '<div><div style="font-size:24px;font-weight:700;color:var(--color-info);">' + (avg || 0).toFixed(1) + '</div><div style="font-size:11px;color:var(--text-secondary);">Average Score</div></div>' +
        '<div><div style="font-size:24px;font-weight:700;color:var(--color-info);">' + (stats.total_scored || stats.scored_count || 0) + '</div><div style="font-size:11px;color:var(--text-secondary);">Scored Entries</div></div>' +
        '<div><div style="font-size:24px;font-weight:700;color:var(--color-success);">' + (stats.high_count || 0) + '</div><div style="font-size:11px;color:var(--text-secondary);">High Quality</div></div>' +
        '<div><div style="font-size:24px;font-weight:700;color:var(--color-error);">' + (stats.low_quality_count || stats.low_count || 0) + '</div><div style="font-size:11px;color:var(--text-secondary);">Low Quality</div></div>' +
        '</div></div>';
    }
    return;
  }

  // Canvas 2D bar chart
  const w = canvas.parentElement ? canvas.parentElement.clientWidth || 300 : 300;
  const h = 160;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const max = Math.max(...values, 1);
  const padL = 30, padR = 10, padT = 28, padB = 24;
  const plotH = h - padT - padB;
  const plotW = w - padL - padR;
  const barW = plotW / labels.length;

  ctx.fillStyle = getTextColor();
  ctx.font = "bold 11px system-ui";
  ctx.fillText("Quality Distribution (avg: " + Math.round(avg) + ")", padL, 14);

  labels.forEach(function(l, i) {
    var barH = (values[i] / max) * plotH;
    var x = padL + i * barW;
    var y = padT + plotH - barH;
    ctx.fillStyle = getScoreColorRaw(parseInt(l, 10));
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x + 2, y, barW - 4, barH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(148,163,184,0.8)";
    ctx.font = "9px system-ui";
    ctx.fillText(l, x + barW / 2 - 8, h - 6);
    if (values[i] > 0) {
      ctx.fillStyle = getTextColor();
      ctx.font = "9px system-ui";
      ctx.fillText(values[i].toString(), x + barW / 2 - 4, y - 4);
    }
  });
}

function renderConfidence(confidence) {
  const canvas = document.getElementById("confidence-chart");
  if (!canvas || !confidence) { return; }

  const dist = confidence.distribution || {};
  const labels = Object.keys(dist);
  const values = Object.values(dist);

  if (labels.length === 0) {
    const parent = canvas.parentElement;
    if (parent) {
      parent.innerHTML = '<div class="card" style="text-align:center;">' +
        '<h3>Confidence</h3>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px;">' +
        '<div><div style="font-size:24px;font-weight:700;color:var(--color-info);">' + (confidence.average || confidence.avg_confidence || 0) + '</div><div style="font-size:11px;color:var(--text-secondary);">Average</div></div>' +
        '<div><div style="font-size:24px;font-weight:700;color:var(--color-success);">' + (confidence.high_confidence_count || 0) + '</div><div style="font-size:11px;color:var(--text-secondary);">High</div></div>' +
        '<div><div style="font-size:24px;font-weight:700;color:var(--color-error);">' + (confidence.low_confidence_count || 0) + '</div><div style="font-size:11px;color:var(--text-secondary);">Low</div></div>' +
        '</div></div>';
    }
    return;
  }

  // Canvas 2D bar chart
  const w = canvas.parentElement ? canvas.parentElement.clientWidth || 300 : 300;
  const h = 160;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const max = Math.max(...values, 1);
  const padL = 30, padR = 10, padT = 28, padB = 24;
  const plotH = h - padT - padB;
  const plotW = w - padL - padR;
  const barW = plotW / labels.length;

  ctx.fillStyle = getTextColor();
  ctx.font = "bold 11px system-ui";
  ctx.fillText("Confidence (avg: " + (confidence.average || confidence.avg_confidence || 0) + ")", padL, 14);

  labels.forEach(function(l, i) {
    var barH = (values[i] / max) * plotH;
    var x = padL + i * barW;
    var y = padT + plotH - barH;
    ctx.fillStyle = "#9C27B0";
    ctx.globalAlpha = 0.8;
    ctx.fillRect(x + 2, y, barW - 4, barH);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(148,163,184,0.8)";
    ctx.font = "9px system-ui";
    ctx.fillText(l, x + barW / 2 - 8, h - 6);
    if (values[i] > 0) {
      ctx.fillStyle = getTextColor();
      ctx.font = "9px system-ui";
      ctx.fillText(values[i].toString(), x + barW / 2 - 4, y - 4);
    }
  });
}

function renderLowQualityTable(entries) {
  const table = document.getElementById("low-quality-table");
  if (!table) { return; }

  if (!entries || entries.length === 0) {
    table.innerHTML = '<tr><td style="color:var(--text-muted);">No low-quality entries.</td></tr>';
    return;
  }

  table.innerHTML =
    "<thead><tr><th>ID</th><th>Type</th><th>Summary</th><th>Score</th><th>Bar</th></tr></thead><tbody>" +
    entries.slice(0, 20).map(function(e) {
      var id = e.id || e.entry_id;
      var score = e.score || e.total_score || 0;
      var barWidth = Math.max(5, score);
      return "<tr><td>" + id + "</td>" +
        '<td><span class="badge">' + escapeHtml(e.type) + "</span></td>" +
        "<td>" + escapeHtml(e.title || e.summary || "Entry #" + id) + "</td>" +
        '<td style="color:' + getScoreColorRaw(score) + ';">' + score + "</td>" +
        '<td><div style="width:' + barWidth + '%;height:8px;background:' + getScoreColorRaw(score) + ';border-radius:4px;"></div></td></tr>';
    }).join("") + "</tbody>";
}

function renderUnreliableTable(entries) {
  const table = document.getElementById("unreliable-table");
  if (!table) { return; }

  if (!entries || entries.length === 0) {
    table.innerHTML = '<tr><td style="color:var(--text-muted);">No unreliable entries.</td></tr>';
    return;
  }

  table.innerHTML =
    "<thead><tr><th>Title</th><th>Type</th><th>Score</th></tr></thead><tbody>" +
    entries.slice(0, 20).map(function(e) {
      return "<tr><td>" + escapeHtml(e.title || "Entry #" + e.id) + "</td>" +
        '<td><span class="badge">' + escapeHtml(e.type) + "</span></td>" +
        "<td>" + (e.score || "N/A") + "</td></tr>";
    }).join("") + "</tbody>";
}

function getScoreColor(score) {
  if (score >= 70) { return "var(--color-success)"; }
  if (score >= 40) { return "var(--color-warning)"; }
  return "var(--color-error)";
}

function getScoreColorRaw(score) {
  if (score >= 70) { return "#4caf50"; }
  if (score >= 40) { return "#ff9800"; }
  return "#f44336";
}

function getTextColor() {
  return getComputedStyle(document.body).getPropertyValue("--text-primary").trim() || "#ccc";
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
