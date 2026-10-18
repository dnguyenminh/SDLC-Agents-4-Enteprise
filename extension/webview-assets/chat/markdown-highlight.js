/**
 * Markdown Renderer — Syntax Highlighting (KSA-210 + KSA-230)
 * Per-language token rules + the token-extraction highlighter.
 * Exposes window.MarkdownHighlight (loaded before markdown-renderer.js).
 */
window.MarkdownHighlight = (function () {
  "use strict";

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
      { pattern: /(\x26lt;!--[\s\S]*?--\x26gt;)/g, cls: "hljs-comment" },
      { pattern: /(\x26lt;\/?[\w-]+)/g, cls: "hljs-selector-tag" },
      { pattern: /([\w-]+)=(\x26quot;[^&]*\x26quot;)/g, cls: "hljs-attr" }
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

  return {
    HIGHLIGHT_RULES: HIGHLIGHT_RULES,
    highlightCode: highlightCode
  };
})();
