/**
 * Markdown Renderer — KSA-210 + KSA-230 (+ SA4E-33x block-aware rewrite).
 * Safe markdown-to-HTML converter with syntax highlighting.
 * No raw innerHTML of user content; sanitizes links; escapes code blocks.
 *
 * Block-aware: fenced code is extracted BEFORE any inline/block rule runs
 * (so `|`/lists/headers inside code are never reinterpreted), and block
 * elements (<pre>/<table>/<ul>/<h*>/<blockquote>) are NEVER wrapped in <p>.
 *
 * Split (200-line file standard): highlighting rules live in
 * markdown-highlight.js (window.MarkdownHighlight), block/inline rules in
 * markdown-blocks.js (window.MarkdownBlocks). Both load BEFORE this file;
 * the MarkdownRenderer global is unchanged.
 */

 // eslint-disable-next-line no-unused-vars
 var MarkdownRenderer = (function () {
  "use strict";

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
      var rendered = MarkdownBlocks.renderBlock(blocks[b]);
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
      var highlighted = MarkdownHighlight.highlightCode(fence.code, fence.lang);
      var langClass = fence.lang ? ' class="language-' + fence.lang + '"' : "";
      return "<pre><code" + langClass + ">" + highlighted + "</code></pre>";
    });

    return html;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "\x26amp;")
      .replace(/</g, "\x26lt;")
      .replace(/>/g, "\x26gt;")
      .replace(/"/g, "\x26quot;")
      .replace(/'/g, "&#039;");
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
