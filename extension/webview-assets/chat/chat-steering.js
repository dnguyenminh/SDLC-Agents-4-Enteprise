/**
 * Chat Panel — Steering Rules & Hook Badges (KSA-240)
 * "Included Rules" section rendering + per-hook status badges in the
 * message area.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var messagesEl = S.messagesEl;
  var steeringSection = S.steeringSection;
  var steeringHeader = S.steeringHeader;
  var steeringList = S.steeringList;
  var steeringCount = S.steeringCount;

  steeringHeader.addEventListener("click", function() {
    steeringSection.classList.toggle("expanded");
  });

  S.renderSteeringRules = function (rules) {
    if (!rules || rules.length === 0) return;
    steeringSection.classList.add("visible");
    steeringCount.textContent = "(" + rules.length + ")";
    steeringList.innerHTML = "";
    for (var i = 0; i < rules.length; i++) {
      var badge = document.createElement("span");
      badge.className = "steering-badge";
      badge.innerHTML = '<span class="badge-icon">\u{1F4CB}</span>' + S.escapeHtml(rules[i].name);
      badge.title = rules[i].file;
      steeringList.appendChild(badge);
    }
  };

  S.renderHookBadge = function (hook) {
    if (!hook) return;
    S.showMessages();
    var el = document.createElement("div");
    el.className = "hook-badge";
    var statusIcon = hook.status === "completed" ? "\u2713" : hook.status === "skipped" ? "\u23ED" : "\u23F3";
    el.innerHTML = '<span class="hook-icon">\u{1F517}</span>' +
      '<span class="hook-name">' + S.escapeHtml(hook.name) + '</span>' +
      '<span class="hook-status ' + hook.status + '">' + statusIcon + '</span>';
    messagesEl.appendChild(el);
    S.scrollToBottom();
  };
})();
