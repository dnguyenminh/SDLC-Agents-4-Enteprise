/**
 * SA4E-372 R1 — orphan tool-container adoption (renderer contract).
 *
 * UAT live-trace defect: legacy turns (lmstudio/local) post tool events LIVE
 * mid-turn while the LLM stream is buffered — the adapter replays chunks only
 * at turn end. So `S.currentCycle` is still null when tools render, hasTools
 * can't fire, the tool container lands at the transcript ROOT, and the replay
 * legs merged into ONE cycle (final DOM was TOOLS → THINK → ASSISTANT).
 *
 * Contract under test (real webview modules, minimal fake DOM):
 *  - live tool render before any cycle → container tracked as orphan;
 *  - the first opened cycle adopts it: hasTools + chronological reorder
 *    (entry BEFORE the tools' messages → replay THINK(c1) → TOOLS …);
 *  - closeCycle slots adopted containers AFTER the cycle's elements;
 *  - session-path renders (cycle already open) are never tracked.
 */
import { it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

class FakeEl {
  children: FakeEl[] = [];
  parentNode: FakeEl | null = null;
  className = ''; id = ''; innerHTML = ''; textContent = '';
  scrollTop = 0; get scrollHeight() { return 100; }
  attrs: Record<string, string> = {};
  addEventListener() { /* button handlers not exercised */ }
  setAttribute(k: string, v: string) { this.attrs[k] = String(v); }
  getAttribute(k: string) { return this.attrs[k] ?? null; }
  hasAttribute(k: string) { return k in this.attrs; }
  get classList() {
    const self = this;
    const tokens = () => self.className.split(/\s+/).filter(Boolean);
    const write = (t: string[]) => { self.className = t.join(' '); };
    return {
      add: (...cs: string[]) => { write([...new Set([...tokens(), ...cs])]); },
      remove: (...cs: string[]) => { write(tokens().filter((c) => !cs.includes(c))); },
      toggle: (c: string) => { const t = tokens(); const i = t.indexOf(c); if (i >= 0) { t.splice(i, 1); write(t); return false; } t.push(c); write(t); return true; },
      contains: (c: string) => tokens().includes(c),
    };
  }
  appendChild(child: FakeEl) {
    if (child.parentNode) child.parentNode.removeChild(child);
    this.children.push(child); child.parentNode = this; return child;
  }
  insertBefore(child: FakeEl, ref: FakeEl | null) {
    if (child.parentNode) child.parentNode.removeChild(child);
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i === -1) return this.appendChild(child);
    this.children.splice(i, 0, child); child.parentNode = this; return child;
  }
  removeChild(child: FakeEl) {
    const i = this.children.indexOf(child);
    if (i !== -1) this.children.splice(i, 1);
    child.parentNode = null;
  }
  get nextSibling(): FakeEl | null {
    if (!this.parentNode) return null;
    const i = this.parentNode.children.indexOf(this);
    return this.parentNode.children[i + 1] ?? null;
  }
  private matches(sel: string): boolean {
    return sel.startsWith('.') && this.className.split(/\s+/).includes(sel.slice(1));
  }
  querySelector(sel: string): FakeEl | null {
    for (const ch of this.children) {
      if (ch.matches(sel)) return ch;
      const hit = ch.querySelector(sel);
      if (hit) return hit;
    }
    return null;
  }
  querySelectorAll(sel: string): FakeEl[] {
    const out: FakeEl[] = [];
    for (const ch of this.children) {
      if (ch.matches(sel)) out.push(ch);
      out.push(...ch.querySelectorAll(sel));
    }
    return out;
  }
}

/** Load the real webview modules over a fake DOM + ChatState stubs. */
function bootChatModules() {
  const tab = { id: 't1', name: 'T1', messages: [] as any[], tokenCount: 0, maxTokens: 128000 };
  const messagesEl = new FakeEl();
  const S: any = {
    messagesEl, activeTabId: 't1', getTab: () => tab,
    getMessageTargetTabId: (msg: any) => (msg && msg.originTabId) ? msg.originTabId : S.activeTabId,
    saveStateToDisk: () => {}, showMessages: () => {}, setWorking: () => {},
    statusLabel: () => '', addCodeActions: () => {}, scrollToBottom: () => {},
    escapeHtml: (s: string) => s, isStreaming: false,
    toolCalls: {} as Record<string, unknown>, currentCycle: null,
  };
  const fakeWindow = { ChatState: S } as any;
  const fakeDocument = { createElement: () => new FakeEl() };
  const md = { render: (s: string) => s };
  const dir = path.join(process.cwd(), 'webview-assets', 'chat');
  for (const f of ['chat-thinking.js', 'chat-tool-helpers.js', 'chat-tools.js', 'chat-cycle.js', 'chat-toolcall.js', 'chat-tabroute.js', 'chat-stream.js']) {
    // eslint-disable-next-line no-new-func
    new Function('window', 'document', 'MarkdownRenderer',
      fs.readFileSync(path.join(dir, f), 'utf8'))(fakeWindow, fakeDocument, md);
  }
  return { S, messagesEl, tab };
}

it('R1 legacy turn: live tools adopted by the first cycle — THINK(c1) → TOOLS → THINK(c2) → ASSISTANT', () => {
  const { S, messagesEl, tab } = bootChatModules();
  tab.messages.push({ role: 'user', content: 'ask about SA4E-369' });

  // Live phase — tools post BEFORE any stream delta (legacy buffered turn).
  S.renderToolCall({ id: 't1', name: 'grep_search', args: {}, status: 'completed' }, false, false);
  S.renderToolCall({ id: 't2', name: 'read_file', args: {}, status: 'completed' }, false, false);
  expect(S.currentCycle).toBeNull();
  expect(S.preCycleContainers).toHaveLength(1); // same container, idempotent

  // Replay leg 1 (thinking only) — opens c1 which adopts the orphan.
  S.handleStreamChunk({ nodeId: 'pi', eventType: 'thinking', content: 'leg-one reasoning ' });
  expect(S.currentCycle?.hasTools).toBe(true);

  // Replay leg 2 — thinking delta after hasTools closes c1, opens c2.
  S.handleStreamChunk({ nodeId: 'pi', eventType: 'thinking', content: 'leg-two reasoning' });
  S.handleStreamChunk({ nodeId: 'pi', eventType: 'token', content: 'final answer' });
  S.handleStreamComplete();

  // Persisted chronology: entry(c1) BEFORE the adopted tools; entry(c2) last.
  const roles = tab.messages.map((m: any) =>
    m.role + (m.toolData ? ':' + m.toolData.id : m.nodeId ? ':' + m.nodeId : ''));
  expect(roles).toEqual(['user', 'assistant:pi:c1', 'tool:t1', 'tool:t2', 'assistant:pi:c2']);
  // The two legs persist as TWO cycles (R1 merged-legs regression).
  expect(tab.messages[1].thinking).toBe('leg-one reasoning');
  expect(tab.messages[1].content).toBe('');
  expect(tab.messages[4].thinking).toBe('leg-two reasoning');
  expect(tab.messages[4].content).toBe('final answer');

  // Final DOM order (was TOOLS → THINK → ASSISTANT before the fix).
  const kinds = messagesEl.children.map((el: FakeEl) => el.className.split(' ')[0]);
  expect(kinds).toEqual(['thinking-block', 'ksa247-tool-container', 'thinking-block', 'message']);
  expect(S.preCycleContainers).toEqual([]);
  expect(S.currentCycle).toBeNull();
});

it('session path: tools inside an OPEN cycle are not tracked as orphans (line-137 intact)', () => {
  const { S } = bootChatModules();
  S.handleStreamChunk({ nodeId: 'pi', eventType: 'token', content: 'answer part ' });
  const tracked = (S.preCycleContainers ?? []).length;
  S.renderToolCall({ id: 's1', name: 'read_file', args: {}, status: 'running' }, false, false);
  expect((S.preCycleContainers ?? []).length).toBe(tracked); // no orphan added
  expect(S.currentCycle.hasTools).toBe(true);
  S.handleStreamComplete();
  expect(S.preCycleContainers).toEqual([]); // turn-end reset (chat-stream)
});
