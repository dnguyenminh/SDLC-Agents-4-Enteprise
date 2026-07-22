/**
 * ImpactPanel — KSA-174
 * Shows blast radius visualization for a selected symbol.
 * Calls MCP tool: code_impact to get affected files, callers, and tests.
 */

import * as vscode from "vscode";
import { WebviewToExtMessage } from "../types";
import { IServerManager } from "../types/server-types";
import { BasePanel } from "./base-panel";
import { openFileAndReveal } from "../utils/panel-utils";

interface ImpactResult {
  symbol: string;
  affectedFiles: { file: string; line: number; kind: string }[];
  callers: { name: string; file: string; line: number }[];
  tests: { name: string; file: string; line: number }[];
  totalImpact: number;
}

export class ImpactPanel extends BasePanel {
  private currentSymbol = "";

  constructor(mcpManager: IServerManager, extensionUri: vscode.Uri) {
    super("impact", mcpManager, extensionUri);
  }

  /** viewType is now derived from PANEL_VIEW_TYPES["impact"] — no override needed. */

  setSymbol(symbol: string): void {
    this.currentSymbol = symbol;
  }

  getHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    // Body content with embedded styles — getBaseHtml provides CSP/nonce wrapper
    const bodyContent = `
<style>
body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}
.section{margin-bottom:16px}.section-title{font-weight:bold;margin-bottom:8px;font-size:1.1em}
.item{padding:6px 8px;margin:2px 0;border:1px solid var(--vscode-editorWidget-border);border-radius:3px;cursor:pointer;display:flex;justify-content:space-between}
.item:hover{background:var(--vscode-list-hoverBackground)}.item-name{font-weight:500}.item-file{font-size:.85em;opacity:.7}
.summary{display:flex;gap:16px;margin-bottom:16px;padding:12px;background:var(--vscode-editor-inactiveSelectionBackground);border-radius:4px}
.stat{text-align:center}.stat-value{font-size:1.5em;font-weight:bold}.stat-label{font-size:.8em;opacity:.7}
.loading{text-align:center;padding:40px;opacity:.7}
</style>
<h2>Impact Analysis</h2>
<div id="loading" class="loading">Analyzing impact...</div>
<div id="content" style="display:none">
<div id="symbol-name" style="font-size:1.2em;margin-bottom:12px"></div>
<div class="summary" id="summary"></div>
<div id="sections"></div>
</div>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();vscode.postMessage({type:'ready'});
window.addEventListener('message',e=>{const msg=e.data;if(msg.type==='impactData')renderImpact(msg.data);});
function renderImpact(data){document.getElementById('loading').style.display='none';
document.getElementById('content').style.display='block';
document.getElementById('symbol-name').textContent='Symbol: '+data.symbol;
document.getElementById('summary').innerHTML=
'<div class="stat"><div class="stat-value">'+data.affectedFiles.length+'</div><div class="stat-label">Files</div></div>'+
'<div class="stat"><div class="stat-value">'+data.callers.length+'</div><div class="stat-label">Callers</div></div>'+
'<div class="stat"><div class="stat-value">'+data.tests.length+'</div><div class="stat-label">Tests</div></div>';
let h='';
if(data.callers.length){h+='<div class="section"><div class="section-title">Callers</div>';
data.callers.forEach(c=>{h+='<div class="item" data-file="'+c.file+'" data-line="'+c.line+'"><span class="item-name">'+c.name+'</span><span class="item-file">'+c.file+':'+c.line+'</span></div>';});h+='</div>';}
if(data.affectedFiles.length){h+='<div class="section"><div class="section-title">Affected Files</div>';
data.affectedFiles.forEach(f=>{h+='<div class="item" data-file="'+f.file+'" data-line="'+f.line+'"><span class="item-name">'+f.file+'</span><span class="item-file">'+f.kind+'</span></div>';});h+='</div>';}
if(data.tests.length){h+='<div class="section"><div class="section-title">Related Tests</div>';
data.tests.forEach(t=>{h+='<div class="item" data-file="'+t.file+'" data-line="'+t.line+'"><span class="item-name">'+t.name+'</span><span class="item-file">'+t.file+':'+t.line+'</span></div>';});h+='</div>';}
document.getElementById('sections').innerHTML=h||'<p>No impact detected.</p>';
document.querySelectorAll('.item').forEach(el=>{el.addEventListener('click',()=>{
vscode.postMessage({type:'openFile',file:el.dataset.file,line:parseInt(el.dataset.line)});});});}
</script>`;

    // Delegate CSP/nonce wrapper to shared getBaseHtml (no external assets needed)
    return this.getBaseHtml(webview, bodyContent, [], []);
  }

  async loadData(): Promise<void> {
    if (!this.currentSymbol) { return; }
    try {
      const raw = await this.mcpManager.invokeTool("code_context", { symbol: this.currentSymbol });
      const data = this.parseImpact(raw);
      this.sendMessage({ type: "impactData", data } as any);
    } catch (err) {
      this.sendMessage({ type: "error", message: `Impact analysis failed: ${(err as Error).message}`, retryable: true });
    }
  }

  async handleMessage(msg: WebviewToExtMessage): Promise<void> {
    switch (msg.type) {
      case "ready":
      case "refresh":
        await this.loadData();
        break;
      case "manualRetry":
        try {
          await (this.mcpManager.reconnect?.() ?? this.mcpManager.restart());
        } catch (err) {
          console.debug(`[ImpactPanel] reconnect failed (non-fatal): ${(err as Error).message}`);
        }
        break;
      default:
        await this.handleOpenFile(msg as any);
        break;
    }
  }

  private async handleOpenFile(msg: { type: string; file?: string; line?: number }): Promise<void> {
    if (msg.type !== "openFile" || !msg.file) { return; }
    try {
      await openFileAndReveal(msg.file, msg.line || 1);
    } catch (err) {
      console.debug(`[ImpactPanel] openFileAndReveal failed (non-fatal): ${(err as Error).message}`);
    }
  }

  private parseImpact(raw: string): ImpactResult {
    // Pass arrays directly to avoid JSON.stringify -> JSON.parse round-trip.
    try {
      const parsed = JSON.parse(raw);
      return {
        symbol: this.currentSymbol,
        affectedFiles: Array.isArray(parsed.affectedFiles) ? parsed.affectedFiles :
                       Array.isArray(parsed.files) ? parsed.files : [],
        callers: Array.isArray(parsed.callers) ? parsed.callers :
                 Array.isArray(parsed.references) ? parsed.references : [],
        tests: Array.isArray(parsed.tests) ? parsed.tests : [],
        totalImpact: parsed.totalImpact || 0,
      };
    } catch (err) {
      console.debug(`[ImpactPanel] parseImpact failed (non-fatal): ${(err as Error).message}`);
      return { symbol: this.currentSymbol, affectedFiles: [], callers: [], tests: [], totalImpact: 0 };
    }
  }
}

/**
 * Show impact analysis command — prompts user for symbol, then opens panel.
 */
export async function showImpactAnalysis(mcpManager: IServerManager, extensionUri: vscode.Uri): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  let defaultSymbol = "";

  if (editor) {
    const wordRange = editor.document.getWordRangeAtPosition(editor.selection.active);
    if (wordRange) { defaultSymbol = editor.document.getText(wordRange); }
  }

  const symbol = await vscode.window.showInputBox({
    prompt: "Enter symbol name for impact analysis",
    value: defaultSymbol,
    placeHolder: "e.g. MyClass.myMethod",
  });

  if (!symbol) { return; }

  const panel = new ImpactPanel(mcpManager, extensionUri);
  panel.setSymbol(symbol);
  await panel.loadData();
}
