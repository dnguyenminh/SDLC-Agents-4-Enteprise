/**
 * dashboard.js — Full KB Dashboard for VS Code extension webview.
 * Renders: health gauge (SVG), metrics cards, recommendations, due reviews,
 * type/tier doughnut charts (Chart.js), trend bar charts (canvas 2D), recent activity.
 */

/* global vscode, handlePanelMessage */

function handlePanelMessage(msg) {
  if (msg.type === "dashboardData") {
    renderDashboard(msg);
  }
  if (msg.type === "reviewMarked") {
    handleReviewResult(msg);
  }
}

function renderDashboard(data) {
  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "block";

  renderGauge(data.healthScore);
  renderMetrics(data);
  renderRecs(data.recommendations);
  renderTrends(data.trends);
  renderRecent(data.recent);
}

// === Health Gauge (SVG arc) ===
function renderGauge(score) {
  var el = document.getElementById("gauge");
  var pct = Math.min(score, 100) / 100;
  var color = score >= 70 ? "#4caf50" : score >= 40 ? "#ff9800" : "#f44336";
  el.innerHTML =
    '<circle cx="60" cy="60" r="50" fill="none" stroke="var(--border-default)" stroke-width="10"/>' +
    '<circle cx="60" cy="60" r="50" fill="none" stroke="' + color + '" stroke-width="10" ' +
    'stroke-dasharray="' + (pct * 314) + ' 314" stroke-linecap="round" transform="rotate(-135 60 60)"/>' +
    '<text x="60" y="65" text-anchor="middle" fill="var(--text-primary)" font-size="20" font-weight="700">' +
    Math.round(score) + '</text>';

  var label = document.getElementById("health-label");
  label.textContent = score >= 70 ? "Healthy" : score >= 40 ? "Needs Attention" : "Critical";
  label.style.color = color;
}

// === Metrics Cards ===
function renderMetrics(data) {
  var section = document.getElementById("metrics-section");
  var items = [
    { label: "Total Entries", val: data.totalEntries || 0, sub: "All KB entries" },
    { label: "Quality Avg", val: (data.qualityAvg || 0).toFixed(1), sub: "Score 0-100" },
    { label: "Stale", val: data.staleCount || 0, sub: "Needs review" },
    { label: "Unowned", val: data.unownedCount || 0, sub: "No owner assigned" }
  ];
  section.innerHTML = items.map(function(i) {
    return '<div class="metric-card"><h3>' + i.label + '</h3>' +
      '<div class="val">' + i.val + '</div>' +
      '<div class="sub">' + i.sub + '</div></div>';
  }).join("");
}

// === Recommendations ===
function renderRecs(recs) {
  var el = document.getElementById("recs-list");
  if (!recs || !recs.length) {
    el.innerHTML = '<li class="low">No recommendations</li>';
    return;
  }
  el.innerHTML = recs.map(function(r) {
    var msg = r.message || r.action || String(r);
    var priority = r.priority || "low";
    return '<li class="' + priority + '">' + escapeHtml(msg) + '</li>';
  }).join("");
}

// === Due Reviews Table ===
function renderReviews(reviews) {
  var el = document.getElementById("reviews-body");
  if (!reviews || !reviews.length) {
    el.innerHTML = '<tr><td colspan="5" style="opacity:0.6;font-size:11px;">No due reviews</td></tr>';
    return;
  }
  el.innerHTML = reviews.map(function(e) {
    var id = e.id || e.entry_id || "";
    var last = e.last_reviewed_at || e.last_reviewed || "Never";
    var days = e.days_overdue || e.overdue_days || "\u2014";
    return '<tr data-entry-id="' + id + '">' +
      '<td>' + id + '</td>' +
      '<td>' + escapeHtml(e.summary || "") + '</td>' +
      '<td>' + last + '</td>' +
      '<td class="overdue-val">' + days + 'd</td>' +
      '<td><button class="btn-review" aria-label="Mark entry ' + id + ' as reviewed" onclick="markReviewed(' + id + ',this)">Mark Reviewed</button></td>' +
      '</tr>';
  }).join("");
}

function markReviewed(entryId, buttonEl) {
  buttonEl.disabled = true;
  buttonEl.innerHTML = '<span class="spinner"></span>';
  vscode.postMessage({ type: "markReviewed", entryId: entryId });
}

function handleReviewResult(msg) {
  if (msg.success) {
    showToast("Entry #" + msg.entryId + " marked as reviewed", "success");
    var row = document.querySelector('tr[data-entry-id="' + msg.entryId + '"]');
    if (row) {
      row.style.transition = "opacity 300ms ease-out";
      row.style.opacity = "0";
      setTimeout(function() {
        row.remove();
        var tbody = document.getElementById("reviews-body");
        if (!tbody.children.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="opacity:0.6;font-size:11px;">No due reviews</td></tr>';
        }
        decrementMetric("Stale");
      }, 300);
    }
  } else {
    showToast("Failed: " + (msg.error || "Unknown error"), "error");
    var btn = document.querySelector('tr[data-entry-id="' + msg.entryId + '"] .btn-review');
    if (btn) { btn.disabled = false; btn.textContent = "Mark Reviewed"; }
  }
}

function decrementMetric(label) {
  var cards = document.querySelectorAll(".metric-card");
  cards.forEach(function(card) {
    var h3 = card.querySelector("h3");
    if (h3 && h3.textContent.trim() === label) {
      var val = card.querySelector(".val");
      var current = parseInt(val.textContent) || 0;
      if (current > 0) { val.textContent = current - 1; }
    }
  });
}

// === Trend Mini Bar Charts (Canvas 2D) ===
function renderTrends(trends) {
  if (!trends) { trends = {}; }
  var searchData = trends.search_volume || trends.searchVolume || [];
  var ingestData = trends.ingest_volume || trends.ingestVolume || [];
  drawMini("chart-search", searchData, "Search Volume", "#38bdf8");
  drawMini("chart-ingest", ingestData, "Ingest Volume", "#a78bfa");
}

function drawMini(id, data, label, color) {
  var c = document.getElementById(id);
  if (!c) { return; }
  // Ensure canvas has proper dimensions
  if (!c.width || c.width < 10) { c.width = 300; }
  if (!c.height || c.height < 10) { c.height = 140; }
  var ctx = c.getContext("2d");
  var w = c.width;
  var h = c.height;

  // Background
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--surface-elevated").trim() || "#1e293b";
  ctx.fillRect(0, 0, w, h);

  // Label
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--text-secondary").trim() || "#94a3b8";
  ctx.font = "11px system-ui";
  ctx.fillText(label, 8, 16);

  if (!data || !data.length) {
    ctx.fillStyle = getTextColor();
    ctx.font = "10px system-ui";
    ctx.fillText("No data", w / 2 - 20, h / 2);
    return;
  }

  var max = Math.max.apply(null, data.map(function(d) { return d.count || d; })) || 1;
  var barW = (w - 20) / data.length;
  data.forEach(function(d, i) {
    var v = d.count || d;
    var barH = (v / max) * (h - 40);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.8;
    ctx.fillRect(10 + i * barW, h - 10 - barH, barW - 2, barH);
  });
  ctx.globalAlpha = 1;
}

// === Recent Activity ===
function renderRecent(recent) {
  var list = document.getElementById("recent-list");
  if (!list || !recent || !recent.length) {
    if (list) { list.innerHTML = "<li style=\"opacity:0.6;\">No recent activity</li>"; }
    return;
  }
  list.innerHTML = recent.slice(0, 10).map(function(r) {
    return '<li><span class="badge">' + escapeHtml(r.type) + '</span> ' +
      escapeHtml(r.title || "Entry #" + r.id) +
      ' <small style="color:var(--text-muted);">' + formatDate(r.createdAt || r.created_at) + '</small></li>';
  }).join("");
}

// === Toast Notifications ===
function showToast(message, type) {
  var container = document.getElementById("toast-container");
  if (!container) {
    container = document.createElement("div");
    container.id = "toast-container";
    container.setAttribute("role", "alert");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  var toast = document.createElement("div");
  toast.className = "toast toast-" + type;
  toast.innerHTML = '<span>' + escapeHtml(message) + '</span>' +
    '<span style="cursor:pointer;margin-left:8px;opacity:.7" onclick="this.parentElement.remove()">\u2715</span>';
  container.prepend(toast);

  var timeout = type === "success" ? 3000 : 5000;
  setTimeout(function() {
    toast.style.opacity = "0";
    setTimeout(function() { toast.remove(); }, 200);
  }, timeout);
}

// === Utilities ===
function getTypeColor(type) {
  var map = {
    DECISION: "#4CAF50", ERROR_PATTERN: "#F44336", ARCHITECTURE: "#2196F3",
    API_DESIGN: "#9C27B0", REQUIREMENT: "#FF9800", LESSON_LEARNED: "#00BCD4",
    PROCEDURE: "#795548", CONTEXT: "#607D8B"
  };
  return map[type] || "#607D8B";
}

function getTextColor() {
  return getComputedStyle(document.body).getPropertyValue("--text-primary").trim() || "#ccc";
}

function formatDate(iso) {
  if (!iso) { return ""; }
  try { return new Date(iso).toLocaleDateString(); } catch (e) { return iso; }
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
