/**
 * Chat Panel — Slash Command Data (SA4E-186, SA4E-188)
 * Populates agents/skills/steering sections of the slash popup from
 * extension messages; overrides renderSteeringRules to also refresh the
 * steering slash list.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var slashAgentsList = S.slashAgentsList;
  var slashSteeringList = S.slashSteeringList;
  var slashSkillsList = S.slashSkillsList;

  // SA4E-186: Populate agents dynamically from Extension Host
  S.populateSlashAgents = function (agents) {
    if (!slashAgentsList || !agents || agents.length === 0) return;
    slashAgentsList.innerHTML = "";
    for (var i = 0; i < agents.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slash-item";
      btn.setAttribute("data-slash", "/" + agents[i].id);
      btn.setAttribute("role", "option");
      btn.innerHTML = '<span class="slash-icon">\u{1F916}</span>' +
        '<span class="slash-label">' + S.escapeHtml(agents[i].name || agents[i].id) + '</span>' +
        '<span class="slash-desc">' + S.escapeHtml(agents[i].description || "") + '</span>';
      slashAgentsList.appendChild(btn);
    }
  };

  // SA4E-188: Populate skills dynamically from Extension Host (own section)
  S.populateSlashSkills = function (skills) {
    if (!slashSkillsList || !skills || skills.length === 0) return;
    slashSkillsList.innerHTML = "";
    for (var i = 0; i < skills.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slash-item";
      btn.setAttribute("data-slash", "/" + skills[i].id);
      btn.setAttribute("role", "option");
      btn.innerHTML = '<span class="slash-icon">\u{1F9E9}</span>' +
        '<span class="slash-label">' + S.escapeHtml(skills[i].label || skills[i].id) + '</span>' +
        '<span class="slash-desc">' + S.escapeHtml(skills[i].description || "") + '</span>';
      slashSkillsList.appendChild(btn);
    }
  };

  // Steering rules data (populated from extension message or defaults)
  var slashSteeringRules = [];

  // Populate steering list from chat:steeringLoaded message data
  function populateSlashSteering(rules) {
    slashSteeringRules = rules || [];
    slashSteeringList.innerHTML = "";
    for (var i = 0; i < slashSteeringRules.length; i++) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "slash-item";
      btn.setAttribute("data-slash", "/" + slashSteeringRules[i].name);
      btn.setAttribute("role", "option");
      btn.innerHTML = '<span class="slash-icon">\u{1F9ED}</span>' +
        '<span class="slash-label">' + S.escapeHtml(slashSteeringRules[i].name) + '</span>' +
        '<span class="slash-desc">' + S.escapeHtml(slashSteeringRules[i].file || "") + '</span>';
      slashSteeringList.appendChild(btn);
    }
  }

  // Default steering entries (fallback if extension hasn't sent steeringLoaded)
  var defaultSteeringNames = [
    "concise-responses", "sm-core", "phase-1-requirements", "phase-2-specification",
    "phase-3-design", "phase-4-test-planning", "phase-5-implementation",
    "phase-6-testing", "phase-7-deployment", "shared-jira", "shared-quality-gates",
    "shared-diagrams", "tool-usage-dynamic", "code-standards"
  ];
  (function initDefaultSteering() {
    var defaults = [];
    for (var i = 0; i < defaultSteeringNames.length; i++) {
      defaults.push({ name: defaultSteeringNames[i], file: ".code-intel/steering/" + defaultSteeringNames[i] + ".md" });
    }
    populateSlashSteering(defaults);
  })();

  // Override renderSteeringRules to also populate slash popup
  var _origRenderSteering = S.renderSteeringRules;
  S.renderSteeringRules = function(rules) {
    _origRenderSteering(rules);
    populateSlashSteering(rules);
  };
})();
