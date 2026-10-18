/**
 * Chat Panel — Slash Command Popup UI (SA4E-186)
 * Show/hide/filter popup, keyboard navigation, item selection, "/" trigger
 * detection in the contenteditable input.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var inputEl = S.inputEl;
  var slashPopup = S.slashPopup;

  var slashActiveIndex = -1;
  var slashVisible = false;
  var slashFilterText = "";

  function showSlashPopup() {
    slashPopup.classList.remove("hidden");
    slashVisible = true;
    slashActiveIndex = -1;
    filterSlashItems();
  }

  function hideSlashPopup() {
    slashPopup.classList.add("hidden");
    slashVisible = false;
    slashActiveIndex = -1;
    slashFilterText = "";
    // Remove active class from all items
    var items = slashPopup.querySelectorAll(".slash-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove("active");
    }
  }

  function filterSlashItems() {
    var filter = slashFilterText.toLowerCase();
    var items = slashPopup.querySelectorAll(".slash-item");
    for (var i = 0; i < items.length; i++) {
      var label = items[i].getAttribute("data-slash") || "";
      var desc = items[i].querySelector(".slash-desc");
      var descText = desc ? desc.textContent : "";
      var matches = !filter || label.toLowerCase().indexOf(filter) !== -1 || descText.toLowerCase().indexOf(filter) !== -1;
      items[i].style.display = matches ? "" : "none";
    }
    // Show/hide section titles based on visible children
    var sections = slashPopup.querySelectorAll(".slash-section");
    for (var s = 0; s < sections.length; s++) {
      var sectionItems = sections[s].querySelectorAll(".slash-item");
      var hasVisible = false;
      for (var si = 0; si < sectionItems.length; si++) {
        if (sectionItems[si].style.display !== "none") { hasVisible = true; break; }
      }
      sections[s].style.display = hasVisible ? "" : "none";
    }
  }

  function getVisibleSlashItems() {
    var items = slashPopup.querySelectorAll(".slash-item");
    var visible = [];
    for (var i = 0; i < items.length; i++) {
      if (items[i].style.display !== "none") visible.push(items[i]);
    }
    return visible;
  }

  function selectSlashItem(item) {
    if (!item) return;
    var slashValue = item.getAttribute("data-slash");
    var slashLabel = item.querySelector(".slash-label");
    var slashIcon = item.querySelector(".slash-icon");
    var label = slashLabel ? slashLabel.textContent : slashValue;
    var icon = slashIcon ? slashIcon.textContent : "/";

    // Insert inline badge in contenteditable
    S.insertSlashBadge(label, slashValue, icon);

    hideSlashPopup();
    inputEl.focus();
  }

  // Detect / trigger in input — listen on the existing input handler
  var _origInputHandler = inputEl.oninput;
  inputEl.addEventListener("input", function () {
    var ctx = S.getCursorContext();
    var beforeCursor = ctx.text.substring(0, ctx.cursorPos);

    // Check if / is at start or after a space
    var slashIdx = beforeCursor.lastIndexOf("/");
    var shouldShow = false;

    if (slashIdx !== -1) {
      if (slashIdx === 0 || /[\s\n\u00A0]/.test(beforeCursor[slashIdx - 1])) {
        var afterSlash = beforeCursor.substring(slashIdx + 1);
        if (afterSlash.indexOf(" ") === -1) {
          shouldShow = true;
          slashFilterText = afterSlash;
        }
      }
    }

    if (shouldShow) {
      if (!slashVisible) showSlashPopup();
      else filterSlashItems();
    } else if (slashVisible) {
      hideSlashPopup();
    }
  });

  // Keyboard navigation for slash popup (added before the existing keydown)
  inputEl.addEventListener("keydown", function (e) {
    if (!slashVisible) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopImmediatePropagation();
      var items = getVisibleSlashItems();
      if (items.length === 0) return;
      slashActiveIndex = Math.min(slashActiveIndex + 1, items.length - 1);
      updateSlashActive(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopImmediatePropagation();
      var items2 = getVisibleSlashItems();
      if (items2.length === 0) return;
      slashActiveIndex = Math.max(slashActiveIndex - 1, 0);
      updateSlashActive(items2);
    } else if (e.key === "Enter" || e.key === "Tab") {
      var items3 = getVisibleSlashItems();
      if (items3.length > 0 && slashActiveIndex >= 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        selectSlashItem(items3[slashActiveIndex]);
      } else if (e.key === "Tab" && items3.length > 0) {
        e.preventDefault();
        e.stopImmediatePropagation();
        selectSlashItem(items3[0]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      hideSlashPopup();
    }
  }, true); // capture phase to intercept before other handlers

  function updateSlashActive(items) {
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("active", i === slashActiveIndex);
    }
    // Scroll active into view
    if (slashActiveIndex >= 0 && items[slashActiveIndex]) {
      items[slashActiveIndex].scrollIntoView({ block: "nearest" });
    }
  }

  // Click handler for slash items
  slashPopup.addEventListener("click", function (e) {
    var item = e.target.closest ? e.target.closest(".slash-item") : null;
    if (item) {
      e.preventDefault();
      e.stopPropagation();
      selectSlashItem(item);
    }
  });

  // Hide popup on outside click
  document.addEventListener("click", function (e) {
    if (slashVisible && !slashPopup.contains(e.target) && e.target !== inputEl) {
      hideSlashPopup();
    }
  });
})();
