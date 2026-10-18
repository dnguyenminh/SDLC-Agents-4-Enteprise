/**
 * Chat Panel — Code Actions (Copy / Apply / Insert)
 * Hover action bar + language label on rendered <pre> blocks; file path
 * extraction heuristics for Apply.
 */
(function () {
  "use strict";
  var S = window.ChatState;

  var vscode = S.vscode;

  // === Code Actions (Copy, Apply, Insert) ===
  S.addCodeActions = function (container) {
    var preBlocks = container.querySelectorAll("pre");
    for (var i = 0; i < preBlocks.length; i++) {
      if (preBlocks[i].querySelector(".code-actions")) continue;
      var pre = preBlocks[i];
      // Terminal output blocks (shell transcripts, listings) get Copy only —
      // Apply/Insert on output spam every tool-heavy answer (UAT review flood).
      var codeEl0 = pre.querySelector("code");
      var lang0 = codeEl0 && codeEl0.className
        ? (codeEl0.className.match(/language-(\w+)/) || [])[1] || ""
        : "";
      var isOutput = !lang0 || /^(shell|bash|sh|powershell|ps1|console|terminal|text|plaintext|txt|log|output)$/i.test(lang0);
      var actionsDiv = document.createElement("div");
      actionsDiv.className = "code-actions";

      actionsDiv.appendChild(createCodeBtn("Copy", pre, function (p) {
        var code = p.querySelector("code");
        var text = code ? code.textContent : p.textContent;
        navigator.clipboard.writeText(text || "");
      }));

      if (!isOutput) {
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
      }

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
  };

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
})();
