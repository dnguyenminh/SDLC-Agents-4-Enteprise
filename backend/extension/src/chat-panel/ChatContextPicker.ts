/**
 * ChatContextPicker — handles context picker UI for different context types.
 * Extracted from ChatPanelProvider for SRP.
 */

import * as vscode from "vscode";
import * as path from "path";
import { ChatExtToWebviewMessage } from "./message-protocol";

type ContextItem = { type: string; label: string; path?: string; content?: string };

export class ChatContextPicker {
  constructor(
    private readonly workspaceRoot: string,
    private readonly sendToWebview: (msg: ChatExtToWebviewMessage) => void
  ) {}

  async pick(contextType: string): Promise<void> {
    let item: ContextItem | undefined;
    switch (contextType) {
      case "file": item = await this.pickFile(); break;
      case "folder": item = await this.pickFolder(); break;
      case "problems": item = this.pickProblems(); break;
      case "gitDiff": item = await this.pickGitDiff(); break;
      case "terminal": item = await this.pickTerminal(); break;
      case "spec": item = await this.pickSpec(); break;
      case "currentFile": item = this.pickCurrentFile(); break;
      case "steering": item = await this.pickSteering(); break;
      case "mcp": item = await this.pickMcp(); break;
    }
    if (item) {
      this.sendToWebview({ type: "chat:contextPicked", item: item as any });
    }
  }

  private async pickFile(): Promise<ContextItem | undefined> {
    const files = await vscode.workspace.findFiles("**/*", "{**/node_modules/**,**/.git/**,**/out/**,**/dist/**}", 500);
    if (files.length === 0) { return undefined; }
    const items = files.map(f => ({ label: path.basename(f.fsPath), description: vscode.workspace.asRelativePath(f), uri: f })).sort((a, b) => a.label.localeCompare(b.label));
    const picked = await vscode.window.showQuickPick(items, { title: "Select File", placeHolder: "Type to search...", matchOnDescription: true });
    if (!picked) { return undefined; }
    const doc = await vscode.workspace.openTextDocument(picked.uri);
    return { type: "file", label: vscode.workspace.asRelativePath(picked.uri), path: picked.uri.fsPath, content: doc.getText().slice(0, 50000) };
  }

  private async pickFolder(): Promise<ContextItem | undefined> {
    const allFiles = await vscode.workspace.findFiles("**/*", "{**/node_modules/**,**/.git/**,**/out/**,**/dist/**}", 1000);
    const folderSet = new Set<string>();
    for (const f of allFiles) {
      const rel = vscode.workspace.asRelativePath(f);
      const dir = path.dirname(rel);
      if (dir && dir !== ".") {
        folderSet.add(dir);
        const parts = dir.split(/[/\\]/);
        for (let i = 1; i < parts.length; i++) { folderSet.add(parts.slice(0, i).join("/")); }
      }
    }
    const items = Array.from(folderSet).sort().map(f => ({ label: path.basename(f), description: f, folderPath: f }));
    const picked = await vscode.window.showQuickPick(items, { title: "Select Folder", placeHolder: "Type to search folders...", matchOnDescription: true });
    if (!picked) { return undefined; }
    const folderUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, picked.folderPath);
    const filesInFolder = await vscode.workspace.findFiles(new vscode.RelativePattern(folderUri, "**/*"), "**/node_modules/**", 100);
    const listing = filesInFolder.map(f => vscode.workspace.asRelativePath(f)).sort().join("\n");
    return { type: "folder", label: picked.folderPath, path: folderUri.fsPath, content: listing };
  }

  private pickProblems(): ContextItem {
    const diagnostics = vscode.languages.getDiagnostics();
    const lines: string[] = [];
    let totalCount = 0;
    for (const [uri, diags] of diagnostics) {
      if (diags.length === 0) { continue; }
      const relPath = vscode.workspace.asRelativePath(uri);
      for (const d of diags) {
        const sev = d.severity === vscode.DiagnosticSeverity.Error ? "ERROR" : d.severity === vscode.DiagnosticSeverity.Warning ? "WARN" : "INFO";
        lines.push(`[${sev}] ${relPath}:${d.range.start.line + 1}: ${d.message}`);
        totalCount++;
      }
    }
    return { type: "problems", label: `Problems (${totalCount})`, content: lines.length > 0 ? lines.join("\n") : "No problems found." };
  }

  private async pickGitDiff(): Promise<ContextItem> {
    try {
      const gitExt = vscode.extensions.getExtension("vscode.git");
      let diffContent = "";
      if (gitExt) {
        const git = gitExt.exports.getAPI(1);
        if (git?.repositories?.length > 0) {
          diffContent = await git.repositories[0].diff(true) || await git.repositories[0].diff() || "";
        }
      }
      if (!diffContent) {
        const cp = require("child_process");
        diffContent = cp.execSync("git diff --stat && echo --- && git diff", { cwd: this.workspaceRoot, encoding: "utf-8", timeout: 10000 }).toString().slice(0, 50000);
      }
      return { type: "gitDiff", label: "Git Diff", content: diffContent || "No changes detected." };
    } catch (e) {
      return { type: "gitDiff", label: "Git Diff", content: `Error: ${(e as Error).message}` };
    }
  }

  private async pickTerminal(): Promise<ContextItem> {
    let content = "";
    const activeTerminal = vscode.window.activeTerminal;
    if (activeTerminal) {
      try {
        await vscode.commands.executeCommand("workbench.action.terminal.selectAll");
        await vscode.commands.executeCommand("workbench.action.terminal.copySelection");
        content = (await vscode.env.clipboard.readText()).slice(-20000);
        await vscode.commands.executeCommand("workbench.action.terminal.clearSelection");
      } catch { content = `Terminal "${activeTerminal.name}" content could not be read.`; }
    } else { content = "No active terminal."; }
    return { type: "terminal", label: "Terminal", content };
  }

  private async pickSpec(): Promise<ContextItem | undefined> {
    const specFiles = await vscode.workspace.findFiles(".kiro/specs/**/*.md");
    if (specFiles.length === 0) { return undefined; }
    const items = specFiles.map(f => ({ label: vscode.workspace.asRelativePath(f), uri: f }));
    const picked = await vscode.window.showQuickPick(items, { title: "Select Spec" });
    if (!picked) { return undefined; }
    const doc = await vscode.workspace.openTextDocument(picked.uri);
    return { type: "spec", label: path.basename(picked.label), path: picked.uri.fsPath, content: doc.getText().slice(0, 50000) };
  }

  private pickCurrentFile(): ContextItem | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return undefined; }
    const relativePath = vscode.workspace.asRelativePath(editor.document.uri);
    return { type: "currentFile", label: relativePath, path: editor.document.uri.fsPath, content: editor.document.getText().slice(0, 50000) };
  }

  private async pickSteering(): Promise<ContextItem | undefined> {
    const files = await vscode.workspace.findFiles(".kiro/steering/**/*.md");
    if (files.length === 0) { return undefined; }
    const items = files.map(f => ({ label: path.basename(f.fsPath, ".md"), description: vscode.workspace.asRelativePath(f), uri: f }));
    const picked = await vscode.window.showQuickPick(items, { title: "Select Steering Rule" });
    if (!picked) { return undefined; }
    const doc = await vscode.workspace.openTextDocument(picked.uri);
    return { type: "steering", label: picked.label, path: picked.uri.fsPath, content: doc.getText().slice(0, 50000) };
  }

  private async pickMcp(): Promise<ContextItem | undefined> {
    try {
      const fs = require("fs");
      const mcpConfigPath = path.join(this.workspaceRoot, ".kiro", "settings", "mcp.json");
      if (!fs.existsSync(mcpConfigPath)) { vscode.window.showWarningMessage("No MCP configuration found."); return undefined; }
      const config = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
      const servers = config.mcpServers || {};
      const serverNames = Object.keys(servers).filter(k => !servers[k].disabled);
      if (serverNames.length === 0) { vscode.window.showWarningMessage("No active MCP servers."); return undefined; }

      const quickPickItems: any[] = [];
      for (const serverName of serverNames) {
        const url = servers[serverName].url;
        if (!url) { continue; }
        quickPickItems.push({ label: serverName, kind: vscode.QuickPickItemKind.Separator });
        const tools = await this.fetchMcpTools(url);
        for (const tool of tools) {
          quickPickItems.push({ label: `  $(symbol-method) ${tool.name}`, description: tool.description?.slice(0, 80) || "", toolName: tool.name, serverName });
        }
      }
      const picked = await vscode.window.showQuickPick(quickPickItems, { title: "Select MCP Tool", placeHolder: "Choose a tool...", matchOnDescription: true });
      if (picked?.toolName) {
        return { type: "mcp", label: `${picked.serverName}/${picked.toolName}`, content: `MCP Tool: ${picked.toolName} (server: ${picked.serverName})` };
      }
    } catch (e) { vscode.window.showErrorMessage(`MCP error: ${(e as Error).message}`); }
    return undefined;
  }

  private fetchMcpTools(url: string): Promise<Array<{ name: string; description?: string }>> {
    const http = require("http");
    return new Promise((resolve) => {
      const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
      const parsedUrl = new URL(url);
      const req = http.request({
        hostname: parsedUrl.hostname, port: parsedUrl.port, path: parsedUrl.pathname,
        method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) }, timeout: 5000,
      }, (res: any) => {
        let data = "";
        res.on("data", (chunk: string) => data += chunk);
        res.on("end", () => { try { resolve(JSON.parse(data).result?.tools || []); } catch { resolve([]); } });
      });
      req.on("error", () => resolve([]));
      req.on("timeout", () => { req.destroy(); resolve([]); });
      req.write(body);
      req.end();
    });
  }
}
