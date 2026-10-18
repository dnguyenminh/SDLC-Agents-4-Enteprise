/**
 * ChatPanelProvider — editor code actions and context/attachment picking.
 * Extracted from the private handlers; behavior, log strings and vscode API
 * usage are preserved exactly.
 */

import * as vscode from "vscode";
import { ChatExtToWebviewMessage } from "../message-protocol";

/**
 * Apply generated code to the active editor (or the file at `filePath`),
 * replacing the whole file when the selection is empty and the code looks
 * like a full source file.
 */
export async function applyCodeToEditor(code: string, filePath?: string): Promise<void> {
  let editor: vscode.TextEditor | null | undefined = vscode.window.activeTextEditor;

  // If no active editor but filePath provided, open that file
  if (!editor && filePath) {
    editor = await openTargetEditor(filePath);
    if (editor === null) { return; }
  }

  if (!editor) {
    vscode.window.showWarningMessage("No active editor. Open the target file first, then click Apply.");
    return;
  }

  // Replace entire file content if selection is empty and code looks like full file
  const hasImports = code.trimStart().startsWith("import ") || code.trimStart().startsWith("package ");
  if (editor.selection.isEmpty && hasImports) {
    const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
    await editor.edit((eb) => { eb.replace(fullRange, code); });
  } else {
    await editor.edit((eb) => { editor!.selection.isEmpty ? eb.insert(editor!.selection.active, code) : eb.replace(editor!.selection, code); });
  }
}

/**
 * Open `filePath` in a new editor when needed.
 * Returns null only when the file could not be opened (already warned).
 */
async function openTargetEditor(filePath: string): Promise<vscode.TextEditor | null> {
  const wsRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "";
  const fullPath = require("path").isAbsolute(filePath) ? filePath : require("path").join(wsRoot, filePath);
  try {
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(fullPath));
    return await vscode.window.showTextDocument(doc);
  } catch (err) {
    console.warn("[ChatPanelProvider] handleApplyCode failed to open file: " + (err as Error).message);
    vscode.window.showWarningMessage(`Cannot open file: ${filePath}`);
    return null;
  }
}

/** Insert code at the cursor, or open a new untitled document with it. */
export async function insertCodeToEditor(code: string): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (editor) { await editor.edit((eb) => eb.insert(editor.selection.active, code)); }
  else { await vscode.window.showTextDocument(await vscode.workspace.openTextDocument({ content: code })); }
}

/** Let the user pick files and forward each as a chat:contextPicked message. */
export async function pickAttachmentFiles(sendToWebview: (msg: ChatExtToWebviewMessage) => void): Promise<void> {
  const uris = await vscode.window.showOpenDialog({ canSelectFiles: true, canSelectFolders: false, canSelectMany: true, title: "Attach Files", filters: { "All Files": ["*"] } });
  if (!uris) { return; }
  for (const uri of uris) { sendToWebview({ type: "chat:contextPicked", item: { type: "file", label: vscode.workspace.asRelativePath(uri), path: uri.fsPath } }); }
}

/** Open the chat context picker for the given context type. */
export async function pickChatContext(workspaceRoot: string, sendToWebview: (msg: ChatExtToWebviewMessage) => void, contextType: string): Promise<void> {
  const { ChatContextPicker } = require("../ChatContextPicker");
  const picker = new ChatContextPicker(workspaceRoot, (msg: ChatExtToWebviewMessage) => sendToWebview(msg));
  await picker.pick(contextType);
}
