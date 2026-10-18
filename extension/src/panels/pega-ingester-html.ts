/**
 * pega-ingester-html — webview HTML for the Pega Ingester panel.
 * Extracted from PegaIngesterPanel (BR-18); markup unchanged.
 */
import type * as vscode from "vscode";
import { getNonce } from "../mcp-server-manager";

/** Build the single-page HTML for the ingester webview. */
export function getPegaIngesterHtml(webview: vscode.Webview): string {
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
