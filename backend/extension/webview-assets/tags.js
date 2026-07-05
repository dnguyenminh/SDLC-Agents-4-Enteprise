/**
 * tags.js — Tag cloud, taxonomy tree, search with table + pagination.
 * Pure DOM manipulation, no external library dependencies.
 */

/* global vscode, handlePanelMessage */

var PAGE_SIZE = 20;
var currentTag = '';
var currentOffset = 0;
var currentTotal = 0;

function handlePanelMessage(msg) {
  if (msg.type === "tagsData") {
    renderTags(msg.taxonomy, msg.popular);
  }
  if (msg.type === "filteredEntries") {
    currentTotal = msg.total || (msg.entries ? msg.entries.length : 0);
    renderEntries(msg.entries, currentOffset, currentTotal);
  }
}

function renderTags(taxonomy, popular) {
  var loading = document.getElementById("loading");
  var content = document.getElementById("content");
  loading.style.display = "none";
  content.style.display = "block";
  renderCloud(popular);
  renderTree(taxonomy);
  setupSearch();
}

function setupSearch() {
  var input = document.getElementById("tag-search");
  if (!input) return;
  var debounce = null;
  input.addEventListener("input", function() {
    clearTimeout(debounce);
    var val = input.value.trim();
    debounce = setTimeout(function() {
      if (val.length >= 2) {
        currentOffset = 0;
        currentTag = val;
        vscode.postMessage({ type: "filterByTag", tag: val, offset: 0, limit: PAGE_SIZE });
      } else {
        var el = document.getElementById("entries-list");
        if (el) el.innerHTML = "";
      }
    }, 300);
  });
  input.addEventListener("keyup", function(ev) {
    if (ev.key === "Enter" && this.value.trim()) {
      clearTimeout(debounce);
      currentOffset = 0;
      currentTag = this.value.trim();
      vscode.postMessage({ type: "filterByTag", tag: currentTag, offset: 0, limit: PAGE_SIZE });
    }
  });
}

function renderCloud(popular) {
  var container = document.getElementById("tag-cloud");
  if (!container || !popular || !popular.length) {
    if (container) container.innerHTML = '<p style="color:var(--text-muted);">No tags yet.</p>';
    return;
  }
  var maxCount = Math.max.apply(null, popular.map(function(t) { return t.usage_count || t.count || 1; }));
  container.innerHTML = popular.map(function(tag) {
    var count = tag.usage_count || tag.count || 0;
    var size = 12 + Math.round((count / maxCount) * 20);
    var opacity = 0.5 + (count / maxCount) * 0.5;
    return '<span class="tag-item" data-tag="' + escapeAttr(tag.tag) + '" style="font-size:' + size + "px;opacity:" + opacity +
      ';cursor:pointer;display:inline-block;margin:4px 6px;padding:2px 8px;border-radius:12px;background:var(--badge-bg);color:var(--badge-fg);">' +
      escapeHtml(tag.tag) + " <small>(" + count + ")</small></span>";
  }).join("");
  container.addEventListener("click", function(e) {
    var item = e.target.closest(".tag-item");
    if (item) {
      var tag = item.getAttribute("data-tag");
      if (tag) {
        var searchInput = document.getElementById("tag-search");
        if (searchInput) searchInput.value = tag;
        currentOffset = 0;
        currentTag = tag;
        vscode.postMessage({ type: "filterByTag", tag: tag, offset: 0, limit: PAGE_SIZE });
      }
    }
  });
}

function renderTree(taxonomy) {
  var container = document.getElementById("tag-tree");
  if (!container || !taxonomy) return;
  var categories;
  if (Array.isArray(taxonomy)) {
    categories = {};
    taxonomy.forEach(function(t) {
      var cat = t.category || "uncategorized";
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push(t.tag);
    });
  } else {
    categories = taxonomy;
  }
  var catKeys = Object.keys(categories);
  if (catKeys.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">No taxonomy defined.</p>';
    return;
  }
  container.innerHTML = catKeys.map(function(cat) {
    var tags = categories[cat] || [];
    return '<div class="card" style="margin-bottom:8px;"><h4>' + escapeHtml(cat) + '</h4><div style="display:flex;flex-wrap:wrap;gap:4px;">' +
      tags.map(function(t) {
        return '<span class="badge tag-tree-item" data-tag="' + escapeAttr(t) + '" style="cursor:pointer;">' + escapeHtml(t) + "</span>";
      }).join("") + "</div></div>";
  }).join("");
  container.addEventListener("click", function(e) {
    var item = e.target.closest(".tag-tree-item");
    if (item) {
      var tag = item.getAttribute("data-tag");
      if (tag) {
        var searchInput = document.getElementById("tag-search");
        if (searchInput) searchInput.value = tag;
        currentOffset = 0;
        currentTag = tag;
        vscode.postMessage({ type: "filterByTag", tag: tag, offset: 0, limit: PAGE_SIZE });
      }
    }
  });
}

function renderEntries(entries, offset, total) {
  var container = document.getElementById("entries-list");
  if (!container) return;
  if (!entries || entries.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);">No entries found for this tag.</p>';
    container.scrollIntoView({ behavior: "smooth" });
    return;
  }
  var totalPages = Math.ceil(total / PAGE_SIZE);
  var currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  var html = "<h3>Entries (" + total + ")</h3>";
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;">';
  html += '<thead><tr style="border-bottom:1px solid var(--border-subtle);text-align:left;">'
    + '<th style="padding:5px 8px;width:35px;">#</th>'
    + '<th style="padding:5px 8px;width:45px;">ID</th>'
    + '<th style="padding:5px 8px;width:110px;">Type</th>'
    + '<th style="padding:5px 8px;">Summary</th></tr></thead><tbody>';
  entries.forEach(function(e, i) {
    html += '<tr style="border-bottom:1px solid var(--border-subtle);">'
      + '<td style="padding:4px 8px;opacity:.6;">' + (offset + i + 1) + '</td>'
      + '<td style="padding:4px 8px;opacity:.6;">' + (e.id || '') + '</td>'
      + '<td style="padding:4px 8px;"><span class="badge">' + escapeHtml(e.type || 'CONTEXT') + '</span></td>'
      + '<td style="padding:4px 8px;">' + escapeHtml(e.title || e.summary || 'Entry #' + e.id) + '</td></tr>';
  });
  html += '</tbody></table>';
  if (totalPages > 1) {
    html += '<div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:12px;">';
    html += '<button onclick="goPage(-1)" ' + (currentPage <= 1 ? 'disabled' : '') + ' style="padding:4px 10px;border-radius:3px;border:1px solid var(--border-subtle);background:var(--badge-bg);color:var(--badge-fg);cursor:pointer;">&laquo; Prev</button>';
    html += '<span style="opacity:.7;">Page ' + currentPage + ' / ' + totalPages + '</span>';
    html += '<button onclick="goPage(1)" ' + (currentPage >= totalPages ? 'disabled' : '') + ' style="padding:4px 10px;border-radius:3px;border:1px solid var(--border-subtle);background:var(--badge-bg);color:var(--badge-fg);cursor:pointer;">Next &raquo;</button>';
    html += '</div>';
  }
  container.innerHTML = html;
  container.scrollIntoView({ behavior: "smooth" });
}

function goPage(dir) {
  currentOffset += dir * PAGE_SIZE;
  if (currentOffset < 0) currentOffset = 0;
  if (currentOffset >= currentTotal) currentOffset = Math.max(0, currentTotal - PAGE_SIZE);
  vscode.postMessage({ type: "filterByTag", tag: currentTag, offset: currentOffset, limit: PAGE_SIZE });
}

function escapeHtml(str) {
  var div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}
function escapeAttr(str) {
  return (str || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");
}
