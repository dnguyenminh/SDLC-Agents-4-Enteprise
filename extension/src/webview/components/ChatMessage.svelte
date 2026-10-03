<!--
  SA4E-85 — ChatMessage (Task 2.4).
  Individual message renderer with markdown + code block support.
  Displays user/assistant/system messages with appropriate styling.
  Includes ThinkingBlock for assistant reasoning content.
-->
<script lang="ts">
  import type { ChatMessageItem } from '../stores/chatStore';
  import ThinkingBlock from './ThinkingBlock.svelte';

  /** The message data to render */
  export let message: ChatMessageItem;
  /** Whether this message's thinking stream is currently active */
  export let isThinking: boolean = false;

  /** Format timestamp to locale time string */
  function formatTime(ts: number): string {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  /** Derive role label for accessibility */
  function roleLabel(role: string): string {
    switch (role) {
      case 'user': return 'You';
      case 'assistant': return 'Assistant';
      case 'system': return 'System';
      default: return role;
    }
  }

  /**
   * Markdown renderer for chat messages (SA4E-85, block-aware).
   * Supports fenced code blocks, inline code, bold, italic,
   * headers, tables, lists, hr and blockquotes.
   * Code fences are extracted first so inner pipes and lists
   * are never reinterpreted. Sanitizes HTML entities to prevent XSS.
   */
  function renderMarkdown(text: string): string {
    if (!text) return '';
    // Escape HTML entities first
    let html = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 1. Extract fenced code blocks first (tolerates ```lang without newline)
    const fences: Array<{ lang: string; code: string }> = [];
    html = html.replace(/```(\w*)[ \t]*\n?([\s\S]*?)```/g, (_m, lang, code) => {
      const id = '\x00F' + fences.length + '\x00';
      fences.push({ lang: lang || '', code: String(code).replace(/^\n+|\n+$/g, '') });
      return '\n\n' + id + '\n\n';
    });

    // 2. Extract inline code spans
    const inlines: string[] = [];
    html = html.replace(/`([^`\n]+)`/g, (_m, code) => {
      const id = '\x00I' + inlines.length + '\x00';
      inlines.push(code);
      return id;
    });

    // 3. Block-split on blank lines, render each block by shape
    const out: string[] = [];
    for (const raw of html.split(/\n{2,}/)) {
      const rendered = renderBlock(raw);
      if (rendered) out.push(rendered);
    }
    html = out.join('\n');

    // 4. Restore inline code + fences
    html = html.replace(/\x00I(\d+)\x00/g, (_m, n) => `<code class="inline-code">${inlines[+n] ?? ''}</code>`);
    html = html.replace(/(?:<p>)?\x00F(\d+)\x00(?:<\/p>)?/g, (_m, n) => {
      const fence = fences[+n] ?? { lang: '', code: '' };
      const langAttr = fence.lang ? ` data-lang="${fence.lang}"` : '';
      return `<pre class="code-block"${langAttr}><code>${fence.code}</code></pre>`;
    });

    return html;
  }

  function isTableRow(line: string): boolean {
    return /^\s*\|.*\|\s*$/.test(line);
  }

  function isTableSep(line: string): boolean {
    return /^\s*\|[\s:|\-]*\|[\s]*$/.test(line) && /-/.test(line);
  }

  function splitRow(line: string): string[] {
    return line.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
  }

  function inlineFmt(s: string): string {
    let r = s;
    r = r.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    r = r.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
    return r;
  }

  function isListLine(line: string): boolean {
    return /^\s*(?:- \[[ xX]\]|[-*+] |\d+\. )/.test(line);
  }

  function renderBlock(block: string): string {
    if (!block || !block.trim()) return '';

    const lines = block.split('\n');
    const htmlOut: string[] = [];
    const para: string[] = [];
    const flushPara = () => {
      if (para.length) {
        htmlOut.push(`<p>${inlineFmt(para.join('\n')).replace(/\n/g, '<br/>')}</p>`);
        para.length = 0;
      }
    };

    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (/^\x00F\d+\x00$/.test(line)) { flushPara(); htmlOut.push(line); i++; continue; }

      const hm = line.match(/^(#{1,3}) (.+)$/);
      if (hm) {
        flushPara();
        const level = hm[1].length + 2;
        htmlOut.push(`<h${level}>${inlineFmt(hm[2].trim())}</h${level}>`);
        i++;
        continue;
      }

      if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) { flushPara(); htmlOut.push('<hr/>'); i++; continue; }

      if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        flushPara();
        let j = i + 2;
        while (j < lines.length && isTableRow(lines[j])) j++;
        htmlOut.push(renderTable(lines.slice(i, j)));
        i = j;
        continue;
      }

      if (isListLine(line)) {
        flushPara();
        const items: string[] = [];
        while (i < lines.length && isListLine(lines[i])) {
          const m = lines[i].match(/^\s*(?:- \[[ xX]\]|[-*+]|\d+\.)\s+(.*)$/);
          items.push(`<li>${inlineFmt(m ? m[1] : lines[i].trim())}</li>`);
          i++;
        }
        htmlOut.push(`<ul>${items.join('')}</ul>`);
        continue;
      }

      if (/^\s*&gt;/.test(line)) {
        flushPara();
        const quoted: string[] = [];
        while (i < lines.length && /^\s*&gt;/.test(lines[i])) {
          quoted.push(lines[i].replace(/^\s*&gt; ?/, ''));
          i++;
        }
        htmlOut.push(`<blockquote>${inlineFmt(quoted.join('\n')).replace(/\n/g, '<br/>')}</blockquote>`);
        continue;
      }

      if (!line.trim()) { flushPara(); i++; continue; }
      para.push(line);
      i++;
    }
    flushPara();
    return htmlOut.join('\n');
  }

  function renderTable(tableLines: string[]): string {
    let table = '<table><thead><tr>';
    for (const h of splitRow(tableLines[0])) table += `<th>${inlineFmt(h)}</th>`;
    table += '</tr></thead><tbody>';
    for (let r = 2; r < tableLines.length; r++) {
      table += '<tr>';
      for (const c of splitRow(tableLines[r])) table += `<td>${inlineFmt(c)}</td>`;
      table += '</tr>';
    }
    return table + '</tbody></table>';
  }
</script>

<article
  class="chat-message {message.role}"
  aria-label="{roleLabel(message.role)} message"
>
  <div class="message-meta">
    <span class="role-badge">{roleLabel(message.role)}</span>
    {#if message.agentId}
      <span class="agent-tag">{message.agentId}</span>
    {/if}
    <time class="timestamp" datetime={new Date(message.timestamp).toISOString()}>
      {formatTime(message.timestamp)}
    </time>
  </div>

  {#if message.thinking}
    <ThinkingBlock content={message.thinking} isActive={isThinking} />
  {/if}

  <div class="message-body">
    {renderMarkdown(message.content)}
  </div>
</article>

<style>
  .chat-message {
    padding: 8px 12px;
    margin: 2px 0;
    border-radius: 4px;
  }
  .chat-message.user {
    background: var(--vscode-input-background, rgba(255,255,255,0.04));
  }
  .chat-message.assistant {
    background: transparent;
  }
  .chat-message.system {
    background: var(--vscode-editorInfo-background, rgba(0,120,212,0.1));
    font-style: italic;
  }
  .message-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 4px;
    font-size: 11px;
    color: var(--vscode-descriptionForeground, #888);
  }
  .role-badge {
    font-weight: 600;
    text-transform: capitalize;
  }
  .agent-tag {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--vscode-badge-background, #4d4d4d);
    color: var(--vscode-badge-foreground, #fff);
    font-size: 10px;
  }
  .timestamp {
    margin-left: auto;
  }
  .message-body {
    font-size: 13px;
    line-height: 1.5;
    word-break: break-word;
  }
  .message-body :global(.code-block) {
    margin: 8px 0;
    padding: 8px 12px;
    border-radius: 4px;
    background: var(--vscode-textCodeBlock-background, #1e1e1e);
    overflow-x: auto;
    font-size: 12px;
    font-family: var(--vscode-editor-font-family, monospace);
  }
  .message-body :global(.inline-code) {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--vscode-textCodeBlock-background, #1e1e1e);
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
  }
  .message-body :global(table) {
    border-collapse: collapse;
    margin: 8px 0;
    width: 100%;
    font-size: 12px;
  }
  .message-body :global(th),
  .message-body :global(td) {
    border: 1px solid var(--vscode-panel-border, #3c3c3c);
    padding: 4px 8px;
    text-align: left;
  }
  .message-body :global(th) {
    background: var(--vscode-editor-lineHighlightBackground, rgba(255,255,255,0.04));
    font-weight: 600;
  }
  .message-body :global(ul) {
    margin: 4px 0;
    padding-left: 20px;
  }
  .message-body :global(blockquote) {
    margin: 4px 0;
    padding: 4px 12px;
    border-left: 3px solid var(--vscode-panel-border, #3c3c3c);
    opacity: 0.9;
  }
</style>
