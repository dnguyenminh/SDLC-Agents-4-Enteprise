/**
 * Chat Panel — Right sidebar (SA4E-391, OpenCode style).
 * Shows session title, Context token usage, and the MCP server list with
 * connection status. Context comes from tab:contextUpdate (reused gauge data);
 * MCP comes from the chat:mcpServers host message and the serverStatus event.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var sessionEl = document.getElementById("oc-sb-session");
  var ctxTokensEl = document.getElementById("oc-ctx-tokens");
  var ctxPctEl = document.getElementById("oc-ctx-pct");
  var mcpListEl = document.getElementById("oc-mcp-list");

  function fmtNum(n) {
    return (n || 0).toLocaleString();
  }

  /** Update Context section from token counts. */
  S.updateSidebarContext = function (tokenCount, maxTokens) {
    if (ctxTokensEl) ctxTokensEl.textContent = fmtNum(tokenCount) + " tokens";
    if (ctxPctEl && maxTokens > 0) {
      var pct = Math.min(100, Math.round((tokenCount / maxTokens) * 100));
      ctxPctEl.textContent = pct + "% used";
    }
  };

  /** Update the session title (follows the active tab name). */
  S.updateSidebarTitle = function (name) {
    if (sessionEl && name) sessionEl.textContent = name;
  };

  /** Render the MCP server list. servers: [{ name, status }]. */
  S.renderMcpServers = function (servers) {
    if (!mcpListEl) return;
    if (!servers || servers.length === 0) {
      mcpListEl.innerHTML = '<div class="oc-sb-row">No MCP servers</div>';
      return;
    }
    mcpListEl.innerHTML = servers.map(function (s) {
      var st = (s.status || "unknown").toLowerCase();
      var label = st === "connected" ? "Connected"
        : st === "disconnected" ? "Disconnected"
        : st === "failed" ? "Failed" : "Unknown";
      return '<div class="oc-mcp-item" data-mcp-name="' + S.escapeHtml(s.name || "") + '">' +
        '<span class="oc-mcp-dot">\u2022</span>' +
        '<span class="oc-mcp-name">' + S.escapeHtml(s.name || "") + '</span>' +
        '<span class="oc-mcp-status ' + st + '">' + label + '</span>' +
        '</div>';
    }).join("");
    var items = mcpListEl.querySelectorAll('.oc-mcp-item');
    items.forEach(function(el) {
      el.addEventListener('click', function() {
        var name = el.getAttribute('data-mcp-name') || '';
        var srv = servers.find(function(s){ return s.name===name; });
        var detail = '<div style="font-weight:700;margin-bottom:6px">MCP Server: ' + S.escapeHtml(name) + '</div>' +
          '<div>Status: ' + (srv ? srv.status : 'unknown') + '</div>' +
          '<div>Details shown client-side to avoid tool-call loops.</div>';
        S.showToast && S.showToast(detail, 4000);
      });
    });
  };

  // Keep a single known server (code-intel) in sync with the serverStatus event
  // until the host sends a full chat:mcpServers list.
  S.updateSidebarServerStatus = function (status) {
    S.renderMcpServers([{ name: "code-intel", status: status }]);
  };
})();
