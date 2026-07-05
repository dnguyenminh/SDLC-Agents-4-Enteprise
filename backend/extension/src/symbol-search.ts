/**
 * Symbol Search QuickPick — KSA-179
 * Provides a debounced symbol search via MCP code_search/code_symbols tools.
 * User types → debounced search → shows results with file:line → navigate on select.
 */

import * as vscode from "vscode";
import { McpServerManager } from "./mcp-server-manager";

interface SymbolResult {
  name: string;
  kind: string;
  file: string;
  line: number;
}

interface SymbolQuickPickItem extends vscode.QuickPickItem {
  result: SymbolResult | undefined;
}

const DEBOUNCE_MS = 300;

/**
 * Register the symbolSearch command.
 */
export function registerSymbolSearch(
  context: vscode.ExtensionContext,
  mcpManager: McpServerManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("kiroSdlc.symbolSearch", () =>
      showSymbolSearchPick(mcpManager)
    )
  );
}

async function showSymbolSearchPick(mcpManager: McpServerManager): Promise<void> {
  const quickPick = vscode.window.createQuickPick<SymbolQuickPickItem>();
  quickPick.placeholder = "Search symbols (classes, functions, interfaces)...";
  quickPick.matchOnDescription = true;
  quickPick.matchOnDetail = true;

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  quickPick.onDidChangeValue((value) => {
    if (debounceTimer) { clearTimeout(debounceTimer); }
    if (!value || value.length < 2) {
      quickPick.items = [];
      return;
    }
    quickPick.busy = true;
    debounceTimer = setTimeout(() => performSearch(quickPick, mcpManager, value), DEBOUNCE_MS);
  });

  quickPick.onDidAccept(() => {
    const selected = quickPick.selectedItems[0];
    if (selected) { navigateToSymbol(selected); }
    quickPick.dispose();
  });

  quickPick.onDidHide(() => {
    if (debounceTimer) { clearTimeout(debounceTimer); }
    quickPick.dispose();
  });

  quickPick.show();
}

async function performSearch(
  quickPick: vscode.QuickPick<SymbolQuickPickItem>,
  mcpManager: McpServerManager,
  query: string
): Promise<void> {
  try {
    const raw = await mcpManager.invokeTool("code_search", { query, limit: 20 });
    const results = parseResults(raw);
    quickPick.items = results.map(toQuickPickItem);
  } catch {
    quickPick.items = [{ label: "$(error) Search failed", description: "MCP server may be unavailable", result: undefined }];
  } finally {
    quickPick.busy = false;
  }
}

function parseResults(raw: string): SymbolResult[] {
  try {
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed) ? parsed : (parsed.results || parsed.symbols || []);
    return items.map((item: any) => ({
      name: item.name || item.symbol || "unknown",
      kind: item.kind || item.type || "symbol",
      file: item.file || item.path || "",
      line: item.line || item.startLine || 1,
    }));
  } catch {
    return [];
  }
}

function toQuickPickItem(result: SymbolResult): SymbolQuickPickItem {
  const icon = getKindIcon(result.kind);
  return {
    label: `${icon} ${result.name}`,
    description: `${result.file}:${result.line}`,
    detail: result.kind,
    result,
  };
}

function getKindIcon(kind: string): string {
  const icons: Record<string, string> = {
    class: "$(symbol-class)",
    function: "$(symbol-method)",
    interface: "$(symbol-interface)",
    enum: "$(symbol-enum)",
    variable: "$(symbol-variable)",
    namespace: "$(symbol-namespace)",
  };
  return icons[kind.toLowerCase()] || "$(symbol-misc)";
}

async function navigateToSymbol(item: SymbolQuickPickItem): Promise<void> {
  if (!item.result) { return; }
  const { file, line } = item.result;
  try {
    const uri = vscode.Uri.file(file);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc);
    const pos = new vscode.Position(Math.max(0, line - 1), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
  } catch {
    vscode.window.showErrorMessage(`Cannot open file: ${file}`);
  }
}
