/**
 * Markdown Renderer — KSA-210 + KSA-230
 * Safe markdown-to-HTML converter with syntax highlighting.
 * No raw innerHTML of user content; sanitizes links; escapes code blocks.
 */

// eslint-disable-next-line no-unused-vars
var MarkdownRenderer = (function () {
  "use strict";

  var SAFE_SCHEMES = ["http:", "https:", "vscode:"];

  // Simple syntax highlighting rules per language
  var HIGHLIGHT_RULES = {
    javascript: [
      { pattern: /(\/\/[^\n]*)/g, cls: "hljs-comment" },
      { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: "hljs-comment" },
      { pattern: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|async|await|new|this|typeof|instanceof|throw|try|catch|finally|switch|case|break|continue|default|yield|of|in)\b/g, cls: "hljs-keyword" },
      { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g, cls: "hljs-string" },
      { pattern: /\b(\d+\.?\d*)\b/g, cls: "hljs-number" },
      { pattern: /\b(true|false|null|undefined|NaN|Infinity)\b/g, cls: "hljs-literal" },
      { pattern: /\b(console|document|window|Array|Object|String|Number|Boolean|Promise|Map|Set)\b/g, cls: "hljs-built_in" }
    ],
    typescript: "javascript",
    ts: "javascript",
    js: "javascript",
    python: [
      { pattern: /(#[^\n]*)/g, cls: "hljs-comment" },
      { pattern: /("""[\s\S]*?"""|'''[\s\S]*?''')/g, cls: "hljs-comment" },
      { pattern: /\b(def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|yield|lambda|pass|break|continue|raise|async|await|not|and|or|in|is|global|nonlocal)\b/g, cls: "hljs-keyword" },
      { pattern: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, cls: "hljs-string" },
      { pattern: /\b(\d+\.?\d*)\b/g, cls: "hljs-number" },
      { pattern: /\b(True|False|None)\b/g, cls: "hljs-literal" },
      { pattern: /\b(print|len|range|list|dict|set|tuple|int|str|float|bool|type|isinstance|hasattr|getattr|super)\b/g, cls: "hljs-built_in" }
    ],
    py: "python",
    kotlin: [
      { pattern: /(\/\/[^\n]*)/g, cls: "hljs-comment" },
      { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: "hljs-comment" },
      { pattern: /\b(fun|val|var|class|interface|object|if|else|when|for|while|return|import|package|is|as|in|throw|try|catch|finally|data|sealed|enum|companion|suspend|override|abstract|open|private|public|internal|protected|lateinit|by|constructor)\b/g, cls: "hljs-keyword" },
      { pattern: /("(?:[^"\\]|\\.)*")/g, cls: "hljs-string" },
      { pattern: /\b(\d+\.?\d*[fFLl]?)\b/g, cls: "hljs-number" },
      { pattern: /\b(true|false|null)\b/g, cls: "hljs-literal" },
      { pattern: /\b(println|listOf|mapOf|setOf|mutableListOf|require|check)\b/g, cls: "hljs-built_in" }
    ],
    kt: "kotlin",
    json: [
      { pattern: /("(?:[^"\\]|\\.)*")\s*:/g, cls: "hljs-attr" },
      { pattern: /:\s*("(?:[^"\\]|\\.)*")/g, cls: "hljs-string" },
      { pattern: /\b(\d+\.?\d*)\b/g, cls: "hljs-number" },
      { pattern: /\b(true|false|null)\b/g, cls: "hljs-literal" }
    ],
    yaml: [
      { pattern: /(#[^\n]*)/g, cls: "hljs-comment" },
      { pattern: /^(\s*[\w-]+):/gm, cls: "hljs-attr" },
      { pattern: /:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g, cls: "hljs-string" },
      { pattern: /\b(true|false|null|yes|no)\b/gi, cls: "hljs-literal" }
    ],
    yml: "yaml",
    bash: [
      { pattern: /(#[^\n]*)/g, cls: "hljs-comment" },
      { pattern: /\b(if|then|else|elif|fi|for|while|do|done|case|esac|function|return|exit|export|source|alias|unset|local|readonly)\b/g, cls: "hljs-keyword" },
      { pattern: /("(?:[^"\\]|\\.)*"|'[^']*')/g, cls: "hljs-string" },
      { pattern: /(\$\w+|\$\{[^}]+\})/g, cls: "hljs-variable" }
    ],
    sh: "bash",
    shell: "bash",
    powershell: "bash",
    css: [
      { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: "hljs-comment" },
      { pattern: /([.#][\w-]+)/g, cls: "hljs-selector-tag" },
      { pattern: /([\w-]+)\s*:/g, cls: "hljs-property" }
    ],
    html: [
      { pattern: /(&lt;!--[\s\S]*?--&gt;)/g, cls: "hljs-comment" },
      { pattern: /(&lt;\/?[\w-]+)/g, cls: "hljs-selector-tag" },
      { pattern: /([\w-]+)=(&quot;[^&]*&quot;)/g, cls: "hljs-attr" }
    ],
    xml: "html",
    sql: [
      { pattern: /(--[^\n]*)/g, cls: "hljs-comment" },
      { pattern: /\b(SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AS|AND|OR|NOT|IN|IS|NULL|LIKE|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|SET|VALUES|INTO|DISTINCT|UNION|ALL|EXISTS|BETWEEN|CASE|WHEN|THEN|ELSE|END)\b/gi, cls: "hljs-keyword" },
      { pattern: /('(?:[^'\\]|\\.)*')/g, cls: "hljs-string" },
      { pattern: /\b(\d+\.?\d*)\b/g, cls: "hljs-number" }
    ],
    java: [
      { pattern: /(\/\/[^\n]*)/g, cls: "hljs-comment" },
      { pattern: /(\/\*[\s\S]*?\*\/)/g, cls: "hljs-comment" },
      { pattern: /\b(public|private|protected|class|interface|extends|implements|return|if|else|for|while|switch|case|break|continue|new|this|super|void|int|long|double|float|boolean|char|byte|short|static|final|abstract|synchronized|volatile|transient|throws|throw|try|catch|finally|import|package|instanceof|enum)\b/g, cls: "hljs-keyword" },
      { pattern: /("(?:[^"\\]|\\.)*")/g, cls: "hljs-string" },
      { pattern: /\b(\d+\.?\d*[fFdDlL]?)\b/g, cls: "hljs-number" },
      { pattern: /\b(true|false|null)\b/g, cls: "hljs-literal" },
      { pattern: /\b(System|String|Integer|List|Map|Set|ArrayList|HashMap|Optional)\b/g, cls: "hljs-built_in" }
    ],
    go: [
      { pattern: /(\/\/[^\n]*)/g, cls: "hljs-comment" },
      { pattern: /\b(func|var|const|type|struct|interface|return|if|else|for|range|switch|case|break|continue|defer|go|select|chan|map|package|import|nil)\b/g, cls: "hljs-keyword" },
      { pattern: /("(?:[^"\\]|\\.)*"|`[^`]*`)/g, cls: "hljs-string" },
      { pattern: /\b(\d+\.?\d*)\b/g, cls: "hljs-number" },
      { pattern: /\b(true|false|nil)\b/g, cls: "hljs-literal" },
      { pattern: /\b(fmt|log|os|io|net|http|strings|strconv|errors)\b/g, cls: "hljs-built_in" }
    ],
    rust: [
      { pattern: /(\/\/[^\n]*)/g, cls: "hljs-comment" },
      { pattern: /\b(fn|let|mut|const|struct|enum|impl|trait|pub|use|mod|match|if|else|for|while|loop|return|self|Self|super|crate|where|async|await|move|unsafe|extern|type|ref|as|in)\b/g, cls: "hljs-keyword" },
      { pattern: /("(?:[^"\\]|\\.)*")/g, cls: "hljs-string" },
      { pattern: /\b(\d+\.?\d*[_uif]*\d*)\b/g, cls: "hljs-number" },
      { pattern: /\b(true|false|None|Some|Ok|Err)\b/g, cls: "hljs-literal" },
      { pattern: /\b(println|vec|String|Vec|Option|Result|Box|Arc|Mutex)\b/g, cls: "hljs-built_in" }
    ],
    rs: "rust"
  };

  function render(text) {
    if (!text) return "";

    var html = escapeHtml(text);

    // Code blocks with language
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function (_match, lang, code) {
      var highlighted = highlightCode(code.trim(), lang);
      var langClass = lang ? ' class="language-' + lang + '"' : "";
      return '<pre><code' + langClass + '>' + highlighted + '</code></pre>';
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Bold
    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    // Italic
    html = html.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "<em>$1</em>");
    html = html.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");

    // Strikethrough
    html = html.replace(/~~(.+?)~~/g, "<del>$1</del>");

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_match, label, url) {
      if (isSafeUrl(url)) {
        return '<a href="' + url + '" title="' + label + '">' + label + "</a>";
      }
      return label;
    });

    // Headers
    html = html.replace(/^#### (.+)$/gm, "<h5>$1</h5>");
    html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
    html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
    html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");

    // Checkbox lists
    html = html.replace(/^- \[x\] (.+)$/gm, '<li class="checked">\u2611 $1</li>');
    html = html.replace(/^- \[ \] (.+)$/gm, '<li class="unchecked">\u2610 $1</li>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");

    // Unordered lists
    html = html.replace(/^- (.+)$/gm, "<li>$1</li>");
    html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, function (match) {
      return "<ul>" + match + "</ul>";
    });

    // Horizontal rule
    html = html.replace(/^---$/gm, "<hr>");

    // Blockquote
    html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

    // Tables
    html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, function (_m, header, _sep, body) {
      var ths = header.split("|").filter(function (c) { return c.trim(); });
      var rows = body.trim().split("\n");
      var table = "<table><thead><tr>";
      for (var i = 0; i < ths.length; i++) table += "<th>" + ths[i].trim() + "</th>";
      table += "</tr></thead><tbody>";
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].split("|").filter(function (c) { return c.trim(); });
        table += "<tr>";
        for (var ci = 0; ci < cells.length; ci++) table += "<td>" + cells[ci].trim() + "</td>";
        table += "</tr>";
      }
      table += "</tbody></table>";
      return table;
    });

    // Line breaks
    html = html.replace(/\n\n/g, "</p><p>");
    html = "<p>" + html + "</p>";
    html = html.replace(/<p>\s*<\/p>/g, "");

    return html;
  }

  function highlightCode(code, lang) {
    if (!lang) return code;

    var rules = HIGHLIGHT_RULES[lang.toLowerCase()];
    if (typeof rules === "string") rules = HIGHLIGHT_RULES[rules];
    if (!rules) return code;

    var tokens = [];
    var result = code;

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      // Reset lastIndex for global patterns
      rule.pattern.lastIndex = 0;
      result = result.replace(rule.pattern, function (match) {
        var id = "\x00T" + tokens.length + "\x00";
        tokens.push({ text: match, cls: rule.cls });
        return id;
      });
    }

    // Restore tokens
    for (var t = 0; t < tokens.length; t++) {
      result = result.replace("\x00T" + t + "\x00",
        '<span class="' + tokens[t].cls + '">' + tokens[t].text + '</span>');
    }

    return result;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isSafeUrl(url) {
    try {
      var parsed = new URL(url, "https://placeholder.local");
      return SAFE_SCHEMES.indexOf(parsed.protocol) !== -1;
    } catch (_e) {
      return false;
    }
  }

  function renderPlainText(text) {
    return escapeHtml(text || "");
  }

  return {
    render: render,
    renderPlainText: renderPlainText,
    escapeHtml: escapeHtml,
  };
})();
