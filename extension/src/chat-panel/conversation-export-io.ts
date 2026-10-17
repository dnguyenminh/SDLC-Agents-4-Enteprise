/**
 * ConversationExport IO — SA4E-369
 * The vscode-facing half of the export feature: save dialog, file write,
 * clipboard. All rendering lives in the pure conversation-exporter.ts;
 * this module only moves bytes.
 */
import * as vscode from "vscode";
import {
  buildConversationExport,
  defaultExportFileName,
  type ExportFormat,
  type ExportTabInput,
} from "./conversation-exporter";
import {
  renderConversationMarkdown,
  renderConversationJson,
  renderEntryMarkdown,
} from "./conversation-export-render";

/** A chat:exportConversation request as posted by the webview. */
export interface ExportConversationRequest {
  format: ExportFormat;
  tab: ExportTabInput;
  model?: string;
  mode?: string;
}

/** A chat:copyMessage request — ONE webview tab-message entry. */
export interface CopyMessageRequest {
  entry: Record<string, unknown>;
}

const FILE_FILTERS: Record<ExportFormat, { [name: string]: string[] }> = {
  markdown: { "Markdown": ["md"] },
  json: { "JSON": ["json"] },
};

/**
 * Render the requested tab, ask for a destination, write the file.
 * User cancellation (no destination) is NOT an error — returns silently.
 * Any IO failure propagates; the caller surfaces it as a chat:error.
 */
export async function exportConversationToFile(req: ExportConversationRequest): Promise<void> {
  const cx = buildConversationExport(req.tab, { model: req.model, mode: req.mode });
  const content =
    req.format === "json" ? renderConversationJson(cx) : renderConversationMarkdown(cx);

  const defaultName = defaultExportFileName(req.tab?.name || "chat", req.format);
  const folder = vscode.workspace.workspaceFolders?.[0];
  const defaultUri = folder
    ? vscode.Uri.joinPath(folder.uri, defaultName)
    : vscode.Uri.file(defaultName);

  const target = await vscode.window.showSaveDialog({
    defaultUri,
    filters: FILE_FILTERS[req.format],
    title: "Export conversation for AI analysis",
  });
  if (!target) return; // cancelled — not an error

  await vscode.workspace.fs.writeFile(target, Buffer.from(content, "utf8"));
  vscode.window.setStatusBarMessage(`$(check) Conversation exported: ${defaultName}`, 5000);
}

/**
 * Copy ONE message (user / assistant / error / tool call) as Markdown.
 * The entry is normalized through the same exporter used for whole-file
 * exports, so a copied tool block is byte-identical to its section in the
 * full export.
 */
export async function copyMessageEntryToClipboard(req: CopyMessageRequest): Promise<void> {
  const single = buildConversationExport({ messages: [req.entry] });
  const entry = single.entries[0];
  if (!entry) return;
  await vscode.env.clipboard.writeText(renderEntryMarkdown(entry));
  vscode.window.setStatusBarMessage("$(check) Message copied as Markdown", 4000);
}
