/**
 * Markdown Renderer — Block Rendering (KSA-210 + KSA-230)
 * Block-level rules: paragraphs, headers, lists, tables, blockquotes,
 * horizontal rules + inline formatting (bold/italic/strike/links).
 * Exposes window.MarkdownBlocks (loaded before markdown-renderer.js).
 */
window.MarkdownBlocks = (function () {
  "use strict";

  var SAFE_SCHEMES = ["http:", "https:", "vscode:"];

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
      if (/^\s*\x26gt;/.test(line)) {
        flushPara();
        var quoted = [];
        while (i < lines.length && /^\s*\x26gt;/.test(lines[i])) {
          quoted.push(lines[i].replace(/^\s*\x26gt; ?/, ""));
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

  function isSafeUrl(url) {
    try {
      var parsed = new URL(url, "https://placeholder.local");
      return SAFE_SCHEMES.indexOf(parsed.protocol) !== -1;
    } catch (_e) {
      return false;
    }
  }

  return {
    renderBlock: renderBlock
  };
})();
