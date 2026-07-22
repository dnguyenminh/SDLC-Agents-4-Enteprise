/**
 * SecurityPanel — KSA-173
 * Displays security findings grouped by severity with file links and remediation suggestions.
 * Calls MCP tools: code_search (kind=security_finding), mem_search (type=ERROR_PATTERN).
 */

import * as vscode from "vscode";
import { WebviewToExtMessage } from "../types";
import { IServerManager } from "../types/server-types";
import { BasePanel } from "./base-panel";
import { openFileAndReveal, normalizeResponse } from "../utils/panel-utils";

interface SecurityFinding {
  id: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  file: string;
  line: number;
  description: string;
  remediation: string;
}

export class SecurityPanel extends BasePanel {
  constructor(mcpManager: IServerManager, extensionUri: vscode.Uri) {
    super("security", mcpManager, extensionUri);
  }

  /** viewType is now derived from PANEL_VIEW_TYPES["security"] — no override needed. */

  getHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    // Body content with embedded styles — getBaseHtml provides CSP/nonce wrapper
    const bodyContent = `
<style>
body{font-family:var(--vscode-font-family);padding:16px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}
.severity-group{margin-bottom:16px}.severity-header{font-weight:bold;padding:4px 8px;border-radius:3px;margin-bottom:8px}
.critical{background:#dc2626;color:#fff}.high{background:#ea580c;color:#fff}.medium{background:#ca8a04;color:#fff}.low{background:#2563eb;color:#fff}
.finding{padding:8px;margin:4px 0;border:1px solid var(--vscode-editorWidget-border);border-radius:3px;cursor:pointer}
.finding:hover{background:var(--vscode-list-hoverBackground)}.finding-title{font-weight:600}
.finding-file{font-size:.85em;opacity:.8}.remediation{font-size:.85em;color:var(--vscode-descriptionForeground);margin-top:4px}
.loading{text-align:center;padding:40px;opacity:.7}#summary{display:flex;gap:12px;margin-bottom:16px}
.badge{padding:2px 8px;border-radius:10px;font-size:.85em}
</style>
<h2>Security Findings</h2><div id="summary"></div>
<div id="loading" class="loading">Scanning for security issues...</div><div id="findings"></div>
<script nonce="${nonce}">
const vscode=acquireVsCodeApi();vscode.postMessage({type:'ready'});
window.addEventListener('message',e=>{const msg=e.data;if(msg.type==='securityData')renderFindings(msg.findings);});
function renderFindings(findings){document.getElementById('loading').style.display='none';
const groups={critical:[],high:[],medium:[],low:[]};
findings.forEach(f=>{if(groups[f.severity])groups[f.severity].push(f);});
let s='',h='';for(const[sev,items]of Object.entries(groups)){if(!items.length)continue;
s+='<span class="badge '+sev+'">'+sev.toUpperCase()+': '+items.length+'</span>';
h+='<div class="severity-group"><div class="severity-header '+sev+'">'+sev.toUpperCase()+' ('+items.length+')</div>';
items.forEach(f=>{h+='<div class="finding" data-file="'+f.file+'" data-line="'+f.line+'">';
h+='<div class="finding-title">'+f.title+'</div><div class="finding-file">'+f.file+':'+f.line+'</div>';
h+='<div class="remediation">'+f.remediation+'</div></div>';});h+='</div>';}
document.getElementById('summary').innerHTML=s||'<span>No findings</span>';
document.getElementById('findings').innerHTML=h||'<p>No security issues found.</p>';
document.querySelectorAll('.finding').forEach(el=>{el.addEventListener('click',()=>{
vscode.postMessage({type:'openFile',file:el.dataset.file,line:parseInt(el.dataset.line)});});});}
</script>`;

    // Delegate CSP/nonce wrapper to shared getBaseHtml (no external assets needed)
    return this.getBaseHtml(webview, bodyContent, [], []);
  }

  async loadData(): Promise<void> {
    try {
      const findings = await this.fetchFindings();
      this.sendMessage({ type: "securityData", findings } as any);
    } catch (err) {
      this.sendMessage({ type: "error", message: `Security scan failed: ${(err as Error).message}`, retryable: true });
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
          console.debug(`[SecurityPanel] reconnect failed (non-fatal): ${(err as Error).message}`);
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
      console.debug(`[SecurityPanel] openFileAndReveal failed (non-fatal): ${(err as Error).message}`);
    }
  }

  private async fetchFindings(): Promise<SecurityFinding[]> {
    const findings: SecurityFinding[] = [];

    try {
      const raw = await this.mcpManager.invokeTool("code_search", { query: "security vulnerability", limit: 50 });
      const items = normalizeResponse<Record<string, unknown>>(raw, "results");
      for (const item of items) {
        findings.push({
          id: String(item["id"] ?? findings.length),
          severity: toSeverity(item["severity"] as string || item["kind"] as string),
          title: item["name"] as string || item["title"] as string || "Security Issue",
          file: item["file"] as string || item["path"] as string || "",
          line: item["line"] as number || 1,
          description: item["description"] as string || item["content"] as string || "",
          remediation: item["remediation"] as string || item["suggestion"] as string || "Review and fix this issue.",
        });
      }
    } catch (err) {
      console.warn(`[SecurityPanel] code_search unavailable: ${(err as Error).message}`);
    }

    try {
      const raw = await this.mcpManager.invokeTool("mem_search", { query: "security", type: "ERROR_PATTERN", limit: 20 });
      const items = normalizeResponse<Record<string, unknown>>(raw, "results");
      for (const item of items) {
        findings.push({
          id: String(item["id"] ?? findings.length),
          severity: "medium",
          title: item["title"] as string || item["summary"] as string || "Error Pattern",
          file: item["source"] as string || "",
          line: 1,
          description: item["content"] as string || "",
          remediation: item["suggestion"] as string || "Review error pattern for security implications.",
        });
      }
    } catch (err) {
      console.warn(`[SecurityPanel] mem_search unavailable: ${(err as Error).message}`);
    }

    return findings;
  }
}

function toSeverity(value: string | undefined): SecurityFinding["severity"] {
  if (!value) { return "medium"; }
  const v = value.toLowerCase();
  if (v.includes("critical")) { return "critical"; }
  if (v.includes("high")) { return "high"; }
  if (v.includes("low") || v.includes("info")) { return "low"; }
  return "medium";
}
