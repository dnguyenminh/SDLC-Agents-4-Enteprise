/**
 * AI Context Commands — KSA-177
 * Commands to get AI context for symbol at cursor and copy to clipboard.
 * Commands: kiroSdlc.getAIContext, kiroSdlc.getEditContext
 */

import * as vscode from "vscode";
import { McpServerManager } from "./mcp-server-manager";

/**
 * Register AI context commands.
 */
export function registerAIContextCommands(
  context: vscode.ExtensionContext,
  mcpManager: McpServerManager
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("kiroSdlc.getAIContext", () =>
      getContextForCursor(mcpManager, "get_ai_context")
    ),
    vscode.commands.registerCommand("kiroSdlc.getEditContext", () =>
      getContextForCursor(mcpManager, "get_edit_context")
    )
  );
}

async function getContextForCursor(mcpManager: McpServerManager, toolName: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage("No active editor. Open a file first.");
    return;
  }

  const symbol = getSymbolAtCursor(editor);
  const file = vscode.workspace.asRelativePath(editor.document.uri);
  const line = editor.selection.active.line + 1;

  if (!symbol) {
    vscode.window.showWarningMessage("No symbol found at cursor position.");
    return;
  }

  try {
    const raw = await mcpManager.invokeTool(toolName, { symbol, file, line });
    const contextText = formatContext(raw, symbol, toolName);
    await vscode.env.clipboard.writeText(contextText);
    vscode.window.showInformationMessage(`Context for "${symbol}" copied to clipboard.`);
  } catch (err) {
    vscode.window.showErrorMessage(`Failed to get context: ${(err as Error).message}`);
  }
}

function getSymbolAtCursor(editor: vscode.TextEditor): string | undefined {
  const position = editor.selection.active;
  const wordRange = editor.document.getWordRangeAtPosition(position);
  if (!wordRange) { return undefined; }
  return editor.document.getText(wordRange);
}

function formatContext(raw: string, symbol: string, toolName: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") { return parsed; }

    const sections: string[] = [];
    const label = toolName === "get_ai_context" ? "AI" : "Edit";
    sections.push(`# ${label} Context: ${symbol}\n`);

    if (parsed.definition) {
      sections.push(`## Definition\n\`\`\`\n${parsed.definition}\n\`\`\`\n`);
    }
    if (parsed.documentation) {
      sections.push(`## Documentation\n${parsed.documentation}\n`);
    }
    if (parsed.usages && parsed.usages.length > 0) {
      sections.push(`## Usages (${parsed.usages.length})`);
      for (const usage of parsed.usages.slice(0, 10)) {
        sections.push(`- ${usage.file}:${usage.line} — ${usage.context || ""}`);
      }
      sections.push("");
    }
    if (parsed.relatedSymbols && parsed.relatedSymbols.length > 0) {
      sections.push(`## Related Symbols`);
      for (const rel of parsed.relatedSymbols.slice(0, 10)) {
        sections.push(`- ${rel.name} (${rel.kind}) — ${rel.file || ""}`);
      }
      sections.push("");
    }
    if (parsed.context) {
      sections.push(`## Context\n${parsed.context}\n`);
    }

    return sections.join("\n") || raw;
  } catch {
    return raw;
  }
}
