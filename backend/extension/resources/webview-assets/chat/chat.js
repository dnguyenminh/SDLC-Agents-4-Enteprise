/**
 * Chat Panel Main Logic — KSA-210 + KSA-230 (Kiro-style)
 * Handles message rendering, streaming, tool calls, context chips,
 * model selector, autopilot toggle, attachments, and extension comms.
 */

(function () {
  "use strict";

  var vscode = acquireVsCodeApi();
  window.__vscode = vscode;

  // === DOM References ===
  var messagesEl = document.getElementById("chat-messages");
  var inputEl = document.getElementById("chat-input");
  var sendBtn = document.getElementById("send-btn");
  var statusEl = document.getElementById("status-indicator");
  var welcomeEl = document.getElementById("welcome-state");
  var workingBar = document.getElementById("working-bar");
  var workingText = document.getElementById("working-text");
  var cancelBtn = document.getElementById("cancel-btn");
  var followBtn = document.getElementById("follow-btn");
  var stopBtn = document.getElementById("stop-btn");
  var ctxBtn = document.getElementById("ctx-btn");
  var attachBtn = document.getElementById("attach-btn");
  var modelBtn = document.getElementById("model-btn");
  var modelLabel = document.getElementById("model-label");
  var modelDropdown = document.getElementById("model-dropdown");
  var contextMenu = document.getElementById("context-menu");
  var autopilotToggle = document.getElementById("autopilot-toggle");
  var inputChipsEl = document.getElementById("input-context-chips");

  // === State ===
  var streamingNodes = {};
  var isStreaming = false;
  var graphDone = false; // KSA-240: prevents working re-activation after completion
  var hasMessages = false;
  var currentModel = "auto";
  var currentMode = "autopilot";
  var contextItems = [];
  var toolCalls = {};
  var messageHistory = [];
  var historyIndex = -1;
  var pendingInput = "";

  // === Tab State (KSA-240) ===
  var defaultTabId = crypto.randomUUID();
  var tabs = [{ id: defaultTabId, name: "Chat 1", messages: [], tokenCount: 0, maxTokens: 128000 }];
  var activeTabId = defaultTabId;
  var tabCounter = 1;
  var MAX_TABS = 10;
  var lastThreshold = "safe";

  // === Tab DOM References (KSA-240) ===
  var tabBar = document.getElementById("tab-bar");
  var tabAddBtn = document.getElementById("tab-add-btn");
  var contextUsageIcon = document.getElementById("context-usage-icon");
  var contextTooltip = document.getElementById("context-tooltip");
  var contextFullWarning = document.getElementById("context-full-warning");
  var fullNewTabLink = document.getElementById("full-new-tab");
  var contextToast = document.getElementById("context-toast");
  var toastText = document.getElementById("toast-text");
  var toastDismiss = document.getElementById("toast-dismiss");

  // === Context Usage Icon Logic (KSA-240) ===
  var ARC_CIRCUMFERENCE = 50.27; // 2*PI*8

  function updateContextIcon(tokenCount, maxTokens) {
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

    // Tooltip
    var formatted = tokenCount.toLocaleString() + " / " + maxTokens.toLocaleString() + " tokens (" + pct + "%)";
    contextTooltip.textContent = formatted;

    // Pulse animation when crossing 80% boundary
    if (threshold === "critical" && lastThreshold !== "critical" && lastThreshold !== "full") {
      contextUsageIcon.classList.add("pulse");
      setTimeout(function() { contextUsageIcon.classList.remove("pulse"); }, 2000);
    }

    // Notification toast at 95%
    if (ratio >= 0.95 && lastThreshold !== "full") {
      toastText.textContent = "Context usage at " + pct + "% \u2014 consider starting a new tab";
      contextToast.classList.add("visible");
    }

    // Full warning in input area
    if (ratio >= 1.0) {
      contextFullWarning.classList.add("visible");
    } else {
      contextFullWarning.classList.remove("visible");
    }

    lastThreshold = threshold;
  }

  // Toast dismiss
  toastDismiss.addEventListener("click", function() {
    contextToast.classList.remove("visible");
  });

  // Full warning "new tab" link
  fullNewTabLink.addEventListener("click", function() {
    createNewTab();
    contextFullWarning.classList.remove("visible");
  });

  // === Tab Bar Logic (KSA-240) ===
  function createNewTab() {
    if (tabs.length >= MAX_TABS) return;
    tabCounter++;
    var newTab = { id: crypto.randomUUID(), name: "Chat " + tabCounter, messages: [], tokenCount: 0, maxTokens: 128000 };
    tabs.push(newTab);
    switchToTab(newTab.id);
    renderTabBar();
    saveStateToDisk();
    vscode.postMessage({ type: "tab:create" });
  }

  function switchToTab(tabId) {
    if (tabId === activeTabId) return;
    // Save current tab state
    var current = getTab(activeTabId);
    if (current) {
      current.scrollPosition = messagesEl.scrollTop;
    }

    activeTabId = tabId;
    var tab = getTab(tabId);

    // Clear message area and re-render target tab messages
    messagesEl.innerHTML = "";
    activeToolContainer = null; // Reset container on tab switch
    if (tab && tab.messages && tab.messages.length > 0) {
      showMessages();
      for (var i = 0; i < tab.messages.length; i++) {
        var msg = tab.messages[i];
        if (msg.role === "tool" && msg.toolData) {
          renderToolCall(msg.toolData, true);
        } else {
          finalizeToolContainer();
          appendMessage(msg.role, msg.content, msg.nodeId);
        }
      }
      finalizeToolContainer();
      // Restore scroll position
      if (tab.scrollPosition) {
        messagesEl.scrollTop = tab.scrollPosition;
      }
    } else {
      // Empty tab — show welcome state
      messagesEl.classList.add("hidden");
      welcomeEl.classList.remove("hidden");
      hasMessages = false;
    }

    if (tab) {
      // Update context icon for this tab
      updateContextIcon(tab.tokenCount, tab.maxTokens);
      lastThreshold = "safe"; // Reset to avoid false pulse
    }
    renderTabBar();
    vscode.postMessage({ type: "tab:switch", payload: { tabId: tabId } });
  }

  function closeTab(tabId) {
    if (tabs.length <= 1) return;
    var idx = -1;
    for (var i = 0; i < tabs.length; i++) { if (tabs[i].id === tabId) { idx = i; break; } }
    if (idx === -1) return;
    tabs.splice(idx, 1);

    if (tabId === activeTabId) {
      var newIdx = idx > 0 ? idx - 1 : 0;
      activeTabId = tabs[newIdx].id;
    }
    renderTabBar();
    saveStateToDisk();
    vscode.postMessage({ type: "tab:close", payload: { tabId: tabId } });
  }

  function renameTab(tabId, newName) {
    var tab = getTab(tabId);
    if (!tab) return;
    var trimmed = (newName || "").trim();
    if (!trimmed) return;
    tab.name = trimmed.substring(0, 30);
    renderTabBar();
    saveStateToDisk();
    vscode.postMessage({ type: "tab:rename", payload: { tabId: tabId, newName: tab.name } });
  }

  function getTab(tabId) {
    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].id === tabId) return tabs[i];
    }
    return null;
  }

  function renderTabBar() {
    // Remove all tab items (keep add button)
    var existingTabs = tabBar.querySelectorAll(".tab-item");
    for (var i = 0; i < existingTabs.length; i++) {
      existingTabs[i].remove();
    }

    // Create tab elements
    for (var t = 0; t < tabs.length; t++) {
      var tab = tabs[t];
      var el = document.createElement("button");
      el.className = "tab-item" + (tab.id === activeTabId ? " active" : "");
      el.setAttribute("data-tab-id", tab.id);
      el.setAttribute("role", "tab");
      el.setAttribute("aria-selected", tab.id === activeTabId ? "true" : "false");

      var label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tab.name;
      el.appendChild(label);

      if (tabs.length > 1) {
        var closeBtn = document.createElement("span");
        closeBtn.className = "tab-close";
        closeBtn.setAttribute("aria-label", "Close tab");
        closeBtn.innerHTML = "&times;";
        closeBtn.setAttribute("data-tab-id", tab.id);
        el.appendChild(closeBtn);
      }

      tabBar.insertBefore(el, tabAddBtn);
    }

    // Update add button state
    tabAddBtn.disabled = tabs.length >= MAX_TABS;
    tabAddBtn.title = tabs.length >= MAX_TABS ? "Maximum 10 tabs" : "New conversation (Ctrl+Shift+T)";

    // Bind events
    bindTabEvents();
  }

  function bindTabEvents() {
    var tabItems = tabBar.querySelectorAll(".tab-item");
    for (var i = 0; i < tabItems.length; i++) {
      (function(item) {
        // Click to switch
        item.addEventListener("click", function(e) {
          if (e.target.classList.contains("tab-close")) return;
          var id = this.getAttribute("data-tab-id");
          switchToTab(id);
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
          closeTab(id);
        });
      })(closeBtns[c]);
    }
  }

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
      if (val) renameTab(tabId, val);
      input.remove();
      labelEl.style.display = "";
      var tab = getTab(tabId);
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
    createNewTab();
  });

  // Keyboard shortcuts for tabs
  document.addEventListener("keydown", function(e) {
    // Ctrl+Shift+T = new tab
    if (e.ctrlKey && e.shiftKey && e.key === "T") {
      e.preventDefault();
      createNewTab();
    }
    // Ctrl+W = close tab
    if (e.ctrlKey && !e.shiftKey && e.key === "w") {
      e.preventDefault();
      closeTab(activeTabId);
    }
    // Ctrl+Tab = next tab
    if (e.ctrlKey && e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      var idx = -1;
      for (var i = 0; i < tabs.length; i++) { if (tabs[i].id === activeTabId) { idx = i; break; } }
      var nextIdx = (idx + 1) % tabs.length;
      switchToTab(tabs[nextIdx].id);
    }
    // Ctrl+Shift+Tab = prev tab
    if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
      e.preventDefault();
      var idx2 = -1;
      for (var j = 0; j < tabs.length; j++) { if (tabs[j].id === activeTabId) { idx2 = j; break; } }
      var prevIdx = (idx2 - 1 + tabs.length) % tabs.length;
      switchToTab(tabs[prevIdx].id);
    }
  });

  // Initial render
  renderTabBar();

  // === Initialization ===
  vscode.postMessage({ type: "ready" });

  // === Contenteditable Input Helpers ===
  function getInputText() {
    var clone = inputEl.cloneNode(true);
    var badges = clone.querySelectorAll(".slash-badge");
    for (var i = 0; i < badges.length; i++) {
      var textNode = document.createTextNode(badges[i].getAttribute("data-value") + " ");
      badges[i].parentNode.replaceChild(textNode, badges[i]);
    }
    return (clone.innerText || clone.textContent || "").replace(/\n$/, "");
  }

  function setInputText(text) {
    inputEl.textContent = text;
  }

  function clearInput() {
    inputEl.innerHTML = "";
  }

  function isInputEmpty() {
    return !inputEl.textContent.trim() && !inputEl.querySelector(".slash-badge");
  }

  function insertSlashBadge(label, value, icon) {
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
        badge.innerHTML = '<span class="badge-icon">' + icon + '</span> /' + escapeHtml(label);
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
  }

  function getCursorContext() {
    var sel = window.getSelection();
    if (!sel.rangeCount) return { text: "", cursorPos: 0 };
    var range = sel.getRangeAt(0);
    var node = range.startContainer;
    if (node.nodeType === 3) {
      return { text: node.textContent, cursorPos: range.startOffset, textNode: node };
    }
    return { text: "", cursorPos: 0 };
  }

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
      setInputText(cmd);
      inputEl.focus();
      if (cmd === "status" || cmd === "resume") {
        sendMessage();
      }
    });
  }

  // === Send ===
  sendBtn.addEventListener("click", sendMessage);

  inputEl.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
    if (e.key === "#" && isInputEmpty()) {
      e.preventDefault();
      toggleContextMenu();
    }
    // Up/Down arrow history navigation
    if (e.key === "ArrowUp" && isInputEmpty() && messageHistory.length > 0) {
      e.preventDefault();
      if (historyIndex === -1) {
        pendingInput = getInputText();
        historyIndex = messageHistory.length - 1;
      } else if (historyIndex > 0) {
        historyIndex--;
      }
      setInputText(messageHistory[historyIndex]);
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 300) + "px";
    }
    if (e.key === "ArrowDown" && historyIndex !== -1) {
      e.preventDefault();
      if (historyIndex < messageHistory.length - 1) {
        historyIndex++;
        setInputText(messageHistory[historyIndex]);
      } else {
        historyIndex = -1;
        setInputText(pendingInput);
      }
      inputEl.style.height = "auto";
      inputEl.style.height = Math.min(inputEl.scrollHeight, 300) + "px";
    }
  });

  inputEl.addEventListener("input", function () {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 300) + "px";
  });

  // === Paste Image Handler ===
  var inputAttachmentsEl = document.getElementById("input-attachments");
  var pastedAttachments = []; // { type, name, dataUrl }

  inputEl.addEventListener("paste", function (e) {
    var items = (e.clipboardData || window.clipboardData).items;
    if (!items) return;

    for (var i = 0; i < items.length; i++) {
      if (items[i].type.indexOf("image") !== -1) {
        e.preventDefault();
        var file = items[i].getAsFile();
        if (!file) continue;

        var reader = new FileReader();
        reader.onload = function (ev) {
          var dataUrl = ev.target.result;
          var name = "pasted-image-" + (pastedAttachments.length + 1) + ".png";
          pastedAttachments.push({ type: "image", name: name, dataUrl: dataUrl });
          renderAttachments();
        };
        reader.readAsDataURL(file);
      }
    }
  });

  // === Drag & Drop Image/File ===
  var inputWrapper = document.querySelector(".input-wrapper");

  inputWrapper.addEventListener("dragover", function (e) {
    e.preventDefault();
    inputWrapper.style.borderColor = "var(--vscode-focusBorder, #6366f1)";
  });

  inputWrapper.addEventListener("dragleave", function () {
    inputWrapper.style.borderColor = "";
  });

  inputWrapper.addEventListener("drop", function (e) {
    e.preventDefault();
    inputWrapper.style.borderColor = "";
    var files = e.dataTransfer.files;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file.type.indexOf("image") !== -1) {
        var reader = new FileReader();
        reader.onload = (function (f) {
          return function (ev) {
            pastedAttachments.push({ type: "image", name: f.name, dataUrl: ev.target.result });
            renderAttachments();
          };
        })(file);
        reader.readAsDataURL(file);
      } else {
        pastedAttachments.push({ type: "file", name: file.name, dataUrl: null });
        renderAttachments();
      }
    }
  });

  function renderAttachments() {
    inputAttachmentsEl.innerHTML = "";
    for (var i = 0; i < pastedAttachments.length; i++) {
      var att = pastedAttachments[i];
      if (att.type === "image" && att.dataUrl) {
        var wrapper = document.createElement("div");
        wrapper.className = "input-attachment";
        var img = document.createElement("img");
        img.src = att.dataUrl;
        img.alt = att.name;
        wrapper.appendChild(img);
        var removeBtn = document.createElement("button");
        removeBtn.className = "attach-remove";
        removeBtn.textContent = "\u00D7";
        removeBtn.setAttribute("data-idx", i.toString());
        removeBtn.addEventListener("click", function () {
          var idx = parseInt(this.getAttribute("data-idx"));
          pastedAttachments.splice(idx, 1);
          renderAttachments();
        });
        wrapper.appendChild(removeBtn);
        inputAttachmentsEl.appendChild(wrapper);
      } else {
        var ref = document.createElement("div");
        ref.className = "input-file-ref";
        ref.innerHTML = '<span class="file-ref-icon">\u1F4C4</span>' +
          '<span class="file-ref-name">' + escapeHtml(att.name) + '</span>' +
          '<span class="file-ref-remove" data-idx="' + i + '">\u00D7</span>';
        ref.querySelector(".file-ref-remove").addEventListener("click", function () {
          var idx = parseInt(this.getAttribute("data-idx"));
          pastedAttachments.splice(idx, 1);
          renderAttachments();
        });
        inputAttachmentsEl.appendChild(ref);
      }
    }
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 300) + "px";
  }

  function addFileReference(item) {
    if (item.type === "file" || item.type === "folder") {
      pastedAttachments.push({ type: "file", name: item.label, dataUrl: null });
      renderAttachments();
    }
  }

  // === Cancel / Stop ===
  cancelBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "chat:cancelStream" });
    setWorking(false);
  });

  stopBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "chat:cancelStream" });
    setWorking(false);
  });

  followBtn.addEventListener("click", function () {
    scrollToBottom();
  });

  // === Context Menu (#) ===
  ctxBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    toggleContextMenu();
  });

  function toggleContextMenu() {
    contextMenu.classList.toggle("hidden");
    modelDropdown.classList.add("hidden");
  }

  var ctxMenuBtns = contextMenu.querySelectorAll("button");
  for (var c = 0; c < ctxMenuBtns.length; c++) {
    ctxMenuBtns[c].addEventListener("click", function () {
      var ctxType = this.getAttribute("data-ctx");
      vscode.postMessage({ type: "chat:pickContext", contextType: ctxType });
      contextMenu.classList.add("hidden");
    });
  }

  // === Attachment Button ===
  attachBtn.addEventListener("click", function () {
    vscode.postMessage({ type: "chat:pickAttachment" });
  });

  // === Model Selector ===
  modelBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    modelDropdown.classList.toggle("hidden");
    contextMenu.classList.add("hidden");
  });

  // Available models are populated dynamically from the extension
  // (chat:models message) based on the configured SDLC provider.
  var availableModels = [];
  var supportsAuto = true;

  // Delegate clicks on dynamically-rendered model buttons.
  modelDropdown.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("button[data-model]") : null;
    if (!btn) return;
    var model = btn.getAttribute("data-model");
    setModel(model);
    modelDropdown.classList.add("hidden");
    vscode.postMessage({ type: "chat:setModel", model: model });
  });

  function renderModelDropdown() {
    modelDropdown.innerHTML = "";
    if (supportsAuto) {
      modelDropdown.appendChild(makeModelButton({ id: "auto", name: "Auto" }));
    }
    for (var i = 0; i < availableModels.length; i++) {
      modelDropdown.appendChild(makeModelButton(availableModels[i]));
    }
    // Reflect current selection
    var allBtns = modelDropdown.querySelectorAll("button");
    for (var j = 0; j < allBtns.length; j++) {
      allBtns[j].classList.toggle("active", allBtns[j].getAttribute("data-model") === currentModel);
    }
  }

  function makeModelButton(model) {
    var btn = document.createElement("button");
    btn.setAttribute("data-model", model.id);
    // KSA-237: render name + rate badge like Kiro IDE
    var nameSpan = document.createElement("span");
    nameSpan.className = "model-item-name";
    nameSpan.textContent = model.name;
    btn.appendChild(nameSpan);

    if (typeof model.rateMultiplier === "number") {
      var badge = document.createElement("span");
      badge.className = "model-rate-badge";
      if (model.rateMultiplier === 0) {
        badge.textContent = "Free";
        badge.classList.add("rate-free");
      } else {
        badge.textContent = model.rateMultiplier + (model.rateMultiplier === 1 ? " Credit" : " Credits");
      }
      btn.appendChild(badge);
    }

    if (model.description) {
      var desc = document.createElement("span");
      desc.className = "model-item-desc";
      desc.textContent = model.description;
      btn.appendChild(desc);
    }

    return btn;
  }

  function labelForModel(model) {
    if (model === "auto") return "Auto";
    for (var i = 0; i < availableModels.length; i++) {
      if (availableModels[i].id === model) {
        var lbl = availableModels[i].name;
        // KSA-237: show compact rate in the button label
        if (typeof availableModels[i].rateMultiplier === "number" && availableModels[i].rateMultiplier !== 1) {
          if (availableModels[i].rateMultiplier === 0) {
            lbl += " (Free)";
          } else {
            lbl += " (" + availableModels[i].rateMultiplier + "x)";
          }
        }
        return lbl;
      }
    }
    return model;
  }

  function setModel(model) {
    currentModel = model;
    modelLabel.textContent = labelForModel(model);
    var allBtns = modelDropdown.querySelectorAll("button");
    for (var i = 0; i < allBtns.length; i++) {
      allBtns[i].classList.toggle("active", allBtns[i].getAttribute("data-model") === model);
    }
  }

  // === Autopilot Toggle ===
  autopilotToggle.addEventListener("click", function () {
    var isOn = autopilotToggle.classList.contains("on");
    autopilotToggle.classList.toggle("on", !isOn);
    currentMode = isOn ? "supervised" : "autopilot";
    vscode.postMessage({ type: "chat:setMode", mode: currentMode });
  });

  // === Close dropdowns on outside click ===
  document.addEventListener("click", function () {
    modelDropdown.classList.add("hidden");
    contextMenu.classList.add("hidden");
  });

  // === Message Handler from Extension ===
  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case "chat:streamChunk":
        handleStreamChunk(msg);
        break;
      case "chat:streamComplete":
        handleStreamComplete(msg);
        break;
      case "chat:graphUpdate":
        break;
      case "chat:approvalRequest":
        renderApprovalCard(msg.checkpoint);
        break;
      case "chat:chatHistory":
        renderChatHistory(msg.messages);
        break;
      case "chat:pipelineStatus":
        handlePipelineStatus(msg);
        break;
      case "chat:resumePrompt":
        renderResumePrompt(msg);
        break;
      case "chat:error":
        renderError(msg);
        setWorking(false);
        break;
      case "chat:toolCall":
        vscode.postMessage({ type: "chat:debugLog", text: "toolCall obj: " + JSON.stringify(msg.toolCall || msg).slice(0, 200) });
        try {
          renderToolCall(msg.toolCall);
        } catch (e) {
          vscode.postMessage({ type: "chat:debugLog", text: "renderToolCall ERROR: " + e.message });
        }
        break;
      case "chat:toolCallUpdate":
        updateToolCall(msg);
        break;
      case "chat:contextPicked":
        addContextChip(msg.item);
        addFileReference(msg.item);
        break;
      case "chat:configUpdate":
        setModel(msg.model);
        if (msg.mode) {
          currentMode = msg.mode;
          autopilotToggle.classList.toggle("on", msg.mode === "autopilot");
        }
        break;
      case "chat:models":
        availableModels = Array.isArray(msg.models) ? msg.models : [];
        supportsAuto = msg.supportsAuto !== false;
        renderModelDropdown();
        if (msg.selected) {
          setModel(msg.selected);
        } else if (supportsAuto) {
          setModel("auto");
        } else if (availableModels.length > 0) {
          setModel(availableModels[0].id);
        }
        break;
      case "chat:workingStatus":
        if (msg.working) {
          setWorking(true, msg.label);
        } else {
          setGraphDone();
        }
        break;
      case "chat:nodeDetails":
        break;
      case "serverStatus":
        updateServerStatus(msg.status);
        break;
      case "tab:updated":
        handleTabsUpdated(msg.payload);
        break;
      case "tab:contextUpdate":
        handleContextUpdate(msg.payload);
        break;
      case "chat:steeringLoaded":
        renderSteeringRules(msg.rules);
        break;
      case "chat:hookTriggered":
        renderHookBadge(msg.hook);
        break;
    }
  });

  // === Send Message ===
  function sendMessage() {
    var text = getInputText().trim();
    if (!text && pastedAttachments.length === 0) return;

    // Reset graph completion flag for new interaction
    graphDone = false;

    showMessages();
    if (text) appendMessage("user", text);
    if (pastedAttachments.length > 0) {
      for (var a = 0; a < pastedAttachments.length; a++) {
        if (pastedAttachments[a].type === "image") {
          appendMessage("user", "[Image: " + pastedAttachments[a].name + "]");
        }
      }
    }
    setWorking(true);

    // KSA-240: Auto-rename tab to first message excerpt
    var currentTab = getTab(activeTabId);
    if (currentTab && text && (!currentTab.messages || currentTab.messages.length === 0)) {
      var excerpt = text.substring(0, 25).trim();
      if (text.length > 25) excerpt += "\u2026";
      currentTab.name = excerpt;
      renderTabBar();
      vscode.postMessage({ type: "tab:rename", payload: { tabId: activeTabId, newName: excerpt } });
    }
    // Track message in local tab state
    if (currentTab) {
      if (!currentTab.messages) currentTab.messages = [];
      currentTab.messages.push({ role: "user", content: text });
    }
    saveStateToDisk();

    var attachments = pastedAttachments.map(function (att) {
      return { name: att.name, type: att.type === "image" ? "image/png" : "application/octet-stream", size: 0, uri: att.dataUrl || "" };
    });

    vscode.postMessage({
      type: "chat:userMessage",
      text: text || "(attached files)",
      context: contextItems.length > 0 ? contextItems : undefined,
      attachments: attachments.length > 0 ? attachments : undefined
    });

    inputEl.innerHTML = "";
    inputEl.style.height = "auto";
    clearContextChips();
    pastedAttachments = [];
    renderAttachments();
    // Save to history for Up/Down navigation
    if (text) {
      messageHistory.push(text);
      if (messageHistory.length > 50) messageHistory.shift();
    }
    historyIndex = -1;
    pendingInput = "";
  }

  // === Working Status ===
  function setWorking(active, label) {
    if (active) {
      // Don't re-activate if graph already signaled final completion
      if (graphDone) return;
      workingBar.classList.add("active");
      workingText.textContent = label || "Working...";
      stopBtn.style.display = "inline-flex";
      isStreaming = true;
    } else {
      workingBar.classList.remove("active");
      stopBtn.style.display = "none";
      isStreaming = false;
    }
  }

  // Called only by chat:workingStatus message — marks graph as truly done
  function setGraphDone() {
    graphDone = true;
    setWorking(false);
  }

  // Map a node status signal to a friendly working-bar label.
  function statusLabel(nodeId, status) {
    var node = (nodeId || "agent").toString();
    var s = (status || "").toString();
    if (s === "active" || s === "") {
      return node === "chat" ? "Thinking..." : node.toUpperCase() + " working...";
    }
    return node.toUpperCase() + ": " + s;
  }

  // === Show messages (hide welcome) ===
  function showMessages() {
    if (!hasMessages) {
      welcomeEl.classList.add("hidden");
      messagesEl.classList.remove("hidden");
      hasMessages = true;
    }
  }

  // === Message Rendering ===
  function appendMessage(role, content, nodeId) {
    showMessages();
    var el = document.createElement("div");
    el.className = "message " + role;

    if (nodeId) {
      var badge = document.createElement("span");
      badge.className = "node-badge " + nodeId;
      badge.textContent = nodeId.toUpperCase();
      el.appendChild(badge);
    }

    var contentEl = document.createElement("span");
    if (role === "user") {
      contentEl.textContent = content;
    } else {
      contentEl.innerHTML = MarkdownRenderer.render(content);
      addCodeActions(contentEl);
    }
    el.appendChild(contentEl);

    messagesEl.appendChild(el);
    scrollToBottom();
  }

  function renderChatHistory(messages) {
    messagesEl.innerHTML = "";
    activeToolContainer = null; // Reset container on full re-render
    if (messages && messages.length > 0) {
      showMessages();
      for (var i = 0; i < messages.length; i++) {
        var m = messages[i];
        if (m.role === "tool" && m.toolData) {
          // Re-render persisted tool call block (into container)
          renderToolCall(m.toolData, true);
        } else {
          // Seal tool container before rendering non-tool messages
          finalizeToolContainer();
          appendMessage(m.role, m.content, m.nodeId);
        }
      }
      finalizeToolContainer();
    }
  }

  // === Streaming ===
  function handleStreamChunk(msg) {
    showMessages();
    setWorking(true, "Working...");

    // KSA-247: Seal the tool container before streaming text starts
    // This ensures tool blocks are never touched by streaming logic
    finalizeToolContainer();

    if (!streamingNodes[msg.nodeId]) {
      var el = document.createElement("div");
      el.className = "message assistant streaming";

      var badge = document.createElement("span");
      badge.className = "node-badge " + msg.nodeId;
      // Map nodeId to friendly agent name
      var agentNames = {
        chat: "Pipeline Agent",
        sm: "SM",
        ba: "BA",
        sa: "SA",
        ta: "TA",
        qa: "QA",
        dev: "DEV",
        devops: "DevOps"
      };
      badge.textContent = agentNames[msg.nodeId] || msg.nodeId.toUpperCase();
      el.appendChild(badge);

      var contentEl = document.createElement("span");
      contentEl.className = "stream-content";
      el.appendChild(contentEl);

      messagesEl.appendChild(el);
      streamingNodes[msg.nodeId] = { el: el, content: "" };
    }

    var node = streamingNodes[msg.nodeId];

    if (msg.eventType === "token") {
      // Skip pure whitespace/newline-only tokens entirely
      var tokenContent = msg.content;
      if (!tokenContent || !tokenContent.replace(/[\s\n\r]/g, "")) return;
      // Trim leading whitespace from first meaningful token
      if (!node.content) {
        tokenContent = tokenContent.replace(/^[\s\n\r]+/, "");
        if (!tokenContent) return;
      }
      node.content += tokenContent;
      var contentSpan = node.el.querySelector(".stream-content");
      contentSpan.innerHTML = MarkdownRenderer.render(node.content);
      addCodeActions(contentSpan);
    } else if (msg.eventType === "status") {
      // Status is a node lifecycle signal (e.g. "active"), NOT answer content.
      // Show it on the working bar only — never concatenate into the reply
      // bubble, otherwise the bubble shows literal "active" (KSA-237).
      setWorking(true, statusLabel(msg.nodeId, msg.content));
    } else if (msg.eventType === "error") {
      node.el.classList.add("error");
      node.el.classList.remove("streaming");
      var errSpan = node.el.querySelector(".stream-content");
      errSpan.innerHTML = MarkdownRenderer.render("**Error:** " + msg.content);
      delete streamingNodes[msg.nodeId];
    }

    scrollToBottom();
  }

  function handleStreamComplete(msg) {
    var node = streamingNodes[msg.nodeId];
    if (node) {
      node.el.classList.remove("streaming");
      if (!node.content && msg.finalContent && !msg.finalContent.startsWith("Node ")) {
        var contentSpan = node.el.querySelector(".stream-content");
        contentSpan.innerHTML = MarkdownRenderer.render(msg.finalContent);
        addCodeActions(contentSpan);
      }
      // Save assistant message to tab state
      var content = node.content || msg.finalContent || "";
      if (content) {
        var currentTab = getTab(activeTabId);
        if (currentTab) {
          if (!currentTab.messages) currentTab.messages = [];
          currentTab.messages.push({ role: "assistant", content: content, nodeId: msg.nodeId });
        }
        saveStateToDisk();
      }
      delete streamingNodes[msg.nodeId];
    }

    if (Object.keys(streamingNodes).length === 0) {
      // Don't hide working bar here — only chat:workingStatus message controls it.
      // This prevents premature hide when verify loops back.
      isStreaming = false;
    }
  }

  // === Tool Calls (Collapsible) — Isolated Container ===
  // KSA-247: Tool call blocks render in their own scoped container
  // completely isolated from streaming DOM manipulation
  var activeToolContainer = null;

  function getOrCreateToolContainer() {
    if (!activeToolContainer || !activeToolContainer.parentNode) {
      activeToolContainer = document.createElement("div");
      activeToolContainer.className = "ksa247-tool-container";
      activeToolContainer.setAttribute("data-turn", "turn-" + Date.now());
      messagesEl.appendChild(activeToolContainer);
    }
    return activeToolContainer;
  }

  function finalizeToolContainer() {
    if (activeToolContainer) {
      activeToolContainer.setAttribute("data-sealed", "true");
      activeToolContainer = null;
    }
  }
  // Categorize a tool by name -> { icon, label, cssClass }
  // KSA-247: Enhanced with explicit prefixMap to fix OI-4 priority bug
  function categorizeTool(name) {
    var n = (name || "").toLowerCase();

    // KSA-279: System/meta events (steering, hooks) - distinct category
    if (n.indexOf("steering") !== -1 || n.indexOf("_rules_") !== -1)
      return { icon: "S", label: "RULES", cls: "cat-rules" };
    if (n.indexOf("hook") !== -1)
      return { icon: "H", label: "HOOK", cls: "cat-hook" };

    // Priority 1: Explicit prefix matches (most specific first)
    var prefixMap = [
      { prefix: "execute_pwsh",    icon: "&gt;_", label: "CMD",    cls: "cat-command" },
      { prefix: "control_pwsh",    icon: "&gt;_", label: "CMD",    cls: "cat-command" },
      { prefix: "get_process",     icon: "&gt;_", label: "CMD",    cls: "cat-command" },
      { prefix: "list_process",    icon: "&gt;_", label: "CMD",    cls: "cat-command" },
      { prefix: "grep_search",     icon: "?",  label: "SEARCH", cls: "cat-search" },
      { prefix: "file_search",     icon: "?",  label: "SEARCH", cls: "cat-search" },
      { prefix: "mem_search",      icon: "m",  label: "MEM",    cls: "cat-memory" },
      { prefix: "mem_ingest",      icon: "m",  label: "MEM",    cls: "cat-memory" },
      { prefix: "read_file",       icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "read_files",      icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "read_code",       icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "list_directory",  icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "fs_write",        icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "str_replace",     icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "stream_write",    icon: "[]", label: "FILE",   cls: "cat-file" },
      { prefix: "export_docx",     icon: "D",  label: "DOC",    cls: "cat-doc" },
      { prefix: "embed_images",    icon: "D",  label: "DOC",    cls: "cat-doc" },
      { prefix: "drawio",          icon: "D",  label: "DOC",    cls: "cat-doc" },
      { prefix: "jira_",           icon: "J",  label: "JIRA",   cls: "cat-jira" }
    ];

    for (var i = 0; i < prefixMap.length; i++) {
      if (n.indexOf(prefixMap[i].prefix) === 0) {
        return { icon: prefixMap[i].icon, label: prefixMap[i].label, cls: prefixMap[i].cls };
      }
    }

    // Priority 2: Contains-based matching (broader patterns)
    if (n.indexOf("pwsh") !== -1 || n.indexOf("shell") !== -1 || n.indexOf("command") !== -1)
      return { icon: "&gt;_", label: "CMD", cls: "cat-command" };
    if (n.indexOf("search") !== -1 || n.indexOf("grep") !== -1 || n.indexOf("find") !== -1)
      return { icon: "?", label: "SEARCH", cls: "cat-search" };
    if (n.indexOf("mem_") !== -1 || n.indexOf("kb_") !== -1)
      return { icon: "m", label: "MEM", cls: "cat-memory" };
    if (n.indexOf("jira") !== -1 || n.indexOf("issue") !== -1)
      return { icon: "J", label: "JIRA", cls: "cat-jira" };
    if (n.indexOf("read") !== -1 || n.indexOf("write") !== -1 || n.indexOf("file") !== -1 ||
        n.indexOf("list") !== -1 || n.indexOf("directory") !== -1)
      return { icon: "[]", label: "FILE", cls: "cat-file" };
    if (n.indexOf("drawio") !== -1 || n.indexOf("export") !== -1 || n.indexOf("docx") !== -1)
      return { icon: "D", label: "DOC", cls: "cat-doc" };

    // Priority 3: Fallback
    return { icon: "T", label: "TOOL", cls: "cat-tool" };
  }

  function renderToolCall(tc, isReplay) {
    // EF-1: Validation - skip if required fields missing
    if (!tc || !tc.id || !tc.name) {
      console.warn("[chat.js] renderToolCall: missing id or name, skipping", tc);
      return;
    }

    showMessages();
    var block = document.createElement("div");
    block.className = "tool-call-block";
    block.id = "tc-" + tc.id;

    // Accessibility: BR-17, OI-2
    block.setAttribute("tabindex", "0");
    block.setAttribute("role", "button");
    block.setAttribute("aria-expanded", "false");
    block.setAttribute("aria-label", "Tool call: " + tc.name + " - " + (tc.status || "running"));

    var cat = categorizeTool(tc.name);

    // OI-3: stale running -> interrupted on restore
    var displayStatus = tc.status;
    if (isReplay && tc.status === "running") {
      displayStatus = "interrupted";
    }

    var header = document.createElement("div");
    header.className = "tool-call-header";
    header.innerHTML = '<span class="tool-chevron">&#x25B6;</span>' +
      '<span class="tool-icon">' + cat.icon + '</span>' +
      '<span class="tool-cat ' + cat.cls + '">' + cat.label + '</span>' +
      '<span class="tool-name">' + escapeHtml(tc.name) + '</span>' +
      '<span class="tool-status ' + displayStatus + '">' + statusIcon(displayStatus) + '</span>';

    // Duration display (for completed/replayed blocks)
    if (tc.duration) {
      var dur = document.createElement("span");
      dur.className = "tool-duration";
      dur.textContent = formatDuration(tc.duration);
      header.appendChild(dur);
    }

    // Click handler: toggle expand/collapse
    header.addEventListener("click", function () {
      var isExpanded = block.classList.toggle("expanded");
      block.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    });

    // Keyboard handler: Enter/Space toggle (BR-17)
    block.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        var isExpanded = block.classList.toggle("expanded");
        block.setAttribute("aria-expanded", isExpanded ? "true" : "false");
      }
    });

    // Body content — KSA-281: Two sections (Request + Response)
    var body = document.createElement("div");
    body.className = "tool-call-body";

    // --- REQUEST section (always show args) ---
    var reqSection = document.createElement("div");
    reqSection.className = "tool-section tool-section-request";
    var reqLabel = document.createElement("div");
    reqLabel.className = "tool-section-label";
    reqLabel.textContent = "Request";
    var reqContent = document.createElement("pre");
    reqContent.className = "tool-section-content";
    reqContent.textContent = tc.args && Object.keys(tc.args).length > 0
      ? JSON.stringify(tc.args, null, 2)
      : "(no parameters)";
    reqSection.appendChild(reqLabel);
    reqSection.appendChild(reqContent);

    // --- RESPONSE section ---
    var resSection = document.createElement("div");
    resSection.className = "tool-section tool-section-response";
    var resLabel = document.createElement("div");
    resLabel.className = "tool-section-label";
    resLabel.textContent = "Response";
    var resContent = document.createElement("pre");
    resContent.className = "tool-section-content";
    if (displayStatus === "completed" && tc.result) {
      resContent.textContent = tc.result;
    } else if (displayStatus === "failed" && tc.error) {
      resContent.textContent = tc.error;
      resSection.classList.add("failed");
    } else if (displayStatus === "interrupted") {
      resContent.textContent = "(interrupted)";
    } else {
      resContent.textContent = "(waiting...)";
    }
    resSection.appendChild(resLabel);
    resSection.appendChild(resContent);

    body.appendChild(reqSection);
    body.appendChild(resSection);

    block.appendChild(header);
    block.appendChild(body);

    // KSA-247: Append to isolated tool container (NOT messagesEl directly)
    var container = getOrCreateToolContainer();
    container.appendChild(block);
    toolCalls[tc.id] = block;
    scrollToBottom();

    // KSA-240: Persist tool call into active tab so it survives re-renders/reload
    if (!isReplay) {
      var currentTab = getTab(activeTabId);
      if (currentTab) {
        if (!currentTab.messages) currentTab.messages = [];
        currentTab.messages.push({
          role: "tool",
          content: "",
          toolData: {
            id: tc.id,
            name: tc.name,
            args: tc.args,
            status: tc.status,
            result: tc.result,
            duration: tc.duration,
            timestamp: new Date().toISOString()
          }
        });
        saveStateToDisk();
      }
    }
  }

  function updateToolCall(msg) {
    var block = toolCalls[msg.id];
    if (!block) {
      console.warn("[chat.js] updateToolCall: block not found for id", msg.id);
      return;
    }

    // Update status indicator
    var statusSpan = block.querySelector(".tool-status");
    statusSpan.className = "tool-status " + msg.status;
    statusSpan.textContent = statusIcon(msg.status);

    // Update aria-label
    var toolName = block.querySelector(".tool-name");
    block.setAttribute("aria-label", "Tool call: " +
      (toolName ? toolName.textContent : "") + " - " + msg.status);

    // Update Response section content (KSA-281: keep Request visible)
    if (msg.result || msg.error) {
      var resSection = block.querySelector(".tool-section-response");
      if (resSection) {
        var resContent = resSection.querySelector(".tool-section-content");
        if (resContent) {
          resContent.textContent = msg.error || msg.result;
        }
        if (msg.status === "failed") {
          resSection.classList.add("failed");
        } else {
          resSection.classList.remove("failed");
        }
      }
    }

    // Duration display - guard against duplicates (OI-6)
    if (msg.duration) {
      var existingDur = block.querySelector(".tool-duration");
      if (!existingDur) {
        var dur = document.createElement("span");
        dur.className = "tool-duration";
        dur.textContent = formatDuration(msg.duration);
        block.querySelector(".tool-call-header").appendChild(dur);
      } else {
        existingDur.textContent = formatDuration(msg.duration);
      }
    }

    // Update persisted state in tab
    var currentTab = getTab(activeTabId);
    if (currentTab && currentTab.messages) {
      for (var i = currentTab.messages.length - 1; i >= 0; i--) {
        var m = currentTab.messages[i];
        if (m.role === "tool" && m.toolData && m.toolData.id === msg.id) {
          m.toolData.status = msg.status;
          if (msg.result) m.toolData.result = msg.result;
          if (msg.duration) m.toolData.duration = msg.duration;
          break;
        }
      }
      saveStateToDisk();
    }
  }

  // KSA-247: Format duration from ms to human-readable
  function formatDuration(ms) {
    if (ms < 1000) return ms + "ms";
    return (ms / 1000).toFixed(1) + "s";
  }

  function statusIcon(status) {
    if (status === "running") return "\u23F3";
    if (status === "completed") return "\u2713";
    if (status === "failed") return "\u2717";
    if (status === "interrupted") return "\u23F8";
    return "";
  }

  // === Context Chips ===
  function addContextChip(item) {
    contextItems.push(item);
    renderContextChips();
  }

  function removeContextChip(index) {
    contextItems.splice(index, 1);
    renderContextChips();
  }

  function clearContextChips() {
    contextItems = [];
    inputChipsEl.innerHTML = "";
  }

  function renderContextChips() {
    inputChipsEl.innerHTML = "";
    for (var i = 0; i < contextItems.length; i++) {
      var chip = document.createElement("span");
      chip.className = "context-chip";
      chip.innerHTML = '<span class="chip-icon">#</span>' +
        escapeHtml(contextItems[i].label) +
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

  // === Pipeline Status ===
  function handlePipelineStatus(msg) {
    if (msg.status === "running") {
      setWorking(true, msg.ticketKey + " \u2014 " + msg.phase);
    } else if (msg.status === "completed" || msg.status === "cancelled" || msg.status === "failed") {
      setWorking(false);
    }
    var statusText = msg.ticketKey
      ? msg.ticketKey + " \u2014 " + msg.phase + " (" + msg.status + ")"
      : msg.status;
    appendMessage("system", statusText);
  }

  // === Approval Card ===
  function renderApprovalCard(checkpoint) {
    showMessages();
    setWorking(false);
    var card = document.createElement("div");
    card.className = "approval-card";

    var title = document.createElement("h4");
    title.textContent = checkpoint.gateId + ": " + checkpoint.summary;
    card.appendChild(title);

    if (checkpoint.criteria && checkpoint.criteria.length > 0) {
      var ul = document.createElement("ul");
      for (var i = 0; i < checkpoint.criteria.length; i++) {
        var li = document.createElement("li");
        li.textContent = checkpoint.criteria[i];
        ul.appendChild(li);
      }
      card.appendChild(ul);
    }

    var actions = document.createElement("div");
    actions.className = "actions";

    var approveBtn = document.createElement("button");
    approveBtn.className = "approve";
    approveBtn.textContent = "Approve";
    approveBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:approvalAction", decision: "approve" });
      card.remove();
      appendMessage("system", "Approved \u2014 continuing pipeline...");
      setWorking(true);
    });

    var reviseBtn = document.createElement("button");
    reviseBtn.className = "revise";
    reviseBtn.textContent = "Revise";
    reviseBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:approvalAction", decision: "revise" });
      card.remove();
      appendMessage("system", "Revision requested \u2014 re-running phase...");
      setWorking(true);
    });

    var rejectBtn = document.createElement("button");
    rejectBtn.className = "reject";
    rejectBtn.textContent = "Reject";
    rejectBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:approvalAction", decision: "reject" });
      card.remove();
      appendMessage("system", "Rejected \u2014 pipeline stopped.");
    });

    actions.appendChild(approveBtn);
    actions.appendChild(reviseBtn);
    actions.appendChild(rejectBtn);
    card.appendChild(actions);
    messagesEl.appendChild(card);
    scrollToBottom();
  }

  // === Resume Prompt ===
  function renderResumePrompt(msg) {
    showMessages();
    var prompt = document.createElement("div");
    prompt.className = "resume-prompt";

    var p = document.createElement("p");
    p.textContent = "Pipeline paused: " + msg.ticketKey + " \u2014 " + msg.phase;
    prompt.appendChild(p);

    var resumeBtn = document.createElement("button");
    resumeBtn.textContent = "Resume";
    resumeBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:resumePipeline", threadId: msg.threadId });
      prompt.remove();
      setWorking(true, "Resuming...");
    });

    var freshBtn = document.createElement("button");
    freshBtn.textContent = "Start Fresh";
    freshBtn.addEventListener("click", function () {
      vscode.postMessage({ type: "chat:startFresh" });
      prompt.remove();
    });

    prompt.appendChild(resumeBtn);
    prompt.appendChild(freshBtn);
    messagesEl.appendChild(prompt);
    scrollToBottom();
  }

  // === Error ===
  function renderError(msg) {
    showMessages();
    appendMessage("error", msg.message);
  }

  // === Server Status ===
  function updateServerStatus(status) {
    statusEl.textContent = status;
    statusEl.className = "status " + status;
  }

  // === Code Actions (Copy, Apply, Insert) ===
  function addCodeActions(container) {
    var preBlocks = container.querySelectorAll("pre");
    for (var i = 0; i < preBlocks.length; i++) {
      if (preBlocks[i].querySelector(".code-actions")) continue;
      var pre = preBlocks[i];
      var actionsDiv = document.createElement("div");
      actionsDiv.className = "code-actions";

      actionsDiv.appendChild(createCodeBtn("Copy", pre, function (p) {
        var code = p.querySelector("code");
        var text = code ? code.textContent : p.textContent;
        navigator.clipboard.writeText(text || "");
      }));

      actionsDiv.appendChild(createCodeBtn("Apply", pre, function (p) {
        var code = p.querySelector("code");
        var text = code ? code.textContent : p.textContent;
        var filePath = extractFilePathFromContext(p);
        vscode.postMessage({ type: "chat:applyCode", code: text || "", filePath: filePath || "" });
      }));

      actionsDiv.appendChild(createCodeBtn("Insert", pre, function (p) {
        var code = p.querySelector("code");
        var text = code ? code.textContent : p.textContent;
        vscode.postMessage({ type: "chat:insertCode", code: text || "" });
      }));

      pre.appendChild(actionsDiv);

      // Language label
      var codeEl = pre.querySelector("code");
      if (codeEl && codeEl.className) {
        var langMatch = codeEl.className.match(/language-(\w+)/);
        if (langMatch) {
          var langLabel = document.createElement("span");
          langLabel.className = "code-lang-label";
          langLabel.textContent = langMatch[1];
          pre.appendChild(langLabel);
        }
      }
    }
  }

  function createCodeBtn(label, pre, handler) {
    var btn = document.createElement("button");
    btn.textContent = label;
    btn.addEventListener("click", (function (p) {
      return function () { handler(p); };
    })(pre));
    return btn;
  }

  // Extract file path from surrounding context of a code block
  function extractFilePathFromContext(preEl) {
    // Strategy 1: Check data-file attribute (set by markdown renderer)
    if (preEl.dataset && preEl.dataset.file) return preEl.dataset.file;

    // Strategy 2: Look at preceding sibling text for file path patterns
    var prev = preEl.previousElementSibling;
    if (prev) {
      var text = prev.textContent || "";
      // Match patterns like "src/index.ts:", "File: src/main.ts", "`path/to/file.ext`"
      var pathMatch = text.match(/(?:^|\s|`)([a-zA-Z0-9_./-]+\.[a-zA-Z]{1,10})(?:`|:|$|\s)/);
      if (pathMatch) return pathMatch[1];
    }

    // Strategy 3: Look at the lang label — sometimes it's "typescript:src/file.ts"
    var langLabel = preEl.querySelector(".code-lang-label");
    if (langLabel) {
      var labelText = langLabel.textContent || "";
      if (labelText.includes("/") || labelText.includes("\\")) return labelText;
    }

    // Strategy 4: Scan parent message for file path mentioned before this code block
    var message = preEl.closest(".message");
    if (message) {
      var allText = message.textContent || "";
      // Find paths like src/xxx.ts, backend/xxx.kt etc
      var paths = allText.match(/(?:src|backend|lib|app)\/[\w./-]+\.\w{1,10}/g);
      if (paths && paths.length > 0) return paths[0];
    }

    return "";
  }

  // === Utilities ===
  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function escapeHtml(str) {
    return (str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // === Tab/Context Update Handlers (KSA-240) ===
  function handleTabsUpdated(payload) {
    if (!payload) return;
    if (payload.tabs) {
      tabs = payload.tabs.map(function(t) {
        return { id: t.id, name: t.name, messages: t.messages || [], tokenCount: t.tokenCount || 0, maxTokens: t.maxTokens || 128000 };
      });
    }
    // Restore input history if provided
    if (payload.messageHistory && Array.isArray(payload.messageHistory)) {
      messageHistory = payload.messageHistory;
    }
    // Update tabCounter to avoid duplicate names
    tabCounter = tabs.length;

    // Render tab bar first, then switch to active tab to render its messages correctly
    if (payload.activeTabId && getTab(payload.activeTabId)) {
      // Force activeTabId to differ so switchToTab actually executes
      activeTabId = "";
      renderTabBar();
      switchToTab(payload.activeTabId);
    } else if (tabs.length > 0) {
      activeTabId = "";
      renderTabBar();
      switchToTab(tabs[0].id);
    } else {
      renderTabBar();
    }
  }

  function handleContextUpdate(payload) {
    if (!payload) return;
    // Update local tab data
    var tab = getTab(payload.tabId);
    if (tab) {
      tab.tokenCount = payload.tokenCount;
      tab.maxTokens = payload.maxTokens;
    }
    // Only update icon if this is the active tab
    if (payload.tabId === activeTabId) {
      updateContextIcon(payload.tokenCount, payload.maxTokens);
    }
  }

  // === State Persistence (KSA-240) ===
  var saveTimer = null;

  function saveStateToDisk() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function() {
      vscode.postMessage({
        type: "chat:saveState",
        payload: { tabs: tabs, activeTabId: activeTabId, messageHistory: messageHistory }
      });
    }, 500);
  }

  // === Steering Rules & Hooks Rendering (KSA-240) ===
  var steeringSection = document.getElementById("steering-section");
  var steeringHeader = document.getElementById("steering-header");
  var steeringList = document.getElementById("steering-list");
  var steeringCount = document.getElementById("steering-count");

  steeringHeader.addEventListener("click", function() {
    steeringSection.classList.toggle("expanded");
  });

  function renderSteeringRules(rules) {
    if (!rules || rules.length === 0) return;
    steeringSection.classList.add("visible");
    steeringCount.textContent = "(" + rules.length + ")";
    steeringList.innerHTML = "";
    for (var i = 0; i < rules.length; i++) {
      var badge = document.createElement("span");
      badge.className = "steering-badge";
      badge.innerHTML = '<span class="badge-icon">\u{1F4CB}</span>' + escapeHtml(rules[i].name);
      badge.title = rules[i].file;
      steeringList.appendChild(badge);
    }
  }

  function renderHookBadge(hook) {
    if (!hook) return;
    showMessages();
    var el = document.createElement("div");
    el.className = "hook-badge";
    var statusIcon = hook.status === "completed" ? "\u2713" : hook.status === "skipped" ? "\u23ED" : "\u23F3";
    el.innerHTML = '<span class="hook-icon">\u{1F517}</span>' +
      '<span class="hook-name">' + escapeHtml(hook.name) + '</span>' +
      '<span class="hook-status ' + hook.status + '">' + statusIcon + '</span>';
    messagesEl.appendChild(el);
    scrollToBottom();
  }

  // === Slash Command Popup ===
  var slashPopup = document.getElementById("slash-popup");
  var slashSteeringList = document.getElementById("slash-steering-list");
  var slashActiveIndex = -1;
  var slashVisible = false;
  var slashFilterText = "";

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
        '<span class="slash-label">' + escapeHtml(slashSteeringRules[i].name) + '</span>' +
        '<span class="slash-desc">' + escapeHtml(slashSteeringRules[i].file || "") + '</span>';
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
      defaults.push({ name: defaultSteeringNames[i], file: ".kiro/steering/" + defaultSteeringNames[i] + ".md" });
    }
    populateSlashSteering(defaults);
  })();

  // Override renderSteeringRules to also populate slash popup
  var _origRenderSteering = renderSteeringRules;
  renderSteeringRules = function(rules) {
    _origRenderSteering(rules);
    populateSlashSteering(rules);
  };

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
    insertSlashBadge(label, slashValue, icon);

    hideSlashPopup();
    inputEl.focus();
  }

  // Detect / trigger in input — listen on the existing input handler
  var _origInputHandler = inputEl.oninput;
  inputEl.addEventListener("input", function () {
    var ctx = getCursorContext();
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
