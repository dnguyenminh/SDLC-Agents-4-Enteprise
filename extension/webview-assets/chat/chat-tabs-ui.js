/**
 * Chat Panel — Tab Bar Event Bindings (KSA-240)
 * Tab click/dblclick/close bindings, inline rename editor, add button,
 * keyboard shortcuts. Reads/writes window.ChatState.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var tabBar = S.tabBar;
  var tabAddBtn = S.tabAddBtn;

  S.bindTabEvents = function () {
    var tabItems = tabBar.querySelectorAll(".tab-item");
    for (var i = 0; i < tabItems.length; i++) {
      (function(item) {
        // Click to switch
        item.addEventListener("click", function(e) {
          if (e.target.classList.contains("tab-close")) return;
          var id = this.getAttribute("data-tab-id");
          S.switchToTab(id);
        });
        // Double-click to rename
        item.addEventListener("dblclick", function(e) {
          e.preventDefault();
          var tabId = this.getAttribute("data-tab-id");
          startRename(this, tabId);
        });
      })(tabItems[i]);
    }
    // Close buttons
    var closeBtns = tabBar.querySelectorAll(".tab-close");
    for (var c = 0; c < closeBtns.length; c++) {
      (function(btn) {
        btn.addEventListener("click", function(e) {
          e.stopPropagation();
          var id = this.getAttribute("data-tab-id");
          S.closeTab(id);
        });
      })(closeBtns[c]);
    }
  };

  function startRename(tabEl, tabId) {
    var labelEl = tabEl.querySelector(".tab-label");
    var currentName = labelEl.textContent;
    var input = document.createElement("input");
    input.type = "text";
    input.className = "tab-rename-input";
    input.value = currentName;
    input.maxLength = 30;
    labelEl.style.display = "none";
    tabEl.insertBefore(input, labelEl);
    input.focus();
    input.select();

    function finishRename() {
      var val = input.value.trim();
      if (val) S.renameTab(tabId, val);
      input.remove();
      labelEl.style.display = "";
      var tab = S.getTab(tabId);
      if (tab) labelEl.textContent = tab.name;
    }

    input.addEventListener("blur", finishRename);
    input.addEventListener("keydown", function(e) {
      if (e.key === "Enter") { e.preventDefault(); finishRename(); }
      if (e.key === "Escape") { input.remove(); labelEl.style.display = ""; }
    });
  }

  // Tab add button
  tabAddBtn.addEventListener("click", function() {
    S.createNewTab();
  });

  // Keyboard shortcuts for tabs
  document.addEventListener("keydown", function(e) {
    // Ctrl+Shift+T = new tab
    if (e.ctrlKey && e.shiftKey && e.key === "T") {
      e.preventDefault();
      S.createNewTab();
    }
    // Ctrl+W = close tab
    if (e.ctrlKey && !e.shiftKey && e.key === "w") {
      e.preventDefault();
      S.closeTab(S.activeTabId);
    }
    // Ctrl+Tab = next tab
    if (e.ctrlKey && e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      var idx = -1;
      for (var i = 0; i < S.tabs.length; i++) { if (S.tabs[i].id === S.activeTabId) { idx = i; break; } }
      var nextIdx = (idx + 1) % S.tabs.length;
      S.switchToTab(S.tabs[nextIdx].id);
    }
    // Ctrl+Shift+Tab = prev tab
    if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
      e.preventDefault();
      var idx2 = -1;
      for (var j = 0; j < S.tabs.length; j++) { if (S.tabs[j].id === S.activeTabId) { idx2 = j; break; } }
      var prevIdx = (idx2 - 1 + S.tabs.length) % S.tabs.length;
      S.switchToTab(S.tabs[prevIdx].id);
    }
  });
})();
