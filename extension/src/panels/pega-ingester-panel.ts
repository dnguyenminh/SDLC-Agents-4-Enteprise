/**
 * Pega Ingester Panel — one-button JSON rule ingestion.
 *
 * User picks a single Pega rule JSON file (object or array of objects);
 * every field required by the backend (projectId, checksum, version) is
 * auto-extracted. No manual form filling.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import { getNonce } from "../mcp-server-manager";
import { getBackendUrl } from "../config/backend-url";
import { BasePanel } from "./base-panel";
import { buildBackendAuthHeaders } from "../utils/backend-auth-headers";
import { computePegaChecksum } from "../code-intel/checksum/PegaRuleChecksumStrategy";
import { getProjectId, deriveProjectId } from "../extension";

/** Rule identity auto-extracted from the picked JSON file. */
interface RuleSummary {
  fileName: string;
  total: number;
  pxObjClass: string;
  pyClassName: string;
  pyRuleName: string;
  ruleset: string;
  version: string;
  pzInsKey: string;
  checksum: string;
}

export class PegaIngesterPanel {
  public static readonly viewType = "kiroPegaIngesterPanel";
  public static instance: PegaIngesterPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private rules: Record<string, unknown>[] = [];
  private projectId = "";
  private disposables: vscode.Disposable[] = [];

  private constructor(private readonly extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      PegaIngesterPanel.viewType,
      "Pega Ingester",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    this.panel.iconPath = new vscode.ThemeIcon("database");
    this.panel.webview.html = this.getHtml(this.panel.webview);
    this.panel.webview.onDidReceiveMessage(
      (msg) => {
        if (msg.type === "pickFile") void this.pickFile();
        if (msg.type === "ingest") void this.ingest();
      },
      undefined,
      this.disposables,
    );
    this.panel.onDidDispose(() => {
      PegaIngesterPanel.instance = undefined;
      this.disposables.forEach((d) => d.dispose());
      this.disposables = [];
    }, null, this.disposables);
  }

  public static open(extensionUri: vscode.Uri): void {
    if (PegaIngesterPanel.instance) {
      PegaIngesterPanel.instance.panel.reveal();
      return;
    }
    PegaIngesterPanel.instance = new PegaIngesterPanel(extensionUri);
  }

  /** Step 1: pick a JSON file and auto-extract all rule identity fields. */
  private async pickFile(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { "Pega rule JSON": ["json"] },
      openLabel: "Chọn rule JSON",
    });
    if (!picked || !picked[0]) return;
    try {
      const parsed = JSON.parse(fs.readFileSync(picked[0].fsPath, "utf8"));
      const list = Array.isArray(parsed) ? parsed : [parsed];
      if (!list.length || typeof list[0] !== "object") {
        throw new Error("File không chứa rule JSON hợp lệ");
      }
      this.rules = list as Record<string, unknown>[];
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      this.projectId = getProjectId() || (root ? await deriveProjectId(root) : "");
      this.post({ type: "rulePicked", summary: this.summarize(picked[0].path, list) });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.post({ type: "result", success: false, error: message });
    }
  }

  /** Step 2: POST to /api/v1/pega/ingest-rule (same path the BFS ingester uses). */
  private async ingest(): Promise<void> {
    if (!this.rules.length) return;
    if (!this.projectId) {
      this.post({ type: "result", success: false, error: "Chưa xác định projectId — hãy chạy lệnh 'Fetch Pega App Context' trước." });
      return;
    }
    const endpoint = `${getBackendUrl()}/api/v1/pega/ingest-rule`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...buildBackendAuthHeaders(),
    };
    // Route fail-closes without an identity and 403s on body/header mismatch —
    // keep both sides pinned to the SAME derived projectId.
    if (this.projectId) headers["X-Project-Id"] = this.projectId;
    const token = BasePanel.authTokenProvider?.() || "";
    if (token) headers["Authorization"] = `Bearer ${token}`;
    let ok = 0;
    let failed = 0;
    let lastError = "";
    for (const ruleJson of this.rules) {
      try {
        const checksum = computePegaChecksum({
          pzInsKey: String(ruleJson.pzInsKey ?? ruleJson.insKey ?? ""),
          pxUpdateDateTime: ruleJson.pxUpdateDateTime as string | undefined,
          pxSaveDateTime: ruleJson.pxSaveDateTime as string | undefined,
        });
        const body = JSON.stringify({
          projectId: this.projectId,
          ruleJson,
          checksum,
          version: (ruleJson.pyRuleSetVersion as string) || undefined,
        });
        const res = await fetch(endpoint, { method: "POST", headers, body });
        const json = (await res.json().catch(() => ({}))) as any;
        if (json.error) throw new Error(json.error.message);
        if (json.data?.ruleId && json.data.ruleId !== -1) ok++;
        else {
          failed++;
          lastError = json.data?.reason || "backend không lưu rule";
        }
      } catch (err) {
        failed++;
        lastError = err instanceof Error ? err.message : String(err);
      }
    }
    const success = ok > 0;
    this.post({ type: "result", success, ok, failed, error: lastError });
    vscode.window[success ? "showInformationMessage" : "showErrorMessage"](
      success ? `✅ Ingested ${ok}/${this.rules.length} rule` : `❌ Ingest failed: ${lastError}`,
    );
  }

  /** Derive the identity preview shown in the webview. */
  private summarize(fileName: string, list: Record<string, unknown>[]): RuleSummary {
    const r = list[0];
    const pxObjClass = String(r.pxObjClass ?? "");
    return {
      fileName: fileName.split(/[\\/]/).pop() ?? fileName,
      total: list.length,
      pxObjClass,
      pyClassName: String(r.pyClassName ?? pxObjClass),
      pyRuleName: String(r.pyRuleName ?? r.pxInsName ?? ""),
      ruleset: String(r.pyRuleSet ?? r.pyRuleset ?? ""),
      version: String(r.pyRuleSetVersion ?? r.pyRulesetVersion ?? ""),
      pzInsKey: String(r.pzInsKey ?? r.insKey ?? ""),
      checksum: computePegaChecksum({
        pzInsKey: String(r.pzInsKey ?? ""),
        pxUpdateDateTime: r.pxUpdateDateTime as string | undefined,
        pxSaveDateTime: r.pxSaveDateTime as string | undefined,
      }),
    };
  }

  private post(msg: unknown): void {
    void this.panel.webview.postMessage(msg);
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
<title>Pega Ingester</title>
<style>
body{font-family:var(--vscode-font-family);padding:20px;color:var(--vscode-foreground);background:var(--vscode-editor-background)}
button{background:var(--vscode-button-background);color:var(--vscode-button-foreground);border:none;padding:8px 16px;border-radius:4px;cursor:pointer;margin-right:8px}
button:disabled{opacity:.5;cursor:not-allowed}
#preview{margin-top:16px;border:1px solid var(--vscode-panel-border);border-radius:4px;padding:12px;display:none}
#preview dl{display:grid;grid-template-columns:140px 1fr;gap:4px 12px;margin:0}
#preview dt{font-weight:600;color:var(--vscode-descriptionForeground)}
#preview dd{margin:0;word-break:break-all}
#status{margin-top:12px;font-weight:600}
</style></head><body>
<h2>Pega Rule Ingester</h2>
<p>Nhấn nút bên dưới để chọn file <code>.json</code> của một Pega rule. Các field (className, ruleName, ruleset, checksum…) sẽ tự động trích xuất.</p>
<button id="pick">Chọn file JSON rule…</button>
<button id="ingest" disabled>Ingest</button>
<div id="preview"><dl id="fields"></dl></div>
<div id="status"></div>
<script nonce="${nonce}">
const vscode = acquireVsCodeApi();
const $ = (id) => document.getElementById(id);
$('pick').onclick = () => { $('status').textContent = ''; vscode.postMessage({ type: 'pickFile' }); };
$('ingest').onclick = () => { $('status').textContent = 'Đang ingest…'; vscode.postMessage({ type: 'ingest' }); };
window.addEventListener('message', (e) => {
  const m = e.data;
  if (m.type === 'rulePicked') {
    const s = m.summary;
    $('preview').style.display = 'block';
    $('fields').innerHTML = Object.entries({
      'File': s.fileName, 'Số rule': s.total, 'pxObjClass': s.pxObjClass,
      'pyClassName': s.pyClassName, 'pyRuleName': s.pyRuleName,
      'Ruleset': s.ruleset, 'Version': s.version, 'insKey': s.pzInsKey, 'checksum': s.checksum
    }).map(([k, v]) => '<dt>' + k + '</dt><dd>' + (v || '(trống)') + '</dd>').join('');
    $('ingest').disabled = false;
    $('status').textContent = 'Đã đọc rule. Nhấn Ingest để gửi lên backend.';
  } else if (m.type === 'result') {
    $('status').textContent = m.success
      ? '✅ ' + (m.ok !== undefined ? 'Ingested ' + m.ok + '/' + (m.ok + m.failed) + ' rule' : 'Thành công')
      : '❌ Lỗi: ' + (m.error || 'unknown');
  }
});
</script>
</body></html>`;
  }
}
