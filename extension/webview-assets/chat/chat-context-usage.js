/**
 * Chat Panel — Context Usage Icon (KSA-240)
 * Arc gauge, Kiro-style tooltip breakdown, threshold pulse + toast,
 * full-context warning. Reads/writes window.ChatState.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var contextUsageIcon = S.contextUsageIcon;
  var contextTooltip = S.contextTooltip;
  var contextFullWarning = S.contextFullWarning;
  var fullNewTabLink = S.fullNewTabLink;
  var contextToast = S.contextToast;
  var toastText = S.toastText;
  var toastDismiss = S.toastDismiss;

  var ARC_CIRCUMFERENCE = 50.27; // 2*PI*8

  S.updateContextIcon = function (tokenCount, maxTokens, breakdown) {
    if (maxTokens <= 0) return;
    var pct = Math.min(100, Math.round((tokenCount / maxTokens) * 100));
    var offset = ARC_CIRCUMFERENCE - (ARC_CIRCUMFERENCE * pct / 100);
    var arcEl = contextUsageIcon.querySelector(".arc-progress");

    // Update arc
    arcEl.setAttribute("stroke-dashoffset", offset.toString());

    // Determine threshold
    var ratio = pct / 100;
    var threshold = "safe";
    if (ratio >= 0.95) threshold = "full";
    else if (ratio >= 0.80) threshold = "critical";
    else if (ratio >= 0.60) threshold = "warning";

    // Update color class
    arcEl.className.baseVal = "arc-progress " + threshold;

    // Tooltip — Kiro-style breakdown
    if (breakdown) {
      contextTooltip.innerHTML =
        '<div style="font-weight:600;margin-bottom:4px;">Context Usage<span style="float:right">' + pct + '%</span></div>' +
        '<div>Conversation<span style="float:right">' + (breakdown.conversation || 0) + '%</span></div>' +
        '<div>MCP tools<span style="float:right">' + (breakdown.mcpTools || 0) + '%</span></div>' +
        '<div>Steering files<span style="float:right">' + (breakdown.steering || 0) + '%</span></div>';
    } else {
      contextTooltip.textContent = tokenCount.toLocaleString() + " / " + maxTokens.toLocaleString() + " tokens (" + pct + "%)";
    }

    // Pulse animation when crossing 80% boundary
    if (threshold === "critical" && S.lastThreshold !== "critical" && S.lastThreshold !== "full") {
      contextUsageIcon.classList.add("pulse");
      setTimeout(function() { contextUsageIcon.classList.remove("pulse"); }, 2000);
    }

    // Notification toast at 95%
    if (ratio >= 0.95 && S.lastThreshold !== "full") {
      toastText.textContent = "Context usage at " + pct + "% \u2014 consider starting a new tab";
      contextToast.classList.add("visible");
    }

    // Full warning in input area
    if (ratio >= 1.0) {
      contextFullWarning.classList.add("visible");
    } else {
      contextFullWarning.classList.remove("visible");
    }

    S.lastThreshold = threshold;
  };

  // Toast dismiss
  toastDismiss.addEventListener("click", function() {
    contextToast.classList.remove("visible");
  });

  // Full warning "new tab" link
  fullNewTabLink.addEventListener("click", function() {
    S.createNewTab();
    contextFullWarning.classList.remove("visible");
  });
})();
