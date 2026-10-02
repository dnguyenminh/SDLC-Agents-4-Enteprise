/**
 * GraphPanel — KB Graph viewer via iframe (shared viewer on MCP port).
 * Uses same viewer as browser (http://localhost:PORT/) for consistent results.
 */

import * as vscode from "vscode";
import { WebviewToExtMessage } from "../types";
import { IServerManager } from "../types/server-types";
import { BasePanel } from "./base-panel";
import { getBackendUrl } from "../config/backend-url";

/** System prompt for extension-side code symbol enrichment (fallback). */
const CODE_ENRICH_SYSTEM = `You are a code analyst. Given a code symbol's source code, produce a JSON response with:
1. "summary": 1-3 sentence description of what the function/class does
2. "pseudo_code": Structured numbered steps describing the algorithm/logic (use \\n for newlines)
Respond ONLY with valid JSON: {"summary":"...","pseudo_code":"1. Step one\\n2. Step two\\n..."}`;

export class GraphPanel extends BasePanel {
  constructor(mcpManager: IServerManager, extensionUri: vscode.Uri) {
    super("graph", mcpManager, extensionUri);
  }

  getHtml(webview: vscode.Webview): string {
    return this.getIframeHtml();
  }

  async loadData(): Promise<void> {
    // No-op: iframe loads data directly from MCP server API
  }

  async handleMessage(msg: WebviewToExtMessage): Promise<void> {
    if ((msg as any).type === 'enrich_code_symbol') {
      await this.handleEnrichCodeSymbol(msg as any);
    }
  }

  /**
   * SA4E-155: On-demand enrichment flow.
   * 1. Ask backend to enqueue a HIGH_PRIORITY task (POST /enrich → queued + task_id).
   * 2. Poll GET /enrich/poll every 500ms up to 15s for the result.
   * 3. If completed → return enrichment to webview.
   * 4. If timeout/failed → fallback: try local LLM (Ollama/LMStudio) first, then the
   *    extension chatbox LLM (sdlcAgents.llmChat), and persist via /enrich-save.
   */
  private async handleEnrichCodeSymbol(msg: { symbolId: string; content: string; kind: string }): Promise<void> {
    const backendUrl = getBackendUrl();
    const token = BasePanel.authTokenProvider ? BasePanel.authTokenProvider() : '';
    const numId = msg.symbolId.replace('code:', '').replace('sym-', '');
    const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    try {
      // Step 1: enqueue high-priority task
      const enqueueRes = await fetch(`${backendUrl}/api/admin/kb/entries/code:${numId}/enrich`, {
        method: 'POST',
        headers: authHeaders,
      });
      const enqueueData = await enqueueRes.json().catch(() => ({} as any));

      if (enqueueRes.ok && enqueueData.status === 'queued') {
        // Step 2: poll for completion (15s timeout, 500ms interval)
        const result = await this.pollEnrichment(backendUrl, token, `code:${numId}`, 15000);
        if (result && result.status === 'completed') {
          this.sendMessage({
            type: 'enrich_code_symbol_result',
            symbolId: msg.symbolId,
            status: 'enriched',
            enrichment: result.enrichment,
          } as any);
          return;
        }
        // timeout or failed → fall through to extension fallback
        console.debug(`[GraphPanel] Backend enrichment timed out/failed — using extension fallback`);
      } else if (enqueueData.status === 'already_enriched') {
        this.sendMessage({ type: 'enrich_code_symbol_result', symbolId: msg.symbolId, status: 'already_enriched' } as any);
        return;
      } else {
        console.debug(`[GraphPanel] Enqueue failed (${enqueueRes.status}) — using extension fallback`);
      }
    } catch (err: any) {
      console.debug(`[GraphPanel] Backend enrichment error: ${err?.message}`);
    }

    // Step 3: extension-side fallback (local LLM first, then chatbox LLM)
    await this.fallbackEnrich(msg, backendUrl, authHeaders, numId);
  }

  /** SA4E-155: poll GET /enrich/poll until completed or timeout. */
  private async pollEnrichment(backendUrl: string, token: string, entryId: string, timeoutMs: number): Promise<{ status: string; enrichment?: any } | null> {
    const deadline = Date.now() + timeoutMs;
    const interval = 500;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${backendUrl}/api/admin/kb/entries/${entryId}/enrich/poll`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({} as any));
        if (data.status === 'completed') return { status: 'completed', enrichment: data.enrichment };
        if (data.status === 'failed' || data.status === 'not_found') return { status: data.status };
        // pending / processing → keep polling
      } catch { /* transient — retry */ }
      await new Promise<void>(r => setTimeout(r, interval));
    }
    return { status: 'timeout' };
  }

  /** SA4E-155: extension fallback — local LLM (Ollama/LMStudio) then chatbox LLM. */
  private async fallbackEnrich(msg: { symbolId: string; content: string; kind: string }, backendUrl: string, authHeaders: Record<string, string>, numId: string): Promise<void> {
    const userPrompt = `Analyze this ${msg.kind} and produce summary + pseudo code:\n\n---\n${(msg.content || '').slice(0, 3000)}\n---`;
    let summary = '';
    let pseudoCode = '';

    // Try local LLM first (Ollama / LMStudio)
    const local = await this.tryLocalLLM(userPrompt);
    if (local) {
      summary = local.summary || '';
      pseudoCode = local.pseudo_code || '';
    } else {
      // Fall back to extension chatbox LLM (sdlcAgents.llmChat)
      try {
        const response = await vscode.commands.executeCommand<string>(
          'sdlcAgents.llmChat',
          [{ role: 'system', content: CODE_ENRICH_SYSTEM }, { role: 'user', content: userPrompt }],
          { maxTokens: 800, temperature: 0.3 },
        );
        if (response) {
          const jsonMatch = response.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            summary = parsed.summary || '';
            pseudoCode = parsed.pseudo_code || '';
          }
        }
      } catch (err: any) {
        console.debug(`[GraphPanel] Chatbox LLM fallback failed: ${err?.message}`);
      }
    }

    if (!summary && !pseudoCode) {
      this.sendMessage({ type: 'enrich_code_symbol_result', symbolId: msg.symbolId, status: 'llm_unavailable' } as any);
      return;
    }

    // Persist fallback result to backend
    try {
      await fetch(`${backendUrl}/api/admin/kb/entries/code:${numId}/enrich-save`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ summary, pseudoCode }),
      });
    } catch (err: any) {
      console.debug(`[GraphPanel] enrich-save failed: ${err?.message}`);
    }

    this.sendMessage({
      type: 'enrich_code_symbol_result',
      symbolId: msg.symbolId,
      status: 'enriched',
      enrichment: { summary, pseudoCode, status: 'COMPLETED' },
    } as any);
  }

  /** SA4E-155: attempt enrichment via local LLM (Ollama or LMStudio) if reachable. */
  private async tryLocalLLM(userPrompt: string): Promise<{ summary: string; pseudo_code: string } | null> {
    const cfg = vscode.workspace.getConfiguration('sdlcAgents');
    const candidates: Array<{ label: string; baseUrl: string; model: string }> = [];
    const ollamaUrl = (cfg.get<string>('ollamaUrl') || '').trim();
    if (ollamaUrl) candidates.push({ label: 'ollama', baseUrl: `${ollamaUrl.replace(/\/$/, '')}/v1`, model: cfg.get<string>('llmModel') || 'qwen2.5-coder' });
    const lmstudioUrl = (cfg.get<string>('lmstudioBaseUrl') || '').trim();
    if (lmstudioUrl) candidates.push({ label: 'lmstudio', baseUrl: lmstudioUrl.replace(/\/$/, ''), model: cfg.get<string>('llmModel') || 'local-model' });

    for (const c of candidates) {
      try {
        const modelsRes = await fetch(`${c.baseUrl}/models`, { signal: AbortSignal.timeout(1500) });
        if (!modelsRes.ok) continue;
        const chatRes = await fetch(`${c.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(20000),
          body: JSON.stringify({
            model: c.model,
            messages: [{ role: 'system', content: CODE_ENRICH_SYSTEM }, { role: 'user', content: userPrompt }],
            temperature: 0.3,
            max_tokens: 800,
          }),
        });
        if (!chatRes.ok) continue;
        const json = await chatRes.json() as any;
        const content = json?.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;
        return JSON.parse(jsonMatch[0]);
      } catch { /* try next candidate */ }
    }
    return null;
  }
}
