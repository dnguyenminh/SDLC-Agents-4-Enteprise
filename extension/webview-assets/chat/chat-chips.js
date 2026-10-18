/**
 * Chat Panel — Context Chips (# context references)
 * Add/remove/clear chips shown above the input box.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var inputChipsEl = S.inputChipsEl;

  // === Context Chips ===
  S.addContextChip = function (item) {
    S.contextItems.push(item);
    renderContextChips();
  };

  function removeContextChip(index) {
    S.contextItems.splice(index, 1);
    renderContextChips();
  }

  S.clearContextChips = function () {
    S.contextItems = [];
    inputChipsEl.innerHTML = "";
  };

  function renderContextChips() {
    inputChipsEl.innerHTML = "";
    for (var i = 0; i < S.contextItems.length; i++) {
      var chip = document.createElement("span");
      chip.className = "context-chip";
      chip.innerHTML = '<span class="chip-icon">#</span>' +
        S.escapeHtml(S.contextItems[i].label) +
        '<span class="chip-remove" data-idx="' + i + '">\u00D7</span>';
      inputChipsEl.appendChild(chip);
    }
    var removeBtns = inputChipsEl.querySelectorAll(".chip-remove");
    for (var r = 0; r < removeBtns.length; r++) {
      removeBtns[r].addEventListener("click", function () {
        removeContextChip(parseInt(this.getAttribute("data-idx")));
      });
    }
  }
})();
