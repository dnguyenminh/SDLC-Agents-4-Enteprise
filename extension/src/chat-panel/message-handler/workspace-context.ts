/**
 * Workspace context auto-attachment for the chat Message Handler (KSA-210).
 * Safety net (UAT): workspace-intent questions get the workspace root +
 * top-level listing auto-attached, so the model answers correctly even
 * when its own file-tool calling is unavailable (gateway w/o tools, etc.).
 */

import * as vscode from "vscode";

export const WORKSPACE_INTENT =
  /workspace|thư mục|thư mục gốc|đang đứng|cấu trúc (thư mục|project|dự án)|liệt kê|toàn bộ|toan bo|tổng thể|tong the|entire|whole|full review|review (source|code|mã nguồn|project|dùm|giùm|giúp)|đọc (file|mã|source|code)|mở file|list (files|folders|directories)|project (structure|root|path)|where am i|current (directory|folder|workspace)/i;

export type WorkspaceContextItem = { type: string; label: string; path?: string; content?: string };

/** Auto-attach workspace root + top-level listing for workspace-intent questions. */
export async function resolveWorkspaceContext(
  text: string,
  context?: WorkspaceContextItem[]
): Promise<Array<{ type: string; label: string; content: string }>> {
  if (!WORKSPACE_INTENT.test(text)) return [];
  if ((context ?? []).some((c) => c.type === "file" || c.type === "folder" || c.type === "currentFile")) {
    return []; // user already attached explicit file context
  }
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return [];
  const root = folders[0].uri;
  try {
    const entries = await vscode.workspace.fs.readDirectory(root);
    const lines = entries.slice(0, 80).map(([name, type]) =>
      type === vscode.FileType.Directory ? `${name}/` : name
    );
    return [{
      type: "workspace",
      label: folders[0].name || "workspace",
      content: `Workspace root: ${root.fsPath}\nTop-level entries:\n${lines.join("\n")}`,
    }];
  } catch {
    return [{ type: "workspace", label: "workspace", content: `Workspace root: ${root.fsPath}` }];
  }
}
