/**
 * Markdown Renderer — KSA-210 + KSA-230 (+ SA4E-33x block-aware rewrite).
 * Safe markdown-to-HTML converter with syntax highlighting.
 * No raw innerHTML of user content; sanitizes links; escapes code blocks.
 *
 * Block-aware: fenced code is extracted BEFORE any inline/block rule runs
 * (so `|`/lists/headers inside code are never reinterpreted), and block
 * elements (<pre>/<table>/<ul>/<h*>/<blockquote>) are NEVER wrapped in <p>.
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
    text: [],
    plaintext: [],
    txt: [],
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

    // 1. Extract fenced code blocks FIRST — nothing else may touch their content.
    // Tolerates ```lang immediately followed by content (no newline).
    var fences = [];
    html = html.replace(/```(\w*)[ \t]*\n?([\s\S]*?)```/g, function (_m, lang, code) {
      var id = "\x00F" + fences.length + "\x00";
      fences.push({ lang: lang || "", code: code.replace(/^\n+|\n+$/g, "") });
      return "\n\n" + id + "\n\n";
    });

    // 2. Extract inline code spans (single backticks, no newlines inside).
    var inlines = [];
    html = html.replace(/`([^`\n]+)`/g, function (_m, code) {
      var id = "\x00I" + inlines.length + "\x00";
      inlines.push(code);
      return id;
    });

    // 3. Split into blocks on blank lines; render each block by shape.
    var blocks = html.split(/\n{2,}/);
    var out = [];
    for (var b = 0; b < blocks.length; b++) {
      var rendered = renderBlock(blocks[b]);
      if (rendered) out.push(rendered);
    }
    html = out.join("\n");

    // 4. Restore inline code.
    html = html.replace(/\x00I(\d+)\x00/g, function (_m, n) {
      return "<code>" + (inlines[+n] || "") + "</code>";
    });

    // 5. Restore fenced code blocks (bare, or unwrapped from <p>).
    html = html.replace(/(?:<p>)?\x00F(\d+)\x00(?:<\/p>)?/g, function (_m, n) {
      var fence = fences[+n] || { lang: "", code: "" };
      var highlighted = highlightCode(fence.code, fence.lang);
      var langClass = fence.lang ? ' class="language-' + fence.lang + '"' : "";
      return "<pre><code" + langClass + ">" + highlighted + "</code></pre>";
    });

    return html;
  }

  // Block rendering scans line groups, so tables/lists/headers work even
  // without a preceding blank line (models often omit it).
  function renderBlock(block) {
    if (!block || !block.trim()) return "";

    var lines = block.split("\n");
    var htmlOut = [];
    var para = [];
    function flushPara() {
      if (para.length) {
        htmlOut.push("<p>" + inline(para.join("\n")).replace(/\n/g, "<br/>") + "</p>");
        para = [];
      }
    }

    var i = 0;
    while (i < lines.length) {
      var line = lines[i];

      // Lone fence placeholder → restored later, never inside <p>
      if (/^\x00F\d+\x00$/.test(line)) { flushPara(); htmlOut.push(line); i++; continue; }

      // Headers
      var headerMatch = line.match(/^(#{1,4}) (.+)$/);
      if (headerMatch) {
        flushPara();
        var level = headerMatch[1].length + 1; // # -> h2 ... #### -> h5
        htmlOut.push("<h" + level + ">" + inline(headerMatch[2].trim()) + "</h" + level + ">");
        i++;
        continue;
      }

      // Horizontal rule
      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { flushPara(); htmlOut.push("<hr>"); i++; continue; }

      // Tables: header row + separator row + body rows (whitespace tolerant)
      if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
        flushPara();
        var j = i + 2;
        while (j < lines.length && isTableRow(lines[j])) j++;
        htmlOut.push(renderTable(lines.slice(i, j)));
        i = j;
        continue;
      }

      // Lists: runs of -, *, +, 1. or checkbox lines
      if (isListLine(line)) {
        flushPara();
        var items = [];
        while (i < lines.length && isListLine(lines[i])) {
          items.push(renderListItem(lines[i]));
          i++;
        }
        htmlOut.push("<ul>" + items.join("") + "</ul>");
        continue;
      }

      // Blockquotes (escaped '>' runs)
      if (/^\s*&gt;/.test(line)) {
        flushPara();
        var quoted = [];
        while (i < lines.length && /^\s*&gt;/.test(lines[i])) {
          quoted.push(lines[i].replace(/^\s*&gt; ?/, ""));
          i++;
        }
        htmlOut.push("<blockquote>" + inline(quoted.join("\n")).replace(/\n/g, "<br/>") + "</blockquote>");
        continue;
      }

      if (!line.trim()) { flushPara(); i++; continue; }
      para.push(line);
      i++;
    }
    flushPara();
    return htmlOut.join("\n");
  }

  function renderListItem(line) {
    var m = line.match(/^\s*(?:- \[x\]|- \[ \]|-|\*|\+|\d+\.)\s+(.*)$/);
    var itemText = m ? m[1] : line.trim();
    var cls = "";
    if (/^\s*- \[x\]/i.test(line)) { cls = ' class="checked"'; itemText = "\u2611 " + itemText; }
    else if (/^\s*- \[ \]/i.test(line)) { cls = ' class="unchecked"'; itemText = "\u2610 " + itemText; }
    return "<li" + cls + ">" + inline(itemText) + "</li>";
  }

  function renderTable(tableLines) {
    var table = "<table><thead><tr>";
    var headers = splitRow(tableLines[0]);
    for (var h = 0; h < headers.length; h++) table += "<th>" + inline(headers[h]) + "</th>";
    table += "</tr></thead><tbody>";
    for (var r = 2; r < tableLines.length; r++) {
      var cells = splitRow(tableLines[r]);
      table += "<tr>";
      for (var c = 0; c < cells.length; c++) table += "<td>" + inline(cells[c]) + "</td>";
      table += "</tr>";
    }
    return table + "</tbody></table>";
  }

  function isListLine(line) {
    return /^\s*(?:- \[[ xX]\]|[-*+] |\d+\. )/.test(line);
  }

  function isTableRow(line) {
    return /^\s*\|.*\|\s*$/.test(line);
  }

  function isTableSeparator(line) {
    return /^\s*\|[\s:|\-]*\|[\s]*$/.test(line) && /-/.test(line);
  }

  function splitRow(line) {
    var trimmed = line.trim().replace(/^\||\|$/g, "");
    return trimmed.split("|").map(function (c) { return c.trim(); });
  }

  function inline(text) {
    var s = text;
    // Bold
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    // Italic (* and _)
    s = s.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, "<em>$1</em>");
    s = s.replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");
    // Strikethrough
    s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
    // Links
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function (_m, label, url) {
      if (isSafeUrl(url)) {
        return '<a href="' + url + '" title="' + label + '">' + label + "</a>";
      }
      return label;
    });
    return s;
  }

  function highlightCode(code, lang) {
    if (!lang) return code;

    var rules = HIGHLIGHT_RULES[lang.toLowerCase()];
    if (typeof rules === "string") rules = HIGHLIGHT_RULES[rules];
    if (!rules || !rules.length) return code;

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
      result = result.split("\x00T" + t + "\x00").join(
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
