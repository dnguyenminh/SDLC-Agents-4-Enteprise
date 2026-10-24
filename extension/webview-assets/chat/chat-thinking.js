/**
 * Chat Panel — Thinking Block Module (SA4E-381 Issue 2)
 * Extracted from chat-cycle.js (200-line standard). Owns every thinking-block
 * concern: the shared DOM builder (live + replay), the per-cycle live block,
 * collapse/settle rules with direction tracking.
 *
 * States: streaming (live, never auto-collapsed — R2) → settled (meta filled)
 * → collapsed/expanded by auto rule UNLESS the user picked a state
 * (data-user-managed, sticky — R2/R4). Direction (`thinkingCollapsed`) is
 * tracked so rebuilds and replay honor the user's choice (SA4E-381: fixes the
 * expand-always rebuild bug and the inverted chevron convention).
 */
(function () {
  "use strict";
  var S = window.ChatState;
  var messagesEl = S.messagesEl;

  function appendNode(el) {
    messagesEl.appendChild(el);
    S.scrollToBottom();
  }

  /**
   * Shared thinking-block builder (live + replay). Header is a real
   * button-like affordance: chevron (collapsed ▸ / expanded ▼), label, and a
   * metadata span; body keeps the 220px scroll cap. Returns
   * { wrap, header, body, toggle } — `onToggle(nowCollapsed)` lets callers
   * persist the user's direction (sticky R2/R4 choice).
   */
  S.buildThinkingBlockDom = function (thinkingText, collapsed, userManaged, meta, onToggle) {
    var wrap = document.createElement("div");
    wrap.className = "thinking-block" + (collapsed ? " collapsed" : "");
    if (userManaged) wrap.setAttribute("data-user-managed", "true");
    var header = document.createElement("div");
    header.className = "thinking-header";
    header.setAttribute("tabindex", "0");
    header.setAttribute("role", "button");
    header.setAttribute("aria-expanded", collapsed ? "false" : "true");
    header.innerHTML = '<span class="thinking-chevron">&#9656;</span><span class="thinking-label">Thinking</span><span class="thinking-meta"></span>';
    var body = document.createElement("div");
    body.className = "thinking-body";
    body.textContent = thinkingText || "";
    wrap.appendChild(header);
    wrap.appendChild(body);
    function applyMeta() {
      if (!meta) return;
      var parts = [];
      if (meta.chars) parts.push(meta.chars + " chars");
      if (meta.durationMs) parts.push((Math.round(meta.durationMs / 100) / 10) + "s");
      header.querySelector(".thinking-meta").textContent = parts.length ? "\u00B7 " + parts.join(" \u00B7 ") : "";
    }
    function toggle() {
      var nowCollapsed = !wrap.classList.contains("collapsed");
      wrap.classList.toggle("collapsed", nowCollapsed);
      header.setAttribute("aria-expanded", nowCollapsed ? "false" : "true");
      wrap.setAttribute("data-user-managed", "true");
      if (onToggle) onToggle(nowCollapsed);
      return nowCollapsed;
    }
    header.addEventListener("click", toggle);
    header.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
    applyMeta();
    return { wrap: wrap, header: header, body: body, toggle: toggle };
  };

  /** Builds the LIVE cycle thinking block, wiring direction persistence into
   *  the shared builder's toggle (cycle `c` owns the state). */
  S.buildThinkingBlock = function (c) {
    var b = S.buildThinkingBlockDom(
      c.thinkingText || "",
      !!c.thinkingCollapsed,
      !!c.thinkingUser,
      null,
      function (nowCollapsed) {
        // R2 sticky: once the user picks a state, auto rules never touch it.
        c.thinkingUser = true;
        c.thinkingCollapsed = nowCollapsed;
      }
    );
    c.thinkingEl = b.wrap;
    c.thinkingHeader = b.header;
    c.thinkingBody = b.body;
    return b.wrap;
  };

  /** The cycle's streaming thinking block (before the bubble when present).
   *  Recreated detached (mid-stream tab switch), carrying buffered text AND
   *  the user's collapse direction (SA4E-381: fixes the expand-always bug). */
  S.ensureThinking = function (c) {
    if (c.thinkingEl && c.thinkingEl.parentNode === messagesEl) return c.thinkingEl;
    var wrap = S.buildThinkingBlock(c);
    if (c.thinkingUser) wrap.setAttribute("data-user-managed", "true");
    if (c.thinkingText) c.thinkingBody.textContent = c.thinkingText;
    if (c.bubbleEl && c.bubbleEl.parentNode === messagesEl) {
      messagesEl.insertBefore(wrap, c.bubbleEl);
    } else {
      appendNode(wrap);
    }
    return wrap;
  };

  /** Collapse a cycle's thinking (no-op when the user took control — R2). */
  S.collapseThinking = function (c) {
    if (!c.thinkingEl || c.thinkingEl.getAttribute("data-user-managed") === "true") return;
    c.thinkingEl.classList.add("collapsed");
    c.thinkingEl.classList.remove("streaming");
  };

  /** Mark a thinking stream settled: drop the streaming visual and fill the
   *  header metadata (SA4E-381 Issue 2: chars + cycle duration). */
  S.settleThinking = function (c) {
    if (c.thinkingEl) c.thinkingEl.classList.remove("streaming");
    if (c.thinkingHeader) {
      var meta = {
        chars: (c.thinkingText || "").length,
        durationMs: c.openedAt ? Date.now() - c.openedAt : undefined
      };
      var metaEl = c.thinkingHeader.querySelector(".thinking-meta");
      if (metaEl) {
        var parts = [];
        if (meta.chars) parts.push(meta.chars + " chars");
        if (meta.durationMs) parts.push((Math.round(meta.durationMs / 100) / 10) + "s");
        metaEl.textContent = parts.length ? "\u00B7 " + parts.join(" \u00B7 ") : "";
      }
    }
  };
})();
