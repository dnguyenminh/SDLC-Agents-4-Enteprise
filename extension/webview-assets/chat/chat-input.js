/**
 * Chat Panel — Input Helpers & Bindings
 * Contenteditable input read/write, slash badges, welcome suggestions,
 * send button + Enter/Arrow history keybindings, auto-resize.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var vscode = S.vscode;
  var inputEl = S.inputEl;
  var sendBtn = S.sendBtn;
  var welcomeEl = S.welcomeEl;

  // === Contenteditable Input Helpers ===
  S.getInputText = function () {
    var clone = inputEl.cloneNode(true);
    var badges = clone.querySelectorAll(".slash-badge");
    for (var i = 0; i < badges.length; i++) {
      var textNode = document.createTextNode(badges[i].getAttribute("data-value") + " ");
      badges[i].parentNode.replaceChild(textNode, badges[i]);
    }
    return (clone.innerText || clone.textContent || "").replace(/\n$/, "");
  };

  S.setInputText = function (text) {
    inputEl.textContent = text;
  };

  S.clearInput = function () {
    inputEl.innerHTML = "";
  };

  S.isInputEmpty = function () {
    return !inputEl.textContent.trim() && !inputEl.querySelector(".slash-badge");
  };

  S.insertSlashBadge = function (label, value, icon) {
    var sel = window.getSelection();
    if (!sel.rangeCount) return;
    var range = sel.getRangeAt(0);
    var textNode = range.startContainer;
    if (textNode.nodeType === 3) {
      var text = textNode.textContent;
      var offset = range.startOffset;
      var before = text.substring(0, offset);
      var slashIdx = before.lastIndexOf("/");
      if (slashIdx !== -1) {
        textNode.textContent = text.substring(0, slashIdx) + text.substring(offset);
        var badge = document.createElement("span");
        badge.className = "slash-badge";
        badge.contentEditable = "false";
        badge.setAttribute("data-value", value);
        badge.innerHTML = '<span class="badge-icon">' + icon + '</span> /' + S.escapeHtml(label);
        var afterText = textNode.splitText(slashIdx);
        textNode.parentNode.insertBefore(badge, afterText);
        var space = document.createTextNode("\u00A0");
        badge.parentNode.insertBefore(space, badge.nextSibling);
        var newRange = document.createRange();
        newRange.setStartAfter(space);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }
    }
  };

  S.getCursorContext = function () {
    var sel = window.getSelection();
    if (!sel.rangeCount) return { text: "", cursorPos: 0 };
    var range = sel.getRangeAt(0);
    var node = range.startContainer;
    if (node.nodeType === 3) {
      return { text: node.textContent, cursorPos: range.startOffset, textNode: node };
    }
    return { text: "", cursorPos: 0 };
  };

  // === Welcome Suggestions ===
  var suggestionBtns = welcomeEl.querySelectorAll(".welcome-suggestions button");
  for (var i = 0; i < suggestionBtns.length; i++) {
    suggestionBtns[i].addEventListener("click", function () {
      var action = this.getAttribute("data-action");
      if (action) {
        vscode.postMessage({ type: "executeCommand", command: "kiroSdlc." + action });
        return;
      }
      var cmd = this.getAttribute("data-cmd");
      S.setInputText(cmd);
      inputEl.focus();
      if (cmd === "status" || cmd === "resume") {
        S.sendMessage();
      }
    });
  }

  // === Send ===
  sendBtn.addEventListener("click", S.sendMessage);

  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      S.sendMessage();
    }
    if (e.key === "#" && S.isInputEmpty()) {
      e.preventDefault();
      S.toggleContextMenu();
    }
    // Up/Down arrow history navigation
    if (e.key === "ArrowUp" && S.isInputEmpty() && S.messageHistory.length > 0) {
      e.preventDefault();
      if (S.historyIndex === -1) {
        S.pendingInput = S.getInputText();
        S.historyIndex = S.messageHistory.length - 1;
      } else if (S.historyIndex > 0) {
        S.historyIndex--;
      }
      S.setInputText(S.messageHistory[S.historyIndex]);
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 300) + "px";
    }
    if (e.key === "ArrowDown" && S.historyIndex !== -1) {
      e.preventDefault();
      if (S.historyIndex < S.messageHistory.length - 1) {
        S.historyIndex++;
        S.setInputText(S.messageHistory[S.historyIndex]);
      } else {
        S.historyIndex = -1;
        S.setInputText(S.pendingInput);
      }
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 300) + "px";
    }
  });

  inputEl.addEventListener("input", function () {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 300) + "px";
  });
})();
