/**
 * analytics.js — Search volume chart, popular queries, knowledge gaps, recommendations.
 * Uses Canvas 2D for volume chart (no Chart.js dependency).
 */

/* global vscode, handlePanelMessage */

function handlePanelMessage(msg) {
  if (msg.type === "analyticsData") {
    renderAnalytics(msg);
  }
}

function renderAnalytics(data) {
  const loading = document.getElementById("loading");
  const content = document.getElementById("content");
  loading.style.display = "none";
  content.style.display = "block";

  renderVolumeChart(data.volume);
  renderPopular(data.popular);
  renderGaps(data.gaps);
  renderRecommendations(data.recommendations);
}

function renderVolumeChart(volume) {
  const canvas = document.getElementById("volume-chart");
  if (!canvas || !volume || volume.length === 0) {
    if (canvas) {
      const ctx = canvas.getContext("2d");
      canvas.width = canvas.parentElement ? canvas.parentElement.clientWidth || 400 : 400;
      canvas.height = 180;
      ctx.fillStyle = getTextColor();
      ctx.font = "12px system-ui";
      ctx.fillText("No volume data", 10, 90);
    }
    return;
  }

  const w = canvas.parentElement ? canvas.parentElement.clientWidth || 400 : 400;
  const h = 180;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");

  const values = volume.map((v) => v.searches || v.count || 0);
  const labels = volume.map((v) => v.date || "");
  const max = Math.max(...values, 1);
  const padL = 40, padR = 10, padT = 30, padB = 30;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  // Title
  ctx.fillStyle = getTextColor();
  ctx.font = "bold 12px system-ui";
  ctx.fillText("Search Volume", padL, 16);

  // Y-axis
  ctx.strokeStyle = "rgba(148,163,184,0.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillStyle = "rgba(148,163,184,0.7)";
    ctx.font = "10px system-ui";
    ctx.fillText(Math.round(max - (max / 4) * i).toString(), 4, y + 4);
  }

  // Line + fill
  ctx.beginPath();
  const stepX = plotW / Math.max(values.length - 1, 1);
  values.forEach((v, i) => {
    const x = padL + i * stepX;
    const y = padT + plotH - (v / max) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#FF9800";
  ctx.lineWidth = 2;
  ctx.stroke();

  // Fill area
  ctx.lineTo(padL + (values.length - 1) * stepX, padT + plotH);
  ctx.lineTo(padL, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = "rgba(255,152,0,0.1)";
  ctx.fill();

  // Dots
  values.forEach((v, i) => {
    const x = padL + i * stepX;
    const y = padT + plotH - (v / max) * plotH;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fillStyle = "#FF9800"; ctx.fill();
  });

  // X-axis labels
  ctx.fillStyle = "rgba(148,163,184,0.7)";
  ctx.font = "9px system-ui";
  const labelStep = Math.max(1, Math.floor(labels.length / 6));
  labels.forEach((l, i) => {
    if (i % labelStep === 0) {
      const x = padL + i * stepX;
      ctx.fillText(l.slice(5), x - 12, h - 6); // show MM-DD
    }
  });
}

function renderPopular(popular) {
  const list = document.getElementById("popular-list");
  if (!list || !popular) { return; }

  list.innerHTML = (popular || []).slice(0, 15).map((q) =>
    "<li>" + escapeHtml(q.query) + ' <span class="badge">' + q.count + "</span></li>"
  ).join("");
}

function renderGaps(gaps) {
  const list = document.getElementById("gaps-list");
  if (!list || !gaps) { return; }

  if (gaps.length === 0) {
    list.innerHTML = '<li style="color:var(--text-muted);">No gaps detected.</li>';
    return;
  }

  list.innerHTML = gaps.slice(0, 15).map((g) =>
    "<li>" + escapeHtml(g.query) + ' <span class="badge">' + g.count + "×</span>" +
    (g.suggestion ? ' <small style="color:var(--text-link);cursor:pointer;" onclick="createFromGap(\'' + escapeAttr(g.suggestion) + "')\">" + escapeHtml(g.suggestion) + "</small>" : "") +
    "</li>"
  ).join("");
}

function renderRecommendations(recs) {
  const container = document.getElementById("rec-cards");
  if (!container || !recs) { return; }

  if (recs.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">No recommendations.</p>';
    return;
  }

  container.innerHTML = recs.slice(0, 8).map((r) =>
    '<div class="card">' +
    "<h4>" + escapeHtml(r.title) + "</h4>" +
    '<p style="color:var(--text-secondary);font-size:var(--font-size-sm);">' + escapeHtml(r.reason) + "</p>" +
    '<span class="badge">' + escapeHtml(r.type) + "</span>" +
    "</div>"
  ).join("");
}

function createFromGap(suggestion) {
  vscode.postMessage({ type: "createEntry", title: suggestion, content: "", entryType: "CONTEXT" });
}

function getTextColor() {
  return getComputedStyle(document.body).getPropertyValue("--text-primary").trim() || "#ccc";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}

// Handle time range change
document.addEventListener("DOMContentLoaded", () => {
  const select = document.getElementById("range-select");
  if (select) {
    select.onchange = () => { vscode.postMessage({ type: "refresh" }); };
  }
});
